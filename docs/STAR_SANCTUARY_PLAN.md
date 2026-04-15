# Star Sanctuary — Product & Delivery Plan

> A companion subsite where Star Skrumpey holders select an active Skrumpey, interact with it, level it through SWO participation, send it on quests and activities, unlock rooms and cosmetics, and optionally chat with it via lightweight AI. A shared world map shows all Skrumpeys in real-time.

**Status:** Planning  
**Author:** Clarvis (executive function)  
**Created:** 2026-04-14  
**Last updated:** 2026-04-14

---

## 1. Product Brief

### 1.1 Why This Fits SWO Now

SWO has strong social infrastructure (chat, voice, profiles, friends, governance, raffles) and emerging gamification (quests, XP, STAR staking). But there's no persistent emotional bond between a holder and their specific NFT. The NFTs are profile pictures and access tokens — not characters with personality, history, or growth.

Star Sanctuary bridges that gap. It gives every Star Skrumpey a living presence inside SWO, turning a static collectible into a companion that reflects the holder's engagement. This deepens retention (daily reasons to visit), strengthens community identity (your Skrumpey has a visible life in the shared world), and creates a cosmetic economy that rewards participation without requiring cash extraction.

Timing rationale:
- The quest and XP systems are already live — Sanctuary extends them rather than replacing them
- STAR points exist but lack meaningful sinks — Sanctuary provides one
- The community is mature enough (333 NFTs, established governance) to embrace a feature that rewards sustained engagement
- Monad's low gas costs make selective on-chain moments (soulbound badges, commemoratives) economically viable

### 1.2 Design Principles

1. **Charm over chore.** Interactions should feel delightful, never obligatory. No punishment for missing a day. No anxiety-inducing decay mechanics. A Skrumpey left alone for a week is sleepy and happy to see you, not starving.
2. **Participation = progression.** Level your Skrumpey by doing things you'd already do on SWO: voting, chatting, trading, entering raffles. Sanctuary amplifies existing behavior rather than creating parallel grind loops.
3. **Cosmetic depth, economic restraint.** Rooms, animations, accessories, titles — not token rewards. Cash rewards are rare commemorative drops, not farmable income. The economy is a faucet (STAR points from participation) draining into a cosmetic shop.
4. **Shared world, personal space.** The public sanctuary map shows everyone's Skrumpeys doing things. Your personal room is your private customization space. Social pressure comes from visible status, not leaderboard anxiety.
5. **Off-chain by default, on-chain by intention.** Progression, inventory, and cosmetics live in SQLite. Only identity-anchoring elements (soulbound achievement badges, commemorative event tokens) go on-chain via Monad.
6. **Lightweight AI, heavy personality.** Chat is optional, conversational, and personalized to the Skrumpey's constellation/mood/aura. It should feel like talking to your pet, not a support agent. No hallucinated financial advice.

### 1.3 Emotional Goals

- **Pride:** "Look at my Skrumpey's room — I unlocked the Nebula background"
- **Warmth:** "My Skrumpey sent me a message after I voted on a proposal"
- **Curiosity:** "I wonder what the Cosmic quest chain unlocks at the end"
- **Social delight:** "I can see 12 Skrumpeys lounging in the hot springs right now"
- **Collection satisfaction:** "I've unlocked 40/75 room items"

### 1.4 Anti-Goals

- **No pay-to-win.** Spending MON or real money should never be the fastest progression path. Participation always outpaces purchasing.
- **No anxiety mechanics.** No hunger bars, no health decay, no "your Skrumpey is sad because you didn't log in." Time away is neutral or gently positive ("your Skrumpey rested and has bonus energy").
- **No metadata mutation.** The base NFT (token ID, constellation, aura, form, mood, eyes, background) is immutable. Sanctuary state is a separate layer that references the NFT but never modifies it.
- **No speculative economy.** Cosmetics are not tradeable or resalable. No secondary market for room items. This prevents wash trading and keeps the economy about expression, not extraction.
- **No mandatory AI.** Chat is opt-in. A holder who never opens chat loses nothing. AI never initiates DMs or notifications without explicit opt-in.
- **No PvP competition.** Sanctuary is cooperative/parallel. No "my Skrumpey beat your Skrumpey" mechanics. Quest leaderboards show participation, not dominance.

---

## 2. V1 / V2 / V3 Roadmap

### V1 — "My Skrumpey Lives Here" (Foundation)

**Scope:** Active Skrumpey selection, basic room, passive activities, STAR shop, sanctuary world map.

