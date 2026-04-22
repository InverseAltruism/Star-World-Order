-- Star Sanctuary — V1.5 Schema: Chat, Traits, Quests
-- Run from lib/db.ts initializeSanctuary()

-- Chat messages between holder and companion
CREATE TABLE IF NOT EXISTS sanctuary_chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  token_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'companion')),
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (token_id) REFERENCES star_skrumpey_metadata(token_id)
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_chat_wallet_token
  ON sanctuary_chat_messages(wallet_address, token_id, created_at DESC);

-- Derived companion traits from behavior patterns
CREATE TABLE IF NOT EXISTS sanctuary_traits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  token_id INTEGER NOT NULL,
  trait_name TEXT NOT NULL,
  trait_category TEXT NOT NULL CHECK (trait_category IN ('social', 'explorer', 'gourmet', 'scholar', 'dreamer', 'special')),
  progress REAL NOT NULL DEFAULT 0.0,
  unlocked INTEGER NOT NULL DEFAULT 0,
  unlocked_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, token_id, trait_name),
  FOREIGN KEY (token_id) REFERENCES star_skrumpey_metadata(token_id)
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_traits_companion
  ON sanctuary_traits(wallet_address, token_id);

-- Seasonal quest definitions
CREATE TABLE IF NOT EXISTS sanctuary_quests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  quest_type TEXT NOT NULL CHECK (quest_type IN ('daily', 'weekly', 'seasonal')),
  requirement_type TEXT NOT NULL,
  requirement_count INTEGER NOT NULL DEFAULT 1,
  reward_xp INTEGER NOT NULL DEFAULT 0,
  reward_bond REAL NOT NULL DEFAULT 0.0,
  reward_trait TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  starts_at DATETIME,
  ends_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Per-holder quest progress
CREATE TABLE IF NOT EXISTS sanctuary_quest_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  token_id INTEGER NOT NULL,
  quest_id INTEGER NOT NULL,
  current_count INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at DATETIME,
  reward_claimed INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, token_id, quest_id),
  FOREIGN KEY (quest_id) REFERENCES sanctuary_quests(id),
  FOREIGN KEY (token_id) REFERENCES star_skrumpey_metadata(token_id)
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_quest_progress_wallet
  ON sanctuary_quest_progress(wallet_address, token_id);

-- Add 'chat' to journal entry_type check constraint
-- SQLite doesn't support ALTER CHECK, but the entry_type is enforced at app level
-- The V1 schema allows: activity, interaction, quest, achievement, system
-- V1.5 adds: chat, trait (app-level enforcement only)
