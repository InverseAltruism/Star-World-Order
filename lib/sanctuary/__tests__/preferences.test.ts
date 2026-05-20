// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  preferenceProfile,
  preferenceFor,
  computeBondDelta,
  isNeedTargeted,
  preferenceClueRevealed,
  PREFERENCE_BOND_MULTIPLIER,
  PREFERENCE_CLUE_REVEAL_N,
  NEED_BOOST_MULTIPLIER,
  NEED_STATE_THRESHOLD,
  type PreferenceLevel,
} from '../preferences';
import type { CompanionStatAction } from '../companionStats';

// ---------------------------------------------------------------------------
// Determinism + per-Skrumpey divergence (acceptance criterion a)
// ---------------------------------------------------------------------------

describe('preferenceProfile — determinism', () => {
  it('returns the same profile on every call for the same token id', () => {
    const a = preferenceProfile(42);
    const b = preferenceProfile(42);
    expect(a).toEqual(b);
  });

  it('exposes one of each preference level across the five actions', () => {
    const profile = preferenceProfile(7);
    const levels = Object.values(profile).sort();
    expect(levels).toEqual(['disliked', 'hated', 'liked', 'loved', 'neutral']);
    expect(Object.keys(profile).sort()).toEqual(
      (['feed', 'pet', 'play', 'sleep', 'talk'] as CompanionStatAction[]).sort(),
    );
  });

  it('two Skrumpey on the same wallet have different profiles (fixture)', () => {
    // Acceptance (a): pick two concrete token ids that any wallet might hold
    // and assert their profiles diverge — i.e., the bond outcome of any
    // given action is not identical across Skrumpey on that wallet.
    const skrumpeyA = preferenceProfile(101);
    const skrumpeyB = preferenceProfile(202);
    expect(skrumpeyA).not.toEqual(skrumpeyB);
    // Stronger: at least one action's preference must differ — otherwise
    // bond deltas would coincide and the personality system is invisible.
    const diverged = (['feed', 'pet', 'talk', 'play', 'sleep'] as CompanionStatAction[]).some(
      (a) => skrumpeyA[a] !== skrumpeyB[a],
    );
    expect(diverged).toBe(true);
  });

  it('frozen profile object cannot be mutated by accident', () => {
    const profile = preferenceProfile(99);
    expect(() => {
      (profile as Record<string, PreferenceLevel>).feed = 'loved';
    }).toThrow();
  });

  it('handles tokenId=0 without producing a degenerate (all-same) profile', () => {
    const profile = preferenceProfile(0);
    const levels = Object.values(profile).sort();
    expect(levels).toEqual(['disliked', 'hated', 'liked', 'loved', 'neutral']);
  });

  it('preferenceFor matches preferenceProfile lookup', () => {
    const profile = preferenceProfile(55);
    for (const action of ['feed', 'pet', 'talk', 'play', 'sleep'] as CompanionStatAction[]) {
      expect(preferenceFor(55, action)).toBe(profile[action]);
    }
  });
});

// ---------------------------------------------------------------------------
// Bond delta math (acceptance criteria b + c)
// ---------------------------------------------------------------------------