| Feature | Description |
|---------|-------------|
| **Active Skrumpey** | Each wallet selects one Star Skrumpey as their "active companion." Stored off-chain. Can switch anytime (24h cooldown to prevent gaming). |
| **Skrumpey Profile** | Dedicated page showing your active Skrumpey's stats: level, mood, current activity, equipped cosmetics, achievement count. |
| **Personal Room** | A single customizable room. Default room themed to the Skrumpey's constellation. 3x3 grid of decoration slots + background + floor. |
| **Passive Activities** | Skrumpey can be set to an activity: Lounging, Training, Exploring, Studying, Socializing. Each maps to a stat boost and takes 1-8 hours. No active input needed — set and forget. |
| **Sanctuary Map** | Shared read-only view showing all active Skrumpeys and their current activities. Filterable by constellation. Click a Skrumpey to see its public profile. |
| **STAR Shop V1** | 15-25 cosmetic items purchasable with STAR points: room backgrounds, floor tiles, small decorations. Priced 5-50 STAR. |
| **Participation XP Bridge** | Existing SWO actions (vote, chat, trade, enter raffle, complete quest) passively grant Sanctuary XP to the active Skrumpey. No new actions required. |
| **Leveling** | Skrumpey levels 1-20. Each level unlocks a cosmetic slot or shop item. XP curve is logarithmic — early levels fast, later levels reward sustained engagement. |

**Scope boundary:** No quests, no AI chat, no on-chain elements, no animations.

### V2 — "Adventures & Expression" (Engagement)

**Scope:** Quest/activity system, room upgrades, cosmetic animations, soulbound badges.

| Feature | Description |
|---------|-------------|
| **Sanctuary Quests** | Dedicated quest chains (separate from existing SWO quests). 3 types: Errand (1-4h, small reward), Adventure (8-24h, medium reward + story), Expedition (3-7 days, rare cosmetic + lore). Skrumpey is "away" during quest and visible on the map at quest location. |
| **Quest Stories** | Each quest has 2-3 narrative beats shown as illustrated text cards. Stories reference the Skrumpey's constellation traits. Branching choices at key moments affect reward tier (not success/failure — all quests succeed). |
| **Room Upgrades** | Expand from 3x3 to 4x4, then 5x5 grid. Unlock additional rooms (Garden, Workshop, Library) at levels 10, 15, 20. Each room type has unique decoration categories. |
| **Animations** | Idle animations for Skrumpeys in rooms and on the map. 5 base animations per activity type. Premium animations in the STAR shop. |
| **Soulbound Badges** | On-chain (Monad) ERC-1155 soulbound tokens for milestone achievements: "First Quest," "Level 10," "100 Votes Cast," "Founding Explorer." Non-transferable, commemorative only. |
| **STAR Shop V2** | Expand to 50-75 items. Add animated decorations, room themes, Skrumpey accessories (hats, scarves, auras). Introduce seasonal/limited items. |
| **Activity Log** | Visible history of what your Skrumpey has been doing: quests completed, items acquired, badges earned. Public/private toggle. |

**Scope boundary:** No AI chat, no multi-Skrumpey parties, no trading.

### V3 — "Personality & Community" (Depth)

**Scope:** AI companion chat, group activities, events, advanced world map.

| Feature | Description |
|---------|-------------|
| **Companion Chat** | Opt-in conversational AI. Personality derived from NFT traits (constellation = archetype, mood = tone, aura = vocabulary). Lightweight model (Gemini Flash or local Qwen via OpenRouter). Conversations stored off-chain, per-Skrumpey. 50 messages/day cap. |
| **Personality Evolution** | Chat personality subtly shifts based on the Skrumpey's quest history and level. A well-traveled Skrumpey references past adventures. A high-governance Skrumpey has opinions about proposals. |
| **Group Activities** | 2-4 Skrumpeys can embark on group quests together. Visible on the map as a party. Group quests have better rewards. Requires friend connections between holders. |
| **Community Events** | Time-limited sanctuary events (e.g., "Constellation Festival" — 1 week, unique quest chain, limited cosmetics, event leaderboard). |
| **Live World Map** | Upgrade from static to animated map. Skrumpeys move between locations. Weather/time-of-day cycles. Click to visit another holder's room (read-only). |
| **Commemorative Mints** | On-chain commemorative NFTs (ERC-1155, Monad) for event participation. Not soulbound — these are tradeable collectibles that prove "I was there." Rare, max 2-3 per quarter. |
| **Room Visitors** | Other holders can visit your room (read-only). Visitor count displayed. Optional guestbook. |

**Scope boundary:** No breeding, no PvP, no real-money cosmetics, no cross-collection support.

---

## 3. System Design

### 3.1 Data Model

All new tables in the existing `lib/db.ts` SQLite database (`data/swo.db`).

