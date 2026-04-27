// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  deriveMoodFromStats,
  resolveCompanionMood,
  statMoodToAnimationMood,
  HAPPY_STAT_THRESHOLD,
  LOW_STAT_THRESHOLD,
  type MoodStatInput,
  type StatMood,
} from '../mood';

const balanced = (): MoodStatInput => ({ hunger: 50, happiness: 50, energy: 50 });

describe('deriveMoodFromStats', () => {
  describe('sleeping branch', () => {
    it('returns "sleeping" when is_sleeping=1, regardless of stats', () => {
      expect(
        deriveMoodFromStats({ hunger: 0, happiness: 0, energy: 0, is_sleeping: 1 }),
      ).toBe('sleeping');
      expect(
        deriveMoodFromStats({ hunger: 100, happiness: 100, energy: 100, is_sleeping: 1 }),
      ).toBe('sleeping');
    });

    it('does not trigger when is_sleeping is 0, null, or undefined', () => {
      const stats = balanced();
      expect(deriveMoodFromStats({ ...stats, is_sleeping: 0 })).not.toBe('sleeping');
      expect(deriveMoodFromStats({ ...stats, is_sleeping: null })).not.toBe('sleeping');
      expect(deriveMoodFromStats(stats)).not.toBe('sleeping');
    });
  });

  describe('hungry branch', () => {
    it('returns "hungry" when hunger is the unique min and < 30', () => {
      expect(
        deriveMoodFromStats({ hunger: 10, happiness: 80, energy: 80 }),
      ).toBe('hungry');
    });

    it('respects the 30 cutoff (29 → hungry, 30 → not hungry)', () => {
      expect(
        deriveMoodFromStats({ hunger: 29, happiness: 80, energy: 80 }),
      ).toBe('hungry');
      // 30 is NOT < 30 so this falls through (and 30/80/80 is not "all ≥ 60" so → idle)
      expect(
        deriveMoodFromStats({ hunger: 30, happiness: 80, energy: 80 }),
      ).toBe('idle');
    });
  });

  describe('sleepy branch', () => {
    it('returns "sleepy" when energy is the unique min and < 30', () => {
      expect(
        deriveMoodFromStats({ hunger: 80, happiness: 80, energy: 10 }),
      ).toBe('sleepy');
    });
  });

  describe('lonely branch', () => {
    it('returns "lonely" when happiness is the unique min and < 30', () => {
      expect(
        deriveMoodFromStats({ hunger: 80, happiness: 10, energy: 80 }),
      ).toBe('lonely');
    });
  });

  describe('happy branch', () => {
    it('returns "happy" when ALL stats are ≥ 60', () => {
      expect(
        deriveMoodFromStats({ hunger: 60, happiness: 60, energy: 60 }),
      ).toBe('happy');
      expect(
        deriveMoodFromStats({ hunger: 100, happiness: 100, energy: 100 }),
      ).toBe('happy');
    });

    it('returns "idle" when at least one stat is below 60 (but none is critically low)', () => {
      expect(
        deriveMoodFromStats({ hunger: 59, happiness: 80, energy: 80 }),
      ).toBe('idle');
    });
  });

  describe('idle branch', () => {
    it('returns "idle" when stats are mediocre (no min < 30, not all ≥ 60)', () => {
      expect(
        deriveMoodFromStats({ hunger: 40, happiness: 40, energy: 40 }),
      ).toBe('idle');
      expect(
        deriveMoodFromStats({ hunger: 50, happiness: 30, energy: 50 }),
      ).toBe('idle');
    });
  });

  describe('tie-breaking', () => {
    it('prefers "hungry" over "sleepy" when hunger and energy are tied at the min', () => {
      expect(
        deriveMoodFromStats({ hunger: 10, happiness: 80, energy: 10 }),
      ).toBe('hungry');
    });

    it('prefers "sleepy" over "lonely" when energy and happiness are tied at the min', () => {
      expect(
        deriveMoodFromStats({ hunger: 80, happiness: 10, energy: 10 }),
      ).toBe('sleepy');
    });

    it('returns "hungry" when all three are tied at the min and < 30', () => {
      expect(
        deriveMoodFromStats({ hunger: 5, happiness: 5, energy: 5 }),
      ).toBe('hungry');
    });
  });

  describe('threshold constants', () => {
    it('exposes the documented thresholds so callers can stay in sync', () => {
      expect(LOW_STAT_THRESHOLD).toBe(30);
      expect(HAPPY_STAT_THRESHOLD).toBe(60);
    });
  });
});

describe('resolveCompanionMood', () => {
  it('uses derived mood when stats are populated (V2.4 companions)', () => {
    expect(
      resolveCompanionMood({ hunger: 100, happiness: 100, energy: 100 }, 'curious'),
    ).toBe('happy');
    expect(
      resolveCompanionMood({ hunger: 5, happiness: 80, energy: 80 }, 'happy'),
    ).toBe('hungry');
  });

  it('falls back to trait mood when stats are null (legacy companions)', () => {
    expect(resolveCompanionMood(null, 'calm')).toBe('calm');
    expect(resolveCompanionMood(undefined, 'curious')).toBe('curious');
  });

  it('returns null when neither stats nor a trait mood are available', () => {
    expect(resolveCompanionMood(null, null)).toBeNull();
    expect(resolveCompanionMood(undefined, undefined)).toBeNull();
  });

  it('falls back to trait mood when stats object is malformed (NaN values)', () => {
    expect(
      resolveCompanionMood(
        { hunger: NaN, happiness: 50, energy: 50 } as MoodStatInput,
        'happy',
      ),
    ).toBe('happy');
  });
});

describe('statMoodToAnimationMood', () => {
  it('maps every StatMood to a valid existing CompanionMood — no new art', () => {
    const mappings: Array<[StatMood, string]> = [
      ['sleeping', 'sleepy'],
      ['sleepy', 'sleepy'],
      ['hungry', 'curious'],
      ['lonely', 'calm'],
      ['happy', 'happy'],
      ['idle', 'idle'],
    ];
    for (const [statMood, expectedAnimation] of mappings) {
      expect(statMoodToAnimationMood(statMood)).toBe(expectedAnimation);
    }
  });
});
