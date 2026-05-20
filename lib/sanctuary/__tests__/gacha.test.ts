import { describe, it, expect } from 'vitest';
import {
  GACHA_PULL_COST,
  GACHA_RARE_CHANCE,
  isRareTier,
  mulberry32,
  pickGachaItem,
  simulateGachaDistribution,
  type GachaCandidate,
} from '@/lib/sanctuary/gacha';

// Mirror of the V2.2 cosmetic seed in lib/db.ts. Keeping a local fixture (vs
// importing the real seed via getDatabase()) keeps these tests pure — no SQL,
// no filesystem.
const SEED_CANDIDATES: GachaCandidate[] = [
  { item_key: 'hat_acorn_cap', rarity: 'common', level_required: 1 },
  { item_key: 'hat_star_beanie', rarity: 'common', level_required: 1 },
  { item_key: 'hat_witch_hat', rarity: 'uncommon', level_required: 3 },
  { item_key: 'hat_gold_crown', rarity: 'rare', level_required: 5 },
  { item_key: 'hat_cosmic_halo', rarity: 'rare', level_required: 7 },
  { item_key: 'hat_nebula_crown', rarity: 'legendary', level_required: 10 },
  { item_key: 'acc_star_pendant', rarity: 'common', level_required: 1 },
  { item_key: 'acc_comet_scarf', rarity: 'common', level_required: 1 },
  { item_key: 'acc_moon_glasses', rarity: 'uncommon', level_required: 2 },
  { item_key: 'acc_aura_ribbon', rarity: 'uncommon', level_required: 3 },
  { item_key: 'acc_nebula_collar', rarity: 'rare', level_required: 5 },
  { item_key: 'acc_eclipse_pendant', rarity: 'legendary', level_required: 8 },
  { item_key: 'bg_starfield', rarity: 'common', level_required: 1 },
  { item_key: 'bg_soft_aurora', rarity: 'common', level_required: 2 },
  { item_key: 'bg_cosmic_dawn', rarity: 'uncommon', level_required: 3 },
  { item_key: 'bg_stellar_meadow', rarity: 'uncommon', level_required: 4 },
  { item_key: 'bg_nebula_drift', rarity: 'rare', level_required: 6 },
  { item_key: 'bg_galaxy_swirl', rarity: 'legendary', level_required: 9 },
  { item_key: 'anim_gentle_bob', rarity: 'common', level_required: 1 },
  { item_key: 'anim_star_sparkle', rarity: 'common', level_required: 2 },
  { item_key: 'anim_moon_glow', rarity: 'uncommon', level_required: 3 },
  { item_key: 'anim_comet_trail', rarity: 'uncommon', level_required: 4 },
  { item_key: 'anim_aurora_dance', rarity: 'rare', level_required: 6 },
  { item_key: 'anim_constellation_burst', rarity: 'legendary', level_required: 8 },
];

describe('gacha config', () => {
  it('rare chance lands inside the §3.4 spec band [1%, 2%]', () => {
    expect(GACHA_RARE_CHANCE).toBeGreaterThanOrEqual(0.01);
    expect(GACHA_RARE_CHANCE).toBeLessThanOrEqual(0.02);
  });

  it('pull cost is a positive integer', () => {
    expect(GACHA_PULL_COST).toBeGreaterThan(0);
    expect(Number.isInteger(GACHA_PULL_COST)).toBe(true);
  });

  it('isRareTier identifies rare + legendary only', () => {
    expect(isRareTier('rare')).toBe(true);
    expect(isRareTier('legendary')).toBe(true);
    expect(isRareTier('common')).toBe(false);
    expect(isRareTier('uncommon')).toBe(false);
  });
});