```
sanctuary_companions
├── id: INTEGER PRIMARY KEY
├── wallet_address: TEXT NOT NULL (FK → implicit, indexed)
├── token_id: INTEGER NOT NULL (the active Star Skrumpey)
├── name: TEXT (optional nickname, max 24 chars)
├── level: INTEGER DEFAULT 1 (1-20 in V1, expandable)
├── total_xp: INTEGER DEFAULT 0
├── current_activity: TEXT ('lounging'|'training'|'exploring'|'studying'|'socializing'|'questing'|'idle')
├── activity_started_at: DATETIME
├── activity_ends_at: DATETIME
├── equipped_cosmetics_json: TEXT (JSON: {background, floor, slots: {pos: item_id}})
├── stats_json: TEXT (JSON: {charm, wisdom, courage, endurance, social})
├── last_interaction_at: DATETIME
├── created_at: DATETIME
├── updated_at: DATETIME
└── UNIQUE(wallet_address) -- one active companion per wallet

sanctuary_cosmetic_items
├── id: TEXT PRIMARY KEY (e.g., 'bg_nebula_purple', 'deco_crystal_lamp')
├── name: TEXT NOT NULL
├── description: TEXT
├── category: TEXT ('background'|'floor'|'decoration'|'accessory'|'animation'|'room_theme')
├── rarity: TEXT ('common'|'uncommon'|'rare'|'epic'|'legendary')
├── star_cost: INTEGER NOT NULL (STAR points price)
├── level_required: INTEGER DEFAULT 1
├── constellation_required: TEXT (NULL = any)
├── is_limited: INTEGER DEFAULT 0
├── is_active: INTEGER DEFAULT 1
├── icon_url: TEXT
├── preview_url: TEXT
├── metadata_json: TEXT (animation data, grid size, etc.)
└── created_at: DATETIME

sanctuary_inventory
├── id: INTEGER PRIMARY KEY
├── wallet_address: TEXT NOT NULL
├── item_id: TEXT NOT NULL (FK → sanctuary_cosmetic_items.id)
├── acquired_at: DATETIME
├── source: TEXT ('shop'|'quest'|'achievement'|'event'|'level_up')
└── UNIQUE(wallet_address, item_id)

sanctuary_quests (V2)
├── id: TEXT PRIMARY KEY
├── name: TEXT NOT NULL
├── description: TEXT NOT NULL
├── quest_type: TEXT ('errand'|'adventure'|'expedition')
├── duration_hours: INTEGER NOT NULL
├── xp_reward: INTEGER NOT NULL
├── star_reward: INTEGER DEFAULT 0
├── item_rewards_json: TEXT (JSON array of item IDs, probability)
├── story_json: TEXT (JSON: [{beat, text, image_url, choices}])
├── constellation_bonus: TEXT (constellation that gets bonus rewards)
├── level_required: INTEGER DEFAULT 1
├── prerequisites_json: TEXT (quest IDs that must be completed first)
├── is_active: INTEGER DEFAULT 1
├── is_repeatable: INTEGER DEFAULT 0
├── cooldown_hours: INTEGER DEFAULT 0
└── created_at: DATETIME

sanctuary_quest_log (V2)
├── id: INTEGER PRIMARY KEY
├── wallet_address: TEXT NOT NULL
├── quest_id: TEXT NOT NULL (FK → sanctuary_quests.id)
├── status: TEXT ('active'|'completed'|'abandoned')
├── started_at: DATETIME NOT NULL
├── completes_at: DATETIME NOT NULL
├── completed_at: DATETIME
├── choices_json: TEXT (JSON: story branch choices made)
├── rewards_claimed: INTEGER DEFAULT 0
├── rewards_json: TEXT (JSON: actual rewards rolled)
└── created_at: DATETIME

sanctuary_map_locations
├── id: TEXT PRIMARY KEY (e.g., 'hot_springs', 'crystal_caves', 'training_grounds')
├── name: TEXT NOT NULL
├── description: TEXT
├── category: TEXT ('rest'|'training'|'exploration'|'social'|'quest')
├── capacity: INTEGER DEFAULT 50
├── position_x: REAL NOT NULL (map coordinate)
├── position_y: REAL NOT NULL (map coordinate)
├── icon_url: TEXT
├── unlock_level: INTEGER DEFAULT 1
└── is_active: INTEGER DEFAULT 1

sanctuary_badges (V2, on-chain reference)
├── id: TEXT PRIMARY KEY
├── name: TEXT NOT NULL
├── description: TEXT NOT NULL
├── badge_type: TEXT ('milestone'|'event'|'commemorative')
├── icon_url: TEXT
├── on_chain_token_id: INTEGER (ERC-1155 token ID on Monad, NULL if not yet minted)
├── is_soulbound: INTEGER DEFAULT 1
├── criteria_json: TEXT (JSON: conditions for earning)
└── created_at: DATETIME

sanctuary_badge_awards
├── id: INTEGER PRIMARY KEY
├── wallet_address: TEXT NOT NULL
├── badge_id: TEXT NOT NULL (FK → sanctuary_badges.id)
├── awarded_at: DATETIME NOT NULL
├── tx_hash: TEXT (on-chain mint tx, NULL if off-chain only)
└── UNIQUE(wallet_address, badge_id)

sanctuary_chat_messages (V3)
├── id: INTEGER PRIMARY KEY
├── wallet_address: TEXT NOT NULL
├── token_id: INTEGER NOT NULL
├── role: TEXT ('user'|'companion')
├── content: TEXT NOT NULL
├── created_at: DATETIME
└── INDEX(wallet_address, token_id, created_at DESC)
```

### 3.2 Progression Loops

