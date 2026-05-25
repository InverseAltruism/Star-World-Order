// [SWO_V2_SANCTUARY_QUESTS_V2] Pure resolver for the minigame STAR wager.
// Games are SKILL wagers: stake STAR, and your score vs. the game's "par" decides
// the payout. Hit par → break even; double par → the max multiplier; flop → lose
// most of the stake. Unlike the quest wager there's no RNG — it's all skill — so
// the spam guard is the RESOURCE entry cost (energy), which caps how many plays a
// session affords. That keeps a good player to ~30–60 min/day before they must
// rest and return tomorrow.

export const ARCADE_STAKES = [5, 15, 30] as const;
/** Max payout multiplier (before rake) — caps the upside of a perfect run. */
export const ARCADE_MAX_MULT = 2.0;
/**
 * House rake applied to every arcade payout. Keeps the game a controlled sink:
 * hitting par returns 0.92× the stake (a small loss), so a player must beat par
 * by ~9% to profit. Combined with the energy entry cost (which caps plays per
 * day), this bounds how much STAR skilled play can mint and preserves a house
 * edge — economically sound, while still letting a strong run win up to ~1.84×.
 */
export const ARCADE_HOUSE_RAKE = 0.92;

/** Target score where a play breaks even (payout multiplier = 1.0). */
export const MINIGAME_PAR: Readonly<Record<string, number>> = Object.freeze({
  'star-catch': 120,
  'memory-match': 160,
  'star-connect': 140,
  'forge-hammer': 130,
  'cooking-rhythm': 150,
  'dream-catcher': 140,
  'lore-trivia': 110,
});

export function isValidArcadeStake(stake: number): boolean {
  return (ARCADE_STAKES as readonly number[]).includes(stake);
}

export interface ArcadeResult {
  payoutMult: number;
  payout: number; // STAR returned (0 = total loss of stake)
  net: number; // payout − stake
  won: boolean; // payout ≥ stake
}

/**
 * Resolve a finished arcade play:
 *   payoutMult = clamp(score/par, 0, MAX_MULT) × HOUSE_RAKE
 *   payout     = round(stake × payoutMult)
 * Hitting par returns ~0.92× (a small house edge); beating par by ~9% breaks
 * even; a strong run pays up to ~1.84×. The energy entry cost bounds volume.
 */
export function resolveArcade(gameId: string, stake: number, score: number): ArcadeResult {
  const par = MINIGAME_PAR[gameId] ?? 120;
  const ratio = Math.max(0, score) / par;
  const payoutMult = Math.min(ARCADE_MAX_MULT, ratio) * ARCADE_HOUSE_RAKE;
  const payout = Math.round(stake * payoutMult);
  return { payoutMult, payout, net: payout - stake, won: payout >= stake };
}
