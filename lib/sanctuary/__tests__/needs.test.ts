// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  alertIcon,
  describeNeeds,
  lowStats,
  newlyCrossed,
  NEED_ALERT_THRESHOLD,
  type NeedKey,
  type NeedStats,
} from '../needs';

const balanced = (): NeedStats => ({ hunger: 80, happiness: 80, energy: 80 });

describe('lowStats', () => {
  it('returns empty when every stat is at or above threshold', () => {
    expect(lowStats(balanced())).toEqual([]);
    expect(lowStats({ hunger: 30, happiness: 30, energy: 30 })).toEqual([]);
  });

  it('returns the keys strictly below threshold in canonical order', () => {
    expect(
      lowStats({ hunger: 10, happiness: 80, energy: 80 }),
    ).toEqual(['hunger']);
    expect(
      lowStats({ hunger: 80, happiness: 5, energy: 80 }),
    ).toEqual(['happiness']);
    expect(
      lowStats({ hunger: 80, happiness: 80, energy: 1 }),
    ).toEqual(['energy']);
    expect(
      lowStats({ hunger: 5, happiness: 5, energy: 5 }),
    ).toEqual(['hunger', 'happiness', 'energy']);
  });

  it('skips null/undefined stats (legacy companions without vitality)', () => {
    expect(
      lowStats({ hunger: null, happiness: undefined, energy: 5 }),
    ).toEqual(['energy']);
    expect(
      lowStats({ hunger: null, happiness: null, energy: null }),
    ).toEqual([]);
  });

  it('honors a custom threshold override', () => {
    expect(lowStats({ hunger: 50, happiness: 50, energy: 50 }, 60)).toEqual([
      'hunger',
      'happiness',
      'energy',
    ]);
  });

  it('uses NEED_ALERT_THRESHOLD = 30 by default', () => {
    expect(NEED_ALERT_THRESHOLD).toBe(30);
    expect(lowStats({ hunger: 29, happiness: 80, energy: 80 })).toEqual([
      'hunger',
    ]);
    expect(lowStats({ hunger: 30, happiness: 80, energy: 80 })).toEqual([]);
  });
});

describe('newlyCrossed', () => {
  it('returns no crossings when prev is null (initial observation)', () => {
    expect(
      newlyCrossed(null, { hunger: 5, happiness: 5, energy: 5 }),
    ).toEqual([]);
    expect(
      newlyCrossed(undefined, { hunger: 5, happiness: 5, energy: 5 }),
    ).toEqual([]);
  });

  it('reports stats that transitioned ≥threshold → <threshold', () => {
    const prev: NeedStats = { hunger: 50, happiness: 50, energy: 50 };
    const next: NeedStats = { hunger: 10, happiness: 50, energy: 50 };
    expect(newlyCrossed(prev, next)).toEqual(['hunger']);
  });

  it('does NOT refire while a stat stays below threshold', () => {
    const prev: NeedStats = { hunger: 20, happiness: 50, energy: 50 };
    const next: NeedStats = { hunger: 5, happiness: 50, energy: 50 };
    // hunger was already low — same cross, no new fire.
    expect(newlyCrossed(prev, next)).toEqual([]);
  });

  it('refires after a stat recovers and drops again', () => {
    const low: NeedStats = { hunger: 10, happiness: 50, energy: 50 };
    const recovered: NeedStats = { hunger: 80, happiness: 50, energy: 50 };
    const lowAgain: NeedStats = { hunger: 10, happiness: 50, energy: 50 };
    expect(newlyCrossed(low, recovered)).toEqual([]);
    expect(newlyCrossed(recovered, lowAgain)).toEqual(['hunger']);
  });

  it('reports independent crossings per stat', () => {
    const prev: NeedStats = { hunger: 50, happiness: 50, energy: 50 };
    const next: NeedStats = { hunger: 5, happiness: 5, energy: 50 };
    expect(newlyCrossed(prev, next).sort()).toEqual(
      (['hunger', 'happiness'] as NeedKey[]).sort(),
    );
  });
});

describe('describeNeeds', () => {
  it('returns empty string when nothing is low', () => {
    expect(describeNeeds(balanced())).toBe('');
  });

  it('lists each low stat with its action hint', () => {
    const text = describeNeeds({ hunger: 5, happiness: 5, energy: 5 });
    expect(text).toContain('Hungry');
    expect(text).toContain('Lonely');
    expect(text).toContain('Sleepy');
    expect(text).toContain('feed');
    expect(text).toContain('talk');
    expect(text).toContain('rest');
  });

  it('omits non-low stats from the description', () => {
    const text = describeNeeds({ hunger: 5, happiness: 80, energy: 80 });
    expect(text).toContain('Hungry');
    expect(text).not.toContain('Lonely');
    expect(text).not.toContain('Sleepy');
  });
});

describe('alertIcon', () => {
  it('returns empty string when no stats are low', () => {
    expect(alertIcon([])).toBe('');
  });

  it('returns a stat-specific icon when exactly one stat is low', () => {
    const oneIcon = alertIcon(['hunger']);
    expect(oneIcon).toBeTruthy();
    expect(oneIcon).not.toBe('\u{26A0}\u{FE0F}');
  });

  it('collapses to the generic warning glyph when multiple stats are low', () => {
    expect(alertIcon(['hunger', 'happiness'])).toBe('\u{26A0}\u{FE0F}');
    expect(alertIcon(['hunger', 'happiness', 'energy'])).toBe('\u{26A0}\u{FE0F}');
  });
});
