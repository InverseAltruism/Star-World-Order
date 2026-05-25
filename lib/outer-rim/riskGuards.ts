/**
 * Outer Rim — real-execution risk guards (Mode B / Mode C).
 *
 * Pure, deterministic guard functions for the real-Perpl execution tier of the
 * Outer Rim hybrid voyage model. Mode A (synthetic) carries no venue exposure
 * and needs none of these; these guards bound the *real* leg (Star Arena perp
 * order behind a voyage) and define how it degrades back to synthetic when a
 * limit trips.
 *
 * Design discipline (ADR-003 §"Constrains"): like `lib/outer-rim/voyage.ts` and
 * `lib/sanctuary/expeditions.ts`, every guard here is a pure function — no clock
 * reads (callers pass `nowMs`), no network, no venue. This keeps the real-tier
 * risk math unit-testable before any connector goes near Monad.
 *
 * Knowledge ported from the Star Arena trading agent's circuit-breaker
 * (`src/core/safety.py` `SafetyManager` / `CircuitBreakerConfig`: drawdown +
 * hourly-loss + cooldown triggers, RUNNING/PAUSED/EMERGENCY states) and
 * profitability gates (`src/core/validation_gates.py`). Connector facts
 * (taker fee, 50× venue cap, 6-block TTL, IOC semantics, 2 bps slippage floor,
 * Perpl mainnet zero-address) come from `docs/PERPL_INTEGRATION_REFERENCE.md`.
 * Execution-model context (synthetic-vs-real, the three modes, fee-breakeven)
 * is `docs/SANCTUARY_OUTER_RIM_HYBRID_RFC.md` §2–§4 (memo 2 §3).
 *
 * See `docs/SANCTUARY_OUTER_RIM_RISK.md` for the full design and rationale.
 */

/** Execution mode for a voyage. A = synthetic, B = treasury hedge, C = per-user real. */
export type VoyageMode = 'A' | 'B' | 'C';

/**
 * What a tripped guard tells the settlement path to do.
 * - `allow`               — real execution may proceed.
 * - `degrade-to-synthetic`— skip the real leg; settle the voyage synthetically (Mode A).
 * - `refund-and-degrade`  — refund the staked Influence AND fall back to synthetic
 *                            (the real leg could not be opened/closed cleanly — "failed open").
 * - `halt-real`           — circuit breaker open: stop ALL real backing; synthetic continues.
 */
export type GuardAction =
  | 'allow'
  | 'degrade-to-synthetic'
  | 'refund-and-degrade'
  | 'halt-real';

/** Verdict returned by every stateless guard. */
export interface GuardVerdict {
  /** True iff the real leg may proceed unchanged. */
  ok: boolean;
  /** True iff a guard threshold was breached. */
  tripped: boolean;
  /** What the caller should do. */
  action: GuardAction;
  /** Human-readable explanation (mirrors `SafetyState.reason`). */
  reason: string;
}

/** Explicit, tunable thresholds. Defaults are conservative launch values. */
export interface RiskConfig {
  /** Per-epoch real notional cap as a fraction of treasury (e.g. 0.10 = 10%). */
  epochNotionalCapPct: number;
  /** Mode C hard leverage cap. Task floor: ≤ 5× (well under the 50× venue cap). */
  maxLeverageModeC: number;
  /** Mode B hedge leverage cap (configurable; still ≤ venue cap). */
  maxLeverageModeB: number;
  /** Venue hard cap — Star Arena / Perpl `max_leverage = 50` (PERPL_INTEGRATION_REFERENCE §4–5). */
  venueMaxLeverage: number;
  /** Daily realized-loss limit (MON) that opens the circuit breaker. */
  dailyLossLimitMon: number;
  /** Cooldown before an open breaker re-arms (ms). Star Arena `cooldown_seconds = 300`. */
  breakerCooldownMs: number;
  /** Max oracle↔venue-mark divergence tolerated before Mode C reconciliation fails (bps). */
  oracleDivergenceToleranceBps: number;
  /** Per-epoch budget of real positions; beyond it, voyages fall back to synthetic. */
  maxRealPositionsPerEpoch: number;
  /** Minimum acceptable fill fraction; a partial below this is treated as a failed open. */
  minFillFraction: number;
}

/**
 * Conservative launch defaults. The cooldown (300s) and the
 * loss-trigger shape are lifted from Star Arena `CircuitBreakerConfig`;
 * `venueMaxLeverage` (50×) is the Perpl/Star Arena market cap.
 */
