-- [SWO_V2_SANCTUARY_QUESTS_V2] Sanctuary economy redesign — Quests v2 + functional charms.
-- See docs/SANCTUARY_ECONOMY_REDESIGN.md. Idempotent; loaded by initializeSanctuary().

-- Functional shop items (charms / trinkets). Kept SEPARATE from
-- sanctuary_cosmetic_items so the cosmetics catalog + its spec tests stay intact.
-- These feed back into the win/lose engine via effect_type/effect_magnitude.
CREATE TABLE IF NOT EXISTS sanctuary_charm_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  rarity TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common','uncommon','rare','legendary')),
  star_cost INTEGER NOT NULL CHECK (star_cost >= 0),
  -- Trade-off charms: 'gambit' (wager) raises payout + stake cost; 'prospect'
  -- (earn) raises STAR payout + resource cost.
  effect_type TEXT NOT NULL CHECK (effect_type IN ('gambit','prospect')),
  upside REAL NOT NULL DEFAULT 0,   -- fraction added to the reward side
  downside REAL NOT NULL DEFAULT 0, -- fraction added to the cost side
  -- charges granted per purchase; a charge is consumed when its effect applies
  charges INTEGER NOT NULL DEFAULT 1 CHECK (charges >= 1),
  description TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Per-wallet charm stock (remaining charges). Bought from STAR, consumed by
-- quests/games. Shared per wallet, like the resource pool.
CREATE TABLE IF NOT EXISTS sanctuary_charm_stock (
  wallet_address TEXT NOT NULL,
  item_key TEXT NOT NULL,
  charges INTEGER NOT NULL DEFAULT 0 CHECK (charges >= 0),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (wallet_address, item_key),
  FOREIGN KEY (item_key) REFERENCES sanctuary_charm_items(item_key)
);

-- Quests v2: STAR-focused, wall-clock-timed quests. One row per started run.
CREATE TABLE IF NOT EXISTS sanctuary_quest_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  token_id INTEGER NOT NULL,
  quest_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('earn','wager')),
  tier TEXT,                                  -- wager tier label; NULL for earn
  cost_hunger INTEGER NOT NULL DEFAULT 0,
  cost_happiness INTEGER NOT NULL DEFAULT 0,
  cost_energy INTEGER NOT NULL DEFAULT 0,
  star_wager INTEGER NOT NULL DEFAULT 0,      -- staked up front (wager)
  win_chance REAL NOT NULL DEFAULT 0,         -- effective win chance after charm (0..1)
  payout_mult REAL NOT NULL DEFAULT 0,        -- on win, total = wager × mult
  star_reward INTEGER NOT NULL DEFAULT 0,     -- earn: guaranteed payout (settled on claim)
  charm_key TEXT,                             -- charm consumed at start, if any
  roll REAL,                                  -- the single RNG, frozen at start
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at DATETIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','claimed')),
  outcome TEXT CHECK (outcome IN ('win','lose','earn')),
  star_settled INTEGER,                       -- STAR credited on claim (0 on a loss)
  claimed_at DATETIME,
  FOREIGN KEY (token_id) REFERENCES star_skrumpey_metadata(token_id)
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_quest_runs_wallet
  ON sanctuary_quest_runs(wallet_address, status);
CREATE INDEX IF NOT EXISTS idx_sanctuary_quest_runs_active
  ON sanctuary_quest_runs(wallet_address, token_id, status);

-- Arcade wager sessions: a minigame played for STAR. Opened at start (resource
-- cost paid + stake debited), consumed at settle (payout credited by score).
-- One open session per wallet at a time; the stake is recorded server-side so
-- it can't be inflated at settle. [SWO_V2_SANCTUARY_QUESTS_V2]
CREATE TABLE IF NOT EXISTS sanctuary_arcade_session (
  wallet_address TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  stake INTEGER NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
