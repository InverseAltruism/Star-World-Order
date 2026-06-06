import { describe, it, expect } from 'vitest';
import {
  applyInteractionStats,
  clampStat,
  computeEnergyAfterSleep,
  toSqlDate,
  SLEEP_BLOCK_THRESHOLD,
  SLEEP_AUTO_WAKE_THRESHOLD,
  SLEEP_ENERGY_PER_HOUR,
  SleepingCompanionError,
  type CompanionStatSnapshot,
} from '../companionStats';

const NOW = new Date('2026-04-26T12:00:00Z');

function snapshot(over: Partial<CompanionStatSnapshot> = {}): CompanionStatSnapshot {
  return {
    hunger: 50,
    happiness: 50,
    energy: 100,
    is_sleeping: 0,
    sleep_started_at: null,
    ...over,
  };
}

describe('clampStat', () => {
  it('clamps below 0', () => expect(clampStat(-5)).toBe(0));
  it('clamps above 100', () => expect(clampStat(150)).toBe(100));
  it('rounds to integer', () => expect(clampStat(42.6)).toBe(43));
  it('handles NaN as 0', () => expect(clampStat(Number.NaN)).toBe(0));
});

describe('computeEnergyAfterSleep', () => {
  it('returns same value if sleep_started_at is null', () => {
    expect(computeEnergyAfterSleep(40, null, NOW)).toBe(40);
  });

  it('adds SLEEP_ENERGY_PER_HOUR per elapsed hour', () => {
    const start = '2026-04-26 11:00:00'; // 1 hour earlier
    expect(computeEnergyAfterSleep(40, start, NOW)).toBe(40 + SLEEP_ENERGY_PER_HOUR);
  });

  it('caps at 100', () => {
    const start = '2026-04-26 09:00:00'; // 3 hours earlier
    expect(computeEnergyAfterSleep(40, start, NOW)).toBe(100);
  });

  it('handles fractional hours', () => {
    const start = '2026-04-26 11:30:00'; // 30 min earlier
    expect(computeEnergyAfterSleep(40, start, NOW)).toBe(40 + SLEEP_ENERGY_PER_HOUR * 0.5);
  });
});

describe('applyInteractionStats — feed', () => {
  it('adds +25 hunger', () => {
    const r = applyInteractionStats(snapshot({ hunger: 50 }), 'feed', NOW);
    expect(r.hunger).toBe(75);
    expect(r.happiness).toBe(50);
    expect(r.energy).toBe(100);
  });

  it('caps hunger at 100', () => {
    const r = applyInteractionStats(snapshot({ hunger: 90 }), 'feed', NOW);
    expect(r.hunger).toBe(100);
  });

  it('does not touch happiness or energy', () => {
    const r = applyInteractionStats(snapshot({ hunger: 0, happiness: 30, energy: 50 }), 'feed', NOW);
    expect(r.happiness).toBe(30);
    expect(r.energy).toBe(50);
  });
});

describe('applyInteractionStats — pet', () => {
  it('adds +15 happiness', () => {
    const r = applyInteractionStats(snapshot({ happiness: 40 }), 'pet', NOW);
    expect(r.happiness).toBe(55);
  });

  it('caps happiness at 100', () => {
    const r = applyInteractionStats(snapshot({ happiness: 95 }), 'pet', NOW);
    expect(r.happiness).toBe(100);
  });
});

describe('applyInteractionStats — talk', () => {
  it('adds +8 happiness', () => {
    const r = applyInteractionStats(snapshot({ happiness: 50 }), 'talk', NOW);
    expect(r.happiness).toBe(58);
  });

  it('caps happiness at 100', () => {
    const r = applyInteractionStats(snapshot({ happiness: 99 }), 'talk', NOW);
    expect(r.happiness).toBe(100);
  });
});

