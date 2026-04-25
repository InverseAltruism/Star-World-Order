-- Star Sanctuary — V2.1 Schema: STAR currency storage
-- Run from lib/db.ts initializeSanctuary()
--
-- STAR is the in-Sanctuary soft currency awarded for quest completion,
-- minigame first-plays, daily login, activity completion, and level-ups.
-- It is spent in the cosmetic Shop (see [SWO_V2_SHOP_BACKEND]).
--
-- Notes
--  • One row per wallet (PRIMARY KEY) — STAR is wallet-scoped, not per-companion.
--  • `lifetime_earned` is monotonic (never decremented on spend) for analytics
--    and future achievement gating.
--  • Earn endpoint is server-internal only (called by quest/activity/minigame
--    completion handlers). Spend is invoked by the Shop buy endpoint.

CREATE TABLE IF NOT EXISTS sanctuary_star_balance (
  wallet_address TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  lifetime_earned INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_star_balance_lifetime
  ON sanctuary_star_balance(lifetime_earned DESC);

-- Audit log of every earn/spend event for debugging, anti-fraud, and analytics.
-- Earn `source` examples: quest:<id>, minigame:<name>:first, login:daily,
-- activity:<name>, levelup:<level>. Spend `source`: shop:<item_id>.
CREATE TABLE IF NOT EXISTS sanctuary_star_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  delta INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('earn', 'spend')),
  source TEXT NOT NULL,
  balance_after INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_star_ledger_wallet
  ON sanctuary_star_ledger(wallet_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sanctuary_star_ledger_source
  ON sanctuary_star_ledger(source, created_at DESC);
