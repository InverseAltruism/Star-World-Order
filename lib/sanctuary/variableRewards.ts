/**
 * [SWO_V2_SANCTUARY_VARIABLE_REWARDS] (PR7 / 7)
 *
 * Variable-reward layer for the five sanctuary actions
 * ({@link CompanionStatAction}). The intent is dopamine-shaped: every
 * interaction always pays the floor (base bond gain + base stat delta), and
 * on top of that the player gets an occasional surprise — a small STAR bonus
 * or, much more rarely, a rare trinket cosmetic. The floor is what the
 * player can rely on; the bonus is what makes them lean in.
 *
 * Tuning (per task spec, §3.5 of the sanctuary v2 design):
 *   - 5–10% chance of a bonus STAR drop (default 7.5%); on hit, +1..3 STAR
 *   - 0.5–1% chance of a rare trinket (default 0.75%)
 *   - Otherwise the roll is `floor` and only the base reward survives
 *
 * The module is intentionally pure — no DB / fetch / React / Phaser imports —
 * and the RNG is always injected so callers can pass a seeded stream in tests
 * and (in the Playwright E2E) thread a fixed seed through the full UI flow.
 */
import type { CompanionStatAction } from './companionStats';

export type VariableRewardTier = 'floor' | 'bonus_star' | 'rare_trinket';

export interface VariableRewardConfig {
  /** Probability of the bonus_star branch firing (0..1). Spec range 0.05..0.10. */
  bonusStarChance: number;
  /** Probability of the rare_trinket branch firing (0..1). Spec range 0.005..0.01. */
  rareTrinketChance: number;
  /** Inclusive lower bound on the STAR payout when bonus_star fires. */
  bonusStarMin: number;
  /** Inclusive upper bound on the STAR payout when bonus_star fires. */
  bonusStarMax: number;
}

/**
 * Default tuning. Chosen at the midpoint-ish of the spec ranges so a tweak
 * in either direction is still inside the contract.
 */
export const DEFAULT_VARIABLE_REWARD_CONFIG: Readonly<VariableRewardConfig> = Object.freeze({
  bonusStarChance: 0.075,
  rareTrinketChance: 0.0075,
  bonusStarMin: 1,
  bonusStarMax: 3,
});

export interface VariableRewardInput {
  /** The action being performed. Reported back on the result for downstream UX. */
  action: CompanionStatAction;
  /**
   * Floor bond delta — the bond gain the player keeps even when the roll
   * comes up `floor`. Passed through unchanged so the consumer can add the
   * bonus on top without losing the floor.
   */
  floorBond: number;
  /**
   * A `() => number` RNG, where each call returns a number in [0, 1). When
   * omitted, `Math.random` is used. Tests inject {@link makeSeededRng}.
   */
  rng?: () => number;
  config?: Partial<VariableRewardConfig>;
}

export interface VariableRewardOutcome {
  action: CompanionStatAction;
  tier: VariableRewardTier;
  /** Final bond delta = `floorBond` (variable rewards never touch the floor). */
  bond: number;
  /** STAR awarded by the variable layer. 0 unless tier === 'bonus_star'. */
  bonusStar: number;
  /** True only when tier === 'rare_trinket'. */
  rareTrinket: boolean;
  /** Single-line label suitable for the HUD bonus badge / journal entry. */
  badgeLabel: string | null;
}

/**
 * Roll the variable reward layer for a single interaction. Always returns
 * the floor (caller's `floorBond`); the bonus, if any, is layered on top.
 *
 * Ordering note: this function does NOT apply preference or need-state
 * multipliers. Callers MUST apply those first (see `companionAction.previewActionReward`)
 * and pass the resulting `floorBond` here — the variable reward is the last
 * step before persistence so it sits on top of the multiplied base.
 */
export function rollVariableReward(input: VariableRewardInput): VariableRewardOutcome {
  const cfg = { ...DEFAULT_VARIABLE_REWARD_CONFIG, ...(input.config ?? {}) };
  const rng = input.rng ?? Math.random;

  const trinketRoll = rng();
  const starRoll = rng();
  const amountRoll = rng();

  // Rare trinket dominates because it has the lower probability and a
  // collision would otherwise mostly hide it. The two branches are exclusive
  // — at most one bonus per interaction.
  if (trinketRoll < cfg.rareTrinketChance) {
    return {
      action: input.action,
      tier: 'rare_trinket',
      bond: input.floorBond,
      bonusStar: 0,
      rareTrinket: true,
      badgeLabel: 'Rare trinket!',
    };
  }
  if (starRoll < cfg.bonusStarChance) {
    const span = Math.max(1, cfg.bonusStarMax - cfg.bonusStarMin + 1);
    const offset = Math.floor(amountRoll * span);
    const bonus = cfg.bonusStarMin + offset;
    return {
      action: input.action,
      tier: 'bonus_star',
      bond: input.floorBond,
      bonusStar: bonus,
      rareTrinket: false,
      badgeLabel: `+${bonus} ✨STAR`,
    };
  }
  return {
    action: input.action,
    tier: 'floor',
    bond: input.floorBond,
    bonusStar: 0,
    rareTrinket: false,
    badgeLabel: null,
  };
}

/**
 * True when the outcome should surface the HUD bonus badge. Wraps the
 * tier-check so the HUD doesn't have to know about the enum directly.
 */
export function shouldFireBonusBadge(outcome: VariableRewardOutcome): boolean {
  return outcome.tier !== 'floor';
}

// ---------------------------------------------------------------------------
// Seeded RNG — mulberry32, matches the seed style used in preferences.ts so
// the project has exactly one PRNG idiom for cosmetic determinism. Returns a
// `() => number` closure so callers can pass it as `rng` above without
// re-allocating state.
// ---------------------------------------------------------------------------

export function makeSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  // Fold zero seeds through the salt so seed=0 still produces a live stream.
  if (state === 0) state = 0x9e3779b9;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}
