/**
 * Tamagotchi-style stat decay (V2.5, [SWO_V2_COMPANION_STATS_SCHEMA]).
 *
 * `decayStats` is a pure projection of where a companion's vitality values
 * "should be" right now given the last-known snapshot and the elapsed time.
 * No DB / Phaser / React imports here so the helper can be unit-tested in
 * isolation and reused by the GET /api/sanctuary/companion/stats route, the
 * server-side `tickStats` mutator in db.ts, and any in-world HUD code.
 */

import { clampStat, parseSqlDateMs } from './companionStats';

export type DecayableStat = 'hunger' | 'happiness' | 'energy';

/**
 * Per-stat decay applied per real-time hour. All values are positive — the
 * stat is _decreased_ by this amount per elapsed hour (lower = needs
 * attention). Energy decay only applies while awake; while is_sleeping = 1
 * energy is recovered separately by `computeEnergyAfterSleep`.
 *
 * Hand-tuned so a fully fed/happy/awake companion crosses the soft "need"
 * threshold (30) within a comfortable check-in window:
 *   hunger    100 → 30 in 35 h (≈ 1.5 days)
 *   happiness 100 → 30 in 70 h (≈ 3 days)
 *   energy    100 → 30 in 70 h (sleep recovers this faster)
 */
export const DECAY_RATES_PER_HOUR: Readonly<Record<DecayableStat, number>> = Object.freeze({
  hunger: 2,
  happiness: 1,
  energy: 1,
});

/**
 * Fallback baseline used when seeding fresh stat snapshots. The V2.4 column
 * defaults on sanctuary_companions are kept as-is for back-compat, but new
 * callers (and any null-handling in decayStats) should treat 80/80/80 as the
 * canonical "freshly initialised" state.
 */
export const DEFAULT_STATS: Readonly<Record<DecayableStat, number>> = Object.freeze({
  hunger: 80,
  happiness: 80,
  energy: 80,
});

/**
 * Stats below this value surface as a "need" in the GET stats endpoint and
 * in CompanionHUD alerts (V2.4 [SWO_V2_COMPANION_NEED_ALERTS] used the same
 * threshold; kept consistent here on purpose).
 */
export const NEED_THRESHOLD = 30;

/** Human-readable label for each decayable stat surfaced in the needs list. */
export const NEED_LABELS: Readonly<Record<DecayableStat, string>> = Object.freeze({
  hunger: 'hungry',
  happiness: 'lonely',
  energy: 'tired',
});

/**
 * Minimum projection input. Accepts either the full {@link SanctuaryCompanion}
 * shape or a hand-rolled snapshot — the helper only touches the fields below.
 */
export interface DecayInput {
  hunger: number;
  happiness: number;
  energy: number;
  stats_updated_at: string | null;
  is_sleeping?: number;
}

export interface DecayedStats {
  hunger: number;
  happiness: number;
  energy: number;
}

/**
 * Project the current vitality stats from a persisted snapshot, given the
 * elapsed time since `stats_updated_at`. Pure — does not write.
 *
 * Behaviour:
 *   - Each stat is reduced by DECAY_RATES_PER_HOUR[stat] × hours.
 *   - Energy decay is _suppressed_ while is_sleeping = 1 (sleep recovery is
 *     handled by computeEnergyAfterSleep in companionStats.ts).
 *   - Results clamp to the canonical 0–100 range via {@link clampStat}.
 *   - If `stats_updated_at` is null/unparseable or `now` is earlier than
 *     the snapshot, the original (clamped) values are returned unchanged so
 *     time-skew or fresh inserts cannot accidentally amplify a stat.
 */
export function decayStats(input: DecayInput, now: Date): DecayedStats {
  const hunger = clampStat(input.hunger);
  const happiness = clampStat(input.happiness);
  const energy = clampStat(input.energy);

  if (!input.stats_updated_at) {
    return { hunger, happiness, energy };
  }
  const startedMs = parseSqlDateMs(input.stats_updated_at);
  if (startedMs === null) {
    return { hunger, happiness, energy };
  }
  const elapsedHours = (now.getTime() - startedMs) / 3_600_000;
  if (!(elapsedHours > 0)) {
    return { hunger, happiness, energy };
  }

  const sleeping = input.is_sleeping === 1;
  return {
    hunger: clampStat(hunger - DECAY_RATES_PER_HOUR.hunger * elapsedHours),
    happiness: clampStat(happiness - DECAY_RATES_PER_HOUR.happiness * elapsedHours),
    energy: sleeping ? energy : clampStat(energy - DECAY_RATES_PER_HOUR.energy * elapsedHours),
  };
}

/** List of human-readable need labels for stats that fell below NEED_THRESHOLD. */
export function computeNeeds(stats: DecayedStats): string[] {
  const needs: string[] = [];
  if (stats.hunger < NEED_THRESHOLD) needs.push(NEED_LABELS.hunger);
  if (stats.happiness < NEED_THRESHOLD) needs.push(NEED_LABELS.happiness);
  if (stats.energy < NEED_THRESHOLD) needs.push(NEED_LABELS.energy);
  return needs;
}
