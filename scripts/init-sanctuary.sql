-- Star Sanctuary — V1 Foundation Schema
-- Run from lib/db.ts initializeDatabase() via initializeSanctuary()

-- Core companion state: which Skrumpey is active, its persistent state
CREATE TABLE IF NOT EXISTS sanctuary_companions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  token_id INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  nickname TEXT,
  current_activity TEXT DEFAULT 'lounging',
  activity_started_at DATETIME,
  activity_ends_at DATETIME,
  bond_score REAL NOT NULL DEFAULT 0.0,
  total_interactions INTEGER NOT NULL DEFAULT 0,
  equipped_cosmetics TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, token_id),
  FOREIGN KEY (token_id) REFERENCES star_skrumpey_metadata(token_id)
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_companions_wallet
  ON sanctuary_companions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_sanctuary_companions_active
  ON sanctuary_companions(wallet_address, is_active) WHERE is_active = 1;

-- World map location definitions (seeded, not user-created)
CREATE TABLE IF NOT EXISTS sanctuary_map_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  max_capacity INTEGER DEFAULT 20,
  unlock_level INTEGER DEFAULT 1,
  position_x REAL NOT NULL DEFAULT 0,
  position_y REAL NOT NULL DEFAULT 0
);

-- Activity/interaction journal entries per companion
CREATE TABLE IF NOT EXISTS sanctuary_journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  token_id INTEGER NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('activity', 'interaction', 'quest', 'achievement', 'system')),
  content TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (token_id) REFERENCES star_skrumpey_metadata(token_id)
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_journal_companion
  ON sanctuary_journal(wallet_address, token_id, created_at DESC);