export const DEFAULT_RISK_CONFIG: RiskConfig = {
  epochNotionalCapPct: 0.1,
  maxLeverageModeC: 5,
  maxLeverageModeB: 10,
  venueMaxLeverage: 50,
  dailyLossLimitMon: 250,
  breakerCooldownMs: 300_000,
  oracleDivergenceToleranceBps: 50,
  maxRealPositionsPerEpoch: 50,
  minFillFraction: 0.95,
};

const ALLOW: GuardVerdict = { ok: true, tripped: false, action: 'allow', reason: '' };

function bps(part: number, whole: number): number {
  if (whole === 0) return Infinity;
  return (Math.abs(part) / Math.abs(whole)) * 10_000;
}

// ---------------------------------------------------------------------------
// Guard 1 — per-epoch notional cap (% of treasury)
// ---------------------------------------------------------------------------

/**
 * Caps the cumulative real notional opened in an epoch at a fraction of
 * treasury. Protects against the Mode-B aggregate hedge (or a burst of Mode-C
 * positions) putting an outsized slice of treasury on-venue in one epoch.
 *
 * Trips when `used + requested > treasury × epochNotionalCapPct`.
 */
export function notionalCapGuard(
  epochNotionalUsedMon: number,
  requestedNotionalMon: number,
  treasuryMon: number,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
): GuardVerdict {
  const cap = Math.max(0, treasuryMon) * config.epochNotionalCapPct;
  const projected = Math.max(0, epochNotionalUsedMon) + Math.max(0, requestedNotionalMon);
  if (projected > cap) {
    return {
      ok: false,
      tripped: true,
      action: 'degrade-to-synthetic',
      reason: `epoch notional ${projected.toFixed(2)} MON exceeds cap ${cap.toFixed(2)} MON (${(
        config.epochNotionalCapPct * 100
      ).toFixed(0)}% of treasury)`,
    };
  }
  return ALLOW;
}

// ---------------------------------------------------------------------------
// Guard 2 — max leverage cap (Mode C ≤ 5×, Mode B configurable, venue ≤ 50×)
// ---------------------------------------------------------------------------

/** Effective leverage cap for a mode, never above the venue hard cap. */
export function leverageCapFor(mode: VoyageMode, config: RiskConfig = DEFAULT_RISK_CONFIG): number {
  switch (mode) {
    case 'C':
      return Math.min(config.maxLeverageModeC, config.venueMaxLeverage);
    case 'B':
      return Math.min(config.maxLeverageModeB, config.venueMaxLeverage);
    case 'A':
    default:
      return 0; // Mode A has no real position → no real leverage.
  }
}

/**
 * Bounds the real position's leverage. The synthetic book may quote fantasy
 * leverage (2,500×/750×/250×, ADR-003 §2); the *real* leg is sized to net
 * delta notional, not to that fantasy number (RFC OQ-H4), and capped here.
 *
 * Trips when `leverage > leverageCapFor(mode)`.
 */
export function leverageCapGuard(
  leverage: number,
  mode: VoyageMode,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
): GuardVerdict {
  if (mode === 'A') {
    // No real leverage to bound; nothing to do.
    return ALLOW;
  }
  const cap = leverageCapFor(mode, config);
  if (!Number.isFinite(leverage) || leverage <= 0) {
    return {
      ok: false,
      tripped: true,
      action: 'degrade-to-synthetic',
      reason: `invalid leverage ${leverage} for Mode ${mode}`,
    };
  }
  if (leverage > cap) {
    return {
      ok: false,
      tripped: true,
      action: 'degrade-to-synthetic',
      reason: `leverage ${leverage}× exceeds Mode ${mode} cap ${cap}×`,
    };
  }
  return ALLOW;
}

// ---------------------------------------------------------------------------
// Guard 3 — daily loss limit → circuit breaker (halts real, synthetic continues)
// ---------------------------------------------------------------------------

/** Two-state breaker (mirrors Star Arena RUNNING ↔ PAUSED; emergency-stop is a separate manual path). */
export type BreakerStatus = 'closed' | 'open';

/** Pure, serializable circuit-breaker state. */
export interface CircuitBreakerState {
  status: BreakerStatus;
  /** When the breaker opened (ms), or null while closed. */
  openedAtMs: number | null;
  /** Why it opened. */
  reason: string;
  /** UTC day the cumulative loss is scoped to (`floor(nowMs / 86_400_000)`). */
  dayIndex: number;
  /** Cumulative realized loss (MON, positive number) within `dayIndex`. */
  cumulativeLossMon: number;
}

