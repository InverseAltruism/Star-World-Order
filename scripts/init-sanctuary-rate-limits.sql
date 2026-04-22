-- Star Sanctuary — Rate Limits (SQLite-backed)
-- Run from lib/db.ts initializeSanctuary()
-- H-3: Persistent rate-limit counters instead of in-memory

CREATE TABLE IF NOT EXISTS sanctuary_rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_rate_limits_lookup
  ON sanctuary_rate_limits(wallet_address, endpoint, created_at);
