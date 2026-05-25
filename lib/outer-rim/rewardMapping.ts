/**
 * Star Vault reward-mapping reducer — folds real (Mode B/C) Perpl PnL into the
 * synthetic parimutuel Star Vault pool, then distributes the cycle pool
 * pro-rata across cleaned DUST.
 *
 * Spec: source memo `memory/evolution/swo_offshore_protocol_analysis_2026-05-23.md`
 * **Memo 2 — Hybrid Execution §5** (real-yield fold into the synthetic pool),
 * grounded by:
 *   - `docs/SANCTUARY_ADR_003_OUTER_RIM.md` §4 — Star Vault 24-hour pro-rata
 *     settlement, §4.2 reward formula, §4.3 cycle pool sources (lost Influence,
 *     casino house-edge inflow, 2% protocol skim).
 *   - `docs/SANCTUARY_OUTER_RIM_HYBRID_RFC.md` §3 — the three execution modes
 *     (A synthetic / B treasury-netted / C premium) whose real PnL this reducer
 *     folds in, and §"Open questions" OQ-H7 (gas-budget owner → Star Vault
 *     inflow ledger).
 *   - `docs/PERPL_INTEGRATION_REFERENCE.md` — the venue (Star Arena / Perpl)
 *     operational parameters that produce the Mode B/C realized PnL fed in here.
 *
 * Core identity (memo 2 §5):
 *
 *   cycle_vault_pool = synthetic_parimutuel_pool
 *                    + casino_house_edge
 *                    + max(mode_B_pnl, -loss_budget)   // floored real hedge PnL
 *                    + mode_C_rake
 *                    - skim(2%)                         // 2% protocol skim on gross
 *
 *   reward_i = (cleaned_i / total_cleaned) × cycle_vault_pool
 *
 * Invariants (see `.test.ts`):
 *   (a) Parimutuel sub-pool stays CLOSED. Excluding real PnL, every unit in
 *       (lost Influence + casino edge + Mode-C rake) is fully accounted for as
 *       payout + skim + seed — no value is created or destroyed internally.
 *   (b) Real PnL is the ONLY term that breaks closure (the "real yield"). The
 *       amount by which the cycle pool deviates from the closed deterministic
 *       redistribution equals exactly the (post-skim) floored Mode-B PnL.
 *   (c) Negative Mode-B PnL is floored at `-loss_budget`, so the vault never
 *       goes negative (defended further by a non-negativity clamp on the pool).
 *
 * Composition: this reducer consumes a `SyntheticVaultCycle` — the per-cycle
 * synthetic settlement produced by the pure Star Vault engine
 * `lib/outer-rim/star-vault.ts` (`[SWO_OUTER_RIM_STAR_VAULT_ENGINE_PURE]`,
 * ADR-003 §4.4). The synthetic engine owns the parimutuel pool and the cleaned
 * ledger; this reducer is the additive real-yield layer on top, exactly mirroring
 * how Hybrid-RFC §4 layers Modes B/C *behind* the mode-agnostic synthetic engine.
 *
 * Purity: no I/O, no clock, no randomness. Same inputs → same outputs.
 */

/** A single Skrumpey's cleaned-DUST contribution for the cycle. */
export interface CleanedEntry {
  /** Stable Skrumpey identifier (token id, wallet, etc.). */
  id: string;
  /** DUST cleaned by this Skrumpey this cycle. Must be ≥ 0. */
  cleaned: number;
}

/**
 * The synthetic-side cycle settlement produced by `star-vault.ts`. Only the
 * fields this reducer needs are modeled; the Star Vault engine may carry more.
 * This is the composition seam — `star-vault.ts` output → this reducer's input.
 */
export interface SyntheticVaultCycle {
  /**
   * The closed synthetic parimutuel pool for the cycle (lost Influence from
   * failed voyages, ADR-003 §4.3 item 1), in DUST. Must be ≥ 0.
   */
  syntheticParimutuelPool: number;
  /** Per-Skrumpey cleaned-DUST ledger for the cycle. */
  cleaned: CleanedEntry[];
  /**
   * Optional seed retained inside the synthetic sub-pool (carried forward,
   * not distributed this cycle). Part of closure accounting. Default 0.
   */
  seed?: number;
}

