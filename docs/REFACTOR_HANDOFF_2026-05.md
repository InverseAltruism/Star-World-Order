# SWO Refactor Handoff — 2026-05-31

> Companion to `docs/CODEBASE_AUDIT_2026-05.md` (the prioritized audit).
> This file records **what has been refactored, how it was verified, what NOT to
> touch, and exactly what's left** so the next engineer/AI can continue safely.
> Branch: `dev`. All work below is committed and pushed.

---

## 0. Golden rules learned on this codebase (read first)

- **Verify after every change, on three axes:** `npx tsc --noEmit` (0 errors), the
  full test suite (`npx vitest run`), and **live routes** against the running DEV
  server (`http://localhost:3081`). For UI, add a Playwright render check.
- **Test-suite baseline = 1370 pass / 6 PRE-EXISTING failures.** Do not chase
  these — they reproduce at pre-refactor commit `39cf9a8` and are unrelated:
  1. `components/casino/__tests__/mascotSwap.test.ts` — "no bunny/rabbit refs"
     asset guard (someone added bunny refs under casino).
  2. `game/__tests__/roomScene.test.ts` — expects `'ROOM_H - 60'` source string.
  3. `lib/sanctuary/__tests__/api-e2e.test.ts` — 4 companion-chat tests 500 under
     a mocked LLM. **This may be a genuine WIP bug worth a look** (sanctuary).
  Before blaming a change for a failure, confirm the count is still 6 and bisect
  against `39cf9a8`.
- **DEV is live at https://test.starworldorder.com** (tmux `swo-dev`, port 3081,
  logs at `logs/dev.log`). Dev-access bypass is ON, so gated pages render content
  without a wallet. The **locked** gate screen can't be seen in-server because of
  the bypass — render it in isolation if you need to (see §3.2 note).
- **Commit granularity:** atomic per logical unit (per domain / per component).
  Easier to bisect on a globally-imported module like `lib/db`.
- **`export * from './x'` re-exports for external callers but does NOT rebind the
  names into the re-exporting file's local scope.** This bit us repeatedly — tsc
  catches it ("Cannot find name"). See §1.

---

## 1. DONE — `lib/db.ts` god-file split (9,812 → 4,236 lines)

The #1 structural item. `lib/db.ts` **stays at its path as the public barrel** so
none of the ~82 `@/lib/db` import sites change. 21 domain modules now live under
`lib/db/`:

```
connection  treasury  chat  presence  holderSnapshots  voice  profiles
skrumpeyMetadata  backup  friends  directMessages  starforge  raffle  admin
governance  governanceNonce  adminNonce  forum  quests  cleanup  notifications
```

**Pattern:** each `lib/db/<domain>.ts` does `import { getDatabase } from './connection'`
and is re-exported from `lib/db.ts` via `export * from './db/<domain>'`.

**`connection.ts`** owns `DB_PATH`, the singleton, `getDatabase`,
`__setTestDatabase`, `closeDatabase`, and the full `CREATE TABLE` schema +
default-quests seed. It stays **domain-agnostic** via an IoC hook:
`registerSchemaInitializer(fn)`. The WIP sanctuary schema (`initializeSanctuary`,
still in `lib/db.ts`) registers itself — so `connection.ts` has zero sanctuary
dependency.

**Cross-module edges that `export *` does NOT rebind (wired explicitly):**
- `lib/db.ts` re-imports `addUserXP` from `./db/quests` (the sanctuary tail calls it).
- `lib/db/admin.ts` imports `type NotificationType` (`./notifications`) and
  `type Raffle` (`./raffle`).

**Reusable extractor:** the script used to peel domains was `/tmp/peel_domain.py`
(re-derives section boundaries from the `// ====` banners, auto-detects
crypto/path/fs/Database/getResilientClient imports). It's gone from /tmp now;
re-create from the git history of this work if continuing — or just hand-extract,
the pattern is simple.