```
                    ┌──────────────────────────────────────────┐
                    │           PARTICIPATION LOOP              │
                    │  (do normal SWO things → earn Sanctuary XP) │
                    └────────────────┬─────────────────────────┘
                                     │
              ┌──────────────────────▼──────────────────────┐
              │              LEVEL UP                        │
              │  XP thresholds: 100, 300, 600, 1000, ...    │
              │  Each level → unlock cosmetic slot or item   │
              └──────┬──────────────────────┬───────────────┘
                     │                      │
          ┌──────────▼─────────┐  ┌────────▼────────────┐
          │   COSMETIC LOOP    │  │   ACTIVITY LOOP     │
          │ Earn STAR → Shop → │  │ Set activity →      │
          │ Equip → Show off   │  │ Wait → Collect stat │
          │ in room / map      │  │ boost + small XP    │
          └────────────────────┘  └─────────────────────┘
                     │                      │
              ┌──────▼──────────────────────▼───────────────┐
              │              QUEST LOOP (V2)                 │
              │  Pick quest → Skrumpey goes on adventure →  │
              │  Story beats → Rewards (XP, STAR, cosmetics)│
              │  Visible on map → Social proof               │
              └──────────────────────────────────────────────┘
```

**XP Sources (V1):**

| SWO Action | Sanctuary XP | Notes |
|------------|-------------|-------|
| Cast a governance vote | 25 | Per proposal |
| Send 10 chat messages (Hangout) | 10 | Daily cap: 50 XP |
| Complete an existing SWO quest | 15 | Bridges quest systems |
| Enter a raffle | 10 | Per raffle |
| List or buy on marketplace | 20 | Per transaction |
| Set an activity for Skrumpey | 5 | Per activity set |
| Complete an activity timer | 10-30 | Based on duration |
| Daily login (visit Sanctuary) | 5 | Once per day |

**Level XP Thresholds:**

| Level | Total XP | Unlock |
|-------|----------|--------|
| 1 | 0 | Base room (3x3), 1 deco slot |
| 2 | 100 | Floor slot |
| 3 | 300 | Background slot |
| 4 | 600 | 2nd deco slot |
| 5 | 1,000 | Shop tier 2 items |
| 7 | 2,000 | 3rd deco slot |
| 10 | 4,500 | Room expansion (4x4) (V2) |
| 15 | 10,000 | Garden room (V2) |
| 20 | 20,000 | Workshop room (V2) |

### 3.3 Currencies & Resources

| Resource | Earn | Spend | On-chain? |
|----------|------|-------|-----------|
| **Sanctuary XP** | SWO participation, activities, quests | Level progression (automatic) | No |
| **STAR Points** | NFT staking (existing system) | Cosmetic shop purchases | No (existing localStorage, migrate to SQLite) |
| **Quest Tokens** (V2) | Complete quest chains | Unlock gated quest lines | No |

No new tokens or currencies. STAR points become the universal soft currency — earned through staking (already live), spent in the Sanctuary shop. This gives STAR points a purpose they currently lack.

### 3.4 Public Map / World

The Sanctuary Map is a 2D illustrated view (not a game engine — CSS/SVG/Canvas).

**V1 Architecture:**
- Static SVG base map with 8-12 named locations
- Each location shows a count of Skrumpeys + small avatar previews (max 8 shown, "+N more")
- Skrumpey positions determined by their `current_activity` → maps to a location
- API endpoint: `GET /api/sanctuary/map` returns `{locations: [{id, name, skrumpeys: [{token_id, wallet, activity, constellation}]}]}`
- Polling refresh: every 60 seconds (or SSE in V3)
- Click location → see list of Skrumpeys there → click Skrumpey → view public profile

**Map Locations (V1):**
- Hot Springs (lounging)
- Training Grounds (training)
- Crystal Caves (exploring)
- Grand Library (studying)
- Town Square (socializing)
- Quest Board (questing — V2)
- The Bazaar (shop)
- Constellation Shrine (idle/default)

### 3.5 Quest / Activity Model (V2)

**Activities (V1 — passive):**
- Player selects an activity → Skrumpey timer starts
- When timer completes: +XP, +small stat boost, Skrumpey returns to idle
- No failure state. Timer runs in background (server calculates completion based on `activity_started_at` + duration).
- One activity at a time.

**Quests (V2 — narrative):**
```
Quest Lifecycle:
  Available → Accepted → In Progress → Story Beat 1 → [Choice] →
  Story Beat 2 → [Choice] → Completed → Claim Rewards

Quest Types:
  Errand:     1-4h,   50-100 XP,   5-15 STAR,  common cosmetic (30% drop)
  Adventure:  8-24h,  200-400 XP,  20-50 STAR,  uncommon cosmetic (50% drop)
  Expedition: 3-7d,   800-1500 XP, 50-100 STAR, rare+ cosmetic (guaranteed)
```

Quest availability is seeded weekly. Some quests require specific constellation (lore tie-in). Prerequisites form chains (Adventure A → Adventure B → Expedition C).

### 3.6 Room / Shop / Cosmetics

