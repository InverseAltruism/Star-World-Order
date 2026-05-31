# SWO Codebase Quality & Structure Audit — 2026-05-31

> Four parallel read-only audits (lib/, components+pages, API routes, project/config).
> All claims grep/Read-verified. `sanctuary` and `outer-rim` are ACTIVE WIP — analyzed for
> quality but their incompleteness is NOT treated as a defect.

## Verdict (TL;DR)

**Healthy, well-organized, unusually well-documented codebase whose tooling looks worse than it is.**
TypeScript is fully `strict` and **compiles clean (0 errors)**. Secrets hygiene, `.gitignore`, lockfile,
package-manager discipline are all correct. Real test coverage exists for casino + sanctuary. The debt is
**shallow and mostly checklist paydown** — but there are a few items that genuinely matter:

- **3 unauthenticated mutating API routes** allow wallet impersonation (security — fix first).
- **`lib/db.ts` is a 9,812-line god-file**; six client components are 1,500–2,500 lines each (structure).
- **6 client fetches have no unmount guards** → state-after-unmount race bugs (correctness).
- **The new `components/ui/*` primitives are unused in production** (285 raw `<button>`s) — adopt or drop.
- A pile of **one-line config wins** (lint noise, broken `xs:` breakpoint, autoprefixer).

---

## P0 — Security (do first)

Three legacy routes trust a wallet address from the request body with **no signature check** (the
`verifyWalletAccess` helper already exists and is used correctly by every sanctuary route):

| Route | Issue |
|---|---|
| `app/api/chat/route.ts:158` POST | post chat messages **as any wallet** (impersonation) |
| `app/api/presence/route.ts:51/106` POST/DELETE | spoof / forcibly remove anyone's presence |
| `app/api/voice/route.ts:62/146/186` POST/PATCH/DELETE | **mute other users / end any voice session** as any wallet |

**Fix:** add `verifyWalletAccess(request, walletAddress)` (+ `.valid` guard) to each. Low effort, high impact.
Secondary: clamp unbounded `?limit=` params on legacy read routes (`admin/governance/notifications/forum/
messages/starforge-stats/user-xp`) with `Math.min`; add address validation + rate limiting to legacy routes
(promote `lib/sanctuary/{validation,rateLimit}` out of the sanctuary namespace).

**Correctly secured (verified — do not touch):** all 27 sanctuary POSTs, governance (EIP-712 + single-use
nonce), starforge commit/reveal, profile/friends/forum/messages/social, admin (signed), cron (`CRON_SECRET`),
OAuth (PKCE + state CSRF). The **sanctuary API is the best-engineered part of the backend** and is the
template the legacy routes should be refactored toward.

---

## P1 — Structure (the god-files)

### `lib/db.ts` — 9,812 lines, 353 exports, #1 structural problem
Sectioned (not random) but holds ~13 unrelated domains + a 605-line schema bootstrap + ~2,840 lines of
sanctuary economy appended to the tail. One SQLite singleton (good). **No SQL-injection risk** (fully
parameterized, 0 `any`). Issues: statements re-`prepare()`d per call; only 10 transactions (multi-write
helpers like `toggleForumLike` race); 19 raw `console.*` + errors swallowed in ~101 catches (the `logger`
exists but db.ts ignores it); stale header doc.

**Plan:** extract `lib/db/connection.ts` (singleton + schema) first, then peel **non-WIP leaf domains** behind
a barrel `lib/db/index.ts` (preserves the 200+ `@/lib/db` import sites): `raffle`, `forum`, `governance`,
`social` (friends/DMs), `notifications`, `treasury`, `starforge`, `chat`, `skrumpey`. **Leave the ~4,000-line
sanctuary tail alone while it's WIP** — it's the place to stop, not start.

### God-components (split into hooks + per-tab files)
| File | LOC | useState | Notes |
|---|---|---|---|
| `components/ProfileCard.tsx` | 2494 | 44 | 6 unrelated domains in one component; extract `useFriends/useMessages/useNotifications/useRaffleHistory/useProfileEdit`, split 6 tabs to files, collapse 4 duplicate image sub-components into one `<SkrumpeyImage>` |
| `app/dao/DAOContent.tsx` | 2372 | 44 | 3 giant inline tabs (Forum ~688 lines) + 4 modals → `app/dao/tabs/*`; **lazy-load** tabs so it stops mounting MembersContent + TreasuryContent (and their fetches) at once |
| `app/admin_xyz/AdminContent.tsx` | 2177 | 45 | 20 fetches, split by tab (effect already keys on activeTab — mechanical) |
| `app/members/MembersContent.tsx` | 1878 | 22 | extract the ~750-line analytics cluster to `app/members/analytics/` + `useHolderStats` |
| `app/raffle/RaffleContent.tsx` | 1739 | 22 | move 3 animation overlays out; extract `useRaffles` (also has the fetch bug below) |

---

## P2 — Correctness bugs (cheap, real)

