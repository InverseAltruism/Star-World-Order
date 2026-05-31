/**
 * SQLite connection + schema bootstrap for Star World Order.
 *
 * Owns the singleton DB handle (WAL, foreign_keys ON), on-disk path resolution,
 * and the idempotent CREATE TABLE schema (incl. the default-quests seed). Every
 * db domain helper and the `lib/db.ts` barrel obtains its handle via
 * getDatabase(). Extracted from the former 9.8k-line lib/db.ts god-file.
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

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

/**
 * Extra schema initializers registered by domain modules (e.g. the sanctuary
 * tail in lib/db.ts) so this connection module stays domain-agnostic. They run
 * once, after the core schema, on first getDatabase(). Registration happens at
 * module-load of the registering file, before any getDatabase() call.
 */
type SchemaInitializer = (database: Database.Database) => void;
const extraSchemaInitializers: SchemaInitializer[] = [];
export function registerSchemaInitializer(fn: SchemaInitializer): void {
  extraSchemaInitializers.push(fn);
}

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
 * Close database connection (for cleanup).
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
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

  // Domain-registered schema (e.g. sanctuary tables/seeds) — kept out of this
  // module so connection.ts has no dependency on the WIP sanctuary code.
  for (const init of extraSchemaInitializers) {
    init(database);
  }
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