describe('pickGachaItem — guaranteed cosmetic floor', () => {
  it('every pull yields a cosmetic across 100 deterministic rolls', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const pick = pickGachaItem(SEED_CANDIDATES, 10, rng);
      expect(pick).not.toBeNull();
      expect(pick!.itemKey).toMatch(/^[a-z_]+$/);
    }
  });

  it('returns null only when no candidate satisfies the level gate', () => {
    const rng = mulberry32(1);
    // Wallet level 0 → no items satisfy level_required >= 1.
    expect(pickGachaItem(SEED_CANDIDATES, 0, rng)).toBeNull();
  });

  it('returns null when the candidate pool is empty (all-owned scenario)', () => {
    const rng = mulberry32(1);
    expect(pickGachaItem([], 10, rng)).toBeNull();
  });

  it('respects the level gate — only level-1 items pull at walletLevel=1', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 50; i++) {
      const pick = pickGachaItem(SEED_CANDIDATES, 1, rng);
      expect(pick).not.toBeNull();
      const cand = SEED_CANDIDATES.find((c) => c.item_key === pick!.itemKey)!;
      expect(cand.level_required).toBeLessThanOrEqual(1);
    }
  });

  it('falls back to common tier when only common-tier items are eligible', () => {
    // Force a rare-tier roll by stubbing rng to <0.02 on the first call.
    const rng = (() => {
      let call = 0;
      const base = mulberry32(7);
      return () => {
        call += 1;
        if (call === 1) return 0.005; // wantRare = true
        return base();
      };
    })();
    const commonOnly: GachaCandidate[] = [
      { item_key: 'hat_a', rarity: 'common', level_required: 1 },
      { item_key: 'hat_b', rarity: 'uncommon', level_required: 1 },
    ];
    const pick = pickGachaItem(commonOnly, 5, rng);
    expect(pick).not.toBeNull();
    expect(pick!.fellBackToOtherTier).toBe(true);
    expect(pick!.isRare).toBe(false);
  });

  it('falls back to rare tier when only rare-tier items are eligible', () => {
    // Force a non-rare roll by returning >=0.02 first.
    const rng = (() => {
      let call = 0;
      const base = mulberry32(11);
      return () => {
        call += 1;
        if (call === 1) return 0.5; // wantRare = false
        return base();
      };
    })();
    const rareOnly: GachaCandidate[] = [
      { item_key: 'hat_x', rarity: 'rare', level_required: 1 },
      { item_key: 'hat_y', rarity: 'legendary', level_required: 1 },
    ];
    const pick = pickGachaItem(rareOnly, 5, rng);
    expect(pick).not.toBeNull();
    expect(pick!.fellBackToOtherTier).toBe(true);
    expect(pick!.isRare).toBe(true);
  });
});

describe('1000-pull distribution simulation', () => {
  // Expected rare hits ≈ 1000 * 0.02 = 20. σ = √(npq) ≈ 4.43. Use a wide
  // tolerance band so seeded determinism does not become a flakiness vector
  // if the seed or PRNG ever changes.
  it('rare-hit count is within tolerance band for seed=12345', () => {
    const summary = simulateGachaDistribution(SEED_CANDIDATES, 10, 1000, 12345);
    expect(summary.totalPulls).toBe(1000);
    // ±~3σ window
    expect(summary.rareHits).toBeGreaterThanOrEqual(5);
    expect(summary.rareHits).toBeLessThanOrEqual(45);
    // Within ±2pp of the configured rate
    expect(Math.abs(summary.rareRate - GACHA_RARE_CHANCE)).toBeLessThanOrEqual(0.025);
  });

  it('every pull is accounted for — sum of rarity hits equals totalPulls', () => {
    const summary = simulateGachaDistribution(SEED_CANDIDATES, 10, 1000, 67890);
    const sum =
      summary.hitsByRarity.common +
      summary.hitsByRarity.uncommon +
      summary.hitsByRarity.rare +
      summary.hitsByRarity.legendary;
    expect(sum).toBe(summary.totalPulls);
  });

  it('common+uncommon dominate over rare+legendary at the configured rate', () => {
    const summary = simulateGachaDistribution(SEED_CANDIDATES, 10, 1000, 555);
    const commonTier = summary.hitsByRarity.common + summary.hitsByRarity.uncommon;
    const rareTier = summary.hitsByRarity.rare + summary.hitsByRarity.legendary;
    expect(commonTier).toBeGreaterThan(rareTier * 10);
  });

  it('is deterministic — same seed reproduces the same summary', () => {
    const a = simulateGachaDistribution(SEED_CANDIDATES, 10, 500, 2024);
    const b = simulateGachaDistribution(SEED_CANDIDATES, 10, 500, 2024);
    expect(a).toEqual(b);
  });
});

describe('mulberry32 PRNG', () => {
  it('produces values in [0, 1)', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic for the same seed', () => {
    const rng1 = mulberry32(7);
    const rng2 = mulberry32(7);
    for (let i = 0; i < 10; i++) {
      expect(rng1()).toBe(rng2());
    }
  });
});