**Still in `lib/db.ts` (≈4,236 lines): barrel + the WIP sanctuary tail** — Companion/
Journal/Map, Training Grounds, Minigame, Expeditions, STAR economy, Quests v2,
Arcade, gacha. **LEAVE THIS ALONE while sanctuary/outer-rim are WIP.** Peel it the
same way once it settles.

---

## 2. DONE — DAO god-component split (`DAOContent.tsx` 2,085 → 162 lines)

`app/dao/DAOContent.tsx` is now a thin shell (tab nav + `useGovernance`
orchestration). Tab bodies live in `app/dao/tabs/`:
- `StakingTab.tsx`, `GovernanceTab.tsx` (owns the 3 vote modals + info button),
  `ForumTab.tsx`. Governance is a **static** import (default tab, no load flash);
  the rest are `next/dynamic` (deferred).

Verified end-to-end with Playwright (both Governance + Forum tabs render, real
data, zero console errors).

---

## 3. DONE — consolidations (audit P2 dedup)

### 3.1 Social icons → `components/icons/SocialIcons.tsx`
Discord/X/GitHub SVGs were byte-identical in `Footer.tsx` (3) + `SocialConnect.tsx`
(2). Now a single source; each takes a `className` (default `w-5 h-5 fill-current`).
(Audit also named admin/raffle/UserProfileModal — those use text glyphs, nothing
to dedupe.)

### 3.2 Access gates → `components/BaseAccessGate.tsx` (422 → 314 lines)
`AccessGate` (Star-trait, `useDAOAccess`) and `SkrumpeyAccessGate` (any Skrumpey,
`useSkrumpeyAccess`) were ~95% identical. Now both are 38-line wrappers that pass
their access state into a presentational `BaseAccessGate` driven by
`variant: 'star' | 'skrumpey'`. Fixed the lone raw `<img>` → `next/image`; dropped
unused `balance`.
> Note: locked-screen markup was verified by **source-diffing** old vs new (the
> dev bypass hides the locked screen in-server). To see it live, render
> `<BaseAccessGate variant=... hasAccess={false} isLoading={false} isConnected={false}>`
> in a throwaway page with the dev-access env var temporarily off.

### 3.3 VoiceChat twins → `app/hangout/VoiceChatPanel.tsx`
`HangoutContent` had `VoiceChatInline` (used) and `VoiceChat` (**never rendered =
dead**), byte-identical but for wrapper/header. Unified into one
`variant: 'inline' | 'card'` panel (builds its own signed voice headers via
`getWalletAuthHeader`). Deleted both old defs + the orphaned `ApiVoiceParticipant`
interface. `HangoutContent` 1,564 → 974.

### 3.4 Raffle overlays → `app/raffle/RaffleOverlays.tsx` + `app/raffle/tierStyles.ts`
Pulled the 3 props-only result overlays (`WinAnimation`, `LoseAnimation`,
`EntryConfirmation`) and the shared `TIER_STYLES` map out of `RaffleContent`
(1,742 → 1,325).

---

## 4. DONE earlier this session (context)
- **P0 security** (`c8ec342`): `verifyWalletAccess` added to the mutating handlers
  of `/api/chat`, `/api/presence`, `/api/voice` (were impersonatable). Also wired
  the client `getAuthenticatedJsonHeaders` in HangoutContent to actually send the
  signed header.
- **P2** (`26876c0`): unmount/abort guards on 6 racey fetches; raffle fetch
  waterfall → `Promise.all`.
- **P3** (`cb4602d`): eslint-ignore vendored OZ, `--breakpoint-xs`, drop autoprefixer.
- Profile dead quest/XP state removed; casino splash / hangout-scroll fixes.

---

## 5. DO NOT DO THESE (analysed — they'd be regressions / are risky)

- **Do NOT merge `useDAOAccess` + `useSkrumpeyAccess`.** Different questions
  (Star-trait-only vs any-Skrumpey **+ balance**) with different caching
  (context/provider vs localStorage). `SanctuaryContent` rightly uses both. The
  audit's "consolidate" note here is unsound.
