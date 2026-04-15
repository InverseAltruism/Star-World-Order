# ADR-001: Star Sanctuary Architecture

**Status:** Accepted  
**Date:** 2026-04-15  
**Deciders:** Operator (InverseAltruism), Clarvis (executive function)  
**Supersedes:** None  
**Informs:** [SANCTUARY_DB_NORMALIZATION.md](./SANCTUARY_DB_NORMALIZATION.md), [SANCTUARY_MILESTONES.md](./SANCTUARY_MILESTONES.md)

---

## Context

Star World Order has mature social infrastructure (chat, voice, profiles, governance, quests, XP, raffles) but no persistent bond between a holder and their specific NFT. Star Sanctuary adds a companion layer — holders select, interact with, and grow a Skrumpey companion that reflects their SWO engagement.

This ADR locks the architectural boundaries so implementation PRs can proceed without re-litigating fundamentals.

---

## Decisions

### D1. Route: `/sanctuary`

Sanctuary lives at `/sanctuary` as a Next.js page route within the existing SWO app. Not a subdomain, not a separate deployment.

**Rationale:** Same auth context (wallet connect), same nav sidebar, same build pipeline. Sanctuary is a feature, not a product.

### D2. Database: Existing `swo.db`, No Parallel DB

All Sanctuary tables (`sanctuary_*` namespace) are added to the existing SQLite database (`data/swo.db` via `better-sqlite3`). No separate database, no separate service.

**Rationale:**
- Sanctuary requires JOINs to `star_skrumpey_metadata`, `user_xp`, `user_profiles` — a separate DB would mean ATTACH or API indirection for every read.
- Single WAL, single backup, single migration path.
- SWO's `initializeDatabase()` already handles additive `CREATE TABLE IF NOT EXISTS`.

**Migration:** New file `scripts/init-sanctuary.sql` called from `initializeDatabase()` in `lib/db.ts`. Keeps the diff small and reviewable.

**FK pattern:** All tables FK on `wallet_address TEXT`, consistent with the rest of SWO (no users table — wallet IS identity).

### D3. Visibility: Public World, Holder-Gated Interactables

The world map and companion locations are **publicly visible** — anyone can browse `/sanctuary` and see active Skrumpeys. Interacting with a companion (select, feed, pet, send on activity, switch) requires **wallet connection + on-chain ownership verification** of the relevant token_id.

**Boundary:**
- Public (no auth): `GET /api/sanctuary/map`, world map UI, companion profiles
- Holder-gated (wallet + ownership): `POST /api/sanctuary/companion/select`, `POST /api/sanctuary/companion/switch`, all interaction endpoints
- Per-token ownership: verified via on-chain RPC query against the Star Skrumpey contract (existing `rpcClient.ts` infrastructure)

### D4. One Active Companion Per Wallet+Token, Switchable, Persistent Progress

Each wallet has **one active companion** at a time. The companion is tied to a specific token_id. Switching to a different owned Skrumpey preserves all per-token progress (bond score, interactions, journal, cosmetics).

**Data model:**
- `sanctuary_companions` table: one row per `(wallet_address, token_id)` pair
- `is_active` column: exactly one row per wallet has `is_active = 1`
- Switching deactivates the current companion, activates (or creates) the target
- Progress fields (`bond_score`, `total_interactions`, `current_activity`) persist per row — switching back restores the companion exactly where it was left

**Constraint:** A wallet can only select a token_id it currently owns. Ownership is verified on-chain at selection/switch time, not cached.

### D5. Companion Chat Deferred to V1.5

No AI chat in V1. The `talk` interaction is a placeholder that increments bond and writes a journal entry. AI-powered companion chat (personality, memory, conversation) is explicitly scoped to V1.5 or later.

**Rationale:** Chat adds LLM cost, moderation burden, and personality design complexity. V1 validates the core loop (select → interact → grow → explore world) without it. If V1 engagement is strong, chat is the natural next layer.

### D6. STAR Currency: Evaluate Deliberately

The STAR token on Monad is the intended currency for Sanctuary cosmetics, but its token design is **not yet decided**:

