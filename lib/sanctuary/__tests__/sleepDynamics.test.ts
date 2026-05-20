import { describe, it, expect } from 'vitest';
import {
  isCompanionTired,
  applyTiredBondMultiplier,
  classifySleepTransition,
  computeDreamReward,
  computeEarlyWakeOutcome,
  TIRED_THRESHOLD_HOURS,
  TIRED_BOND_MULTIPLIER,
  DREAM_REWARD_STAR_FLOOR,
  DREAM_REWARD_BOND_FLOOR,
  EARLY_WAKE_BOND_PENALTY,
  DREAM_JOURNAL_MESSAGE,
  EARLY_WAKE_JOURNAL_MESSAGE,
} from '../sleepDynamics';

const NOW = new Date('2026-05-20T12:00:00Z');

function hoursAgoSql(h: number, base: Date = NOW): string {
  const d = new Date(base.getTime() - h * 3_600_000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

describe('isCompanionTired — Tired gate after 24h no sleep', () => {
  it('returns false when last full sleep is < 24h ago', () => {
    expect(isCompanionTired(hoursAgoSql(23), NOW)).toBe(false);
  });

  it('returns true when last full sleep is ≥ 24h ago (Acceptance #1)', () => {
    expect(isCompanionTired(hoursAgoSql(24), NOW)).toBe(true);
    expect(isCompanionTired(hoursAgoSql(48), NOW)).toBe(true);
  });

  it('returns false when last_full_sleep_at is null (fresh companion)', () => {
    expect(isCompanionTired(null, NOW)).toBe(false);
  });

  it('returns false for unparseable timestamps', () => {
    expect(isCompanionTired('not-a-date', NOW)).toBe(false);
  });

  it('boundary exactly at 24h is Tired (inclusive)', () => {
    expect(isCompanionTired(hoursAgoSql(TIRED_THRESHOLD_HOURS), NOW)).toBe(true);
  });
});

describe('applyTiredBondMultiplier — Tired halves non-sleep bond', () => {
  it('halves bond for feed/pet/talk/play when Tired', () => {
    expect(applyTiredBondMultiplier(1.0, 'feed', true)).toBe(0.5);
    expect(applyTiredBondMultiplier(0.4, 'pet', true)).toBeCloseTo(0.2);
    expect(applyTiredBondMultiplier(0.3, 'talk', true)).toBeCloseTo(0.15);
    expect(applyTiredBondMultiplier(0.5, 'play', true)).toBe(0.25);
  });

  it('does not halve sleep action (already trying to rest)', () => {
    expect(applyTiredBondMultiplier(1.0, 'sleep', true)).toBe(1.0);
  });

  it('returns bond unchanged when not Tired', () => {
    expect(applyTiredBondMultiplier(1.0, 'feed', false)).toBe(1.0);
    expect(applyTiredBondMultiplier(0.3, 'talk', false)).toBe(0.3);
  });

  it('multiplier matches the published constant', () => {
    expect(TIRED_BOND_MULTIPLIER).toBe(0.5);
  });
});

describe('classifySleepTransition', () => {
  it('classifies awake → sleeping as started_sleep', () => {
    expect(classifySleepTransition({ wasSleeping: false, nowSleeping: true, action: 'sleep' }))
      .toBe('started_sleep');
  });

  it('classifies sleeping → awake on sleep action as full_cycle', () => {
    expect(classifySleepTransition({ wasSleeping: true, nowSleeping: false, action: 'sleep' }))
      .toBe('full_cycle');
  });

  it('classifies sleeping → awake on non-sleep action as early_wake', () => {
    expect(classifySleepTransition({ wasSleeping: true, nowSleeping: false, action: 'feed' }))
      .toBe('early_wake');
    expect(classifySleepTransition({ wasSleeping: true, nowSleeping: false, action: 'pet' }))
      .toBe('early_wake');
    expect(classifySleepTransition({ wasSleeping: true, nowSleeping: false, action: 'play' }))
      .toBe('early_wake');
  });

  it('classifies sleeping → sleeping as still_sleeping', () => {
    expect(classifySleepTransition({ wasSleeping: true, nowSleeping: true, action: 'sleep' }))
      .toBe('still_sleeping');
  });

  it('classifies awake → awake as no_change', () => {
    expect(classifySleepTransition({ wasSleeping: false, nowSleeping: false, action: 'feed' }))
      .toBe('no_change');
  });
});

describe('computeDreamReward — full cycle floor (Acceptance #2)', () => {
  it('grants the ≥ 1 STAR + 1 bond floor for the baseline case', () => {
    const reward = computeDreamReward();
    expect(reward.star).toBeGreaterThanOrEqual(DREAM_REWARD_STAR_FLOOR);
    expect(reward.bond).toBeGreaterThanOrEqual(DREAM_REWARD_BOND_FLOOR);
    expect(reward.star).toBe(1);
    expect(reward.bond).toBe(1);
    expect(reward.journalMessage).toBe(DREAM_JOURNAL_MESSAGE);
  });

  it('boosts above the floor for Star-holder bonus', () => {
    const boosted = computeDreamReward({ starBonus: true });
    expect(boosted.star).toBeGreaterThan(DREAM_REWARD_STAR_FLOOR);
    expect(boosted.bond).toBeGreaterThan(DREAM_REWARD_BOND_FLOOR);
  });

  it('the floor itself is non-zero', () => {
    expect(DREAM_REWARD_STAR_FLOOR).toBeGreaterThan(0);
    expect(DREAM_REWARD_BOND_FLOOR).toBeGreaterThan(0);
  });
});

describe('computeEarlyWakeOutcome — fires −2 bond + journal (Acceptance #3)', () => {
  it('returns the −2 bond delta', () => {
    const outcome = computeEarlyWakeOutcome();
    expect(outcome.bondDelta).toBe(EARLY_WAKE_BOND_PENALTY);
    expect(outcome.bondDelta).toBe(-2);
  });

  it('returns a non-empty journal entry message', () => {
    const outcome = computeEarlyWakeOutcome();
    expect(outcome.journalMessage).toBe(EARLY_WAKE_JOURNAL_MESSAGE);
    expect(outcome.journalMessage.length).toBeGreaterThan(0);
  });
});

describe('end-to-end scenario — Tired → full cycle clears Tired', () => {
  it('Tired companion completes full cycle → reward fires + new last_full_sleep_at clears Tired', () => {
    const oldSleep = hoursAgoSql(30);
    expect(isCompanionTired(oldSleep, NOW)).toBe(true);

    // After a full cycle, route handler stamps last_full_sleep_at = now.
    const justWoke = hoursAgoSql(0, NOW);
    expect(isCompanionTired(justWoke, NOW)).toBe(false);

    const reward = computeDreamReward();
    expect(reward.star + reward.bond).toBeGreaterThanOrEqual(2);
  });
});