- **Do NOT delete or force-adopt `components/ui/*`.** They're unused in prod but
  are the **V2 design-system foundation** (active `docs/UI_V2_REDESIGN_PLAN.md`).
  Adopting `Button` onto DAO's working `pixel-btn` classes risks visual
  regressions — only do it **with before/after screenshot diffing**.
- **Do NOT bulk-"fix" behavior-sensitive lint:** `react-hooks/set-state-in-effect`
  (13), `exhaustive-deps` (5), `no-require-imports` in `game/scenes/*` (likely
  intentional dynamic requires), most `no-explicit-any` (47). These change runtime
  behavior; rushing them breaks things. Lint is P3 (lowest).

---

## 6. STILL LEFT (prioritized, with risk)

### God-component splits (the remaining structural debt)
| File | LOC now | Plan | Risk |
|---|---|---|---|
| `components/ProfileCard.tsx` | **2,506** | Extract hooks `useFriends` / `useMessages` / `useNotifications` / `useRaffleHistory` / `useProfileEdit`; split the 6 tabs into files; collapse the **4 duplicate image sub-components into one `<SkrumpeyImage>`**. ~44 `useState`. | **HIGH** — most interconnected state. Do one hook at a time, verify each. |
| `app/admin_xyz/AdminContent.tsx` | **2,177** | Split by tab into `app/admin_xyz/tabs/*`. The data effect already keys on `activeTab`, so it's largely mechanical (audit's word). | MED (admin is sensitive — verify each tab loads). Good lower-risk warm-up. |
| `app/members/MembersContent.tsx` | **1,882** | Extract the ~750-line analytics cluster to `app/members/analytics/` + a `useHolderStats` hook. | MED |
| `app/raffle/RaffleContent.tsx` | **1,325** | Finish: extract a `useRaffles` data hook (fetch/poll/past-raffle logic). | LOW-MED |

**Recommended order:** AdminContent (mechanical warm-up) → MembersContent →
RaffleContent `useRaffles` → ProfileCard (last, most care).

**Safe extraction recipe (proven this session):**
1. Pick a self-contained unit (a tab body, a presentational component, a hook).
2. Map coupling **both ways**: does anything outside call it? does it call/reference
   anything else in the file — **including non-function consts/types** (e.g. the
   `TIER_STYLES` const that the call-graph missed)?
3. Move it; import shared deps from the new module(s); `export` what the parent needs.
4. `tsc` → fix whatever "Cannot find name" it surfaces (that's the rebind edge).
5. Full `vitest` (still 1370/6) + live route 200 + Playwright render for UI.
6. Commit atomically.

### `lib/db.ts` perf (now each domain is isolated → safer to tune)
- Statements are `prepare()`d per call — cache them per module.
- Only ~10 transactions; multi-write helpers (e.g. `toggleForumLike`) can race —
  wrap in `db.transaction(...)`.
- 19 raw `console.*` + errors swallowed in catches — route through the existing
  `logger`. **Do per-module, behavior-preserving.**

### Sanctuary
- The WIP sanctuary tail in `lib/db.ts` can be peeled once it settles.
- Investigate the **companion-chat 500** (test-suite failure #3) — possibly a real
  bug behind the mocked LLM, not just a stale test.

### Lint (P3, lowest — do the SAFE subset only)
- Safe: remove genuinely-dead **imports** (tsc-verified). Skip the behavior-sensitive
  rules in §5.

---

## 7. Quick reference

- **Run DEV:** it's already up in tmux `swo-dev`; logs `logs/dev.log`.
- **Typecheck:** `npx tsc --noEmit`
- **Tests:** `npx vitest run`  (expect 1370 pass / 6 pre-existing fail)
- **Lint a file:** `npx eslint <path>`
- **App-level architecture truth:** `PROD/CLAUDE.md` (the dev-branch copy was
  deleted; see audit/notes). Host/ops: `/opt/star_world_order/CLAUDE.md`.
