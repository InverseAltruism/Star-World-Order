# SWO Outer Rim — Real-Execution Risk Guardrails

**Status:** Proposed (engineering rationale; pending operator review)
**Date:** 2026-05-25
**Deciders:** Operator (InverseAltruism), Clarvis (executive function)
**Resolves:** `[SWO_OUTER_RIM_RISK_GUARDRAILS]` (PROJECT:SWO, P2)
**Depends on:** [Hybrid Execution Model RFC](./SANCTUARY_OUTER_RIM_HYBRID_RFC.md) (§2 synthetic-vs-real, §2.1 fee-breakeven, §3 the three modes, §4 composition, OQ-H2/H3/H4/H5/H6/H8)
**Extends:** [ADR-003 Outer Rim](./SANCTUARY_ADR_003_OUTER_RIM.md) (§2 Voyages, §"Risks" → Oracle dependency)
**Knowledge ports:**
[`docs/PERPL_INTEGRATION_REFERENCE.md`](./PERPL_INTEGRATION_REFERENCE.md) (connector facts: taker fee, 50× cap, 6-block TTL, IOC, 2 bps slippage floor, Perpl mainnet zero-address) ·
Star Arena circuit-breaker `/home/agent/agents/star-arena/workspace/src/core/safety.py` (`SafetyManager` / `CircuitBreakerConfig`) and validation gates `…/src/core/validation_gates.py`
**Implements:** `lib/outer-rim/riskGuards.ts` (+ `riskGuards.test.ts`, 25 vitest cases)
**Source memo:** `memory/evolution/swo_offshore_protocol_analysis_2026-05-23.md` Memo 2 §3 (Mode B/C constraints)

---

## 1. Context

The [Hybrid Execution RFC](./SANCTUARY_OUTER_RIM_HYBRID_RFC.md) fixed *when* a
voyage runs synthetically (Mode A) versus against a real Star Arena perp
position (Mode B treasury hedge, Mode C per-user). It deliberately deferred the
**risk envelope** of that real tier to this document. The RFC's load-bearing
principle is that **real execution is additive, never load-bearing** (RFC §7):
the pure voyage engine owns the user-facing result in every mode, so if the
venue degrades the product degrades *to Mode A* — the launch product — not to
broken. This doc specifies the guards that enforce exactly that degradation.

These are the same concerns the Star Arena trading agent already solved in
production. `src/core/safety.py` runs a `SafetyManager` with a
`CircuitBreakerConfig` (15% drawdown trigger, $1,000/hour loss limit, 300s
cooldown, 10-consecutive-loss pause) and a `RUNNING / PAUSED / EMERGENCY_STOP`
state machine that gates every trade via `is_trading_allowed()`. We port that
shape — daily-loss trigger, cooldown re-arm, halt-but-don't-break — into the
Outer Rim's economics, where "halt real backing" means "fall back to synthetic"
rather than "stop trading," because synthetic is a fully functional product.

**Scope.** Six guards covering memo 2 §3's Mode B/C constraints. Each is a
**pure function** in `lib/outer-rim/riskGuards.ts` — no clock reads (callers
pass `nowMs`), no network, no venue — so the entire risk envelope is
unit-testable before any connector touches Monad, mirroring the discipline
ADR-003 §"Constrains" requires of the voyage engine and Star Vault reducer.

This is a **design RFC + pure module**, not a connector. No order is placed
from this code; it returns verdicts that the future
`[SWO_OUTER_RIM_PERP_CONNECTOR]` and settlement endpoint must honor.

---

## 2. The guard verdict contract

Every guard returns a `GuardVerdict`:

```ts
interface GuardVerdict {
  ok: boolean;          // real leg may proceed unchanged
  tripped: boolean;     // a threshold was breached
  action: GuardAction;  // what the caller must do
  reason: string;       // human-readable (mirrors SafetyState.reason)
}
```

`GuardAction` is the four-valued degradation ladder:

