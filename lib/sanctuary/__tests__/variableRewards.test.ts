// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  rollVariableReward,
  shouldFireBonusBadge,
  makeSeededRng,
  DEFAULT_VARIABLE_REWARD_CONFIG,
  type VariableRewardOutcome,
} from '../variableRewards';

// ---------------------------------------------------------------------------
// Acceptance (a) — 1000-simulation distribution lands within ±0.5% of the
// configured probabilities. This is the contract the design doc commits to.
// ---------------------------------------------------------------------------

describe('rollVariableReward — distribution', () => {
  it('matches configured probabilities within ±0.5% over 100k rolls', () => {
    // We use 100k rolls (not 1k) so the ±0.5% bound on `rareTrinketChance`
    // (default 0.75%) is statistically tight — a 1k sample would have ~2.7%
    // standard error for a 0.75% Bernoulli, which would flake. 100k pins the
    // standard error down to ~0.027%, comfortably inside ±0.5%.
    const rng = makeSeededRng(0xfeedface);
    const N = 100_000;
    let starHits = 0;
    let trinketHits = 0;
    let floorHits = 0;
    for (let i = 0; i < N; i++) {
      const out = rollVariableReward({ action: 'feed', floorBond: 0.5, rng });
      if (out.tier === 'bonus_star') starHits++;
      else if (out.tier === 'rare_trinket') trinketHits++;
      else floorHits++;
    }
    const starRate = starHits / N;
    const trinketRate = trinketHits / N;
    const floorRate = floorHits / N;
    // Adjusted expected rates: the trinket branch is checked first, so the
    // star branch only fires on the (1 - trinketChance) fraction of rolls
    // where the trinket did NOT hit.
    const expectedTrinket = DEFAULT_VARIABLE_REWARD_CONFIG.rareTrinketChance;
    const expectedStar =
      DEFAULT_VARIABLE_REWARD_CONFIG.bonusStarChance *
      (1 - DEFAULT_VARIABLE_REWARD_CONFIG.rareTrinketChance);
    const expectedFloor = 1 - expectedTrinket - expectedStar;
    expect(Math.abs(trinketRate - expectedTrinket)).toBeLessThan(0.005);
    expect(Math.abs(starRate - expectedStar)).toBeLessThan(0.005);
    expect(Math.abs(floorRate - expectedFloor)).toBeLessThan(0.005);
  });

  it('1000-sim quick-check stays within ±5% — coarse smoke test', () => {
    // Per the task wording ("1000-simulation distribution within ±0.5%"),
    // exercise a 1k loop with a relaxed bound so the asymptotic shape is at
    // least visible at the lower sample size. The tight bound lives in the
    // 100k test above.
    const rng = makeSeededRng(0xc0ffee);
    let starHits = 0;
    for (let i = 0; i < 1000; i++) {
      const out = rollVariableReward({ action: 'pet', floorBond: 0.3, rng });
      if (out.tier === 'bonus_star') starHits++;
    }
    const starRate = starHits / 1000;
    const expectedStar =
      DEFAULT_VARIABLE_REWARD_CONFIG.bonusStarChance *
      (1 - DEFAULT_VARIABLE_REWARD_CONFIG.rareTrinketChance);
    expect(Math.abs(starRate - expectedStar)).toBeLessThan(0.05);
  });
});

// ---------------------------------------------------------------------------
// Acceptance (b) — bonus badge fires when a bonus is rolled.
// ---------------------------------------------------------------------------

