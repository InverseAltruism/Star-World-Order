-- Star Sanctuary — V2.6 Schema: Multi-step expedition adventures
--
-- Persists the engine-agnostic expedition flow defined in
-- lib/sanctuary/expeditions.ts. Each row in `sanctuary_expeditions` is one
-- run of one expedition for one (wallet, token) pair. Per-step progress
-- (current step + choice history) is kept in `sanctuary_expedition_progress`
-- alongside it so the reducer can be rehydrated by id and choose/abandon
-- operations stay transactional.
--
-- Loaded by lib/db.ts initializeSanctuary(). Safe to re-run.

CREATE TABLE IF NOT EXISTS sanctuary_expeditions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  token_id INTEGER NOT NULL,
  expedition_id TEXT NOT NULL,
  star_cost INTEGER NOT NULL DEFAULT 0,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  outcome TEXT CHECK (outcome IN ('success', 'partial', 'failure')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  FOREIGN KEY (token_id) REFERENCES star_skrumpey_metadata(token_id)
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_expeditions_wallet_token
  ON sanctuary_expeditions(wallet_address, token_id);

CREATE INDEX IF NOT EXISTS idx_sanctuary_expeditions_active
  ON sanctuary_expeditions(wallet_address, token_id, status);

-- One progress row per expedition run. Holds the reducer's current step
-- and a JSON-serialized choice history (`choices_jsonb`). SQLite has no
-- native JSONB; we use TEXT and parse in app layer (matches the convention
-- already used elsewhere for serialized state).
CREATE TABLE IF NOT EXISTS sanctuary_expedition_progress (
  expedition_row_id INTEGER PRIMARY KEY,
  current_step_id TEXT,
  choices_jsonb TEXT NOT NULL DEFAULT '[]',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (expedition_row_id) REFERENCES sanctuary_expeditions(id) ON DELETE CASCADE
);