describe('applyInteractionStats — play', () => {
  it('+20 happiness, −10 energy, −10 hunger', () => {
    const r = applyInteractionStats(snapshot({ happiness: 30, energy: 90, hunger: 50 }), 'play', NOW);
    expect(r.happiness).toBe(50);
    expect(r.energy).toBe(80);
    expect(r.hunger).toBe(40);
  });

  it('clamps energy at 0', () => {
    const r = applyInteractionStats(snapshot({ energy: 5 }), 'play', NOW);
    expect(r.energy).toBe(0);
  });

  it('clamps hunger at 0', () => {
    const r = applyInteractionStats(snapshot({ hunger: 3 }), 'play', NOW);
    expect(r.hunger).toBe(0);
  });

  it('clamps happiness at 100', () => {
    const r = applyInteractionStats(snapshot({ happiness: 95 }), 'play', NOW);
    expect(r.happiness).toBe(100);
  });
});

describe('applyInteractionStats — sleep', () => {
  it('sets is_sleeping=1 and stamps sleep_started_at when starting fresh', () => {
    const r = applyInteractionStats(snapshot({ energy: 40, is_sleeping: 0 }), 'sleep', NOW);
    expect(r.is_sleeping).toBe(1);
    expect(r.sleep_started_at).toBe(toSqlDate(NOW));
    expect(r.energy).toBe(40); // no immediate recovery on the start tick
    expect(r.woke_up).toBe(false);
  });

  it('refreshes energy when called while already sleeping', () => {
    const startedAt = '2026-04-26 11:00:00'; // 1 hour earlier
    const r = applyInteractionStats(
      snapshot({ energy: 30, is_sleeping: 1, sleep_started_at: startedAt }),
      'sleep',
      NOW,
    );
    expect(r.energy).toBe(30 + SLEEP_ENERGY_PER_HOUR);
    expect(r.is_sleeping).toBe(1);
  });

  it('auto-wakes at SLEEP_AUTO_WAKE_THRESHOLD', () => {
    const startedAt = '2026-04-26 09:00:00'; // 3 hours earlier
    const r = applyInteractionStats(
      snapshot({ energy: 40, is_sleeping: 1, sleep_started_at: startedAt }),
      'sleep',
      NOW,
    );
    expect(r.energy).toBe(SLEEP_AUTO_WAKE_THRESHOLD);
    expect(r.is_sleeping).toBe(0);
    expect(r.sleep_started_at).toBeNull();
    expect(r.woke_up).toBe(true);
  });

  it('does not change hunger or happiness while sleeping', () => {
    const r = applyInteractionStats(snapshot({ hunger: 30, happiness: 60 }), 'sleep', NOW);
    expect(r.hunger).toBe(30);
    expect(r.happiness).toBe(60);
  });
});

describe('applyInteractionStats — sleep blocking', () => {
  it('blocks feed while energy < SLEEP_BLOCK_THRESHOLD', () => {
    const startedAt = '2026-04-26 11:50:00'; // 10 min earlier → +10 energy
    expect(() => applyInteractionStats(
      snapshot({ energy: 20, is_sleeping: 1, sleep_started_at: startedAt }),
      'feed',
      NOW,
    )).toThrow(SleepingCompanionError);
  });

  it('blocks pet while energy < threshold', () => {
    expect(() => applyInteractionStats(
      snapshot({ energy: 50, is_sleeping: 1, sleep_started_at: toSqlDate(NOW) }),
      'pet',
      NOW,
    )).toThrow(/sleeping/i);
  });

  it('blocks play while energy < threshold', () => {
    expect(() => applyInteractionStats(
      snapshot({ energy: 50, is_sleeping: 1, sleep_started_at: toSqlDate(NOW) }),
      'play',
      NOW,
    )).toThrow(SleepingCompanionError);
  });

  it('wakes companion and applies action when energy >= threshold', () => {
    const startedAt = '2026-04-26 11:00:00'; // +60 energy → should hit 80 from 20
    const r = applyInteractionStats(
      snapshot({ energy: 20, hunger: 50, is_sleeping: 1, sleep_started_at: startedAt }),
      'feed',
      NOW,
    );
    expect(r.is_sleeping).toBe(0);
    expect(r.sleep_started_at).toBeNull();
    expect(r.hunger).toBe(75); // +25 from feed
    expect(r.woke_up).toBe(true);
    expect(r.energy).toBe(80);
  });

  it('SLEEP_BLOCK_THRESHOLD constant matches expected value (80)', () => {
    expect(SLEEP_BLOCK_THRESHOLD).toBe(80);
  });
});
