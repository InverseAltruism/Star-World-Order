/**
 * SQLite Database Connection for Star World Order
 * 
 * This module provides database connectivity for:
 * - Chat messages in the Hangout Hub
 * - Online presence tracking
 * - Voice chat sessions
 * - Social connections (Discord, X)
 * - User profiles
 * 
 * The database file is stored at data/swo.db
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getResilientClient } from './rpcClient';
import {
  applyInteractionStats,
  toSqlDate,
  type CompanionStatAction,
} from './sanctuary/companionStats';
import {
  applyTiredBondMultiplier,
  classifySleepTransition,
  computeDreamReward,
  computeEarlyWakeOutcome,
  isCompanionTired,
} from './sanctuary/sleepDynamics';
import {
  GACHA_PULL_COST,
  pickGachaItem,
  type GachaCandidate,
  type GachaPickResult,
} from './sanctuary/gacha';
import { decayStats, computeNeeds, type DecayedStats } from './sanctuary/decay';
import {
  preferenceFor,
  isNeedTargeted,
  computeBondDelta,
  type PreferenceLevel,
} from './sanctuary/preferences';
import { rollVariableReward, type VariableRewardTier } from './sanctuary/variableRewards';
import {
  ACTION_RESOURCE,
  ACTION_DAILY_LIMIT,
  RESOURCE_MAX,
  decayResources,
  replenish,
  gateAction,
  advanceUsage,
  usesRemaining,
  cooldownRemainingMs,
  type ResourceSnapshot,
  type ActionUsage as WalletActionUsage,
} from './sanctuary/walletResources';
import { journalLineForAction } from './sanctuary/companionGreeting';
import {
  abandonExpedition,
  chooseExpeditionPath,
  getExpeditionRewards,
  startExpedition,
  type ExpeditionDefinition,
  type ExpeditionHistoryEntry,
  type ExpeditionState,
  type ExpeditionStatus,
  type ExpeditionOutcome,
} from './sanctuary/expeditions';
import {
  EXPEDITION_TIERS,
  getExpeditionCatalog,
  getExpeditionCatalogEntry,
  type ExpeditionTier,
} from './sanctuary/expeditionDefs';

// Database path - stored in the repo's data directory
const DB_PATH = process.env.DATABASE_URL?.replace('file:', '') || 
  path.join(process.cwd(), 'data', 'swo.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create database connection (singleton pattern)
let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeDatabase(db);
  }
  return db;
}

/**
 * Test-only escape hatch: replace the singleton DB handle with an in-memory
 * one. Lets unit tests exercise db-helper transactions against fresh schemas
 * without touching the real swo.db on disk.
 */
export function __setTestDatabase(testDb: Database.Database | null): void {
  db = testDb;
}

/**
 * Initialize database tables if they don't exist
 */
function initializeDatabase(database: Database.Database): void {
  // Social connections table
  database.exec(`
    CREATE TABLE IF NOT EXISTS social_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      platform TEXT NOT NULL CHECK (platform IN ('discord', 'x')),
      platform_user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at DATETIME,
      connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(wallet_address, platform)
    )
  `);

  // Chat messages table
  database.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_address TEXT NOT NULL,
      sender_display_name TEXT,
      message TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'chat' CHECK (message_type IN ('chat', 'system', 'emote')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Online presence table
  database.exec(`
    CREATE TABLE IF NOT EXISTS online_presence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL UNIQUE,
      display_name TEXT,
      nft_token_id INTEGER,
      star_variant TEXT,
      status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'away', 'busy')),
      last_message TEXT,
      last_message_at DATETIME,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Voice sessions table
  database.exec(`
    CREATE TABLE IF NOT EXISTS voice_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME
    )
  `);

  // Voice participants table
  database.exec(`
    CREATE TABLE IF NOT EXISTS voice_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      is_muted INTEGER NOT NULL DEFAULT 1,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      left_at DATETIME,
      FOREIGN KEY (session_id) REFERENCES voice_sessions(session_id),
      UNIQUE(session_id, wallet_address)
    )
  `);

  // User profiles table
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL UNIQUE,
      display_name TEXT,
      bio TEXT,
      avatar_url TEXT,
      displayed_badges TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Add displayed_badges column if it doesn't exist (migration)
  try {
    database.exec(`ALTER TABLE user_profiles ADD COLUMN displayed_badges TEXT`);
  } catch (e) {
    // Column already exists, ignore error
  }

  // Star Skrumpey metadata table - stores all NFT metadata from corpus
  database.exec(`
    CREATE TABLE IF NOT EXISTS star_skrumpey_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT NOT NULL,
      constellation TEXT,
      aura TEXT,
      background TEXT,
      eyes TEXT,
      form TEXT,
      mood TEXT,
      hat TEXT,
      gaze TEXT,
      relic TEXT,
      pet TEXT,
      fit TEXT,
      attitude TEXT,
      scene TEXT,
      extra TEXT,
      submerged TEXT,
      rarity_rank INTEGER,
      rarity_score REAL,
      trait_count INTEGER,
      attributes_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add columns that may not exist yet (safe for existing DBs)
  const metaCols = ['hat','gaze','relic','pet','fit','attitude','scene','extra','submerged','rarity_rank','rarity_score','trait_count'];
  for (const col of metaCols) {
    try {
      const colType = ['rarity_rank','trait_count'].includes(col) ? 'INTEGER' : col === 'rarity_score' ? 'REAL' : 'TEXT';
      database.exec(`ALTER TABLE star_skrumpey_metadata ADD COLUMN ${col} ${colType}`);
    } catch { /* column already exists */ }
  }

  // Holder snapshots table - stores historical holder counts over time
  // Used for holder count charts with 1H/1D time ranges
  database.exec(`
    CREATE TABLE IF NOT EXISTS holder_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      constellation TEXT NOT NULL,
      holder_count INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // User XP table - stores experience points and level for each user
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_xp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL UNIQUE,
      total_xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Quest definitions table - stores all available quests
  database.exec(`
    CREATE TABLE IF NOT EXISTS quests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      xp_reward INTEGER NOT NULL DEFAULT 100,
      quest_type TEXT NOT NULL CHECK (quest_type IN ('daily', 'weekly', 'one_time', 'urgent')),
      category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('social', 'trading', 'governance', 'community', 'general')),
      requirements_json TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 0,
      icon TEXT DEFAULT '⭐',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    )
  `);

  // User quest progress table - tracks user completion of quests
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      quest_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'in_progress', 'completed', 'claimed')),
      progress INTEGER NOT NULL DEFAULT 0,
      started_at DATETIME,
      completed_at DATETIME,
      claimed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(wallet_address, quest_id),
      FOREIGN KEY (quest_id) REFERENCES quests(id)
    )
  `);

  // Create indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_address);
    CREATE INDEX IF NOT EXISTS idx_online_presence_last_seen ON online_presence(last_seen DESC);
    CREATE INDEX IF NOT EXISTS idx_voice_sessions_active ON voice_sessions(is_active, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_voice_participants_session ON voice_participants(session_id);
    CREATE INDEX IF NOT EXISTS idx_social_connections_wallet ON social_connections(wallet_address);
    CREATE INDEX IF NOT EXISTS idx_social_connections_platform ON social_connections(platform);
    CREATE INDEX IF NOT EXISTS idx_star_skrumpey_metadata_token ON star_skrumpey_metadata(token_id);
    CREATE INDEX IF NOT EXISTS idx_star_skrumpey_metadata_constellation ON star_skrumpey_metadata(constellation);
    CREATE INDEX IF NOT EXISTS idx_holder_snapshots_constellation ON holder_snapshots(constellation, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_holder_snapshots_created ON holder_snapshots(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_user_xp_wallet ON user_xp(wallet_address);
    CREATE INDEX IF NOT EXISTS idx_user_xp_level ON user_xp(level DESC);
    CREATE INDEX IF NOT EXISTS idx_quests_type ON quests(quest_type, is_active);
    CREATE INDEX IF NOT EXISTS idx_quests_priority ON quests(priority DESC, is_active);
    CREATE INDEX IF NOT EXISTS idx_user_quests_wallet ON user_quests(wallet_address, status);
    CREATE INDEX IF NOT EXISTS idx_user_quests_quest ON user_quests(quest_id, status);
  `);

  // Notifications table - stores user notifications
  database.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('quest', 'achievement', 'system', 'social', 'governance')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      icon TEXT DEFAULT '🔔',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Notification settings table - stores user preferences
  database.exec(`
    CREATE TABLE IF NOT EXISTS notification_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL UNIQUE,
      quest_notifications INTEGER NOT NULL DEFAULT 1,
      achievement_notifications INTEGER NOT NULL DEFAULT 1,
      system_notifications INTEGER NOT NULL DEFAULT 1,
      social_notifications INTEGER NOT NULL DEFAULT 1,
      governance_notifications INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Notification indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_notifications_wallet ON notifications(wallet_address, is_read, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notification_settings_wallet ON notification_settings(wallet_address);
  `);

  // Friends table - stores friend relationships
  database.exec(`
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_address TEXT NOT NULL,
      friend_address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_address, friend_address)
    )
  `);

  // Direct messages table - stores private messages between users
  database.exec(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_address TEXT NOT NULL,
      recipient_address TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Friends and DM indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_address, status);
    CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_address, status);
    CREATE INDEX IF NOT EXISTS idx_dm_sender ON direct_messages(sender_address, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dm_recipient ON direct_messages(recipient_address, is_read, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dm_conversation ON direct_messages(sender_address, recipient_address, created_at DESC);
  `);

  // Treasury NFT cache table - stores cached NFT holdings from RPC
  database.exec(`
    CREATE TABLE IF NOT EXISTS treasury_nft_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT NOT NULL,
      contract_address TEXT NOT NULL,
      token_id TEXT NOT NULL,
      name TEXT,
      collection_name TEXT NOT NULL,
      image_url TEXT,
      metadata_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(wallet_address, contract_address, token_id)
    )
  `);

  // Treasury NFT cache indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_treasury_nft_wallet ON treasury_nft_cache(wallet_address);
    CREATE INDEX IF NOT EXISTS idx_treasury_nft_updated ON treasury_nft_cache(updated_at);
  `);

  // Star Forge game table - stores all game sessions
  database.exec(`
    CREATE TABLE IF NOT EXISTS starforge_games (
      id TEXT PRIMARY KEY,
      player_address TEXT NOT NULL,
      tier TEXT NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold')),
      entry_fee TEXT NOT NULL,
      server_seed_hash TEXT NOT NULL,
      server_seed TEXT,
      client_seed TEXT,
      nonce INTEGER NOT NULL,
      grid INTEGER,
      pattern TEXT,
      multiplier REAL,
      payout TEXT,
      is_star_holder INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'verified')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      tx_hash TEXT
    )
  `);

  // Star Forge game indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_starforge_player ON starforge_games(player_address, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_starforge_status ON starforge_games(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_starforge_tier ON starforge_games(tier, created_at DESC);
  `);

  // Star Forge jackpot pools - tracks jackpot accumulation per tier
  database.exec(`
    CREATE TABLE IF NOT EXISTS starforge_jackpots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tier TEXT NOT NULL UNIQUE CHECK (tier IN ('bronze', 'silver', 'gold')),
      pool_amount TEXT NOT NULL DEFAULT '0',
      last_won_at DATETIME,
      last_winner TEXT,
      total_contributions TEXT NOT NULL DEFAULT '0',
      total_payouts TEXT NOT NULL DEFAULT '0',
      win_count INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Initialize jackpot pools for each tier
  database.exec(`
    INSERT OR IGNORE INTO starforge_jackpots (tier, pool_amount, total_contributions, total_payouts)
    VALUES 
      ('bronze', '0', '0', '0'),
      ('silver', '0', '0', '0'),
      ('gold', '0', '0', '0')
  `);

  // Star Forge treasury tracking - per-tier statistics
  database.exec(`
    CREATE TABLE IF NOT EXISTS starforge_treasury (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tier TEXT NOT NULL UNIQUE CHECK (tier IN ('bronze', 'silver', 'gold')),
      balance TEXT NOT NULL DEFAULT '0',
      total_games INTEGER NOT NULL DEFAULT 0,
      total_wagered TEXT NOT NULL DEFAULT '0',
      total_paid_out TEXT NOT NULL DEFAULT '0',
      house_profit TEXT NOT NULL DEFAULT '0'
    )
  `);

  // Initialize treasury for each tier
  database.exec(`
    INSERT OR IGNORE INTO starforge_treasury (tier, balance, total_wagered, total_paid_out, house_profit)
    VALUES 
      ('bronze', '0', 0, '0', '0'),
      ('silver', '0', 0, '0', '0'),
      ('gold', '0', 0, '0', '0')
  `);

  // ============================================================
  // GOVERNANCE TABLES (Web2 Database-backed)
  // ============================================================
  
  // Governance proposals table
  database.exec(`
    CREATE TABLE IF NOT EXISTS governance_proposals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      proposer_address TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'active', 'defeated', 'succeeded', 'executed', 'cancelled')),
      for_votes INTEGER NOT NULL DEFAULT 0,
      against_votes INTEGER NOT NULL DEFAULT 0,
      abstain_votes INTEGER NOT NULL DEFAULT 0,
      quorum INTEGER NOT NULL DEFAULT 10,
      unique_voter_count INTEGER NOT NULL DEFAULT 0,
      min_voters INTEGER NOT NULL DEFAULT 10,
      yes_threshold_percent INTEGER NOT NULL DEFAULT 60,
      max_abstain_percent INTEGER NOT NULL DEFAULT 30,
      category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('treasury', 'community', 'technical', 'governance', 'general')),
      forum_thread_id TEXT,
      defeat_reason TEXT,
      voting_duration_weeks INTEGER NOT NULL DEFAULT 1,
      start_time DATETIME,
      end_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      executed_at DATETIME,
      cancelled_at DATETIME
    )
  `);

  // Governance votes table - tracks who voted on what
  database.exec(`
    CREATE TABLE IF NOT EXISTS governance_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id TEXT NOT NULL,
      voter_address TEXT NOT NULL,
      support INTEGER NOT NULL CHECK (support IN (0, 1, 2)),
      voting_power INTEGER NOT NULL DEFAULT 1,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      signature TEXT,
      signature_message TEXT,
      signature_timestamp INTEGER,
      signature_nonce TEXT,
      UNIQUE(proposal_id, voter_address),
      FOREIGN KEY (proposal_id) REFERENCES governance_proposals(id)
    )
  `);

  // Add signature columns if they don't exist (migration for existing databases)
  try {
    database.exec(`ALTER TABLE governance_votes ADD COLUMN signature TEXT`);
  } catch { /* Column already exists */ }
  try {
    database.exec(`ALTER TABLE governance_votes ADD COLUMN signature_message TEXT`);
  } catch { /* Column already exists */ }
  try {
    database.exec(`ALTER TABLE governance_votes ADD COLUMN signature_timestamp INTEGER`);
  } catch { /* Column already exists */ }
  try {
    database.exec(`ALTER TABLE governance_votes ADD COLUMN signature_nonce TEXT`);
  } catch { /* Column already exists */ }
  try {
    database.exec(`ALTER TABLE governance_votes ADD COLUMN signature_version TEXT DEFAULT 'eip191'`);
  } catch { /* Column already exists */ }
  try {
    database.exec(`ALTER TABLE governance_votes ADD COLUMN signature_typed_data TEXT`);
  } catch { /* Column already exists */ }

  // Add snapshot_block column to governance_proposals if it doesn't exist
  try {
    database.exec(`ALTER TABLE governance_proposals ADD COLUMN snapshot_block INTEGER`);
  } catch { /* Column already exists */ }
  
  // Add enhanced governance columns (for existing databases that don't have them)
  // These columns are part of the enhanced governance system introduced in v2
  try {
    database.exec(`ALTER TABLE governance_proposals ADD COLUMN abstain_votes INTEGER NOT NULL DEFAULT 0`);
  } catch { /* Column already exists */ }
  try {
    database.exec(`ALTER TABLE governance_proposals ADD COLUMN unique_voter_count INTEGER NOT NULL DEFAULT 0`);
  } catch { /* Column already exists */ }
  try {
    database.exec(`ALTER TABLE governance_proposals ADD COLUMN min_voters INTEGER NOT NULL DEFAULT 10`);
  } catch { /* Column already exists */ }
  try {
    database.exec(`ALTER TABLE governance_proposals ADD COLUMN yes_threshold_percent INTEGER NOT NULL DEFAULT 60`);
  } catch { /* Column already exists */ }
  try {
    database.exec(`ALTER TABLE governance_proposals ADD COLUMN max_abstain_percent INTEGER NOT NULL DEFAULT 30`);
  } catch { /* Column already exists */ }
  try {
    database.exec(`ALTER TABLE governance_proposals ADD COLUMN category TEXT DEFAULT 'general'`);
  } catch { /* Column already exists */ }
  try {
    database.exec(`ALTER TABLE governance_proposals ADD COLUMN forum_thread_id TEXT`);
  } catch { /* Column already exists */ }
  try {
    database.exec(`ALTER TABLE governance_proposals ADD COLUMN defeat_reason TEXT`);
  } catch { /* Column already exists */ }

  // Governance nonces table - for secure server-issued nonces
  database.exec(`
    CREATE TABLE IF NOT EXISTS governance_nonces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nonce TEXT UNIQUE NOT NULL,
      proposal_id TEXT NOT NULL,
      voter_address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'consumed', 'expired')),
      issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME,
      FOREIGN KEY (proposal_id) REFERENCES governance_proposals(id)
    )
  `);

  // Governance indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_governance_proposals_state ON governance_proposals(state, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_governance_proposals_proposer ON governance_proposals(proposer_address);
    CREATE INDEX IF NOT EXISTS idx_governance_votes_proposal ON governance_votes(proposal_id);
    CREATE INDEX IF NOT EXISTS idx_governance_votes_voter ON governance_votes(voter_address);
    CREATE INDEX IF NOT EXISTS idx_governance_nonces_lookup ON governance_nonces(proposal_id, voter_address, status);
    CREATE INDEX IF NOT EXISTS idx_governance_nonces_nonce ON governance_nonces(nonce);
    CREATE INDEX IF NOT EXISTS idx_governance_nonces_expires ON governance_nonces(status, expires_at);
  `);

  // Admin auth nonces table - persists consumed admin-auth nonces across process
  // restarts and serverless instances so a signed admin message cannot be
  // replayed within its TTL window.
  database.exec(`
    CREATE TABLE IF NOT EXISTS admin_nonces (
      nonce TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_admin_nonces_expires ON admin_nonces(expires_at);
  `);

  // ============================================================
  // FORUM TABLES (Database-backed with likes and edits)
  // ============================================================

  // Forum threads table
  database.exec(`
    CREATE TABLE IF NOT EXISTS forum_threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      original_content TEXT,
      author_address TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'governance', 'proposals', 'ideas', 'support', 'announcements')),
      proposal_id TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      locked INTEGER NOT NULL DEFAULT 0,
      likes_count INTEGER NOT NULL DEFAULT 0,
      dislikes_count INTEGER NOT NULL DEFAULT 0,
      is_edited INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      edited_at DATETIME,
      FOREIGN KEY (proposal_id) REFERENCES governance_proposals(id)
    )
  `);

  // Forum replies table
  database.exec(`
    CREATE TABLE IF NOT EXISTS forum_replies (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      content TEXT NOT NULL,
      original_content TEXT,
      author_address TEXT NOT NULL,
      likes_count INTEGER NOT NULL DEFAULT 0,
      dislikes_count INTEGER NOT NULL DEFAULT 0,
      is_edited INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      edited_at DATETIME,
      FOREIGN KEY (thread_id) REFERENCES forum_threads(id)
    )
  `);

  // Forum likes table - tracks who liked/disliked what
  database.exec(`
    CREATE TABLE IF NOT EXISTS forum_likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_address TEXT NOT NULL,
      target_id TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK (target_type IN ('thread', 'reply')),
      like_type TEXT NOT NULL CHECK (like_type IN ('like', 'dislike')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_address, target_id, target_type)
    )
  `);

  // Forum indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_forum_threads_category ON forum_threads(category, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_forum_threads_author ON forum_threads(author_address);
    CREATE INDEX IF NOT EXISTS idx_forum_threads_pinned ON forum_threads(pinned DESC, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_forum_replies_thread ON forum_replies(thread_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_forum_replies_author ON forum_replies(author_address);
    CREATE INDEX IF NOT EXISTS idx_forum_likes_user ON forum_likes(user_address);
    CREATE INDEX IF NOT EXISTS idx_forum_likes_target ON forum_likes(target_id, target_type);
  `);

  // Insert default quests if none exist
  insertDefaultQuests(database);

  // Sanctuary tables
  initializeSanctuary(database);
}

/**
 * Insert default quests into the database
 * Called during initialization if no quests exist
 */
function insertDefaultQuests(database: Database.Database): void {
  const countStmt = database.prepare('SELECT COUNT(*) as count FROM quests');
  const { count } = countStmt.get() as { count: number };
  
  if (count > 0) return; // Quests already exist

  const insertStmt = database.prepare(`
    INSERT INTO quests (id, name, description, xp_reward, quest_type, category, requirements_json, icon, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Default quests
  const defaultQuests = [
    // Urgent Quests (high priority, time-sensitive)
    {
      id: 'urgent_follow_x',
      name: 'Follow @StrWorldOrder on X',
      description: 'Follow our official X account to stay updated with the latest news.',
      xp_reward: 100,
      quest_type: 'urgent',
      category: 'social',
      requirements_json: JSON.stringify({ action: 'follow_x', target: '@StrWorldOrder' }),
      icon: '𝕏',
      priority: 100,
    },
    {
      id: 'urgent_join_discord',
      name: 'Join the Star World Order Discord',
      description: 'Join our Discord community to connect with other Star holders.',
      xp_reward: 100,
      quest_type: 'urgent',
      category: 'social',
      requirements_json: JSON.stringify({ action: 'join_discord' }),
      icon: '💬',
      priority: 99,
    },
    // One-time Quests
    {
      id: 'setup_profile',
      name: 'Complete Your Profile',
      description: 'Set up your display name and bio to personalize your Star identity.',
      xp_reward: 50,
      quest_type: 'one_time',
      category: 'general',
      requirements_json: JSON.stringify({ action: 'set_profile', fields: ['displayName', 'bio'] }),
      icon: '👤',
      priority: 50,
    },
    {
      id: 'first_star_skrumpey',
      name: 'Become a Star Bearer',
      description: 'Own your first Star Skrumpey NFT to unlock DAO access.',
      xp_reward: 200,
      quest_type: 'one_time',
      category: 'general',
      requirements_json: JSON.stringify({ action: 'own_star_skrumpey', count: 1 }),
      icon: '⭐',
      priority: 90,
    },
    {
      id: 'connect_socials',
      name: 'Link Social Accounts',
      description: 'Connect your X or Discord account to your Star World Order profile.',
      xp_reward: 75,
      quest_type: 'one_time',
      category: 'social',
      requirements_json: JSON.stringify({ action: 'connect_social', platforms: ['x', 'discord'] }),
      icon: '🔗',
      priority: 40,
    },
    {
      id: 'collect_3_constellations',
      name: 'Constellation Explorer',
      description: 'Collect Star Skrumpeys from 3 different constellation types.',
      xp_reward: 300,
      quest_type: 'one_time',
      category: 'trading',
      requirements_json: JSON.stringify({ action: 'unique_constellations', count: 3 }),
      icon: '🔭',
      priority: 30,
    },
    // Daily Quests
    {
      id: 'daily_visit',
      name: 'Daily Check-In',
      description: 'Visit Star World Order to check in and earn XP.',
      xp_reward: 10,
      quest_type: 'daily',
      category: 'general',
      requirements_json: JSON.stringify({ action: 'daily_visit' }),
      icon: '📅',
      priority: 10,
    },
    // Weekly Quests
    {
      id: 'weekly_hangout',
      name: 'Community Hangout',
      description: 'Spend time in the Hangout Hub chatting with fellow Star holders.',
      xp_reward: 50,
      quest_type: 'weekly',
      category: 'community',
      requirements_json: JSON.stringify({ action: 'hangout_messages', count: 5 }),
      icon: '🎉',
      priority: 20,
    },
  ];

  const insertMany = database.transaction((quests: typeof defaultQuests) => {
    for (const quest of quests) {
      insertStmt.run(
        quest.id,
        quest.name,
        quest.description,
        quest.xp_reward,
        quest.quest_type,
        quest.category,
        quest.requirements_json,
        quest.icon,
        quest.priority
      );
    }
  });

  insertMany(defaultQuests);
}

// ============================================================
// CHAT MESSAGES
// ============================================================

export interface ChatMessage {
  id: number;
  sender_address: string;
  sender_display_name: string | null;
  message: string;
  message_type: 'chat' | 'system' | 'emote';
  created_at: string;
}

/**
 * Add a new chat message
 */
export function addChatMessage(
  senderAddress: string,
  message: string,
  messageType: 'chat' | 'system' | 'emote' = 'chat',
  displayName?: string
): ChatMessage {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO chat_messages (sender_address, sender_display_name, message, message_type)
    VALUES (?, ?, ?, ?)
  `);
  
  const result = stmt.run(senderAddress.toLowerCase(), displayName || null, message, messageType);
  
  // Get the inserted message
  const getStmt = db.prepare('SELECT * FROM chat_messages WHERE id = ?');
  return getStmt.get(result.lastInsertRowid) as ChatMessage;
}

/**
 * Get recent chat messages
 */
export function getChatMessages(limit: number = 100): ChatMessage[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM chat_messages 
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  const messages = stmt.all(limit) as ChatMessage[];
  return messages.reverse(); // Return in chronological order
}

/**
 * Get chat messages since a specific timestamp
 */
export function getChatMessagesSince(since: string): ChatMessage[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM chat_messages 
    WHERE datetime(created_at) > datetime(?)
    ORDER BY created_at ASC
  `);
  return stmt.all(since) as ChatMessage[];
}

// ============================================================
// ONLINE PRESENCE
// ============================================================

export interface OnlinePresence {
  id: number;
  wallet_address: string;
  display_name: string | null;
  nft_token_id: number | null;
  star_variant: string | null;
  status: 'online' | 'away' | 'busy';
  last_message: string | null;
  last_message_at: string | null;
  last_seen: string;
  created_at: string;
}

/**
 * Update or create online presence for a user
 */
export function updateOnlinePresence(
  walletAddress: string,
  data: {
    displayName?: string;
    nftTokenId?: number;
    starVariant?: string;
    status?: 'online' | 'away' | 'busy';
    lastMessage?: string;
  }
): OnlinePresence {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  // Try to update existing presence
  const updateStmt = db.prepare(`
    UPDATE online_presence 
    SET display_name = COALESCE(?, display_name),
        nft_token_id = COALESCE(?, nft_token_id),
        star_variant = COALESCE(?, star_variant),
        status = COALESCE(?, status),
        last_message = CASE WHEN ? IS NOT NULL THEN ? ELSE last_message END,
        last_message_at = CASE WHEN ? IS NOT NULL THEN ? ELSE last_message_at END,
        last_seen = ?
    WHERE wallet_address = ?
  `);
  
  const result = updateStmt.run(
    data.displayName || null,
    data.nftTokenId || null,
    data.starVariant || null,
    data.status || null,
    data.lastMessage || null,  // CASE check for last_message
    data.lastMessage || null,  // CASE value for last_message
    data.lastMessage || null,  // CASE check for last_message_at
    data.lastMessage ? now : null,  // CASE value for last_message_at (timestamp when message exists)
    now,  // last_seen
    walletAddress.toLowerCase()
  );
  
  if (result.changes === 0) {
    // Insert new presence
    const insertStmt = db.prepare(`
      INSERT INTO online_presence (wallet_address, display_name, nft_token_id, star_variant, status, last_message, last_message_at, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run(
      walletAddress.toLowerCase(),
      data.displayName || null,
      data.nftTokenId || null,
      data.starVariant || null,
      data.status || 'online',
      data.lastMessage || null,
      data.lastMessage ? now : null,
      now
    );
  }
  
  // Return the updated/inserted record
  const getStmt = db.prepare('SELECT * FROM online_presence WHERE wallet_address = ?');
  return getStmt.get(walletAddress.toLowerCase()) as OnlinePresence;
}

/**
 * Get all online users (active within the last 2 minutes)
 */
export function getOnlineUsers(): OnlinePresence[] {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT * FROM online_presence 
    WHERE datetime(last_seen) > datetime('now', '-2 minutes')
    ORDER BY last_seen DESC
  `);
  return stmt.all() as OnlinePresence[];
}

/**
 * Remove user from online presence
 */
export function removeOnlinePresence(walletAddress: string): void {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM online_presence WHERE wallet_address = ?');
  stmt.run(walletAddress.toLowerCase());
}

// ============================================================
// VOICE CHAT SESSIONS
// ============================================================

export interface VoiceSession {
  id: number;
  session_id: string;
  created_by: string;
  is_active: number;
  created_at: string;
  ended_at: string | null;
}

export interface VoiceParticipant {
  id: number;
  session_id: string;
  wallet_address: string;
  is_muted: number;
  joined_at: string;
  left_at: string | null;
}

/**
 * Create a new voice session
 */
export function createVoiceSession(createdBy: string): VoiceSession {
  const db = getDatabase();
  const sessionId = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  
  const stmt = db.prepare(`
    INSERT INTO voice_sessions (session_id, created_by)
    VALUES (?, ?)
  `);
  stmt.run(sessionId, createdBy.toLowerCase());
  
  const getStmt = db.prepare('SELECT * FROM voice_sessions WHERE session_id = ?');
  return getStmt.get(sessionId) as VoiceSession;
}

/**
 * Get active voice session
 */
export function getActiveVoiceSession(): VoiceSession | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM voice_sessions 
    WHERE is_active = 1 
    ORDER BY created_at DESC 
    LIMIT 1
  `);
  return stmt.get() as VoiceSession | null;
}

/**
 * End a voice session
 */
export function endVoiceSession(sessionId: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  // End the session
  const sessionStmt = db.prepare(`
    UPDATE voice_sessions SET is_active = 0, ended_at = ? WHERE session_id = ?
  `);
  sessionStmt.run(now, sessionId);
  
  // Mark all participants as left
  const participantStmt = db.prepare(`
    UPDATE voice_participants SET left_at = ? WHERE session_id = ? AND left_at IS NULL
  `);
  participantStmt.run(now, sessionId);
}

/**
 * Join a voice session
 */
export function joinVoiceSession(sessionId: string, walletAddress: string): VoiceParticipant {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO voice_participants (session_id, wallet_address, is_muted, joined_at)
    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
  `);
  stmt.run(sessionId, walletAddress.toLowerCase());
  
  const getStmt = db.prepare(`
    SELECT * FROM voice_participants WHERE session_id = ? AND wallet_address = ?
  `);
  return getStmt.get(sessionId, walletAddress.toLowerCase()) as VoiceParticipant;
}

/**
 * Leave a voice session
 */
export function leaveVoiceSession(sessionId: string, walletAddress: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    UPDATE voice_participants SET left_at = ? WHERE session_id = ? AND wallet_address = ?
  `);
  stmt.run(now, sessionId, walletAddress.toLowerCase());
}

/**
 * Update mute status
 */
export function updateMuteStatus(sessionId: string, walletAddress: string, isMuted: boolean): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE voice_participants SET is_muted = ? WHERE session_id = ? AND wallet_address = ?
  `);
  stmt.run(isMuted ? 1 : 0, sessionId, walletAddress.toLowerCase());
}

/**
 * Get voice participants
 */
