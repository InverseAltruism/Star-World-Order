-- Star Sanctuary — V1.6 Schema: Per-wallet player state (intro dialog, tutorial flags)
-- Run from lib/db.ts initializeSanctuary()

-- Per-wallet persistent player state (not tied to any specific companion/token)
CREATE TABLE IF NOT EXISTS sanctuary_player_state (
  wallet_address TEXT PRIMARY KEY,
  intro_completed INTEGER NOT NULL DEFAULT 0,
  first_visit_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_visit_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_visits INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_player_state_intro
  ON sanctuary_player_state(wallet_address, intro_completed);
