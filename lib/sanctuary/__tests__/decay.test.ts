import { describe, it, expect } from 'vitest';
import {
  decayStats,
  computeNeeds,
  DECAY_RATES_PER_HOUR,
  DEFAULT_STATS,
  NEED_THRESHOLD,
  NEED_LABELS,
  type DecayInput,
} from '../decay';

const NOW = new Date('2026-04-26T12:00:00Z');

function input(over: Partial<DecayInput> = {}): DecayInput {
  return {
    hunger: 100,
    happiness: 100,
    energy: 100,
    stats_updated_at: '2026-04-26 12:00:00',
    is_sleeping: 0,
    ...over,
  };
}

describe('DECAY_RATES_PER_HOUR', () => {
  it('exposes positive per-hour rates for all three stats', () => {
    expect(DECAY_RATES_PER_HOUR.hunger).toBeGreaterThan(0);
    expect(DECAY_RATES_PER_HOUR.happiness).toBeGreaterThan(0);
    expect(DECAY_RATES_PER_HOUR.energy).toBeGreaterThan(0);
  });
});

describe('DEFAULT_STATS', () => {
  it('matches the V2.5 spec defaults (80/80/80)', () => {
    expect(DEFAULT_STATS).toEqual({ hunger: 80, happiness: 80, energy: 80 });
  });
});

describe('decayStats', () => {
  it('returns clamped originals when stats_updated_at is null', () => {
    const r = decayStats(input({ stats_updated_at: null, hunger: 75, happiness: 60, energy: 40 }), NOW);
    expect(r).toEqual({ hunger: 75, happiness: 60, energy: 40 });
  });

  it('returns clamped originals when stats_updated_at is unparseable', () => {
    const r = decayStats(input({ stats_updated_at: 'garbage', hunger: 50 }), NOW);
    expect(r.hunger).toBe(50);
  });

  it('returns clamped originals when now is earlier than the snapshot (clock-skew)', () => {
    const past = new Date('2026-04-26T08:00:00Z');
    const r = decayStats(input({ stats_updated_at: '2026-04-26 12:00:00', hunger: 70 }), past);
    expect(r.hunger).toBe(70);
  });

  it('decays each stat by its per-hour rate after 1 hour', () => {
    const start = '2026-04-26 11:00:00'; // 1h earlier
    const r = decayStats(input({ stats_updated_at: start }), NOW);
    expect(r.hunger).toBe(100 - DECAY_RATES_PER_HOUR.hunger);
    expect(r.happiness).toBe(100 - DECAY_RATES_PER_HOUR.happiness);
    expect(r.energy).toBe(100 - DECAY_RATES_PER_HOUR.energy);
  });

  it('handles fractional hours', () => {
    const start = '2026-04-26 11:30:00'; // 0.5h earlier
    const r = decayStats(input({ stats_updated_at: start, hunger: 50 }), NOW);
    // 50 - 0.5 * 2 = 49 (rounded)
    expect(r.hunger).toBe(50 - Math.round(DECAY_RATES_PER_HOUR.hunger * 0.5));
  });

  it('decays monotonically across N hours (never increases)', () => {
    let last = { hunger: 100, happiness: 100, energy: 100 };
    for (let h = 1; h <= 50; h++) {
      // Build a snapshot h hours before NOW
      const snapshotMs = NOW.getTime() - h * 3_600_000;
      const snapshot = new Date(snapshotMs).toISOString().replace('T', ' ').slice(0, 19);
      const r = decayStats(input({ stats_updated_at: snapshot }), NOW);
      expect(r.hunger).toBeLessThanOrEqual(last.hunger);
      expect(r.happiness).toBeLessThanOrEqual(last.happiness);
      expect(r.energy).toBeLessThanOrEqual(last.energy);
      last = r;
    }
  });

  it('clamps decay at 0 (never goes negative across many hours)', () => {
    // 1000 hours of decay from 100 must floor at 0 for each stat.
    const start = new Date(NOW.getTime() - 1000 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
    const r = decayStats(input({ stats_updated_at: start }), NOW);
    expect(r.hunger).toBe(0);
    expect(r.happiness).toBe(0);
    expect(r.energy).toBe(0);
  });

  it('clamps inputs at 100 even before applying decay', () => {
    const r = decayStats(input({ stats_updated_at: null, hunger: 250 }), NOW);
    expect(r.hunger).toBe(100);
  });

  it('suppresses energy decay while is_sleeping = 1', () => {
    const start = '2026-04-26 11:00:00'; // 1h earlier
    const r = decayStats(input({ stats_updated_at: start, is_sleeping: 1, energy: 60 }), NOW);
    expect(r.energy).toBe(60); // unchanged — sleep recovery handled elsewhere
    // Hunger and happiness still decay while sleeping.
    expect(r.hunger).toBeLessThan(100);
    expect(r.happiness).toBeLessThan(100);
  });

  it('returns deterministic values for a fixed clock', () => {
    const a = decayStats(input({ stats_updated_at: '2026-04-26 06:00:00' }), NOW);
    const b = decayStats(input({ stats_updated_at: '2026-04-26 06:00:00' }), NOW);
    expect(a).toEqual(b);
  });
});

describe('computeNeeds', () => {
  it('returns empty when all stats are above threshold', () => {
    expect(computeNeeds({ hunger: 80, happiness: 80, energy: 80 })).toEqual([]);
  });

  it('flags hungry when hunger < threshold', () => {
    expect(computeNeeds({ hunger: NEED_THRESHOLD - 1, happiness: 80, energy: 80 })).toEqual([NEED_LABELS.hunger]);
  });

  it('flags lonely when happiness < threshold', () => {
    expect(computeNeeds({ hunger: 80, happiness: NEED_THRESHOLD - 1, energy: 80 })).toEqual([NEED_LABELS.happiness]);
  });

  it('flags tired when energy < threshold', () => {
    expect(computeNeeds({ hunger: 80, happiness: 80, energy: NEED_THRESHOLD - 1 })).toEqual([NEED_LABELS.energy]);
  });

  it('preserves stable hunger→happiness→energy ordering when multiple needs fire', () => {
    expect(computeNeeds({ hunger: 5, happiness: 5, energy: 5 })).toEqual([
      NEED_LABELS.hunger,
      NEED_LABELS.happiness,
      NEED_LABELS.energy,
    ]);
  });

  it('does NOT flag a stat that is exactly at the threshold', () => {
    expect(computeNeeds({ hunger: NEED_THRESHOLD, happiness: NEED_THRESHOLD, energy: NEED_THRESHOLD })).toEqual([]);
  });
});
