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

  // Star Skrumpey metadata table - stores all NFT metadata from IPFS
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
      attributes_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

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

  // Insert default quests if none exist
  insertDefaultQuests(database);
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
    avatarUrl?: string;
    displayedBadges?: string[];
  }
): UserProfile {
  const db = getDatabase();
  
  // Convert displayedBadges array to JSON string for storage
  const badgesJson = data.displayedBadges ? JSON.stringify(data.displayedBadges) : null;
  
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
    data.avatarUrl || null,
    badgesJson,
    data.displayName || null,
    data.bio || null,
    data.avatarUrl || null,
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
  created_at: string;
}

export interface RaffleEntry {
  id: number;
  raffle_id: string;
  wallet_address: string;
  tier: 'star_forged' | 'cosmic_warden' | 'star_lord' | 'cosmic_emperor';
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
export function calculateHolderTier(starCount: number): { tier: HolderTier; entries: number; name: string } | null {
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
  
  // Create raffle entries table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS raffle_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raffle_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      tier TEXT NOT NULL CHECK (tier IN ('star_forged', 'cosmic_warden', 'star_lord', 'cosmic_emperor')),
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
    INSERT INTO raffles (id, name, description, prize_description, prize_image_url, created_by, start_time, end_time, discord_bonus_enabled, require_x, require_discord, tweet_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    data.tweetUrl || null
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
 */
export function enterRaffle(data: {
  raffleId: string;
  walletAddress: string;
  starCount: number;
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
  
  // Calculate tier and entries
  const tierInfo = calculateHolderTier(data.starCount);
  if (!tierInfo) {
    return null; // Not a holder
  }
  
  // Calculate total entries (base + engagement bonus for Like & RT)
  let totalEntries = tierInfo.entries;
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
      tierInfo.tier,
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
 * Draw a winner for a raffle using verifiable randomness
 * Uses block hash + raffle ID + timestamp as seed
 */
export function drawRaffleWinner(raffleId: string, blockHash: string): {
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
  
  // Generate verifiable seed
  const timestamp = Date.now().toString();
  const seedString = `${blockHash}-${raffleId}-${timestamp}-${entries.length}`;
  
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
