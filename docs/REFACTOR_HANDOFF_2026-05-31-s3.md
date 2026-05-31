# SWO Refactor Handoff — 2026-05-31 (session 3)

> Continuation of `docs/REFACTOR_HANDOFF_2026-05-31.md` (session 2) and the
> original `docs/REFACTOR_HANDOFF_2026-05.md`. Read those for the full plan and
> the golden rules. This file records ONLY what changed in session 3.
> Branch: `dev`.

---

## TL;DR

- **Phase 1 (god-component splits) finished**: MembersContent, RaffleContent, and
  ProfileCard all split. ProfileCard went **2506 → 1431 lines (−43%)**.
- **Phase 2 done**: the companion-chat 500 was a **test-isolation bug**, not a
  route bug — fixed. Test baseline improved **1414/6 → 1418/2**.
- **Phase 3 (safe subset) done**: AdminContent dead code removed; `lib/db/*`
  `console.*` routed through the logger.
- Everything committed; working tree **clean**; `tsc --noEmit` = **0**;
  all live routes 200 (`/ /profile /members /raffle /dao /admin_xyz /sanctuary`).

---

## Commits this session (in order)

| Commit | Summary |
|---|---|
| `da84bc9` | `refactor(members)`: extract analytics cluster + `useHolderStats` (1882 → 982) |
| `22fd0e0` | `refactor(raffle)`: extract `useRaffles` data hook + shared types (1325 → 1083) |
| `7780cfd` | `refactor(profile)`: unify 4 Skrumpey image renderers into `SkrumpeyImage` |
| `f864b52` | `refactor(profile)`: extract 4 data-cluster hooks (friends/messages/notifications/raffle-history) |
| `a1d56ae` | `refactor(profile)`: extract `useProfileEdit` hook |
| `80d34bc` | `refactor(profile)`: extract Messages + Achievements tabs; hoist achievement defs |
| `6d81333` | `test(sanctuary)`: isolate companion-chat e2e from the dev OpenRouter key |
| `bce4376` | `refactor(admin)`: remove dead notification-history + edit-notification code |
| `43d0236` | `refactor(db)`: route `lib/db` `console.*` through the logger |

Each was verified on three axes before committing: `tsc` = 0, `vitest`, and a
live route 200. The big splits were delegated to subagents with "one command at
a time / no browser" baked in (per session-2's working-method note); the parent
re-verified tsc + scope + key files and committed.

---

## Phase 1 — god-component splits (DONE)

### MembersContent 1882 → 982 (`da84bc9`)
Analytics cluster (HolderChart/ConstellationDistribution/HolderTierBreakdown/
TopHoldersMini/AnalyticsSection) → `app/members/analytics/`. `useHolderStats`
owns the holder-stats fetch + 5-min poll. Pure shared helpers/`MemberData` →
`app/members/shared.ts` (both sides import it — no cycle).

### RaffleContent 1325 → 1083 (`22fd0e0`)
`app/raffle/useRaffles.ts` owns the data layer + the **fetch-driven** win/lose
result animations (`checkAndShowResultAnimation` + `markViewed`). **Action-driven**
state (entry confirmation, `enteringRaffleId`, tabs) + `handleEnterRaffle` stay in
the component. Shared interfaces → `app/raffle/types.ts`.

### ProfileCard 2506 → 1431 (4 increments)
Done in small committed steps (it was the HIGH-risk file):
1. `SkrumpeyImage` — unified the 4 duplicated GIF-fallback image renderers
   (avatar/card/picker variants + a `useSkrumpeyImage` hook; the inspect modal
   uses the hook).
2. 4 data hooks under `components/profile/hooks/` (`useFriends`, `useMessages`,
   `useNotifications`, `useRaffleHistory`) + `useAuthHeaders`; shared types in
   `components/profile/types.ts`.
3. `useProfileEdit` — the display-name/bio/badges/avatar cluster + load effect +
   the 3 `/api/profile` save handlers.
4. **Messages** + **Achievements** tabs → `components/profile/tabs/`; achievement
   defs hoisted to `components/profile/achievements.ts` to break a circular import
   the tab would otherwise have (importing consts back from ProfileCard).

> **Scope note:** the user chose to split only the **2 biggest** tab bodies. The
> other 4 tabs (settings/friends/collection/raffles) are **still inline** in
> `ProfileCard.tsx` by design — see "STILL LEFT".

---

