/**
 * Deterministic per-Skrumpey preference profile
 * ([SWO_V2_SANCTUARY_PREFERENCE_PROFILE]).
 *
 * Every Skrumpey has a private personality: across the five sanctuary actions
 * (feed / pet / talk / play / sleep) it has exactly one loved, one liked, one
 * neutral, one disliked and one hated. The profile is a permutation of the
 * five preference levels, seeded by the NFT's token id — so two Skrumpey on
 * the same wallet draw different profiles, but the same Skrumpey always lands
 * on the same profile across sessions and devices.
 *
 * The module is intentionally pure: no DB / fetch / React imports. It is
 * called from
 *   - the bond-math path in `db.ts#interactWithCompanion` (PR2 — wires the
 *     multiplier into the persisted bond_score delta)
 *   - the journal clue helper in `companionGreeting.ts` (PR1 — surfaces the
 *     reveal line once N=3 matched interactions accumulate)
 *   - the UI preview in `companionAction.ts` (PR1 — shows a small badge so
 *     the player can read the personality once it's been revealed)
 */
import type { CompanionStatAction } from './companionStats';

export type PreferenceLevel = 'loved' | 'liked' | 'neutral' | 'disliked' | 'hated';

export type PreferenceProfile = Readonly<Record<CompanionStatAction, PreferenceLevel>>;

/**
 * Bond multiplier applied to the baseline per-action bond gain. The
 * `loved → 4× neutral` ratio is part of the task acceptance contract; `hated`
 * must subtract bond so a player who keeps shoving spinach at a Skrumpey who
 * hates feeding sees the relationship slowly erode.
 */
export const PREFERENCE_BOND_MULTIPLIER: Readonly<Record<PreferenceLevel, number>> = Object.freeze({
  loved: 4,
  liked: 2,
  neutral: 1,
  disliked: 0,
  hated: -1,
});

/**
 * Extra multiplier when the action targets a stat that is currently below
 * `NEED_STATE_THRESHOLD` — feeding a hungry Skrumpey, petting a lonely one,
 * etc. Stacks multiplicatively with the preference multiplier.
 */
export const NEED_BOOST_MULTIPLIER = 1.5;

/** Stats at or below this value count as "in need" for the boost multiplier. */
export const NEED_STATE_THRESHOLD = 30;

/**
 * Number of times the player must perform the SAME action on a Skrumpey
 * before the journal reveals its preference for that action. Below this the
 * Skrumpey is "still figuring out how it feels" and the journal stays quiet.
 */
export const PREFERENCE_CLUE_REVEAL_N = 3;

const ACTIONS_CANONICAL: readonly CompanionStatAction[] = [
  'feed',
  'pet',
  'talk',
  'play',
  'sleep',
];

const LEVELS_CANONICAL: readonly PreferenceLevel[] = [
  'loved',
  'liked',
  'neutral',
  'disliked',
  'hated',
];

/**
 * Return the preference profile for a Skrumpey. Deterministic given the
 * token id — two calls with the same id return the same (frozen) object;
 * two different ids produce statistically-independent permutations.
 *
 * The returned object is a permutation of {loved, liked, neutral, disliked,
 * hated} across {feed, pet, talk, play, sleep}, so every Skrumpey has
 * exactly one of each preference level.
 */
export function preferenceProfile(tokenId: number): PreferenceProfile {
  const shuffled: PreferenceLevel[] = [...LEVELS_CANONICAL];
  let state = seedFromTokenId(tokenId);
  for (let i = shuffled.length - 1; i > 0; i--) {
    state = mulberry32(state);
    const j = state % (i + 1);
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }
  const out = {} as Record<CompanionStatAction, PreferenceLevel>;
  for (let i = 0; i < ACTIONS_CANONICAL.length; i++) {
    out[ACTIONS_CANONICAL[i]] = shuffled[i];
  }
  return Object.freeze(out);
}

/** Convenience accessor — same as `preferenceProfile(tokenId)[action]`. */
export function preferenceFor(
  tokenId: number,
  action: CompanionStatAction,
): PreferenceLevel {
  return preferenceProfile(tokenId)[action];
}

export interface BondDeltaInput {
  /** Baseline bond gain for the action before preference is applied. */
  baseline: number;
  preference: PreferenceLevel;
  /** True when the action targets a currently-low stat (see {@link isNeedTargeted}). */
  needBoosted?: boolean;
}

/**
 * Compute the final bond delta for an interaction, taking preference and
 * need-state into account. `baseline` is the action's neutral bond gain
 * (from `INTERACTION_BOND` in db.ts); the preference multiplier scales it
 * and the need boost (if any) stacks on top.
 */
export function computeBondDelta(input: BondDeltaInput): number {
  const prefMult = PREFERENCE_BOND_MULTIPLIER[input.preference];
  const needMult = input.needBoosted ? NEED_BOOST_MULTIPLIER : 1;
  return input.baseline * prefMult * needMult;
}

export interface NeedSnapshot {
  hunger: number | null | undefined;
  happiness: number | null | undefined;
  energy: number | null | undefined;
}

/**
 * Map of action → the vitality stat it primarily affects. `sleep` targets
 * energy; the three "social" actions all target happiness; feed targets
 * hunger. Used to decide whether the action's need-boost multiplier kicks in.
 */
const ACTION_TARGET_STAT: Readonly<Record<CompanionStatAction, keyof NeedSnapshot>> = Object.freeze({
  feed: 'hunger',
  pet: 'happiness',
  talk: 'happiness',
  play: 'happiness',
  sleep: 'energy',
});

/**
 * True when the action's target stat is currently below the need threshold —
 * e.g., feeding a Skrumpey whose hunger has dropped to 22. Treats
 * null/undefined/NaN as "not in need" so legacy companions don't get a
 * silent boost.
 */
export function isNeedTargeted(
  action: CompanionStatAction,
  stats: NeedSnapshot,
  threshold: number = NEED_STATE_THRESHOLD,
): boolean {
  const key = ACTION_TARGET_STAT[action];
  const value = stats[key];
  return typeof value === 'number' && Number.isFinite(value) && value <= threshold;
}

/**
 * Has the player performed this action enough times that the journal should
 * reveal the Skrumpey's preference for it? The reveal threshold is constant
 * (PREFERENCE_CLUE_REVEAL_N) so a designer can re-tune the pacing without
 * touching call sites.
 */
export function preferenceClueRevealed(matchedCount: number): boolean {
  return Number.isFinite(matchedCount) && matchedCount >= PREFERENCE_CLUE_REVEAL_N;
}

// ---------------------------------------------------------------------------
// internal seed helpers — mulberry32 is good enough for cosmetic determinism
// ---------------------------------------------------------------------------

function seedFromTokenId(tokenId: number): number {
  // Token ids on Monad are uint256; we only need a 32-bit seed and the JS
  // number is already lossy past 2^53, so collapse via xor-fold and add a
  // non-zero salt so tokenId=0 still produces a valid stream.
  const n = Number.isFinite(tokenId) ? Math.trunc(tokenId) : 0;
  const low = (n >>> 0);
  const high = (Math.floor(n / 0x100000000) >>> 0);
  let s = (low ^ high ^ 0x9e3779b9) >>> 0;
  s = (Math.imul(s ^ (s >>> 16), 0x21f0aaad)) >>> 0;
  s = (Math.imul(s ^ (s >>> 15), 0x735a2d97)) >>> 0;
  return (s ^ (s >>> 15)) >>> 0;
}

function mulberry32(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
  return (t ^ (t >>> 14)) >>> 0;
}
