-- Star Sanctuary — V2.2 Schema: Cosmetic shop + companion inventory
-- Run from lib/db.ts initializeSanctuary()
--
-- Adds two tables that, together with sanctuary_star_balance (V2.1) and the
-- equipped_cosmetics JSON column on sanctuary_companions (V1), implement the
-- cosmetic shop loop:
--   1. sanctuary_cosmetic_items  — catalog of buyable items (seeded)
--   2. sanctuary_companion_inventory — per-wallet ownership of catalog items
--
-- Equip state continues to live on sanctuary_companions.equipped_cosmetics so
-- two companions on the same wallet can wear different items from the shared
-- inventory.

CREATE TABLE IF NOT EXISTS sanctuary_cosmetic_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('hat', 'accessory', 'background', 'animation')),
  rarity TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare', 'legendary')),
  star_cost INTEGER NOT NULL CHECK (star_cost >= 0),
  level_required INTEGER NOT NULL DEFAULT 1 CHECK (level_required >= 1),
  description TEXT,
  asset_key TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_cosmetic_items_category
  ON sanctuary_cosmetic_items(category, star_cost);

-- Per-wallet inventory of owned cosmetic items. Items are wallet-scoped so
-- the holder can equip them on any of their companions.
CREATE TABLE IF NOT EXISTS sanctuary_companion_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  item_key TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'shop' CHECK (source IN ('shop', 'quest', 'event', 'achievement', 'gift')),
  acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, item_key),
  FOREIGN KEY (item_key) REFERENCES sanctuary_cosmetic_items(item_key)
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_inventory_wallet
  ON sanctuary_companion_inventory(wallet_address, acquired_at DESC);