/** Real-execution (Mode B/C) inflows folded into the synthetic pool. */
export interface RealYieldInputs {
  /**
   * Cosmic Casino house-edge inflow routed to the vault (ADR-003 §4.3 item 2),
   * in DUST. Deterministic rake — part of the closed accounting. Must be ≥ 0.
   */
  casinoHouseEdge?: number;
  /**
   * Net realized PnL from the Mode-B treasury-netted hedge (Hybrid-RFC §3.2),
   * in DUST-equivalent. May be NEGATIVE. This is the "real yield" — the only
   * term that breaks parimutuel closure.
   */
  modeBPnl?: number;
  /**
   * Protocol rake skimmed from Mode-C premium per-user real positions
   * (Hybrid-RFC §3.3). Deterministic cut — part of the closed accounting.
   * Must be ≥ 0.
   */
  modeCRake?: number;
  /**
   * Maximum loss (in DUST) the vault will absorb from Mode-B in one cycle.
   * `modeBPnl` is floored at `-lossBudget`. Must be ≥ 0. Default 0
   * (i.e. no real loss is absorbed unless a budget is set).
   */
  lossBudget?: number;
}

/** Tunable reducer constants. */
export interface RewardMappingConfig {
  /** Protocol skim fraction on the gross pool. ADR-003 §4.3 item 3 → 0.02 (2%). */
  skimRate?: number;
}

/** Default protocol skim — 2% (ADR-003 §4.3 item 3). */
export const DEFAULT_SKIM_RATE = 0.02;

/** Per-Skrumpey reward line. */
export interface RewardEntry {
  id: string;
  /** Cleaned DUST that earned this reward (echoed from input). */
  cleaned: number;
  /** Pro-rata MON/DUST reward for this Skrumpey. */
  reward: number;
}

/** Full result of folding real yield into the synthetic pool. */
export interface RewardMappingResult {
  /** Floored Mode-B PnL actually applied: `max(modeBPnl, -lossBudget)`. */
  flooredModeBPnl: number;
  /**
   * Gross inflow before skim:
   * synthetic + casinoHouseEdge + flooredModeBPnl + modeCRake.
   */
  grossInflow: number;
  /** Protocol skim taken: `skimRate × max(grossInflow, 0)`. */
  skim: number;
  /** Distributable cycle pool after skim, clamped to ≥ 0 (invariant c). */
  cycleVaultPool: number;
  /**
   * The "real yield" component of the pool (invariant b): the post-skim
   * contribution of the floored Mode-B PnL — the only term that breaks
   * parimutuel closure. Signed.
   */
  realYield: number;
  /** Sum of all `cleaned` across entries. 0 ⇒ no distribution. */
  totalCleaned: number;
  /** Per-Skrumpey rewards (pro-rata). Empty/zero `totalCleaned` ⇒ all 0. */
  rewards: RewardEntry[];
  /**
   * Pool left undistributed because `totalCleaned === 0` (no eligible cleaner).
   * 0 whenever anyone cleaned DUST. Carried forward by the caller.
   */
  undistributed: number;
}