- **Soulbound (non-transferable):** Pure engagement reward, no secondary market, no speculation. Simplest.
- **Transferable (ERC-20):** Enables trading, gifting, market dynamics. More complex, regulatory surface.
- **Hybrid:** Soulbound base earnings, transferable bonus from achievements. Middle ground.

**Decision:** This is explicitly deferred. V1 tracks STAR as an **off-chain points balance** (column in the database, no smart contract). The on-chain token design will be decided after V1 usage data reveals actual earning/spending patterns.

**Implication for V1:** The cosmetic shop prices in STAR points. The earning rate from interactions is tunable server-side. No on-chain transactions for STAR in V1. Migration to on-chain (if decided) is a schema change + contract deployment, not an architecture change.

---

## Open Questions

| # | Question | Owner | Blocks |
|---|----------|-------|--------|
| OQ1 | STAR token design: soulbound vs transferable vs hybrid | Operator | P3 (cosmetic shop) |
| OQ2 | Activity duration tuning: what's the right range for timer-based activities (1h–8h)? | Design pass after V1 launch | P3.6 (balance pass) |
| OQ3 | World map visual format: 2D illustrated map vs node graph vs list view? | Frontend PR (P2.4) | P2.4 |
| OQ4 | Quest narrative depth: simple fetch-quest vs branching story? | V1.5 scope | P4.3 |
| OQ5 | On-chain commemoratives: which achievements mint soulbound NFTs? | Operator + community input | P4 |
| OQ6 | Companion personality seed: derive from NFT traits (constellation/aura) or holder choice? | V1.5 chat design | P4.5 |

---

## Consequences

### Enables
- **PR #1** can proceed immediately: `init-sanctuary.sql` + `sanctuary_companions` table + `GET/POST /api/sanctuary/companion` + `GET /api/sanctuary/map` — all within the existing DB and API patterns.
- Active companion selection API is a clean, testable unit: verify ownership → upsert row → deactivate previous → return state.
- Public map is a simple aggregation query with no auth complexity.

### Constrains
- SQLite single-writer means Sanctuary writes share the WAL with chat, governance, and quest writes. At SWO's scale (333 NFTs, ~50 DAU) this is fine. If SWO ever needs concurrent write throughput, the whole app migrates to Postgres — not just Sanctuary.
- Off-chain STAR means no trustless exchange in V1. Acceptable: V1 is about proving the engagement loop, not the token economy.
- No chat in V1 means the companion is reactive (responds to interactions) but not conversational. The journal fills the narrative gap.

### Risks
- **Ownership verification latency:** On-chain RPC call on every select/switch adds ~200-500ms. Acceptable for infrequent operations. If it becomes a bottleneck, cache ownership with a short TTL and invalidate on transfer events.
- **Schema coupling:** Sanctuary tables JOIN to core SWO tables. If core schema changes (e.g., `user_xp` column rename), Sanctuary queries break. Mitigated by: SWO's schema is stable (28 tables, months without structural changes), and Sanctuary queries are localized in dedicated API routes.

---

## Key Schemas (Reference)

See [SANCTUARY_DB_NORMALIZATION.md](./SANCTUARY_DB_NORMALIZATION.md) for full table definitions. Summary of V1 tables:

| Table | Purpose |
|-------|---------|
| `sanctuary_companions` | Per-wallet+token companion state (active flag, bond, activity, interactions) |
| `sanctuary_map_locations` | Seed data for world map locations (8 locations V1) |
| `sanctuary_journal` | Chronological companion activity/interaction log |

---

## Next Steps

1. **[SANCTUARY_FIRST_PR_SPEC]** — Define exact scope, test plan, and review criteria for PR #1 (schema + companion selection API)
2. Implement `scripts/init-sanctuary.sql` and wire into `lib/db.ts`
3. Build `app/api/sanctuary/companion/route.ts` (GET + POST select)
4. Build `app/api/sanctuary/map/route.ts` (GET, public)
5. Add test fixtures covering: select, switch, non-holder rejection, map aggregation
