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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  `);
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
    WHERE created_at > ?
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
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  
  const stmt = db.prepare(`
    SELECT * FROM online_presence 
    WHERE last_seen > ?
    ORDER BY last_seen DESC
  `);
  return stmt.all(twoMinutesAgo) as OnlinePresence[];
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
 * Update or create user profile
 */
export function updateUserProfile(
  walletAddress: string,
  data: {
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
  }
): UserProfile {
  const db = getDatabase();
  
  const updateStmt = db.prepare(`
    INSERT INTO user_profiles (wallet_address, display_name, bio, avatar_url)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(wallet_address) DO UPDATE SET
      display_name = COALESCE(?, display_name),
      bio = COALESCE(?, bio),
      avatar_url = COALESCE(?, avatar_url),
      updated_at = CURRENT_TIMESTAMP
  `);
  
  updateStmt.run(
    walletAddress.toLowerCase(),
    data.displayName || null,
    data.bio || null,
    data.avatarUrl || null,
    data.displayName || null,
    data.bio || null,
    data.avatarUrl || null
  );
  
  const getStmt = db.prepare('SELECT * FROM user_profiles WHERE wallet_address = ?');
  return getStmt.get(walletAddress.toLowerCase()) as UserProfile;
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
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM chat_messages WHERE created_at < ?').run(dayAgo);
  
  // Remove stale online presence (older than 10 minutes)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM online_presence WHERE last_seen < ?').run(tenMinutesAgo);
  
  // End stale voice sessions
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  db.prepare(`
    UPDATE voice_sessions 
    SET is_active = 0, ended_at = CURRENT_TIMESTAMP 
    WHERE is_active = 1 AND created_at < ?
  `).run(hourAgo);
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
