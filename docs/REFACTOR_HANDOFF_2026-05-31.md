# SWO Refactor Handoff — 2026-05-31 (session 2)

> Continuation of `docs/REFACTOR_HANDOFF_2026-05.md` (read that first — it is still
> the authoritative plan). This file records ONLY what changed in the 2026-05-31
> session and what to do next. Branch: `dev`.

---

## TL;DR

- The originally-reported **profile-page crash was NOT a code bug** — it was a stale
  Turbopack dev bundle. Fixed by a clean dev-server restart. Root-caused + tooled
  against recurrence.
- **Phase 0 complete** (hydration warning + DEV lifecycle).
- **Phase 1 started**: AdminContent god-component split landed (`cbbf348`).
- Everything below is **committed**; working tree is **clean**; `tsc --noEmit` = 0;
  test baseline **1414 pass / 6 pre-existing fail** (unchanged).

---

## What the original "error" actually was

Reported symptom: `/profile` threw `useDAOAccess is not defined` at
`components/AccessGate.tsx:24`, plus a React hydration warning, with the Next.js
banner showing **"(stale)"**.

Root cause: the running DEV server was serving a **half-compiled Turbopack bundle**
left behind by an interrupted edit session. The source was already correct:
- `git status` was clean (no uncommitted source).
- `lib/hooks/useDAOAccess.ts` parses fine and exports `useDAOAccess` (a thin
  `useContext` wrapper over `DAOAccessContext`).
- `npx tsc --noEmit` exited 0 across the whole project.
- The `initializeSanctuary is not defined` / `no such table:
  sanctuary_star_onchain_queue` errors in `logs/dev.log` were all timestamped
  ~01:27 (the same stale bundle); on a fresh server those endpoints return 200.

Fix: restart the dev server cleanly (kills the stale bundle). All routes then render
200: `/ /profile /dao /members /marketplace /sanctuary`, and `/api/messages` /
`/api/notifications` / `/api/sanctuary/star/process-onchain` all 200.

**Lesson:** when DEV shows a "(stale)" banner or phantom "X is not defined" for a
symbol that demonstrably exists, suspect the bundle, not the source. Restart first.

---

## Commits this session

| Commit | Summary |
|---|---|
| `194de69` | `fix(hydration): suppressHydrationWarning on <html> for CRT boot script` |
| `cbbf348` | `refactor(admin): split AdminContent into per-tab files [SWO_AUDIT_STRUCTURE]` |

### `194de69` — hydration warning (Phase 0)
`app/layout.tsx`: added `suppressHydrationWarning` to the root `<html>` element.
The inline boot `<script>` in `<head>` sets `documentElement.dataset.crt` from
localStorage **before React hydrates**, so the `<html>` element's attributes
legitimately differ between server and client render for any user who has toggled
CRT. This is the standard next-themes pattern; the suppression is scoped one level
deep (the `<html>` element only). `wagmi` already has `ssr: true`, so wallet state
was not the cause.
- Verified: tsc 0, vitest 1414/6, `/profile` 200, clean dev log.

### `cbbf348` — AdminContent split (Phase 1, item 1 of 4)
`app/admin_xyz/AdminContent.tsx`: **2177 → 1256 lines** (−42%). Mirrors the DAO
split pattern (thin shell + per-tab files). 5 tabs (`health`, `notifications`,
`users`, `raffles`, `database`) moved to `app/admin_xyz/tabs/*` with a shared
`tabs/types.ts`. Static imports (tabs are lightweight; no `next/dynamic` needed).
The shell keeps all shared state, auth/access gates, fetch+mutation handlers, the
`activeTab`-keyed data-loading effects, the action-result toast, the Winner Details
modal, tab nav, Quick Actions, and footer; each tab receives what it needs via a
typed props interface.
- Verified: tsc 0, vitest 1414/6, `/admin_xyz` 200, no new dev-log errors.
- Note: pre-existing dead code in the parent (`allNotifications`,
  `notificationHistoryTotal`, `editingNotification`, `updateNotificationAction`,
  `showDrawnRaffles`, etc.) was intentionally left in place — this was a structural
  move, not a cleanup. It's a candidate for the Phase 3 dead-code sweep.

---

## Host-level ops scripts added (NOT in the git repo)

`/opt/star_world_order/` is a workdir, not a repo, so these live there uncommitted:

- **`start-dev.sh`** — the preferred way to (re)start DEV. Idempotent: kills any
  stale `swo-dev` tmux session, starts a fresh one on `0.0.0.0:3081`, waits for
  HTTP 200. This directly addresses the stale-bundle footgun. Usage:
  `cd /opt/star_world_order && ./start-dev.sh` (or `--no-wait`).