| Action | Meaning | Who is affected |
|---|---|---|
| `allow` | real leg proceeds | — |
| `degrade-to-synthetic` | skip the real leg; settle this voyage as Mode A | this voyage only |
| `refund-and-degrade` | refund staked Influence **and** settle synthetically | this voyage's user |
| `halt-real` | circuit breaker open: stop **all** real backing; synthetic continues | whole real tier |

The ladder is the formalization of RFC §7's "degrade to Mode A, not to broken."
`degrade-to-synthetic` is the default failure response because Mode A is the
launch product (RFC §6.1) — a guard trip costs the protocol a hedge, never a
user's voyage.

---

## 3. Thresholds (`DEFAULT_RISK_CONFIG`)

All thresholds are explicit and operator-tunable. Launch defaults:

| Threshold | Default | Source / rationale |
|---|---|---|
| `epochNotionalCapPct` | **0.10** (10% of treasury) | Conservative cap on real notional per epoch; bounds correlated-loss blast radius. |
| `maxLeverageModeC` | **5×** | Task floor. Far under the venue cap — Mode C is per-*user* real capital, kept tight. |
| `maxLeverageModeB` | **10×** | Configurable. Treasury hedge sizes to net delta (RFC OQ-H4), so modest leverage suffices. |
| `venueMaxLeverage` | **50×** | Hard venue cap — `PerplMarket.max_leverage = 50` (PERPL_INTEGRATION_REFERENCE §4–5). No guard may exceed it. |
| `dailyLossLimitMon` | **250 MON** | Circuit-breaker trigger. Ports `CircuitBreakerConfig.max_loss_per_hour` shape to a daily MON budget. |
| `breakerCooldownMs` | **300_000** (300s) | Verbatim from Star Arena `CircuitBreakerConfig.cooldown_seconds = 300`. |
| `oracleDivergenceToleranceBps` | **50 bps** | Headroom above the 2 bps slippage floor; the RFC OQ-H8 reconciliation tolerance. |
| `maxRealPositionsPerEpoch` | **50** | Hard ceiling on venue surface area, independent of notional. |
| `minFillFraction` | **0.95** | A fill below 95% of requested size is treated as a failed open. |

Re-running with the operator's chosen regime is a one-struct change; the
*shape* of the guards is invariant to the numbers.

---

## 4. The six guards

### 4.1 Per-epoch notional cap — `notionalCapGuard`

Caps cumulative real notional opened in an epoch at
`treasury × epochNotionalCapPct`. Protects against a Mode-B aggregate hedge (or
a burst of Mode-C positions) putting an outsized slice of treasury on-venue in
one epoch — the correlated-loss event ADR-003 §"Risks" and RFC §3.2 name as the
reason Mode B exists. **Trips** when `used + requested > cap` →
`degrade-to-synthetic`.

### 4.2 Max leverage cap — `leverageCapGuard`

The synthetic book quotes fantasy leverage (2,500× / 750× / 250×, ADR-003 §2);
the *real* leg is sized to **net delta notional, not the fantasy number**
(RFC OQ-H4) and capped here: **Mode C ≤ 5×**, **Mode B ≤ 10×** (configurable),
both clamped to the **50× venue hard cap**. Mode A has no real leverage to
bound. **Trips** on `leverage > leverageCapFor(mode)` or invalid leverage →
`degrade-to-synthetic`.

### 4.3 Daily loss → circuit breaker — `stepCircuitBreaker` / `circuitBreakerGuard`

A two-state breaker (`closed` ↔ `open`) directly modeled on Star Arena's
`RUNNING ↔ PAUSED` transition. A pure reducer advances it on `loss` and `tick`
events:

- A `loss` whose **cumulative daily total** reaches `dailyLossLimitMon` opens
  the breaker → `halt-real`. **The synthetic tier (Mode A) is unaffected** —
  this is the whole point: the protocol stops putting capital on-venue while
  voyages keep settling synthetically.