**Room System:**
- Each room is a grid (3x3 V1, expandable V2)
- Grid slots hold decoration items
- Background and floor are full-room layers behind the grid
- Accessories attach to the Skrumpey sprite (V2)
- All cosmetics are non-tradeable, wallet-bound

**Shop Architecture:**
- `GET /api/sanctuary/shop` — returns available items (filtered by level, active status)
- `POST /api/sanctuary/shop/buy` — deducts STAR, adds to inventory
- Items seeded via admin panel or migration script
- Limited items have purchase counts and expiry dates

**Cosmetic Categories:**
| Category | Examples | Count (V1) | Count (V2) |
|----------|----------|-----------|-----------|
| Backgrounds | Nebula, Forest, Ocean, Void | 8 | 20 |
| Floors | Stone, Grass, Crystal, Cloud | 6 | 15 |
| Decorations | Lamp, Plant, Bookshelf, Trophy | 12 | 40 |
| Accessories | — | — | 20 (hats, scarves) |
| Animations | — | — | 10 (idle, sleep, dance) |

### 3.7 Chat Architecture (V3)

```
User → POST /api/sanctuary/chat
       ├── Wallet auth (existing)
       ├── Rate limit: 50 msgs/day per wallet
       ├── Build system prompt from NFT traits:
       │   constellation → archetype (e.g., Orion = adventurous)
       │   mood → tone (e.g., cheerful = upbeat)
       │   aura → vocabulary (e.g., cosmic = space metaphors)
       │   level → maturity (higher level = more references to past)
       │   quest history → memory (references completed quests)
       ├── Last 20 messages as context
       ├── LLM call (OpenRouter → Gemini Flash or similar, ~$0.001/msg)
       └── Store response in sanctuary_chat_messages
```

**Safety rails:**
- No financial advice, no token price discussion
- No generating URLs or links
- Content filter on both input and output
- Conversations are private (only the holder sees them)
- Total cost estimate: ~$0.50/day for 500 messages across all users

### 3.8 On-Chain vs Off-Chain Boundaries

| Element | Storage | Rationale |
|---------|---------|-----------|
| Active companion selection | SQLite | Frequent changes, no value at stake |
| Room layout & cosmetics | SQLite | High-frequency updates, no transferability |
| XP, level, stats | SQLite | Game state, not an asset |
| STAR point balances | SQLite (migrate from localStorage) | Currency, needs server authority |
| Quest progress | SQLite | Ephemeral game state |
| Chat history | SQLite | Private, high volume |
| **Soulbound badges** | **Monad ERC-1155** | Identity, permanent achievement proof |
| **Commemorative event tokens** | **Monad ERC-1155** | Tradeable proof-of-participation |
| **Companion identity anchor** | **Monad (optional V3)** | Binds off-chain state to on-chain NFT ownership |

On-chain contract: A single `SanctuaryBadges.sol` (ERC-1155, Ownable, soulbound transfer override). Deployed once, mints new token IDs for each badge type. Estimated 5-10 badge types in V2.

---

## 4. Implementation Sequencing

### Milestone 1: Foundation (V1 Core) — 8-10 PRs

| # | PR | Dependencies | Effort |
|---|-----|-------------|--------|
| 1.1 | **DB schema: sanctuary tables** — Add `sanctuary_companions`, `sanctuary_cosmetic_items`, `sanctuary_inventory`, `sanctuary_map_locations` to `lib/db.ts`. Seed 8 map locations. | None | S |
| 1.2 | **API: companion CRUD** — `POST /api/sanctuary/companion/select`, `GET /api/sanctuary/companion`, `PATCH /api/sanctuary/companion` (nickname, activity). Wallet auth. 24h switch cooldown. | 1.1 | M |
| 1.3 | **API: STAR balance migration** — Move STAR points from localStorage to `user_star_balance` table. Add `GET /api/sanctuary/balance`, `POST /api/sanctuary/balance/spend`. | 1.1 | M |
| 1.4 | **API: shop & inventory** — `GET /api/sanctuary/shop`, `POST /api/sanctuary/shop/buy`, `GET /api/sanctuary/inventory`. Item seeding script. | 1.1, 1.3 | M |
| 1.5 | **API: map data** — `GET /api/sanctuary/map` returns locations with Skrumpey counts and previews. | 1.1, 1.2 | S |
| 1.6 | **API: XP bridge** — Hook into existing SWO actions (vote, chat, trade, raffle, quest complete) to grant Sanctuary XP. Level-up logic. | 1.2 | M |
| 1.7 | **UI: Sanctuary landing + companion profile** — `/sanctuary` route. Active Skrumpey display, stats, level, current activity. Companion selection flow. | 1.2 | L |
| 1.8 | **UI: Personal room** — Room grid renderer (CSS Grid). Equip/unequip cosmetics from inventory. Background/floor layers. | 1.4, 1.7 | L |
| 1.9 | **UI: Sanctuary map** — SVG/Canvas world map. Location markers with Skrumpey counts. Click-to-inspect. 60s polling. | 1.5, 1.7 | L |
| 1.10 | **UI: STAR shop** — Browse items by category, purchase flow, inventory display. | 1.4, 1.7 | M |