export function getVoiceParticipants(sessionId: string): VoiceParticipant[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM voice_participants 
    WHERE session_id = ? AND left_at IS NULL
    ORDER BY joined_at ASC
  `);
  return stmt.all(sessionId) as VoiceParticipant[];
}

// ============================================================
// USER PROFILES
// ============================================================

export interface UserProfile {
  id: number;
  wallet_address: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  displayed_badges: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get or create user profile
 */
export function getUserProfile(walletAddress: string): UserProfile | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM user_profiles WHERE wallet_address = ?');
  return stmt.get(walletAddress.toLowerCase()) as UserProfile | null;
}

/**
 * Get multiple user profiles by wallet addresses (batch lookup)
 */
export function getUserProfilesBatch(walletAddresses: string[]): Map<string, UserProfile> {
  if (walletAddresses.length === 0) return new Map();
  
  const db = getDatabase();
  const normalizedAddresses = walletAddresses.map(a => a.toLowerCase());
  
  // Use parameterized query with IN clause
  const placeholders = normalizedAddresses.map(() => '?').join(',');
  const stmt = db.prepare(`SELECT * FROM user_profiles WHERE wallet_address IN (${placeholders})`);
  const profiles = stmt.all(...normalizedAddresses) as UserProfile[];
  
  // Convert to map for O(1) lookup
  const profileMap = new Map<string, UserProfile>();
  for (const profile of profiles) {
    profileMap.set(profile.wallet_address.toLowerCase(), profile);
  }
  
  return profileMap;
}

/**
 * Update or create user profile
 */
export function updateUserProfile(
  walletAddress: string,
  data: {
    displayName?: string;
    bio?: string;
    avatarTokenId?: number | null;
    displayedBadges?: string[];
  }
): UserProfile {
  const db = getDatabase();
  
  // Convert displayedBadges array to JSON string for storage
  const badgesJson = data.displayedBadges ? JSON.stringify(data.displayedBadges) : null;
  
  // Store avatar token ID as string in avatar_url field
  const avatarValue = data.avatarTokenId !== undefined 
    ? (data.avatarTokenId !== null ? String(data.avatarTokenId) : null) 
    : undefined;
  
  const updateStmt = db.prepare(`
    INSERT INTO user_profiles (wallet_address, display_name, bio, avatar_url, displayed_badges)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(wallet_address) DO UPDATE SET
      display_name = COALESCE(?, display_name),
      bio = COALESCE(?, bio),
      avatar_url = COALESCE(?, avatar_url),
      displayed_badges = COALESCE(?, displayed_badges),
      updated_at = CURRENT_TIMESTAMP
  `);
  
  updateStmt.run(
    walletAddress.toLowerCase(),
    data.displayName || null,
    data.bio || null,
    avatarValue !== undefined ? avatarValue : null,
    badgesJson,
    data.displayName || null,
    data.bio || null,
    avatarValue !== undefined ? avatarValue : null,
    badgesJson
  );
  
  const getStmt = db.prepare('SELECT * FROM user_profiles WHERE wallet_address = ?');
  return getStmt.get(walletAddress.toLowerCase()) as UserProfile;
}

// ============================================================
// STAR SKRUMPEY METADATA
// ============================================================

export interface StarSkrumpeyMetadata {
  id: number;
  token_id: number;
  name: string;
  description: string | null;
  image_url: string;
  constellation: string | null;
  aura: string | null;
  background: string | null;
  eyes: string | null;
  form: string | null;
  mood: string | null;
  hat: string | null;
  gaze: string | null;
  relic: string | null;
  pet: string | null;
  fit: string | null;
  attitude: string | null;
  scene: string | null;
  extra: string | null;
  submerged: string | null;
  rarity_rank: number | null;
  rarity_score: number | null;
  trait_count: number | null;
  attributes_json: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get Star Skrumpey metadata by token ID
 */
export function getStarSkrumpeyMetadata(tokenId: number): StarSkrumpeyMetadata | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM star_skrumpey_metadata WHERE token_id = ?');
  return stmt.get(tokenId) as StarSkrumpeyMetadata | null;
}

/**
 * Get metadata for multiple Star Skrumpeys by token IDs
 */
export function getStarSkrumpeyMetadataBatch(tokenIds: number[]): Map<number, StarSkrumpeyMetadata> {
  if (tokenIds.length === 0) return new Map();
  
  const db = getDatabase();
  const placeholders = tokenIds.map(() => '?').join(',');
  const stmt = db.prepare(`SELECT * FROM star_skrumpey_metadata WHERE token_id IN (${placeholders})`);
  const results = stmt.all(...tokenIds) as StarSkrumpeyMetadata[];
  
  const metadataMap = new Map<number, StarSkrumpeyMetadata>();
  for (const meta of results) {
    metadataMap.set(meta.token_id, meta);
  }
  
  return metadataMap;
}

/**
 * Get all Star Skrumpey metadata
 */
export function getAllStarSkrumpeyMetadata(): StarSkrumpeyMetadata[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM star_skrumpey_metadata ORDER BY token_id ASC');
  return stmt.all() as StarSkrumpeyMetadata[];
}

/**
 * Upsert Star Skrumpey metadata
 */
export function upsertStarSkrumpeyMetadata(data: {
  tokenId: number;
  name: string;
  description?: string;
  imageUrl: string;
  constellation?: string;
  aura?: string;
  background?: string;
  eyes?: string;
  form?: string;
  mood?: string;
  attributesJson?: string;
}): StarSkrumpeyMetadata {
  const db = getDatabase();
  
  // Use excluded.column_name syntax to avoid parameter duplication
  const stmt = db.prepare(`
    INSERT INTO star_skrumpey_metadata (
      token_id, name, description, image_url, constellation,
      aura, background, eyes, form, mood, attributes_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(token_id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      image_url = excluded.image_url,
      constellation = excluded.constellation,
      aura = excluded.aura,
      background = excluded.background,
      eyes = excluded.eyes,
      form = excluded.form,
      mood = excluded.mood,
      attributes_json = excluded.attributes_json,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  stmt.run(
    data.tokenId,
    data.name,
    data.description || null,
    data.imageUrl,
    data.constellation || null,
    data.aura || null,
    data.background || null,
    data.eyes || null,
    data.form || null,
    data.mood || null,
    data.attributesJson || null
  );
  
  const getStmt = db.prepare('SELECT * FROM star_skrumpey_metadata WHERE token_id = ?');
  return getStmt.get(data.tokenId) as StarSkrumpeyMetadata;
}

/**
 * Get count of Star Skrumpeys by constellation type
 */
export function getConstellationDistribution(): Record<string, number> {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT constellation, COUNT(*) as count 
    FROM star_skrumpey_metadata 
    WHERE constellation IS NOT NULL 
    GROUP BY constellation
  `);
  const results = stmt.all() as Array<{ constellation: string; count: number }>;
  
  const distribution: Record<string, number> = {};
  for (const row of results) {
    distribution[row.constellation] = row.count;
  }
  
  return distribution;
}

/**
 * Get trait distribution (aura, background, form) for analytics
 */
export function getTraitDistribution(traitType: 'aura' | 'background' | 'form'): Record<string, number> {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT ${traitType}, COUNT(*) as count 
    FROM star_skrumpey_metadata 
    WHERE ${traitType} IS NOT NULL 
    GROUP BY ${traitType}
    ORDER BY count DESC
    LIMIT 10
  `);
  const results = stmt.all() as Array<{ [key: string]: string | number }>;
  
  const distribution: Record<string, number> = {};
  for (const row of results) {
    const trait = row[traitType] as string;
    const count = row.count as number;
    if (trait) {
      distribution[trait] = count;
    }
  }
  
  return distribution;
}

const VALID_TRAIT_COLUMNS = new Set([
  'constellation','aura','background','eyes','form','mood',
  'hat','gaze','relic','pet','fit','attitude','scene','extra','submerged',
]);

export function filterMetadataByTraits(
  filters: Record<string, string>,
  limit = 100,
  offset = 0,
): StarSkrumpeyMetadata[] {
  const db = getDatabase();
  const clauses: string[] = [];
  const params: string[] = [];
  for (const [col, val] of Object.entries(filters)) {
    if (!VALID_TRAIT_COLUMNS.has(col.toLowerCase())) continue;
    clauses.push(`${col.toLowerCase()} = ?`);
    params.push(val);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(
    `SELECT * FROM star_skrumpey_metadata ${where} ORDER BY rarity_rank ASC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as StarSkrumpeyMetadata[];
}

export function getMetadataTraitDistribution(traitColumn: string): Record<string, number> {
  if (!VALID_TRAIT_COLUMNS.has(traitColumn.toLowerCase())) return {};
  const db = getDatabase();
  const col = traitColumn.toLowerCase();
  const rows = db.prepare(`
    SELECT ${col} as trait_value, COUNT(*) as count
    FROM star_skrumpey_metadata WHERE ${col} IS NOT NULL
    GROUP BY ${col} ORDER BY count DESC
  `).all() as Array<{ trait_value: string; count: number }>;
  const dist: Record<string, number> = {};
  for (const r of rows) dist[r.trait_value] = r.count;
  return dist;
}

export function getMetadataForTokenIds(tokenIds: number[]): StarSkrumpeyMetadata[] {
  if (tokenIds.length === 0) return [];
  const db = getDatabase();
  const placeholders = tokenIds.map(() => '?').join(',');
  return db.prepare(
    `SELECT * FROM star_skrumpey_metadata WHERE token_id IN (${placeholders}) ORDER BY token_id`
  ).all(...tokenIds) as StarSkrumpeyMetadata[];
}

// ============================================================
// HOLDER SNAPSHOTS
// ============================================================

export interface HolderSnapshot {
  id: number;
  constellation: string;
  holder_count: number;
  created_at: string;
}

/**
 * Insert a holder count snapshot for a constellation.
 * Use 'all' for total holder count across all constellations.
 */
export function insertHolderSnapshot(
  constellation: string,
  holderCount: number
): HolderSnapshot {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO holder_snapshots (constellation, holder_count)
    VALUES (?, ?)
  `);
  
  const result = stmt.run(constellation.toLowerCase(), holderCount);
  
  const getStmt = db.prepare('SELECT * FROM holder_snapshots WHERE id = ?');
  return getStmt.get(result.lastInsertRowid) as HolderSnapshot;
}

/**
 * Batch insert holder snapshots for multiple constellations.
 * More efficient than multiple single inserts.
 */
export function insertHolderSnapshotsBatch(
  snapshots: Array<{ constellation: string; holderCount: number }>
): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO holder_snapshots (constellation, holder_count)
    VALUES (?, ?)
  `);
  
  const insertMany = db.transaction((items: Array<{ constellation: string; holderCount: number }>) => {
    for (const item of items) {
      stmt.run(item.constellation.toLowerCase(), item.holderCount);
    }
  });
  
  insertMany(snapshots);
}

/**
 * Get holder snapshots for a constellation within a time range.
 * @param constellation - 'all' for total, or specific constellation name
 * @param hoursBack - How many hours of data to retrieve
 * @param limit - Maximum number of data points to return (for chart performance)
 */
export function getHolderSnapshots(
  constellation: string,
  hoursBack: number = 24,
  limit: number = 100
): HolderSnapshot[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM holder_snapshots 
    WHERE constellation = ?
    AND datetime(created_at) > datetime('now', ?)
    ORDER BY created_at ASC
    LIMIT ?
  `);
  
  return stmt.all(constellation.toLowerCase(), `-${hoursBack} hours`, limit) as HolderSnapshot[];
}

/**
 * Get the most recent holder snapshot for a constellation.
 */
export function getLatestHolderSnapshot(constellation: string): HolderSnapshot | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM holder_snapshots 
    WHERE constellation = ?
    ORDER BY created_at DESC 
    LIMIT 1
  `);
  
  return stmt.get(constellation.toLowerCase()) as HolderSnapshot | null;
}

/**
 * Get latest holder snapshots for all constellations.
 * Returns a map of constellation -> latest snapshot
 */
export function getLatestHolderSnapshotsAll(): Map<string, HolderSnapshot> {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT h1.* FROM holder_snapshots h1
    INNER JOIN (
      SELECT constellation, MAX(created_at) as max_created_at
      FROM holder_snapshots
      GROUP BY constellation
    ) h2 ON h1.constellation = h2.constellation AND h1.created_at = h2.max_created_at
  `);
  
  const results = stmt.all() as HolderSnapshot[];
  const map = new Map<string, HolderSnapshot>();
  
  for (const snapshot of results) {
    map.set(snapshot.constellation, snapshot);
  }
  
  return map;
}

/**
 * Clean up old holder snapshots (keep only last 7 days of data)
 */
export function cleanupOldHolderSnapshots(): void {
  const db = getDatabase();
  db.prepare(`
    DELETE FROM holder_snapshots 
    WHERE datetime(created_at) < datetime('now', '-7 days')
  `).run();
}

// ============================================================
// QUESTS AND XP SYSTEM
// ============================================================

export interface Quest {
  id: string;
  name: string;
  description: string;
  xp_reward: number;
  quest_type: 'daily' | 'weekly' | 'one_time' | 'urgent';
  category: 'social' | 'trading' | 'governance' | 'community' | 'general';
  requirements_json: string | null;
  is_active: number;
  priority: number;
  icon: string;
  created_at: string;
  expires_at: string | null;
}

export interface UserQuest {
  id: number;
  wallet_address: string;
  quest_id: string;
  status: 'available' | 'in_progress' | 'completed' | 'claimed';
  progress: number;
  started_at: string | null;
  completed_at: string | null;
  claimed_at: string | null;
  created_at: string;
}

export interface UserXP {
  id: number;
  wallet_address: string;
  total_xp: number;
  level: number;
  created_at: string;
  updated_at: string;
}

/**
 * Calculate level from XP using a curve formula
 * Level = floor(sqrt(XP / 100)) + 1
 * This means:
 * - Level 1: 0-99 XP
 * - Level 2: 100-399 XP
 * - Level 3: 400-899 XP
 * - Level 4: 900-1599 XP
 * - etc.
 */
export function calculateLevelFromXP(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

/**
 * Calculate XP required for a given level
 */
export function getXPRequiredForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.pow(level - 1, 2) * 100;
}

/**
 * Calculate XP progress within current level
 * Returns { current, required, percentage }
 */
export function getXPProgress(totalXP: number): {
  currentLevelXP: number;
  requiredForNextLevel: number;
  percentage: number;
  level: number;
} {
  const level = calculateLevelFromXP(totalXP);
  const xpForCurrentLevel = getXPRequiredForLevel(level);
  const xpForNextLevel = getXPRequiredForLevel(level + 1);
  const currentLevelXP = totalXP - xpForCurrentLevel;
  const requiredForNextLevel = xpForNextLevel - xpForCurrentLevel;
  const percentage = Math.min(100, (currentLevelXP / requiredForNextLevel) * 100);

  return {
    currentLevelXP,
    requiredForNextLevel,
    percentage,
    level,
  };
}

/**
 * Get all active quests
 */
export function getActiveQuests(): Quest[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM quests 
    WHERE is_active = 1
    AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
    ORDER BY priority DESC, created_at ASC
  `);
  return stmt.all() as Quest[];
}

/**
 * Get quests by type
 */
export function getQuestsByType(questType: Quest['quest_type']): Quest[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM quests 
    WHERE quest_type = ? AND is_active = 1
    AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
    ORDER BY priority DESC, created_at ASC
  `);
  return stmt.all(questType) as Quest[];
}

/**
 * Get urgent quests (highest priority, time-sensitive)
 */
export function getUrgentQuests(): Quest[] {
  return getQuestsByType('urgent');
}

/**
 * Get a single quest by ID
 */
export function getQuestById(questId: string): Quest | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM quests WHERE id = ?');
  return stmt.get(questId) as Quest | null;
}

/**
 * Get user's XP data (creates record if not exists)
 */
export function getUserXP(walletAddress: string): UserXP {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  let userXP = db.prepare('SELECT * FROM user_xp WHERE wallet_address = ?')
    .get(normalizedAddress) as UserXP | undefined;
  
  if (!userXP) {
    // Create new user XP record
    db.prepare(`
      INSERT INTO user_xp (wallet_address, total_xp, level)
      VALUES (?, 0, 1)
    `).run(normalizedAddress);
    
    userXP = db.prepare('SELECT * FROM user_xp WHERE wallet_address = ?')
      .get(normalizedAddress) as UserXP;
  }
  
  return userXP;
}

/**
 * Add XP to a user (automatically updates level)
 */
export function addUserXP(walletAddress: string, xpAmount: number): UserXP {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Ensure user exists
  const userXP = getUserXP(normalizedAddress);
  
  // Calculate new XP and level
  const newTotalXP = userXP.total_xp + xpAmount;
  const newLevel = calculateLevelFromXP(newTotalXP);
  
  // Update user XP
  db.prepare(`
    UPDATE user_xp 
    SET total_xp = ?, level = ?, updated_at = CURRENT_TIMESTAMP
    WHERE wallet_address = ?
  `).run(newTotalXP, newLevel, normalizedAddress);
  
  return getUserXP(normalizedAddress);
}

/**
 * Get user's quest progress
 */
export function getUserQuestProgress(walletAddress: string, questId: string): UserQuest | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM user_quests 
    WHERE wallet_address = ? AND quest_id = ?
  `);
  return stmt.get(walletAddress.toLowerCase(), questId) as UserQuest | null;
}

/**
 * Get all quest progress for a user
 */
export function getUserQuests(walletAddress: string): UserQuest[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM user_quests 
    WHERE wallet_address = ?
    ORDER BY created_at DESC
  `);
  return stmt.all(walletAddress.toLowerCase()) as UserQuest[];
}

/**
 * Start a quest for a user
 */
export function startQuest(walletAddress: string, questId: string): UserQuest {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Check if already exists
  const existing = getUserQuestProgress(normalizedAddress, questId);
  if (existing) {
    return existing;
  }
  
  // Create new quest progress
  db.prepare(`
    INSERT INTO user_quests (wallet_address, quest_id, status, started_at)
    VALUES (?, ?, 'in_progress', CURRENT_TIMESTAMP)
  `).run(normalizedAddress, questId);
  
  return getUserQuestProgress(normalizedAddress, questId)!;
}

/**
 * Update quest progress
 */
export function updateQuestProgress(
  walletAddress: string, 
  questId: string, 
  progress: number
): UserQuest | null {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  db.prepare(`
    UPDATE user_quests 
    SET progress = ?, updated_at = CURRENT_TIMESTAMP
    WHERE wallet_address = ? AND quest_id = ?
  `).run(progress, normalizedAddress, questId);
  
  return getUserQuestProgress(normalizedAddress, questId);
}

/**
 * Complete a quest for a user
 */
export function completeQuest(walletAddress: string, questId: string): UserQuest | null {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Check if quest exists and is not already completed
  const existing = getUserQuestProgress(normalizedAddress, questId);
  
  if (existing && (existing.status === 'completed' || existing.status === 'claimed')) {
    return existing; // Already completed
  }
  
  if (!existing) {
    // Create and complete in one step
    db.prepare(`
      INSERT INTO user_quests (wallet_address, quest_id, status, progress, started_at, completed_at)
      VALUES (?, ?, 'completed', 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(normalizedAddress, questId);
  } else {
    // Update existing record
    db.prepare(`
      UPDATE user_quests 
      SET status = 'completed', progress = 100, completed_at = CURRENT_TIMESTAMP
      WHERE wallet_address = ? AND quest_id = ?
    `).run(normalizedAddress, questId);
  }
  
  return getUserQuestProgress(normalizedAddress, questId);
}

/**
 * Claim quest rewards (XP)
 * Returns the XP amount claimed, or 0 if already claimed
 */
export function claimQuestReward(walletAddress: string, questId: string): {
  success: boolean;
  xpClaimed: number;
  error?: string;
} {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Get quest details
  const quest = getQuestById(questId);
  if (!quest) {
    return { success: false, xpClaimed: 0, error: 'Quest not found' };
  }
  
  // Get user progress
  const progress = getUserQuestProgress(normalizedAddress, questId);
  if (!progress) {
    return { success: false, xpClaimed: 0, error: 'Quest not started' };
  }
  
  if (progress.status !== 'completed') {
    return { success: false, xpClaimed: 0, error: 'Quest not completed' };
  }
  
  // Mark as claimed
  db.prepare(`
    UPDATE user_quests 
    SET status = 'claimed', claimed_at = CURRENT_TIMESTAMP
    WHERE wallet_address = ? AND quest_id = ?
  `).run(normalizedAddress, questId);
  
  // Add XP to user
  addUserXP(normalizedAddress, quest.xp_reward);
  
  return { success: true, xpClaimed: quest.xp_reward };
}

/**
 * Get quests with user progress for display
 */
export function getQuestsWithProgress(walletAddress: string): Array<Quest & { 
  userProgress: UserQuest | null;
  canClaim: boolean;
}> {
  const quests = getActiveQuests();
  const userQuests = getUserQuests(walletAddress);
  
  const userQuestMap = new Map<string, UserQuest>();
  for (const uq of userQuests) {
    userQuestMap.set(uq.quest_id, uq);
  }
  
  return quests.map(quest => {
    const userProgress = userQuestMap.get(quest.id) || null;
    const canClaim = userProgress?.status === 'completed';
    return { ...quest, userProgress, canClaim };
  });
}

/**
 * Get XP leaderboard
 */
export function getXPLeaderboard(limit: number = 10): Array<UserXP & { rank: number }> {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT *, ROW_NUMBER() OVER (ORDER BY total_xp DESC) as rank
    FROM user_xp
    ORDER BY total_xp DESC
    LIMIT ?
  `);
  return stmt.all(limit) as Array<UserXP & { rank: number }>;
}

// ============================================================
// DATABASE BACKUP
// ============================================================

/**
 * Create a backup of the database file
 * @param backupDir Directory to store backups (defaults to data/backups)
 * @returns Path to the backup file
 */
export function createDatabaseBackup(backupDir?: string): string {
  const db = getDatabase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDirectory = backupDir || path.join(process.cwd(), 'data', 'backups');
  
  // Ensure backup directory exists
  if (!fs.existsSync(backupDirectory)) {
    fs.mkdirSync(backupDirectory, { recursive: true });
  }
  
  const backupPath = path.join(backupDirectory, `swo-backup-${timestamp}.db`);
  
  try {
    // Use SQLite's backup API
    db.backup(backupPath);
  } catch (error) {
    throw new Error(`Database backup failed: ${String(error)}`);
  }
  
  return backupPath;
}

/**
 * List all database backups
 */
export function listDatabaseBackups(backupDir?: string): Array<{
  filename: string;
  path: string;
  timestamp: Date;
  size: number;
}> {
  const backupDirectory = backupDir || path.join(process.cwd(), 'data', 'backups');
  
  if (!fs.existsSync(backupDirectory)) {
    return [];
  }
  
  const files = fs.readdirSync(backupDirectory)
    .filter(f => f.startsWith('swo-backup-') && f.endsWith('.db'))
    .map(filename => {
      const filePath = path.join(backupDirectory, filename);
      const stats = fs.statSync(filePath);
      
      // Extract timestamp from filename: swo-backup-YYYY-MM-DDTHH-MM-SS-sssZ.db
      // The ISO timestamp uses '-' instead of ':' and '.' for filesystem safety
      const timestampMatch = filename.match(/swo-backup-(.+)\.db/);
      let timestamp: Date;
      
      if (timestampMatch) {
        // Reconstruct ISO format: replace position-based separators
        // Format: 2024-12-26T12-00-00-000Z -> 2024-12-26T12:00:00.000Z
        const ts = timestampMatch[1];
        // Only need to fix the time portion (after T): positions 11,14 should be : and position 17 should be .
        const isoString = ts.substring(0, 13) + ':' + ts.substring(14, 16) + ':' + ts.substring(17, 19) + '.' + ts.substring(20);
        timestamp = new Date(isoString);
      } else {
        timestamp = stats.mtime;
      }
      
      return {
        filename,
        path: filePath,
        timestamp,
        size: stats.size,
      };
    })
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  return files;
}

/**
 * Clean up old backups, keeping only the most recent N backups
 */
export function cleanupOldBackups(keepCount: number = 7, backupDir?: string): number {
  const backups = listDatabaseBackups(backupDir);
  let deletedCount = 0;
  
  if (backups.length > keepCount) {
    const toDelete = backups.slice(keepCount);
    for (const backup of toDelete) {
      fs.unlinkSync(backup.path);
      deletedCount++;
    }
  }
  
  return deletedCount;
}

// ============================================================
// CLEANUP
// ============================================================

/**
 * Clean up old data
 */
export function cleanupOldData(): void {
  const db = getDatabase();
  
  // Remove chat messages older than 24 hours
  db.prepare(`
    DELETE FROM chat_messages 
    WHERE datetime(created_at) < datetime('now', '-24 hours')
  `).run();
  
  // Remove stale online presence (older than 10 minutes)
  db.prepare(`
    DELETE FROM online_presence 
    WHERE datetime(last_seen) < datetime('now', '-10 minutes')
  `).run();
  
  // End stale voice sessions
  db.prepare(`
    UPDATE voice_sessions 
    SET is_active = 0, ended_at = CURRENT_TIMESTAMP 
    WHERE is_active = 1 AND datetime(created_at) < datetime('now', '-1 hour')
  `).run();
}

/**
 * Close database connection (for cleanup)
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ============================================================
// NOTIFICATIONS
// ============================================================

export type NotificationType = 'quest' | 'achievement' | 'system' | 'social' | 'governance';

export interface Notification {
  id: number;
  wallet_address: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  icon: string;
  is_read: number;
  created_at: string;
}

export interface NotificationSettings {
  id: number;
  wallet_address: string;
  quest_notifications: number;
  achievement_notifications: number;
  system_notifications: number;
  social_notifications: number;
  governance_notifications: number;
  created_at: string;
  updated_at: string;
}

/**
 * Create a notification for a user
 */
/**
 * Create a notification for a user or globally for all users
 * 
 * @param walletAddress User wallet address or 'GLOBAL' for all users
 * @param data Notification data
 * @returns Created notification
 */
export function createNotification(
  walletAddress: string,
  data: {
    type: NotificationType;
    title: string;
    message: string;
    link?: string;
    icon?: string;
  }
): Notification {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Global notifications bypass user settings check
  const isGlobal = normalizedAddress === 'global';
  
  // Check user's notification settings before creating (skip for global)
  if (!isGlobal) {
    const settings = getNotificationSettings(normalizedAddress);
    const settingKey = `${data.type}_notifications` as keyof NotificationSettings;
    if (settings && settings[settingKey] === 0) {
      // User has disabled this notification type, don't create it
      // Return a dummy notification that won't be saved
      return {
        id: 0,
        wallet_address: normalizedAddress,
        type: data.type,
        title: data.title,
        message: data.message,
        link: data.link || null,
        icon: data.icon || '🔔',
        is_read: 1,
        created_at: new Date().toISOString(),
      };
    }
  }
  
  const stmt = db.prepare(`
    INSERT INTO notifications (wallet_address, type, title, message, link, icon)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    normalizedAddress,
    data.type,
    data.title,
    data.message,
    data.link || null,
    data.icon || '🔔'
  );
  
  const getStmt = db.prepare('SELECT * FROM notifications WHERE id = ?');
  return getStmt.get(result.lastInsertRowid) as Notification;
}

/**
 * Get notifications for a user (includes both user-specific and global notifications)
 * 
 * @param walletAddress User wallet address
 * @param options Query options (unreadOnly, limit, offset)
 * @returns Array of notifications
 */
export function getNotifications(
  walletAddress: string,
  options?: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  }
): Notification[] {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  
  // Include both user-specific AND global notifications
  let query = 'SELECT * FROM notifications WHERE (wallet_address = ? OR wallet_address = ?)';
  const params: (string | number)[] = [normalizedAddress, 'global'];
  
  if (options?.unreadOnly) {
    query += ' AND is_read = 0';
  }
  
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  const stmt = db.prepare(query);
  return stmt.all(...params) as Notification[];
}

/**
 * Get unread notification count for a user (includes global notifications)
 * 
 * @param walletAddress User wallet address
 * @returns Count of unread notifications
 */
export function getUnreadNotificationCount(walletAddress: string): number {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM notifications 
    WHERE (wallet_address = ? OR wallet_address = ?) AND is_read = 0
  `);
  const normalizedAddress = walletAddress.toLowerCase();
  const result = stmt.get(normalizedAddress, 'global') as { count: number };
  return result.count;
}

/**
 * Mark a notification as read
 */
export function markNotificationRead(notificationId: number): void {
  const db = getDatabase();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(notificationId);
}

/**
 * Mark all notifications as read for a user
 */
export function markAllNotificationsRead(walletAddress: string): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE notifications SET is_read = 1 WHERE wallet_address = ?
  `).run(walletAddress.toLowerCase());
}

/**
 * Delete a notification
 */
export function deleteNotification(notificationId: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM notifications WHERE id = ?').run(notificationId);
}

/**
 * Delete old notifications (older than 30 days)
 * 
 * This function permanently deletes notifications from the database.
 * It should be called periodically (e.g., daily via cron job) to prevent
 * database bloat and maintain performance.
 * 
 * Usage:
 * - Can be called from a cron endpoint or scheduled job
 * - Recommended frequency: daily cleanup during low-traffic hours
 * - Data retention: 30 days (can be adjusted by modifying the SQL query)
 * 
 * @example
 * // In a cron endpoint:
 * cleanupOldNotifications();
 * cleanupOldData(); // Also cleanup other stale data
 */
export function cleanupOldNotifications(): void {
  const db = getDatabase();
  db.prepare(`
    DELETE FROM notifications 
    WHERE datetime(created_at) < datetime('now', '-30 days')
  `).run();
}

/**
 * Get notification settings for a user
 */
export function getNotificationSettings(walletAddress: string): NotificationSettings | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM notification_settings WHERE wallet_address = ?');
  return stmt.get(walletAddress.toLowerCase()) as NotificationSettings | null;
}

/**
 * Update notification settings for a user
 */
export function updateNotificationSettings(
  walletAddress: string,
  settings: {
    questNotifications?: boolean;
    achievementNotifications?: boolean;
    systemNotifications?: boolean;
    socialNotifications?: boolean;
    governanceNotifications?: boolean;
  }
): NotificationSettings {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Get existing settings or use defaults
  const existing = getNotificationSettings(normalizedAddress);
  
  const questNotifications = settings.questNotifications !== undefined 
    ? (settings.questNotifications ? 1 : 0) 
    : (existing?.quest_notifications ?? 1);
  const achievementNotifications = settings.achievementNotifications !== undefined 
    ? (settings.achievementNotifications ? 1 : 0) 
    : (existing?.achievement_notifications ?? 1);
  const systemNotifications = settings.systemNotifications !== undefined 
    ? (settings.systemNotifications ? 1 : 0) 
    : (existing?.system_notifications ?? 1);
  const socialNotifications = settings.socialNotifications !== undefined 
    ? (settings.socialNotifications ? 1 : 0) 
    : (existing?.social_notifications ?? 1);
  const governanceNotifications = settings.governanceNotifications !== undefined 
    ? (settings.governanceNotifications ? 1 : 0) 
    : (existing?.governance_notifications ?? 1);
  
  db.prepare(`
    INSERT INTO notification_settings (
      wallet_address, quest_notifications, achievement_notifications,
      system_notifications, social_notifications, governance_notifications
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(wallet_address) DO UPDATE SET
      quest_notifications = ?,
      achievement_notifications = ?,
      system_notifications = ?,
      social_notifications = ?,
      governance_notifications = ?,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    normalizedAddress,
    questNotifications, achievementNotifications, systemNotifications,
    socialNotifications, governanceNotifications,
    questNotifications, achievementNotifications, systemNotifications,
    socialNotifications, governanceNotifications
  );
  
  return getNotificationSettings(normalizedAddress)!;
}

// ============================================================
// FRIENDS SYSTEM
// ============================================================

export type FriendStatus = 'pending' | 'accepted' | 'blocked';

export interface Friend {
  id: number;
  user_address: string;
  friend_address: string;
  status: FriendStatus;
  created_at: string;
  updated_at: string;
}

export interface FriendWithProfile extends Friend {
  display_name?: string;
  bio?: string;
}

/**
 * Send a friend request
 */
export function sendFriendRequest(userAddress: string, friendAddress: string): Friend | null {
  const db = getDatabase();
  const normalizedUser = userAddress.toLowerCase();
  const normalizedFriend = friendAddress.toLowerCase();
  
  // Can't friend yourself
  if (normalizedUser === normalizedFriend) {
    return null;
  }
  
  // Check if relationship already exists
  const existing = db.prepare(`
    SELECT * FROM friends 
    WHERE (user_address = ? AND friend_address = ?)
    OR (user_address = ? AND friend_address = ?)
  `).get(normalizedUser, normalizedFriend, normalizedFriend, normalizedUser) as Friend | undefined;
  
  if (existing) {
    return existing;
  }
  
  // Create new friend request
  const stmt = db.prepare(`
    INSERT INTO friends (user_address, friend_address, status)
    VALUES (?, ?, 'pending')
  `);
  
  const result = stmt.run(normalizedUser, normalizedFriend);
  
  const getStmt = db.prepare('SELECT * FROM friends WHERE id = ?');
  return getStmt.get(result.lastInsertRowid) as Friend;
}

/**
 * Accept a friend request
 */
export function acceptFriendRequest(userAddress: string, friendAddress: string): Friend | null {
  const db = getDatabase();
  const normalizedUser = userAddress.toLowerCase();
  const normalizedFriend = friendAddress.toLowerCase();
  
  // Find the pending request (where friend_address is the current user)
  const request = db.prepare(`
    SELECT * FROM friends 
    WHERE user_address = ? AND friend_address = ? AND status = 'pending'
  `).get(normalizedFriend, normalizedUser) as Friend | undefined;
  
  if (!request) {
    return null;
  }
  
  // Update to accepted
  db.prepare(`
    UPDATE friends 
    SET status = 'accepted', updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(request.id);
  
  return db.prepare('SELECT * FROM friends WHERE id = ?').get(request.id) as Friend;
}

/**
 * Decline/reject a friend request
 */
export function declineFriendRequest(userAddress: string, friendAddress: string): boolean {
  const db = getDatabase();
  const normalizedUser = userAddress.toLowerCase();
  const normalizedFriend = friendAddress.toLowerCase();
  
  const result = db.prepare(`
    DELETE FROM friends 
    WHERE user_address = ? AND friend_address = ? AND status = 'pending'
  `).run(normalizedFriend, normalizedUser);
  
  return result.changes > 0;
}

/**
 * Remove a friend (unfriend)
 */
export function removeFriend(userAddress: string, friendAddress: string): boolean {
  const db = getDatabase();
  const normalizedUser = userAddress.toLowerCase();
  const normalizedFriend = friendAddress.toLowerCase();
  
  const result = db.prepare(`
    DELETE FROM friends 
    WHERE ((user_address = ? AND friend_address = ?) OR (user_address = ? AND friend_address = ?))
    AND status = 'accepted'
  `).run(normalizedUser, normalizedFriend, normalizedFriend, normalizedUser);
  
  return result.changes > 0;
}

/**
 * Block a user
 */
export function blockUser(userAddress: string, blockAddress: string): Friend | null {
  const db = getDatabase();
  const normalizedUser = userAddress.toLowerCase();
  const normalizedBlock = blockAddress.toLowerCase();
  
  // Delete any existing relationship
  db.prepare(`
    DELETE FROM friends 
    WHERE (user_address = ? AND friend_address = ?) OR (user_address = ? AND friend_address = ?)
  `).run(normalizedUser, normalizedBlock, normalizedBlock, normalizedUser);
  
  // Create block entry
  const stmt = db.prepare(`
    INSERT INTO friends (user_address, friend_address, status)
    VALUES (?, ?, 'blocked')
  `);
  
  const result = stmt.run(normalizedUser, normalizedBlock);
  
  return db.prepare('SELECT * FROM friends WHERE id = ?').get(result.lastInsertRowid) as Friend;
}

/**
 * Get all friends (accepted) for a user
 */
export function getFriends(userAddress: string): FriendWithProfile[] {
  const db = getDatabase();
  const normalizedAddress = userAddress.toLowerCase();
  
  // Get friends where user is either the requester or the accepter
  const friends = db.prepare(`
    SELECT f.*, 
           CASE 
             WHEN f.user_address = ? THEN p2.display_name
             ELSE p1.display_name
           END as display_name,
           CASE 
             WHEN f.user_address = ? THEN p2.bio
             ELSE p1.bio
           END as bio
    FROM friends f
    LEFT JOIN user_profiles p1 ON f.user_address = p1.wallet_address
    LEFT JOIN user_profiles p2 ON f.friend_address = p2.wallet_address
    WHERE (f.user_address = ? OR f.friend_address = ?) AND f.status = 'accepted'
    ORDER BY f.updated_at DESC
  `).all(normalizedAddress, normalizedAddress, normalizedAddress, normalizedAddress) as FriendWithProfile[];
  
  return friends;
}

/**
 * Get pending friend requests (incoming)
 */
export function getPendingFriendRequests(userAddress: string): FriendWithProfile[] {
  const db = getDatabase();
  const normalizedAddress = userAddress.toLowerCase();
  
  const requests = db.prepare(`
    SELECT f.*, p.display_name, p.bio
    FROM friends f
    LEFT JOIN user_profiles p ON f.user_address = p.wallet_address
    WHERE f.friend_address = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(normalizedAddress) as FriendWithProfile[];
  
  return requests;
}

/**
 * Get outgoing friend requests (sent but not accepted)
 */
export function getOutgoingFriendRequests(userAddress: string): FriendWithProfile[] {
  const db = getDatabase();
  const normalizedAddress = userAddress.toLowerCase();
  
  const requests = db.prepare(`
    SELECT f.*, p.display_name, p.bio
    FROM friends f
    LEFT JOIN user_profiles p ON f.friend_address = p.wallet_address
    WHERE f.user_address = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(normalizedAddress) as FriendWithProfile[];
  
  return requests;
}

/**
 * Check if two users are friends
 */
export function areFriends(userAddress: string, otherAddress: string): boolean {
  const db = getDatabase();
  const normalizedUser = userAddress.toLowerCase();
  const normalizedOther = otherAddress.toLowerCase();
  
  const friend = db.prepare(`
    SELECT 1 FROM friends 
    WHERE ((user_address = ? AND friend_address = ?) OR (user_address = ? AND friend_address = ?))
    AND status = 'accepted'
    LIMIT 1
  `).get(normalizedUser, normalizedOther, normalizedOther, normalizedUser);
  
  return !!friend;
}

/**
 * Get friendship status between two users
 */
export function getFriendshipStatus(userAddress: string, otherAddress: string): {
  status: 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';
  friend?: Friend;
} {
  const db = getDatabase();
  const normalizedUser = userAddress.toLowerCase();
  const normalizedOther = otherAddress.toLowerCase();
  
  const friend = db.prepare(`
    SELECT * FROM friends 
    WHERE (user_address = ? AND friend_address = ?) OR (user_address = ? AND friend_address = ?)
    LIMIT 1
  `).get(normalizedUser, normalizedOther, normalizedOther, normalizedUser) as Friend | undefined;
  
  if (!friend) {
    return { status: 'none' };
  }
  
  if (friend.status === 'blocked') {
    return { status: 'blocked', friend };
  }
  
  if (friend.status === 'accepted') {
    return { status: 'accepted', friend };
  }
  
  // Pending - determine direction
  if (friend.user_address === normalizedUser) {
    return { status: 'pending_sent', friend };
  } else {
    return { status: 'pending_received', friend };
  }
}

/**
 * Get count of pending friend requests
 */
export function getPendingFriendRequestCount(userAddress: string): number {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM friends 
    WHERE friend_address = ? AND status = 'pending'
  `).get(userAddress.toLowerCase()) as { count: number };
  return result.count;
}

// ============================================================
// DIRECT MESSAGES
// ============================================================

export interface DirectMessage {
  id: number;
  sender_address: string;
  recipient_address: string;
  message: string;
  is_read: number;
  created_at: string;
}

export interface DirectMessageWithProfile extends DirectMessage {
  sender_display_name?: string;
  recipient_display_name?: string;
}

export interface Conversation {
  other_address: string;
  other_display_name?: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  is_sender: boolean;
}

/**
 * Send a direct message
 */
export function sendDirectMessage(senderAddress: string, recipientAddress: string, message: string): DirectMessage | null {
  const db = getDatabase();
  const normalizedSender = senderAddress.toLowerCase();
  const normalizedRecipient = recipientAddress.toLowerCase();
  
  // Can't message yourself
  if (normalizedSender === normalizedRecipient) {
    return null;
  }
  
  // Check if user is blocked
  const isBlocked = db.prepare(`
    SELECT 1 FROM friends 
    WHERE user_address = ? AND friend_address = ? AND status = 'blocked'
    LIMIT 1
  `).get(normalizedRecipient, normalizedSender);
  
  if (isBlocked) {
    return null;
  }
  
  const stmt = db.prepare(`
    INSERT INTO direct_messages (sender_address, recipient_address, message)
    VALUES (?, ?, ?)
  `);
  
  const result = stmt.run(normalizedSender, normalizedRecipient, message);
  
  return db.prepare('SELECT * FROM direct_messages WHERE id = ?').get(result.lastInsertRowid) as DirectMessage;
}

/**
 * Get conversation between two users
 */
export function getConversation(
  userAddress: string, 
  otherAddress: string, 
  limit: number = 50,
  offset: number = 0
): DirectMessageWithProfile[] {
  const db = getDatabase();
  const normalizedUser = userAddress.toLowerCase();
  const normalizedOther = otherAddress.toLowerCase();
  
  const messages = db.prepare(`
    SELECT dm.*, 
           sp.display_name as sender_display_name,
           rp.display_name as recipient_display_name
    FROM direct_messages dm
    LEFT JOIN user_profiles sp ON dm.sender_address = sp.wallet_address
    LEFT JOIN user_profiles rp ON dm.recipient_address = rp.wallet_address
    WHERE (dm.sender_address = ? AND dm.recipient_address = ?)
    OR (dm.sender_address = ? AND dm.recipient_address = ?)
    ORDER BY dm.created_at DESC
    LIMIT ? OFFSET ?
  `).all(normalizedUser, normalizedOther, normalizedOther, normalizedUser, limit, offset) as DirectMessageWithProfile[];
  
  return messages.reverse(); // Return in chronological order
}

/**
 * Get all conversations for a user (grouped by other party)
 */
export function getConversations(userAddress: string): Conversation[] {
  const db = getDatabase();
  const normalizedAddress = userAddress.toLowerCase();
  
  // Complex query to get the latest message from each conversation
  const conversations = db.prepare(`
    WITH latest_messages AS (
      SELECT 
        CASE 
          WHEN sender_address = ? THEN recipient_address
          ELSE sender_address
        END as other_address,
        message as last_message,
        created_at as last_message_at,
        sender_address = ? as is_sender,
        ROW_NUMBER() OVER (
          PARTITION BY 
            CASE WHEN sender_address = ? THEN recipient_address ELSE sender_address END
          ORDER BY created_at DESC
        ) as rn
      FROM direct_messages
      WHERE sender_address = ? OR recipient_address = ?
    ),
    unread_counts AS (
      SELECT 
        sender_address as other_address,
        COUNT(*) as unread_count
      FROM direct_messages
      WHERE recipient_address = ? AND is_read = 0
      GROUP BY sender_address
    )
    SELECT 
      lm.other_address,
      p.display_name as other_display_name,
      lm.last_message,
      lm.last_message_at,
      COALESCE(uc.unread_count, 0) as unread_count,
      lm.is_sender
    FROM latest_messages lm
    LEFT JOIN user_profiles p ON lm.other_address = p.wallet_address
    LEFT JOIN unread_counts uc ON lm.other_address = uc.other_address
    WHERE lm.rn = 1
    ORDER BY lm.last_message_at DESC
  `).all(
    normalizedAddress, normalizedAddress, normalizedAddress, 
    normalizedAddress, normalizedAddress, normalizedAddress
  ) as Conversation[];
  
  return conversations;
}

/**
 * Mark messages as read
 */
export function markMessagesAsRead(recipientAddress: string, senderAddress: string): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE direct_messages 
    SET is_read = 1 
    WHERE recipient_address = ? AND sender_address = ? AND is_read = 0
  `).run(recipientAddress.toLowerCase(), senderAddress.toLowerCase());
}

/**
 * Mark a single message as read
 */
export function markMessageAsRead(messageId: number): void {
  const db = getDatabase();
  db.prepare('UPDATE direct_messages SET is_read = 1 WHERE id = ?').run(messageId);
}

/**
 * Get unread message count for a user
 */
export function getUnreadMessageCount(userAddress: string): number {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM direct_messages 
    WHERE recipient_address = ? AND is_read = 0
  `).get(userAddress.toLowerCase()) as { count: number };
  return result.count;
}