/** Closure decomposition of the synthetic parimutuel sub-pool (invariant a). */
export interface ParimutuelClosure {
  /** Σ synthetic in — the parimutuel pool funded by lost Influence. */
  syntheticIn: number;
  /** Σ synthetic out — the portion paid to cleaners (in − skim − seed). */
  syntheticOut: number;
  /** Skim taken on the synthetic sub-pool. */
  skim: number;
  /** Seed retained in the sub-pool (carried forward). */
  seed: number;
  /** `syntheticIn − (syntheticOut + skim + seed)`. Closure ⇔ ≈ 0. */
  residual: number;
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

/**
 * Decompose the synthetic parimutuel sub-pool into its closed accounting:
 * `syntheticIn === syntheticOut + skim + seed`. Real PnL is intentionally
 * absent here — that is what makes the sub-pool closed (invariant a/b).
 */
export function parimutuelClosure(
  cycle: SyntheticVaultCycle,
  config: RewardMappingConfig = {},
): ParimutuelClosure {
  const syntheticIn = requireNonNegative(
    cycle.syntheticParimutuelPool,
    'syntheticParimutuelPool',
  );
  const seed = requireNonNegative(cycle.seed ?? 0, 'seed');
  const skimRate = resolveSkimRate(config);

  if (seed > syntheticIn) {
    throw new RangeError(
      `seed (${seed}) cannot exceed syntheticParimutuelPool (${syntheticIn})`,
    );
  }

  const skim = skimRate * syntheticIn;
  const syntheticOut = syntheticIn - skim - seed;
  const residual = syntheticIn - (syntheticOut + skim + seed);

  return { syntheticIn, syntheticOut, skim, seed, residual };
}

function resolveSkimRate(config: RewardMappingConfig): number {
  const skimRate = config.skimRate ?? DEFAULT_SKIM_RATE;
  requireFinite(skimRate, 'skimRate');
  if (skimRate < 0 || skimRate >= 1) {
    throw new RangeError(`skimRate must be in [0, 1), got ${skimRate}`);
  }
  return skimRate;
}

/**
 * Fold Mode B/C real yield into the synthetic Star Vault pool and distribute
 * the resulting cycle pool pro-rata across cleaned DUST (memo 2 §5).
 *
 * Pure: deterministic in inputs, no side effects.
 */
export function mapRewards(
  cycle: SyntheticVaultCycle,
  real: RealYieldInputs = {},
  config: RewardMappingConfig = {},
): RewardMappingResult {
  const synthetic = requireNonNegative(
    cycle.syntheticParimutuelPool,
    'syntheticParimutuelPool',
  );
  const casinoHouseEdge = requireNonNegative(
    real.casinoHouseEdge ?? 0,
    'casinoHouseEdge',
  );
  const modeCRake = requireNonNegative(real.modeCRake ?? 0, 'modeCRake');
  const lossBudget = requireNonNegative(real.lossBudget ?? 0, 'lossBudget');
  const modeBPnl = requireFinite(real.modeBPnl ?? 0, 'modeBPnl');
  const skimRate = resolveSkimRate(config);

  // (c) floor the real hedge loss at the loss budget so the vault can never be
  // dragged negative by an adverse Mode-B outcome.
  const flooredModeBPnl = Math.max(modeBPnl, -lossBudget);

  const grossInflow = synthetic + casinoHouseEdge + flooredModeBPnl + modeCRake;

  // Skim only ever taken on a positive gross (never "refund" the protocol).
  const skim = skimRate * Math.max(grossInflow, 0);

  // (c) defense-in-depth: clamp the distributable pool at 0. With a correctly
  // sized loss budget (lossBudget ≤ synthetic + casinoHouseEdge + modeCRake)
  // this clamp is never hit, but it guarantees the post-condition regardless.
  const cycleVaultPool = Math.max(grossInflow - skim, 0);

  // (b) the real-yield component: the floored Mode-B PnL after skim. This is
  // the only term that moves the pool away from the closed deterministic value.
  const realYield = flooredModeBPnl * (1 - skimRate);

  const rewards: RewardEntry[] = [];
  let totalCleaned = 0;
  for (const entry of cycle.cleaned) {
    const cleaned = requireNonNegative(entry.cleaned, `cleaned[${entry.id}]`);
    totalCleaned += cleaned;
  }

  if (totalCleaned === 0) {
    // No eligible cleaner — distribute nothing, carry the pool forward.
    for (const entry of cycle.cleaned) {
      rewards.push({ id: entry.id, cleaned: entry.cleaned, reward: 0 });
    }
    return {
      flooredModeBPnl,
      grossInflow,
      skim,
      cycleVaultPool,
      realYield,
      totalCleaned,
      rewards,
      undistributed: cycleVaultPool,
    };
  }

  for (const entry of cycle.cleaned) {
    const share = entry.cleaned / totalCleaned;
    rewards.push({
      id: entry.id,
      cleaned: entry.cleaned,
      reward: share * cycleVaultPool,
    });
  }

  return {
    flooredModeBPnl,
    grossInflow,
    skim,
    cycleVaultPool,
    realYield,
    totalCleaned,
    rewards,
    undistributed: 0,
  };
}
