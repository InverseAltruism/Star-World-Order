# Star Sanctuary — Milestone & PR Breakdown

> Dependency-ordered milestones from brainstorm → shippable PRs.

**Status:** Active  
**Date:** 2026-04-15  
**Prerequisite:** [SANCTUARY_DB_NORMALIZATION.md](./SANCTUARY_DB_NORMALIZATION.md) (decided)

---

## P0 — Planning (done)

| # | Issue | Status | Depends On | Deliverable |
|---|-------|--------|------------|-------------|
| 0.1 | Normalize DB plan against real SWO architecture | Done | — | `SANCTUARY_DB_NORMALIZATION.md` |
| 0.2 | Architecture Decision Record (route, gating, on-chain boundary) | Done | 0.1 | `SANCTUARY_ADR.md` |
| 0.3 | Milestone breakdown with dependency ordering | Done | 0.1 | This file |
| 0.4 | First PR spec (scope, test plan, review criteria) | Open | 0.1, 0.2 | `SANCTUARY_FIRST_PR_SPEC.md` |

---

## P1 — Data Model & API Foundation

_Goal: schema in DB, core companion API working, tests pass._

| # | Issue / PR Title | Depends On | Scope | Est. |
|---|-----------------|------------|-------|------|
| 1.1 | **Schema migration: `sanctuary_companions` + `sanctuary_map_locations` + `sanctuary_journal`** | 0.2 | Add `scripts/init-sanctuary.sql`, update `lib/db.ts` `initializeDatabase()`. Seed 8 map locations. | S |
| 1.2 | **API: `GET /api/sanctuary/companion`** — fetch active companion with NFT metadata + level | 1.1 | Join `sanctuary_companions` ↔ `star_skrumpey_metadata` ↔ `user_xp`. Return companion state + traits. | S |
| 1.3 | **API: `POST /api/sanctuary/companion/select`** — select active companion | 1.1 | Verify on-chain ownership, create/activate companion row, deactivate previous. | S |
| 1.4 | **API: `POST /api/sanctuary/companion/switch`** — switch active companion | 1.3 | Preserve per-wallet+per-token progress. Deactivate old, activate new. | S |
| 1.5 | **Test fixtures: wallet ownership, companion state, switching, auth** | 1.1 | Seed test data for 3 wallets × 2 token_ids. Cover: select, switch, unauthorized, non-holder. | S |
| 1.6 | **API: `GET /api/sanctuary/map`** — world map with active companions | 1.1 | Return all active companions grouped by current_activity/location. Public (no auth required). | S |

**PR strategy:** 1.1+1.2+1.3+1.5 as one PR (foundation). 1.4+1.6 as second PR.

---

## P2 — First Playable Subsite

_Goal: `/sanctuary` route live, holder can see and interact with their Skrumpey._

| # | Issue / PR Title | Depends On | Scope | Est. |
|---|-----------------|------------|-------|------|
| 2.1 | **Route shell: `/sanctuary` with holder gating** | 1.2 | Next.js page, wallet connect check, holder gating for interactions, public view for map. Nav entry from existing SWO sidebar. | M |
| 2.2 | **Companion panel: active Skrumpey dashboard** | 1.2, 2.1 | Display: Skrumpey image, name/nickname, level, bond, mood (from NFT traits), current activity, journal snippet. | M |
| 2.3 | **Interactions V1: feed, pet, talk-placeholder, send-to-activity** | 1.3, 2.2 | 4 simple actions that update `current_activity`, add journal entries, increment `bond_score` and `total_interactions`. Timer-based activities (1-8h). | M |
| 2.4 | **World map V1: shared view of all Skrumpeys** | 1.6, 2.1 | Visual map with location nodes (Hot Springs, Training Grounds, etc.). Show Skrumpeys at each location. Polling or SSE for real-time updates. | M |
| 2.5 | **XP bridge: SWO participation → companion progression** | 1.1 | Hook into existing XP-granting events (vote, chat, raffle enter, quest complete) to also increment companion bond/interactions. | S |

**PR strategy:** 2.1 alone (shell). 2.2+2.3 together (companion UI). 2.4 alone (map). 2.5 alone (bridge).

---

## P3 — Retention Systems

_Goal: reasons to return daily, cosmetic progression, meaningful STAR sink._

| # | Issue / PR Title | Depends On | Scope | Est. |
|---|-----------------|------------|-------|------|
| 3.1 | **Schema: `sanctuary_cosmetic_items` + `sanctuary_inventory`** | 1.1 | Migration + seed 15-25 cosmetic items across 5 categories. | S |
| 3.2 | **STAR Shop V1: browse, preview, purchase cosmetics** | 3.1 | Shop UI, STAR balance check, purchase API, inventory display. | M |
| 3.3 | **Room customization: equip cosmetics to companion/room** | 3.1, 2.2 | Update `equipped_cosmetics` JSON, render in companion panel. | M |
| 3.4 | **Journal system: persistent companion history** | 1.1, 2.3 | Journal UI tab, chronological entries, entry types with icons. | S |
| 3.5 | **Activity feed: public social feed of Skrumpey activities** | 1.6, 2.3 | Timeline of recent actions across all Skrumpeys. Public. | S |
| 3.6 | **Balance pass #1: tune progression cadence** | 2.3, 3.2 | Review: time-to-first-cosmetic, daily engagement ceiling, STAR faucet/drain balance. | S |

