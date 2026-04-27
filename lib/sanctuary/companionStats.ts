/**
 * Pure helpers for the companion vitality-stat layer added in V2.4
 * (`[SWO_V2_COMPANION_INTERACT_AFFECTS_STATS]`).
 *
 * These functions are kept free of any DB / Phaser / React imports so they
 * can be unit-tested directly and reused by the API handler, the in-world
 * radial menu, and any future room NPC dialogs.
 */

export type CompanionStatAction = 'feed' | 'pet' | 'talk' | 'play' | 'sleep';

/**
 * Per-action stat deltas applied on a successful interaction. Stats are
 * clamped 0–100 by {@link clampStat} after the delta is applied.
 *
 *   feed → +hunger 25
 *   pet  → +happiness 15
 *   talk → +happiness 8 (plus the existing bond gain in db.ts)
 *   play → +happiness 20, −energy 10, −hunger 10
 *   sleep is handled separately — it sets is_sleeping=1 and recovers
 *         energy over time (see {@link computeEnergyAfterSleep}).
 */
export const INTERACTION_STAT_DELTAS: Readonly<
  Record<CompanionStatAction, Partial<Record<'hunger' | 'happiness' | 'energy', number>>>
> = Object.freeze({
  feed: { hunger: 25 },
  pet: { happiness: 15 },
  talk: { happiness: 8 },
  play: { happiness: 20, energy: -10, hunger: -10 },
  sleep: {},
});

/** Sleep recovers energy at this rate (per hour). Hits 100 from 40 in 1 h. */
export const SLEEP_ENERGY_PER_HOUR = 60;
/**
 * While `is_sleeping = 1`, all non-sleep actions are rejected until energy
 * climbs back to ≥ this threshold. Trying any of feed/pet/talk/play before
 * then surfaces a "companion is sleeping" error to the API caller.
 */
export const SLEEP_BLOCK_THRESHOLD = 80;
/** When recovered energy hits this value, sleep ends automatically. */
export const SLEEP_AUTO_WAKE_THRESHOLD = 100;

/** Default starting values for fresh companions (V2.4 backfill). */
export const DEFAULT_HUNGER = 50;
export const DEFAULT_HAPPINESS = 50;
export const DEFAULT_ENERGY = 100;

/** Clamps any stat to the canonical 0–100 vitality range. */
export function clampStat(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

/**
 * Compute the energy a companion should have *now* given the energy it had
 * when it fell asleep, the timestamp it fell asleep, and the current time.
 * Returns the previous energy unchanged if `sleepStartedAt` is null.
 */
export function computeEnergyAfterSleep(
  energyAtSleepStart: number,
  sleepStartedAt: string | null,
  now: Date,
): number {
  if (!sleepStartedAt) return clampStat(energyAtSleepStart);
  const startedMs = parseSqlDateMs(sleepStartedAt);
  if (startedMs === null) return clampStat(energyAtSleepStart);
  const elapsedHours = Math.max(0, (now.getTime() - startedMs) / 3_600_000);
  return clampStat(energyAtSleepStart + elapsedHours * SLEEP_ENERGY_PER_HOUR);
}

/**
 * Parses the `YYYY-MM-DD HH:MM:SS` SQLite-default datetime format (UTC) to
 * milliseconds since epoch. Returns null for unrecognised input so callers
 * can fall back gracefully.
 */
export function parseSqlDateMs(value: string): number | null {
  // Accept both ISO ("2026-04-26T12:00:00Z") and SQLite default ("2026-04-26 12:00:00").
  const candidate = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const ms = Date.parse(candidate);
  return Number.isFinite(ms) ? ms : null;
}

export interface CompanionStatSnapshot {
  hunger: number;
  happiness: number;
  energy: number;
  is_sleeping: number;
  sleep_started_at: string | null;
}

export interface InteractionStatResult {
  hunger: number;
  happiness: number;
  energy: number;
  is_sleeping: number;
  sleep_started_at: string | null;
  /** Whether sleep was forcibly ended this turn (energy ≥ block threshold). */
  woke_up: boolean;
}

/**
 * Compute the post-action vitality snapshot for a companion. The caller is
 * responsible for daily-cap and bond/XP logic — this function only owns the
 * 4 vitality fields plus is_sleeping/sleep_started_at.
 *
 * Throws when `is_sleeping = 1` and the action is non-sleep and effective
 * energy < SLEEP_BLOCK_THRESHOLD. Catch the error in the route handler and
 * surface a 409.
 *
 * For `sleep`:
 *   - From awake → sets is_sleeping=1, sleep_started_at=now (no other deltas).
 *   - Already asleep → refreshes energy from elapsed time. If energy ≥
 *     SLEEP_AUTO_WAKE_THRESHOLD, also auto-wakes (is_sleeping=0).
 */
export function applyInteractionStats(
  current: CompanionStatSnapshot,
  action: CompanionStatAction,
  now: Date,
): InteractionStatResult {
  const sleeping = current.is_sleeping === 1;
  const refreshedEnergy = sleeping
    ? computeEnergyAfterSleep(current.energy, current.sleep_started_at, now)
    : clampStat(current.energy);

  if (action === 'sleep') {
    if (!sleeping) {
      return {
        hunger: clampStat(current.hunger),
        happiness: clampStat(current.happiness),
        energy: refreshedEnergy,
        is_sleeping: 1,
        sleep_started_at: toSqlDate(now),
        woke_up: false,
      };
    }
    // Already sleeping — refresh energy, auto-wake if maxed out.
    const autoWake = refreshedEnergy >= SLEEP_AUTO_WAKE_THRESHOLD;
    return {
      hunger: clampStat(current.hunger),
      happiness: clampStat(current.happiness),
      energy: refreshedEnergy,
      is_sleeping: autoWake ? 0 : 1,
      sleep_started_at: autoWake ? null : current.sleep_started_at,
      woke_up: autoWake,
    };
  }

  if (sleeping && refreshedEnergy < SLEEP_BLOCK_THRESHOLD) {
    throw new SleepingCompanionError(refreshedEnergy);
  }

  // If the companion was asleep but has now recovered enough, this action
  // also wakes them up. Their refreshed energy is persisted alongside the
  // action's deltas.
  const wokeUp = sleeping && refreshedEnergy >= SLEEP_BLOCK_THRESHOLD;
  const deltas = INTERACTION_STAT_DELTAS[action];
  return {
    hunger: clampStat(current.hunger + (deltas.hunger ?? 0)),
    happiness: clampStat(current.happiness + (deltas.happiness ?? 0)),
    energy: clampStat(refreshedEnergy + (deltas.energy ?? 0)),
    is_sleeping: 0,
    sleep_started_at: null,
    woke_up: wokeUp,
  };
}

/** Format a Date as the SQLite default `YYYY-MM-DD HH:MM:SS` (UTC). */
export function toSqlDate(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Thrown by {@link applyInteractionStats} when an action is rejected because
 * the companion is asleep and has not yet recovered enough energy. The
 * message is user-facing — it surfaces directly to the API caller.
 */
export class SleepingCompanionError extends Error {
  readonly currentEnergy: number;
  constructor(currentEnergy: number) {
    super(
      `Companion is sleeping. Wake them when energy reaches ${SLEEP_BLOCK_THRESHOLD} (currently ${Math.round(currentEnergy)}).`,
    );
    this.name = 'SleepingCompanionError';
    this.currentEnergy = currentEnergy;
  }
}