- **`install-dev-service.sh`** — OPTIONAL, needs sudo. Installs a
  `star-world-dev.service` systemd unit so DEV auto-starts on boot/crash like PROD
  (`Restart=on-failure`). If installed, manage DEV via `systemctl … star-world-dev`
  and stop using the tmux path (they'd fight over :3081). Revert:
  `sudo systemctl disable --now star-world-dev`.
- Host `CLAUDE.md` updated in 3 places (DEV start section, Deploy DEV recipe, the
  "DEV is not auto-started" gotcha) to point at these.

---

## STILL LEFT (prioritized) — picks up from `REFACTOR_HANDOFF_2026-05.md` §6

### Phase 1 — god-component splits (3 of 4 remaining)
Use the proven recipe (pick a self-contained unit → map coupling both ways → move →
`tsc` → fix "Cannot find name" rebinds → vitest 1414/6 + live route 200 → commit
atomically). Mirror the DAO / AdminContent pattern.

| File | LOC | Plan | Risk |
|---|---|---|---|
| `app/members/MembersContent.tsx` | 1882 | Extract the ~750-line analytics cluster → `app/members/analytics/` + a `useHolderStats` hook | MED |
| `app/raffle/RaffleContent.tsx` | 1325 | Extract a `useRaffles` data hook (fetch/poll/past-raffle logic) | LOW-MED |
| `components/ProfileCard.tsx` | 2506 | Extract hooks (`useFriends`/`useMessages`/`useNotifications`/`useRaffleHistory`/`useProfileEdit`), split 6 tabs, collapse 4 dup image sub-components into one `<SkrumpeyImage>`. ~44 `useState`. **Do LAST, one hook at a time.** | HIGH |

### Phase 2 — companion-chat 500 (real WIP bug, per original handoff §6)
4 failing tests in `lib/sanctuary/__tests__/api-e2e.test.ts` — companion chat
returns 500 (not 200) under a mocked LLM. Flagged as possibly a genuine bug behind
the mock, not a stale test. Contained to `lib/sanctuary`; verifiable by re-running
that one test file. The other 2 baseline failures (`game/__tests__/roomScene.test.ts`
PlayerSprite, `components/casino/__tests__/mascotSwap.test.ts` bunny/rabbit guard)
are asset/source guards — lower value.

### Phase 3 — safe codeslop sweep
- Remove genuinely-dead **imports** only (tsc-verified). Includes the AdminContent
  dead code noted above.
- Per-module `lib/db/*` cleanup: route raw `console.*` through the existing `logger`;
  cache `prepare()`d statements; wrap multi-write helpers in `db.transaction(...)`.
  **Behavior-preserving, per-module.**

### DO NOT (from original handoff §5 — still applies)
- Do **not** merge `useDAOAccess` + `useSkrumpeyAccess` (different questions/caching).
- Do **not** delete or force-adopt `components/ui/*` (V2 design-system foundation).
- Do **not** peel the WIP sanctuary tail out of `lib/db.ts` (~4.2k lines, explicitly
  "LEAVE ALONE while WIP" — the db split is intentionally partial, not unfinished debt).
- Do **not** bulk-fix behavior-sensitive lint (`set-state-in-effect`, `exhaustive-deps`,
  `no-require-imports` in `game/scenes/*`, most `no-explicit-any`).

---

## Working-method notes for the next session (important)

The harness in this environment punishes a few habits hard:
- **Do NOT batch many tool calls in one turn.** If any single call in a parallel
  batch fails/cancels, the harness cancels *every* remaining call in that batch.
  Run sequentially, or in small independent groups. Most of last session's apparent
  "instability" was over-batching, not a broken environment.
- **Do NOT run browser/agent-browser/chrome/playwright** for verification here —
  Chrome needs `--no-sandbox` and still tends to hang the shell. Use `curl` for
  route checks and `vitest`/`tsc` for correctness.
- If a `cat`/`sed`/`grep` prints nothing, redirect to a file and `Read` it.
- Verify against ground truth: `git status`/`git diff`, `tsc` exit code, `grep -c`.
  The big god-component splits go smoothly when delegated to a subagent with the
  "one command at a time" + "no browser" constraints baked into the prompt (that's
  how AdminContent landed cleanly).

---

## Quick reference
- **Restart DEV:** `cd /opt/star_world_order && ./start-dev.sh`
- **Typecheck:** `cd /opt/star_world_order/DEV && npx tsc --noEmit`
- **Tests:** `npx vitest run` (expect 1414 pass / 6 pre-existing fail)
- **Route check:** `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3081/<route>`
- **DEV log:** `tail -f /opt/star_world_order/DEV/logs/dev.log`
- **Plan source of truth:** this file + `docs/REFACTOR_HANDOFF_2026-05.md`.