/**
 * Delete a message (only sender can delete)
 */
export function deleteMessage(messageId: number, senderAddress: string): boolean {
  const db = getDatabase();
  const result = db.prepare(`
    DELETE FROM direct_messages 
    WHERE id = ? AND sender_address = ?
  `).run(messageId, senderAddress.toLowerCase());
  return result.changes > 0;
}

// ============================================================
// TREASURY NFT CACHE
// ============================================================

export interface CachedNFT {
  id?: number;
  wallet_address: string;
  contract_address: string;
  token_id: string;
  name?: string;
  collection_name: string;
  image_url?: string;
  metadata_json?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Get cached NFTs for a wallet (returns null if cache expired)
 * 
 * @param walletAddress Wallet address to get cached NFTs for
 * @param maxAgeHours Maximum age of cache in hours (default: 24)
 * @returns Array of cached NFTs or null if cache is expired/empty
 */
export function getCachedTreasuryNFTs(
  walletAddress: string,
  maxAgeHours: number = 24
): CachedNFT[] | null {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Check if we have any cached data
  const count = db.prepare(`
    SELECT COUNT(*) as count 
    FROM treasury_nft_cache 
    WHERE wallet_address = ?
  `).get(normalizedAddress) as { count: number };
  
  if (count.count === 0) {
    return null; // No cache
  }
  
  // Check if cache is expired
  const ageCheck = db.prepare(`
    SELECT 
      MAX(updated_at) as latest_update,
      (julianday('now') - julianday(MAX(updated_at))) * 24 as age_hours
    FROM treasury_nft_cache 
    WHERE wallet_address = ?
  `).get(normalizedAddress) as { latest_update: string; age_hours: number };
  
  if (ageCheck.age_hours > maxAgeHours) {
    return null; // Cache expired
  }
  
  // Return cached data
  const cached = db.prepare(`
    SELECT * FROM treasury_nft_cache 
    WHERE wallet_address = ?
    ORDER BY collection_name, token_id
  `).all(normalizedAddress) as CachedNFT[];
  
  return cached;
}

/**
 * Save NFTs to cache (upsert)
 * 
 * @param walletAddress Wallet address
 * @param nfts Array of NFTs to cache
 */
export function cacheTreasuryNFTs(walletAddress: string, nfts: CachedNFT[]): void {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Start transaction for batch insert
  const insertStmt = db.prepare(`
    INSERT INTO treasury_nft_cache (
      wallet_address, contract_address, token_id, 
      name, collection_name, image_url, metadata_json, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(wallet_address, contract_address, token_id) 
    DO UPDATE SET 
      name = excluded.name,
      collection_name = excluded.collection_name,
      image_url = excluded.image_url,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  const insertMany = db.transaction((nftList: CachedNFT[]) => {
    for (const nft of nftList) {
      insertStmt.run(
        normalizedAddress,
        nft.contract_address.toLowerCase(),
        nft.token_id,
        nft.name || null,
        nft.collection_name,
        nft.image_url || null,
        nft.metadata_json || null
      );
    }
  });
  
  insertMany(nfts);
}

/**
 * Clear cache for a wallet (for manual refresh)
 * 
 * @param walletAddress Wallet address to clear cache for
 */
export function clearTreasuryNFTCache(walletAddress: string): void {
  const db = getDatabase();
  db.prepare(`
    DELETE FROM treasury_nft_cache 
    WHERE wallet_address = ?
  `).run(walletAddress.toLowerCase());
}

/**
 * Get cache age for a wallet in hours
 * 
 * @param walletAddress Wallet address
 * @returns Age in hours or null if no cache
 */
export function getTreasuryNFTCacheAge(walletAddress: string): number | null {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT (julianday('now') - julianday(MAX(updated_at))) * 24 as age_hours
    FROM treasury_nft_cache 
    WHERE wallet_address = ?
  `).get(walletAddress.toLowerCase()) as { age_hours: number | null };
  
  return result.age_hours;
}

// ============================================================================
// Star Forge Database Functions
// ============================================================================

export interface StarForgeGame {
  id: string;
  player_address: string;
  tier: 'bronze' | 'silver' | 'gold';
  entry_fee: string;
  server_seed_hash: string;
  server_seed: string | null;
  client_seed: string | null;
  nonce: number;
  grid: number | null;
  pattern: string | null;
  multiplier: number | null;
  payout: string | null;
  is_star_holder: number;
  status: 'pending' | 'completed' | 'verified';
  created_at: string;
  completed_at: string | null;
  tx_hash: string | null;
}

export interface StarForgeJackpot {
  id: number;
  tier: 'bronze' | 'silver' | 'gold';
  pool_amount: string;
  last_won_at: string | null;
  last_winner: string | null;
  total_contributions: string;
  total_payouts: string;
  win_count: number;
}

export interface StarForgeTreasury {
  id: number;
  tier: 'bronze' | 'silver' | 'gold';
  balance: string;
  total_games: number;
  total_wagered: string;
  total_paid_out: string;
  house_profit: string;
}

/**
 * Create a new Star Forge game
 */
export function createStarForgeGame(data: {
  id: string;
  player_address: string;
  tier: 'bronze' | 'silver' | 'gold';
  entry_fee: string;
  server_seed_hash: string;
  nonce: number;
  is_star_holder: boolean;
}): StarForgeGame {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    INSERT INTO starforge_games (
      id, player_address, tier, entry_fee, server_seed_hash, 
      nonce, is_star_holder, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `);
  
  stmt.run(
    data.id,
    data.player_address.toLowerCase(),
    data.tier,
    data.entry_fee,
    data.server_seed_hash,
    data.nonce,
    data.is_star_holder ? 1 : 0
  );
  
  return getStarForgeGame(data.id)!;
}

/**
 * Get a Star Forge game by ID
 */
export function getStarForgeGame(id: string): StarForgeGame | null {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT * FROM starforge_games WHERE id = ?
  `);
  
  return stmt.get(id) as StarForgeGame | null;
}

/**
 * Complete a Star Forge game with results
 */
export function completeStarForgeGame(data: {
  id: string;
  server_seed: string;
  client_seed: string;
  grid: number;
  pattern: string;
  multiplier: number;
  payout: string;
  tx_hash?: string;
}): StarForgeGame | null {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    UPDATE starforge_games
    SET 
      server_seed = ?,
      client_seed = ?,
      grid = ?,
      pattern = ?,
      multiplier = ?,
      payout = ?,
      status = 'completed',
      completed_at = CURRENT_TIMESTAMP,
      tx_hash = ?
    WHERE id = ?
  `);
  
  stmt.run(
    data.server_seed,
    data.client_seed,
    data.grid,
    data.pattern,
    data.multiplier,
    data.payout,
    data.tx_hash || null,
    data.id
  );
  
  return getStarForgeGame(data.id);
}

/**
 * Get recent games for a player
 */
export function getPlayerStarForgeGames(
  playerAddress: string,
  limit: number = 20
): StarForgeGame[] {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT * FROM starforge_games
    WHERE player_address = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  
  return stmt.all(playerAddress.toLowerCase(), limit) as StarForgeGame[];
}

/**
 * Get recent games across all players
 */
export function getRecentStarForgeGames(limit: number = 50): StarForgeGame[] {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT * FROM starforge_games
    WHERE status = 'completed'
    ORDER BY completed_at DESC
    LIMIT ?
  `);
  
  return stmt.all(limit) as StarForgeGame[];
}

/**
 * Get jackpot pool for a tier
 */
export function getStarForgeJackpot(tier: 'bronze' | 'silver' | 'gold'): StarForgeJackpot | null {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT * FROM starforge_jackpots WHERE tier = ?
  `);
  
  return stmt.get(tier) as StarForgeJackpot | null;
}

/**
 * Get all jackpot pools
 */
export function getAllStarForgeJackpots(): StarForgeJackpot[] {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT * FROM starforge_jackpots ORDER BY tier
  `);
  
  return stmt.all() as StarForgeJackpot[];
}

/**
 * Add to jackpot pool
 */
export function addToStarForgeJackpot(
  tier: 'bronze' | 'silver' | 'gold',
  amount: string
): void {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    UPDATE starforge_jackpots
    SET 
      pool_amount = (CAST(pool_amount AS REAL) + CAST(? AS REAL)),
      total_contributions = (CAST(total_contributions AS REAL) + CAST(? AS REAL))
    WHERE tier = ?
  `);
  
  stmt.run(amount, amount, tier);
}

/**
 * Award jackpot to winner
 */
export function awardStarForgeJackpot(
  tier: 'bronze' | 'silver' | 'gold',
  winner: string,
  amount: string
): void {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    UPDATE starforge_jackpots
    SET 
      pool_amount = '0',
      last_won_at = CURRENT_TIMESTAMP,
      last_winner = ?,
      total_payouts = (CAST(total_payouts AS REAL) + CAST(? AS REAL)),
      win_count = win_count + 1
    WHERE tier = ?
  `);
  
  stmt.run(winner.toLowerCase(), amount, tier);
}

/**
 * Get treasury stats for a tier
 */
export function getStarForgeTreasury(tier: 'bronze' | 'silver' | 'gold'): StarForgeTreasury | null {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT * FROM starforge_treasury WHERE tier = ?
  `);
  
  return stmt.get(tier) as StarForgeTreasury | null;
}

/**
 * Get all treasury stats
 */
export function getAllStarForgeTreasury(): StarForgeTreasury[] {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT * FROM starforge_treasury ORDER BY tier
  `);
  
  return stmt.all() as StarForgeTreasury[];
}

/**
 * Update treasury stats after a game
 */
export function updateStarForgeTreasury(
  tier: 'bronze' | 'silver' | 'gold',
  wagered: string,
  payout: string,
  houseProfit: string
): void {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    UPDATE starforge_treasury
    SET 
      total_games = total_games + 1,
      total_wagered = (CAST(total_wagered AS REAL) + CAST(? AS REAL)),
      total_paid_out = (CAST(total_paid_out AS REAL) + CAST(? AS REAL)),
      house_profit = (CAST(house_profit AS REAL) + CAST(? AS REAL))
    WHERE tier = ?
  `);
  
  stmt.run(wagered, payout, houseProfit, tier);
}

/**
 * Get Star Forge statistics
 */
export function getStarForgeStats() {
  const db = getDatabase();
  
  // Total games played
  const totalGames = db.prepare(`
    SELECT COUNT(*) as count FROM starforge_games WHERE status = 'completed'
  `).get() as { count: number };
  
  // Total wagered across all tiers
  const totalWagered = db.prepare(`
    SELECT SUM(CAST(total_wagered AS REAL)) as total FROM starforge_treasury
  `).get() as { total: number };
  
  // Total paid out
  const totalPaidOut = db.prepare(`
    SELECT SUM(CAST(total_paid_out AS REAL)) as total FROM starforge_treasury
  `).get() as { total: number };
  
  // House profit
  const houseProfit = db.prepare(`
    SELECT SUM(CAST(house_profit AS REAL)) as total FROM starforge_treasury
  `).get() as { total: number };
  
  // Jackpot pools
  const jackpots = getAllStarForgeJackpots();
  
  return {
    totalGames: totalGames.count,
    totalWagered: totalWagered.total?.toString() || '0',
    totalPaidOut: totalPaidOut.total?.toString() || '0',
    houseProfit: houseProfit.total?.toString() || '0',
    jackpots,
  };
}

// ============================================================================
// Raffle System Database Functions
// ============================================================================

export type RaffleStatus = 'active' | 'ended' | 'drawn' | 'cancelled';

export interface Raffle {
  id: string;
  name: string;
  description: string;
  prize_description: string;
  prize_image_url: string | null;
  status: RaffleStatus;
  created_by: string;
  start_time: string;
  end_time: string;
  winner_address: string | null;
  winner_drawn_at: string | null;
  winner_draw_seed: string | null;
  discord_bonus_enabled: number;
  require_x: number;
  require_discord: number;
  tweet_url: string | null;
  is_public: number; // 0 = Star only, 1 = All Skrumpey holders (Star gets x5, regular gets x1)
  created_at: string;
}

export interface RaffleEntry {
  id: number;
  raffle_id: string;
  wallet_address: string;
  tier: 'star_forged' | 'cosmic_warden' | 'star_lord' | 'cosmic_emperor' | 'skrumpey_holder';
  entries_count: number;
  discord_bonus: number;
  engagement_bonus: number;
  star_count: number;
  entered_at: string;
}

export interface RaffleEntryWithProfile extends RaffleEntry {
  display_name?: string;
}

/**
 * Holder tier thresholds
 * COSMIC EMPEROR: 10+ Star Skrumpeys = 4 entries
 * STAR LORD: 5-9 Star Skrumpeys = 3 entries
 * COSMIC WARDEN: 2-4 Star Skrumpeys = 2 entries
 * STAR FORGED: 1 Star Skrumpey = 1 entry
 */
export const HOLDER_TIERS = {
  cosmic_emperor: { minStars: 10, entries: 4, name: 'Cosmic Emperor' },
  star_lord: { minStars: 5, entries: 3, name: 'Star Lord' },
  cosmic_warden: { minStars: 2, entries: 2, name: 'Cosmic Warden' },
  star_forged: { minStars: 1, entries: 1, name: 'Star Forged' },
} as const;

export type HolderTier = keyof typeof HOLDER_TIERS;

/**
 * Calculate holder tier based on Star Skrumpey count
 */
export function calculateHolderTier(starCount: number): { tier: HolderTier; entries: number; name: string; minStars: number } | null {
  if (starCount >= 10) {
    return { tier: 'cosmic_emperor', ...HOLDER_TIERS.cosmic_emperor };
  }
  if (starCount >= 5) {
    return { tier: 'star_lord', ...HOLDER_TIERS.star_lord };
  }
  if (starCount >= 2) {
    return { tier: 'cosmic_warden', ...HOLDER_TIERS.cosmic_warden };
  }
  if (starCount >= 1) {
    return { tier: 'star_forged', ...HOLDER_TIERS.star_forged };
  }
  return null; // Not a holder
}

/**
 * Create a new raffle
 */
export function createRaffle(data: {
  id: string;
  name: string;
  description: string;
  prizeDescription: string;
  prizeImageUrl?: string;
  createdBy: string;
  startTime: Date;
  endTime: Date;
  discordBonusEnabled?: boolean;
  requireX?: boolean;
  requireDiscord?: boolean;
  tweetUrl?: string;
  isPublic?: boolean; // If true, all Skrumpey holders can enter (Star: x5, regular: x1)
}): Raffle {
  const db = getDatabase();
  
  // Create raffles table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS raffles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      prize_description TEXT NOT NULL,
      prize_image_url TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'drawn', 'cancelled')),
      created_by TEXT NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      winner_address TEXT,
      winner_drawn_at DATETIME,
      winner_draw_seed TEXT,
      discord_bonus_enabled INTEGER NOT NULL DEFAULT 0,
      require_x INTEGER NOT NULL DEFAULT 0,
      require_discord INTEGER NOT NULL DEFAULT 0,
      tweet_url TEXT,
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Add new columns if they don't exist (migration)
  try {
    db.exec(`ALTER TABLE raffles ADD COLUMN require_x INTEGER NOT NULL DEFAULT 0`);
  } catch { /* Column may already exist */ }
  try {
    db.exec(`ALTER TABLE raffles ADD COLUMN require_discord INTEGER NOT NULL DEFAULT 0`);
  } catch { /* Column may already exist */ }
  try {
    db.exec(`ALTER TABLE raffles ADD COLUMN tweet_url TEXT`);
  } catch { /* Column may already exist */ }
  try {
    db.exec(`ALTER TABLE raffles ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0`);
  } catch { /* Column may already exist */ }
  
  // Create raffle entries table if it doesn't exist
  // Note: Added 'skrumpey_holder' tier for public raffles
  db.exec(`
    CREATE TABLE IF NOT EXISTS raffle_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raffle_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      tier TEXT NOT NULL CHECK (tier IN ('star_forged', 'cosmic_warden', 'star_lord', 'cosmic_emperor', 'skrumpey_holder')),
      entries_count INTEGER NOT NULL DEFAULT 1,
      discord_bonus INTEGER NOT NULL DEFAULT 0,
      engagement_bonus INTEGER NOT NULL DEFAULT 0,
      star_count INTEGER NOT NULL DEFAULT 1,
      entered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (raffle_id) REFERENCES raffles(id),
      UNIQUE(raffle_id, wallet_address)
    )
  `);
  
  // Add engagement_bonus column if it doesn't exist (migration)
  try {
    db.exec(`ALTER TABLE raffle_entries ADD COLUMN engagement_bonus INTEGER NOT NULL DEFAULT 0`);
  } catch { /* Column may already exist */ }
  
  // Migration: Update tier CHECK constraint to include 'skrumpey_holder' for public raffles
  // SQLite doesn't support modifying CHECK constraints, so we need to recreate the table
  try {
    // Check if we need to migrate by attempting to query for the constraint
    const tableInfo = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='raffle_entries'`).get() as { sql: string } | undefined;
    if (tableInfo && !tableInfo.sql.includes('skrumpey_holder')) {
      console.log('Migrating raffle_entries table to support skrumpey_holder tier...');
      
      // Create new table with updated constraint
      db.exec(`
        CREATE TABLE raffle_entries_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          raffle_id TEXT NOT NULL,
          wallet_address TEXT NOT NULL,
          tier TEXT NOT NULL CHECK (tier IN ('star_forged', 'cosmic_warden', 'star_lord', 'cosmic_emperor', 'skrumpey_holder')),
          entries_count INTEGER NOT NULL DEFAULT 1,
          discord_bonus INTEGER NOT NULL DEFAULT 0,
          engagement_bonus INTEGER NOT NULL DEFAULT 0,
          star_count INTEGER NOT NULL DEFAULT 1,
          entered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (raffle_id) REFERENCES raffles(id),
          UNIQUE(raffle_id, wallet_address)
        )
      `);
      
      // Copy existing data
      db.exec(`
        INSERT INTO raffle_entries_new (id, raffle_id, wallet_address, tier, entries_count, discord_bonus, engagement_bonus, star_count, entered_at)
        SELECT id, raffle_id, wallet_address, tier, entries_count, discord_bonus, engagement_bonus, star_count, entered_at
        FROM raffle_entries
      `);
      
      // Drop old table and rename new one
      db.exec(`DROP TABLE raffle_entries`);
      db.exec(`ALTER TABLE raffle_entries_new RENAME TO raffle_entries`);
      
      console.log('Migration complete: raffle_entries table now supports skrumpey_holder tier');
    }
  } catch (migrationError) {
    console.error('Migration error (raffle_entries tier constraint):', migrationError);
  }
  
  // Create raffle result view tracking (for one-time animation display)
  db.exec(`
    CREATE TABLE IF NOT EXISTS raffle_result_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raffle_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (raffle_id) REFERENCES raffles(id),
      UNIQUE(raffle_id, wallet_address)
    )
  `);
  
  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_raffles_status ON raffles(status, end_time);
    CREATE INDEX IF NOT EXISTS idx_raffle_entries_raffle ON raffle_entries(raffle_id);
    CREATE INDEX IF NOT EXISTS idx_raffle_entries_wallet ON raffle_entries(wallet_address);
    CREATE INDEX IF NOT EXISTS idx_raffle_result_views_raffle ON raffle_result_views(raffle_id, wallet_address);
  `);
  
  const stmt = db.prepare(`
    INSERT INTO raffles (id, name, description, prize_description, prize_image_url, created_by, start_time, end_time, discord_bonus_enabled, require_x, require_discord, tweet_url, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    data.id,
    data.name,
    data.description,
    data.prizeDescription,
    data.prizeImageUrl || null,
    data.createdBy.toLowerCase(),
    data.startTime.toISOString(),
    data.endTime.toISOString(),
    data.discordBonusEnabled ? 1 : 0,
    data.requireX ? 1 : 0,
    data.requireDiscord ? 1 : 0,
    data.tweetUrl || null,
    data.isPublic ? 1 : 0
  );
  
  return getRaffleById(data.id)!;
}

/**
 * Get raffle by ID
 */
export function getRaffleById(id: string): Raffle | null {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare('SELECT * FROM raffles WHERE id = ?');
    return stmt.get(id) as Raffle | null;
  } catch {
    // Table might not exist yet
    return null;
  }
}

/**
 * Get all raffles with optional status filter
 */
export function getRaffles(status?: RaffleStatus): Raffle[] {
  const db = getDatabase();
  
  try {
    if (status) {
      const stmt = db.prepare('SELECT * FROM raffles WHERE status = ? ORDER BY created_at DESC');
      return stmt.all(status) as Raffle[];
    }
    
    const stmt = db.prepare('SELECT * FROM raffles ORDER BY created_at DESC');
    return stmt.all() as Raffle[];
  } catch {
    // Table might not exist yet
    return [];
  }
}

/**
 * Get active raffles (started and not ended)
 */
export function getActiveRaffles(): Raffle[] {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT * FROM raffles 
      WHERE status = 'active' 
      AND datetime(start_time) <= datetime('now')
      AND datetime(end_time) > datetime('now')
      ORDER BY end_time ASC
    `);
    return stmt.all() as Raffle[];
  } catch {
    return [];
  }
}

/**
 * Get upcoming raffles (not yet started)
 */
export function getUpcomingRaffles(): Raffle[] {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT * FROM raffles 
      WHERE status = 'active' 
      AND datetime(start_time) > datetime('now')
      ORDER BY start_time ASC
    `);
    return stmt.all() as Raffle[];
  } catch {
    return [];
  }
}

/**
 * Get past raffles (ended or drawn)
 */
export function getPastRaffles(limit: number = 10): Raffle[] {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT * FROM raffles 
      WHERE status IN ('ended', 'drawn', 'cancelled')
      OR (status = 'active' AND datetime(end_time) <= datetime('now'))
      ORDER BY end_time DESC
      LIMIT ?
    `);
    return stmt.all(limit) as Raffle[];
  } catch {
    return [];
  }
}

/**
 * Get raffles that need to be auto-drawn (active but ended, not yet drawn)
 */
export function getRafflesNeedingDraw(): Raffle[] {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT * FROM raffles 
      WHERE status = 'active' 
      AND datetime(end_time) <= datetime('now')
      AND winner_address IS NULL
      ORDER BY end_time ASC
    `);
    return stmt.all() as Raffle[];
  } catch {
    return [];
  }
}

/**
 * Enter a raffle
 * 
 * For standard raffles: Only Star Skrumpey holders can enter, entries based on Star count tier
 * For public raffles: All Skrumpey holders can enter
 *   - Each regular Skrumpey = 1 entry
 *   - Star holders = 5 base + tier bonus (flat, not per star)
 *   - Total = regularSkrumpeys + (isStarHolder ? 5 + tierBonus : 0)
 */
export function enterRaffle(data: {
  raffleId: string;
  walletAddress: string;
  starCount: number;
  totalSkrumpeyBalance?: number; // Total Skrumpeys from Magic Eden (includes Stars)
  discordBonus?: boolean;
  engagementBonus?: boolean;
}): RaffleEntry | null {
  const db = getDatabase();
  const normalizedAddress = data.walletAddress.toLowerCase();
  
  // Check if raffle exists and is active
  const raffle = getRaffleById(data.raffleId);
  if (!raffle || raffle.status !== 'active') {
    return null;
  }
  
  // Check if raffle hasn't ended
  if (new Date(raffle.end_time) <= new Date()) {
    return null;
  }
  
  let tier: string;
  let baseEntries: number;
  
  // For public raffles, calculate entries based on holdings
  if (raffle.is_public === 1) {
    // Calculate regular Skrumpeys (total - stars)
    const totalBalance = data.totalSkrumpeyBalance ?? data.starCount;
    const regularSkrumpeys = Math.max(0, totalBalance - data.starCount);
    
    if (data.starCount > 0) {
      // Star holder: regularSkrumpeys × 1 + (5 base + tier bonus)
      const tierInfo = calculateHolderTier(data.starCount);
      if (!tierInfo) {
        return null; // Should not happen if starCount > 0
      }
      tier = tierInfo.tier;
      // Each regular Skrumpey = 1 entry, Star holder bonus = 5 + tier
      baseEntries = regularSkrumpeys + 5 + tierInfo.entries;
    } else {
      // Regular Skrumpey holder: each Skrumpey = 1 entry
      tier = 'skrumpey_holder';
      baseEntries = regularSkrumpeys > 0 ? regularSkrumpeys : 1; // At least 1 if they got here
    }
  } else {
    // Standard raffle - only Star holders can enter
    const tierInfo = calculateHolderTier(data.starCount);
    if (!tierInfo) {
      return null; // Not a Star holder
    }
    tier = tierInfo.tier;
    baseEntries = tierInfo.entries;
  }
  
  // Calculate total entries (base + engagement bonus for Like & RT)
  let totalEntries = baseEntries;
  // Discord bonus is deprecated, but keep for backwards compatibility
  const discordBonus = data.discordBonus && raffle.discord_bonus_enabled ? 1 : 0;
  // Engagement bonus: +1 for liking & retweeting the tweet (if tweet_url is set)
  const engagementBonus = data.engagementBonus && raffle.tweet_url ? 1 : 0;
  
  if (discordBonus) {
    totalEntries += 1;
  }
  if (engagementBonus) {
    totalEntries += 1;
  }
  
  try {
    const stmt = db.prepare(`
      INSERT INTO raffle_entries (raffle_id, wallet_address, tier, entries_count, discord_bonus, engagement_bonus, star_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(raffle_id, wallet_address) DO UPDATE SET
        tier = excluded.tier,
        entries_count = excluded.entries_count,
        discord_bonus = excluded.discord_bonus,
        engagement_bonus = excluded.engagement_bonus,
        star_count = excluded.star_count
    `);
    
    stmt.run(
      data.raffleId,
      normalizedAddress,
      tier,
      totalEntries,
      discordBonus,
      engagementBonus,
      data.starCount
    );
    
    return getRaffleEntry(data.raffleId, normalizedAddress);
  } catch (error) {
    console.error('Error entering raffle:', error);
    return null;
  }
}

/**
 * Get a user's entry for a specific raffle
 */
export function getRaffleEntry(raffleId: string, walletAddress: string): RaffleEntry | null {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT * FROM raffle_entries 
      WHERE raffle_id = ? AND wallet_address = ?
    `);
    return stmt.get(raffleId, walletAddress.toLowerCase()) as RaffleEntry | null;
  } catch {
    return null;
  }
}

/**
 * Get all entries for a raffle
 */
export function getRaffleEntries(raffleId: string): RaffleEntryWithProfile[] {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT e.*, p.display_name
      FROM raffle_entries e
      LEFT JOIN user_profiles p ON e.wallet_address = p.wallet_address
      WHERE e.raffle_id = ?
      ORDER BY e.entered_at ASC
    `);
    return stmt.all(raffleId) as RaffleEntryWithProfile[];
  } catch {
    return [];
  }
}

/**
 * Get total entry count for a raffle (weighted by entries_count)
 */
export function getRaffleTotalEntries(raffleId: string): { participants: number; totalTickets: number } {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as participants,
        SUM(entries_count) as totalTickets
      FROM raffle_entries 
      WHERE raffle_id = ?
    `);
    const result = stmt.get(raffleId) as { participants: number; totalTickets: number };
    return {
      participants: result.participants || 0,
      totalTickets: result.totalTickets || 0,
    };
  } catch {
    return { participants: 0, totalTickets: 0 };
  }
}

/**
 * Draw a winner for a raffle using combined entropy.
 *
 * Entropy sources:
 *  1. crypto.randomBytes(32) — server-side CSPRNG (unpredictable)
 *  2. SHA-256 of all entry wallet addresses + counts (tamper-evident)
 *  3. Raffle ID + timestamp (context binding)
 *  4. Optional block hash (additional public entropy when available)
 *
 * The seed string is stored in the database for auditability.
 * Because the server secret bytes are included, no external party
 * can predict or pre-compute the outcome.
 */
export function drawRaffleWinner(raffleId: string, blockHash?: string): {
  success: boolean;
  winner?: RaffleEntry;
  seed?: string;
  error?: string;
} {
  const db = getDatabase();

  const raffle = getRaffleById(raffleId);
  if (!raffle) {
    return { success: false, error: 'Raffle not found' };
  }

  if (raffle.winner_address) {
    return { success: false, error: 'Winner already drawn' };
  }

  const entries = getRaffleEntries(raffleId);
  if (entries.length === 0) {
    return { success: false, error: 'No entries in raffle' };
  }

  // Create weighted entry pool
  const entryPool: RaffleEntry[] = [];
  for (const entry of entries) {
    for (let i = 0; i < entry.entries_count; i++) {
      entryPool.push(entry);
    }
  }

  // --- Combined entropy seed ---
  // 1. Server-side CSPRNG — unpredictable, not derivable from public data
  const serverSecret = crypto.randomBytes(32).toString('hex');

  // 2. Entry-data hash — commits to the exact participant set
  const entryDataString = entries
    .map(e => `${e.wallet_address}:${e.entries_count}`)
    .sort()
    .join('|');
  const entryHash = crypto.createHash('sha256').update(entryDataString).digest('hex');

  // 3. Context binding
  const timestamp = Date.now().toString();

  // 4. Optional block hash (public chain entropy when available)
  const chainEntropy = blockHash || 'no-block';

  const seedString = `${serverSecret}-${entryHash}-${raffleId}-${timestamp}-${chainEntropy}-${entries.length}`;

  // Use cryptographically secure hash for verifiable randomness
  const hashBuffer = crypto.createHash('sha256').update(seedString).digest();
  // Read first 4 bytes as unsigned 32-bit integer for winner index
  const hashNumber = hashBuffer.readUInt32BE(0);

  // Select winner using the hash
  const winnerIndex = hashNumber % entryPool.length;
  const winner = entryPool[winnerIndex];

  // Update raffle with winner
  db.prepare(`
    UPDATE raffles
    SET
      status = 'drawn',
      winner_address = ?,
      winner_drawn_at = CURRENT_TIMESTAMP,
      winner_draw_seed = ?
    WHERE id = ?
  `).run(winner.wallet_address, seedString, raffleId);

  return {
    success: true,
    winner,
    seed: seedString,
  };
}

/**
 * End a raffle manually (without drawing winner)
 */
export function endRaffle(raffleId: string): boolean {
  const db = getDatabase();
  
  try {
    db.prepare(`
      UPDATE raffles SET status = 'ended' WHERE id = ?
    `).run(raffleId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cancel a raffle
 */
export function cancelRaffle(raffleId: string): boolean {
  const db = getDatabase();
  
  try {
    db.prepare(`
      UPDATE raffles SET status = 'cancelled' WHERE id = ?
    `).run(raffleId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if user has viewed raffle result (for one-time animation)
 */
export function hasViewedRaffleResult(raffleId: string, walletAddress: string): boolean {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT 1 FROM raffle_result_views 
      WHERE raffle_id = ? AND wallet_address = ?
    `);
    return !!stmt.get(raffleId, walletAddress.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Mark raffle result as viewed
 */
export function markRaffleResultViewed(raffleId: string, walletAddress: string): void {
  const db = getDatabase();
  
  try {
    db.prepare(`
      INSERT OR IGNORE INTO raffle_result_views (raffle_id, wallet_address)
      VALUES (?, ?)
    `).run(raffleId, walletAddress.toLowerCase());
  } catch (error) {
    console.error('Error marking raffle result as viewed:', error);
  }
}

/**
 * Get all raffles a user has entered (for Raffle History)
 */
export function getUserRaffleEntries(walletAddress: string): Array<RaffleEntry & { 
  raffle: Raffle;
  won: boolean;
}> {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT e.*, 
             r.id as raffle_id, r.name as raffle_name, r.description as raffle_description,
             r.status as raffle_status, r.prize_description, r.prize_image_url,
             r.start_time, r.end_time, r.winner_address, r.winner_drawn_at, r.winner_draw_seed,
             r.discord_bonus_enabled, r.require_x, r.require_discord, r.tweet_url, r.created_at
      FROM raffle_entries e
      JOIN raffles r ON e.raffle_id = r.id
      WHERE e.wallet_address = ?
      ORDER BY e.entered_at DESC
    `);
    
    const results = stmt.all(walletAddress.toLowerCase()) as Array<RaffleEntry & { 
      raffle_name: string; 
      raffle_description: string;
      raffle_status: string;
      prize_description: string;
      prize_image_url: string | null;
      start_time: string;
      end_time: string;
      winner_address: string | null;
      winner_drawn_at: string | null;
      winner_draw_seed: string | null;
      discord_bonus_enabled: number;
      require_x: number;
      require_discord: number;
      tweet_url: string | null;
      created_at: string;
    }>;
    
    const normalizedAddress = walletAddress.toLowerCase();
    
    return results.map(row => ({
      ...row,
      won: row.winner_address?.toLowerCase() === normalizedAddress,
      raffle: {
        id: row.raffle_id,
        name: row.raffle_name,
        description: row.raffle_description,
        status: row.raffle_status as RaffleStatus,
        prize_description: row.prize_description,
        prize_image_url: row.prize_image_url,
        start_time: row.start_time,
        end_time: row.end_time,
        winner_address: row.winner_address,
        winner_drawn_at: row.winner_drawn_at,
        winner_draw_seed: row.winner_draw_seed,
        discord_bonus_enabled: row.discord_bonus_enabled,
        require_x: row.require_x || 0,
        require_discord: row.require_discord || 0,
        tweet_url: row.tweet_url,
        created_at: row.created_at,
        created_by: '', // Not needed for history display
      } as Raffle,
    }));
  } catch {
    return [];
  }
}

/**
 * Check if a user has connected specific social accounts
 */
export function checkSocialConnections(walletAddress: string): {
  hasDiscord: boolean;
  hasX: boolean;
  discord?: { username: string; platform_user_id: string };
  x?: { username: string; platform_user_id: string };
} {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  try {
    const stmt = db.prepare(`
      SELECT platform, username, platform_user_id
      FROM social_connections
      WHERE wallet_address = ?
    `);
    
    const connections = stmt.all(normalizedAddress) as Array<{
      platform: string;
      username: string;
      platform_user_id: string;
    }>;
    
    const discord = connections.find(c => c.platform === 'discord');
    const x = connections.find(c => c.platform === 'x');
    
    return {
      hasDiscord: !!discord,
      hasX: !!x,
      discord: discord ? { username: discord.username, platform_user_id: discord.platform_user_id } : undefined,
      x: x ? { username: x.username, platform_user_id: x.platform_user_id } : undefined,
    };
  } catch {
    return { hasDiscord: false, hasX: false };
  }
}

/**
 * Get raffle entries for CSV export (admin function)
 */
export function getRaffleEntriesForExport(raffleId: string): Array<{
  wallet_address: string;
  display_name: string | null;
  tier: string;
  entries_count: number;
  star_count: number;
  engagement_bonus: number;
  discord_bonus: number;
  entered_at: string;
  discord_username: string | null;
  x_username: string | null;
}> {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT 
        e.wallet_address,
        p.display_name,
        e.tier,
        e.entries_count,
        e.star_count,
        e.engagement_bonus,
        e.discord_bonus,
        e.entered_at,
        sd.username as discord_username,
        sx.username as x_username
      FROM raffle_entries e
      LEFT JOIN user_profiles p ON e.wallet_address = p.wallet_address
      LEFT JOIN social_connections sd ON e.wallet_address = sd.wallet_address AND sd.platform = 'discord'
      LEFT JOIN social_connections sx ON e.wallet_address = sx.wallet_address AND sx.platform = 'x'
      WHERE e.raffle_id = ?
      ORDER BY e.entered_at ASC
    `);
    
    return stmt.all(raffleId) as Array<{
      wallet_address: string;
      display_name: string | null;
      tier: string;
      entries_count: number;
      star_count: number;
      engagement_bonus: number;
      discord_bonus: number;
      entered_at: string;
      discord_username: string | null;
      x_username: string | null;
    }>;
  } catch {
    return [];
  }
}