**Unmount/abort races — 0 `AbortController` anywhere in the 6 big components:**
1. `ProfileCard.tsx:815` metadata fetch (keyed on starSkrumpeys, no guard — stale clobber)
2. `ProfileCard.tsx:845` profile load (wallet switch races)
3. `ProfileCard.tsx:617` chat messages (fast chat-switch lands wrong convo)
4. `MembersContent.tsx:437` member friend-status (modal open/close races)
5. `HangoutContent.tsx:585` displayName
6. `RaffleContent.tsx:676` fetchRaffles (long await chain, wallet switch races)
   → add a `let cancelled=false` guard or `AbortController` per effect.

**Fetch waterfalls:**
- `RaffleContent.tsx:704` — serial `await fetch` in a `for…of` over past raffles → `Promise.all`.
- `RaffleContent.tsx:767` — redundant refetch of a detail already fetched at `:728` → reuse it.

(Healthy: all `setInterval` polls clean up; the hangout window-scroll bug is already fixed and container-scoped.)

---

## P2 — Duplication / consolidation

- **`components/ui/*` primitives are unused in production** — imported only by `app/dev-preview/ui`. Production
  hand-rolls **285 raw `<button>`s** (DAO 43, Admin 22, ProfileCard 17…). **Decide: adopt the primitives on a
  high-traffic page (DAO) to validate them, or they're dead weight.** This is the single biggest consolidation lever.
- **Access gates ~95% copy-paste:** `AccessGate.tsx` vs `SkrumpeyAccessGate.tsx` differ by 44 lines → one
  parameterized component (also removes the lone raw `<img>` at `SkrumpeyAccessGate.tsx:102`).
- **VoiceChat twins:** `HangoutContent.tsx:862` vs `:1149` differ by 21 lines (~280 dup) → one variant-prop component.
- **Discord/X/GitHub SVG icons** duplicated across Footer/SocialConnect/UserProfileModal/admin/raffle/gates →
  `components/icons/*`.
- **API: 134 near-identical try/catch + `NextResponse.json` blocks** → a shared `route()` wrapper +
  `ok()`/`fail()` helpers + `requireWallet()` guard (would also unify the 22-logger / 25-console split).
- `lib/hooks/useDAOAccess` + `useSkrumpeyAccess` both answer "does this wallet hold a Skrumpey" (SanctuaryContent
  imports both) → consolidate.

---

## P3 — Config & tooling one-liners (highest ROI)

1. **ESLint lints vendored OpenZeppelin** — 509 of 720 lint problems are `contracts/casino/lib/**` (git-ignored
   but not eslint-ignored). Add `'contracts/casino/lib/**'` to `eslint.config.mjs` `ignores` → real issues drop
   to ~211. **One line.**
2. **`xs:` breakpoint is silently broken** — Tailwind v4 reads `@theme`, which has no `--breakpoint-*`; the
   legacy `tailwind.config.ts` (`screens.xs: 475px`) is never loaded. So `xs:` classes in 4 files emit no CSS.
   **Fix:** add `--breakpoint-xs: 475px;` to the `@theme` block in `app/globals.css`, then delete the dead
   `tailwind.config.ts`.
3. **Drop `autoprefixer`** from `postcss.config.mjs` + devDeps (redundant under Tailwind v4 / Lightning CSS).
4. **Colyseus version skew:** `colyseus@0.17` server vs `colyseus.js@0.16` client — align.
5. **~211 real lint issues:** 117 `no-unused-vars` (mechanical), 47 `no-explicit-any`, 14 `<img>`→`next/image`.
6. **db.ts errors → `logger`** (stop 19 raw `console.*` + silent swallows).

---

## P3 — Testing / CI gaps

- **Untested high-traffic surfaces:** `lib/db.ts`, the general `app/api/**` routes, and the god-components have
  no unit tests. Coverage instrumentation only measures `lib/{starforge,casino}` so the coverage number is blind.
- **CI is casino-centric** (5 workflows, mostly casino). **No broad `tsc + eslint + vitest` gate** — and tsc
  already passes, so the typecheck gate is free today. Add one once lint is de-noised (#P3.1).
- **24 npm vulns** (6 low / 11 moderate / 7 high), all transitive `ws`/`ethers`/`viem`/`vite`. The only
  `--force` fix is a breaking `ethers@5` downgrade — remediate deliberately, **don't `audit fix --force`**.

---

## Healthy findings (no action)

`tsc` clean & strict; secrets/gitignore/lockfile correct; `.env.local` not tracked, only placeholders in
`.env.example`; excellent docs/ADR culture (~35 docs); uniform `page.tsx → *Content.tsx` convention; `any`
near-zero in lib (7 total, 0 in db.ts); all polls clean up; multicall batching live for treasury/holder-stats;
sanctuary + outer-rim libs are clean, well-tested, co-located-test modules.

---

## Suggested sequencing

1. **P0 security** (chat/presence/voice auth) — small, important.
2. **P3 one-liners** (eslint ignore, `xs` breakpoint, autoprefixer) — minutes, unblocks a real lint signal.
3. **P2 correctness** (abort guards on the 6 fetches, raffle waterfall) — cheap, fixes real races.
4. **Decide ui/* adoption** + consolidate access gates / VoiceChat / icons.
5. **Structural** (db.ts split behind a barrel; god-component hook extraction) — larger, do incrementally, leave
   sanctuary/outer-rim WIP untouched until they settle.
6. **CI gate + tests** for db.ts / API once lint is green.