**PR strategy:** 3.1+3.2 (shop). 3.3 (customization). 3.4+3.5 (social). 3.6 (tuning).

---

## P4 — V1.5: Quests, Traits, Seasonal Layer

_Goal: deeper engagement loops, personality emergence, seasonal events._

| # | Issue / PR Title | Depends On | Scope | Est. |
|---|-----------------|------------|-------|------|
| 4.1 | **Schema: `sanctuary_quests` + `sanctuary_quest_log`** | 1.1 | Migration + seed 5 starter quests (2 errands, 2 adventures, 1 expedition). | S |
| 4.2 | **Quest UI: browse, start, monitor, claim rewards** | 4.1, 2.1 | Quest list, active quest panel, completion notification, reward claim. | M |
| 4.3 | **Quest narratives: branching story with choices** | 4.1 | `choices` JSON in quest_log, story text rendering, choice UI, constellation bonuses. | L |
| 4.4 | **Trait evolution: visible traits from behavior patterns** | 2.3, 3.4 | Derive traits (social, curious, studious, adventurous) from journal/activity history. Display on companion panel. | M |
| 4.5 | **Schema: `sanctuary_badges` + `sanctuary_badge_awards`** | 1.1 | Migration + define 10 achievement badges. | S |
| 4.6 | **Achievement badges: earn + display + optional on-chain mint** | 4.5, 2.2 | Badge earning logic, display on profile, optional Monad ERC-1155 mint for soulbound badges. | L |
| 4.7 | **Seasonal quest template: first seasonal event** | 4.2 | Time-limited quest chain with unique cosmetic rewards. Template for future seasons. | M |
| 4.8 | **Room expansion: 4x4, 5x5 grid + additional rooms** | 3.3 | Level-gated room upgrades. New room types (Garden, Workshop, Library). | M |

---

## P5 — Monad Identity & Currency Decisions

_Goal: deliberate on-chain/off-chain boundary, STAR direction._

| # | Issue / PR Title | Depends On | Scope | Est. |
|---|-----------------|------------|-------|------|
| 5.1 | **STAR currency ADR: soulbound vs transferable vs hybrid** | 3.6 | Research + recommendation document. Consider: abuse, speculation, gas costs, utility scope. | S |
| 5.2 | **On-chain identity: soulbound badge contract (ERC-1155)** | 4.6 | Solidity contract, deploy script, mint integration from badge_awards. Monad testnet first. | L |
| 5.3 | **Commemorative NFTs: event token contract (ERC-1155)** | 4.7 | Tradeable event tokens. Mint on quest completion or seasonal events. | M |
| 5.4 | **Gas sponsorship evaluation: Monad paymaster or relayer** | 5.2 | Evaluate whether SWO should sponsor gas for badge mints. Cost analysis at 333 holders × N badges. | S |

---

## Dependency Graph (critical path)

```
P0: Plan → ADR → First PR Spec
         ↓
P1: Schema (1.1) → Companion API (1.2, 1.3) → Tests (1.5) → Switch (1.4), Map (1.6)
                          ↓
P2: Route shell (2.1) → Companion panel (2.2) → Interactions (2.3) → Map UI (2.4)
                                                       ↓
P3: Cosmetics schema (3.1) → Shop (3.2) → Room (3.3) → Balance (3.6)
    Journal (3.4), Feed (3.5) branch from 2.3
                          ↓
P4: Quests schema (4.1) → Quest UI (4.2) → Narratives (4.3)
    Traits (4.4) branch from 2.3+3.4
    Badges (4.5→4.6) branch from 1.1
                          ↓
P5: STAR ADR (5.1), On-chain contracts (5.2, 5.3)
```

**Critical path:** 0.2 → 1.1 → 1.2 → 2.1 → 2.2 → 2.3 → 3.1 → 3.2

The ADR (0.2) is the next blocking task — until route, gating, and on-chain boundary are locked, schema can't be finalized.

---

## Size Estimates

| Size | Meaning | Count |
|------|---------|-------|
| S | < 1 day, single PR | 14 |
| M | 1-3 days, single PR | 11 |
| L | 3-5 days, may split into 2 PRs | 3 |

**Total estimated effort:** ~40-55 developer-days across all 5 phases.  
**V1 playable (P1+P2):** ~10-15 developer-days.