// ============================================================================
// Admin Database Functions
// ============================================================================

/**
 * Get all user profiles with social connections (admin function)
 */
export function getAllUsersWithSocialConnections(options?: {
  limit?: number;
  offset?: number;
  search?: string;
}): Array<{
  wallet_address: string;
  display_name: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
  discord_username: string | null;
  discord_user_id: string | null;
  x_username: string | null;
  x_user_id: string | null;
  total_xp: number;
  level: number;
}> {
  const db = getDatabase();
  const limit = options?.limit || 100;
  const offset = options?.offset || 0;
  
  try {
    let query = `
      SELECT 
        p.wallet_address,
        p.display_name,
        p.bio,
        p.created_at,
        p.updated_at,
        sd.username as discord_username,
        sd.platform_user_id as discord_user_id,
        sx.username as x_username,
        sx.platform_user_id as x_user_id,
        COALESCE(x.total_xp, 0) as total_xp,
        COALESCE(x.level, 1) as level
      FROM user_profiles p
      LEFT JOIN social_connections sd ON p.wallet_address = sd.wallet_address AND sd.platform = 'discord'
      LEFT JOIN social_connections sx ON p.wallet_address = sx.wallet_address AND sx.platform = 'x'
      LEFT JOIN user_xp x ON p.wallet_address = x.wallet_address
    `;
    
    const params: (string | number)[] = [];
    
    if (options?.search) {
      query += ` WHERE p.wallet_address LIKE ? OR p.display_name LIKE ? OR sd.username LIKE ? OR sx.username LIKE ?`;
      const searchPattern = `%${options.search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    query += ` ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const stmt = db.prepare(query);
    return stmt.all(...params) as Array<{
      wallet_address: string;
      display_name: string | null;
      bio: string | null;
      created_at: string;
      updated_at: string;
      discord_username: string | null;
      discord_user_id: string | null;
      x_username: string | null;
      x_user_id: string | null;
      total_xp: number;
      level: number;
    }>;
  } catch (error) {
    console.error('Error getting all users:', error);
    return [];
  }
}

/**
 * Get total count of users
 */
export function getUserCount(): number {
  const db = getDatabase();
  try {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM user_profiles');
    const result = stmt.get() as { count: number };
    return result.count;
  } catch {
    return 0;
  }
}

/**
 * Get all notifications (admin function for viewing notification history)
 */
export function getAllNotifications(options?: {
  limit?: number;
  offset?: number;
  type?: NotificationType;
}): Notification[] {
  const db = getDatabase();
  const limit = options?.limit || 100;
  const offset = options?.offset || 0;
  
  try {
    let query = 'SELECT * FROM notifications';
    const params: (string | number)[] = [];
    
    if (options?.type) {
      query += ' WHERE type = ?';
      params.push(options.type);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const stmt = db.prepare(query);
    return stmt.all(...params) as Notification[];
  } catch {
    return [];
  }
}

/**
 * Get total count of notifications
 */
export function getNotificationCount(): number {
  const db = getDatabase();
  try {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM notifications');
    const result = stmt.get() as { count: number };
    return result.count;
  } catch {
    return 0;
  }
}

/**
 * Update an existing notification (admin function)
 */
export function updateNotification(
  notificationId: number,
  data: {
    title?: string;
    message?: string;
    type?: NotificationType;
    icon?: string;
    link?: string | null;
  }
): Notification | null {
  const db = getDatabase();
  
  try {
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    
    if (data.title !== undefined) {
      updates.push('title = ?');
      params.push(data.title);
    }
    if (data.message !== undefined) {
      updates.push('message = ?');
      params.push(data.message);
    }
    if (data.type !== undefined) {
      updates.push('type = ?');
      params.push(data.type);
    }
    if (data.icon !== undefined) {
      updates.push('icon = ?');
      params.push(data.icon);
    }
    if (data.link !== undefined) {
      updates.push('link = ?');
      params.push(data.link);
    }
    
    if (updates.length === 0) {
      return null;
    }
    
    params.push(notificationId);
    
    const stmt = db.prepare(`
      UPDATE notifications 
      SET ${updates.join(', ')}
      WHERE id = ?
    `);
    
    stmt.run(...params);
    
    const getStmt = db.prepare('SELECT * FROM notifications WHERE id = ?');
    return getStmt.get(notificationId) as Notification | null;
  } catch (error) {
    console.error('Error updating notification:', error);
    return null;
  }
}

/**
 * Get database statistics (admin function)
 */
export function getDatabaseStats(): {
  users: number;
  notifications: number;
  chatMessages: number;
  raffles: number;
  raffleEntries: number;
  friends: number;
  directMessages: number;
  voiceSessions: number;
  socialConnections: number;
} {
  const db = getDatabase();
  
  try {
    const counts = {
      users: (db.prepare('SELECT COUNT(*) as count FROM user_profiles').get() as { count: number }).count,
      notifications: (db.prepare('SELECT COUNT(*) as count FROM notifications').get() as { count: number }).count,
      chatMessages: (db.prepare('SELECT COUNT(*) as count FROM chat_messages').get() as { count: number }).count,
      raffles: 0,
      raffleEntries: 0,
      friends: (db.prepare('SELECT COUNT(*) as count FROM friends').get() as { count: number }).count,
      directMessages: (db.prepare('SELECT COUNT(*) as count FROM direct_messages').get() as { count: number }).count,
      voiceSessions: (db.prepare('SELECT COUNT(*) as count FROM voice_sessions').get() as { count: number }).count,
      socialConnections: (db.prepare('SELECT COUNT(*) as count FROM social_connections').get() as { count: number }).count,
    };
    
    // These tables might not exist
    try {
      counts.raffles = (db.prepare('SELECT COUNT(*) as count FROM raffles').get() as { count: number }).count;
    } catch { /* table might not exist */ }
    try {
      counts.raffleEntries = (db.prepare('SELECT COUNT(*) as count FROM raffle_entries').get() as { count: number }).count;
    } catch { /* table might not exist */ }
    
    return counts;
  } catch (error) {
    console.error('Error getting database stats:', error);
    return {
      users: 0,
      notifications: 0,
      chatMessages: 0,
      raffles: 0,
      raffleEntries: 0,
      friends: 0,
      directMessages: 0,
      voiceSessions: 0,
      socialConnections: 0,
    };
  }
}

/**
 * Clean up old chat messages (admin function)
 */
export function cleanupChatMessages(olderThanHours: number = 24): number {
  const db = getDatabase();
  try {
    const stmt = db.prepare(`
      DELETE FROM chat_messages 
      WHERE datetime(created_at) < datetime('now', '-' || ? || ' hours')
    `);
    const result = stmt.run(olderThanHours);
    return result.changes;
  } catch {
    return 0;
  }
}

/**
 * Clean up stale online presence (admin function)
 */
export function cleanupOnlinePresence(olderThanMinutes: number = 10): number {
  const db = getDatabase();
  try {
    const stmt = db.prepare(`
      DELETE FROM online_presence 
      WHERE datetime(last_seen) < datetime('now', '-' || ? || ' minutes')
    `);
    const result = stmt.run(olderThanMinutes);
    return result.changes;
  } catch {
    return 0;
  }
}

/**
 * Clean up old direct messages (admin function)
 */
export function cleanupDirectMessages(olderThanDays: number = 90): number {
  const db = getDatabase();
  try {
    const stmt = db.prepare(`
      DELETE FROM direct_messages 
      WHERE datetime(created_at) < datetime('now', '-' || ? || ' days')
    `);
    const result = stmt.run(olderThanDays);
    return result.changes;
  } catch {
    return 0;
  }
}

/**
 * Clean up old raffle result views (admin function)
 */
export function cleanupRaffleResultViews(olderThanDays: number = 30): number {
  const db = getDatabase();
  try {
    const stmt = db.prepare(`
      DELETE FROM raffle_result_views 
      WHERE datetime(viewed_at) < datetime('now', '-' || ? || ' days')
    `);
    const result = stmt.run(olderThanDays);
    return result.changes;
  } catch {
    return 0;
  }
}

/**
 * Get drawn raffles with winners (admin function)
 */
export function getDrawnRaffles(limit: number = 20): Raffle[] {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT * FROM raffles 
      WHERE status = 'drawn' AND winner_address IS NOT NULL
      ORDER BY winner_drawn_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as Raffle[];
  } catch {
    return [];
  }
}

/**
 * Get raffle winner with full user details (admin function)
 */
export function getRaffleWinnerDetails(walletAddress: string): {
  wallet_address: string;
  display_name: string | null;
  bio: string | null;
  discord_username: string | null;
  discord_user_id: string | null;
  x_username: string | null;
  x_user_id: string | null;
  total_xp: number;
  level: number;
  created_at: string;
} | null {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT 
        COALESCE(p.wallet_address, ?) as wallet_address,
        p.display_name,
        p.bio,
        sd.username as discord_username,
        sd.platform_user_id as discord_user_id,
        sx.username as x_username,
        sx.platform_user_id as x_user_id,
        COALESCE(x.total_xp, 0) as total_xp,
        COALESCE(x.level, 1) as level,
        COALESCE(p.created_at, datetime('now')) as created_at
      FROM (SELECT ? as addr) t
      LEFT JOIN user_profiles p ON p.wallet_address = t.addr
      LEFT JOIN social_connections sd ON t.addr = sd.wallet_address AND sd.platform = 'discord'
      LEFT JOIN social_connections sx ON t.addr = sx.wallet_address AND sx.platform = 'x'
      LEFT JOIN user_xp x ON t.addr = x.wallet_address
    `);
    
    const result = stmt.get(walletAddress.toLowerCase(), walletAddress.toLowerCase());
    return result as {
      wallet_address: string;
      display_name: string | null;
      bio: string | null;
      discord_username: string | null;
      discord_user_id: string | null;
      x_username: string | null;
      x_user_id: string | null;
      total_xp: number;
      level: number;
      created_at: string;
    } | null;
  } catch (error) {
    console.error('Error getting raffle winner details:', error);
    return null;
  }
}

// ============================================================================
// Governance System Database Functions (Web2 Style)
// ============================================================================

export type ProposalStateDB = 'pending' | 'active' | 'defeated' | 'succeeded' | 'executed' | 'cancelled';

export interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  proposer_address: string;
  proposer_display_name?: string | null;
  state: ProposalStateDB;
  for_votes: number;
  against_votes: number;
  abstain_votes: number;
  quorum: number;
  unique_voter_count: number;
  min_voters: number;
  yes_threshold_percent: number;
  max_abstain_percent: number;
  category: ProposalCategory;
  forum_thread_id: string | null;
  defeat_reason: string | null;
  voting_duration_weeks: number;
  start_time: string | null;
  end_time: string | null;
  snapshot_block: number | null; // Block number for snapshot-based voting power
  created_at: string;
  executed_at: string | null;
  cancelled_at: string | null;
}

export interface GovernanceVote {
  id: number;
  proposal_id: string;
  voter_address: string;
  voter_display_name?: string | null;
  support: number; // 0 = No, 1 = Yes, 2 = Abstain
  voting_power: number;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export type ProposalCategory = 'treasury' | 'community' | 'technical' | 'governance' | 'general';

// Category metadata
export const PROPOSAL_CATEGORIES = {
  treasury: { label: 'Treasury', icon: '💰', description: 'Fund allocation requests' },
  community: { label: 'Community', icon: '🎉', description: 'Events, partnerships, contests' },
  technical: { label: 'Technical', icon: '⚙️', description: 'Contract/site changes' },
  governance: { label: 'Governance', icon: '📜', description: 'Rule changes (quorum, voting periods)' },
  general: { label: 'General', icon: '📋', description: 'Anything else' },
} as const;

/**
 * Get current block number from blockchain
 * Used for snapshot-based voting power calculation
 */
async function getCurrentBlockNumber(): Promise<number> {
  try {
    const client = await getResilientClient();
    const block = await client.getBlockNumber();
    return Number(block);
  } catch (error) {
    console.error('Failed to get current block number:', error);
    // Return 0 as fallback - proposals without snapshot_block will use real-time voting power
    return 0;
  }
}

/**
 * Create a new governance proposal
 */
export async function createGovernanceProposal(data: {
  title: string;
  description: string;
  proposerAddress: string;
  votingDurationWeeks?: number;
  quorum?: number;
  category?: ProposalCategory;
}): Promise<GovernanceProposal> {
  const db = getDatabase();
  
  const id = `prop-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date();
  const endTime = new Date(now.getTime() + (data.votingDurationWeeks || 1) * 7 * 24 * 60 * 60 * 1000);
  
  // Capture current block number for snapshot-based voting
  const snapshotBlock = await getCurrentBlockNumber();
  
  const stmt = db.prepare(`
    INSERT INTO governance_proposals (
      id, title, description, proposer_address, state, 
      voting_duration_weeks, quorum, category, start_time, end_time, snapshot_block
    )
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    data.title,
    data.description,
    data.proposerAddress.toLowerCase(),
    data.votingDurationWeeks || 1,
    data.quorum || 10,
    data.category || 'general',
    now.toISOString(),
    endTime.toISOString(),
    snapshotBlock
  );
  
  const getStmt = db.prepare('SELECT * FROM governance_proposals WHERE id = ?');
  return getStmt.get(id) as GovernanceProposal;
}

/**
 * Determine proposal outcome based on enhanced quorum rules
 */
function determineProposalOutcome(proposal: GovernanceProposal): { 
  newState: ProposalStateDB; 
  defeatReason?: string;
} {
  const totalVotes = proposal.for_votes + proposal.against_votes + proposal.abstain_votes;
  const uniqueVoters = proposal.unique_voter_count;
  
  // Rule 1: Minimum unique voters required
  if (uniqueVoters < proposal.min_voters) {
    return { 
      newState: 'defeated', 
      defeatReason: `Did not reach minimum voter count (${uniqueVoters}/${proposal.min_voters})`
    };
  }
  
  // If no votes at all, defeat
  if (totalVotes === 0) {
    return { 
      newState: 'defeated', 
      defeatReason: 'No votes cast'
    };
  }
  
  // Rule 2: Abstain cannot exceed max threshold
  const abstainPercent = (proposal.abstain_votes / totalVotes) * 100;
  if (abstainPercent > proposal.max_abstain_percent) {
    return { 
      newState: 'defeated', 
      defeatReason: `Too many abstain votes (${abstainPercent.toFixed(1)}% > ${proposal.max_abstain_percent}%)`
    };
  }
  
  // Rule 3: Yes must be ≥ threshold % of all votes
  const yesPercent = (proposal.for_votes / totalVotes) * 100;
  if (yesPercent >= proposal.yes_threshold_percent) {
    return { newState: 'succeeded' };
  }
  
  return { 
    newState: 'defeated', 
    defeatReason: `Did not reach ${proposal.yes_threshold_percent}% approval (${yesPercent.toFixed(1)}%)`
  };
}

/**
 * Get all governance proposals
 */
export function getGovernanceProposals(options?: {
  state?: ProposalStateDB;
  limit?: number;
  offset?: number;
}): GovernanceProposal[] {
  const db = getDatabase();
  const limit = options?.limit || 100;
  const offset = options?.offset || 0;
  
  try {
    let query = `
      SELECT 
        gp.*,
        p.display_name as proposer_display_name
      FROM governance_proposals gp
      LEFT JOIN user_profiles p ON LOWER(gp.proposer_address) = LOWER(p.wallet_address)
    `;
    const params: (string | number)[] = [];
    
    if (options?.state) {
      query += ' WHERE gp.state = ?';
      params.push(options.state);
    }
    
    query += ' ORDER BY gp.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const stmt = db.prepare(query);
    const proposals = stmt.all(...params) as GovernanceProposal[];
    
    // Check if any active proposals have expired and update their state
    const now = new Date();
    for (const proposal of proposals) {
      if (proposal.state === 'active' && proposal.end_time) {
        const endTime = new Date(proposal.end_time);
        if (now > endTime) {
          // Auto-update expired proposals with enhanced quorum logic
          const { newState, defeatReason } = determineProposalOutcome(proposal);
          updateGovernanceProposalState(proposal.id, newState, defeatReason);
          proposal.state = newState;
          if (defeatReason) {
            proposal.defeat_reason = defeatReason;
          }
        }
      }
    }
    
    return proposals;
  } catch (error) {
    console.error('Error getting governance proposals:', error);
    return [];
  }
}

/**
 * Get a single governance proposal by ID
 */
export function getGovernanceProposalById(proposalId: string): GovernanceProposal | null {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT 
        gp.*,
        p.display_name as proposer_display_name
      FROM governance_proposals gp
      LEFT JOIN user_profiles p ON LOWER(gp.proposer_address) = LOWER(p.wallet_address)
      WHERE gp.id = ?
    `);
    const proposal = stmt.get(proposalId) as GovernanceProposal | undefined;
    
    if (proposal && proposal.state === 'active' && proposal.end_time) {
      const now = new Date();
      const endTime = new Date(proposal.end_time);
      if (now > endTime) {
        const { newState, defeatReason } = determineProposalOutcome(proposal);
        updateGovernanceProposalState(proposal.id, newState, defeatReason);
        proposal.state = newState;
        if (defeatReason) {
          proposal.defeat_reason = defeatReason;
        }
      }
    }
    
    return proposal || null;
  } catch {
    return null;
  }
}

/**
 * Update governance proposal state
 */
export function updateGovernanceProposalState(
  proposalId: string, 
  newState: ProposalStateDB,
  defeatReason?: string
): boolean {
  const db = getDatabase();
  
  try {
    let query = 'UPDATE governance_proposals SET state = ?';
    const params: (string | null)[] = [newState];
    
    if (newState === 'executed') {
      query += ', executed_at = ?';
      params.push(new Date().toISOString());
    } else if (newState === 'cancelled') {
      query += ', cancelled_at = ?';
      params.push(new Date().toISOString());
    }
    
    query += ' WHERE id = ?';
    params.push(proposalId);
    
    const stmt = db.prepare(query);
    const result = stmt.run(...params);
    return result.changes > 0;
  } catch {
    return false;
  }
}

/**
 * Link a forum thread to a governance proposal
 */
export function linkForumThreadToProposal(
  proposalId: string,
  forumThreadId: string
): boolean {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare('UPDATE governance_proposals SET forum_thread_id = ? WHERE id = ?');
    const result = stmt.run(forumThreadId, proposalId);
    return result.changes > 0;
  } catch {
    return false;
  }
}

/**
 * Cast a vote on a governance proposal
 * Returns error if user already voted
 * 
 * Optionally includes cryptographic signature for vote verification.
 * Supports both EIP-712 (new) and EIP-191 (legacy) signatures.
 */
export function castGovernanceVote(data: {
  proposalId: string;
  voterAddress: string;
  support: number | boolean; // 0/1/2 or false/true (backward compat)
  votingPower: number;
  reason?: string;
  // Cryptographic signature data (optional but recommended for verifiability)
  signature?: string;
  signatureVersion?: 'eip712' | 'eip191';
  signatureData?: {
    message?: string; // EIP-191 only
    timestamp: number;
    nonce: string;
    typedData?: Record<string, unknown>; // EIP-712 only (JSON stringified)
  };
}): { success: boolean; error?: string; vote?: GovernanceVote } {
  const db = getDatabase();
  
  try {
    // Check if proposal exists and is active
    const proposal = getGovernanceProposalById(data.proposalId);
    if (!proposal) {
      return { success: false, error: 'Proposal not found' };
    }
    if (proposal.state !== 'active') {
      return { success: false, error: 'Proposal is not active for voting' };
    }
    
    // Check if user already voted
    const checkStmt = db.prepare('SELECT id FROM governance_votes WHERE proposal_id = ? AND voter_address = ?');
    const existingVote = checkStmt.get(data.proposalId, data.voterAddress.toLowerCase());
    if (existingVote) {
      return { success: false, error: 'You have already voted on this proposal' };
    }
    
    // Convert support to number (0=No, 1=Yes, 2=Abstain)
    let supportValue: number;
    if (typeof data.support === 'boolean') {
      supportValue = data.support ? 1 : 0;
    } else {
      supportValue = data.support;
    }
    
    // Validate support value
    if (![0, 1, 2].includes(supportValue)) {
      return { success: false, error: 'Invalid support value. Must be 0 (No), 1 (Yes), or 2 (Abstain)' };
    }
    
    // Determine signature version (default to eip712 if signature provided without version)
    const signatureVersion = data.signatureVersion || (data.signature ? 'eip712' : null);
    
    // Insert vote with optional signature data
    const insertStmt = db.prepare(`
      INSERT INTO governance_votes (
        proposal_id, voter_address, support, voting_power, reason,
        signature, signature_message, signature_timestamp, signature_nonce,
        signature_version, signature_typed_data
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insertStmt.run(
      data.proposalId,
      data.voterAddress.toLowerCase(),
      supportValue,
      data.votingPower,
      data.reason || null,
      data.signature || null,
      data.signatureData?.message || null,
      data.signatureData?.timestamp || null,
      data.signatureData?.nonce || null,
      signatureVersion || 'eip191', // Default to eip191 for backward compat
      data.signatureData?.typedData ? JSON.stringify(data.signatureData.typedData) : null
    );
    
    // Update proposal vote counts and unique voter count
    let updateQuery: string;
    if (supportValue === 1) {
      updateQuery = 'UPDATE governance_proposals SET for_votes = for_votes + ?, unique_voter_count = unique_voter_count + 1 WHERE id = ?';
    } else if (supportValue === 0) {
      updateQuery = 'UPDATE governance_proposals SET against_votes = against_votes + ?, unique_voter_count = unique_voter_count + 1 WHERE id = ?';
    } else {
      updateQuery = 'UPDATE governance_proposals SET abstain_votes = abstain_votes + ?, unique_voter_count = unique_voter_count + 1 WHERE id = ?';
    }
    const updateStmt = db.prepare(updateQuery);
    updateStmt.run(data.votingPower, data.proposalId);
    
    // Get the inserted vote
    const getStmt = db.prepare('SELECT * FROM governance_votes WHERE id = ?');
    const vote = getStmt.get(result.lastInsertRowid) as GovernanceVote;
    
    return { success: true, vote };
  } catch (error) {
    console.error('Error casting governance vote:', error);
    return { success: false, error: 'Failed to cast vote' };
  }
}

/**
 * Change a vote within the 24-hour window
 */
export function changeGovernanceVote(data: {
  proposalId: string;
  voterAddress: string;
  newSupport: number; // 0=No, 1=Yes, 2=Abstain
  votingPower: number;
  reason?: string;
}): { success: boolean; error?: string; vote?: GovernanceVote } {
  const db = getDatabase();
  
  try {
    // Check if proposal exists and is active
    const proposal = getGovernanceProposalById(data.proposalId);
    if (!proposal) {
      return { success: false, error: 'Proposal not found' };
    }
    if (proposal.state !== 'active') {
      return { success: false, error: 'Proposal is not active for voting' };
    }
    
    // Check if user has voted
    const existingVoteStmt = db.prepare('SELECT * FROM governance_votes WHERE proposal_id = ? AND voter_address = ?');
    const existingVote = existingVoteStmt.get(data.proposalId, data.voterAddress.toLowerCase()) as GovernanceVote | undefined;
    
    if (!existingVote) {
      return { success: false, error: 'You have not voted on this proposal yet' };
    }
    
    // Check 24-hour window
    if (!proposal.start_time) {
      return { success: false, error: 'Proposal start time not set' };
    }
    
    const startTime = new Date(proposal.start_time).getTime();
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    if ((now - startTime) > twentyFourHours) {
      return { success: false, error: 'Vote change window has expired (24 hours after proposal start)' };
    }
    
    // Validate new support value
    if (![0, 1, 2].includes(data.newSupport)) {
      return { success: false, error: 'Invalid support value. Must be 0 (No), 1 (Yes), or 2 (Abstain)' };
    }
    
    // If vote hasn't changed, return success
    if (existingVote.support === data.newSupport) {
      return { success: true, vote: existingVote };
    }
    
    // Update vote
    const updateVoteStmt = db.prepare(`
      UPDATE governance_votes 
      SET support = ?, reason = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    updateVoteStmt.run(data.newSupport, data.reason || existingVote.reason, existingVote.id);
    
    // Update proposal vote counts - decrement old vote, increment new vote
    const oldSupport = existingVote.support;
    const votingPower = existingVote.voting_power;
    
    // Decrement old vote count
    if (oldSupport === 1) {
      db.prepare('UPDATE governance_proposals SET for_votes = for_votes - ? WHERE id = ?').run(votingPower, data.proposalId);
    } else if (oldSupport === 0) {
      db.prepare('UPDATE governance_proposals SET against_votes = against_votes - ? WHERE id = ?').run(votingPower, data.proposalId);
    } else {
      db.prepare('UPDATE governance_proposals SET abstain_votes = abstain_votes - ? WHERE id = ?').run(votingPower, data.proposalId);
    }
    
    // Increment new vote count
    if (data.newSupport === 1) {
      db.prepare('UPDATE governance_proposals SET for_votes = for_votes + ? WHERE id = ?').run(votingPower, data.proposalId);
    } else if (data.newSupport === 0) {
      db.prepare('UPDATE governance_proposals SET against_votes = against_votes + ? WHERE id = ?').run(votingPower, data.proposalId);
    } else {
      db.prepare('UPDATE governance_proposals SET abstain_votes = abstain_votes + ? WHERE id = ?').run(votingPower, data.proposalId);
    }
    
    // Get updated vote
    const getStmt = db.prepare('SELECT * FROM governance_votes WHERE id = ?');
    const vote = getStmt.get(existingVote.id) as GovernanceVote;
    
    return { success: true, vote };
  } catch (error) {
    console.error('Error changing governance vote:', error);
    return { success: false, error: 'Failed to change vote' };
  }
}

/**
 * Check if vote can be changed (within 24-hour window)
 */
export function canChangeVote(proposalId: string): { allowed: boolean; reason?: string; hoursRemaining?: number } {
  const db = getDatabase();
  
  try {
    const proposal = getGovernanceProposalById(proposalId);
    if (!proposal) {
      return { allowed: false, reason: 'Proposal not found' };
    }
    
    if (proposal.state !== 'active') {
      return { allowed: false, reason: 'Proposal is not active' };
    }
    
    if (!proposal.start_time) {
      return { allowed: false, reason: 'Proposal start time not set' };
    }
    
    const startTime = new Date(proposal.start_time).getTime();
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const elapsed = now - startTime;
    
    if (elapsed > twentyFourHours) {
      return { allowed: false, reason: 'Vote change window expired' };
    }
    
    const hoursRemaining = Math.max(0, (twentyFourHours - elapsed) / (60 * 60 * 1000));
    return { allowed: true, hoursRemaining };
  } catch {
    return { allowed: false, reason: 'Error checking vote change eligibility' };
  }
}

/**
 * Cancel a proposal (proposer only, before 48-hour lockout)
 */
export function cancelGovernanceProposal(
  proposalId: string,
  userAddress: string
): { success: boolean; error?: string } {
  const db = getDatabase();
  
  try {
    const proposal = getGovernanceProposalById(proposalId);
    if (!proposal) {
      return { success: false, error: 'Proposal not found' };
    }
    
    // Check if user is the proposer
    if (proposal.proposer_address.toLowerCase() !== userAddress.toLowerCase()) {
      return { success: false, error: 'Only the proposer can cancel this proposal' };
    }
    
    // Check if proposal is in a cancelable state
    if (!['pending', 'active'].includes(proposal.state)) {
      return { success: false, error: 'Proposal has already concluded' };
    }
    
    // Check 48-hour lockout
    if (!proposal.end_time) {
      return { success: false, error: 'Proposal end time not set' };
    }
    
    const endTime = new Date(proposal.end_time).getTime();
    const now = Date.now();
    const fortyEightHours = 48 * 60 * 60 * 1000;
    
    if ((endTime - now) < fortyEightHours) {
      return { success: false, error: 'Cannot cancel with less than 48 hours remaining' };
    }
    
    // Cancel the proposal
    const result = updateGovernanceProposalState(proposalId, 'cancelled');
    if (!result) {
      return { success: false, error: 'Failed to cancel proposal' };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error cancelling governance proposal:', error);
    return { success: false, error: 'Failed to cancel proposal' };
  }
}

/**
 * Check if proposer can cancel proposal
 */
export function canProposerCancelProposal(
  proposalId: string,
  userAddress: string
): { allowed: boolean; reason?: string; hoursUntilLockout?: number } {
  const db = getDatabase();
  
  try {
    const proposal = getGovernanceProposalById(proposalId);
    if (!proposal) {
      return { allowed: false, reason: 'Proposal not found' };
    }
    
    if (proposal.proposer_address.toLowerCase() !== userAddress.toLowerCase()) {
      return { allowed: false, reason: 'Only the proposer can cancel' };
    }
    
    if (!['pending', 'active'].includes(proposal.state)) {
      return { allowed: false, reason: 'Proposal already concluded' };
    }
    
    if (!proposal.end_time) {
      return { allowed: false, reason: 'Proposal end time not set' };
    }
    
    const endTime = new Date(proposal.end_time).getTime();
    const now = Date.now();
    const fortyEightHours = 48 * 60 * 60 * 1000;
    const remaining = endTime - now;
    
    if (remaining < fortyEightHours) {
      return { allowed: false, reason: 'Less than 48 hours remaining' };
    }
    
    const hoursUntilLockout = Math.max(0, (remaining - fortyEightHours) / (60 * 60 * 1000));
    return { allowed: true, hoursUntilLockout };
  } catch {
    return { allowed: false, reason: 'Error checking cancellation eligibility' };
  }
}

/**
 * Get votes for a proposal
 */
export function getGovernanceVotes(proposalId: string): GovernanceVote[] {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT 
        gv.*,
        p.display_name as voter_display_name
      FROM governance_votes gv
      LEFT JOIN user_profiles p ON LOWER(gv.voter_address) = LOWER(p.wallet_address)
      WHERE gv.proposal_id = ? 
      ORDER BY gv.created_at DESC
    `);
    return stmt.all(proposalId) as GovernanceVote[];
  } catch {
    return [];
  }
}

/**
 * Check if user has voted on a proposal
 */
export function hasUserVotedOnProposal(proposalId: string, voterAddress: string): boolean {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare('SELECT id FROM governance_votes WHERE proposal_id = ? AND voter_address = ?');
    const result = stmt.get(proposalId, voterAddress.toLowerCase());
    return !!result;
  } catch {
    return false;
  }
}

/**
 * Get user's vote on a proposal
 */
export function getUserVoteOnProposal(proposalId: string, voterAddress: string): GovernanceVote | null {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare('SELECT * FROM governance_votes WHERE proposal_id = ? AND voter_address = ?');
    return stmt.get(proposalId, voterAddress.toLowerCase()) as GovernanceVote | null;
  } catch {
    return null;
  }
}

// ============================================================================
// Governance Nonce Management (Security Enhancement)
// ============================================================================

/**
 * Nonce expiration time in minutes
 */
const NONCE_EXPIRATION_MINUTES = 10;

export interface GovernanceNonce {
  id: number;
  nonce: string;
  proposal_id: string;
  voter_address: string;
  status: 'issued' | 'consumed' | 'expired';
  issued_at: string;
  expires_at: string;
  consumed_at: string | null;
}

/**
 * Issue a new server-generated nonce for vote signing
 * Nonces are cryptographically random and single-use
 */
export function issueGovernanceNonce(proposalId: string, voterAddress: string): GovernanceNonce {
  const db = getDatabase();
  
  // Generate cryptographically secure nonce
  const nonce = `nonce-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + NONCE_EXPIRATION_MINUTES * 60 * 1000);
  
  // Insert nonce
  const stmt = db.prepare(`
    INSERT INTO governance_nonces (nonce, proposal_id, voter_address, status, expires_at)
    VALUES (?, ?, ?, 'issued', ?)
  `);
  
  stmt.run(nonce, proposalId, voterAddress.toLowerCase(), expiresAt.toISOString());
  
  // Retrieve the created nonce
  const getStmt = db.prepare('SELECT * FROM governance_nonces WHERE nonce = ?');
  return getStmt.get(nonce) as GovernanceNonce;
}

/**
 * Validate a nonce and mark it as consumed
 * Returns the nonce if valid, null if invalid/expired/already consumed
 */
export function consumeGovernanceNonce(
  nonce: string,
  proposalId: string,
  voterAddress: string
): GovernanceNonce | null {
  const db = getDatabase();
  
  // Find the nonce
  const stmt = db.prepare(`
    SELECT * FROM governance_nonces 
    WHERE nonce = ? 
      AND proposal_id = ? 
      AND voter_address = ?
      AND status = 'issued'
  `);
  
  const nonceRecord = stmt.get(nonce, proposalId, voterAddress.toLowerCase()) as GovernanceNonce | undefined;
  
  if (!nonceRecord) {
    return null; // Nonce not found or already consumed
  }
  
  // Check if nonce is expired
  const now = new Date();
  const expiresAt = new Date(nonceRecord.expires_at);
  if (now > expiresAt) {
    // Mark as expired
    db.prepare(`
      UPDATE governance_nonces 
      SET status = 'expired' 
      WHERE id = ?
    `).run(nonceRecord.id);
    return null;
  }
  
  // Mark as consumed
  const updateStmt = db.prepare(`
    UPDATE governance_nonces 
    SET status = 'consumed', consumed_at = ? 
    WHERE id = ?
  `);
  
  updateStmt.run(now.toISOString(), nonceRecord.id);
  
  // Return updated nonce
  const getStmt = db.prepare('SELECT * FROM governance_nonces WHERE id = ?');
  return getStmt.get(nonceRecord.id) as GovernanceNonce;
}

/**
 * Validate a nonce without consuming it
 * Returns true if nonce is valid and not expired
 */
export function validateGovernanceNonce(
  nonce: string,
  proposalId: string,
  voterAddress: string
): boolean {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT * FROM governance_nonces 
    WHERE nonce = ? 
      AND proposal_id = ? 
      AND voter_address = ?
      AND status = 'issued'
  `);
  
  const nonceRecord = stmt.get(nonce, proposalId, voterAddress.toLowerCase()) as GovernanceNonce | undefined;
  
  if (!nonceRecord) {
    return false;
  }
  
  // Check expiration
  const now = new Date();
  const expiresAt = new Date(nonceRecord.expires_at);
  return now <= expiresAt;
}

/**
 * Clean up expired nonces (should be called periodically)
 */
export function expireOldGovernanceNonces(): number {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    UPDATE governance_nonces 
    SET status = 'expired' 
    WHERE status = 'issued' AND datetime(expires_at) < datetime('now')
  `);
  
  const result = stmt.run();
  return result.changes;
}

