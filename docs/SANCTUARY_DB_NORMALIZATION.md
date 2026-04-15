# Star Sanctuary — Database Normalization Against Real SWO Architecture

> Decision record: how Sanctuary tables integrate with the existing SWO SQLite database.

**Status:** Decided  
**Date:** 2026-04-15  
**Author:** Clarvis (research engine)

---

## 1. Existing Architecture Summary

**Database:** Single SQLite file (`data/swo.db`) via `better-sqlite3`  
**Schema:** `scripts/init-db.sql` — 28 tables  
**ORM:** None (raw SQL in `lib/db.ts`)  
**Primary key pattern:** `wallet_address TEXT` (no users table — wallet IS the identity)

### Existing Tables That Sanctuary Touches

| Table | Sanctuary Role |
|-------|---------------|
| `star_skrumpey_metadata` | Source of truth for 333 NFTs: token_id, constellation, aura, form, mood, eyes, background. **Read-only** — Sanctuary never mutates NFT metadata. |
| `user_xp` | XP and levels from SWO participation. **Shared read** — Sanctuary reads XP to compute companion level. Does NOT duplicate XP tracking. |
| `user_profiles` | Display names, avatars, badges. **Read-only** — Sanctuary references profiles but doesn't modify them. |
| `quests` / `user_quests` | Existing quest system. **Coexist** — Sanctuary quests are separate (different quest_type values or separate table). |
| `online_presence` | Hangout Hub presence. **Parallel** — Sanctuary has its own location/activity state, not the chat lobby. |

### Key Constraint: wallet_address Is the FK

SWO has no `users` table. Every table FKs on `wallet_address TEXT`. Sanctuary tables must follow this pattern — no user IDs, no session tokens. Wallet address is the universal join key.

---

## 2. Integration Pattern: New Tables in Existing DB

**Decision: Add new `sanctuary_*` tables to the same `data/swo.db` file.**

Rationale:
- Single SQLite file = single backup, single migration path, single WAL
- Sanctuary needs JOINs to `star_skrumpey_metadata`, `user_xp`, `user_profiles` — separate DB would require ATTACH or API calls
- SWO's `init-db.sql` pattern already supports additive `CREATE TABLE IF NOT EXISTS`
- No parallel DB, no separate service — Sanctuary is a feature of SWO, not a microservice

### Migration Strategy

Add a new file: `scripts/init-sanctuary.sql` (or append to `init-db.sql`).  
The `lib/db.ts` `initializeDatabase()` function already runs `init-db.sql` on startup — either extend it or add a second file.

**Recommendation:** Separate file (`init-sanctuary.sql`) called from the same `initializeDatabase()`. This keeps the diff small and reviewable for PR #1.

---

## 3. Schema Boundary — What's New vs What's Reused

### REUSE (no new tables needed)

| Concept | Existing Table | Notes |
|---------|---------------|-------|
| NFT metadata (traits) | `star_skrumpey_metadata` | 333 rows, already populated from IPFS. Sanctuary reads constellation, aura, form, mood. |
| XP / Level | `user_xp` | Sanctuary companion level = f(user_xp.total_xp). No separate leveling table. |
| User identity | `user_profiles` | Display name, avatar for Sanctuary UI. |
| Wallet ownership | On-chain RPC query | Verify wallet owns token_id before allowing companion selection. |

### NEW TABLES (sanctuary_* namespace)

#### V1 — Foundation (PR #1-2)

```sql
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
  equipped_cosmetics TEXT DEFAULT '{}',  -- JSON: {slot: item_id}
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, token_id),
  FOREIGN KEY (token_id) REFERENCES star_skrumpey_metadata(token_id)
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_companions_wallet
  ON sanctuary_companions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_sanctuary_companions_active
  ON sanctuary_companions(wallet_address, is_active) WHERE is_active = 1;

-- Cosmetic items available in the shop
CREATE TABLE IF NOT EXISTS sanctuary_cosmetic_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('background', 'floor', 'decoration', 'accessory', 'animation')),
  rarity TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare', 'legendary')),
  star_cost INTEGER NOT NULL DEFAULT 10,
  level_required INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  asset_key TEXT NOT NULL,  -- frontend asset reference
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Per-user cosmetic ownership
CREATE TABLE IF NOT EXISTS sanctuary_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'shop' CHECK (source IN ('shop', 'quest', 'event', 'achievement', 'gift')),
  acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, item_id),
  FOREIGN KEY (item_id) REFERENCES sanctuary_cosmetic_items(id)
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_inventory_wallet
  ON sanctuary_inventory(wallet_address);

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
  metadata TEXT DEFAULT '{}',  -- JSON for structured data
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (token_id) REFERENCES star_skrumpey_metadata(token_id)
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_journal_companion
  ON sanctuary_journal(wallet_address, token_id, created_at DESC);
```

