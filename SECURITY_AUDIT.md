# Security Audit Report — Star World Order

**Date:** 2026-02-10
**Scope:** Full codebase security review of API routes, authentication libraries, and user input handling.

---

## Executive Summary

The Star World Order codebase has a **solid security foundation**: all database queries use parameterized statements (no SQL injection), admin routes are properly authenticated, and signature verification uses well-tested cryptographic libraries (viem). However, several critical gaps were identified and fixed in this audit.

---

## Findings & Remediation

### 🔴 Critical — Fixed

| # | Finding | Risk | Fix Applied |
|---|---------|------|-------------|
| 1 | **Chat POST endpoint had no wallet authentication** — anyone could send messages as any wallet address | Impersonation, spam | Added `verifyWalletAccess()` check to `POST /api/chat` |
| 2 | **Messages POST endpoint had no wallet authentication** — direct messages could be sent as any wallet | Impersonation | Added `verifyWalletAccess()` check to `POST /api/messages` |
| 3 | **No HTML sanitization on user-generated content** — chat messages, forum posts, direct messages, and profile bios stored raw, enabling stored XSS | XSS | Created `lib/sanitize.ts` with `escapeHtml()`, applied to all user content inputs |
| 4 | **Cron secret compared with `!==` (timing attack)** — string comparison leaks secret length via timing side-channel | Secret disclosure | Replaced with `crypto.timingSafeEqual()` in `lib/cronAuth.ts` |
| 5 | **Weak nonce generation using `Math.random()`** — nonces in vote signatures were predictable | Replay attacks | Replaced with `crypto.randomBytes()` in `lib/voteSignature.ts` |

### 🟡 Medium — Fixed

| # | Finding | Risk | Fix Applied |
|---|---------|------|-------------|
| 6 | **Missing wallet address format validation** — chat, messages, and forum endpoints accepted arbitrary strings as addresses | Data corruption, logic errors | Added `isValidWalletAddress()` checks to chat POST, messages POST, and forum createThread |

### 🟢 Already Secure (No Changes Needed)

| Area | Status | Details |
|------|--------|---------|
| **SQL Injection** | ✅ Safe | All queries use parameterized statements (`db.prepare()` with `?` placeholders) |
| **Admin Authentication** | ✅ Safe | `verifyAdminAccess()` with signature verification and nonce replay protection |
| **Wallet Signature Verification** | ✅ Safe | Uses viem's `verifyMessage()` with timestamp expiration |
| **Token Encryption** | ✅ Safe | AES-256-GCM with random IVs and authentication tags |
| **OAuth Flows** | ✅ Safe | PKCE and CSRF state parameters implemented |
| **Profile Display Names** | ✅ Safe | Regex allowlist (`[a-zA-Z0-9 _-]`) already prevents injection |
| **Error Handling** | ✅ Safe | API routes catch errors and return generic messages, no stack traces leaked |

---

## Accepted Risks (Not Over-Engineered)

| Item | Current State | Why Acceptable |
|------|---------------|----------------|
| **Admin nonce stored in-memory** | Lost on server restart; nonces become replayable briefly | 5-minute expiry window limits risk; restart is rare; database persistence would add complexity |
| **GET endpoints unauthenticated** | Profile/chat data readable without auth | This is public data by design (member directory, chat room); no secrets exposed |
| **Dev mode bypass in cronAuth** | `NODE_ENV=development` skips auth | Standard Next.js pattern; production always has `NODE_ENV=production` |
| **tokenCrypto fallback to plaintext** | If encryption key missing, stores tokens unencrypted | Logs a warning; acceptable during initial setup; documented in `.env.example` |

---

## Files Changed

| File | Change |
|------|--------|
| `lib/sanitize.ts` | **New** — HTML escaping and wallet address validation utilities |
| `lib/__tests__/sanitize.test.ts` | **New** — 17 tests covering XSS payloads and address validation |
| `lib/cronAuth.ts` | Timing-safe comparison using `crypto.timingSafeEqual()` |
| `lib/voteSignature.ts` | Cryptographically secure nonce via `crypto.randomBytes()` |
| `app/api/chat/route.ts` | Added wallet auth, address validation, HTML escaping |
| `app/api/messages/route.ts` | Added wallet auth, address validation, HTML escaping |
| `app/api/forum/route.ts` | Added address validation, HTML escaping on all content |
| `app/api/profile/route.ts` | Added HTML escaping on bio field |

---

## Recommendations for Future Consideration

1. **Rate limiting** — Consider adding rate limits to chat and message endpoints to prevent spam.
2. **Content Security Policy (CSP)** — Add CSP headers to prevent inline script execution as defense-in-depth.
3. **Persistent nonce storage** — If admin actions become more critical, move nonce tracking to SQLite.
