/**
 * Star Vault — pure 24-hour cycle-settlement reducer.
 *
 * Models the Outer Rim "Star Vault" yield pool: each cycle a slice of the
 * lost-Influence reserve (accumulated over the prior 3 cycles) plus the
 * Cosmic Casino house-edge inflow is released, the 2% protocol skim is removed,
 * and the remainder is distributed pro-rata across the DUST each Skrumpey
 * cleaned this cycle. The un-released remainder of the reserve rolls forward as
 * the next-cycle seed.
 *
 * Spec / sources:
 *   - `docs/SANCTUARY_ADR_003_OUTER_RIM.md` §4 — Star Vault settlement.
 *       §4.1 cycle (24h, engagement-gated), §4.2 reward formula
 *       (reward_i = cleaned_i / total_cleaned × cycle pool), §4.3 pool sources
 *       (1: lost Influence over prior 3 cycles, default split 40/30/30
 *        escalating to 70/15/15; 2: casino house-edge inflow; 3: 2% protocol
 *        skim), §4.4 this engine (`[SWO_OUTER_RIM_STAR_VAULT_ENGINE_PURE]`).
 *   - Upstream memo `swo_offshore_protocol_analysis_2026-05-23.md` §1.3
 *     (split escalation on >80% prior-pool depletion) and §4.1 (cycle
 *     settlement), ratified verbatim into ADR-003 §4.
 *   - Offshore Protocol swiss-vault doc:
 *     `https://www.offshoreprotocol.fun/docs/swiss-vault` — the parent
 *     mechanic this reducer ports (front-loading split + protocol skim).
 *
 * Conservation invariant (see `.test.ts`):
 *
 *   Σ rewards + protocolSkim + nextCycleSeed === totalInflows
 *
 * where `totalInflows = Σ prior-3-cycle lost Influence + casinoHouseEdge`.
 * Nothing is created or destroyed: the released-and-distributed value, the
 * skim, and the retained-plus-undistributed seed exactly re-sum to the inflows.
 *
 * Purity: no I/O, no clock, no randomness. Same inputs → same outputs, and
 * inputs are never mutated.
 */

/**
 * Lost Influence pooled in each of the prior 3 cycles, in DUST. Ordered by age:
 * `oldest` is the cycle that pays out the largest split weight (ADR-003 §4.3
 * item 1, "oldest cycle pays out 40%"). Each value must be ≥ 0.
 */
export interface PriorCycleInfluence {
  oldest: number;
  middle: number;
  newest: number;
}

/** A single Skrumpey's cleaned-DUST contribution for the cycle. */
export interface CleanedEntry {
  /** Stable Skrumpey identifier (token id, wallet, etc.). */
  id: string;
  /** DUST cleaned by this Skrumpey this cycle. Must be ≥ 0. */
  dust: number;
}

/** All inputs for one cycle settlement. */
export interface StarVaultCycleInput {
  /** Lost-Influence reserve for the prior 3 cycles (ADR-003 §4.3 item 1). */
  priorLostInfluence: PriorCycleInfluence;
  /** Casino house-edge inflow this cycle, in DUST (ADR-003 §4.3 item 2). Must be ≥ 0. */
  casinoHouseEdge: number;
  /** Per-Skrumpey DUST cleaned this cycle. */
  cleaned: CleanedEntry[];
  /**
   * Fraction of the prior cycle's distributable pool that was paid out
   * ("depleted"), ∈ [0, 1]. When this exceeds `depletionThreshold` the split
   * escalates to front-load reward (memo §1.3 / ADR-003 §4.3). Default 0.
   */
  priorPoolDepletion?: number;
}

/** Split weights applied per prior cycle, ordered `[oldest, middle, newest]`. */
export type SplitWeights = readonly [number, number, number];