#### V2 — Quests & Achievements (later PRs)

```sql
-- Sanctuary-specific quest definitions (separate from existing quests table)
CREATE TABLE IF NOT EXISTS sanctuary_quests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  quest_type TEXT NOT NULL CHECK (quest_type IN ('errand', 'adventure', 'expedition')),
  duration_hours REAL NOT NULL DEFAULT 1.0,
  xp_reward INTEGER NOT NULL DEFAULT 10,
  star_reward INTEGER NOT NULL DEFAULT 0,
  story TEXT,  -- narrative text
  constellation_bonus TEXT,  -- which constellation gets bonus
  level_required INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Per-companion quest progress
CREATE TABLE IF NOT EXISTS sanctuary_quest_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  token_id INTEGER NOT NULL,
  quest_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'claimed')),
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completes_at DATETIME NOT NULL,
  choices TEXT DEFAULT '{}',  -- JSON for branching choices
  FOREIGN KEY (quest_id) REFERENCES sanctuary_quests(id),
  FOREIGN KEY (token_id) REFERENCES star_skrumpey_metadata(token_id)
);

-- Achievement badges (V2, on-chain optional)
CREATE TABLE IF NOT EXISTS sanctuary_badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  icon_key TEXT NOT NULL,
  is_soulbound INTEGER NOT NULL DEFAULT 1,
  on_chain_token_id INTEGER,  -- ERC-1155 token ID on Monad, NULL if off-chain only
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sanctuary_badge_awards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  badge_id INTEGER NOT NULL,
  awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  tx_hash TEXT,  -- on-chain tx if minted
  UNIQUE(wallet_address, badge_id),
  FOREIGN KEY (badge_id) REFERENCES sanctuary_badges(id)
);
```

#### V3 — Chat (deferred)

```sql
-- Companion chat messages (V3, only if AI chat is implemented)
CREATE TABLE IF NOT EXISTS sanctuary_chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  token_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'companion')),
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (token_id) REFERENCES star_skrumpey_metadata(token_id)
);

CREATE INDEX IF NOT EXISTS idx_sanctuary_chat_companion
  ON sanctuary_chat_messages(wallet_address, token_id, created_at DESC);
```

---

## 4. What We Explicitly Do NOT Create

| Concept | Why Not |
|---------|---------|
| `sanctuary_users` table | wallet_address is the identity — no separate user table |
| `sanctuary_xp` / `sanctuary_levels` | Reuse `user_xp` — companion level is derived from SWO XP |
| `sanctuary_nft_metadata` | Reuse `star_skrumpey_metadata` — never duplicate NFT data |
| Separate SQLite database | Single DB avoids ATTACH complexity, maintains single backup path |
| `sanctuary_star_balance` | STAR points already tracked in existing economy — add a shop spending API, don't duplicate balance |

---

## 5. Join Patterns

```sql
-- Get active companion with NFT metadata and user level
SELECT sc.*, ssm.constellation, ssm.aura, ssm.form, ssm.mood,
       ux.total_xp, ux.level
FROM sanctuary_companions sc
JOIN star_skrumpey_metadata ssm ON sc.token_id = ssm.token_id
LEFT JOIN user_xp ux ON sc.wallet_address = ux.wallet_address
WHERE sc.wallet_address = ? AND sc.is_active = 1;

-- Get all companions at a map location
SELECT sc.wallet_address, sc.token_id, sc.nickname, sc.current_activity,
       ssm.constellation, ssm.form, up.display_name
FROM sanctuary_companions sc
JOIN star_skrumpey_metadata ssm ON sc.token_id = ssm.token_id
LEFT JOIN user_profiles up ON sc.wallet_address = up.wallet_address
WHERE sc.current_activity = ?;
```

---

## 6. First PR Scope (Minimal Schema)

**PR #1 should add only:**
1. `scripts/init-sanctuary.sql` with `sanctuary_companions` + `sanctuary_map_locations` + `sanctuary_journal`
2. Update `lib/db.ts` `initializeDatabase()` to also run `init-sanctuary.sql`
3. API routes: `GET/POST /api/sanctuary/companion` (select active, fetch state)
4. Tests: companion selection, switching, unauthorized access

**Deferred from PR #1:** cosmetics, quests, badges, chat — these are V1.5+ features.

---

## 7. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Schema migration on live DB | `CREATE TABLE IF NOT EXISTS` is safe; SQLite supports additive DDL |
| Foreign key to `star_skrumpey_metadata` | Table already populated with all 333 NFTs — FK is reliable |
| XP race condition (SWO XP updates during sanctuary read) | SQLite WAL mode handles concurrent reads; read XP at request time |
| Cosmetics JSON in `equipped_cosmetics` | Keep it simple JSON `{slot: item_id}` — no nested structures |
| Wallet ownership verification | Must check on-chain ownership at companion selection time, not just DB FK |