- A `tick` after `breakerCooldownMs` has elapsed re-arms (closes) the breaker,
  exactly as `SafetyManager.is_trading_allowed()` auto-resumes from `PAUSED`
  after `cooldown_seconds`.
- The cumulative loss tally is **UTC-day-scoped** and resets on day rollover.
- `resetCircuitBreaker` is the manual operator override (mirrors
  `resume_trading(force=True)`).

This is the single guard that is system-wide rather than per-voyage, and the
only one whose action is `halt-real`.

### 4.4 Oracle ↔ Perpl divergence — `oracleDivergenceGuard`

Mode C reconciles the venue fill against the synthetic oracle guard rail
(RFC §4, OQ-H8). When the venue mark and the oracle diverge beyond
`oracleDivergenceToleranceBps`, the fill is untrustworthy — a thin-book fill on
a 6-block TTL, a stale oracle, or manipulation — so the stake is refunded and
the voyage settles synthetically rather than minting DUST on a bad mark.
**Trips** on `|oracle − venueMark| / oracle > tolerance`, or a non-positive
price, → `refund-and-degrade`.

### 4.5 Failed-open handling — `failedOpenGuard`

Handles every way opening the real leg can fail without binding the user to a
position they didn't get: an **IOC order that does not fill** (the connector
sends market orders as IMMEDIATE_OR_CANCEL — PERPL_INTEGRATION_REFERENCE §6), a
**6-block TTL expiry**, an **RPC timeout**, a **rejection**, or a **partial fill
below `minFillFraction`**. Every such case → **refund stake + degrade to
synthetic**. A clean fill (or a partial at/above the min fraction) → `allow`.

### 4.6 Per-epoch real-position budget — `budgetExhaustionGuard`

A hard ceiling on how many real positions the protocol opens per epoch,
independent of notional. Once `epochRealPositionsUsed >=
maxRealPositionsPerEpoch`, further voyages run synthetically for the rest of the
epoch → `degrade-to-synthetic`. Resets implicitly at the epoch boundary (the
caller passes `used = 0` for a new epoch).

### 4.7 Composition — `assessRealLeg`

Pre-trade, the stateless guards run in precedence order and the first trip wins:

```
circuit breaker (halt-real)  →  budget  →  notional  →  leverage
```

Breaker first because it is the system-wide kill; Mode A short-circuits to
`allow` (no real leg to guard). The two **post-fill** guards — oracle divergence
and failed-open — are evaluated at settlement, not in `assessRealLeg`, because
they need the venue's response.

---

## 5. Failure modes

The real tier must degrade gracefully under each of the following. In every
case the user's voyage still settles (synthetically), because the pure engine
owns the result (RFC §4). The ≥6 modes below are the concrete events the guards
above are designed against:

1. **Partial fill** — the venue fills less than `minFillFraction` of requested
   size (thin book on a 6-block TTL). → `failedOpenGuard` → `refund-and-degrade`.
2. **IOC no-fill** — the IMMEDIATE_OR_CANCEL market order finds no liquidity at
   the slippage-bounded limit price and cancels unfilled
   (PERPL_INTEGRATION_REFERENCE §6). → `failedOpenGuard` → `refund-and-degrade`.
3. **RPC timeout** — the order/settle RPC to Monad times out; the connector
   cannot confirm state. → `failedOpenGuard` (`timeout`) → `refund-and-degrade`;
   the connector's idempotent `request_id` (`rq`) keying prevents double-open
   (PERPL_INTEGRATION_REFERENCE §9).
4. **WS drop mid-voyage** — the trading WebSocket disconnects while a position
   is live. The connector re-auths with the cached nonce and re-subscribes
   (PERPL_INTEGRATION_REFERENCE §11); cancel-on-disconnect orders are cancelled.
   If reconciliation on reconnect shows the oracle and venue have drifted →
   `oracleDivergenceGuard` → `refund-and-degrade`.
