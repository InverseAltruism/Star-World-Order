-- [SWO_V2_SANCTUARY_STAR_ONCHAIN] Outbox for auto-minting/burning soulbound STAR
-- on Monad. earnStar/spendStar enqueue an op inside their DB txn (when
-- STAR_ONCHAIN_ENABLED); a cron worker drains the queue and mints/burns on-chain.
-- No claim button — STAR mirrors on-chain automatically as it's earned/spent.
-- Idempotent; loaded by initializeSanctuary().
CREATE TABLE IF NOT EXISTS sanctuary_star_onchain_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('mint','burn')),
  amount INTEGER NOT NULL CHECK (amount > 0),   -- integer STAR units (scaled ×1e18 on-chain)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','confirmed','failed')),
  tx_hash TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_star_onchain_queue_status
  ON sanctuary_star_onchain_queue(status, id);
CREATE INDEX IF NOT EXISTS idx_star_onchain_queue_wallet
  ON sanctuary_star_onchain_queue(wallet_address, created_at DESC);
