# Security Hardening Handoff (DEV Branch)
Date: 2026-02-09  
Workspace: `/opt/star_world_order/DEV` (`dev` branch)  
Goal: implement high-impact security fixes with minimal production disruption.

## 1) Current State Snapshot
- `DEV` branch is active in `/opt/star_world_order/DEV`.
- `PROD` (`main`) has not been modified in this pass.
- New helper files already created but **not yet wired**:
  - `DEV/lib/adminAuth.ts`
  - `DEV/lib/cronAuth.ts`
  - `DEV/lib/tokenCrypto.ts`
- Current git status (DEV): only those 3 untracked files.
- Security analysis report written outside repo root:
  - `/opt/star_world_order/SECURITY_REPORT_2026-02-09.md`

## 2) Implementation Strategy (Safe-First)
Use phased rollout to avoid breaking production behavior:

1. Wire shared auth helpers in existing endpoints (no functional changes for valid callers).
2. Harden highest-risk admin/cron/test mutation paths first.
3. Update admin frontend wiring so protected endpoints still work from admin UI.
4. Add optional OAuth token-at-rest encryption with backward-compatible fallback.
5. Run type/build checks and smoke tests.

## 3) Exact Plan and File-Level Tasks

### Phase A: Centralize Admin/Cron Auth
#### A1. `adminAuth` helper integration
- Replace inline `verifyAdminAccess` logic in:
  - `DEV/app/api/admin/route.ts`
- With import from:
  - `DEV/lib/adminAuth.ts`
- Keep behavior and response shape consistent: `401` with `{ success:false, error }`.

#### A2. `cronAuth` helper integration
- In cron routes:
  - `DEV/app/api/cron/refresh-holders/route.ts`
  - `DEV/app/api/cron/refresh-floor-prices/route.ts`
  - `DEV/app/api/cron/auto-draw-raffles/route.ts`
- Replace per-file `validateCronSecret` with:
  - `import { validateCronSecret } from '@/lib/cronAuth';`
- Enforce fail-closed policy in production when `CRON_SECRET` is missing.
- Keep dev mode permissive.

Acceptance:
- Cron endpoints still run in `NODE_ENV=development` without token.
- In production mode simulation, missing/invalid token returns `401`.

### Phase B: Harden Critical Admin-Like Endpoints
#### B1. Raffle admin actions require signed admin auth
File:
- `DEV/app/api/raffle/route.ts`

Changes:
- For `POST` actions: `create`, `draw`, `end`, `cancel`
  - Require `verifyAdminAccess(request)` using `x-admin-auth`.
  - Remove/ignore wallet-string-only check as auth source.
- Keep non-admin actions (`enter`, `markViewed`) unchanged to avoid user disruption.

#### B2. Governance dangerous action hardening
File:
- `DEV/app/api/governance/route.ts`

Changes:
- For `action === 'updateState'` only:
  - Require admin auth header via `verifyAdminAccess(request)`.
- Do **not** change normal voting flow in this phase (risk of user disruption).

#### B3. Lock down test/admin utility routes
Files:
- `DEV/app/api/notifications/test/route.ts`
- `DEV/app/api/user-xp/route.ts` (POST only)

Changes:
- Require admin auth for:
  - notifications test `POST` and `GET`
  - user XP `POST`
- Keep user XP `GET` public as currently used by profile/leaderboard.

Acceptance:
- Calls without `x-admin-auth` fail with `401` on protected operations.
- Existing public user flows unaffected.

### Phase C: Wire Admin UI so protections do not break workflows
File:
- `DEV/app/admin_xyz/AdminContent.tsx`

Current state:
- `getAuthHeader()` already exists and is used in many `/api/admin` calls.
- Raffle admin actions currently do not send `x-admin-auth`:
  - lines around existing `fetch('/api/raffle', ...)` calls.
- CSV export currently uses anchor href with no header.

Changes:
- Add `x-admin-auth` header to raffle admin POST calls:
  - create/draw/end/cancel handlers.
- Replace direct CSV `href` export with authenticated fetch:
  - New function `exportRaffleCSV(raffleId)`:
    - get auth header
    - `fetch('/api/raffle?id=...&export=csv', { headers: { 'x-admin-auth': authHeader } })`
    - blob download via temporary URL.

Acceptance:
- Admin can still create/draw/end/cancel/export from UI.
- Unauthorized clients cannot perform admin actions.

### Phase D: Optional Token Encryption-at-Rest (Backward Compatible)
Helpers already created:
- `DEV/lib/tokenCrypto.ts` with optional `TOKEN_ENCRYPTION_KEY`.

Integrate into OAuth callback storage:
- `DEV/app/api/auth/callback/discord/route.ts`
- `DEV/app/api/auth/callback/x/route.ts`

Changes:
- Before DB write, wrap tokens:
  - `encryptToken(accessToken)`
  - `encryptToken(refreshToken)`
- If `TOKEN_ENCRYPTION_KEY` absent/invalid, helper returns plaintext (non-breaking).

Docs:
- Add env docs in:
  - `DEV/.env.example`
- Include `TOKEN_ENCRYPTION_KEY` format guidance (32-byte key hex/base64).

Acceptance:
- OAuth linking still succeeds with and without encryption key.
- No schema migration required.

## 4) Validation Checklist
Run from `/opt/star_world_order/DEV`:

1. Static checks:
   - `npm run type-check`
   - `npm run lint`
2. Build:
   - `npm run build`
3. Manual API checks (dev server running):
   - Protected endpoint without header => `401`.
   - Protected endpoint with valid `x-admin-auth` => success.
   - Cron route behavior:
     - dev mode no token => allowed
     - production mode simulation + missing/invalid token => `401`
4. UI smoke:
   - `/admin_xyz` authentication still works.
   - Raffle admin actions still work.
   - CSV export still downloads.

## 5) Non-Breaking Guardrails
- Do not modify public read endpoints unless required.
- Do not alter database schema in this pass.
- Keep changes in `DEV` only; no direct edits in `PROD`.
- Keep admin auth error format stable (`{ success:false, error }`) for frontend compatibility.

## 6) Git / Branch Workflow (DEV -> MAIN)
1. Implement changes only under `/opt/star_world_order/DEV`.
2. Commit in small logical commits:
   - `security(auth): centralize admin/cron auth helpers + route wiring`
   - `security(ui): admin raffle/export authenticated headers`
   - `security(tokens): optional OAuth token encryption + env docs`
3. Push `dev`.
4. Open PR `dev -> main`.
5. Deploy/test DEV environment first.
6. Merge to main after verification.
7. Deploy PROD from `main`.

## 7) Immediate Follow-Up (Next Iteration)
Not included in this low-risk pass (higher chance of behavior change):
- Full server-side auth for all wallet-mutating routes (`profile`, `friends`, `messages`, `forum`, etc.).
- Governance hardening requiring signatures for all vote/cancel/change paths.
- Starforge commit-reveal security redesign.