5. **Liquidation** — the venue liquidates the real position before voyage end
   (the move exceeded the venue's own maintenance margin). The realized loss
   flows into the daily tally; if it pushes cumulative daily loss past
   `dailyLossLimitMon`, `stepCircuitBreaker` opens → `halt-real` for the rest of
   the cooldown. Synthetic voyages continue throughout.
6. **Budget exhaustion** — the per-epoch real-position budget is spent;
   `budgetExhaustionGuard` trips and all further voyages run Mode A until the
   epoch rolls over.
7. **Oracle/venue divergence at settlement** — venue mark and oracle path
   disagree beyond tolerance (stale feed or manipulated fill); the oracle is the
   guard rail (RFC OQ-H8) → `refund-and-degrade`.
8. **Premature Perpl routing on mainnet** — Perpl's mainnet exchange is the
   **zero address** (PERPL_INTEGRATION_REFERENCE §1; RFC §1.2). Any code that
   would route there must hard-revert, not silently no-op. This is a connector
   assertion (`venue != address(0)`), upstream of these guards, noted here for
   completeness.

---

## 6. Why this is the right call

- **Synthetic is the floor, not a fallback hack.** Every guard's default action
  is to settle the voyage synthetically. Because Mode A is the full launch
  product (RFC §6.1), a guard trip is never a user-visible failure — it is the
  protocol declining a hedge. This is what makes "additive, never load-bearing"
  (RFC §7) concrete.
- **Ported, not invented.** The circuit-breaker shape (daily-loss trigger,
  cooldown re-arm, halt-without-break) is Star Arena `safety.py` adapted to
  DUST economics, and the connector failure modes (§5) are the documented
  behaviors in PERPL_INTEGRATION_REFERENCE, not speculation.
- **Pure and testable before mainnet.** No clock, no network, no venue — the
  whole risk envelope is exercised by 25 vitest cases (trip + reset for each
  guard) with zero infrastructure, satisfying ADR-003 §"Constrains."

---

## 7. Open questions

These align with the RFC's Memo 2 §8 open questions and bound the constants
above.

| # | Question | Relates to |
|---|---|---|
| **OQ-R1** | Final `dailyLossLimitMon` — absolute MON, or a % of treasury recomputed each cycle? | RFC OQ-H3 (net-OI cap), §4.3 |
| **OQ-R2** | Should the breaker also carry a **drawdown** trigger (Star Arena's 15%) in addition to daily loss? | safety.py `max_drawdown_trigger` |
| **OQ-R3** | `oracleDivergenceToleranceBps` = 50 — confirm against realized Pyth↔venue spread on testnet (RFC §6.2). | RFC OQ-H8, OQ-H5 |
| **OQ-R4** | On `refund-and-degrade`, does the user keep the synthetic *outcome* (could be a win) or just the refunded stake? | Settlement reducer |
| **OQ-R5** | Per-epoch budget = 50 positions — tune against Mode-B rehedge frequency once OQ-H3 hysteresis is set. | RFC OQ-H3 |

---

## 8. References

- [Hybrid Execution Model RFC](./SANCTUARY_OUTER_RIM_HYBRID_RFC.md) — §2–§4, OQ-H2/H3/H4/H5/H6/H8.
- [ADR-003 Outer Rim](./SANCTUARY_ADR_003_OUTER_RIM.md) — §2 Voyages, §"Constrains", §"Risks".
- [Perpl Integration Reference](./PERPL_INTEGRATION_REFERENCE.md) — §1 (mainnet zero-address), §4–5 (50× cap, taker fee), §6 (IOC/TTL), §7 (2 bps slippage floor), §9 (fill tracking), §11 (WS reconnect).
- Star Arena circuit breaker: `src/core/safety.py` (`SafetyManager`, `CircuitBreakerConfig`, `SystemState`); validation gates: `src/core/validation_gates.py`.
- Module: `lib/outer-rim/riskGuards.ts` + `riskGuards.test.ts`.
- Source memo: `memory/evolution/swo_offshore_protocol_analysis_2026-05-23.md` Memo 2 §3.
