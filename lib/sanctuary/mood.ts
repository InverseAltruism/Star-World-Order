/**
 * Pure mood-derivation helper for V2.4 companion vitality stats
 * (`[SWO_V2_COMPANION_MOOD_FROM_STATS]`).
 *
 * Mood is computed deterministically from the current (decay-projected)
 * vitality snapshot — `hunger`, `happiness`, `energy`, `is_sleeping` — and
 * collapses to one of six labels the rest of the system reasons about.
 * Trait-derived mood from the NFT metadata remains the fallback when stats
 * are not yet populated (legacy companions during the V2.4 rollout).
 *
 * No DB / Phaser / React imports — keeps the helper trivially unit-testable
 * and reusable from the API handler, CompanionSprite, and CompanionHUD.
 */
import type { CompanionMood } from '@/game/systems/AnimationSystem';

export type StatMood = 'sleeping' | 'hungry' | 'sleepy' | 'lonely' | 'happy' | 'idle';

/** Subset of CompanionStatSnapshot needed for mood derivation. */
export interface MoodStatInput {
  hunger: number;
  happiness: number;
  energy: number;
  is_sleeping?: number | null;
}

/** Single stat below this threshold drives the dominant negative mood. */
export const LOW_STAT_THRESHOLD = 30;
/** All stats at-or-above this threshold drive the `happy` mood. */
export const HAPPY_STAT_THRESHOLD = 60;

/**
 * Derive a {@link StatMood} from a current vitality snapshot.
 *
 * Mapping (initial — may be tuned):
 *   - `is_sleeping` → `sleeping`
 *   - min stat is hunger and < 30 → `hungry`
 *   - min stat is energy and < 30 → `sleepy`
 *   - min stat is happiness and < 30 → `lonely`
 *   - all stats ≥ 60 → `happy`
 *   - otherwise → `idle`
 *
 * Ties on minimum stat are broken in priority order:
 * `hunger` > `energy` > `happiness` (most-urgent need wins).
 */
export function deriveMoodFromStats(stats: MoodStatInput): StatMood {
  if (stats.is_sleeping === 1) return 'sleeping';

  const { hunger, happiness, energy } = stats;
  const min = Math.min(hunger, happiness, energy);

  if (min < LOW_STAT_THRESHOLD) {
    if (hunger === min) return 'hungry';
    if (energy === min) return 'sleepy';
    return 'lonely';
  }

  if (
    hunger >= HAPPY_STAT_THRESHOLD &&
    happiness >= HAPPY_STAT_THRESHOLD &&
    energy >= HAPPY_STAT_THRESHOLD
  ) {
    return 'happy';
  }

  return 'idle';
}

/**
 * Resolve the effective mood for a companion. Prefers the stat-derived mood
 * when {@link MoodStatInput} is populated; falls back to the trait-mood
 * string for legacy companions that have not yet been migrated to V2.4
 * vitality stats. Returns `null` when neither source is available.
 */
export function resolveCompanionMood(
  stats: MoodStatInput | null | undefined,
  traitMood: string | null | undefined,
): StatMood | string | null {
  if (stats && areStatsPopulated(stats)) {
    return deriveMoodFromStats(stats);
  }
  return traitMood ?? null;
}

function areStatsPopulated(stats: MoodStatInput): boolean {
  return (
    Number.isFinite(stats.hunger) &&
    Number.isFinite(stats.happiness) &&
    Number.isFinite(stats.energy)
  );
}

/**
 * Map a derived {@link StatMood} to the existing animation moods the sprite
 * pipeline already supports — no new art is introduced. `sleeping` and
 * `sleepy` share the same animation; `hungry` reuses `curious`; `lonely`
 * reuses `calm`.
 */
const STAT_MOOD_TO_ANIMATION: Readonly<Record<StatMood, CompanionMood>> = Object.freeze({
  sleeping: 'sleepy',
  sleepy: 'sleepy',
  hungry: 'curious',
  lonely: 'calm',
  happy: 'happy',
  idle: 'idle',
});

export function statMoodToAnimationMood(mood: StatMood): CompanionMood {
  return STAT_MOOD_TO_ANIMATION[mood];
}
