/**
 * Outer Rim — pure voyage state-machine (synthetic / Mode A core).
 *
 * A "voyage" is a leverage-on-price operation: the player stakes Influence and
 * the Skrumpey takes a leveraged long on the MON/USD price feed for a fixed
 * duration. The voyage *succeeds* if the feed never breaches the leverage-derived
 * liquidation threshold over its run, and *fails* (loses the stake) if it does.
 *
 * Three tiers, lifted verbatim from the Offshore Protocol overview (source memo
 * §1.1, cached) and ratified in `docs/SANCTUARY_ADR_003_OUTER_RIM.md` §2:
 *
 *   | Voyage     | Duration | Leverage | Reward shape | Lore name            |
 *   |------------|----------|----------|--------------|----------------------|
 *   | Sprint     | 5 min    | 2,500×   | binary       | Quick contraband run |
 *   | Run        | 30 min   | 750×     | progressive  | Cargo haul           |
 *   | Expedition | 90 min   | 250×     | progressive  | Long Haul            |
 *
 * Reward math (memo §4.1, ADR-003 §2):
 *   - progressive: `dust = dust_per_success × completion^1.2` — the `^1.2`
 *     curve is verbatim from Offshore; it gives early-failure proportionally
 *     larger haircuts (50% completion → 0.5^1.2 ≈ 44% payout).
 *   - binary: a flat 50–100 DUST payout that scales with Voyage Level; no
 *     completion curve (you either clear the run or you don't).
 *   On a clean success the 5-Influence stake is refunded; on failure it is lost
 *   (routed to the Star Vault per ADR-003 §4.3 item 1).
 *
 * Design discipline (ADR-003 §"Constrains"): like `lib/outer-rim/riskGuards.ts`,
 * `lib/outer-rim/rewardMapping.ts`, and `lib/sanctuary/expeditions.ts`, this is a
 * pure function — no clock reads, no network, no oracle, and no unseeded RNG.
 * The only stochastic element (per-trade liquidation jitter) is derived
 * deterministically from `leverageJitterSeed`, so the engine is fully
 * unit-testable before any oracle or contract goes near Monad. The caller owns
 * time (passes `completionPct`) and price (passes `startPrice` / `currentPrice`).
 *
 * Scope: engine only. No DB, no API, no oracle wiring — those land in later PRs
 * (`app/api/sanctuary/voyages/`, the DUST contract, the price-oracle research
 * item OQ2). This file is the deterministic core they all build on.
 */

/** The three voyage tiers (ADR-003 §2). */
export type VoyageType = 'sprint' | 'run' | 'expedition';

export const VOYAGE_TYPES: readonly VoyageType[] = ['sprint', 'run', 'expedition'];

/** Reward shape: `binary` = flat level-scaled payout; `progressive` = completion^1.2 curve. */
export type PayoutShape = 'binary' | 'progressive';

/** Live state of a voyage at the evaluated snapshot. */
export type VoyageStatus = 'live' | 'success' | 'failed';

/** Per-tier static parameters. */
export interface VoyageParams {
  type: VoyageType;
  /** Voyage duration in minutes (ADR-003 §2). */
  durationMinutes: number;
  /** Synthetic leverage multiplier (ADR-003 §2). */
  leverage: number;
  /** Reward shape. */
  payout: PayoutShape;
  /** In-fiction name (ADR-003 §2). */
  loreName: string;
  /**
   * DUST paid for a fully-completed progressive voyage (the `dust_per_success`
   * coefficient in `dust = dust_per_success × completion^1.2`). Ignored for
   * binary tiers, whose payout is level-scaled instead.
   */
  dustPerSuccess: number;
}

/**
 * The canonical voyage catalog. Durations, leverages, and payout shapes are
 * verbatim from ADR-003 §2 (memo §1.1). `dustPerSuccess` coefficients sit inside
 * the ADR-002/§1 "50–100/op" DUST band for a full run and are operator-tunable.
 */
export const VOYAGE_CATALOG: Readonly<Record<VoyageType, VoyageParams>> = {
  sprint: {
    type: 'sprint',
    durationMinutes: 5,
    leverage: 2_500,
    payout: 'binary',
    loreName: 'Quick contraband run',
    dustPerSuccess: 0, // binary tier: payout is level-scaled, see binaryDust().
  },
  run: {
    type: 'run',
    durationMinutes: 30,
    leverage: 750,
    payout: 'progressive',
    loreName: 'Cargo haul',
    dustPerSuccess: 75,
  },
  expedition: {
    type: 'expedition',
    durationMinutes: 90,
    leverage: 250,
    payout: 'progressive',
    loreName: 'Long Haul',
    dustPerSuccess: 120,
  },
};

