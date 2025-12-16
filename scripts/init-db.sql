-- Star World Order Database Schema
-- SQLite Database Initialization Script
-- 
-- This script creates the necessary tables for the Star World Order application.
-- Run with: sqlite3 data/swo.db < scripts/init-db.sql

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- ============================================================
-- SOCIAL CONNECTIONS TABLE
-- ============================================================
-- Stores Discord and X (Twitter) OAuth connections for users
-- Links wallet addresses to their verified social accounts

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
);

-- Index for fast lookups by wallet address
CREATE INDEX IF NOT EXISTS idx_social_connections_wallet 
  ON social_connections(wallet_address);

-- Index for platform-based queries
CREATE INDEX IF NOT EXISTS idx_social_connections_platform 
  ON social_connections(platform);

-- ============================================================
-- CHAT MESSAGES TABLE
-- ============================================================
-- Stores chat messages for the Hangout Hub lobby

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_address TEXT NOT NULL,
  sender_display_name TEXT,
  message TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'chat' CHECK (message_type IN ('chat', 'system', 'emote')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast message retrieval
CREATE INDEX IF NOT EXISTS idx_chat_messages_created 
  ON chat_messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_sender 
  ON chat_messages(sender_address);

-- ============================================================
-- ONLINE PRESENCE TABLE
-- ============================================================
-- Tracks online users in the Hangout Hub lobby

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
);

-- Index for active users lookup
CREATE INDEX IF NOT EXISTS idx_online_presence_last_seen 
  ON online_presence(last_seen DESC);

-- ============================================================
-- VOICE CHAT SESSIONS TABLE
-- ============================================================
-- Tracks voice chat sessions and participants

CREATE TABLE IF NOT EXISTS voice_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME
);

CREATE TABLE IF NOT EXISTS voice_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  is_muted INTEGER NOT NULL DEFAULT 1,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME,
  FOREIGN KEY (session_id) REFERENCES voice_sessions(session_id),
  UNIQUE(session_id, wallet_address)
);

-- Index for voice session lookups
CREATE INDEX IF NOT EXISTS idx_voice_sessions_active 
  ON voice_sessions(is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_participants_session 
  ON voice_participants(session_id);

-- ============================================================
-- USER PROFILES TABLE
-- ============================================================
-- Stores additional profile data beyond NFT ownership

CREATE TABLE IF NOT EXISTS user_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL UNIQUE,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- STAR SKRUMPEY METADATA TABLE
-- ============================================================
-- Stores cached NFT metadata from IPFS for all 333 Star Skrumpeys
-- Run: npm run db:fetch-metadata to populate this table

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
);

-- Index for fast metadata lookups by token ID
CREATE INDEX IF NOT EXISTS idx_star_skrumpey_metadata_token 
  ON star_skrumpey_metadata(token_id);

-- Index for querying by constellation type
CREATE INDEX IF NOT EXISTS idx_star_skrumpey_metadata_constellation 
  ON star_skrumpey_metadata(constellation);

-- ============================================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================================

CREATE TRIGGER IF NOT EXISTS update_social_connections_timestamp 
  AFTER UPDATE ON social_connections
  FOR EACH ROW
BEGIN
  UPDATE social_connections SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS update_user_profiles_timestamp 
  AFTER UPDATE ON user_profiles
  FOR EACH ROW
BEGIN
  UPDATE user_profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS update_online_presence_last_seen 
  AFTER UPDATE ON online_presence
  FOR EACH ROW
BEGIN
  UPDATE online_presence SET last_seen = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS update_star_skrumpey_metadata_timestamp 
  AFTER UPDATE ON star_skrumpey_metadata
  FOR EACH ROW
BEGIN
  UPDATE star_skrumpey_metadata SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Verify tables were created
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