### Milestone 2: Quests & Badges (V2 Core) — 7-9 PRs

| # | PR | Dependencies | Effort |
|---|-----|-------------|--------|
| 2.1 | **DB schema: quest & badge tables** — Add `sanctuary_quests`, `sanctuary_quest_log`, `sanctuary_badges`, `sanctuary_badge_awards`. | M1 complete | S |
| 2.2 | **Quest engine API** — `GET /api/sanctuary/quests`, `POST /api/sanctuary/quests/accept`, `POST /api/sanctuary/quests/complete`, `GET /api/sanctuary/quests/log`. Timer-based completion check. Story beat progression. | 2.1 | L |
| 2.3 | **Quest content: first 10 quests** — 4 errands, 4 adventures, 2 expeditions. Story JSON, rewards, prerequisites. One per constellation. | 2.2 | M |
| 2.4 | **Badge system API** — `GET /api/sanctuary/badges`, `POST /api/sanctuary/badges/claim`. Off-chain badge tracking. | 2.1 | S |
| 2.5 | **SanctuaryBadges.sol** — ERC-1155 soulbound contract. Mint function (admin-only). Transfer override (revert for soulbound). Deploy script. | None (parallel) | M |
| 2.6 | **On-chain badge minting** — Connect badge claim API to contract mint. Wallet signs, server submits tx. | 2.4, 2.5 | M |
| 2.7 | **UI: Quest board** — Quest list, accept flow, active quest tracker, story beat display, reward claim. | 2.2 | L |
| 2.8 | **UI: Badge showcase** — Badge display on companion profile. On-chain verification link. | 2.4 | M |
| 2.9 | **Room expansion & new items** — 4x4 grid unlock, 25+ new cosmetic items, accessory slot. | M1 complete | M |

### Milestone 3: Chat & Community (V3 Core) — 6-8 PRs

| # | PR | Dependencies | Effort |
|---|-----|-------------|--------|
| 3.1 | **DB schema: chat table** — Add `sanctuary_chat_messages`. | M2 complete | S |
| 3.2 | **Chat API** — `POST /api/sanctuary/chat`, `GET /api/sanctuary/chat/history`. System prompt builder from NFT traits + quest history. Rate limiting. OpenRouter integration. | 3.1 | L |
| 3.3 | **Chat safety layer** — Content filter (input/output), topic blocklist, response length cap. | 3.2 | M |
| 3.4 | **UI: Chat interface** — Chat bubble in companion profile. Message history. Typing indicator. Daily message counter. | 3.2 | M |
| 3.5 | **Group quests API** — Multi-wallet quest acceptance. Party formation via friend list. Shared quest log. | M2 quest engine | L |
| 3.6 | **UI: Group quest flow** — Invite friends, party view on map, shared rewards screen. | 3.5 | M |
| 3.7 | **Live map upgrade** — SSE or WebSocket for real-time Skrumpey movement. Animation transitions. Day/night cycle (cosmetic). | M1 map | L |
| 3.8 | **Room visitors** — `GET /api/sanctuary/room/:address`. Read-only room view. Visitor counter. Optional guestbook. | M1 room | M |

### Effort Key
- **S** = Small (1-2 days, <200 lines)
- **M** = Medium (2-4 days, 200-600 lines)
- **L** = Large (4-7 days, 600+ lines)

---

## 5. Recommended First PR

**PR 1.1 + 1.2 combined: "Sanctuary foundation — schema + companion selection API"**

This is the ideal first slice because:
- **Low risk:** Only adds new tables (no existing table modifications) and new API routes (no existing route changes)
- **Proves the concept:** A holder can select their active Skrumpey and see it reflected in the API
- **Unblocks everything:** Every subsequent PR depends on the companion table existing
- **Testable in isolation:** API routes can be tested with curl/Vitest without any UI
- **Reversible:** Drop tables + delete routes = clean rollback

**Scope of first PR:**

```
Files added:
  lib/sanctuary.ts          — Sanctuary database helpers (companion CRUD, validation)
  app/api/sanctuary/companion/route.ts  — GET (fetch) + POST (select) + PATCH (update)
  lib/db.ts                 — ADD sanctuary_companions, sanctuary_cosmetic_items,
                              sanctuary_inventory, sanctuary_map_locations tables
                              (append to initializeDatabase, no existing table changes)
  scripts/seed-sanctuary.ts — Seed map locations + starter cosmetic items

Files modified:
  lib/db.ts                 — New table definitions appended (non-breaking)

Tests:
  __tests__/sanctuary.test.ts — Companion selection, cooldown, activity setting, validation
```

**Estimated effort:** 2-3 days.

---

## 6. Testing Strategy

### 6.1 Unit Tests (Vitest)