/** Tunable reducer constants. All ratified in ADR-003 §4.3. */
export interface StarVaultConfig {
  /** Default release split (ADR-003 §4.3). Default `[0.4, 0.3, 0.3]`. */
  defaultSplit?: SplitWeights;
  /** Escalated release split when prior pool depleted past threshold. Default `[0.7, 0.15, 0.15]`. */
  escalatedSplit?: SplitWeights;
  /** Depletion fraction above which the escalated split applies. Default 0.8 (>80%). */
  depletionThreshold?: number;
  /** Protocol skim fraction on the released pool. Default 0.02 (2%). */
  skimRate?: number;
}

/** Default release split — 40/30/30 (ADR-003 §4.3 item 1). */
export const DEFAULT_SPLIT: SplitWeights = [0.4, 0.3, 0.3];
/** Escalated release split — 70/15/15 (ADR-003 §4.3 item 1). */
export const ESCALATED_SPLIT: SplitWeights = [0.7, 0.15, 0.15];
/** Default depletion threshold — escalate when prior pool > 80% depleted. */
export const DEFAULT_DEPLETION_THRESHOLD = 0.8;
/** Default protocol skim — 2% (ADR-003 §4.3 item 3). */
export const DEFAULT_SKIM_RATE = 0.02;

/** Per-Skrumpey reward line. */
export interface StarVaultReward {
  id: string;
  /** Cleaned DUST that earned this reward (echoed from input). */
  dust: number;
  /** Pro-rata MON reward for this Skrumpey. */
  reward: number;
}

/** Full result of settling one Star Vault cycle. */
export interface StarVaultSettlement {
  /** Whether the escalated split was triggered this cycle. */
  escalated: boolean;
  /** The split weights actually applied. */
  splitApplied: SplitWeights;
  /**
   * Gross pool released this cycle, pre-skim:
   * `Σ weight_i × priorLostInfluence_i + casinoHouseEdge`.
   */
  grossPool: number;
  /** Protocol skim removed: `skimRate × grossPool`. */
  protocolSkim: number;
  /** Distributable pool after skim — the "cycle pool size" of ADR-003 §4.2. */
  distributablePool: number;
  /** Σ cleaned DUST across all entries. 0 ⇒ no distribution. */
  totalCleaned: number;
  /** Per-Skrumpey rewards (pro-rata on cleaned DUST). All 0 if `totalCleaned === 0`. */
  rewards: StarVaultReward[];
  /**
   * Next-cycle pool seed: the un-released portion of the lost-Influence reserve
   * (`Σ (1 − weight_i) × priorLostInfluence_i`) plus any distributable pool that
   * went unclaimed because nobody cleaned DUST.
   */
  nextCycleSeed: number;
  /**
   * Distributable pool that went unclaimed (`totalCleaned === 0`). Folded into
   * `nextCycleSeed`; 0 whenever at least one Skrumpey cleaned DUST.
   */
  undistributed: number;
  /** Total inflows = `Σ priorLostInfluence + casinoHouseEdge` (conservation basis). */
  totalInflows: number;
}