## Phase 2 — companion-chat 500 (DONE: it was a test bug) `6d81333`

Root cause: the 4 failing tests in `lib/sanctuary/__tests__/api-e2e.test.ts`
assert the **template** chat path (they mock `db.chatWithCompanion`). But the
route branches to the **LLM** path whenever an OpenRouter key is in
`process.env`, and **Vitest loads `.env.local`**, where dev sets
`SANCTUARY_OPENROUTER_API_KEY`. So the route took the LLM branch, never called
`chatWithCompanion`, and 500'd on the unmocked prompt deps. **Not a route bug.**

Fix: neutralize `SANCTUARY_OPENROUTER_API_KEY` + `OPENROUTER_API_KEY` for that
suite in `beforeAll`, restore in `afterAll`. No test exercises the LLM path.

**New test baseline: 1418 pass / 2 fail.** The 2 remaining are the pre-existing
asset guards (`components/casino/__tests__/mascotSwap.test.ts` bunny/rabbit,
`game/__tests__/roomScene.test.ts` PlayerSprite) — low value, untouched.

---

## Phase 3 — safe codeslop sweep (DONE: safe subset only)

- `bce4376` — removed the dead AdminContent cluster left by the session-2 split:
  the notification-history read state (`allNotifications`,
  `notificationHistoryTotal`, `isLoadingNotificationHistory`) was never rendered;
  `updateNotificationAction` (+ its sole consumer `editingNotification`) was never
  called from any UI; `showDrawnRaffles` unused. Removed all of it + the now-empty
  `notifications` branch of the activeTab effect. 1256 → 1176.
- `43d0236` — routed the 19 `lib/db/{admin,forum,governance,raffle}` `console.*`
  calls through the shared `logger` (`{ error: String(error) }` to preserve the
  message; a raw `Error` JSON-stringifies to `'{}'`).

### Deliberately NOT done in Phase 3 (and why)
- **prepare()-statement caching** — better-sqlite3 statements are bound to their
  connection, and the codebase swaps the DB via `__setTestDatabase`. Module-scope
  cached statements would point at a stale/closed test connection → real breakage.
  Skip unless you also rework the test-DB lifecycle.
- **`db.transaction(...)` wrapping** of multi-write helpers — behavior-changing
  (atomicity), marginal value at P3. Defer.
- The unused `catch (error)` bindings across the codebase — pre-existing style
  warnings; the original handoff says don't bulk-fix behavior-sensitive lint.

---

## STILL LEFT (prioritized)

1. **ProfileCard's other 4 tabs** (settings/friends/collection/raffles) are still
   inline (~settings 104 / friends 114 / collection 103 / raffles 190 lines). If
   continuing, mirror `components/profile/tabs/{Messages,Achievements}Tab.tsx`:
   each is a presentational component with a typed props bag; keep parent state in
   place. Lower value than the hooks (pure JSX relocation), so it was deprioritized.
2. **2 asset-guard test failures** (casino mascotSwap, game roomScene) — low value;
   they assert source strings / asset refs, not logic. Confirm count is still 2
   before blaming any change.
3. **`lib/db.ts` sanctuary tail (~4.2k lines)** — STILL WIP, **LEAVE ALONE**. Peel
   it the same way once sanctuary/outer-rim settles.
4. **db perf tuning** (prepare-caching / transactions) — see "Deliberately NOT
   done" above; needs the test-DB lifecycle handled first.

## DO NOT (still applies — from prior handoffs)
- Don't merge `useDAOAccess` + `useSkrumpeyAccess` (different questions/caching).
- Don't delete/force-adopt `components/ui/*` (V2 design-system foundation).
- Don't peel the WIP sanctuary tail out of `lib/db.ts`.
- Don't bulk-fix behavior-sensitive lint (`set-state-in-effect`, `exhaustive-deps`,
  `no-require-imports` in `game/scenes/*`, most `no-explicit-any`).

---

## Quick reference
- **Restart DEV:** `cd /opt/star_world_order && ./start-dev.sh`
- **Typecheck:** `cd /opt/star_world_order/DEV && npx tsc --noEmit`
- **Tests:** `npx vitest run` (expect **1418 pass / 2 pre-existing fail**)
- **Route check:** `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3081/<route>`
- **Working method:** one bash command at a time; no browser (curl + tsc + vitest);
  delegate big splits to a subagent with those constraints baked in; verify three
  axes + commit atomically per unit.