/** Tunable engine constants. Conservative launch values; operator-tunable. */
export interface VoyageConfig {
  /** Influence staked per voyage and refunded on success (ADR-003 §2). */
  influenceCost: number;
  /** Lowest binary payout (Voyage Level 1), in DUST (ADR-003 §2 "50–100"). */
  binaryDustMin: number;
  /** Highest binary payout (Voyage Level `maxVoyageLevel`), in DUST. */
  binaryDustMax: number;
  /** Voyage Level range; binary payout interpolates across [1, maxVoyageLevel]. */
  maxVoyageLevel: number;
  /**
   * Progressive payout exponent. `1.2` verbatim from Offshore (memo §4.1):
   * early-failure haircuts (0.5^1.2 ≈ 0.44).
   */
  progressiveExponent: number;
  /**
   * Maximum fraction by which per-trade jitter widens or tightens the base
   * (1/leverage) liquidation sensitivity. `0.2` ⇒ effective sensitivity lands in
   * `base × [0.8, 1.2]`. Keeps per-trade outcomes unpredictable while bounded.
   */
  maxJitterFraction: number;
}

/** Conservative launch defaults (ADR-003 §2). */
export const DEFAULT_VOYAGE_CONFIG: VoyageConfig = {
  influenceCost: 5,
  binaryDustMin: 50,
  binaryDustMax: 100,
  maxVoyageLevel: 5,
  progressiveExponent: 1.2,
  maxJitterFraction: 0.2,
};

/** Inputs for a single voyage evaluation. All time/price is caller-supplied. */
export interface VoyageInput {
  voyageType: VoyageType;
  /** Entry price (oracle mark at voyage open). Must be finite and > 0. */
  startPrice: number;
  /** Current oracle mark at the evaluated snapshot. Must be finite and > 0. */
  currentPrice: number;
  /** Fraction of the duration elapsed, in [0, 1]. 1 ⇒ the voyage has run its full term. */
  completionPct: number;
  /** Integer seed for the deterministic per-trade liquidation jitter. */
  leverageJitterSeed: number;
  /** Voyage Level in [1, maxVoyageLevel]; scales the binary payout. */
  voyageLevel: number;
}

/** Result of evaluating a voyage at a snapshot. */
export interface VoyageResult {
  status: VoyageStatus;
  /**
   * DUST earned at this snapshot.
   *   - progressive: `dust_per_success × completion^1.2` (accrued payout — the
   *     amount banked if settled now; full coefficient at completion = 1).
   *   - binary: 0 while live/failed, the level-scaled flat payout on success.
   *   - failed: always 0 (liquidated — the stake and accrued cargo are lost).
   */
  dustEarned: number;
  /** Influence refunded: `influenceCost` on a clean success, otherwise 0. */
  influenceRefund: number;
  /** Completion fraction at which the voyage was liquidated; null unless `failed`. */
  completionAtFailure: number | null;
  /**
   * The leverage-derived liquidation threshold actually used (entry ×
   * (1 − effective sensitivity)). Surfaced for HUD display / settlement audit.
   */
  liquidationThreshold: number;
  /** Effective liquidation sensitivity after jitter (base/leverage × jitter). */
  effectiveSensitivity: number;
}

