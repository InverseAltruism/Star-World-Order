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
-- FUTURE TABLES (PLACEHOLDER)
-- ============================================================

-- User profiles (for additional profile data beyond NFT ownership)
-- CREATE TABLE IF NOT EXISTS user_profiles (
--   id INTEGER PRIMARY KEY AUTOINCREMENT,
--   wallet_address TEXT NOT NULL UNIQUE,
--   display_name TEXT,
--   bio TEXT,
--   avatar_url TEXT,
--   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
--   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
-- );

-- Forum posts (if moving from on-chain to hybrid storage)
-- CREATE TABLE IF NOT EXISTS forum_posts (
--   id INTEGER PRIMARY KEY AUTOINCREMENT,
--   thread_id INTEGER,
--   author_wallet TEXT NOT NULL,
--   content TEXT NOT NULL,
--   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
--   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (thread_id) REFERENCES forum_threads(id)
-- );

-- ============================================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================================

CREATE TRIGGER IF NOT EXISTS update_social_connections_timestamp 
  AFTER UPDATE ON social_connections
  FOR EACH ROW
BEGIN
  UPDATE social_connections SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Verify tables were created
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
