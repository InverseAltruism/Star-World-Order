# Security Hardening Plan and Execution (DEV)
Date: 2026-02-09
Branch: `dev`
Scope: `/opt/star_world_order/DEV`

## Goal
Harden high-risk API mutation paths and keep admin/user workflows functioning, then validate with a full build and type-check.

## Plan
1. Centralize and enforce admin/cron auth.
2. Add wallet-signature auth (`x-wallet-auth`) for user mutation routes.
3. Wire frontend clients to send wallet auth headers.
4. Encrypt OAuth tokens at rest.
5. Fix build/type blockers and validate end-to-end.
6. Tighten environment file permissions.

## Execution Summary

### 1) Admin/Cron hardening
Completed:
- `app/api/admin/route.ts`: replaced inline admin auth with shared `lib/adminAuth.ts`.
- `app/api/cron/refresh-holders/route.ts`: shared `lib/cronAuth.ts`.
- `app/api/cron/refresh-floor-prices/route.ts`: shared `lib/cronAuth.ts`.
- `app/api/cron/auto-draw-raffles/route.ts`: shared `lib/cronAuth.ts`.
- Production cron policy is fail-closed without valid `CRON_SECRET`.

### 2) Wallet auth system (new)
Completed:
- Added server verifier: `lib/walletAuth.ts`.
- Added client signer/cache helper: `lib/clientWalletAuth.ts`.
- Message format:
  - `SWO Wallet Access`
  - `Address: <wallet>`
  - `IssuedAt: <ms>`
  - `ExpiresAt: <ms>`
- Header format: `x-wallet-auth: address:issuedAt:expiresAt:signature`.

### 3) Protected user mutation routes
Completed:
- `app/api/profile/route.ts` POST requires wallet auth.
- `app/api/friends/route.ts` POST requires wallet auth.
- `app/api/messages/route.ts` POST/PATCH/DELETE require wallet auth.
- `app/api/forum/route.ts` POST actions require wallet auth.
- `app/api/social-connections/route.ts` DELETE requires wallet auth.
- `app/api/notifications/route.ts`:
  - POST `updateSettings` requires wallet auth.
  - POST create-notification is admin-only.
  - PATCH requires wallet auth and ownership check.
  - DELETE requires wallet auth + `walletAddress` + ownership check.
- `app/api/presence/route.ts` POST/DELETE require wallet auth.
- `app/api/voice/route.ts` POST/PATCH/DELETE require wallet auth.
- `app/api/chat/route.ts` POST requires wallet auth.
- `app/api/raffle/route.ts`:
  - `enter` + `markViewed` require wallet auth.
  - `create/draw/end/cancel` + CSV export require admin auth.
- `app/api/governance/route.ts`:
  - `createProposal`, `changeVote`, `cancelProposal` require wallet auth.
  - `updateState` requires admin auth.
  - Removed unsigned vote fallback; voting now requires signature + nonce.

### 3.1) Post-review hardening additions
Completed:
- Secured user-private reads with wallet auth:
  - `app/api/messages/route.ts` GET now requires wallet auth.
  - `app/api/friends/route.ts` GET now requires wallet auth.
  - `app/api/notifications/route.ts` GET now requires wallet auth.
  - `app/api/quests/route.ts` GET with `address` now requires wallet auth.
  - `app/api/raffle/route.ts` history reads (`type=history&address=`) now require wallet auth.
- Secured quest mutations:
  - `app/api/quests/route.ts` POST now requires wallet auth.
- Secured Star Forge game flow:
  - `app/api/starforge/commit/route.ts` now requires wallet auth.
  - `app/api/starforge/reveal/route.ts` now requires wallet auth (bound to `game.player_address`).
  - Added server-side seed store `lib/starforgeSeedStore.ts` and hash verification on reveal.
  - Replaced placeholder Star-holder check in commit route with real on-chain holder check via `checkStarOwnershipBatched`.

### 4) Frontend wiring updates
Completed:
- `components/ProfileCard.tsx`:
  - wallet-auth headers for profile save/avatar/badges, friend actions, message send, raffle markViewed, notification settings.
- `components/UserProfileModal.tsx`:
  - wallet-auth headers for friend send/accept.
  - corrected social query to `?wallet=`.
- `app/members/MembersContent.tsx`:
  - wallet-auth headers for friend send/accept.
- `components/SocialConnect.tsx`:
  - wallet-auth header for disconnect.
- `components/NotificationBell.tsx`:
  - wallet-auth headers for notification reads and mark-read actions.
- `components/MessageIcon.tsx`:
  - wallet-auth header for message conversation reads.
- `app/raffle/RaffleContent.tsx`:
  - wallet-auth headers for `enter` and `markViewed`.
- `app/hangout/HangoutContent.tsx`:
  - wallet-auth headers for chat/presence/voice writes.
- `app/starforge/StarForgeContent.tsx`:
  - wallet-auth headers for commit + reveal requests.
- `app/casino/slots/SlotsContent.tsx`:
  - wallet-auth headers for commit + reveal requests.
- `lib/hooks/useStarPoints.ts`:
  - wallet-auth headers for presence updates/removal.
- `lib/hooks/useGovernance.ts`:
  - wallet-auth headers for governance/forum mutation calls.
- `components/UserProfileModal.tsx`:
  - wallet-auth header for friend status reads.
- `app/members/MembersContent.tsx`:
  - wallet-auth header for friend status reads.

### 5) OAuth token at-rest encryption
Completed:
- `app/api/auth/callback/discord/route.ts`: encrypt access/refresh token before DB write.
- `app/api/auth/callback/x/route.ts`: encrypt access/refresh token before DB write.
- Uses `lib/tokenCrypto.ts` with backward-compatible plaintext fallback when key is not configured.

### 6) Build/type blockers resolved
Completed:
- Fixed Next route typegen blocker by removing non-handler export from route module:
  - Added shared cache file `lib/memberCache.ts`.
  - Updated `app/api/members/route.ts` + `app/api/chat/route.ts`.
- Fixed webpack optional connector dependency explosion:
  - `lib/wagmi.ts` now imports `injected` from `@wagmi/core` instead of `wagmi/connectors` barrel.

### 7) Environment hardening
Completed:
- `.env.local` permission set to `600` (`rw-------`).
- `.env.example` documents:
  - `CRON_SECRET`
  - `TOKEN_ENCRYPTION_KEY` format.

## Validation Results (from DEV)
- `npx next typegen`: passed.
- `npm run type-check`: passed.
- `npm run build -- --webpack`: passed.
- `.env.local` permission check: `-rw-------` confirmed.

## Remaining Risks (Next Iteration)
1. Star Forge pending-seed storage is in-memory for now (`lib/starforgeSeedStore.ts`); process restarts can invalidate pending reveals. For production, use durable ephemeral storage (Redis) with TTL.
2. Host-level hardening (outside repo): firewall and service exposure controls, ensure app only behind reverse proxy.
3. Optional: add automated authz regression tests for protected read/write routes.