| Area | Tests |
|------|-------|
| Companion selection | Valid token ID, wallet owns NFT, cooldown enforcement, one-per-wallet constraint |
| XP bridge | Each SWO action grants correct XP, daily caps enforced, level-up triggers correctly |
| Level calculation | XP thresholds, unlock conditions, edge cases at level boundaries |
| Shop purchases | Sufficient STAR balance, level requirement met, limited item stock, duplicate prevention |
| Activity timers | Duration calculation, completion detection, XP grant on completion |
| Quest engine (V2) | Prerequisites, timer completion, reward rolling, story progression |
| Chat rate limit (V3) | 50/day cap, per-wallet isolation, reset at midnight |

### 6.2 Integration Tests

| Area | Tests |
|------|-------|
| Full participation flow | Vote on proposal → check Sanctuary XP increased → check level if threshold crossed |
| Shop purchase flow | Check balance → buy item → verify deduction → verify inventory → equip → verify room state |
| Quest lifecycle (V2) | Accept → wait for timer → complete → claim rewards → verify inventory + XP |
| Map consistency | Set activity → verify map API reflects correct location → change activity → verify update |
| Badge minting (V2) | Earn badge → claim → verify on-chain mint → verify non-transferable |

### 6.3 UX Testing

- **Onboarding:** First-time holder visits /sanctuary → guided to select active Skrumpey → sees room → understands next steps
- **Return visit:** Holder returns after 8h → activity completed → rewards visible → Skrumpey is idle and welcoming
- **Long absence:** Holder returns after 2 weeks → Skrumpey is "well-rested" (positive framing) → no penalty → catch-up XP from any SWO actions during absence
- **Mobile responsiveness:** Room grid, map, and shop must work on 375px+ screens
- **Wallet disconnection:** Graceful handling — show public sanctuary but prompt to connect for personal features

### 6.4 Abuse & Edge Cases

| Scenario | Mitigation |
|----------|------------|
| Rapid companion switching to game XP | 24h cooldown on switch; XP credited to companion active at time of action |
| Bot-farming XP via chat messages | Daily XP cap per action type (50 XP from chat/day) |
| Buying limited items with multiple wallets | Items are wallet-bound; no transfer. Limited items have per-wallet purchase limit of 1 |
| Selling wallet with high-level Skrumpey | Sanctuary state is wallet-bound, not NFT-bound. New owner of NFT starts fresh. Previous wallet retains cosmetics but loses companion (no longer owns NFT) |
| NFT sold while companion is on quest | Quest completes but rewards are only claimable if wallet still owns the NFT at claim time |
| Concurrent activity + quest (V2) | Questing overrides activity. Cannot set activity while on quest. |
| Chat prompt injection (V3) | System prompt is server-side only. User messages are sanitized. Model output is filtered. No tool use or function calling. |
| STAR balance manipulation | Server-authoritative balance (SQLite). Client localStorage is display-only after migration. |

### 6.5 Economy & Balance

- **STAR faucet rate:** ~1 STAR/day per staked NFT. Holder with 3 NFTs earns ~90 STAR/month.
- **Cheapest shop item:** 5 STAR (1 week of staking 1 NFT).
- **Most expensive V1 item:** 50 STAR (~2 months of staking 1 NFT, or 2 weeks with 4 NFTs).
- **XP to max level:** ~20,000 XP. At ~50 XP/day active participation, ~400 days. Dedicated participants: ~200 days.
- **Balance principle:** A casual participant (1 NFT, occasional logins) should unlock meaningful cosmetics within 2 weeks. A power user should not exhaust all content within 2 months.
- **Monitoring:** Track STAR velocity (earn/spend ratio), level distribution, shop item popularity, activity completion rates. Monthly balance review.

---

## 7. Risk List & Operator Decisions Needed

### Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| Low adoption — holders don't care about virtual pets | Feature flops, dev time wasted | Medium | V1 is small (8-10 PRs). Map and room are engaging even without deep investment. Kill switch: can sunset gracefully since no on-chain dependencies in V1. |
| STAR economy imbalance — too easy or too hard to earn | Inflation (items feel cheap) or frustration (grind) | Medium | Conservative initial pricing. Monthly balance reviews. Admin can adjust prices and XP rates without migration. |
| AI chat costs spiral | Unexpected expense | Low | Hard 50 msg/day cap. Use cheapest viable model. Monitor daily. Kill switch: disable endpoint. |
| AI chat generates harmful content | Reputation risk | Low | System prompt guardrails + output filter + no tool use. Review sample conversations weekly. |
| Scope creep into V2/V3 during V1 | Delayed delivery | High | Strict scope boundaries in this doc. PR reviews enforce milestone boundaries. |
| NFT ownership changes break companion state | Confused UX | Medium | Companion state is wallet-bound. Ownership check on every authenticated request. Graceful "you no longer own this Skrumpey" message. |
| SQLite concurrency under quest timers | Data corruption | Low | SQLite WAL mode (already enabled). Quest completion is idempotent. No long-running transactions. |

### Decisions Needing Operator Input

1. **STAR point migration:** Currently localStorage-based. Migrating to server-side SQLite is recommended (prevents manipulation, enables shop). **Decision needed:** Approve migration? Provide transition plan for existing balances?