/**
 * Get nonce by value (for debugging/admin purposes)
 */
export function getGovernanceNonceByValue(nonce: string): GovernanceNonce | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM governance_nonces WHERE nonce = ?');
  return stmt.get(nonce) as GovernanceNonce | null;
}

// ============================================================
// Admin Nonce Management (replay protection for admin auth)
// ============================================================

/**
 * Atomically claim an admin-auth nonce. Returns true on first use, false if
 * the nonce has already been consumed within its TTL window.
 * Uses INSERT OR IGNORE so concurrent requests can't both succeed.
 */
export function claimAdminNonce(nonce: string, expiresAtMs: number): boolean {
  const db = getDatabase();
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO admin_nonces (nonce, expires_at) VALUES (?, ?)'
  );
  const result = stmt.run(nonce, expiresAtMs);
  return result.changes === 1;
}

/**
 * Delete admin nonces whose TTL has elapsed. Returns count removed.
 */
export function pruneExpiredAdminNonces(nowMs: number = Date.now()): number {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM admin_nonces WHERE expires_at <= ?');
  const result = stmt.run(nowMs);
  return result.changes;
}

// ============================================================================
// Forum System Database Functions (with likes and edits)
// ============================================================================

export type ForumCategory = 'general' | 'governance' | 'proposals' | 'ideas' | 'support' | 'announcements';

export interface ForumThreadDB {
  id: string;
  title: string;
  content: string;
  original_content: string | null;
  author_address: string;
  author_display_name?: string | null;
  category: ForumCategory;
  proposal_id: string | null;
  pinned: number;
  locked: number;
  likes_count: number;
  dislikes_count: number;
  is_edited: number;
  reply_count?: number;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
}

export interface ForumReplyDB {
  id: string;
  thread_id: string;
  content: string;
  original_content: string | null;
  author_address: string;
  author_display_name?: string | null;
  likes_count: number;
  dislikes_count: number;
  is_edited: number;
  created_at: string;
  edited_at: string | null;
}

export interface ForumLike {
  id: number;
  user_address: string;
  target_id: string;
  target_type: 'thread' | 'reply';
  like_type: 'like' | 'dislike';
  created_at: string;
}

/**
 * Create a new forum thread
 */
export function createForumThread(data: {
  title: string;
  content: string;
  authorAddress: string;
  category: ForumCategory;
  proposalId?: string;
}): ForumThreadDB {
  const db = getDatabase();
  
  const id = `thread-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  
  const stmt = db.prepare(`
    INSERT INTO forum_threads (id, title, content, author_address, category, proposal_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    data.title,
    data.content,
    data.authorAddress.toLowerCase(),
    data.category,
    data.proposalId || null
  );
  
  const getStmt = db.prepare('SELECT * FROM forum_threads WHERE id = ?');
  return getStmt.get(id) as ForumThreadDB;
}

/**
 * Get all forum threads
 */
export function getForumThreads(options?: {
  category?: ForumCategory;
  limit?: number;
  offset?: number;
}): ForumThreadDB[] {
  const db = getDatabase();
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  
  try {
    let query = `
      SELECT 
        t.*,
        p.display_name as author_display_name,
        (SELECT COUNT(*) FROM forum_replies WHERE thread_id = t.id) as reply_count
      FROM forum_threads t
      LEFT JOIN user_profiles p ON LOWER(t.author_address) = LOWER(p.wallet_address)
    `;
    const params: (string | number)[] = [];
    
    if (options?.category) {
      query += ' WHERE t.category = ?';
      params.push(options.category);
    }
    
    query += ' ORDER BY t.pinned DESC, t.updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const stmt = db.prepare(query);
    return stmt.all(...params) as ForumThreadDB[];
  } catch (error) {
    console.error('Error getting forum threads:', error);
    return [];
  }
}

/**
 * Get a forum thread by ID with replies
 */
export function getForumThreadById(threadId: string): ForumThreadDB | null {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT 
        t.*,
        p.display_name as author_display_name
      FROM forum_threads t
      LEFT JOIN user_profiles p ON LOWER(t.author_address) = LOWER(p.wallet_address)
      WHERE t.id = ?
    `);
    return stmt.get(threadId) as ForumThreadDB | null;
  } catch {
    return null;
  }
}

/**
 * Get replies for a thread
 */
export function getForumReplies(threadId: string): ForumReplyDB[] {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT 
        r.*,
        p.display_name as author_display_name
      FROM forum_replies r
      LEFT JOIN user_profiles p ON LOWER(r.author_address) = LOWER(p.wallet_address)
      WHERE r.thread_id = ? 
      ORDER BY r.created_at ASC
    `);
    return stmt.all(threadId) as ForumReplyDB[];
  } catch {
    return [];
  }
}

/**
 * Add a reply to a thread
 */
export function addForumReply(data: {
  threadId: string;
  content: string;
  authorAddress: string;
}): { success: boolean; error?: string; reply?: ForumReplyDB } {
  const db = getDatabase();
  
  try {
    // Check if thread exists and is not locked
    const thread = getForumThreadById(data.threadId);
    if (!thread) {
      return { success: false, error: 'Thread not found' };
    }
    if (thread.locked) {
      return { success: false, error: 'Thread is locked' };
    }
    
    const id = `reply-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    
    const insertStmt = db.prepare(`
      INSERT INTO forum_replies (id, thread_id, content, author_address)
      VALUES (?, ?, ?, ?)
    `);
    insertStmt.run(id, data.threadId, data.content, data.authorAddress.toLowerCase());
    
    // Update thread updated_at
    const updateStmt = db.prepare('UPDATE forum_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    updateStmt.run(data.threadId);
    
    const getStmt = db.prepare('SELECT * FROM forum_replies WHERE id = ?');
    const reply = getStmt.get(id) as ForumReplyDB;
    
    return { success: true, reply };
  } catch (error) {
    console.error('Error adding forum reply:', error);
    return { success: false, error: 'Failed to add reply' };
  }
}

/**
 * Edit a forum thread (only by author)
 */
export function editForumThread(data: {
  threadId: string;
  newContent: string;
  authorAddress: string;
}): { success: boolean; error?: string; thread?: ForumThreadDB } {
  const db = getDatabase();
  
  try {
    const thread = getForumThreadById(data.threadId);
    if (!thread) {
      return { success: false, error: 'Thread not found' };
    }
    if (thread.author_address.toLowerCase() !== data.authorAddress.toLowerCase()) {
      return { success: false, error: 'Only the author can edit this thread' };
    }
    
    // Store original content if first edit
    const originalContent = thread.is_edited === 0 ? thread.content : thread.original_content;
    
    const stmt = db.prepare(`
      UPDATE forum_threads 
      SET content = ?, original_content = ?, is_edited = 1, edited_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(data.newContent, originalContent, data.threadId);
    
    const updatedThread = getForumThreadById(data.threadId);
    return { success: true, thread: updatedThread || undefined };
  } catch (error) {
    console.error('Error editing forum thread:', error);
    return { success: false, error: 'Failed to edit thread' };
  }
}

/**
 * Edit a forum reply (only by author)
 */
export function editForumReply(data: {
  replyId: string;
  newContent: string;
  authorAddress: string;
}): { success: boolean; error?: string; reply?: ForumReplyDB } {
  const db = getDatabase();
  
  try {
    const getStmt = db.prepare('SELECT * FROM forum_replies WHERE id = ?');
    const reply = getStmt.get(data.replyId) as ForumReplyDB | undefined;
    
    if (!reply) {
      return { success: false, error: 'Reply not found' };
    }
    if (reply.author_address.toLowerCase() !== data.authorAddress.toLowerCase()) {
      return { success: false, error: 'Only the author can edit this reply' };
    }
    
    // Store original content if first edit
    const originalContent = reply.is_edited === 0 ? reply.content : reply.original_content;
    
    const updateStmt = db.prepare(`
      UPDATE forum_replies 
      SET content = ?, original_content = ?, is_edited = 1, edited_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    updateStmt.run(data.newContent, originalContent, data.replyId);
    
    const updatedReply = db.prepare('SELECT * FROM forum_replies WHERE id = ?').get(data.replyId) as ForumReplyDB;
    return { success: true, reply: updatedReply };
  } catch (error) {
    console.error('Error editing forum reply:', error);
    return { success: false, error: 'Failed to edit reply' };
  }
}

/**
 * Like or dislike a thread/reply
 */
export function toggleForumLike(data: {
  userAddress: string;
  targetId: string;
  targetType: 'thread' | 'reply';
  likeType: 'like' | 'dislike';
}): { success: boolean; action: 'added' | 'removed' | 'changed'; error?: string } {
  const db = getDatabase();
  
  try {
    // Check if user already has a like/dislike on this target
    const checkStmt = db.prepare('SELECT * FROM forum_likes WHERE user_address = ? AND target_id = ? AND target_type = ?');
    const existingLike = checkStmt.get(data.userAddress.toLowerCase(), data.targetId, data.targetType) as ForumLike | undefined;
    
    const tableName = data.targetType === 'thread' ? 'forum_threads' : 'forum_replies';
    
    if (existingLike) {
      if (existingLike.like_type === data.likeType) {
        // Remove existing like/dislike
        const deleteStmt = db.prepare('DELETE FROM forum_likes WHERE id = ?');
        deleteStmt.run(existingLike.id);
        
        // Decrement count
        const column = data.likeType === 'like' ? 'likes_count' : 'dislikes_count';
        const updateStmt = db.prepare(`UPDATE ${tableName} SET ${column} = ${column} - 1 WHERE id = ?`);
        updateStmt.run(data.targetId);
        
        return { success: true, action: 'removed' };
      } else {
        // Change from like to dislike or vice versa
        const updateLikeStmt = db.prepare('UPDATE forum_likes SET like_type = ? WHERE id = ?');
        updateLikeStmt.run(data.likeType, existingLike.id);
        
        // Update counts (decrement old, increment new)
        const oldColumn = existingLike.like_type === 'like' ? 'likes_count' : 'dislikes_count';
        const newColumn = data.likeType === 'like' ? 'likes_count' : 'dislikes_count';
        const updateStmt = db.prepare(`UPDATE ${tableName} SET ${oldColumn} = ${oldColumn} - 1, ${newColumn} = ${newColumn} + 1 WHERE id = ?`);
        updateStmt.run(data.targetId);
        
        return { success: true, action: 'changed' };
      }
    } else {
      // Add new like/dislike
      const insertStmt = db.prepare(`
        INSERT INTO forum_likes (user_address, target_id, target_type, like_type)
        VALUES (?, ?, ?, ?)
      `);
      insertStmt.run(data.userAddress.toLowerCase(), data.targetId, data.targetType, data.likeType);
      
      // Increment count
      const column = data.likeType === 'like' ? 'likes_count' : 'dislikes_count';
      const updateStmt = db.prepare(`UPDATE ${tableName} SET ${column} = ${column} + 1 WHERE id = ?`);
      updateStmt.run(data.targetId);
      
      return { success: true, action: 'added' };
    }
  } catch (error) {
    console.error('Error toggling forum like:', error);
    return { success: false, action: 'added', error: 'Failed to toggle like' };
  }
}

/**
 * Get user's like status on a target
 */
export function getUserLikeStatus(userAddress: string, targetId: string, targetType: 'thread' | 'reply'): ForumLike | null {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare('SELECT * FROM forum_likes WHERE user_address = ? AND target_id = ? AND target_type = ?');
    return stmt.get(userAddress.toLowerCase(), targetId, targetType) as ForumLike | null;
  } catch {
    return null;
  }
}

/**
 * Get multiple like statuses for a user (for threads list)
 */
export function getUserLikeStatuses(userAddress: string, targetIds: string[], targetType: 'thread' | 'reply'): Map<string, ForumLike> {
  const db = getDatabase();
  const result = new Map<string, ForumLike>();

  if (targetIds.length === 0) return result;

  try {
    const placeholders = targetIds.map(() => '?').join(',');
    const stmt = db.prepare(`
      SELECT * FROM forum_likes
      WHERE user_address = ? AND target_type = ? AND target_id IN (${placeholders})
    `);
    const likes = stmt.all(userAddress.toLowerCase(), targetType, ...targetIds) as ForumLike[];

    for (const like of likes) {
      result.set(like.target_id, like);
    }

    return result;
  } catch {
    return result;
  }
}

// ============================================================
// Sanctuary — Companion, Journal, Map
// ============================================================

export interface SanctuaryCompanion {
  id: number;
  wallet_address: string;
  token_id: number;
  is_active: number;
  nickname: string | null;
  current_activity: string;
  activity_started_at: string | null;
  activity_ends_at: string | null;
  bond_score: number;
  total_interactions: number;
  equipped_cosmetics: string;
  xp: number;
  level: number;
  // V2.4 vitality stats — clamped 0–100. `is_sleeping` is queryable for HUD
  // display; `sleep_started_at` lets `interactWithCompanion` compute energy
  // recovery (+60/hour) when waking the companion or refreshing energy mid-sleep.
  hunger: number;
  happiness: number;
  energy: number;
  is_sleeping: number;
  sleep_started_at: string | null;
  // V2.5 — last time the persisted vitality snapshot was reconciled with
  // wall-clock decay. `decayStats(companion, now)` projects forward from
  // this timestamp; `tickStats` writes the projection back and bumps it.
  stats_updated_at: string | null;
  // [SWO_V2_SANCTUARY_SLEEP_DYNAMICS] — last full sleep cycle completion.
  // 24h+ without a full cycle marks the companion `Tired` (half bond gains).
  last_full_sleep_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SanctuaryCompanionWithMeta extends Omit<SanctuaryCompanion, 'level'> {
  constellation: string | null;
  aura: string | null;
  form: string | null;
  mood: string | null;
  background: string | null;
  eyes: string | null;
  hat: string | null;
  image_url: string | null;
  rarity_rank: number | null;
  attributes_json: string | null;
  // Companion-level XP/level (per-token, set by Training Grounds)
  companion_xp: number;
  companion_level: number;
  // Wallet-level XP/level (aggregate, set by user_xp table). The `level` field
  // is the wallet-wide level for backward compatibility with existing UI that
  // uses it for location unlock thresholds.
  total_xp: number;
  level: number;
}

export interface SanctuaryJournalEntry {
  id: number;
  wallet_address: string;
  token_id: number;
  entry_type: string;
  content: string;
  metadata: string;
  created_at: string;
}

export interface SanctuaryMapLocation {
  id: number;
  name: string;
  description: string | null;
  max_capacity: number;
  unlock_level: number;
  position_x: number;
  position_y: number;
}

function initializeSanctuary(database: Database.Database): void {
  const sqlPath = path.join(process.cwd(), 'scripts', 'init-sanctuary.sql');
  if (fs.existsSync(sqlPath)) {
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    database.exec(sql);
  }
  const v15Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v1.5.sql');
  if (fs.existsSync(v15Path)) {
    const sql = fs.readFileSync(v15Path, 'utf-8');
    database.exec(sql);
  }
  const v16Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v1.6.sql');
  if (fs.existsSync(v16Path)) {
    const sql = fs.readFileSync(v16Path, 'utf-8');
    database.exec(sql);
  }
  const v17Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v1.7.sql');
  if (fs.existsSync(v17Path)) {
    const sql = fs.readFileSync(v17Path, 'utf-8');
    database.exec(sql);
  }
  const v18Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v1.8.sql');
  if (fs.existsSync(v18Path)) {
    const sql = fs.readFileSync(v18Path, 'utf-8');
    database.exec(sql);
  }
  const v19Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v1.9.sql');
  if (fs.existsSync(v19Path)) {
    const sql = fs.readFileSync(v19Path, 'utf-8');
    database.exec(sql);
  }
  const v20Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.0.sql');
  if (fs.existsSync(v20Path)) {
    const sql = fs.readFileSync(v20Path, 'utf-8');
    database.exec(sql);
  }
  const v21Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.1.sql');
  if (fs.existsSync(v21Path)) {
    const sql = fs.readFileSync(v21Path, 'utf-8');
    database.exec(sql);
  }
  const v22Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.2.sql');
  if (fs.existsSync(v22Path)) {
    const sql = fs.readFileSync(v22Path, 'utf-8');
    database.exec(sql);
  }
  const v23Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.3.sql');
  if (fs.existsSync(v23Path)) {
    const sql = fs.readFileSync(v23Path, 'utf-8');
    database.exec(sql);
  }
  const v24Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.4.sql');
  if (fs.existsSync(v24Path)) {
    const sql = fs.readFileSync(v24Path, 'utf-8');
    database.exec(sql);
  }
  const v25Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.5.sql');
  if (fs.existsSync(v25Path)) {
    const sql = fs.readFileSync(v25Path, 'utf-8');
    database.exec(sql);
  }
  const v26Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.6.sql');
  if (fs.existsSync(v26Path)) {
    const sql = fs.readFileSync(v26Path, 'utf-8');
    database.exec(sql);
  }
  const v27Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.7.sql');
  if (fs.existsSync(v27Path)) {
    const sql = fs.readFileSync(v27Path, 'utf-8');
    database.exec(sql);
  }
  const v28Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.8.sql');
  if (fs.existsSync(v28Path)) {
    const sql = fs.readFileSync(v28Path, 'utf-8');
    database.exec(sql);
  }
  // V1.7: per-companion XP/level columns (Training Grounds). ALTER TABLE IF NOT
  // EXISTS is not portable across SQLite versions, so wrap in try/catch.
  try { database.exec('ALTER TABLE sanctuary_companions ADD COLUMN xp INTEGER NOT NULL DEFAULT 0'); }
  catch { /* column already exists */ }
  try { database.exec('ALTER TABLE sanctuary_companions ADD COLUMN level INTEGER NOT NULL DEFAULT 1'); }
  catch { /* column already exists */ }
  // V2.3: guided onboarding tutorial state on sanctuary_player_state.
  try { database.exec("ALTER TABLE sanctuary_player_state ADD COLUMN onboarding_step TEXT"); }
  catch { /* column already exists */ }
  try { database.exec("ALTER TABLE sanctuary_player_state ADD COLUMN onboarding_skipped INTEGER NOT NULL DEFAULT 0"); }
  catch { /* column already exists */ }
  // V2.4: companion vitality stats (hunger/happiness/energy + sleep state).
  try { database.exec('ALTER TABLE sanctuary_companions ADD COLUMN hunger INTEGER NOT NULL DEFAULT 50'); }
  catch { /* column already exists */ }
  try { database.exec('ALTER TABLE sanctuary_companions ADD COLUMN happiness INTEGER NOT NULL DEFAULT 50'); }
  catch { /* column already exists */ }
  try { database.exec('ALTER TABLE sanctuary_companions ADD COLUMN energy INTEGER NOT NULL DEFAULT 100'); }
  catch { /* column already exists */ }
  try { database.exec('ALTER TABLE sanctuary_companions ADD COLUMN is_sleeping INTEGER NOT NULL DEFAULT 0'); }
  catch { /* column already exists */ }
  try { database.exec('ALTER TABLE sanctuary_companions ADD COLUMN sleep_started_at DATETIME'); }
  catch { /* column already exists */ }
  // V2.5: tamagotchi-style decay — `stats_updated_at` lets `decayStats`
  // project current vitality from the persisted snapshot. Backfilled to
  // CURRENT_TIMESTAMP for existing rows so day-1 projections are accurate.
  try {
    database.exec('ALTER TABLE sanctuary_companions ADD COLUMN stats_updated_at DATETIME');
    database.exec('UPDATE sanctuary_companions SET stats_updated_at = CURRENT_TIMESTAMP WHERE stats_updated_at IS NULL');
  } catch { /* column already exists */ }
  // [SWO_V2_SANCTUARY_SLEEP_DYNAMICS]: track last full sleep cycle for Tired gate.
  // Backfilled to created_at so existing companions are not retroactively Tired
  // (they get their first 24h window from the moment we deploy this column).
  try {
    database.exec('ALTER TABLE sanctuary_companions ADD COLUMN last_full_sleep_at DATETIME');
    database.exec('UPDATE sanctuary_companions SET last_full_sleep_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE last_full_sleep_at IS NULL');
  } catch { /* column already exists */ }
  const rateLimitPath = path.join(process.cwd(), 'scripts', 'init-sanctuary-rate-limits.sql');
  if (fs.existsSync(rateLimitPath)) {
    const sql = fs.readFileSync(rateLimitPath, 'utf-8');
    database.exec(sql);
  }
  seedSanctuaryMapLocations(database);
  seedSanctuaryQuests(database);
  seedSkrumpeyMetadataFromCorpus(database);
  seedSanctuaryCosmeticItems(database);
}

function seedSkrumpeyMetadataFromCorpus(database: Database.Database): void {
  const count = (database.prepare('SELECT COUNT(*) as count FROM star_skrumpey_metadata').get() as { count: number }).count;
  if (count >= 3333) return;

  const corpusPath = path.join(process.cwd(), 'data', 'sanctuary', 'skrumpey_sanctuary.json');
  if (!fs.existsSync(corpusPath)) return;

  const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf-8')) as Array<{
    id: number; name: string; traits: Record<string, string>;
    traitCount: number; rarityRank: number; rarityScore: number; image: string;
  }>;

  const description = "A collection of 3,333 pixel art pfpNFTs capturing Monad's spirit. Created by melo.";

  const upsert = database.prepare(`
    INSERT INTO star_skrumpey_metadata (
      token_id, name, description, image_url,
      constellation, aura, background, eyes, form, mood,
      hat, gaze, relic, pet, fit, attitude, scene, extra, submerged,
      rarity_rank, rarity_score, trait_count, attributes_json
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?
    ) ON CONFLICT(token_id) DO UPDATE SET
      name = excluded.name, image_url = excluded.image_url,
      constellation = excluded.constellation, aura = excluded.aura,
      background = excluded.background, eyes = excluded.eyes,
      form = excluded.form, mood = excluded.mood,
      hat = excluded.hat, gaze = excluded.gaze, relic = excluded.relic,
      pet = excluded.pet, fit = excluded.fit, attitude = excluded.attitude,
      scene = excluded.scene, extra = excluded.extra, submerged = excluded.submerged,
      rarity_rank = excluded.rarity_rank, rarity_score = excluded.rarity_score,
      trait_count = excluded.trait_count, attributes_json = excluded.attributes_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  const seedAll = database.transaction(() => {
    for (const token of corpus) {
      const t = token.traits;
      upsert.run(
        token.id, token.name, description, token.image,
        t.constellation ?? null, t.aura ?? null, t.background ?? null,
        t.eyes ?? null, t.form ?? null, t.mood ?? null,
        t.hat ?? null, t.gaze ?? null, t.relic ?? null,
        t.pet ?? null, t.fit ?? null, t.attitude ?? null,
        t.scene ?? null, t.extra ?? null, t.submerged ?? null,
        token.rarityRank, token.rarityScore, token.traitCount,
        JSON.stringify(token.traits),
      );
    }
  });

  seedAll();
}

function seedSanctuaryMapLocations(database: Database.Database): void {
  const countStmt = database.prepare('SELECT COUNT(*) as count FROM sanctuary_map_locations');
  const { count } = countStmt.get() as { count: number };
  if (count > 0) return;

  // Progression pacing: 2 starter rooms unlock at L1, the rest spread across
  // L3..L15 so newcomers aren't dropped into 8 rooms of content at once. The
  // live DEV/PROD DBs already hold these values; this seed exists for fresh
  // installs / `prod→test` syncs into empty databases.
  const locations = [
    { name: 'Hot Springs', description: 'A relaxing place for tired Skrumpeys to unwind.', position_x: 0.2, position_y: 0.3, unlock_level: 1 },
    { name: 'Dream Hollow', description: 'Where Skrumpeys rest and dream of adventures.', position_x: 0.1, position_y: 0.8, unlock_level: 1 },
    { name: 'Training Grounds', description: 'Practice arena where Skrumpeys sharpen their skills.', position_x: 0.7, position_y: 0.2, unlock_level: 3 },
    { name: 'Nebula Kitchen', description: 'Cook up cosmic treats for your companion.', position_x: 0.3, position_y: 0.7, unlock_level: 5 },
    { name: 'Star Garden', description: 'A mystical garden where constellations bloom.', position_x: 0.5, position_y: 0.5, unlock_level: 7 },
    { name: 'Cosmic Library', description: 'Ancient texts and forgotten lore.', position_x: 0.8, position_y: 0.6, unlock_level: 9 },
    { name: 'Observatory', description: 'Gaze at the stars and discover hidden constellations.', position_x: 0.5, position_y: 0.1, unlock_level: 12 },
    { name: 'Aura Forge', description: 'Channel aura energy into powerful bonds.', position_x: 0.9, position_y: 0.4, unlock_level: 15 },
  ];

  const insert = database.prepare(`
    INSERT INTO sanctuary_map_locations (name, description, position_x, position_y, unlock_level)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const loc of locations) {
    insert.run(loc.name, loc.description, loc.position_x, loc.position_y, loc.unlock_level);
  }
}

export function getSanctuaryCompanion(walletAddress: string, tokenId: number): SanctuaryCompanion | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?');
  return (stmt.get(walletAddress.toLowerCase(), tokenId) as SanctuaryCompanion) || null;
}

export function getActiveCompanion(walletAddress: string): SanctuaryCompanionWithMeta | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT sc.id, sc.wallet_address, sc.token_id, sc.is_active, sc.nickname,
           sc.current_activity, sc.activity_started_at, sc.activity_ends_at,
           sc.bond_score, sc.total_interactions, sc.equipped_cosmetics,
           sc.xp, sc.level, sc.created_at, sc.updated_at,
           sc.hunger, sc.happiness, sc.energy, sc.is_sleeping, sc.sleep_started_at,
           sc.xp as companion_xp, sc.level as companion_level,
           ssm.constellation, ssm.aura, ssm.form, ssm.mood,
           ssm.background, ssm.eyes, ssm.hat, ssm.image_url,
           ssm.rarity_rank, ssm.attributes_json,
           COALESCE(ux.total_xp, 0) as total_xp,
           COALESCE(ux.level, 1) as wallet_level
    FROM sanctuary_companions sc
    LEFT JOIN star_skrumpey_metadata ssm ON sc.token_id = ssm.token_id
    LEFT JOIN user_xp ux ON sc.wallet_address = ux.wallet_address
    WHERE sc.wallet_address = ? AND sc.is_active = 1
  `);
  const row = stmt.get(walletAddress.toLowerCase()) as (SanctuaryCompanionWithMeta & { wallet_level: number }) | undefined;
  if (!row) return null;
  // Expose wallet-level level under `level` name for existing callers (SanctuaryContent
  // uses companion.level for location unlocks, which is wallet-wide progression).
  return { ...row, level: row.wallet_level } as SanctuaryCompanionWithMeta;
}

export function getAllCompanions(walletAddress: string): SanctuaryCompanionWithMeta[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT sc.id, sc.wallet_address, sc.token_id, sc.is_active, sc.nickname,
           sc.current_activity, sc.activity_started_at, sc.activity_ends_at,
           sc.bond_score, sc.total_interactions, sc.equipped_cosmetics,
           sc.xp, sc.level, sc.created_at, sc.updated_at,
           sc.hunger, sc.happiness, sc.energy, sc.is_sleeping, sc.sleep_started_at,
           sc.xp as companion_xp, sc.level as companion_level,
           ssm.constellation, ssm.aura, ssm.form, ssm.mood,
           ssm.background, ssm.eyes, ssm.hat, ssm.image_url,
           ssm.rarity_rank, ssm.attributes_json,
           COALESCE(ux.total_xp, 0) as total_xp,
           COALESCE(ux.level, 1) as wallet_level
    FROM sanctuary_companions sc
    LEFT JOIN star_skrumpey_metadata ssm ON sc.token_id = ssm.token_id
    LEFT JOIN user_xp ux ON sc.wallet_address = ux.wallet_address
    WHERE sc.wallet_address = ?
    ORDER BY sc.is_active DESC, sc.updated_at DESC
  `);
  const rows = stmt.all(walletAddress.toLowerCase()) as (SanctuaryCompanionWithMeta & { wallet_level: number })[];
  return rows.map((r) => ({ ...r, level: r.wallet_level }) as SanctuaryCompanionWithMeta);
}

export function selectCompanion(walletAddress: string, tokenId: number): SanctuaryCompanion {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    db.prepare('UPDATE sanctuary_companions SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ? AND is_active = 1')
      .run(addr);

    const existing = db.prepare('SELECT id FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?')
      .get(addr, tokenId) as { id: number } | undefined;

    if (existing) {
      db.prepare('UPDATE sanctuary_companions SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(existing.id);
    } else {
      db.prepare(`
        INSERT INTO sanctuary_companions (wallet_address, token_id, is_active, current_activity, bond_score, total_interactions)
        VALUES (?, ?, 1, 'lounging', 0.0, 0)
      `).run(addr, tokenId);

      addJournalEntry(addr, tokenId, 'system', 'Companion awakened in the Sanctuary for the first time.');
    }

    return db.prepare('SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?')
      .get(addr, tokenId) as SanctuaryCompanion;
  });

  return txn();
}

export function switchCompanion(walletAddress: string, newTokenId: number): SanctuaryCompanion {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const current = db.prepare('SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND is_active = 1')
      .get(addr) as SanctuaryCompanion | undefined;

    if (current) {
      db.prepare('UPDATE sanctuary_companions SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(current.id);
      addJournalEntry(addr, current.token_id, 'system', 'Companion resting while another takes the lead.');
    }

    const existing = db.prepare('SELECT id FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?')
      .get(addr, newTokenId) as { id: number } | undefined;

    if (existing) {
      db.prepare('UPDATE sanctuary_companions SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(existing.id);
    } else {
      db.prepare(`
        INSERT INTO sanctuary_companions (wallet_address, token_id, is_active, current_activity, bond_score, total_interactions)
        VALUES (?, ?, 1, 'lounging', 0.0, 0)
      `).run(addr, newTokenId);
    }

    addJournalEntry(addr, newTokenId, 'system', 'Companion activated as the new lead.');

    return db.prepare('SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?')
      .get(addr, newTokenId) as SanctuaryCompanion;
  });

  return txn();
}

const DAILY_INTERACTION_CAP = 15;
// `play` rewards bond like talk-equivalent; `sleep` is a state toggle and
// gives no bond/XP (it's not a social interaction).
const INTERACTION_BOND: Record<string, number> = { feed: 0.5, pet: 0.3, talk: 0.2, play: 0.4, sleep: 0 };
const INTERACTION_XP: Record<string, number> = { feed: 3, pet: 2, talk: 2, play: 3, sleep: 0 };
const STAR_HOLDER_XP_MULTIPLIER = 1.5;
const STAR_HOLDER_BOND_MULTIPLIER = 1.25;

/**
 * Result of a companion interaction. Carries the reward *breakdown* (not just
 * the new stats) so the UI can explain WHY an action paid off — preference
 * match, need-state boost, variable bonus — which is what turns flat
 * stat-bumping into a legible loop. See docs/SANCTUARY_ENGAGEMENT_PLAN.md.
 */
export interface CompanionInteractionResult {
  companion: SanctuaryCompanion;
  journal: SanctuaryJournalEntry;
  dailyRemaining: number;
  starBonus: boolean;
  /** Final bond delta applied (after preference × need × tired × diminishing). */
  bondGain: number;
  /** This Skrumpey's hidden preference for the action just performed. */
  preference: PreferenceLevel;
  /** True when the action targeted a currently-low stat (need-state boost). */
  needBoosted: boolean;
  /** Variable-reward tier rolled (floor / bonus_star / rare_trinket). */
  variableTier: VariableRewardTier;
  /** Bonus STAR minted by the variable layer (0 on a floor roll). */
  bonusStar: number;
}

function getDailyInteractionCount(db: ReturnType<typeof getDatabase>, addr: string, tokenId: number): number {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM sanctuary_journal
    WHERE wallet_address = ? AND token_id = ? AND entry_type = 'interaction'
      AND created_at >= ?
  `).get(addr, tokenId, todayStart.toISOString().replace('T', ' ').slice(0, 19)) as { count: number };
  return result.count;
}

export function interactWithCompanion(
  walletAddress: string, tokenId: number, action: CompanionStatAction,
  options?: { isStar?: boolean }
): CompanionInteractionResult {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  // Variety pool now lives in companionGreeting.journalLineForAction —
  // deterministic given (action, mood, hour-of-day bucket) so consecutive
  // interactions don't repeat the same flat phrase.

  const txn = db.transaction(() => {
    const comp = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ? AND is_active = 1'
    ).get(addr, tokenId) as SanctuaryCompanion | undefined;

    if (!comp) throw new Error('No active companion found');

    const dailyCount = getDailyInteractionCount(db, addr, tokenId);
    if (dailyCount >= DAILY_INTERACTION_CAP) {
      throw new Error('Daily interaction limit reached. Come back tomorrow!');
    }

    // First reconcile decay since the last `stats_updated_at` so the action's
    // deltas land on the projected (not stale persisted) snapshot. V2.5 —
    // [SWO_V2_COMPANION_STATS_SCHEMA].
    const now = new Date();
    const decayed = decayStats(
      {
        hunger: comp.hunger,
        happiness: comp.happiness,
        energy: comp.energy,
        stats_updated_at: comp.stats_updated_at,
        is_sleeping: comp.is_sleeping,
      },
      now,
    );

    // Compute the new vitality snapshot. This throws SleepingCompanionError
    // when a non-sleep action is attempted while is_sleeping=1 and the
    // recovered energy is still below SLEEP_BLOCK_THRESHOLD.
    const stats = applyInteractionStats(
      {
        hunger: decayed.hunger,
        happiness: decayed.happiness,
        energy: decayed.energy,
        is_sleeping: comp.is_sleeping,
        sleep_started_at: comp.sleep_started_at,
      },
      action,
      now,
    );

    const starBonus = options?.isStar ?? false;
    const baseBond = INTERACTION_BOND[action] * (starBonus ? STAR_HOLDER_BOND_MULTIPLIER : 1);

    // Engagement doctrine rule 1 — actions must differ in OUTCOME, not just
    // label. Scale the baseline by this Skrumpey's hidden per-action preference
    // (loved 4× … hated −1×) and a need-state boost (1.5× when the action
    // targets a currently-low stat, measured on the pre-action/decayed
    // snapshot). Previously unwired: every action gave a flat bond bump.
    const preference = preferenceFor(tokenId, action);
    const needBoosted = isNeedTargeted(action, {
      hunger: decayed.hunger,
      happiness: decayed.happiness,
      energy: decayed.energy,
    });
    const preferenceAdjusted = computeBondDelta({ baseline: baseBond, preference, needBoosted });

    // [SWO_V2_SANCTUARY_SLEEP_DYNAMICS] — Tired halves non-sleep bond gains.
    const tired = isCompanionTired(comp.last_full_sleep_at, now);
    // Doctrine rule 1 — diminishing returns within the daily cap so spam-tapping
    // tapers (consistency > binge). Full value on the first interaction of the
    // day, down to ~0.5× as the cap fills.
    const diminish = 1 - 0.5 * (dailyCount / DAILY_INTERACTION_CAP);
    let bondGain = applyTiredBondMultiplier(preferenceAdjusted, action, tired) * diminish;
    const xpGain = Math.round(INTERACTION_XP[action] * (starBonus ? STAR_HOLDER_XP_MULTIPLIER : 1));

    // [SWO_V2_SANCTUARY_VARIABLE_REWARDS] — doctrine rules 4 & 7: ambient bonus
    // STAR on routine interactions, always with a floor. Most taps just give
    // bond; occasionally a +STAR drop (the Neko-Atsume "gold fish"). This is
    // the primary way STAR is farmed from day-to-day care.
    const variable = rollVariableReward({ action, floorBond: bondGain });
    const variableTier = variable.tier;
    let bonusStar = variable.bonusStar;
    if (variable.tier === 'rare_trinket') {
      // v1: surface the ultra-rare branch as a small STAR windfall. Proper
      // cosmetic trinkets are a shop/gacha follow-up — minting an off-catalog
      // inventory key here would break the inventory→catalog join.
      bonusStar = STAR_EARN_RATES.interaction.max;
    }

    // Classify the sleep-state delta this action produced and apply the
    // dream-reward / early-wake economy on top of the baseline bond gain.
    const transition = classifySleepTransition({
      wasSleeping: comp.is_sleeping === 1,
      nowSleeping: stats.is_sleeping === 1,
      action,
    });
    let dreamStarGained = 0;
    let nextLastFullSleep: string | null = comp.last_full_sleep_at ?? null;
    if (transition === 'full_cycle') {
      const reward = computeDreamReward({ starBonus });
      bondGain += reward.bond;
      dreamStarGained = reward.star;
      nextLastFullSleep = toSqlDate(now);
    } else if (transition === 'early_wake') {
      const outcome = computeEarlyWakeOutcome();
      bondGain += outcome.bondDelta;
    }

    db.prepare(`
      UPDATE sanctuary_companions
      SET bond_score = MAX(MIN(bond_score + ?, 100.0), 0.0),
          total_interactions = total_interactions + 1,
          hunger = ?,
          happiness = ?,
          energy = ?,
          is_sleeping = ?,
          sleep_started_at = ?,
          stats_updated_at = ?,
          last_full_sleep_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      bondGain,
      stats.hunger,
      stats.happiness,
      stats.energy,
      stats.is_sleeping,
      stats.sleep_started_at,
      toSqlDate(now),
      nextLastFullSleep,
      comp.id,
    );

    if (xpGain > 0) addUserXP(addr, xpGain);

    // Dream reward STAR mints inside the same txn — the savepoint nesting in
    // better-sqlite3 keeps the journal entry, bond bump, and STAR ledger row
    // atomic with the interaction.
    if (transition === 'full_cycle' && dreamStarGained > 0) {
      earnStar(addr, 'dream', dreamStarGained, `token:${tokenId}`);
    }

    // Mint the variable-reward bonus STAR (if any) in the same txn.
    if (bonusStar > 0) {
      earnStar(addr, 'interaction', bonusStar, `token:${tokenId}:${variableTier}`);
    }

    const bonusTag = starBonus ? ' (Star Bonus!)' : '';
    // Seed the variety pool with the action itself — the live trait-mood is
    // not on SanctuaryCompanion (it comes from the meta view), but rotating
    // by (action × hour-of-day-bucket) is enough variety for the journal.
    const message = journalLineForAction(action, action, now.getHours());
    const journal = addJournalEntry(addr, tokenId, 'interaction', message + bonusTag,
      JSON.stringify({
        action, bond: bondGain, xp: xpGain, starBonus,
        hunger: stats.hunger, happiness: stats.happiness, energy: stats.energy,
        is_sleeping: stats.is_sleeping, woke_up: stats.woke_up,
        tired, sleep_transition: transition,
        preference, needBoosted, variableTier, bonusStar,
      }));

    // [SWO_V2_SANCTUARY_SLEEP_DYNAMICS] — annotate the journal with a
    // dedicated entry for dream rewards / early-wake penalties so the UI
    // surface (and Acceptance #2/#3) can render them distinctly.
    if (transition === 'full_cycle') {
      addJournalEntry(
        addr, tokenId, 'sleep_dynamics',
        `Drifted through a full dream cycle — felt rested and recharged. +${dreamStarGained} STAR, +1 Bond.`,
        JSON.stringify({ transition, star: dreamStarGained, bond: 1 }),
      );
    } else if (transition === 'early_wake') {
      addJournalEntry(
        addr, tokenId, 'sleep_dynamics',
        'Roused mid-dream. They blinked, a little wobbly, and the bond felt thinner. −2 Bond.',
        JSON.stringify({ transition, bondDelta: -2 }),
      );
    }

    const updated = db.prepare('SELECT * FROM sanctuary_companions WHERE id = ?')
      .get(comp.id) as SanctuaryCompanion;

    return {
      companion: updated,
      journal,
      dailyRemaining: DAILY_INTERACTION_CAP - dailyCount - 1,
      starBonus,
      bondGain,
      preference,
      needBoosted,
      variableTier,
      bonusStar,
    };
  });

  return txn();
}

/**
 * V2.5 — read-only stats projection for the GET /api/sanctuary/companion/stats
 * route. Returns the current decayed values plus the labelled needs[] without
 * mutating the persisted snapshot. Returns null when the wallet has no active
 * companion for the given token id.
 */
export function getCompanionStatsSnapshot(
  walletAddress: string,
  tokenId: number,
  now: Date = new Date(),
): { stats: DecayedStats; needs: string[]; updated_at: string | null } | null {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const comp = db.prepare(
    'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ? AND is_active = 1'
  ).get(addr, tokenId) as SanctuaryCompanion | undefined;
  if (!comp) return null;

  const stats = decayStats(
    {
      hunger: comp.hunger,
      happiness: comp.happiness,
      energy: comp.energy,
      stats_updated_at: comp.stats_updated_at,
      is_sleeping: comp.is_sleeping,
    },
    now,
  );
  return { stats, needs: computeNeeds(stats), updated_at: comp.stats_updated_at };
}

/**
 * V2.5 — converge the persisted vitality snapshot with wall-clock decay and
 * bump `stats_updated_at`. Idempotent: calling twice in the same second is a
 * no-op since the elapsed delta rounds to zero. `interactWithCompanion`
 * applies decay inline (see `decayed` snapshot above), so direct callers only
 * need this when they want to persist decay outside an interact path — e.g.
 * a background refresh job. Returns the updated row, or null when no active
 * companion exists for the wallet/token pair.
 */
export function tickStats(
  walletAddress: string,
  tokenId: number,
  now: Date = new Date(),
): SanctuaryCompanion | null {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const comp = db.prepare(
    'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ? AND is_active = 1'
  ).get(addr, tokenId) as SanctuaryCompanion | undefined;
  if (!comp) return null;

  const decayed = decayStats(
    {
      hunger: comp.hunger,
      happiness: comp.happiness,
      energy: comp.energy,
      stats_updated_at: comp.stats_updated_at,
      is_sleeping: comp.is_sleeping,
    },
    now,
  );

  db.prepare(`
    UPDATE sanctuary_companions
    SET hunger = ?, happiness = ?, energy = ?, stats_updated_at = ?
    WHERE id = ?
  `).run(decayed.hunger, decayed.happiness, decayed.energy, toSqlDate(now), comp.id);

  return db.prepare('SELECT * FROM sanctuary_companions WHERE id = ?').get(comp.id) as SanctuaryCompanion;
}

export function addJournalEntry(
  walletAddress: string, tokenId: number, entryType: string, content: string, metadata: string = '{}'
): SanctuaryJournalEntry {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO sanctuary_journal (wallet_address, token_id, entry_type, content, metadata)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(walletAddress.toLowerCase(), tokenId, entryType, content, metadata);
  return db.prepare('SELECT * FROM sanctuary_journal WHERE id = ?').get(result.lastInsertRowid) as SanctuaryJournalEntry;
}

export function getJournalEntries(walletAddress: string, tokenId: number, limit: number = 20): SanctuaryJournalEntry[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM sanctuary_journal
    WHERE wallet_address = ? AND token_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(walletAddress.toLowerCase(), tokenId, limit) as SanctuaryJournalEntry[];
}

export function getJournalEntriesPaginated(
  walletAddress: string, tokenId: number,
  options: { page?: number; limit?: number; type?: string; before?: string }
): { entries: SanctuaryJournalEntry[]; total: number; page: number; totalPages: number } {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const offset = (page - 1) * limit;

  const conditions = ['wallet_address = ?', 'token_id = ?'];
  const params: (string | number)[] = [addr, tokenId];

  if (options.type) {
    conditions.push('entry_type = ?');
    params.push(options.type);
  }
  if (options.before) {
    conditions.push('created_at < ?');
    params.push(options.before);
  }

  const where = conditions.join(' AND ');

  const total = (db.prepare(`SELECT COUNT(*) as count FROM sanctuary_journal WHERE ${where}`).get(...params) as { count: number }).count;

  const entries = db.prepare(`
    SELECT * FROM sanctuary_journal WHERE ${where}
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as SanctuaryJournalEntry[];

  return { entries, total, page, totalPages: Math.ceil(total / limit) || 1 };
}

export interface JournalStats {
  total: number;
  byType: Record<string, number>;
  firstEntry: string | null;
  lastEntry: string | null;
}

export function getJournalStats(walletAddress: string, tokenId: number): JournalStats {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const total = (db.prepare(
    'SELECT COUNT(*) as count FROM sanctuary_journal WHERE wallet_address = ? AND token_id = ?'
  ).get(addr, tokenId) as { count: number }).count;

  const typeCounts = db.prepare(
    'SELECT entry_type, COUNT(*) as count FROM sanctuary_journal WHERE wallet_address = ? AND token_id = ? GROUP BY entry_type'
  ).all(addr, tokenId) as { entry_type: string; count: number }[];

  const byType: Record<string, number> = {};
  for (const row of typeCounts) byType[row.entry_type] = row.count;

  const range = db.prepare(
    'SELECT MIN(created_at) as first_entry, MAX(created_at) as last_entry FROM sanctuary_journal WHERE wallet_address = ? AND token_id = ?'
  ).get(addr, tokenId) as { first_entry: string | null; last_entry: string | null };

  return { total, byType, firstEntry: range.first_entry, lastEntry: range.last_entry };
}

export function getSanctuaryMapLocations(): SanctuaryMapLocation[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM sanctuary_map_locations ORDER BY unlock_level, name').all() as SanctuaryMapLocation[];
}

const ACTIVITY_DURATIONS: Record<string, number> = {
  'Hot Springs': 60,
  'Training Grounds': 120,
  'Star Garden': 90,
  'Cosmic Library': 180,
  'Nebula Kitchen': 45,
  'Dream Hollow': 30,
  'Aura Forge': 240,
  'Observatory': 150,
};

export const TIMED_QUEST_DURATIONS_MINUTES = [5, 15, 60, 240, 480] as const;
export type TimedQuestDurationMinutes = typeof TIMED_QUEST_DURATIONS_MINUTES[number];

function isValidTimedDuration(minutes: number): minutes is TimedQuestDurationMinutes {
  return (TIMED_QUEST_DURATIONS_MINUTES as readonly number[]).includes(minutes);
}

const ACTIVITY_BOND_REWARDS: Record<string, number> = {
  'Dream Hollow': 0.8,
  'Nebula Kitchen': 1.2,
  'Hot Springs': 2.0,
  'Star Garden': 2.8,
  'Training Grounds': 4.0,
  'Observatory': 5.5,
  'Cosmic Library': 6.5,
  'Aura Forge': 9.0,
};

const ACTIVITY_XP_REWARDS: Record<string, number> = {
  'Dream Hollow': 5,
  'Nebula Kitchen': 8,
  'Hot Springs': 12,
  'Star Garden': 15,
  'Training Grounds': 20,
  'Observatory': 25,
  'Cosmic Library': 30,
  'Aura Forge': 40,
};

// --- Training Grounds (V1.7) ---
// Per-companion XP thresholds (cumulative). Level 1 = 0-99 XP, Level 2 = 100-299 XP, etc.
export const COMPANION_LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500] as const;

export function calculateCompanionLevel(xp: number): number {
  let level = 1;
  for (let i = 1; i < COMPANION_LEVEL_THRESHOLDS.length; i++) {
    if (xp >= COMPANION_LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}

export interface CompanionTrainingTypeDef {
  type: string;
  label: string;
  durationMinutes: number;
  xpReward: number;
  bondReward: number;
  minLevel: number;
  description: string;
}

// Training types keyed by name. Higher-level variants unlock at higher companion levels
// and grant more XP (and longer duration).
export const COMPANION_TRAINING_TYPES: Record<string, CompanionTrainingTypeDef> = {
  Endurance: {
    type: 'Endurance',
    label: 'Endurance',
    durationMinutes: 1,
    xpReward: 40,
    bondReward: 0.5,
    minLevel: 1,
    description: 'Short stamina drill. Quick XP for new companions.',
  },
  Agility: {
    type: 'Agility',
    label: 'Agility',
    durationMinutes: 2,
    xpReward: 85,
    bondReward: 0.8,
    minLevel: 2,
    description: 'Reflex and speed work. Unlocks at level 2.',
  },
  Wisdom: {
    type: 'Wisdom',
    label: 'Wisdom',
    durationMinutes: 5,
    xpReward: 180,
    bondReward: 1.2,
    minLevel: 3,
    description: 'Focused meditation drills. Unlocks at level 3.',
  },
  'Intense Endurance': {
    type: 'Intense Endurance',
    label: 'Intense Endurance',
    durationMinutes: 10,
    xpReward: 360,
    bondReward: 2.0,
    minLevel: 4,
    description: 'Grueling stamina circuit. Unlocks at level 4.',
  },
  'Master Training': {
    type: 'Master Training',
    label: 'Master Training',
    durationMinutes: 20,
    xpReward: 700,
    bondReward: 3.0,
    minLevel: 5,
    description: 'Peak conditioning across all disciplines. Unlocks at level 5.',
  },
};

export function listTrainingTypesForLevel(companionLevel: number): CompanionTrainingTypeDef[] {
  return Object.values(COMPANION_TRAINING_TYPES)
    .filter((t) => t.minLevel <= companionLevel)
    .sort((a, b) => a.minLevel - b.minLevel || a.xpReward - b.xpReward);
}

export function startCompanionTraining(
  walletAddress: string,
  tokenId: number,
  trainingType: string,
): { companion: SanctuaryCompanion; journal: SanctuaryJournalEntry; training: CompanionTrainingTypeDef } {
  const def = COMPANION_TRAINING_TYPES[trainingType];
  if (!def) throw new Error('Invalid training type');

  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const comp = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ? AND is_active = 1'
    ).get(addr, tokenId) as SanctuaryCompanion | undefined;

    if (!comp) throw new Error('No active companion found');

    if (comp.activity_ends_at) {
      const endsAt = new Date(comp.activity_ends_at + 'Z').getTime();
      if (endsAt > Date.now()) throw new Error('Companion is already on an activity');
    }

    const companionLevel = calculateCompanionLevel(comp.xp ?? 0);
    if (companionLevel < def.minLevel) {
      throw new Error(`Training requires companion level ${def.minLevel}`);
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + def.durationMinutes * 60 * 1000);

    db.prepare(`
      UPDATE sanctuary_companions
      SET current_activity = ?,
          activity_started_at = ?,
          activity_ends_at = ?,
          total_interactions = total_interactions + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      `training:${def.type}`,
      now.toISOString().replace('T', ' ').slice(0, 19),
      endsAt.toISOString().replace('T', ' ').slice(0, 19),
      comp.id,
    );

    const journal = addJournalEntry(addr, tokenId, 'activity',
      `Began ${def.label} training at the Training Grounds. (${def.durationMinutes}m)`,
      JSON.stringify({ action: 'start_training', training_type: def.type, duration_minutes: def.durationMinutes }));

    const updated = db.prepare('SELECT * FROM sanctuary_companions WHERE id = ?')
      .get(comp.id) as SanctuaryCompanion;

    return { companion: updated, journal, training: def };
  });

  return txn();
}

export function sendToActivity(
  walletAddress: string, tokenId: number, locationId: number,
  options?: { durationMinutes?: number }
): { companion: SanctuaryCompanion; journal: SanctuaryJournalEntry } {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const comp = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ? AND is_active = 1'
    ).get(addr, tokenId) as SanctuaryCompanion | undefined;

    if (!comp) throw new Error('No active companion found');

    if (comp.activity_ends_at) {
      const endsAt = new Date(comp.activity_ends_at + 'Z').getTime();
      if (endsAt > Date.now()) {
        throw new Error('Companion is already on an activity');
      }
    }

    const location = db.prepare(
      'SELECT * FROM sanctuary_map_locations WHERE id = ?'
    ).get(locationId) as SanctuaryMapLocation | undefined;

    if (!location) throw new Error('Location not found');

    const requestedDuration = options?.durationMinutes;
    if (requestedDuration !== undefined && !isValidTimedDuration(requestedDuration)) {
      throw new Error('Invalid quest duration');
    }
    const durationMinutes = requestedDuration ?? ACTIVITY_DURATIONS[location.name] ?? 60;
    const now = new Date();
    const endsAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

    db.prepare(`
      UPDATE sanctuary_companions
      SET current_activity = ?,
          activity_started_at = ?,
          activity_ends_at = ?,
          total_interactions = total_interactions + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      `exploring:${location.name}`,
      now.toISOString().replace('T', ' ').slice(0, 19),
      endsAt.toISOString().replace('T', ' ').slice(0, 19),
      comp.id
    );

    const journal = addJournalEntry(addr, tokenId, 'activity',
      `Set off to explore ${location.name}. ${location.description ?? ''} (${durationMinutes}m)`,
      JSON.stringify({ action: 'send_to_activity', location_id: locationId, location_name: location.name, duration_minutes: durationMinutes }));

    const updated = db.prepare('SELECT * FROM sanctuary_companions WHERE id = ?')
      .get(comp.id) as SanctuaryCompanion;

    return { companion: updated, journal };
  });

  return txn();
}

export interface CompleteActivityResult {
  companion: SanctuaryCompanion;
  journal: SanctuaryJournalEntry;
  starBonus: boolean;
  isTraining?: boolean;
  trainingType?: string;
  companionXpAwarded?: number;
  levelBefore?: number;
  levelAfter?: number;
  leveledUp?: boolean;
}

export function completeActivity(
  walletAddress: string, tokenId: number,
  options?: { isStar?: boolean }
): CompleteActivityResult | null {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const comp = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ? AND is_active = 1'
    ).get(addr, tokenId) as SanctuaryCompanion | undefined;

    if (!comp || !comp.activity_ends_at) return null;

    const endsAt = new Date(comp.activity_ends_at + 'Z').getTime();
    if (endsAt > Date.now()) return null;

    const starBonus = options?.isStar ?? false;
    const isTraining = comp.current_activity.startsWith('training:');

    if (isTraining) {
      const trainingType = comp.current_activity.slice('training:'.length);
      const def = COMPANION_TRAINING_TYPES[trainingType];
      const xpBase = def?.xpReward ?? 20;
      const bondBase = def?.bondReward ?? 0.5;
      const bondReward = bondBase * (starBonus ? STAR_HOLDER_BOND_MULTIPLIER : 1);
      const companionXpAwarded = Math.round(xpBase * (starBonus ? STAR_HOLDER_XP_MULTIPLIER : 1));

      const xpBefore = comp.xp ?? 0;
      const xpAfter = xpBefore + companionXpAwarded;
      const levelBefore = calculateCompanionLevel(xpBefore);
      const levelAfter = calculateCompanionLevel(xpAfter);

      db.prepare(`
        UPDATE sanctuary_companions
        SET current_activity = 'lounging',
            activity_started_at = NULL,
            activity_ends_at = NULL,
            bond_score = MIN(bond_score + ?, 100.0),
            xp = ?,
            level = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(bondReward, xpAfter, levelAfter, comp.id);

      addUserXP(addr, companionXpAwarded);

      const bonusTag = starBonus ? ' (Star Bonus!)' : '';
      const levelUpTag = levelAfter > levelBefore ? ` — LEVEL UP! ${levelBefore} → ${levelAfter}` : '';
      const journal = addJournalEntry(addr, tokenId, 'activity',
        `Finished ${trainingType} training. Bond +${bondReward.toFixed(1)}, XP +${companionXpAwarded}${bonusTag}${levelUpTag}`,
        JSON.stringify({
          action: 'complete_training',
          training_type: trainingType,
          bond_reward: bondReward,
          companion_xp_awarded: companionXpAwarded,
          level_before: levelBefore,
          level_after: levelAfter,
          starBonus,
        }));

      const updated = db.prepare('SELECT * FROM sanctuary_companions WHERE id = ?')
        .get(comp.id) as SanctuaryCompanion;

      return {
        companion: updated,
        journal,
        starBonus,
        isTraining: true,
        trainingType,
        companionXpAwarded,
        levelBefore,
        levelAfter,
        leveledUp: levelAfter > levelBefore,
      };
    }

    const activityName = comp.current_activity.startsWith('exploring:')
      ? comp.current_activity.slice('exploring:'.length)
      : comp.current_activity;

    const bondReward = (ACTIVITY_BOND_REWARDS[activityName] ?? 1.0) * (starBonus ? STAR_HOLDER_BOND_MULTIPLIER : 1);
    const xpReward = Math.round((ACTIVITY_XP_REWARDS[activityName] ?? 5) * (starBonus ? STAR_HOLDER_XP_MULTIPLIER : 1));

    db.prepare(`
      UPDATE sanctuary_companions
      SET current_activity = 'lounging',
          activity_started_at = NULL,
          activity_ends_at = NULL,
          bond_score = MIN(bond_score + ?, 100.0),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(bondReward, comp.id);

    addUserXP(addr, xpReward);

    const bonusTag = starBonus ? ' (Star Bonus!)' : '';
    const journal = addJournalEntry(addr, tokenId, 'activity',
      `Returned from ${activityName} feeling refreshed! Bond +${bondReward.toFixed(1)}, XP +${xpReward}${bonusTag}`,
      JSON.stringify({ action: 'complete_activity', location_name: activityName, bond_reward: bondReward, xp_reward: xpReward, starBonus }));

    const updated = db.prepare('SELECT * FROM sanctuary_companions WHERE id = ?')
      .get(comp.id) as SanctuaryCompanion;

    return { companion: updated, journal, starBonus };
  });

  return txn();
}

