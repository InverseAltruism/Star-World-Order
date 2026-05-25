# SWO Outer Rim — Mode-C Delegated Session-Key Signing

**Status:** Proposed (engineering rationale; pending operator review)
**Date:** 2026-05-25
**Deciders:** Operator (InverseAltruism), Clarvis (executive function)
**Resolves:** [`[SWO_OUTER_RIM_DELEGATED_SIGNING_DESIGN]`] (PROJECT:SWO, P2)
**Depends on:** [Hybrid Execution Model RFC](./SANCTUARY_OUTER_RIM_HYBRID_RFC.md) (§3.3 Mode C, §6.4 rollout, OQ-H2/H5/H6/H8)
**Ports:** Star Arena `contracts/DelegatedAccountLockAdapter.sol` (lock-adapter pattern; operational knowledge in [Perpl Integration Reference](./PERPL_INTEGRATION_REFERENCE.md), PR #363)
**Relates to:** [ADR-003 Outer Rim](./SANCTUARY_ADR_003_OUTER_RIM.md) (§2 Voyages); Risk Guardrails — `lib/outer-rim/riskGuards.ts` + `docs/SANCTUARY_OUTER_RIM_RISK.md` (`[SWO_OUTER_RIM_RISK_GUARDRAILS]`, PR #367; spend/leverage caps)

---

## 1. Context

The Hybrid Execution RFC (§3.3) defines **Mode C** — a premium, long-duration
(Expedition-only) voyage that maps **1:1 to a real perpetual position on Star
Arena**, so the user's outcome *is* the venue PnL with an on-chain proof. Mode C
is the only mode where a **per-user, real, on-venue position** is opened and
closed on the user's behalf. That raises the question the RFC deferred to this
doc: **who signs the open/close orders, and with what authority over the user's
funds?**

Two naive answers are both wrong:

1. **The user signs every order interactively.** A voyage spans 90 minutes with a
   6-block TTL fill window and a possible mid-voyage rehedge/abort (RFC OQ-H6).
   Forcing a wallet prompt at each on-chain step makes the "set it and forget it"
   voyage UX impossible and strands positions whenever the user is away from
   their wallet.
2. **A custodial house wallet holds user funds and trades on their behalf.** This
   collapses every Mode-C user's margin into one hot key. A single compromise
   drains the whole book; it is also a custody posture SWO has explicitly avoided
   (ADR-002's soulbound STAR / non-custodial stance, and the governance doctrine
   of *never trusting a single server-held key with user value*).

This doc specifies the third path: a **scoped, time-boxed session key** that may
open and close *only the one designated voyage position*, under spend and
leverage caps baked into the delegation, with the user's main wallet retaining
custody throughout and an **escrow lock** holding exactly the voyage's margin for
the voyage window. It is the on-chain authority model that makes Mode C shippable
in RFC Phase 6.4 without a house wallet.

This is a **design doc**, not an implementation. No contract, endpoint, or key
ships from this doc; it fixes the delegation model that a future Mode-C connector
/ session-key PR must conform to.

### 1.1 The ported pattern — `DelegatedAccountLockAdapter.sol`

Star Arena already solved the structurally identical problem for **tournaments**:
how does a tournament manager freeze a user's delegated trading account *for the
tournament window* without ever holding the user's keys? The answer is
`contracts/DelegatedAccountLockAdapter.sol` (Star Arena repo). Its mechanics,
carried verbatim as the pattern this doc ports:

| Star Arena element | What it does | SWO Mode-C analogue |
|---|---|---|
| `admin` role | Privileged config: rotate roles, register accounts | Outer Rim **operator multisig** (config only, never trades) |
| `tournamentManager` role | The *only* address that may set/clear a lock | The **voyage executor** (a hot key scoped to open/close, never custody) |
| `registerDelegatedAccount(owner, acct)` | Records `owner → delegatedAccount`, **reverts unless `IDelegatedAccountLike(acct).owner() == owner`** (`OwnerMismatch`) and `acct.code.length > 0` (`NotContract`) | Bind a voyage session key to the user's account only after proving the account is owned by that user — no spoofed delegations |
| `setTournamentLock(owner, locked)` | `onlyTournamentManager` flips a per-owner lock for the event duration | `lockForVoyage` / `unlockOnSettle` — escrow the margin for the voyage window, release on close |
| `isTournamentLocked(owner)` view | Anyone can read whether an account is currently locked | `isVoyageLocked(owner)` — settlement and UI read the live lock state |
| Events `AccountLockUpdated`, `AccountRegistryUpdated`, `AdminTransferred`, `TournamentManagerSet` | Every state change is logged for off-chain reconciliation | Same event surface; the on-chain proof Mode C promises the user |

The load-bearing properties ported verbatim:

- **Role separation.** `admin` (config) and `tournamentManager` (lock) are
  distinct addresses. The address that can *trade/lock* is never the address that
  can *reconfigure* — and **neither holds user funds**. The user's delegated
  account holds the funds; the adapter only holds *lock state* and a registry.
- **Owner-match registration.** A delegation cannot be registered for an account
  unless the account's own `owner()` confirms the user. Star Arena's
  `OwnerMismatch` revert is exactly the guard that stops the executor from
  binding a session key to an account it does not own.
- **Scoped, reversible lock, not custody.** The adapter never moves tokens. It
  flips a boolean that *other* contracts (the exchange integration) honor. The
  SWO port keeps this: the session key's authority is **scoped capability**, not
  possession of the user's private key.

> What SWO adds beyond the Star Arena adapter: a **session key with an explicit
> TTL** and **per-delegation spend/leverage/market caps** (Star Arena's lock is
> binary — locked or not; SWO's delegation carries the voyage's limits). The
> lifecycle, role separation, and owner-match are ported; the capability scoping
> is the new layer §2 specifies.

---

## 2. What the session key may and may NOT do

A Mode-C session key is a freshly generated keypair, authorized by the user's
main wallet (via the delegation grant, §3 T1), and registered against the user's
delegated account through the ported adapter. Its authority is **enumerated and
capped at grant time** — anything not on the allow-list is impossible, not merely
discouraged.

### 2.1 May (allow-list — exhaustive)

| Capability | Bound |
|---|---|
| **Open one position** on the **single designated market** | The exact `market_id` fixed at grant (e.g. MON-PERP `64`, per Perpl Integration Reference §4). No other market. |
| **Close that same position** | Only the position id opened under this delegation (`lp = position_id`, Perpl ref §6). |
| **Resubmit on 6-block TTL expiry** | Up to the RFC OQ-H6 retry count, at bounded price drift; same market, same direction. |
| **Post margin up to the capped notional** | `≤ delegated_notional` (the voyage's staked margin), nothing more. |
| **Use leverage up to the capped leverage** | `≤ min(voyage_leverage, 50×)` — the venue 50× cap (Perpl ref §5) is a hard ceiling regardless of grant. |

### 2.2 May NOT (deny-list — enforced, not advisory)

| Forbidden | Why / enforced by |
|---|---|
| **Withdraw to an arbitrary address** | Settlement returns funds **only** to the user's main wallet / delegated account. No `withdraw(to)` with attacker-chosen `to` is in the session key's scope. This is the single most important guard — it is what makes a leaked session key *not* a drained wallet. |
| **Trade any market other than the designated one** | Open/close are pinned to the grant's `market_id`; an order on another market is rejected pre-signature. |
| **Exceed `delegated_notional` or the leverage cap** | Caps are baked into the delegation and re-checked at the connector (mirrors the Risk Guardrails pure guards). Over-cap order → revert. |
| **Open a second/replacement position after settle** | One delegation = one position. Post-`SETTLE`/`REVOKE` the key is dead (§3). |
| **Act after expiry (TTL) or after revoke** | Any order signed after `expires_at` or after the user's revoke is rejected — the lock is cleared and the registry binding torn down. |
| **Move STAR, governance, or NFT assets** | The delegation is scoped to the **DUST/margin** of one voyage on one perp market. It has zero authority over soulbound STAR (ADR-002), voting power, or Skrumpey NFTs. |

The deny-list is not policed by the session key's good behavior — it is the
*absence* of those capabilities in the delegation. A compromised session key can
do at most what §2.1 allows: open/close one capped position on one market, with
proceeds returnable only to the owner.

---

## 3. Delegation lifecycle state machine

Five states, one happy path (`GRANT → LOCK → EXECUTE → SETTLE → REVOKE`), with
every failure transition enumerated. The lock/unlock primitives are the ported
`setTournamentLock(owner, true/false)`; the registry binding is
`registerDelegatedAccount(owner, sessionAccount)`.

```
        user signs grant            executor locks            fill confirmed
        (main wallet)               margin escrow             on Star Arena
  ┌───────┐ ───────────► ┌────────┐ ───────────► ┌──────────┐ ──────────► ┌────────┐
  │ (none)│  T1: GRANT    │ GRANTED│  T2: LOCK     │  LOCKED  │  T3: EXECUTE│ ACTIVE │
  └───────┘               └────────┘               └──────────┘            └────────┘
                              │                         │                      │
                              │ T1f: grant fails        │ T2f: lock fails      │ voyage window
                              ▼ (owner mismatch,         ▼ (insufficient        │ elapses / close
                               cap invalid) → abort       margin) → abort        ▼
                                                                            ┌────────┐
                                                                            │SETTLING│  T4: SETTLE
                                                                            └────────┘  (close pos,
                                                                                 │       reconcile,
                                                                                 ▼       return to owner)
                                                                            ┌────────┐
                                                                            │ REVOKED│  T5: REVOKE
                                                                            └────────┘  (unlock, kill key,
                                                                                         tear down registry)
```

| # | From | To | Trigger | Guard conditions | Effects |
|---|---|---|---|---|---|
| **T1** | — | `GRANTED` | User signs delegation from main wallet | Voyage is Mode-C eligible (Expedition, notional ≥ §2.1 floor, RFC OQ-H2); session key freshly generated; caps (`market_id`, `notional`, `leverage`, `expires_at`) set | `registerDelegatedAccount(owner, sessionAcct)` — **reverts unless `owner()` matches** (ported `OwnerMismatch`); emit `DelegationGranted`; key authorized for §2.1 scope only |
| **T2** | `GRANTED` | `LOCKED` | Executor calls `lockForVoyage` | `onlyVoyageExecutor` (ported `onlyTournamentManager`); margin ≥ `delegated_notional`; not already locked | `setTournamentLock(owner, true)`; escrow exactly the voyage margin for the window; emit `AccountLockUpdated(owner, true)` |
| **T3** | `LOCKED` | `ACTIVE` | Open order fills on Star Arena | Order within caps (§2.1); fill within 6-block TTL (else resubmit/abort, F2/OQ-H6); `venue != address(0)` (RFC §1.2 — Perpl zero-address hard-revert) | Record `position_id`; emit `PositionOpened`; voyage clock starts |
| **T4** | `ACTIVE` | `SETTLING` → `REVOKED` | Voyage duration elapses (or user-initiated early close) | Close order targets only this `position_id`; reconcile venue PnL vs synthetic guard rail (RFC OQ-H8) | Close position; **return proceeds only to owner** (§2.2); settle DUST (ADR-003 §2); then T5 |
| **T5** | any non-terminal | `REVOKED` | Settle complete **or** user revokes **or** `expires_at` reached | — (always reachable; terminal) | `setTournamentLock(owner, false)`; session key **deauthorized**; registry binding torn down; emit `AccountLockUpdated(owner, false)` + `DelegationRevoked` |
| **T1f** | `GRANTED` (attempt) | abort | Grant guard fails | Owner mismatch, invalid caps, or not Mode-C eligible | No registration, no lock, no key authorized |
| **T2f** | `LOCKED` (attempt) | abort | Lock guard fails | Margin insufficient or already locked | Lock not set; grant remains `GRANTED` and expires harmlessly at TTL → T5 |

**Auto-revoke is the invariant.** Every terminal path (`SETTLE`, user revoke, TTL
expiry, abandoned voyage) routes through **T5**, which clears the lock and kills
the key. There is no state in which a position is closed/settled but the key
remains live, and no state in which the lock outlives the voyage. This mirrors
the Star Arena guarantee that a tournament lock is always cleared when the
tournament ends — extended here with the *key deauthorization* SWO adds.

---

## 4. Failure modes

Each row is a concrete race or edge case, the chosen resolution, and the
state-machine transition (§3) that enforces it. **At least five required by
acceptance; seven listed; the three named in the task — voyage abandoned, key
expiry mid-position, user revokes early — are F1, F2, F3.**

| # | Failure mode | Resolution | Enforced by |
|---|---|---|---|
| **F1** | **Voyage abandoned** — user starts a Mode-C voyage, locks margin, then disappears (never returns to view the result) | The voyage has a fixed duration (90-min Expedition). At duration end the executor closes the position and settles **without** any user action; T4 → T5 fires on the clock, not on user presence. Abandonment is indistinguishable from a normal completed voyage from the protocol's side — proceeds return to the owner's wallet regardless. | T4 on duration timer; T5 auto-revoke |
| **F2** | **Session key expires mid-position** — `expires_at` is reached while the position is still `ACTIVE` | The TTL bounds the **grant**, but the close authority must outlive a still-open position or funds strand. Resolution: `expires_at` is set to **voyage duration + a settlement grace margin** (OQ-D1), so a normally-progressing voyage always closes before expiry. If expiry is nonetheless reached with a live position (executor outage), the key may **only close** (never open) past expiry, and the operator multisig (`admin`) can re-point the executor and force-close. Expiry can never authorize a *new* open. | TTL gated to duration+grace (OQ-D1); admin force-close fallback |
| **F3** | **User revokes early** — user calls revoke while a position is `ACTIVE` | Revoke is a first-class user right and always reachable (T5 from any non-terminal state). Revoke triggers an **immediate close** of the live position at market (within the 6-block TTL / OQ-H5 slippage bound), reconciles PnL, returns proceeds to the owner, then clears the lock and kills the key. The user cannot revoke *into* a stranded-funds state — revoke implies close-and-return, not key-deletion-leaving-position-open. | T5; revoke ⇒ close-first |
| **F4** | **Leaked / compromised session key** | The key can do at most §2.1 (open/close one capped position on one market) and **cannot withdraw to an arbitrary address** (§2.2). Worst case: an attacker churns the one position (bounded by caps + slippage guard OQ-H5) — the funds still settle to the owner. No other user is affected (one key ≠ one shared wallet, §5). | §2.2 deny-list (no `withdraw(to)`); per-user key scope |
| **F5** | **Executor binds a key to an account it doesn't own** (spoofed delegation) | `registerDelegatedAccount` reverts with `OwnerMismatch` unless `IDelegatedAccountLike(acct).owner() == owner` and `acct.code.length > 0` (`NotContract`). A session key cannot be registered against a victim's account. | T1; ported owner-match + code-length guard |
| **F6** | **Double-settle / settle-vs-revoke race** — duration timer fires T4 at the same instant the user fires T5 | Lock transition is a single atomic state write (ported from the adapter's single-writer `setTournamentLock`). First writer moves `ACTIVE → SETTLING/REVOKED`; the second observes a terminal state and no-ops. Position is closed exactly once; proceeds returned once. | T5 terminal; atomic lock write |
| **F7** | **Perpl-routed Mode-C order on mainnet** (Perpl exchange = zero address) | Mode C is **Star-Arena-only** at launch (RFC §1.2). The connector asserts `venue != address(0)` before any open (T3 guard); a Perpl-targeted Mode-C grant hard-reverts rather than signing an order into the black-hole address. | T3 `venue != address(0)` assertion |

---

## 5. Why this beats a custodial house wallet

The whole point of the delegated session-key model is **blast-radius
containment** — and the contrast with a house wallet is the justification for the
added complexity.

| Property | Custodial house wallet | Delegated session key (this doc) |
|---|---|---|
| Key holding all user funds | **Yes** — one hot key is the entire Mode-C book | **No** — each user's funds sit in their own delegated account; the session key only has *scoped capability* |
| Blast radius of one key compromise | **The whole book** drains | **One voyage's capped notional**, and proceeds still settle to the owner (no arbitrary withdraw, §2.2) |
| User retains custody | No (funds in house wallet) | **Yes** — main wallet never hands over its private key; it authorizes a capped, expiring delegate |
| Withdrawal authority | House operator can move funds anywhere | Session key can return funds **only to the owner**; operator multisig (`admin`) can rotate the executor but **cannot trade or withdraw** |
| Authority lifetime | Indefinite (operator discretion) | **Bounded to the voyage window** + grace; auto-revoked on settle (T5) |
| Per-user scope | One shared trust boundary for all users | One delegation per voyage per user — failures don't cross users |
| Matches SWO doctrine | No — single server-held key over user value | Yes — non-custodial, scoped, on-chain-auditable (ADR-002 / governance "never trust a single key") |

The structural win, in one line: **no single key ever holds all user funds.** A
house wallet makes "compromise of the trading key" equivalent to "loss of the
book"; the delegated model makes it equivalent to "one user's capped position
gets churned, funds still come home." That is the same risk reduction Star Arena
got from the lock adapter (a tournament manager can freeze accounts but cannot
seize them), extended with TTL + capability scoping so the *trading* authority,
not just the *lock*, is bounded.

---

## 6. Open questions (operator decisions)

**At least three required by acceptance; five listed.** Each gates the Mode-C
session-key contract / connector PR.

| # | Question | Default proposed here | Gates |
|---|---|---|---|
| **OQ-D1** | **Session-key TTL.** What is `expires_at` relative to voyage duration? Too tight strands a slow-settling position (F2); too loose leaves a live key after a normal close. | **Voyage duration + 15-min settlement grace** (covers 6-block TTL resubmits + reconciliation), with admin force-close as the outage fallback. | TTL constant; F2 grace window; executor outage runbook |
| **OQ-D2** | **On-chain vs off-chain delegation.** Is the delegation an **on-chain** authorization (e.g. ERC-4337 session key / account-abstraction grant, fully auditable, higher gas) or an **off-chain** signed authorization the executor presents to the venue (cheaper, faster, but the audit trail lives off-chain)? Mode C promises "on-chain proof" — does that proof require the *delegation* on-chain, or only the *position*? | TBD — lean on-chain for the position (the proof) + on-chain lock state (ported adapter), delegation grant signature may be off-chain if the venue accepts presented authority. Operator call. | Whether a 4337/AA stack is required; gas budget (RFC OQ-H7) |
| **OQ-D3** | **Executor key custody & rotation.** The voyage executor is a hot key (it signs opens/closes). Where does it live (HSM, KMS, multisig-gated relayer?) and what is the rotation cadence? The `admin` (multisig) can re-point it (`setTournamentManager` analogue), but rotation policy is unspecified. | Executor in KMS; `admin` multisig rotates on a schedule + on any suspected compromise; rotation is a config-only op (never touches user funds). | Key-management runbook; `admin`/executor role wiring |
| **OQ-D4** | **Re-hedge / partial-fill authority.** RFC OQ-H6 allows TTL-expiry resubmits. Does the session key get standing authority to resubmit autonomously (smoother UX, more autonomous key), or must each resubmit re-confirm against caps? | Autonomous resubmit **within caps** (same market/direction/notional), bounded by OQ-H6 retry count and OQ-H5 slippage; no re-confirmation needed because it cannot exceed §2.1. | Connector retry state machine; cap re-check placement |
| **OQ-D5** | **Force-close governance.** On executor outage with a live position past TTL (F2), `admin` force-closes. Is that a unilateral multisig action, or does it require a timelock / user notice? Unilateral is faster (funds at risk); timelock is safer against an `admin` compromise. | Unilateral multisig **close-only** (cannot withdraw elsewhere, §2.2), logged; no timelock because the action is bounded to returning funds to the owner. | `admin` force-close scope; incident runbook |

---

## 7. Acceptance self-check

| Criterion | Where |
|---|---|
| (a) doc exists | this file |
| (b) cites `DelegatedAccountLockAdapter.sol` (knowledge ported in `PERPL_INTEGRATION_REFERENCE.md`, PR #363) | header "Ports", §1.1 (full mechanic table + ported properties) |
| (c) §"State machine" (grant→lock→execute→settle→revoke) | §3 (T1–T5 + T1f/T2f) |
| (c) §"Failure modes" ≥ 5 | §4 (F1–F7; F1 abandoned, F2 expiry mid-position, F3 user revokes early) |
| (d) §"Open questions" ≥ 3 operator decisions (incl. session-key TTL, on-chain vs off-chain) | §6 (OQ-D1 TTL … OQ-D2 on/off-chain … OQ-D5) |
| Scope (a) lifecycle / (b) may–may-not / (c) failure handling / (d) why-not-custodial | §3 / §2 / §4 / §5 |

---

## 8. References

- [SWO Outer Rim — Hybrid Execution Model RFC](./SANCTUARY_OUTER_RIM_HYBRID_RFC.md)
  — §3.3 Mode C (the per-user real position this doc authorizes), §1.2 Perpl
  zero-address (F7), §6.4 rollout, OQ-H2/H5/H6/H8.
- [Perpl Integration Reference](./PERPL_INTEGRATION_REFERENCE.md) (PR #363) —
  source-of-record for the Star Arena connector facts; §4 markets (`market_id`),
  §5 trading params (50× cap, leverage encoding), §6 order types (`lp =
  position_id`, close-long/short).
- Star Arena `contracts/DelegatedAccountLockAdapter.sol` + `interfaces/IDelegatedAccountLock.sol`
  — the lock-adapter pattern ported here: `admin`/`tournamentManager` role
  separation, `registerDelegatedAccount` owner-match (`OwnerMismatch`,
  `NotContract`), `setTournamentLock`/`isTournamentLocked`, lock events.
- [ADR-003 Outer Rim](./SANCTUARY_ADR_003_OUTER_RIM.md) — §2 Voyages (duration
  tiers, Expedition = 90 min); the synthetic guard rail Mode C reconciles against.
- [ADR-002 STAR Currency](./SANCTUARY_ADR_002_STAR_CURRENCY.md) — soulbound /
  non-custodial doctrine the session-key model upholds (§2.2: no STAR/NFT authority).
- SWO Outer Rim — Risk Guardrails (`lib/outer-rim/riskGuards.ts`,
  `docs/SANCTUARY_OUTER_RIM_RISK.md`; `[SWO_OUTER_RIM_RISK_GUARDRAILS]`, PR #367)
  — the spend/leverage caps re-checked at the connector (§2.2).