function requireFinite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number, got ${value}`);
  }
  return value;
}

function requirePositive(value: number, name: string): number {
  requireFinite(value, name);
  if (value <= 0) {
    throw new RangeError(`${name} must be > 0, got ${value}`);
  }
  return value;
}

/** Params for a voyage type. Throws on an unknown type. */
export function paramsFor(type: VoyageType): VoyageParams {
  const params = VOYAGE_CATALOG[type];
  if (!params) {
    throw new RangeError(`unknown voyage type: ${String(type)}`);
  }
  return params;
}

/**
 * Deterministic per-trade jitter in `[-1, 1)` from an integer seed, via a
 * mulberry32 step. Pure: identical seeds always yield identical jitter, so the
 * whole engine is reproducible for `(seed, inputs)`. Non-integer / non-finite
 * seeds are coerced to a stable integer first.
 */
export function seededJitter(seed: number): number {
  // Coerce to a uint32 so the bit math below is well-defined for any input.
  let t = (Math.trunc(requireFinite(seed, 'leverageJitterSeed')) >>> 0) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296; // [0, 1)
  return unit * 2 - 1; // [-1, 1)
}

/**
 * Effective liquidation sensitivity for a voyage: the base move (1/leverage)
 * that liquidates the position, widened/tightened by bounded seeded jitter.
 *
 * `sensitivity = (1 / leverage) × (1 + jitterFraction)`, where
 * `jitterFraction ∈ [-maxJitterFraction, +maxJitterFraction)`.
 */
export function effectiveSensitivity(
  type: VoyageType,
  leverageJitterSeed: number,
  config: VoyageConfig = DEFAULT_VOYAGE_CONFIG,
): number {
  const { leverage } = paramsFor(type);
  const base = 1 / leverage;
  const jitterFraction = seededJitter(leverageJitterSeed) * config.maxJitterFraction;
  return base * (1 + jitterFraction);
}

/** Flat binary payout for a Voyage Level, interpolated across [1, maxVoyageLevel]. */
export function binaryDust(voyageLevel: number, config: VoyageConfig = DEFAULT_VOYAGE_CONFIG): number {
  const { binaryDustMin, binaryDustMax, maxVoyageLevel } = config;
  if (maxVoyageLevel <= 1) return binaryDustMax;
  const clamped = Math.min(Math.max(voyageLevel, 1), maxVoyageLevel);
  const frac = (clamped - 1) / (maxVoyageLevel - 1);
  return binaryDustMin + frac * (binaryDustMax - binaryDustMin);
}

/** Progressive accrued payout at a completion fraction: `dust_per_success × completion^1.2`. */
export function progressiveDust(
  type: VoyageType,
  completionPct: number,
  config: VoyageConfig = DEFAULT_VOYAGE_CONFIG,
): number {
  const { dustPerSuccess } = paramsFor(type);
  const completion = Math.min(Math.max(completionPct, 0), 1);
  return dustPerSuccess * Math.pow(completion, config.progressiveExponent);
}

/**
 * Evaluate a voyage at a single price/time snapshot. Pure and deterministic in
 * `(input, config)`.
 *
 * Status resolution (ADR-003 §2):
 *   1. Compute the leverage-derived liquidation threshold (with seeded jitter).
 *   2. If `currentPrice <= threshold` → `failed` (long liquidated on the
 *      downside). The Influence stake is lost; `completionAtFailure` records
 *      where the breach was observed.
 *   3. Else if `completionPct >= 1` → `success` (ran the full term unliquidated).
 *   4. Else → `live` (still running).
 *
 * Payout:
 *   - failed:      dust 0, no refund.
 *   - progressive: dust = `dust_per_success × completion^1.2` (accrued; full
 *                  coefficient at completion = 1). Refund only on `success`.
 *   - binary:      dust 0 while `live`; level-scaled flat payout on `success`.
 */
export function evaluateVoyage(
  input: VoyageInput,
  config: VoyageConfig = DEFAULT_VOYAGE_CONFIG,
): VoyageResult {
  const params = paramsFor(input.voyageType);
  const startPrice = requirePositive(input.startPrice, 'startPrice');
  const currentPrice = requirePositive(input.currentPrice, 'currentPrice');
  requireFinite(input.completionPct, 'completionPct');
  if (input.completionPct < 0 || input.completionPct > 1) {
    throw new RangeError(`completionPct must be in [0, 1], got ${input.completionPct}`);
  }
  requireFinite(input.voyageLevel, 'voyageLevel');

  const sensitivity = effectiveSensitivity(input.voyageType, input.leverageJitterSeed, config);
  const liquidationThreshold = startPrice * (1 - sensitivity);

  // Long position: liquidated when the mark touches or breaches the threshold.
  const breached = currentPrice <= liquidationThreshold;

  let status: VoyageStatus;
  if (breached) {
    status = 'failed';
  } else if (input.completionPct >= 1) {
    status = 'success';
  } else {
    status = 'live';
  }

  let dustEarned = 0;
  let influenceRefund = 0;
  let completionAtFailure: number | null = null;

  if (status === 'failed') {
    completionAtFailure = input.completionPct;
  } else if (params.payout === 'progressive') {
    // Accrued cargo value; equals dust_per_success when completion = 1.
    dustEarned = progressiveDust(input.voyageType, input.completionPct, config);
    if (status === 'success') {
      influenceRefund = config.influenceCost;
    }
  } else {
    // binary: nothing until the run clears, then a flat level-scaled payout.
    if (status === 'success') {
      dustEarned = binaryDust(input.voyageLevel, config);
      influenceRefund = config.influenceCost;
    }
  }

  return {
    status,
    dustEarned,
    influenceRefund,
    completionAtFailure,
    liquidationThreshold,
    effectiveSensitivity: sensitivity,
  };
}