// ============================================================================
// Minigame system (V1.8) — shared scoring + STAR rewards across mini-games
// ============================================================================

export interface MinigameDef {
  game_id: string;
  label: string;
  description: string;
  durationSeconds: number;
  firstPlayBonusStar: number;
  starPerScore: number; // STAR awarded = floor(score * starPerScore), capped
  starCapPerPlay: number;
}

export const SANCTUARY_MINIGAMES: Record<string, MinigameDef> = {
  'star-catch': {
    game_id: 'star-catch',
    label: 'Star Catch',
    description: 'Catch falling stars before they hit the ground.',
    durationSeconds: 60,
    firstPlayBonusStar: 25,
    starPerScore: 0.05,
    starCapPerPlay: 10,
  },
  'memory-match': {
    game_id: 'memory-match',
    label: 'Mood Match',
    description: 'Flip tiles in the Hot Springs to match Skrumpey moods. Streaks earn bonus points; clearing the board re-deals.',
    durationSeconds: 75,
    firstPlayBonusStar: 25,
    starPerScore: 0.04,
    starCapPerPlay: 10,
  },
  'star-connect': {
    game_id: 'star-connect',
    label: 'Star Connect',
    description: 'Trace constellations from the Observatory tablet — click each star in the highlighted order. Perfect rounds earn a bonus.',
    durationSeconds: 70,
    firstPlayBonusStar: 25,
    starPerScore: 0.05,
    starCapPerPlay: 10,
  },
  'forge-hammer': {
    game_id: 'forge-hammer',
    label: 'Forge Hammer',
    description: 'Time SPACE strikes against the Aura Forge anvil. Hit the gold center for PERFECT — chain hits to ramp the meter.',
    durationSeconds: 60,
    firstPlayBonusStar: 25,
    starPerScore: 0.05,
    starCapPerPlay: 10,
  },
  'cooking-rhythm': {
    game_id: 'cooking-rhythm',
    label: 'Cosmic Skillet',
    description: 'Press arrow keys to match recipe notes as they reach the pan. Streaks ramp the speed and bonus.',
    durationSeconds: 70,
    firstPlayBonusStar: 25,
    starPerScore: 0.04,
    starCapPerPlay: 10,
  },
  'dream-catcher': {
    game_id: 'dream-catcher',
    label: 'Dream Catcher',
    description: 'Move the dreamcatcher to scoop dream and lucid orbs while letting nightmares slip past.',
    durationSeconds: 75,
    firstPlayBonusStar: 25,
    starPerScore: 0.04,
    starCapPerPlay: 10,
  },
  'lore-trivia': {
    game_id: 'lore-trivia',
    label: 'Lore Tome',
    description: 'Answer Sanctuary trivia. Quick, correct answers build streak and speed bonuses; wrong answers cost points.',
    durationSeconds: 75,
    firstPlayBonusStar: 25,
    starPerScore: 0.05,
    starCapPerPlay: 10,
  },
};

export function getMinigameDef(gameId: string): MinigameDef | null {
  return SANCTUARY_MINIGAMES[gameId] ?? null;
}

export interface SanctuaryMinigameScore {
  id: number;
  wallet_address: string;
  token_id: number;
  game_id: string;
  score: number;
  star_awarded: number;
  played_at: string;
}

export interface MinigameSubmissionResult {
  score: number;
  star_awarded: number;
  is_first_play: boolean;
  personal_best: number;
  is_new_personal_best: boolean;
  total_plays: number;
  game_id: string;
  token_id: number;
}

export function submitMinigameScore(
  walletAddress: string,
  tokenId: number,
  gameId: string,
  score: number,
): MinigameSubmissionResult {
  const def = getMinigameDef(gameId);
  if (!def) throw new Error('Invalid minigame');
  if (!Number.isFinite(score) || score < 0) throw new Error('Invalid score');

  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const cappedScore = Math.min(Math.floor(score), 9999);

  const txn = db.transaction(() => {
    const prior = db.prepare(
      'SELECT COUNT(*) as count, COALESCE(MAX(score), 0) as best FROM sanctuary_minigame_scores WHERE wallet_address = ? AND token_id = ? AND game_id = ?',
    ).get(addr, tokenId, gameId) as { count: number; best: number };

    const isFirstPlay = prior.count === 0;
    const scoreReward = Math.min(
      Math.floor(cappedScore * def.starPerScore),
      def.starCapPerPlay,
    );
    const firstPlayBonus = isFirstPlay ? def.firstPlayBonusStar : 0;
    const starAwarded = scoreReward + firstPlayBonus;

    db.prepare(
      'INSERT INTO sanctuary_minigame_scores (wallet_address, token_id, game_id, score, star_awarded) VALUES (?, ?, ?, ?, ?)',
    ).run(addr, tokenId, gameId, cappedScore, starAwarded);

    if (starAwarded > 0) {
      addUserXP(addr, starAwarded);
    }

    addJournalEntry(addr, tokenId, 'achievement',
      `Played ${def.label} — Score ${cappedScore}, STAR +${starAwarded}${isFirstPlay ? ' (first play bonus!)' : ''}`,
      JSON.stringify({
        action: 'minigame_score',
        game_id: gameId,
        score: cappedScore,
        star_awarded: starAwarded,
        first_play: isFirstPlay,
      }),
    );

    return {
      score: cappedScore,
      star_awarded: starAwarded,
      is_first_play: isFirstPlay,
      personal_best: Math.max(prior.best, cappedScore),
      is_new_personal_best: cappedScore > prior.best,
      total_plays: prior.count + 1,
      game_id: gameId,
      token_id: tokenId,
    };
  });

  return txn();
}

export interface MinigameLeaderboardRow {
  rank: number;
  wallet_address: string;
  token_id: number;
  score: number;
  played_at: string;
}