function requireFinite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number, got ${value}`);
  }
  return value;
}

function requireNonNegative(value: number, name: string): number {
  requireFinite(value, name);
  if (value < 0) {
    throw new RangeError(`${name} must be ≥ 0, got ${value}`);
  }
  return value;
}

function resolveSplit(split: SplitWeights, name: string): SplitWeights {
  if (!Array.isArray(split) || split.length !== 3) {
    throw new TypeError(`${name} must be a 3-tuple of weights`);
  }
  split.forEach((w, i) => {
    requireFinite(w, `${name}[${i}]`);
    if (w < 0 || w > 1) {
      throw new RangeError(`${name}[${i}] must be in [0, 1], got ${w}`);
    }
  });
  return split;
}

function resolveSkimRate(config: StarVaultConfig): number {
  const skimRate = config.skimRate ?? DEFAULT_SKIM_RATE;
  requireFinite(skimRate, 'skimRate');
  if (skimRate < 0 || skimRate >= 1) {
    throw new RangeError(`skimRate must be in [0, 1), got ${skimRate}`);
  }
  return skimRate;
}

function resolveThreshold(config: StarVaultConfig): number {
  const threshold = config.depletionThreshold ?? DEFAULT_DEPLETION_THRESHOLD;
  requireFinite(threshold, 'depletionThreshold');
  if (threshold < 0 || threshold > 1) {
    throw new RangeError(`depletionThreshold must be in [0, 1], got ${threshold}`);
  }
  return threshold;
}

/**
 * Settle one Star Vault cycle (ADR-003 §4). Pure: deterministic in its inputs
 * with no side effects, and the inputs are never mutated.
 */
export function settleStarVaultCycle(
  input: StarVaultCycleInput,
  config: StarVaultConfig = {},
): StarVaultSettlement {
  const oldest = requireNonNegative(input.priorLostInfluence.oldest, 'priorLostInfluence.oldest');
  const middle = requireNonNegative(input.priorLostInfluence.middle, 'priorLostInfluence.middle');
  const newest = requireNonNegative(input.priorLostInfluence.newest, 'priorLostInfluence.newest');
  const casinoHouseEdge = requireNonNegative(input.casinoHouseEdge, 'casinoHouseEdge');
  const priorPoolDepletion = requireNonNegative(
    input.priorPoolDepletion ?? 0,
    'priorPoolDepletion',
  );
  if (priorPoolDepletion > 1) {
    throw new RangeError(`priorPoolDepletion must be in [0, 1], got ${priorPoolDepletion}`);
  }

  const defaultSplit = resolveSplit(config.defaultSplit ?? DEFAULT_SPLIT, 'defaultSplit');
  const escalatedSplit = resolveSplit(config.escalatedSplit ?? ESCALATED_SPLIT, 'escalatedSplit');
  const skimRate = resolveSkimRate(config);
  const threshold = resolveThreshold(config);

  // Escalate the split to front-load reward when the prior pool was drained
  // past the threshold (memo §1.3: ">80% depleted" → 70/15/15).
  const escalated = priorPoolDepletion > threshold;
  const splitApplied = escalated ? escalatedSplit : defaultSplit;

  const reserve: SplitWeights = [oldest, middle, newest];
  let releasedInfluence = 0;
  let retainedInfluence = 0;
  for (let i = 0; i < 3; i++) {
    releasedInfluence += splitApplied[i] * reserve[i];
    retainedInfluence += (1 - splitApplied[i]) * reserve[i];
  }

  const grossPool = releasedInfluence + casinoHouseEdge;
  const protocolSkim = skimRate * grossPool;
  const distributablePool = grossPool - protocolSkim;

  let totalCleaned = 0;
  for (const entry of input.cleaned) {
    totalCleaned += requireNonNegative(entry.dust, `cleaned[${entry.id}].dust`);
  }

  const totalInflows = oldest + middle + newest + casinoHouseEdge;

  let rewards: StarVaultReward[];
  let undistributed: number;
  if (totalCleaned === 0) {
    // No eligible cleaner — distribute nothing, roll the pool into the seed.
    rewards = input.cleaned.map((entry) => ({ id: entry.id, dust: entry.dust, reward: 0 }));
    undistributed = distributablePool;
  } else {
    rewards = input.cleaned.map((entry) => ({
      id: entry.id,
      dust: entry.dust,
      // ADR-003 §4.2: reward_i = (cleaned_i / total_cleaned) × cycle pool size.
      reward: (entry.dust / totalCleaned) * distributablePool,
    }));
    undistributed = 0;
  }

  const nextCycleSeed = retainedInfluence + undistributed;

  return {
    escalated,
    splitApplied,
    grossPool,
    protocolSkim,
    distributablePool,
    totalCleaned,
    rewards,
    nextCycleSeed,
    undistributed,
    totalInflows,
  };
}