2. **Companion naming:** Should holders be able to nickname their Skrumpey? (Recommended yes, with profanity filter.) **Decision needed:** Approve? Max length? Moderation approach?

3. **Art assets:** Room backgrounds, decoration sprites, map illustration, and idle animations require visual art. **Decision needed:** Who creates these? Existing artist? AI-generated? Budget?

4. **Sanctuary URL structure:** Recommended `/sanctuary` as top-level route (like `/dao`, `/marketplace`). **Decision needed:** Approve URL? Should it be gated (Star holders only) or have a public preview?

5. **STAR shop pricing:** Initial pricing in Section 6.5. **Decision needed:** Review and approve price ranges? Should some items be free (level-unlock rewards)?

6. **Chat model selection (V3):** Gemini Flash via OpenRouter (~$0.001/msg) recommended for cost. **Decision needed:** Approve model? Budget cap? Alternative preference?

7. **Soulbound badge design (V2):** Need visual designs for 5-10 badge types. **Decision needed:** Who designs these? On-chain metadata format?

8. **First cosmetic set theme:** Recommend constellation-themed starter set (one background per constellation). **Decision needed:** Approve theme? Specific visual direction?

9. **Public vs gated map:** Recommend the map is publicly visible (marketing value — shows vibrant community) but interactions require wallet + NFT. **Decision needed:** Approve public map?

10. **Launch rollout:** Recommend soft launch to Discord community for 1 week before public announcement. **Decision needed:** Approve rollout strategy? Beta tester group?

---

## Appendix A: File Structure (Proposed)

```
app/
  sanctuary/
    page.tsx                    # Landing page — map + companion summary
    room/
      page.tsx                  # Personal room editor
    shop/
      page.tsx                  # STAR shop
    quests/                     # (V2)
      page.tsx                  # Quest board
    chat/                       # (V3)
      page.tsx                  # Chat interface
  api/
    sanctuary/
      companion/
        route.ts                # GET, POST (select), PATCH (update)
      map/
        route.ts                # GET map data
      shop/
        route.ts                # GET items
        buy/
          route.ts              # POST purchase
      inventory/
        route.ts                # GET user inventory
      balance/
        route.ts                # GET STAR balance, POST spend
      quests/                   # (V2)
        route.ts                # GET available, POST accept
        [id]/
          route.ts              # GET quest detail, POST complete/claim
      badges/                   # (V2)
        route.ts                # GET badges, POST claim
      chat/                     # (V3)
        route.ts                # POST message, GET history

components/
  sanctuary/
    CompanionCard.tsx           # Active Skrumpey display
    RoomGrid.tsx                # Room editor component
    SanctuaryMap.tsx            # World map component
    ShopItem.tsx                # Shop item card
    ActivitySelector.tsx        # Activity picker
    QuestCard.tsx               # (V2)
    BadgeDisplay.tsx            # (V2)
    ChatBubble.tsx              # (V3)

lib/
  sanctuary.ts                  # Core sanctuary logic (companion CRUD, XP, leveling)
  sanctuaryShop.ts              # Shop logic (purchase, inventory)
  sanctuaryQuests.ts            # (V2) Quest engine
  sanctuaryChat.ts              # (V3) Chat logic + LLM integration

contracts/
  SanctuaryBadges.sol           # (V2) ERC-1155 soulbound badges

scripts/
  seed-sanctuary.ts             # Seed locations + starter items
  seed-sanctuary-quests.ts      # (V2) Seed quest content
```

## Appendix B: API Summary

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/sanctuary/companion` | Wallet | Get active companion for wallet |
| POST | `/api/sanctuary/companion/select` | Wallet | Select active Skrumpey (token ID) |
| PATCH | `/api/sanctuary/companion` | Wallet | Update nickname, set activity |
| GET | `/api/sanctuary/map` | Public | Get all locations + Skrumpey counts |
| GET | `/api/sanctuary/shop` | Public | List shop items (filtered by level) |
| POST | `/api/sanctuary/shop/buy` | Wallet | Purchase item with STAR |
| GET | `/api/sanctuary/inventory` | Wallet | List owned cosmetics |
| GET | `/api/sanctuary/balance` | Wallet | Get STAR balance |
| POST | `/api/sanctuary/balance/spend` | Wallet | Deduct STAR (internal) |
| GET | `/api/sanctuary/quests` | Wallet | Available quests (V2) |
| POST | `/api/sanctuary/quests/accept` | Wallet | Accept quest (V2) |
| POST | `/api/sanctuary/quests/:id/complete` | Wallet | Complete + claim (V2) |
| GET | `/api/sanctuary/badges` | Wallet | List badges + earned status (V2) |
| POST | `/api/sanctuary/badges/claim` | Wallet | Claim + mint badge (V2) |
| POST | `/api/sanctuary/chat` | Wallet | Send message, get AI reply (V3) |
| GET | `/api/sanctuary/chat/history` | Wallet | Chat history (V3) |