const MS_PER_DAY = 86_400_000;
const utcDayIndex = (nowMs: number): number => Math.floor(nowMs / MS_PER_DAY);

/** Fresh, closed breaker for the day containing `nowMs`. */
export function initCircuitBreaker(nowMs: number): CircuitBreakerState {
  return {
    status: 'closed',
    openedAtMs: null,
    reason: '',
    dayIndex: utcDayIndex(nowMs),
    cumulativeLossMon: 0,
  };
}

/** Event fed to the breaker reducer. */
export type BreakerEvent =
  | { type: 'loss'; amountMon: number; nowMs: number }
  | { type: 'tick'; nowMs: number };

/**
 * Pure reducer: advance the breaker by one event.
 *
 * - On a UTC day rollover, the daily cumulative loss resets to 0.
 * - A `loss` whose cumulative total reaches `dailyLossLimitMon` opens the breaker
 *   → real backing halts; synthetic voyages (Mode A) are unaffected.
 * - A `tick` after `breakerCooldownMs` has elapsed re-arms (closes) the breaker,
 *   exactly as Star Arena auto-resumes from PAUSED after `cooldown_seconds`.
 */
export function stepCircuitBreaker(
  prev: CircuitBreakerState,
  event: BreakerEvent,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
): CircuitBreakerState {
  const s: CircuitBreakerState = { ...prev };

  // UTC day rollover resets the daily loss tally.
  const today = utcDayIndex(event.nowMs);
  if (today !== s.dayIndex) {
    s.dayIndex = today;
    s.cumulativeLossMon = 0;
  }

  if (event.type === 'loss') {
    s.cumulativeLossMon += Math.max(0, event.amountMon);
    if (s.status === 'closed' && s.cumulativeLossMon >= config.dailyLossLimitMon) {
      s.status = 'open';
      s.openedAtMs = event.nowMs;
      s.reason = `daily loss ${s.cumulativeLossMon.toFixed(2)} MON ≥ limit ${config.dailyLossLimitMon.toFixed(
        2,
      )} MON`;
    }
  } else {
    // tick — re-arm once the cooldown has elapsed.
    if (
      s.status === 'open' &&
      s.openedAtMs !== null &&
      event.nowMs - s.openedAtMs >= config.breakerCooldownMs
    ) {
      s.status = 'closed';
      s.openedAtMs = null;
      s.reason = '';
    }
  }

  return s;
}

/** Manual re-arm (operator override; mirrors `resume_trading(force=True)`). */
export function resetCircuitBreaker(state: CircuitBreakerState, nowMs: number): CircuitBreakerState {
  return {
    status: 'closed',
    openedAtMs: null,
    reason: '',
    dayIndex: utcDayIndex(nowMs),
    cumulativeLossMon: 0,
  };
}

/** Gate read at settlement time: may the real leg run given the breaker state? */
export function circuitBreakerGuard(state: CircuitBreakerState): GuardVerdict {
  if (state.status === 'open') {
    return {
      ok: false,
      tripped: true,
      action: 'halt-real',
      reason: state.reason || 'circuit breaker open',
    };
  }
  return ALLOW;
}

// ---------------------------------------------------------------------------
// Guard 4 — oracle ↔ Perpl mark divergence
// ---------------------------------------------------------------------------

/**
 * Mode C reconciles the venue fill against the synthetic oracle guard rail
 * (RFC OQ-H8). When the venue mark and the oracle diverge beyond tolerance,
 * the fill is untrustworthy (thin book, stale oracle, manipulation) — refund
 * the stake and degrade to synthetic rather than settle DUST on a bad mark.
 *
 * Trips when `|oraclePrice − venueMarkPrice| / oraclePrice > toleranceBps`.
 */
export function oracleDivergenceGuard(
  oraclePrice: number,
  venueMarkPrice: number,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
): GuardVerdict {
  if (!Number.isFinite(oraclePrice) || oraclePrice <= 0 || !Number.isFinite(venueMarkPrice) || venueMarkPrice <= 0) {
    return {
      ok: false,
      tripped: true,
      action: 'refund-and-degrade',
      reason: `non-positive price (oracle=${oraclePrice}, venue=${venueMarkPrice})`,
    };
  }
  const divergence = bps(oraclePrice - venueMarkPrice, oraclePrice);
  if (divergence > config.oracleDivergenceToleranceBps) {
    return {
      ok: false,
      tripped: true,
      action: 'refund-and-degrade',
      reason: `oracle↔venue divergence ${divergence.toFixed(1)} bps exceeds tolerance ${config.oracleDivergenceToleranceBps} bps`,
    };
  }
  return ALLOW;
}