export function getMinigameLeaderboard(
  gameId: string,
  limit: number = 20,
): MinigameLeaderboardRow[] {
  const db = getDatabase();
  const cap = Math.max(1, Math.min(Math.floor(limit), 100));
  // Best score per (wallet, token) pair, ranked descending.
  const rows = db.prepare(`
    SELECT wallet_address, token_id, score, played_at
    FROM (
      SELECT wallet_address, token_id, score, played_at,
             ROW_NUMBER() OVER (PARTITION BY wallet_address, token_id ORDER BY score DESC, played_at ASC) as rn
      FROM sanctuary_minigame_scores
      WHERE game_id = ?
    )
    WHERE rn = 1
    ORDER BY score DESC, played_at ASC
    LIMIT ?
  `).all(gameId, cap) as Array<{
    wallet_address: string;
    token_id: number;
    score: number;
    played_at: string;
  }>;

  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

export function getMinigamePersonalBest(
  walletAddress: string,
  tokenId: number,
  gameId: string,
): { personal_best: number; total_plays: number; total_star_earned: number } {
  const db = getDatabase();
  const row = db.prepare(
    'SELECT COUNT(*) as count, COALESCE(MAX(score), 0) as best, COALESCE(SUM(star_awarded), 0) as star FROM sanctuary_minigame_scores WHERE wallet_address = ? AND token_id = ? AND game_id = ?',
  ).get(walletAddress.toLowerCase(), tokenId, gameId) as {
    count: number;
    best: number;
    star: number;
  };
  return {
    personal_best: row.best,
    total_plays: row.count,
    total_star_earned: row.star,
  };
}

export function getCompanionsAtLocations(): { location_name: string; count: number; companions: { token_id: number; nickname: string | null }[] }[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT sc.current_activity, sc.token_id, sc.nickname, sc.activity_ends_at
    FROM sanctuary_companions sc
    WHERE sc.current_activity LIKE 'exploring:%'
      AND sc.is_active = 1
    ORDER BY sc.current_activity
  `).all() as { current_activity: string; token_id: number; nickname: string | null; activity_ends_at: string | null }[];

  const grouped: Record<string, { token_id: number; nickname: string | null }[]> = {};
  for (const row of rows) {
    if (row.activity_ends_at) {
      const endsAt = new Date(row.activity_ends_at + 'Z').getTime();
      if (endsAt < Date.now()) continue;
    }
    const locName = row.current_activity.slice('exploring:'.length);
    if (!grouped[locName]) grouped[locName] = [];
    grouped[locName].push({ token_id: row.token_id, nickname: row.nickname });
  }

  return Object.entries(grouped).map(([location_name, companions]) => ({
    location_name,
    count: companions.length,
    companions,
  }));
}

export function getSanctuaryState(walletAddress: string): {
  activeCompanion: SanctuaryCompanionWithMeta | null;
  companions: SanctuaryCompanionWithMeta[];
  recentJournal: SanctuaryJournalEntry[];
} {
  const addr = walletAddress.toLowerCase();
  const activeCompanion = getActiveCompanion(addr);
  const companions = getAllCompanions(addr);
  const recentJournal = activeCompanion
    ? getJournalEntries(addr, activeCompanion.token_id, 10)
    : [];

  return { activeCompanion, companions, recentJournal };
}

export type OnboardingStep =
  | 'select-companion'
  | 'enter-room'
  | 'interact-npc'
  | 'open-quest-board'
  | 'try-minigame'
  | 'done';

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  'select-companion',
  'enter-room',
  'interact-npc',
  'open-quest-board',
  'try-minigame',
  'done',
] as const;

export interface SanctuaryPlayerState {
  wallet_address: string;
  intro_completed: number;
  first_visit_at: string;
  last_visit_at: string;
  total_visits: number;
  created_at: string;
  updated_at: string;
  onboarding_step: OnboardingStep | null;
  onboarding_skipped: number;
}

export function getPlayerState(walletAddress: string): SanctuaryPlayerState | null {
  const addr = walletAddress.toLowerCase();
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM sanctuary_player_state WHERE wallet_address = ?')
    .get(addr) as SanctuaryPlayerState | undefined;
  return row ?? null;
}

export function upsertPlayerVisit(walletAddress: string): SanctuaryPlayerState {
  const addr = walletAddress.toLowerCase();
  const db = getDatabase();
  db.prepare(`
    INSERT INTO sanctuary_player_state (wallet_address, intro_completed, total_visits)
    VALUES (?, 0, 1)
    ON CONFLICT(wallet_address) DO UPDATE SET
      last_visit_at = CURRENT_TIMESTAMP,
      total_visits = total_visits + 1,
      updated_at = CURRENT_TIMESTAMP
  `).run(addr);
  return getPlayerState(addr) as SanctuaryPlayerState;
}

export function markIntroCompleted(walletAddress: string): SanctuaryPlayerState {
  const addr = walletAddress.toLowerCase();
  const db = getDatabase();
  db.prepare(`
    INSERT INTO sanctuary_player_state (wallet_address, intro_completed)
    VALUES (?, 1)
    ON CONFLICT(wallet_address) DO UPDATE SET
      intro_completed = 1,
      updated_at = CURRENT_TIMESTAMP
  `).run(addr);
  return getPlayerState(addr) as SanctuaryPlayerState;
}

function isValidOnboardingStep(step: string): step is OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(step);
}

export function setOnboardingStep(
  walletAddress: string,
  step: OnboardingStep,
): SanctuaryPlayerState {
  if (!isValidOnboardingStep(step)) {
    throw new Error(`Invalid onboarding step: ${step}`);
  }
  const addr = walletAddress.toLowerCase();
  const db = getDatabase();
  db.prepare(`
    INSERT INTO sanctuary_player_state (wallet_address, intro_completed, onboarding_step)
    VALUES (?, 0, ?)
    ON CONFLICT(wallet_address) DO UPDATE SET
      onboarding_step = excluded.onboarding_step,
      updated_at = CURRENT_TIMESTAMP
  `).run(addr, step);
  return getPlayerState(addr) as SanctuaryPlayerState;
}

export function skipOnboarding(walletAddress: string): SanctuaryPlayerState {
  const addr = walletAddress.toLowerCase();
  const db = getDatabase();
  db.prepare(`
    INSERT INTO sanctuary_player_state (wallet_address, intro_completed, onboarding_skipped, onboarding_step)
    VALUES (?, 0, 1, 'done')
    ON CONFLICT(wallet_address) DO UPDATE SET
      onboarding_skipped = 1,
      onboarding_step = 'done',
      updated_at = CURRENT_TIMESTAMP
  `).run(addr);
  return getPlayerState(addr) as SanctuaryPlayerState;
}

// Expedition stubs — tables exist but functions not yet implemented
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getAvailableExpeditions(_walletAddress: string) {
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getActiveExpeditionRun(_walletAddress: string) {
  return null;
}

// Legacy stubs removed in V2.6 — see startExpeditionRun / chooseExpeditionStep
// below for the real expedition lifecycle. Old callers (none in tree at the
// time of this PR) should migrate to the new helpers.

export function getPublicActivityFeed(limit: number, before?: string) {
  const db = getDatabase();
  const conditions = ['1=1'];
  const params: (string | number)[] = [];
  if (before) {
    conditions.push('sj.created_at < ?');
    params.push(before);
  }
  params.push(limit);
  return db.prepare(`
    SELECT sj.*, sc.nickname
    FROM sanctuary_journal sj
    LEFT JOIN sanctuary_companions sc ON sc.wallet_address = sj.wallet_address AND sc.token_id = sj.token_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY sj.created_at DESC
    LIMIT ?
  `).all(...params) as (SanctuaryJournalEntry & { nickname: string | null })[];
}

// ─── V1.5: Chat Messages ───────────────────────────────────────────

export interface SanctuaryChatMessage {
  id: number;
  wallet_address: string;
  token_id: number;
  role: 'user' | 'companion';
  content: string;
  created_at: string;
}

const PERSONALITY_TEMPLATES: Record<string, { greeting: string; phrases: string[]; style: string }> = {
  aether: {
    greeting: 'The cosmic winds whisper your arrival...',
    phrases: ['the stars reveal', 'cosmic energy suggests', 'in the astral plane', 'ethereal vibrations tell me'],
    style: 'mystical and dreamy',
  },
  spectra: {
    greeting: 'My light shifts to welcome you!',
    phrases: ['through the spectrum', 'colors of the cosmos show', 'in prismatic clarity', 'light patterns indicate'],
    style: 'vibrant and enthusiastic',
  },
  solveil: {
    greeting: 'Basking in your warm presence...',
    phrases: ['solar wisdom says', 'by the light of the sun', 'warmth flows through', 'radiant energy tells'],
    style: 'warm and nurturing',
  },
  nebulu: {
    greeting: 'Drifting through the nebula to greet you...',
    phrases: ['in the cosmic mist', 'nebula clouds reveal', 'stardust whispers', 'deep space echoes'],
    style: 'mysterious and contemplative',
  },
  chroma: {
    greeting: 'All my colors brighten for you!',
    phrases: ['chromatic shifts show', 'in vivid detail', 'brilliant hues suggest', 'color waves tell'],
    style: 'playful and colorful',
  },
  rose: {
    greeting: 'Petals unfurl at your approach...',
    phrases: ['rose-tinted visions show', 'in the garden of stars', 'gentle stardust says', 'petal whispers reveal'],
    style: 'gentle and poetic',
  },
  monflare: {
    greeting: 'FLARE UP! Ready for action!',
    phrases: ['blazing hot take:', 'fire in the chain says', 'with explosive energy', 'igniting the truth:'],
    style: 'energetic and bold',
  },
  auracore: {
    greeting: 'My aura pulses in sync with yours...',
    phrases: ['core resonance shows', 'aura alignment reveals', 'inner energy says', 'at the core of it all'],
    style: 'centered and wise',
  },
  parallel: {
    greeting: 'Across dimensions, I sensed you coming...',
    phrases: ['in the parallel realm', 'dimensional echoes say', 'across realities', 'the multiverse reveals'],
    style: 'philosophical and quirky',
  },
  prime: {
    greeting: 'The Prime acknowledges your presence.',
    phrases: ['prime analysis shows', 'at the fundamental level', 'core truth:', 'the essence reveals'],
    style: 'regal and authoritative',
  },
};

const DEFAULT_PERSONALITY = {
  greeting: 'Hey there, friend!',
  phrases: ['I think', 'it seems like', 'my instinct says', 'from what I can tell'],
  style: 'friendly and curious',
};

const MOOD_RESPONSES: Record<string, string[]> = {
  happy: ['I\'m feeling great today!', 'Everything is wonderful!', 'Life in the sanctuary is amazing!'],
  excited: ['I can barely contain my excitement!', 'Something big is coming, I can feel it!', 'LET\'S GO!'],
  calm: ['Taking it easy today...', 'Just vibing in the sanctuary.', 'Peace and serenity.'],
  sleepy: ['*yawns* I\'m a bit drowsy...', 'Could use a nap in Dream Hollow...', 'Zzz... oh, you\'re here!'],
  curious: ['I\'ve been wondering about something...', 'Did you know...?', 'I want to explore more!'],
};

const BOND_RESPONSES: Record<string, string[]> = {
  low: ['We\'re just getting to know each other!', 'I hope we become great friends.', 'Tell me about yourself!'],
  medium: ['I really enjoy your company.', 'Our bond grows stronger every day!', 'You\'re a great companion.'],
  high: ['You\'re my absolute best friend!', 'I can\'t imagine the sanctuary without you!', 'Our bond is legendary!'],
};

const TOPIC_RESPONSES: Record<string, string[]> = {
  food: ['Nebula Kitchen has the best cosmic treats!', 'Have you tried star-crystal cookies?', 'I could eat cosmic berries all day!'],
  adventure: ['Training Grounds are calling my name!', 'I heard there\'s treasure in the Observatory!', 'Let\'s explore together!'],
  stars: ['The constellations are beautiful tonight.', 'Each star tells a story.', 'I feel connected to the cosmos.'],
  friends: ['I wonder what the other Skrumpeys are up to.', 'The Hot Springs are always a good hangout spot.', 'Every Skrumpey has a unique aura!'],
  monad: ['The chain is our home, forever recorded.', 'On-chain memories last forever!', 'Monad moves fast, just like me!'],
};

function generateCompanionResponse(
  companion: SanctuaryCompanionWithMeta,
  userMessage: string,
  chatHistory: SanctuaryChatMessage[],
): string {
  const constellation = companion.constellation?.toLowerCase() ?? '';
  const personality = PERSONALITY_TEMPLATES[constellation] ?? DEFAULT_PERSONALITY;
  const mood = companion.mood ?? 'calm';
  const bondLevel = companion.bond_score < 30 ? 'low' : companion.bond_score < 70 ? 'medium' : 'high';

  const lower = userMessage.toLowerCase();

  if (chatHistory.length === 0 || lower.includes('hello') || lower.includes('hi ') || lower === 'hi') {
    return personality.greeting;
  }

  if (lower.includes('how are you') || lower.includes('how do you feel') || lower.includes('mood')) {
    const moodResponses = MOOD_RESPONSES[mood] ?? MOOD_RESPONSES.calm;
    return pick(moodResponses);
  }

  if (lower.includes('bond') || lower.includes('friend') || lower.includes('us') || lower.includes('relationship')) {
    return pick(BOND_RESPONSES[bondLevel]);
  }

  const topicMatch = Object.entries(TOPIC_RESPONSES).find(([key]) => lower.includes(key));
  if (topicMatch) {
    const phrase = pick(personality.phrases);
    return `${phrase}, ${pick(topicMatch[1]).toLowerCase()}`;
  }

  if (lower.includes('name') || lower.includes('who are you')) {
    const name = companion.nickname || `Skrumpey #${companion.token_id}`;
    return `I'm ${name}! ${companion.constellation ? `A ${companion.constellation} constellation Skrumpey.` : 'Your loyal companion.'} ${pick(personality.phrases)}, we make a great team!`;
  }

  if (lower.includes('?')) {
    const phrase = pick(personality.phrases);
    return `Hmm, ${phrase}... ${pick(BOND_RESPONSES[bondLevel]).toLowerCase()}`;
  }

  const fillers = [
    `${pick(personality.phrases)}... that's interesting!`,
    `I love chatting with you! ${pick(MOOD_RESPONSES[mood] ?? MOOD_RESPONSES.calm)}`,
    `${pick(BOND_RESPONSES[bondLevel])} Tell me more!`,
    `*wiggles happily* You always have the best things to say!`,
  ];
  return pick(fillers);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function addCompanionChatMessage(
  walletAddress: string, tokenId: number, role: 'user' | 'companion', content: string,
): SanctuaryChatMessage {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO sanctuary_chat_messages (wallet_address, token_id, role, content)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(walletAddress.toLowerCase(), tokenId, role, content);
  return db.prepare('SELECT * FROM sanctuary_chat_messages WHERE id = ?').get(result.lastInsertRowid) as SanctuaryChatMessage;
}

export function getCompanionChatHistory(walletAddress: string, tokenId: number, limit: number = 50, offset: number = 0): SanctuaryChatMessage[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM sanctuary_chat_messages
    WHERE wallet_address = ? AND token_id = ?
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(walletAddress.toLowerCase(), tokenId, limit, offset) as SanctuaryChatMessage[];
}

export function getCompanionChatHistoryCount(walletAddress: string, tokenId: number): number {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT COUNT(*) AS count FROM sanctuary_chat_messages
    WHERE wallet_address = ? AND token_id = ?
  `).get(walletAddress.toLowerCase(), tokenId) as { count: number } | undefined;
  return row?.count ?? 0;
}

// ─── V2.0: Companion Chat Memories ──────────────────────────────────

export type SanctuaryChatMemoryCategory =
  | 'owner_identity'
  | 'preferences'
  | 'shared_experiences'
  | 'companion_feelings'
  | 'recurring_topics';

export const SANCTUARY_MEMORY_CATEGORIES: SanctuaryChatMemoryCategory[] = [
  'owner_identity',
  'preferences',
  'shared_experiences',
  'companion_feelings',
  'recurring_topics',
];

export interface SanctuaryChatMemory {
  id: number;
  wallet_address: string;
  token_id: number;
  category: SanctuaryChatMemoryCategory;
  fact: string;
  importance: number;
  mention_count: number;
  last_mentioned_at: string;
  source_message_id: number | null;
  created_at: string;
  updated_at: string;
}

export function upsertChatMemory(
  walletAddress: string,
  tokenId: number,
  category: SanctuaryChatMemoryCategory,
  fact: string,
  options: { importance?: number; sourceMessageId?: number | null } = {},
): SanctuaryChatMemory {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const trimmedFact = fact.trim().slice(0, 280);
  if (!trimmedFact) throw new Error('Memory fact cannot be empty');
  const importance = Math.max(1, Math.min(5, options.importance ?? 1));
  const sourceMessageId = options.sourceMessageId ?? null;

  db.prepare(`
    INSERT INTO sanctuary_chat_memories
      (wallet_address, token_id, category, fact, importance, mention_count, source_message_id)
    VALUES (?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(wallet_address, token_id, category, fact) DO UPDATE SET
      importance = MAX(importance, excluded.importance),
      mention_count = mention_count + 1,
      last_mentioned_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `).run(addr, tokenId, category, trimmedFact, importance, sourceMessageId);

  return db.prepare(`
    SELECT * FROM sanctuary_chat_memories
    WHERE wallet_address = ? AND token_id = ? AND category = ? AND fact = ?
  `).get(addr, tokenId, category, trimmedFact) as SanctuaryChatMemory;
}

export function getChatMemories(
  walletAddress: string,
  tokenId: number,
  options: { limit?: number; category?: SanctuaryChatMemoryCategory } = {},
): SanctuaryChatMemory[] {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const limit = Math.max(1, Math.min(100, options.limit ?? 50));
  if (options.category) {
    return db.prepare(`
      SELECT * FROM sanctuary_chat_memories
      WHERE wallet_address = ? AND token_id = ? AND category = ?
      ORDER BY importance DESC, mention_count DESC, last_mentioned_at DESC
      LIMIT ?
    `).all(addr, tokenId, options.category, limit) as SanctuaryChatMemory[];
  }
  return db.prepare(`
    SELECT * FROM sanctuary_chat_memories
    WHERE wallet_address = ? AND token_id = ?
    ORDER BY importance DESC, mention_count DESC, last_mentioned_at DESC
    LIMIT ?
  `).all(addr, tokenId, limit) as SanctuaryChatMemory[];
}

export function getTopChatMemories(
  walletAddress: string,
  tokenId: number,
  limit: number = 5,
): SanctuaryChatMemory[] {
  return getChatMemories(walletAddress, tokenId, { limit });
}

// ─── V2.1: Memory Consolidation (weekly batch job) ──────────────────

export interface CompanionMemoryOwner {
  wallet_address: string;
  token_id: number;
}

export function listCompanionMemoryOwners(): CompanionMemoryOwner[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT DISTINCT wallet_address, token_id
    FROM sanctuary_chat_memories
    ORDER BY wallet_address ASC, token_id ASC
  `).all() as CompanionMemoryOwner[];
}

export function getAllChatMemoriesForCompanion(
  walletAddress: string,
  tokenId: number,
): SanctuaryChatMemory[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM sanctuary_chat_memories
    WHERE wallet_address = ? AND token_id = ?
    ORDER BY id ASC
  `).all(walletAddress.toLowerCase(), tokenId) as SanctuaryChatMemory[];
}

export interface ApplyConsolidationPlan {
  merges: Array<{
    keepId: number;
    removeIds: number[];
    newImportance: number;
    newMentionCount: number;
  }>;
  decays: Array<{ id: number; newImportance: number }>;
}

export interface ApplyConsolidationResult {
  merged: number;
  decayed: number;
}

export function applyMemoryConsolidationPlan(
  plan: ApplyConsolidationPlan,
): ApplyConsolidationResult {
  const db = getDatabase();
  const updateKeeper = db.prepare(`
    UPDATE sanctuary_chat_memories
    SET importance = ?, mention_count = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const deleteOne = db.prepare(`DELETE FROM sanctuary_chat_memories WHERE id = ?`);
  const decayOne = db.prepare(`
    UPDATE sanctuary_chat_memories
    SET importance = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  let merged = 0;
  let decayed = 0;

  const txn = db.transaction(() => {
    for (const m of plan.merges) {
      if (m.removeIds.length === 0) continue;
      updateKeeper.run(m.newImportance, m.newMentionCount, m.keepId);
      for (const rid of m.removeIds) {
        deleteOne.run(rid);
        merged += 1;
      }
    }
    for (const d of plan.decays) {
      decayOne.run(d.newImportance, d.id);
      decayed += 1;
    }
  });
  txn();

  return { merged, decayed };
}

export function generateTemplateCompanionReply(
  companion: SanctuaryCompanionWithMeta,
  userMessage: string,
  history: SanctuaryChatMessage[],
): string {
  return generateCompanionResponse(companion, userMessage, history);
}

export function persistCompanionChatExchange(
  walletAddress: string,
  tokenId: number,
  userMessage: string,
  companionReplyText: string,
): { userMessage: SanctuaryChatMessage; companionReply: SanctuaryChatMessage; companion: SanctuaryCompanionWithMeta } {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const comp = getActiveCompanion(addr);
    if (!comp || comp.token_id !== tokenId) throw new Error('No active companion found');

    const userMsg = addCompanionChatMessage(addr, tokenId, 'user', userMessage);
    const companionMsg = addCompanionChatMessage(addr, tokenId, 'companion', companionReplyText);

    db.prepare(`
      UPDATE sanctuary_companions SET total_interactions = total_interactions + 1, updated_at = CURRENT_TIMESTAMP
      WHERE wallet_address = ? AND token_id = ? AND is_active = 1
    `).run(addr, tokenId);

    updateTraitProgress(addr, tokenId, 'chat');

    return { userMessage: userMsg, companionReply: companionMsg, companion: comp };
  });

  return txn();
}

export function chatWithCompanion(
  walletAddress: string, tokenId: number, message: string,
): { userMessage: SanctuaryChatMessage; companionReply: SanctuaryChatMessage; companion: SanctuaryCompanionWithMeta } {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const comp = getActiveCompanion(addr);
    if (!comp || comp.token_id !== tokenId) throw new Error('No active companion found');

    const history = getCompanionChatHistory(addr, tokenId, 10);
    const userMsg = addCompanionChatMessage(addr, tokenId, 'user', message);
    const replyText = generateCompanionResponse(comp, message, history);
    const companionMsg = addCompanionChatMessage(addr, tokenId, 'companion', replyText);

    db.prepare(`
      UPDATE sanctuary_companions SET total_interactions = total_interactions + 1, updated_at = CURRENT_TIMESTAMP
      WHERE wallet_address = ? AND token_id = ? AND is_active = 1
    `).run(addr, tokenId);

    updateTraitProgress(addr, tokenId, 'chat');

    return { userMessage: userMsg, companionReply: companionMsg, companion: comp };
  });

  return txn();
}

// ─── V1.5: Trait Evolution ──────────────────────────────────────────

export interface SanctuaryTrait {
  id: number;
  wallet_address: string;
  token_id: number;
  trait_name: string;
  trait_category: string;
  progress: number;
  unlocked: number;
  unlocked_at: string | null;
  created_at: string;
  updated_at: string;
}

const TRAIT_DEFINITIONS: { name: string; category: string; trigger: string; threshold: number; description: string }[] = [
  { name: 'Chatterbox', category: 'social', trigger: 'chat', threshold: 20, description: 'Loves a good conversation' },
  { name: 'Social Butterfly', category: 'social', trigger: 'pet', threshold: 30, description: 'Thrives on affection' },
  { name: 'Foodie', category: 'gourmet', trigger: 'feed', threshold: 25, description: 'Never misses a meal' },
  { name: 'Gourmand', category: 'gourmet', trigger: 'feed', threshold: 60, description: 'A true cosmic cuisine connoisseur' },
  { name: 'Trailblazer', category: 'explorer', trigger: 'explore', threshold: 10, description: 'Always ready for adventure' },
  { name: 'World Walker', category: 'explorer', trigger: 'explore', threshold: 30, description: 'Has visited every corner of the sanctuary' },
  { name: 'Bookworm', category: 'scholar', trigger: 'library', threshold: 5, description: 'Lost in the Cosmic Library' },
  { name: 'Dreamer', category: 'dreamer', trigger: 'dream', threshold: 8, description: 'Dreams of far-off galaxies' },
  { name: 'Hot Tubber', category: 'special', trigger: 'springs', threshold: 10, description: 'Can\'t resist the Hot Springs' },
  { name: 'Star Gazer', category: 'special', trigger: 'observatory', threshold: 8, description: 'Eyes always on the cosmos' },
  { name: 'Forge Master', category: 'special', trigger: 'forge', threshold: 5, description: 'Channels pure aura energy' },
  { name: 'Loyal Companion', category: 'social', trigger: 'bond', threshold: 50, description: 'Bond score above 50 — a true partner' },
];

const ACTIVITY_TO_TRIGGER: Record<string, string> = {
  'Hot Springs': 'springs',
  'Training Grounds': 'explore',
  'Star Garden': 'explore',
  'Cosmic Library': 'library',
  'Nebula Kitchen': 'feed',
  'Dream Hollow': 'dream',
  'Aura Forge': 'forge',
  'Observatory': 'observatory',
};

export function updateTraitProgress(walletAddress: string, tokenId: number, trigger: string): SanctuaryTrait[] {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const updated: SanctuaryTrait[] = [];

  const matchingTraits = TRAIT_DEFINITIONS.filter((t) => t.trigger === trigger);

  for (const def of matchingTraits) {
    const existing = db.prepare(
      'SELECT * FROM sanctuary_traits WHERE wallet_address = ? AND token_id = ? AND trait_name = ?'
    ).get(addr, tokenId, def.name) as SanctuaryTrait | undefined;

    if (existing) {
      if (existing.unlocked) continue;
      const newProgress = Math.min(existing.progress + 1, def.threshold);
      const nowUnlocked = newProgress >= def.threshold ? 1 : 0;
      db.prepare(`
        UPDATE sanctuary_traits SET progress = ?, unlocked = ?, unlocked_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(newProgress, nowUnlocked, nowUnlocked, existing.id);
      if (nowUnlocked) {
        addJournalEntry(addr, tokenId, 'achievement', `Unlocked trait: ${def.name} — ${def.description}`);
      }
      updated.push({ ...existing, progress: newProgress, unlocked: nowUnlocked });
    } else {
      const result = db.prepare(`
        INSERT INTO sanctuary_traits (wallet_address, token_id, trait_name, trait_category, progress, unlocked)
        VALUES (?, ?, ?, ?, 1, 0)
      `).run(addr, tokenId, def.name, def.category);
      updated.push(db.prepare('SELECT * FROM sanctuary_traits WHERE id = ?').get(result.lastInsertRowid) as SanctuaryTrait);
    }
  }

  return updated;
}

export function getCompanionTraits(walletAddress: string, tokenId: number): SanctuaryTrait[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM sanctuary_traits WHERE wallet_address = ? AND token_id = ?
    ORDER BY unlocked DESC, progress DESC
  `).all(walletAddress.toLowerCase(), tokenId) as SanctuaryTrait[];
}

export function getUnlockedTraits(walletAddress: string, tokenId: number): SanctuaryTrait[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM sanctuary_traits WHERE wallet_address = ? AND token_id = ? AND unlocked = 1
    ORDER BY unlocked_at DESC
  `).all(walletAddress.toLowerCase(), tokenId) as SanctuaryTrait[];
}

export function getTraitDefinitions(): typeof TRAIT_DEFINITIONS {
  return TRAIT_DEFINITIONS;
}

// ─── V1.5: Seasonal Quests ─────────────────────────────────────────

export interface SanctuaryQuest {
  id: number;
  season: string;
  title: string;
  description: string;
  quest_type: string;
  requirement_type: string;
  requirement_count: number;
  reward_xp: number;
  reward_bond: number;
  reward_trait: string | null;
  active: number;
  starts_at: string | null;
  ends_at: string | null;
}

export interface SanctuaryQuestProgress {
  id: number;
  wallet_address: string;
  token_id: number;
  quest_id: number;
  current_count: number;
  completed: number;
  completed_at: string | null;
  reward_claimed: number;
}

export type QuestWithProgress = SanctuaryQuest & { progress: SanctuaryQuestProgress | null };

interface QuestSeed {
  season: string;
  title: string;
  description: string;
  quest_type: string;
  requirement_type: string;
  requirement_count: number;
  reward_xp: number;
  reward_bond: number;
  reward_trait: string | null;
}

const SEASONAL_QUEST_SEEDS: QuestSeed[] = [
  { season: 'spring-2026', title: 'First Steps', description: 'Interact with your companion 5 times.', quest_type: 'seasonal', requirement_type: 'interact', requirement_count: 5, reward_xp: 25, reward_bond: 2.0, reward_trait: null },
  { season: 'spring-2026', title: 'Cosmic Cuisine', description: 'Feed your Skrumpey 10 times.', quest_type: 'seasonal', requirement_type: 'feed', requirement_count: 10, reward_xp: 50, reward_bond: 5.0, reward_trait: null },
  { season: 'spring-2026', title: 'Explorer\'s Spirit', description: 'Send your companion on 5 activities.', quest_type: 'seasonal', requirement_type: 'explore', requirement_count: 5, reward_xp: 40, reward_bond: 3.0, reward_trait: null },
  { season: 'spring-2026', title: 'Heart to Heart', description: 'Chat with your Skrumpey 15 times.', quest_type: 'seasonal', requirement_type: 'chat', requirement_count: 15, reward_xp: 60, reward_bond: 4.0, reward_trait: 'Chatterbox' },
  { season: 'spring-2026', title: 'Stargazer\'s Vigil', description: 'Visit the Observatory 3 times.', quest_type: 'seasonal', requirement_type: 'observatory', requirement_count: 3, reward_xp: 35, reward_bond: 3.5, reward_trait: null },
  { season: 'spring-2026', title: 'Warm Welcome', description: 'Relax in the Hot Springs 5 times.', quest_type: 'seasonal', requirement_type: 'springs', requirement_count: 5, reward_xp: 30, reward_bond: 2.5, reward_trait: null },
  { season: 'spring-2026', title: 'Bonded', description: 'Reach 50 bond score with your companion.', quest_type: 'seasonal', requirement_type: 'bond_threshold', requirement_count: 50, reward_xp: 100, reward_bond: 0, reward_trait: 'Loyal Companion' },
  { season: 'spring-2026', title: 'Daily Devotion', description: 'Interact with your companion 3 days in a row.', quest_type: 'weekly', requirement_type: 'daily_streak', requirement_count: 3, reward_xp: 30, reward_bond: 2.0, reward_trait: null },
];

function loadQuestSeedsFromJson(): QuestSeed[] {
  try {
    const seedPath = path.join(process.cwd(), 'data', 'sanctuary', 'quests.json');
    if (!fs.existsSync(seedPath)) return [];
    const raw = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as {
      season?: string;
      daily_quests?: Partial<QuestSeed>[];
      weekly_quests?: Partial<QuestSeed>[];
    };
    const defaultSeason = raw.season ?? 'spring-2026';
    const fromGroup = (group: Partial<QuestSeed>[] | undefined): QuestSeed[] =>
      (group ?? []).map((q) => ({
        season: q.season ?? defaultSeason,
        title: String(q.title ?? ''),
        description: String(q.description ?? ''),
        quest_type: String(q.quest_type ?? 'daily'),
        requirement_type: String(q.requirement_type ?? 'interact'),
        requirement_count: Number(q.requirement_count ?? 1),
        reward_xp: Number(q.reward_xp ?? 0),
        reward_bond: Number(q.reward_bond ?? 0),
        reward_trait: q.reward_trait ?? null,
      }));
    return [...fromGroup(raw.daily_quests), ...fromGroup(raw.weekly_quests)];
  } catch {
    return [];
  }
}

function seedSanctuaryQuests(database: Database.Database): void {
  const allSeeds: QuestSeed[] = [...SEASONAL_QUEST_SEEDS, ...loadQuestSeedsFromJson()];

  const exists = database.prepare(
    'SELECT id FROM sanctuary_quests WHERE season = ? AND title = ?'
  );
  const insert = database.prepare(`
    INSERT INTO sanctuary_quests (season, title, description, quest_type, requirement_type, requirement_count, reward_xp, reward_bond, reward_trait)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const q of allSeeds) {
    if (exists.get(q.season, q.title)) continue;
    insert.run(q.season, q.title, q.description, q.quest_type, q.requirement_type, q.requirement_count, q.reward_xp, q.reward_bond, q.reward_trait);
  }
}

export function getSanctuaryQuests(season?: string): SanctuaryQuest[] {
  const db = getDatabase();
  if (season) {
    return db.prepare('SELECT * FROM sanctuary_quests WHERE active = 1 AND season = ? ORDER BY quest_type, id').all(season) as SanctuaryQuest[];
  }
  return db.prepare('SELECT * FROM sanctuary_quests WHERE active = 1 ORDER BY quest_type, id').all() as SanctuaryQuest[];
}

export function getSanctuaryQuestsWithProgress(walletAddress: string, tokenId: number, season?: string): QuestWithProgress[] {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const quests = getSanctuaryQuests(season);

  return quests.map((quest) => {
    const progress = db.prepare(
      'SELECT * FROM sanctuary_quest_progress WHERE wallet_address = ? AND token_id = ? AND quest_id = ?'
    ).get(addr, tokenId, quest.id) as SanctuaryQuestProgress | null;
    return { ...quest, progress };
  });
}

export function incrementQuestProgress(walletAddress: string, tokenId: number, requirementType: string, amount: number = 1): void {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const quests = db.prepare(
    'SELECT * FROM sanctuary_quests WHERE active = 1 AND requirement_type = ?'
  ).all(requirementType) as SanctuaryQuest[];

  for (const quest of quests) {
    const existing = db.prepare(
      'SELECT * FROM sanctuary_quest_progress WHERE wallet_address = ? AND token_id = ? AND quest_id = ?'
    ).get(addr, tokenId, quest.id) as SanctuaryQuestProgress | undefined;

    if (existing) {
      if (existing.completed) continue;
      const newCount = Math.min(existing.current_count + amount, quest.requirement_count);
      const nowComplete = newCount >= quest.requirement_count ? 1 : 0;
      db.prepare(`
        UPDATE sanctuary_quest_progress
        SET current_count = ?, completed = ?, completed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newCount, nowComplete, nowComplete, existing.id);
    } else {
      const nowComplete = amount >= quest.requirement_count ? 1 : 0;
      db.prepare(`
        INSERT INTO sanctuary_quest_progress (wallet_address, token_id, quest_id, current_count, completed, completed_at)
        VALUES (?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END)
      `).run(addr, tokenId, quest.id, Math.min(amount, quest.requirement_count), nowComplete, nowComplete);
    }
  }
}

export function claimSanctuaryQuestReward(
  walletAddress: string, tokenId: number, questId: number,
): { quest: SanctuaryQuest; xpGained: number; bondGained: number; traitUnlocked: string | null } {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const quest = db.prepare('SELECT * FROM sanctuary_quests WHERE id = ?').get(questId) as SanctuaryQuest | undefined;
    if (!quest) throw new Error('Quest not found');

    const progress = db.prepare(
      'SELECT * FROM sanctuary_quest_progress WHERE wallet_address = ? AND token_id = ? AND quest_id = ?'
    ).get(addr, tokenId, questId) as SanctuaryQuestProgress | undefined;

    if (!progress || !progress.completed) throw new Error('Quest not completed');
    if (progress.reward_claimed) throw new Error('Reward already claimed');

    db.prepare('UPDATE sanctuary_quest_progress SET reward_claimed = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(progress.id);

    if (quest.reward_xp > 0) addUserXP(addr, quest.reward_xp);
    if (quest.reward_bond > 0) {
      db.prepare('UPDATE sanctuary_companions SET bond_score = MIN(bond_score + ?, 100.0), updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ? AND token_id = ?')
        .run(quest.reward_bond, addr, tokenId);
    }

    addJournalEntry(addr, tokenId, 'quest', `Completed quest: ${quest.title}! +${quest.reward_xp} XP, +${quest.reward_bond.toFixed(1)} Bond`,
      JSON.stringify({ quest_id: questId, xp: quest.reward_xp, bond: quest.reward_bond, trait: quest.reward_trait }));

    return { quest, xpGained: quest.reward_xp, bondGained: quest.reward_bond, traitUnlocked: quest.reward_trait };
  });

  return txn();
}

// Hook trait + quest updates into existing interactions
export function interactWithCompanionV15(
  walletAddress: string, tokenId: number, action: CompanionStatAction,
  options?: { isStar?: boolean }
): CompanionInteractionResult {
  const result = interactWithCompanion(walletAddress, tokenId, action, options);
  const addr = walletAddress.toLowerCase();
  updateTraitProgress(addr, tokenId, action);
  incrementQuestProgress(addr, tokenId, 'interact');
  if (action === 'feed') incrementQuestProgress(addr, tokenId, 'feed');
  return result;
}

// ---------------------------------------------------------------------------
// Shared per-wallet resource economy (V2.8) — see
// docs/SANCTUARY_ECONOMY_REDESIGN.md. Quick actions fill a shared pool gated by
// a per-action 24h limit + cooldown; quests/games spend it. Bond/XP still land
// on the active companion (Track 0), but resources are wallet-wide.
// ---------------------------------------------------------------------------

const QUICK_ACTIONS: CompanionStatAction[] = ['feed', 'pet', 'talk', 'play', 'sleep'];

export interface ActionGateState {
  usesLeft: number;
  dailyLimit: number;
  cooldownMs: number;
}
export interface WalletResourceState {
  resources: ResourceSnapshot;
  actions: Record<string, ActionGateState>;
}
export interface QuickActionResult extends WalletResourceState {
  bondGain: number;
  preference: PreferenceLevel;
  needBoosted: boolean;
  variableTier: VariableRewardTier;
  bonusStar: number;
}

function loadWalletResources(
  db: ReturnType<typeof getDatabase>, addr: string, now: Date,
): ResourceSnapshot {
  const row = db.prepare(
    'SELECT hunger, happiness, energy, updated_at FROM sanctuary_wallet_resources WHERE wallet_address = ?',
  ).get(addr) as { hunger: number; happiness: number; energy: number; updated_at: string } | undefined;
  if (!row) return { hunger: RESOURCE_MAX, happiness: RESOURCE_MAX, energy: RESOURCE_MAX };
  return decayResources(
    { hunger: row.hunger, happiness: row.happiness, energy: row.energy },
    row.updated_at, now,
  );
}

function loadActionUsage(
  db: ReturnType<typeof getDatabase>, addr: string, action: string,
): WalletActionUsage | null {
  const row = db.prepare(
    'SELECT used_count, window_start, last_used_at FROM sanctuary_action_usage WHERE wallet_address = ? AND action = ?',
  ).get(addr, action) as { used_count: number; window_start: string; last_used_at: string | null } | undefined;
  return row
    ? { used_count: row.used_count, window_start: row.window_start, last_used_at: row.last_used_at }
    : null;
}

function buildActionGates(
  db: ReturnType<typeof getDatabase>, addr: string, now: Date,
): Record<string, ActionGateState> {
  const out: Record<string, ActionGateState> = {};
  for (const a of QUICK_ACTIONS) {
    const u = loadActionUsage(db, addr, a);
    out[a] = {
      usesLeft: usesRemaining(u, a, now),
      dailyLimit: ACTION_DAILY_LIMIT[a],
      cooldownMs: cooldownRemainingMs(u, a, now),
    };
  }
  return out;
}

/** Read the shared resource pool (decayed to now) + per-action gates for the UI. */
export function getWalletResources(walletAddress: string): WalletResourceState {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const now = new Date();
  return { resources: loadWalletResources(db, addr, now), actions: buildActionGates(db, addr, now) };
}

/**
 * Perform a quick action: enforce its per-action cooldown + 24h limit, fill the
 * shared resource pool, and deepen the active companion's bond (preference ×
 * need-state, with a chance of bonus STAR). Throws on a gated action.
 */