describe('computeBondDelta — preference multiplier contract', () => {
  it('loved bond delta is exactly 4× neutral baseline (acceptance b)', () => {
    const baseline = 0.5;
    const neutral = computeBondDelta({ baseline, preference: 'neutral' });
    const loved = computeBondDelta({ baseline, preference: 'loved' });
    expect(neutral).toBeCloseTo(baseline);
    expect(loved).toBeCloseTo(neutral * 4);
  });

  it('hated action subtracts bond (acceptance c)', () => {
    const delta = computeBondDelta({ baseline: 0.5, preference: 'hated' });
    expect(delta).toBeLessThan(0);
  });

  it('disliked action gives zero bond — flat, not negative', () => {
    const delta = computeBondDelta({ baseline: 0.5, preference: 'disliked' });
    expect(delta).toBe(0);
  });

  it('liked action is between neutral and loved (2× baseline)', () => {
    const baseline = 0.5;
    expect(computeBondDelta({ baseline, preference: 'liked' })).toBeCloseTo(baseline * 2);
  });

  it('need boost multiplies on top of the preference multiplier', () => {
    const baseline = 0.5;
    const lovedFlat = computeBondDelta({ baseline, preference: 'loved' });
    const lovedHungry = computeBondDelta({ baseline, preference: 'loved', needBoosted: true });
    expect(lovedHungry).toBeCloseTo(lovedFlat * NEED_BOOST_MULTIPLIER);
  });

  it('need boost on a hated action makes it WORSE, not better', () => {
    const baseline = 0.5;
    const hatedFlat = computeBondDelta({ baseline, preference: 'hated' });
    const hatedHungry = computeBondDelta({ baseline, preference: 'hated', needBoosted: true });
    expect(hatedHungry).toBeLessThan(hatedFlat);
  });

  it('exposes the canonical multipliers for downstream wiring', () => {
    expect(PREFERENCE_BOND_MULTIPLIER.loved).toBe(4);
    expect(PREFERENCE_BOND_MULTIPLIER.neutral).toBe(1);
    expect(PREFERENCE_BOND_MULTIPLIER.hated).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// Need-state targeting
// ---------------------------------------------------------------------------

describe('isNeedTargeted', () => {
  const full = { hunger: 80, happiness: 80, energy: 80 };
  const hungry = { hunger: 10, happiness: 80, energy: 80 };
  const lonely = { hunger: 80, happiness: 10, energy: 80 };
  const tired = { hunger: 80, happiness: 80, energy: 10 };

  it('feed boost fires when hunger is low', () => {
    expect(isNeedTargeted('feed', hungry)).toBe(true);
    expect(isNeedTargeted('feed', full)).toBe(false);
  });

  it('pet/talk/play boost fires when happiness is low', () => {
    expect(isNeedTargeted('pet', lonely)).toBe(true);
    expect(isNeedTargeted('talk', lonely)).toBe(true);
    expect(isNeedTargeted('play', lonely)).toBe(true);
    expect(isNeedTargeted('pet', full)).toBe(false);
  });

  it('sleep boost fires when energy is low', () => {
    expect(isNeedTargeted('sleep', tired)).toBe(true);
    expect(isNeedTargeted('sleep', full)).toBe(false);
  });

  it('threshold edge — value exactly at threshold counts as in-need', () => {
    expect(isNeedTargeted('feed', { hunger: NEED_STATE_THRESHOLD, happiness: 80, energy: 80 })).toBe(true);
    expect(isNeedTargeted('feed', { hunger: NEED_STATE_THRESHOLD + 1, happiness: 80, energy: 80 })).toBe(false);
  });

  it('null / undefined / NaN stats do not boost', () => {
    expect(isNeedTargeted('feed', { hunger: null, happiness: 80, energy: 80 })).toBe(false);
    expect(isNeedTargeted('feed', { hunger: undefined, happiness: 80, energy: 80 })).toBe(false);
    expect(isNeedTargeted('feed', { hunger: NaN, happiness: 80, energy: 80 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Journal clue reveal (acceptance criterion d — constant + N−1 / N tests)
// ---------------------------------------------------------------------------

describe('preferenceClueRevealed', () => {
  it('exposes the canonical reveal threshold as a constant', () => {
    expect(PREFERENCE_CLUE_REVEAL_N).toBe(3);
  });

  it('stays hidden at N−1 matched interactions (acceptance d)', () => {
    expect(preferenceClueRevealed(PREFERENCE_CLUE_REVEAL_N - 1)).toBe(false);
  });

  it('reveals at exactly N matched interactions (acceptance d)', () => {
    expect(preferenceClueRevealed(PREFERENCE_CLUE_REVEAL_N)).toBe(true);
  });

  it('stays revealed for counts above N', () => {
    expect(preferenceClueRevealed(PREFERENCE_CLUE_REVEAL_N + 5)).toBe(true);
  });

  it('treats non-finite counts as not-yet-revealed (safety)', () => {
    expect(preferenceClueRevealed(NaN)).toBe(false);
    expect(preferenceClueRevealed(Infinity)).toBe(false);
    expect(preferenceClueRevealed(-Infinity)).toBe(false);
  });
});