// ---------------------------------------------------------------------------
// Guard 5 — failed-open handling (refund stake + degrade-to-synthetic)
// ---------------------------------------------------------------------------

/** Outcome of attempting to open the real leg on the venue. */
export type FillStatus = 'filled' | 'partial' | 'no-fill' | 'timeout' | 'rejected';

/** Result of a fill attempt. `filledFraction` is the share of requested size that filled. */
export interface FillOutcome {
  status: FillStatus;
  /** 0..1; only meaningful for `filled` / `partial`. */
  filledFraction: number;
}

/**
 * Handles the "failed open" cases from RFC §1.1 / memo 2 §3: an IOC order that
 * does not fill, a 6-block TTL expiry, an RPC timeout, or a partial fill below
 * the minimum acceptable fraction. In every such case the user's stake is
 * refunded and the voyage settles synthetically — the real leg never partially
 * binds the user to a venue position they didn't get.
 *
 * Trips on anything that is not a clean fill at/above `minFillFraction`.
 */
export function failedOpenGuard(
  fill: FillOutcome,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
): GuardVerdict {
  if (fill.status === 'filled' && fill.filledFraction >= config.minFillFraction) {
    return ALLOW;
  }
  if (fill.status === 'partial' && fill.filledFraction >= config.minFillFraction) {
    // Effectively complete — treat as filled.
    return ALLOW;
  }
  const detail =
    fill.status === 'partial'
      ? `partial fill ${(fill.filledFraction * 100).toFixed(1)}% < min ${(config.minFillFraction * 100).toFixed(0)}%`
      : `order ${fill.status}`;
  return {
    ok: false,
    tripped: true,
    action: 'refund-and-degrade',
    reason: `failed open: ${detail}`,
  };
}

// ---------------------------------------------------------------------------
// Guard 6 — per-epoch real-position budget exhaustion → synthetic fallback
// ---------------------------------------------------------------------------

/**
 * Bounds how many real positions the protocol opens per epoch. Once the budget
 * is exhausted, further voyages run synthetically (Mode A) for the rest of the
 * epoch — a hard ceiling on venue surface area independent of notional.
 *
 * Trips when `epochRealPositionsUsed >= maxRealPositionsPerEpoch`.
 * Resets implicitly at epoch boundary (caller passes `used = 0` for a new epoch).
 */
export function budgetExhaustionGuard(
  epochRealPositionsUsed: number,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
): GuardVerdict {
  if (epochRealPositionsUsed >= config.maxRealPositionsPerEpoch) {
    return {
      ok: false,
      tripped: true,
      action: 'degrade-to-synthetic',
      reason: `real-position budget exhausted (${epochRealPositionsUsed}/${config.maxRealPositionsPerEpoch} this epoch)`,
    };
  }
  return ALLOW;
}

// ---------------------------------------------------------------------------
// Composition — assess a real-leg request against all stateless guards
// ---------------------------------------------------------------------------

/** Inputs for a pre-trade assessment of a Mode B/C real leg. */
export interface RealLegRequest {
  mode: VoyageMode;
  leverage: number;
  requestedNotionalMon: number;
  epochNotionalUsedMon: number;
  epochRealPositionsUsed: number;
  treasuryMon: number;
  breaker: CircuitBreakerState;
}

/**
 * Run the pre-trade guards in precedence order and return the first that trips
 * (or ALLOW). Order: breaker (system-wide halt) → budget → notional → leverage.
 * Oracle-divergence and failed-open are *post-fill* guards and are evaluated
 * separately at settlement, not here.
 */
export function assessRealLeg(
  req: RealLegRequest,
  config: RiskConfig = DEFAULT_RISK_CONFIG,
): GuardVerdict {
  if (req.mode === 'A') return ALLOW;

  const breaker = circuitBreakerGuard(req.breaker);
  if (breaker.tripped) return breaker;

  const budget = budgetExhaustionGuard(req.epochRealPositionsUsed, config);
  if (budget.tripped) return budget;

  const notional = notionalCapGuard(
    req.epochNotionalUsedMon,
    req.requestedNotionalMon,
    req.treasuryMon,
    config,
  );
  if (notional.tripped) return notional;

  const leverage = leverageCapGuard(req.leverage, req.mode, config);
  if (leverage.tripped) return leverage;

  return ALLOW;
}
