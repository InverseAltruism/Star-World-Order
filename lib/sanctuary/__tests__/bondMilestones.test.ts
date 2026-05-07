// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  BOND_MILESTONES,
  bondMilestoneBanner,
  crossedBondMilestones,
  highestMilestone,
} from '../bondMilestones';

describe('crossedBondMilestones', () => {
  it('does not double-fire on identical bond scores', () => {
    expect(crossedBondMilestones(25, 25)).toEqual([]);
    expect(crossedBondMilestones(50, 50)).toEqual([]);
    expect(crossedBondMilestones(0, 0)).toEqual([]);
    expect(crossedBondMilestones(100, 100)).toEqual([]);
  });

  it('fires once on an upward crossing of a single threshold', () => {
    expect(crossedBondMilestones(24, 25)).toEqual([25]);
    expect(crossedBondMilestones(20, 30)).toEqual([25]);
    expect(crossedBondMilestones(49, 55)).toEqual([50]);
    expect(crossedBondMilestones(74, 80)).toEqual([75]);
    expect(crossedBondMilestones(99, 100)).toEqual([100]);
  });

  it('does not fire on downward movement', () => {
    expect(crossedBondMilestones(30, 20)).toEqual([]);
    expect(crossedBondMilestones(60, 40)).toEqual([]);
    expect(crossedBondMilestones(100, 0)).toEqual([]);
    expect(crossedBondMilestones(26, 24)).toEqual([]);
  });

  it('reports every threshold crossed in a single jump, sorted ascending', () => {
    expect(crossedBondMilestones(0, 100)).toEqual([25, 50, 75, 100]);
    expect(crossedBondMilestones(20, 60)).toEqual([25, 50]);
    expect(crossedBondMilestones(60, 90)).toEqual([75]);
    expect(crossedBondMilestones(40, 80)).toEqual([50, 75]);
  });

  it('treats null/undefined prev as a first observation (no crossings)', () => {
    expect(crossedBondMilestones(null, 30)).toEqual([]);
    expect(crossedBondMilestones(undefined, 90)).toEqual([]);
    expect(crossedBondMilestones(null, 100)).toEqual([]);
  });

  it('respects lastCelebrated to prevent re-fire after wobble', () => {
    // Score crossed 25 once already (lastCelebrated=25), then decayed to 23
    // and climbed back to 27 — we must NOT re-fire 25.
    expect(crossedBondMilestones(23, 27, 25)).toEqual([]);
    // But a brand-new threshold beyond lastCelebrated still fires.
    expect(crossedBondMilestones(40, 60, 25)).toEqual([50]);
    // lastCelebrated does not block higher thresholds in a big jump.
    expect(crossedBondMilestones(20, 80, 25)).toEqual([50, 75]);
  });

  it('clamps out-of-range / non-finite inputs safely', () => {
    expect(crossedBondMilestones(-10, 30)).toEqual([25]);
    expect(crossedBondMilestones(50, 200)).toEqual([75, 100]);
    expect(crossedBondMilestones(Number.NaN, 50)).toEqual([]);
    expect(crossedBondMilestones(50, Number.POSITIVE_INFINITY)).toEqual([]);
  });

  it('does not fire when next equals prev exactly at a threshold (no upward cross)', () => {
    // A score that lands ON a threshold from below DOES fire (24 -> 25).
    // A score that stays AT the threshold (25 -> 25) does NOT.
    expect(crossedBondMilestones(24, 25)).toEqual([25]);
    expect(crossedBondMilestones(25, 25)).toEqual([]);
    expect(crossedBondMilestones(25, 26)).toEqual([]);
  });
});

describe('highestMilestone', () => {
  it('returns null for an empty list', () => {
    expect(highestMilestone([])).toBeNull();
  });

  it('returns the largest milestone in the list', () => {
    expect(highestMilestone([25])).toBe(25);
    expect(highestMilestone([25, 50, 75])).toBe(75);
    expect(highestMilestone([100, 25])).toBe(100);
  });
});

describe('bondMilestoneBanner', () => {
  it('includes the companion name in every milestone banner', () => {
    for (const m of BOND_MILESTONES) {
      const text = bondMilestoneBanner(m, 'Pico');
      expect(text).toContain('Pico');
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it('falls back to a generic noun when name is empty', () => {
    expect(bondMilestoneBanner(25, '')).toContain('your companion');
    expect(bondMilestoneBanner(50, '   ')).toContain('your companion');
  });
});

describe('BOND_MILESTONES contract', () => {
  it('is exactly [25, 50, 75, 100]', () => {
    expect([...BOND_MILESTONES]).toEqual([25, 50, 75, 100]);
  });
});
