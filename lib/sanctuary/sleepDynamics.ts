/**
 * [SWO_V2_SANCTUARY_SLEEP_DYNAMICS] — sleep that matters (PR4 of 7).
 *
 * Pure helpers for the sleep-cycle economy. Three behaviours:
 *
 *   1. **Tired gate.** A companion that has not had a full sleep cycle in
 *      the last 24h becomes `Tired`. While Tired, all non-sleep bond gains
 *      are halved.
 *   2. **Dream reward.** Completing a full sleep cycle (sleep action ends
 *      with auto-wake at SLEEP_AUTO_WAKE_THRESHOLD) clears Tired and grants
 *      a non-zero floor of ≥ 1 STAR + 1 bond.
 *   3. **Early-wake penalty.** Interrupting a sleeping companion with any
 *      non-sleep action (which forces them awake once energy ≥ block
 *      threshold) costs −2 bond and writes a journal entry.
 *
 * No DB / Phaser / React imports — keeps the module trivially unit-testable
 * and reusable by the API handler, the UI preview, and the future sleep
 * endpoint.
 */
import type { CompanionStatAction } from './companionStats';
import { parseSqlDateMs } from './companionStats';

/** Hours awake (no full sleep) before the companion becomes Tired. */
export const TIRED_THRESHOLD_HOURS = 24;
/** Multiplier applied to non-sleep bond gains while Tired. */
export const TIRED_BOND_MULTIPLIER = 0.5;
/** Non-zero floor for the dream reward (per §3.2 of the V2 plan). */
export const DREAM_REWARD_STAR_FLOOR = 1;
export const DREAM_REWARD_BOND_FLOOR = 1;
/** Bond delta when a non-sleep action wakes a sleeping companion. */
export const EARLY_WAKE_BOND_PENALTY = -2;

export const TIRED_JOURNAL_TAG = 'sleep_dynamics';
export const DREAM_JOURNAL_MESSAGE =
  'Drifted through a full dream cycle — felt rested and recharged.';
export const EARLY_WAKE_JOURNAL_MESSAGE =
  'Roused mid-dream. They blinked, a little wobbly, and the bond felt thinner.';

/**
 * True when ≥ 24h have elapsed since the companion's last full sleep cycle.
 * A null timestamp (legacy companion or never-slept) returns `false` — the
 * caller should backfill `last_full_sleep_at` to a sensible default before
 * relying on this gate.
 */
export function isCompanionTired(
  lastFullSleepAt: string | null,
  now: Date,
): boolean {
  if (!lastFullSleepAt) return false;
  const startedMs = parseSqlDateMs(lastFullSleepAt);
  if (startedMs === null) return false;
  const elapsedHours = (now.getTime() - startedMs) / 3_600_000;
  return elapsedHours >= TIRED_THRESHOLD_HOURS;
}

/**
 * Apply the Tired multiplier to a raw bond gain. Sleep actions are never
 * penalised (the user is already trying to rest the companion). Returns
 * the original gain when not Tired.
 */
export function applyTiredBondMultiplier(
  bondGain: number,
  action: CompanionStatAction,
  isTired: boolean,
): number {
  if (!isTired || action === 'sleep') return bondGain;
  return bondGain * TIRED_BOND_MULTIPLIER;
}

export type SleepTransition =
  | 'started_sleep'
  | 'full_cycle'
  | 'early_wake'
  | 'still_sleeping'
  | 'no_change';

/**
 * Classify what happened to the sleep state across an interaction. Encodes
 * the contract emitted by `applyInteractionStats` in companionStats.ts:
 *
 *   - awake → sleeping     : `started_sleep`
 *   - sleeping → awake (sleep action, energy hit auto-wake threshold)
 *                          : `full_cycle`
 *   - sleeping → awake (non-sleep action, energy passed block threshold)
 *                          : `early_wake`
 *   - sleeping → sleeping  : `still_sleeping` (refreshed energy, did not max)
 *   - awake → awake        : `no_change`
 */
export function classifySleepTransition(input: {
  wasSleeping: boolean;
  nowSleeping: boolean;
  action: CompanionStatAction;
}): SleepTransition {
  if (!input.wasSleeping && input.nowSleeping) return 'started_sleep';
  if (input.wasSleeping && !input.nowSleeping) {
    return input.action === 'sleep' ? 'full_cycle' : 'early_wake';
  }
  if (input.wasSleeping && input.nowSleeping) return 'still_sleeping';
  return 'no_change';
}

export interface DreamReward {
  star: number;
  bond: number;
  journalMessage: string;
}

/**
 * Guaranteed non-zero dream payout: 1 STAR + 1 bond floor. The caller may
 * boost above the floor (e.g. for Star-holder companions), but never below.
 */
export function computeDreamReward(boost: { starBonus?: boolean } = {}): DreamReward {
  return {
    star: DREAM_REWARD_STAR_FLOOR + (boost.starBonus ? 1 : 0),
    bond: DREAM_REWARD_BOND_FLOOR + (boost.starBonus ? 0.5 : 0),
    journalMessage: DREAM_JOURNAL_MESSAGE,
  };
}

export interface EarlyWakeOutcome {
  bondDelta: number;
  journalMessage: string;
}

/**
 * Outcome applied when a non-sleep action forces a sleeping companion
 * awake. Fixed −2 bond + a journal line; the route handler is responsible
 * for persisting both.
 */
export function computeEarlyWakeOutcome(): EarlyWakeOutcome {
  return {
    bondDelta: EARLY_WAKE_BOND_PENALTY,
    journalMessage: EARLY_WAKE_JOURNAL_MESSAGE,
  };
}
