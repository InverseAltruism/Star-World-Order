-- Star Sanctuary — V1.9 Schema: LLM chat usage tracking
-- Run from lib/db.ts initializeSanctuary()

-- Per-call usage log for the LLM-backed companion chat. Used to enforce
-- per-day rate limits and to audit cost. Daily caps are computed by counting
-- rows where was_dry_run = 0 within a UTC date.
CREATE TABLE IF NOT EXISTS sanctuary_chat_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  token_id INTEGER NOT NULL,
  usage_date TEXT NOT NULL,
  model TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  was_dry_run INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_chat_usage_wallet_date
  ON sanctuary_chat_usage(wallet_address, usage_date);

CREATE INDEX IF NOT EXISTS idx_sanctuary_chat_usage_date
  ON sanctuary_chat_usage(usage_date);