describe('rollVariableReward — bonus badge', () => {
  it('fires the bonus badge when bonus_star is rolled', () => {
    // Configure the roll to land on bonus_star deterministically: force the
    // trinket check to fail (roll well above trinketChance) and the star
    // check to succeed (roll below bonusStarChance).
    const rolls = [0.99, 0.001, 0.5]; // trinket, star, amount
    let i = 0;
    const rng = () => rolls[i++ % rolls.length];
    const out = rollVariableReward({ action: 'feed', floorBond: 0.5, rng });
    expect(out.tier).toBe('bonus_star');
    expect(out.bonusStar).toBeGreaterThanOrEqual(1);
    expect(out.bonusStar).toBeLessThanOrEqual(3);
    expect(out.badgeLabel).toMatch(/STAR/);
    expect(shouldFireBonusBadge(out)).toBe(true);
  });

  it('fires the bonus badge with a rare_trinket label when trinket hits', () => {
    const rolls = [0.0001, 0.5, 0.5];
    let i = 0;
    const rng = () => rolls[i++ % rolls.length];
    const out = rollVariableReward({ action: 'play', floorBond: 0.4, rng });
    expect(out.tier).toBe('rare_trinket');
    expect(out.rareTrinket).toBe(true);
    expect(out.bonusStar).toBe(0);
    expect(out.badgeLabel).toMatch(/trinket/i);
    expect(shouldFireBonusBadge(out)).toBe(true);
  });

  it('bonus STAR payout stays inside the configured min/max', () => {
    // Sweep every possible amount roll and confirm the payout is clamped to
    // the [bonusStarMin, bonusStarMax] interval.
    const samples = [0, 0.25, 0.5, 0.75, 0.9999];
    for (const amount of samples) {
      const rolls = [0.99, 0.0001, amount];
      let i = 0;
      const rng = () => rolls[i++ % rolls.length];
      const out = rollVariableReward({ action: 'feed', floorBond: 0.5, rng });
      expect(out.bonusStar).toBeGreaterThanOrEqual(
        DEFAULT_VARIABLE_REWARD_CONFIG.bonusStarMin,
      );
      expect(out.bonusStar).toBeLessThanOrEqual(
        DEFAULT_VARIABLE_REWARD_CONFIG.bonusStarMax,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Acceptance (c) — zero-bonus path still returns the floor unchanged.
// ---------------------------------------------------------------------------

describe('rollVariableReward — floor invariant', () => {
  it('returns the floor bond untouched when neither bonus fires', () => {
    // Roll values that pass both threshold checks → tier 'floor'.
    const rolls = [0.99, 0.99, 0.5];
    let i = 0;
    const rng = () => rolls[i++ % rolls.length];
    const out = rollVariableReward({ action: 'feed', floorBond: 0.5, rng });
    expect(out.tier).toBe('floor');
    expect(out.bond).toBe(0.5);
    expect(out.bonusStar).toBe(0);
    expect(out.rareTrinket).toBe(false);
    expect(out.badgeLabel).toBeNull();
    expect(shouldFireBonusBadge(out)).toBe(false);
  });

  it('floor bond passes through verbatim across negative / zero / positive', () => {
    // The variable layer never mutates the floor. Cover a hated-preference
    // (-1×) outcome, a sleep (0×) outcome, and a loved-preference (4×)
    // outcome — all three should round-trip untouched on the floor path.
    const rolls = [0.99, 0.99, 0.5];
    let i = 0;
    const rng = () => rolls[i++ % rolls.length];
    const samples: Array<{ action: 'feed' | 'pet' | 'talk' | 'play' | 'sleep'; floor: number }> = [
      { action: 'feed', floor: -0.5 },
      { action: 'sleep', floor: 0 },
      { action: 'pet', floor: 1.2 },
    ];
    for (const s of samples) {
      const out = rollVariableReward({ action: s.action, floorBond: s.floor, rng });
      expect(out.tier).toBe('floor');
      expect(out.bond).toBe(s.floor);
    }
  });

  it('even on a bonus roll, bond equals the floor (variable layer never touches base)', () => {
    const rolls = [0.99, 0.001, 0.5];
    let i = 0;
    const rng = () => rolls[i++ % rolls.length];
    const out: VariableRewardOutcome = rollVariableReward({
      action: 'feed',
      floorBond: 2.0,
      rng,
    });
    expect(out.tier).toBe('bonus_star');
    expect(out.bond).toBe(2.0); // floor preserved exactly
  });
});

// ---------------------------------------------------------------------------
// Determinism — fixed seed must replay identically. The Playwright E2E relies
// on this so a 50-interaction run is reproducible from a single integer.
// ---------------------------------------------------------------------------

describe('makeSeededRng + rollVariableReward — determinism', () => {
  it('same seed yields the same outcome sequence', () => {
    const seed = 1234;
    const runA: string[] = [];
    const runB: string[] = [];
    const rngA = makeSeededRng(seed);
    const rngB = makeSeededRng(seed);
    for (let i = 0; i < 50; i++) {
      runA.push(rollVariableReward({ action: 'feed', floorBond: 0.5, rng: rngA }).tier);
      runB.push(rollVariableReward({ action: 'feed', floorBond: 0.5, rng: rngB }).tier);
    }
    expect(runA).toEqual(runB);
  });

  it('over 50 fixed-seed rolls, the bonus badge fires at least once', () => {
    // Mirrors the Playwright acceptance: with the chosen seed, the 50-step
    // run is guaranteed to contain at least one bonus.
    const rng = makeSeededRng(0xb0d1ce);
    let bonusCount = 0;
    for (let i = 0; i < 50; i++) {
      const out = rollVariableReward({ action: 'feed', floorBond: 0.5, rng });
      if (shouldFireBonusBadge(out)) bonusCount++;
    }
    expect(bonusCount).toBeGreaterThanOrEqual(1);
  });
});
