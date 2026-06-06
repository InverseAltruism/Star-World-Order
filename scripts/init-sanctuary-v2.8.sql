-- Star Sanctuary — V2.8: shared per-wallet resource economy
-- [SWO_V2_SANCTUARY_ECONOMY_REDESIGN] — see docs/SANCTUARY_ECONOMY_REDESIGN.md
--
-- Resources (hunger / happiness / energy) move from per-Skrumpey columns on
-- sanctuary_companions to a single per-wallet pool that quick actions fill and
-- quests/games spend. Level/bond/traits/cosmetics stay per-Skrumpey.
--
-- Loaded by lib/db.ts initializeSanctuary(). Safe to re-run.

CREATE TABLE IF NOT EXISTS sanctuary_wallet_resources (
  wallet_address TEXT PRIMARY KEY,
  hunger REAL NOT NULL DEFAULT 100,
  happiness REAL NOT NULL DEFAULT 100,
  energy REAL NOT NULL DEFAULT 100,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Per-action usage: a rolling 24h counter + last-used timestamp powers the
-- "Feed 3/5 today · ready in 28s" UI and enforces the cooldown + daily limit
-- server-side. One row per (wallet, action).
CREATE TABLE IF NOT EXISTS sanctuary_action_usage (
  wallet_address TEXT NOT NULL,
  action TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  window_start DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  PRIMARY KEY (wallet_address, action)
);