export function applyQuickAction(
  walletAddress: string, tokenId: number, action: CompanionStatAction,
  options?: { isStar?: boolean },
): QuickActionResult {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const now = new Date();

  const txn = db.transaction(() => {
    const usage = loadActionUsage(db, addr, action);
    const gate = gateAction(usage, action, now);
    if (!gate.ok) {
      throw new Error(
        gate.reason === 'daily_limit'
          ? 'Daily limit reached for this action — come back tomorrow!'
          : 'That action is on cooldown.',
      );
    }

    // Need-boost is measured against the shared pool now (filling a low
    // resource is the "right when they needed it" moment).
    const decayed = loadWalletResources(db, addr, now);
    const needBoosted = isNeedTargeted(action, decayed);
    const next = replenish(decayed, action);
    db.prepare(`
      INSERT INTO sanctuary_wallet_resources (wallet_address, hunger, happiness, energy, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(wallet_address) DO UPDATE SET
        hunger = excluded.hunger, happiness = excluded.happiness,
        energy = excluded.energy, updated_at = excluded.updated_at
    `).run(addr, next.hunger, next.happiness, next.energy, toSqlDate(now));

    const adv = advanceUsage(usage, now);
    db.prepare(`
      INSERT INTO sanctuary_action_usage (wallet_address, action, used_count, window_start, last_used_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(wallet_address, action) DO UPDATE SET
        used_count = excluded.used_count, window_start = excluded.window_start,
        last_used_at = excluded.last_used_at
    `).run(addr, action, adv.used_count, adv.window_start, adv.last_used_at);

    // Bond/XP/variable-STAR on the active companion (Track 0 mechanics).
    const starBonus = options?.isStar ?? false;
    const preference = preferenceFor(tokenId, action);
    const variable = rollVariableReward({ action, floorBond: 0 });
    let bonusStar = variable.bonusStar;
    if (variable.tier === 'rare_trinket') bonusStar = STAR_EARN_RATES.interaction.max;

    let bondGain = 0;
    const comp = db.prepare(
      'SELECT id FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ? AND is_active = 1',
    ).get(addr, tokenId) as { id: number } | undefined;
    if (comp) {
      const baseBond = INTERACTION_BOND[action] * (starBonus ? STAR_HOLDER_BOND_MULTIPLIER : 1);
      bondGain = computeBondDelta({ baseline: baseBond, preference, needBoosted });
      const xpGain = Math.round(INTERACTION_XP[action] * (starBonus ? STAR_HOLDER_XP_MULTIPLIER : 1));
      db.prepare(`
        UPDATE sanctuary_companions
        SET bond_score = MAX(MIN(bond_score + ?, 100.0), 0.0),
            total_interactions = total_interactions + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(bondGain, comp.id);
      if (xpGain > 0) addUserXP(addr, xpGain);
      addJournalEntry(
        addr, tokenId, 'interaction',
        journalLineForAction(action, action, now.getHours()),
        JSON.stringify({ action, bond: bondGain, preference, needBoosted, bonusStar, resource: ACTION_RESOURCE[action] }),
      );
    }
    if (bonusStar > 0) earnStar(addr, 'interaction', bonusStar, `token:${tokenId}:${variable.tier}`);

    return {
      resources: next,
      actions: buildActionGates(db, addr, now),
      bondGain, preference, needBoosted, variableTier: variable.tier, bonusStar,
    };
  });

  return txn();
}

export function completeActivityV15(
  walletAddress: string, tokenId: number,
  options?: { isStar?: boolean }
): CompleteActivityResult | null {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const comp = db.prepare(
    'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ? AND is_active = 1'
  ).get(addr, tokenId) as SanctuaryCompanion | undefined;

  const activityName = comp?.current_activity?.startsWith('exploring:')
    ? comp.current_activity.slice('exploring:'.length)
    : null;
  const wasTraining = comp?.current_activity?.startsWith('training:') ?? false;

  const result = completeActivity(walletAddress, tokenId, options);
  if (!result) return null;

  if (activityName) {
    const trigger = ACTIVITY_TO_TRIGGER[activityName];
    if (trigger) {
      updateTraitProgress(addr, tokenId, trigger);
      incrementQuestProgress(addr, tokenId, trigger);
    }
    incrementQuestProgress(addr, tokenId, 'explore');
  } else if (wasTraining) {
    // Training finishing still counts as a Training Grounds exploration quest trigger
    const trigger = ACTIVITY_TO_TRIGGER['Training Grounds'];
    if (trigger) {
      updateTraitProgress(addr, tokenId, trigger);
      incrementQuestProgress(addr, tokenId, trigger);
    }
    incrementQuestProgress(addr, tokenId, 'train');
  }

  return result;
}

// ---------------------------------------------------------------------------
// STAR currency (V2.1) — see docs/STAR_SANCTUARY_PLAN.md
// ---------------------------------------------------------------------------

export interface SanctuaryStarBalance {
  wallet_address: string;
  balance: number;
  lifetime_earned: number;
  updated_at: string;
}

export interface SanctuaryStarLedgerEntry {
  id: number;
  wallet_address: string;
  delta: number;
  kind: 'earn' | 'spend';
  source: string;
  balance_after: number;
  created_at: string;
}

export type StarEarnSource =
  | 'quest'
  | 'minigame_first'
  | 'daily_login'
  | 'activity'
  | 'levelup'
  | 'dream'
  | 'interaction';

// Earn-rate guardrails. Earn endpoint clamps the requested amount into the
// `[min, max]` band for its source so a single misbehaving caller cannot
// accidentally mint a million STAR. See task spec [SWO_V2_STAR_CURRENCY].
export const STAR_EARN_RATES: Record<StarEarnSource, { min: number; max: number }> = {
  quest: { min: 10, max: 50 },
  minigame_first: { min: 25, max: 25 },
  daily_login: { min: 5, max: 5 },
  activity: { min: 5, max: 20 },
  levelup: { min: 50, max: 50 },
  // [SWO_V2_SANCTUARY_SLEEP_DYNAMICS] — non-zero floor for the dream reward.
  // Baseline 1 STAR; Star-holder boost may request up to 3.
  dream: { min: 1, max: 3 },
  // [SWO_V2_SANCTUARY_VARIABLE_REWARDS] — ambient bonus STAR drops on routine
  // interactions (Neko-Atsume "gold fish" pattern). 1–3 STAR per bonus roll.
  interaction: { min: 1, max: 3 },
};

export function getStarBalance(walletAddress: string): SanctuaryStarBalance {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const row = db.prepare(
    'SELECT * FROM sanctuary_star_balance WHERE wallet_address = ?'
  ).get(addr) as SanctuaryStarBalance | undefined;
  if (row) return row;
  return {
    wallet_address: addr,
    balance: 0,
    lifetime_earned: 0,
    updated_at: new Date().toISOString(),
  };
}

export function earnStar(
  walletAddress: string,
  source: StarEarnSource,
  amount: number,
  detail?: string,
): { balance: number; lifetime_earned: number; gained: number } {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('STAR earn amount must be positive');
  }
  const rates = STAR_EARN_RATES[source];
  if (!rates) throw new Error(`Unknown STAR earn source: ${source}`);
  const clamped = Math.max(rates.min, Math.min(rates.max, Math.floor(amount)));

  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const sourceTag = detail ? `${source}:${detail}` : source;

  const txn = db.transaction(() => {
    const existing = db.prepare(
      'SELECT balance, lifetime_earned FROM sanctuary_star_balance WHERE wallet_address = ?'
    ).get(addr) as { balance: number; lifetime_earned: number } | undefined;

    const newBalance = (existing?.balance ?? 0) + clamped;
    const newLifetime = (existing?.lifetime_earned ?? 0) + clamped;

    if (existing) {
      db.prepare(
        'UPDATE sanctuary_star_balance SET balance = ?, lifetime_earned = ?, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?'
      ).run(newBalance, newLifetime, addr);
    } else {
      db.prepare(
        'INSERT INTO sanctuary_star_balance (wallet_address, balance, lifetime_earned) VALUES (?, ?, ?)'
      ).run(addr, newBalance, newLifetime);
    }

    db.prepare(
      'INSERT INTO sanctuary_star_ledger (wallet_address, delta, kind, source, balance_after) VALUES (?, ?, ?, ?, ?)'
    ).run(addr, clamped, 'earn', sourceTag, newBalance);

    return { balance: newBalance, lifetime_earned: newLifetime, gained: clamped };
  });

  return txn();
}

export function spendStar(
  walletAddress: string,
  amount: number,
  source: string,
): { balance: number; lifetime_earned: number; spent: number } {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('STAR spend amount must be positive');
  }
  const cost = Math.floor(amount);

  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const existing = db.prepare(
      'SELECT balance, lifetime_earned FROM sanctuary_star_balance WHERE wallet_address = ?'
    ).get(addr) as { balance: number; lifetime_earned: number } | undefined;

    const currentBalance = existing?.balance ?? 0;
    if (currentBalance < cost) {
      throw new Error('Insufficient STAR balance');
    }
    const newBalance = currentBalance - cost;
    const lifetime = existing?.lifetime_earned ?? 0;

    db.prepare(
      'UPDATE sanctuary_star_balance SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?'
    ).run(newBalance, addr);

    db.prepare(
      'INSERT INTO sanctuary_star_ledger (wallet_address, delta, kind, source, balance_after) VALUES (?, ?, ?, ?, ?)'
    ).run(addr, -cost, 'spend', source, newBalance);

    return { balance: newBalance, lifetime_earned: lifetime, spent: cost };
  });

  return txn();
}

export function getStarLedger(
  walletAddress: string,
  limit: number = 50,
): SanctuaryStarLedgerEntry[] {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  return db.prepare(
    'SELECT * FROM sanctuary_star_ledger WHERE wallet_address = ? ORDER BY created_at DESC, id DESC LIMIT ?'
  ).all(addr, Math.max(1, Math.min(500, Math.floor(limit)))) as SanctuaryStarLedgerEntry[];
}

// ---------------------------------------------------------------------------
// Cosmetic Shop + Inventory (V2.2) — see [SWO_V2_SHOP_BACKEND]
// ---------------------------------------------------------------------------

export type CosmeticCategory = 'hat' | 'accessory' | 'background' | 'animation';
export type CosmeticRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export const COSMETIC_CATEGORIES: readonly CosmeticCategory[] = [
  'hat',
  'accessory',
  'background',
  'animation',
] as const;

export interface SanctuaryCosmeticItem {
  id: number;
  item_key: string;
  name: string;
  category: CosmeticCategory;
  rarity: CosmeticRarity;
  star_cost: number;
  level_required: number;
  description: string | null;
  asset_key: string;
  created_at: string;
}

export interface SanctuaryInventoryEntry {
  id: number;
  wallet_address: string;
  item_key: string;
  source: 'shop' | 'quest' | 'event' | 'achievement' | 'gift';
  acquired_at: string;
}

// 24 items spanning 4 categories (hat, accessory, background, animation) at
// price points 10–50 STAR. Idempotent: only inserts on a fresh DB or rows
// missing by item_key.
const SANCTUARY_COSMETIC_SEED: ReadonlyArray<Omit<SanctuaryCosmeticItem, 'id' | 'created_at'>> = [
  // Hats — 10–50 STAR
  { item_key: 'hat_acorn_cap', name: 'Acorn Cap', category: 'hat', rarity: 'common', star_cost: 10, level_required: 1, description: 'A tiny acorn cap, perfect for forest strolls.', asset_key: 'hat_acorn_cap' },
  { item_key: 'hat_star_beanie', name: 'Star Beanie', category: 'hat', rarity: 'common', star_cost: 15, level_required: 1, description: 'A cozy beanie embroidered with a single bright star.', asset_key: 'hat_star_beanie' },
  { item_key: 'hat_witch_hat', name: 'Witch Hat', category: 'hat', rarity: 'uncommon', star_cost: 20, level_required: 3, description: 'A pointed hat that hums faintly with arcane energy.', asset_key: 'hat_witch_hat' },
  { item_key: 'hat_gold_crown', name: 'Gold Crown', category: 'hat', rarity: 'rare', star_cost: 35, level_required: 5, description: 'Worn by the rulers of forgotten constellations.', asset_key: 'hat_gold_crown' },
  { item_key: 'hat_cosmic_halo', name: 'Cosmic Halo', category: 'hat', rarity: 'rare', star_cost: 40, level_required: 7, description: 'A floating ring of starlight that orbits the wearer.', asset_key: 'hat_cosmic_halo' },
  { item_key: 'hat_nebula_crown', name: 'Nebula Crown', category: 'hat', rarity: 'legendary', star_cost: 50, level_required: 10, description: 'A crown spun from raw nebula dust. Only the boldest dare wear it.', asset_key: 'hat_nebula_crown' },

  // Accessories — 10–45 STAR
  { item_key: 'acc_star_pendant', name: 'Star Pendant', category: 'accessory', rarity: 'common', star_cost: 10, level_required: 1, description: 'A simple pendant carved from meteorite glass.', asset_key: 'acc_star_pendant' },
  { item_key: 'acc_comet_scarf', name: 'Comet Scarf', category: 'accessory', rarity: 'common', star_cost: 15, level_required: 1, description: 'A long scarf with a flowing comet-tail pattern.', asset_key: 'acc_comet_scarf' },
  { item_key: 'acc_moon_glasses', name: 'Moon Glasses', category: 'accessory', rarity: 'uncommon', star_cost: 20, level_required: 2, description: 'Tinted spectacles that filter even the brightest sun.', asset_key: 'acc_moon_glasses' },
  { item_key: 'acc_aura_ribbon', name: 'Aura Ribbon', category: 'accessory', rarity: 'uncommon', star_cost: 25, level_required: 3, description: 'A ribbon woven from threads of pure aura.', asset_key: 'acc_aura_ribbon' },
  { item_key: 'acc_nebula_collar', name: 'Nebula Collar', category: 'accessory', rarity: 'rare', star_cost: 35, level_required: 5, description: 'A collar that shimmers with swirling cosmic gases.', asset_key: 'acc_nebula_collar' },
  { item_key: 'acc_eclipse_pendant', name: 'Eclipse Pendant', category: 'accessory', rarity: 'legendary', star_cost: 45, level_required: 8, description: 'Forged during a total eclipse. Pulses with shadow-light.', asset_key: 'acc_eclipse_pendant' },

  // Backgrounds — 10–50 STAR
  { item_key: 'bg_starfield', name: 'Starfield', category: 'background', rarity: 'common', star_cost: 10, level_required: 1, description: 'A peaceful field of distant pinprick stars.', asset_key: 'bg_starfield' },
  { item_key: 'bg_soft_aurora', name: 'Soft Aurora', category: 'background', rarity: 'common', star_cost: 20, level_required: 2, description: 'Pale curtains of green and pink light drifting overhead.', asset_key: 'bg_soft_aurora' },
  { item_key: 'bg_cosmic_dawn', name: 'Cosmic Dawn', category: 'background', rarity: 'uncommon', star_cost: 25, level_required: 3, description: 'The first warm light of a galactic morning.', asset_key: 'bg_cosmic_dawn' },
  { item_key: 'bg_stellar_meadow', name: 'Stellar Meadow', category: 'background', rarity: 'uncommon', star_cost: 30, level_required: 4, description: 'A field of glowing flowers under a dark crystal sky.', asset_key: 'bg_stellar_meadow' },
  { item_key: 'bg_nebula_drift', name: 'Nebula Drift', category: 'background', rarity: 'rare', star_cost: 40, level_required: 6, description: 'Slow-rolling clouds of cyan and violet stardust.', asset_key: 'bg_nebula_drift' },
  { item_key: 'bg_galaxy_swirl', name: 'Galaxy Swirl', category: 'background', rarity: 'legendary', star_cost: 50, level_required: 9, description: 'A full spiral galaxy spinning lazily behind your companion.', asset_key: 'bg_galaxy_swirl' },

  // Animations — 10–50 STAR
  { item_key: 'anim_gentle_bob', name: 'Gentle Bob', category: 'animation', rarity: 'common', star_cost: 10, level_required: 1, description: 'A soft up-and-down bob, like floating on calm water.', asset_key: 'anim_gentle_bob' },
  { item_key: 'anim_star_sparkle', name: 'Star Sparkle', category: 'animation', rarity: 'common', star_cost: 15, level_required: 2, description: 'Tiny sparkles burst around the companion at random.', asset_key: 'anim_star_sparkle' },
  { item_key: 'anim_moon_glow', name: 'Moon Glow', category: 'animation', rarity: 'uncommon', star_cost: 25, level_required: 3, description: 'A pulsing silver halo of moonlight.', asset_key: 'anim_moon_glow' },
  { item_key: 'anim_comet_trail', name: 'Comet Trail', category: 'animation', rarity: 'uncommon', star_cost: 30, level_required: 4, description: 'A bright trail follows every step.', asset_key: 'anim_comet_trail' },
  { item_key: 'anim_aurora_dance', name: 'Aurora Dance', category: 'animation', rarity: 'rare', star_cost: 40, level_required: 6, description: 'Aurora ribbons twirl rhythmically around the companion.', asset_key: 'anim_aurora_dance' },
  { item_key: 'anim_constellation_burst', name: 'Constellation Burst', category: 'animation', rarity: 'legendary', star_cost: 50, level_required: 8, description: 'Periodic bursts of constellation glyphs orbit the companion.', asset_key: 'anim_constellation_burst' },
];

function seedSanctuaryCosmeticItems(database: Database.Database): void {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO sanctuary_cosmetic_items
      (item_key, name, category, rarity, star_cost, level_required, description, asset_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of SANCTUARY_COSMETIC_SEED) {
    insert.run(
      item.item_key,
      item.name,
      item.category,
      item.rarity,
      item.star_cost,
      item.level_required,
      item.description ?? null,
      item.asset_key,
    );
  }
}

export interface ListShopItemsOptions {
  category?: CosmeticCategory;
  walletAddress?: string;
}

export interface ShopItemView extends SanctuaryCosmeticItem {
  owned: boolean;
}

export function listShopItems(options: ListShopItemsOptions = {}): ShopItemView[] {
  const db = getDatabase();
  const { category, walletAddress } = options;

  const ownedKeys = new Set<string>();
  if (walletAddress) {
    const rows = db.prepare(
      'SELECT item_key FROM sanctuary_companion_inventory WHERE wallet_address = ?'
    ).all(walletAddress.toLowerCase()) as Array<{ item_key: string }>;
    for (const r of rows) ownedKeys.add(r.item_key);
  }

  const sql = category
    ? 'SELECT * FROM sanctuary_cosmetic_items WHERE category = ? ORDER BY star_cost ASC, id ASC'
    : 'SELECT * FROM sanctuary_cosmetic_items ORDER BY category ASC, star_cost ASC, id ASC';
  const rows = (
    category
      ? db.prepare(sql).all(category)
      : db.prepare(sql).all()
  ) as SanctuaryCosmeticItem[];

  return rows.map((r) => ({ ...r, owned: ownedKeys.has(r.item_key) }));
}

export function getShopItem(itemKey: string): SanctuaryCosmeticItem | null {
  const db = getDatabase();
  const row = db.prepare(
    'SELECT * FROM sanctuary_cosmetic_items WHERE item_key = ?'
  ).get(itemKey) as SanctuaryCosmeticItem | undefined;
  return row ?? null;
}

export function getCompanionInventory(walletAddress: string): SanctuaryInventoryEntry[] {
  const db = getDatabase();
  return db.prepare(
    'SELECT * FROM sanctuary_companion_inventory WHERE wallet_address = ? ORDER BY acquired_at DESC, id DESC'
  ).all(walletAddress.toLowerCase()) as SanctuaryInventoryEntry[];
}

export function ownsCosmetic(walletAddress: string, itemKey: string): boolean {
  const db = getDatabase();
  const row = db.prepare(
    'SELECT 1 as found FROM sanctuary_companion_inventory WHERE wallet_address = ? AND item_key = ? LIMIT 1'
  ).get(walletAddress.toLowerCase(), itemKey) as { found: number } | undefined;
  return !!row;
}

function getWalletLevel(database: Database.Database, walletAddress: string): number {
  const row = database.prepare(
    'SELECT COALESCE(level, 1) AS level FROM user_xp WHERE wallet_address = ?'
  ).get(walletAddress.toLowerCase()) as { level: number } | undefined;
  return row?.level ?? 1;
}

export interface BuyShopItemResult {
  item: SanctuaryCosmeticItem;
  balance: number;
  lifetime_earned: number;
  spent: number;
}

/**
 * Buy a cosmetic item. Validates: item exists, level gate, not already owned,
 * sufficient STAR balance. On success: deducts STAR via spendStar (which writes
 * the ledger) and inserts an inventory row.
 *
 * Throws Error with codes: ITEM_NOT_FOUND, LEVEL_TOO_LOW, ALREADY_OWNED,
 * "Insufficient STAR balance" (re-thrown from spendStar).
 */
export function buyShopItem(
  walletAddress: string,
  itemKey: string,
): BuyShopItemResult {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const item = db.prepare(
    'SELECT * FROM sanctuary_cosmetic_items WHERE item_key = ?'
  ).get(itemKey) as SanctuaryCosmeticItem | undefined;
  if (!item) throw new Error('ITEM_NOT_FOUND');

  const level = getWalletLevel(db, addr);
  if (level < item.level_required) {
    throw new Error(`LEVEL_TOO_LOW:required=${item.level_required}:have=${level}`);
  }

  const already = db.prepare(
    'SELECT 1 as found FROM sanctuary_companion_inventory WHERE wallet_address = ? AND item_key = ? LIMIT 1'
  ).get(addr, itemKey) as { found: number } | undefined;
  if (already) throw new Error('ALREADY_OWNED');

  // spendStar runs its own transaction (deducts balance + writes ledger). The
  // inventory insert runs after it succeeds; if the insert fails we re-credit.
  const spendResult = spendStar(addr, item.star_cost, `shop:${itemKey}`);
  try {
    db.prepare(
      'INSERT INTO sanctuary_companion_inventory (wallet_address, item_key, source) VALUES (?, ?, ?)'
    ).run(addr, itemKey, 'shop');
  } catch (e) {
    // Roll back the STAR deduction by re-crediting the same amount via a raw
    // ledger compensation. We don't use earnStar() because that clamps to the
    // earn-rate band and the source isn't an earn source.
    const txn = db.transaction(() => {
      const cur = db.prepare(
        'SELECT balance FROM sanctuary_star_balance WHERE wallet_address = ?'
      ).get(addr) as { balance: number } | undefined;
      const restored = (cur?.balance ?? 0) + item.star_cost;
      db.prepare(
        'UPDATE sanctuary_star_balance SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?'
      ).run(restored, addr);
      db.prepare(
        'INSERT INTO sanctuary_star_ledger (wallet_address, delta, kind, source, balance_after) VALUES (?, ?, ?, ?, ?)'
      ).run(addr, item.star_cost, 'earn', `refund:${itemKey}`, restored);
    });
    txn();
    throw e;
  }

  return {
    item,
    balance: spendResult.balance,
    lifetime_earned: spendResult.lifetime_earned,
    spent: spendResult.spent,
  };
}

// ---------------------------------------------------------------------------
// Cosmetic gacha pull (V2 §3.3 / §3.4) — see [SWO_V2_SANCTUARY_STAR_SINKS]
// ---------------------------------------------------------------------------

export interface GachaPullPersistedResult {
  item: SanctuaryCosmeticItem;
  isRare: boolean;
  fellBackToOtherTier: boolean;
  balance: number;
  lifetime_earned: number;
  spent: number;
}

/**
 * Run a single gacha pull for `walletAddress`. Loads the catalog, filters out
 * already-owned items, picks via {@link pickGachaItem} (RNG injectable for
 * tests), debits STAR, and writes the inventory row. Throws on empty pool or
 * insufficient balance.
 */
export function gachaPullForWallet(
  walletAddress: string,
  rng: () => number = Math.random,
): GachaPullPersistedResult {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const ownedKeys = new Set<string>();
  for (const r of db.prepare(
    'SELECT item_key FROM sanctuary_companion_inventory WHERE wallet_address = ?',
  ).all(addr) as Array<{ item_key: string }>) {
    ownedKeys.add(r.item_key);
  }

  const allItems = db.prepare(
    'SELECT * FROM sanctuary_cosmetic_items ORDER BY id ASC',
  ).all() as SanctuaryCosmeticItem[];

  const eligible: GachaCandidate[] = allItems
    .filter((i) => !ownedKeys.has(i.item_key))
    .map((i) => ({
      item_key: i.item_key,
      rarity: i.rarity,
      level_required: i.level_required,
    }));

  if (eligible.length === 0) throw new Error('GACHA_POOL_EMPTY');

  const level = getWalletLevel(db, addr);
  const pick: GachaPickResult | null = pickGachaItem(eligible, level, rng);
  if (!pick) throw new Error('GACHA_NO_ELIGIBLE_ITEMS');

  const item = allItems.find((i) => i.item_key === pick.itemKey)!;

  const spendResult = spendStar(addr, GACHA_PULL_COST, `gacha:${pick.itemKey}`);
  try {
    db.prepare(
      "INSERT INTO sanctuary_companion_inventory (wallet_address, item_key, source) VALUES (?, ?, 'gift')",
    ).run(addr, pick.itemKey);
  } catch (e) {
    // Compensate the spend if the inventory insert fails (race with a
    // concurrent buyShopItem on the same key, etc.).
    const txn = db.transaction(() => {
      const cur = db.prepare(
        'SELECT balance FROM sanctuary_star_balance WHERE wallet_address = ?',
      ).get(addr) as { balance: number } | undefined;
      const restored = (cur?.balance ?? 0) + GACHA_PULL_COST;
      db.prepare(
        'UPDATE sanctuary_star_balance SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?',
      ).run(restored, addr);
      db.prepare(
        'INSERT INTO sanctuary_star_ledger (wallet_address, delta, kind, source, balance_after) VALUES (?, ?, ?, ?, ?)',
      ).run(addr, GACHA_PULL_COST, 'earn', `refund:gacha:${pick.itemKey}`, restored);
    });
    txn();
    throw e;
  }

  return {
    item,
    isRare: pick.isRare,
    fellBackToOtherTier: pick.fellBackToOtherTier,
    balance: spendResult.balance,
    lifetime_earned: spendResult.lifetime_earned,
    spent: spendResult.spent,
  };
}

export interface EquipCosmeticResult {
  token_id: number;
  equipped_cosmetics: Record<string, string | null>;
}

/**
 * Equip (or unequip with itemKey === null) a cosmetic item on a companion.
 * Validates: companion belongs to wallet, item is owned, item category matches
 * a slot, and level gate. Only one item may be equipped per slot — equipping
 * a new one swaps the old one out (no double-equip).
 *
 * Throws Error with codes: COMPANION_NOT_FOUND, ITEM_NOT_FOUND, NOT_OWNED,
 * LEVEL_TOO_LOW, ALREADY_EQUIPPED.
 */
export function equipCosmetic(
  walletAddress: string,
  tokenId: number,
  itemKey: string | null,
  slot?: CosmeticCategory,
): EquipCosmeticResult {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const companion = db.prepare(
    'SELECT id, equipped_cosmetics FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?'
  ).get(addr, tokenId) as { id: number; equipped_cosmetics: string | null } | undefined;
  if (!companion) throw new Error('COMPANION_NOT_FOUND');

  let equipped: Record<string, string | null> = {};
  if (companion.equipped_cosmetics) {
    try {
      const parsed = JSON.parse(companion.equipped_cosmetics);
      if (parsed && typeof parsed === 'object') equipped = parsed;
    } catch { /* malformed — treat as empty */ }
  }

  if (itemKey === null) {
    // Unequip: requires explicit slot.
    if (!slot) throw new Error('SLOT_REQUIRED');
    if (equipped[slot] === undefined || equipped[slot] === null) {
      // No-op if nothing was equipped.
      return { token_id: tokenId, equipped_cosmetics: equipped };
    }
    equipped[slot] = null;
  } else {
    const item = db.prepare(
      'SELECT * FROM sanctuary_cosmetic_items WHERE item_key = ?'
    ).get(itemKey) as SanctuaryCosmeticItem | undefined;
    if (!item) throw new Error('ITEM_NOT_FOUND');

    const owned = db.prepare(
      'SELECT 1 as found FROM sanctuary_companion_inventory WHERE wallet_address = ? AND item_key = ? LIMIT 1'
    ).get(addr, itemKey) as { found: number } | undefined;
    if (!owned) throw new Error('NOT_OWNED');

    const level = getWalletLevel(db, addr);
    if (level < item.level_required) {
      throw new Error(`LEVEL_TOO_LOW:required=${item.level_required}:have=${level}`);
    }

    const targetSlot = (slot ?? item.category) as CosmeticCategory;
    if (equipped[targetSlot] === itemKey) {
      throw new Error('ALREADY_EQUIPPED');
    }
    equipped[targetSlot] = itemKey;
  }

  db.prepare(
    'UPDATE sanctuary_companions SET equipped_cosmetics = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(JSON.stringify(equipped), companion.id);

  return { token_id: tokenId, equipped_cosmetics: equipped };
}

// ---------------------------------------------------------------------------
// Expeditions (V2.6) — see [SWO_V2_SANCTUARY_EXPEDITIONS_DB_API]
// ---------------------------------------------------------------------------

export interface SanctuaryExpeditionRow {
  id: number;
  wallet_address: string;
  token_id: number;
  expedition_id: string;
  star_cost: number;
  started_at: string;
  ended_at: string | null;
  outcome: ExpeditionOutcome | null;
  status: ExpeditionStatus;
}

export interface SanctuaryExpeditionProgressRow {
  expedition_row_id: number;
  current_step_id: string | null;
  choices_jsonb: string;
  updated_at: string;
}

export interface ExpeditionListing {
  tier: ExpeditionTier;
  star_cost: number;
  id: string;
  title: string;
  description: string;
  npcSource: string;
  rewards: ExpeditionDefinition['rewards'];
  /** True when the holder has an active run for this expedition. */
  active_row_id: number | null;
}

export interface ExpeditionRunView {
  row: SanctuaryExpeditionRow;
  state: ExpeditionState;
  definition: ExpeditionDefinition;
}

function parseHistory(json: string): ExpeditionHistoryEntry[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed as ExpeditionHistoryEntry[];
  } catch {
    /* fall through */
  }
  return [];
}

function rowToState(
  row: SanctuaryExpeditionRow,
  progress: SanctuaryExpeditionProgressRow | undefined,
): ExpeditionState {
  return {
    expeditionId: row.expedition_id,
    currentStepId: progress?.current_step_id ?? null,
    status: row.status,
    history: progress ? parseHistory(progress.choices_jsonb) : [],
    finalOutcome: row.outcome ?? undefined,
  };
}

export function listExpeditions(walletAddress: string, tokenId: number): {
  tiers: typeof EXPEDITION_TIERS;
  expeditions: ExpeditionListing[];
} {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const catalog = getExpeditionCatalog();

  const active = db.prepare(
    "SELECT id, expedition_id FROM sanctuary_expeditions WHERE wallet_address = ? AND token_id = ? AND status = 'active'"
  ).all(addr, tokenId) as Array<{ id: number; expedition_id: string }>;
  const activeById = new Map(active.map((a) => [a.expedition_id, a.id]));

  return {
    tiers: EXPEDITION_TIERS,
    expeditions: catalog.map((entry) => ({
      tier: entry.tier,
      star_cost: entry.star_cost,
      id: entry.definition.id,
      title: entry.definition.title,
      description: entry.definition.description,
      npcSource: entry.definition.npcSource,
      rewards: entry.definition.rewards,
      active_row_id: activeById.get(entry.definition.id) ?? null,
    })),
  };
}

/**
 * Start a new expedition run for (wallet, token). Deducts the seed-declared
 * `star_cost` atomically; on insufficient balance the run is not created.
 * Returns the new run plus the reducer state primed on the start step.
 */
export function startExpeditionRun(
  walletAddress: string,
  tokenId: number,
  expeditionId: string,
): ExpeditionRunView {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const entry = getExpeditionCatalogEntry(expeditionId);
  if (!entry) throw new Error('EXPEDITION_NOT_FOUND');

  const txn = db.transaction(() => {
    const existing = db.prepare(
      "SELECT id FROM sanctuary_expeditions WHERE wallet_address = ? AND token_id = ? AND expedition_id = ? AND status = 'active'"
    ).get(addr, tokenId, expeditionId) as { id: number } | undefined;
    if (existing) throw new Error('ALREADY_ACTIVE');

    if (entry.star_cost > 0) {
      // Inline spend to keep ledger consistent with run id.
      const balRow = db.prepare(
        'SELECT balance, lifetime_earned FROM sanctuary_star_balance WHERE wallet_address = ?'
      ).get(addr) as { balance: number; lifetime_earned: number } | undefined;
      const cur = balRow?.balance ?? 0;
      if (cur < entry.star_cost) throw new Error('Insufficient STAR balance');
      const newBal = cur - entry.star_cost;
      if (balRow) {
        db.prepare(
          'UPDATE sanctuary_star_balance SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?'
        ).run(newBal, addr);
      } else {
        db.prepare(
          'INSERT INTO sanctuary_star_balance (wallet_address, balance, lifetime_earned) VALUES (?, ?, ?)'
        ).run(addr, newBal, 0);
      }
      db.prepare(
        'INSERT INTO sanctuary_star_ledger (wallet_address, delta, kind, source, balance_after) VALUES (?, ?, ?, ?, ?)'
      ).run(addr, -entry.star_cost, 'spend', `expedition:${expeditionId}`, newBal);
    }

    const state = startExpedition(entry.definition);
    const result = db.prepare(
      "INSERT INTO sanctuary_expeditions (wallet_address, token_id, expedition_id, star_cost, status) VALUES (?, ?, ?, ?, 'active')"
    ).run(addr, tokenId, expeditionId, entry.star_cost);
    const rowId = Number(result.lastInsertRowid);
    db.prepare(
      'INSERT INTO sanctuary_expedition_progress (expedition_row_id, current_step_id, choices_jsonb) VALUES (?, ?, ?)'
    ).run(rowId, state.currentStepId, JSON.stringify(state.history));

    const row = db.prepare('SELECT * FROM sanctuary_expeditions WHERE id = ?').get(rowId) as SanctuaryExpeditionRow;
    return { row, state, definition: entry.definition };
  });

  return txn();
}

export function getExpeditionRun(
  walletAddress: string,
  tokenId: number,
  rowId: number,
): ExpeditionRunView | null {
  const db = getDatabase();
  const row = db.prepare(
    'SELECT * FROM sanctuary_expeditions WHERE id = ? AND wallet_address = ? AND token_id = ?'
  ).get(rowId, walletAddress.toLowerCase(), tokenId) as SanctuaryExpeditionRow | undefined;
  if (!row) return null;

  const entry = getExpeditionCatalogEntry(row.expedition_id);
  if (!entry) return null;
  const progress = db.prepare(
    'SELECT * FROM sanctuary_expedition_progress WHERE expedition_row_id = ?'
  ).get(rowId) as SanctuaryExpeditionProgressRow | undefined;

  return { row, state: rowToState(row, progress), definition: entry.definition };
}

/**
 * Apply a choice to the current step of a run. On a terminal step this also
 * settles rewards: success grants STAR + bond + trait, partial/failure grant
 * the scaled subset per {@link EXPEDITION_OUTCOME_REWARD_SCALE}.
 */
export function chooseExpeditionStep(
  walletAddress: string,
  tokenId: number,
  rowId: number,
  choiceId: string,
): ExpeditionRunView & {
  rewards: { xp: number; bond: number; trait: string | null; starGained: number };
} {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const row = db.prepare(
      'SELECT * FROM sanctuary_expeditions WHERE id = ? AND wallet_address = ? AND token_id = ?'
    ).get(rowId, addr, tokenId) as SanctuaryExpeditionRow | undefined;
    if (!row) throw new Error('NOT_FOUND');
    if (row.status !== 'active') throw new Error('NOT_ACTIVE');

    const entry = getExpeditionCatalogEntry(row.expedition_id);
    if (!entry) throw new Error('EXPEDITION_NOT_FOUND');

    const progress = db.prepare(
      'SELECT * FROM sanctuary_expedition_progress WHERE expedition_row_id = ?'
    ).get(rowId) as SanctuaryExpeditionProgressRow | undefined;
    const state = rowToState(row, progress);
    const nextState = chooseExpeditionPath(state, entry.definition, choiceId);

    db.prepare(
      'UPDATE sanctuary_expedition_progress SET current_step_id = ?, choices_jsonb = ?, updated_at = CURRENT_TIMESTAMP WHERE expedition_row_id = ?'
    ).run(nextState.currentStepId, JSON.stringify(nextState.history), rowId);

    let rewards = { xp: 0, bond: 0, trait: null as string | null, starGained: 0 };

    if (nextState.status === 'completed' && nextState.finalOutcome) {
      const def = entry.definition;
      const computed = getExpeditionRewards(nextState, def);
      const starGained = Math.max(0, Math.round(computed.xp / 4));
      rewards = {
        xp: computed.xp,
        bond: computed.bond,
        trait: computed.trait ?? null,
        starGained,
      };

      db.prepare(
        "UPDATE sanctuary_expeditions SET status = 'completed', ended_at = CURRENT_TIMESTAMP, outcome = ? WHERE id = ?"
      ).run(nextState.finalOutcome, rowId);

      if (computed.xp > 0) {
        try { addUserXP(addr, computed.xp); } catch { /* user_xp may not be wired for tests */ }
      }
      if (computed.bond > 0) {
        db.prepare(
          'UPDATE sanctuary_companions SET bond_score = MIN(bond_score + ?, 100.0), updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ? AND token_id = ?'
        ).run(computed.bond, addr, tokenId);
      }
      if (computed.trait) {
        const traitName = computed.trait;
        const existing = db.prepare(
          'SELECT id FROM sanctuary_traits WHERE wallet_address = ? AND token_id = ? AND trait_name = ?'
        ).get(addr, tokenId, traitName) as { id: number } | undefined;
        if (existing) {
          db.prepare(
            'UPDATE sanctuary_traits SET unlocked = 1, progress = 1, unlocked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).run(existing.id);
        } else {
          db.prepare(
            "INSERT INTO sanctuary_traits (wallet_address, token_id, trait_name, trait_category, progress, unlocked, unlocked_at) VALUES (?, ?, ?, 'special', 1, 1, CURRENT_TIMESTAMP)"
          ).run(addr, tokenId, traitName);
        }
      }
      if (starGained > 0) {
        const balRow = db.prepare(
          'SELECT balance, lifetime_earned FROM sanctuary_star_balance WHERE wallet_address = ?'
        ).get(addr) as { balance: number; lifetime_earned: number } | undefined;
        const newBalance = (balRow?.balance ?? 0) + starGained;
        const newLifetime = (balRow?.lifetime_earned ?? 0) + starGained;
        if (balRow) {
          db.prepare(
            'UPDATE sanctuary_star_balance SET balance = ?, lifetime_earned = ?, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?'
          ).run(newBalance, newLifetime, addr);
        } else {
          db.prepare(
            'INSERT INTO sanctuary_star_balance (wallet_address, balance, lifetime_earned) VALUES (?, ?, ?)'
          ).run(addr, newBalance, newLifetime);
        }
        db.prepare(
          'INSERT INTO sanctuary_star_ledger (wallet_address, delta, kind, source, balance_after) VALUES (?, ?, ?, ?, ?)'
        ).run(addr, starGained, 'earn', `expedition:${row.expedition_id}:${nextState.finalOutcome}`, newBalance);
      }

      try {
        addJournalEntry(
          addr, tokenId, 'quest',
          `Expedition "${def.title}" — ${nextState.finalOutcome}`,
          JSON.stringify({ expedition_id: def.id, outcome: nextState.finalOutcome, ...rewards }),
        );
      } catch { /* journal optional in tests */ }
    }

    const updatedRow = db.prepare('SELECT * FROM sanctuary_expeditions WHERE id = ?').get(rowId) as SanctuaryExpeditionRow;
    return { row: updatedRow, state: nextState, definition: entry.definition, rewards };
  });

  return txn();
}

/**
 * Abandon an active run. Idempotent on already-ended rows: returns the
 * existing state unchanged rather than re-stamping.
 */
export function abandonExpeditionRun(
  walletAddress: string,
  tokenId: number,
  rowId: number,
): ExpeditionRunView {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const row = db.prepare(
      'SELECT * FROM sanctuary_expeditions WHERE id = ? AND wallet_address = ? AND token_id = ?'
    ).get(rowId, addr, tokenId) as SanctuaryExpeditionRow | undefined;
    if (!row) throw new Error('NOT_FOUND');

    const entry = getExpeditionCatalogEntry(row.expedition_id);
    if (!entry) throw new Error('EXPEDITION_NOT_FOUND');

    const progress = db.prepare(
      'SELECT * FROM sanctuary_expedition_progress WHERE expedition_row_id = ?'
    ).get(rowId) as SanctuaryExpeditionProgressRow | undefined;
    const state = rowToState(row, progress);
    if (state.status !== 'active') {
      return { row, state, definition: entry.definition };
    }

    const nextState = abandonExpedition(state);
    db.prepare(
      "UPDATE sanctuary_expeditions SET status = 'abandoned', ended_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(rowId);
    db.prepare(
      'UPDATE sanctuary_expedition_progress SET current_step_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE expedition_row_id = ?'
    ).run(rowId);

    const updatedRow = db.prepare('SELECT * FROM sanctuary_expeditions WHERE id = ?').get(rowId) as SanctuaryExpeditionRow;
    return { row: updatedRow, state: nextState, definition: entry.definition };
  });

  return txn();
}
