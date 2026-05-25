/**
 * Unit tests for the Outer Rim pure voyage state-machine.
 *
 * Acceptance ([SWO_OUTER_RIM_VOYAGE_ENGINE_PURE]):
 *   (a) pure — no IO, no clock, no RNG except seeded leverage jitter;
 *   (b) ≥30 cases: happy path × 3 tiers, binary vs progressive, jitter range,
 *       edge cases (price exactly at threshold, completion=0, completion=1);
 *   (c) deterministic for `(seed, inputs)`;
 *   (d) engine-only — exercises no DB / API.
 *
 * Math grounded in ADR-003 §2 / source memo §1.1 (tiers) and §4.1 (payout).
 */
import { describe, it, expect } from 'vitest';
import {
  VOYAGE_TYPES,
  VOYAGE_CATALOG,
  DEFAULT_VOYAGE_CONFIG,
  paramsFor,
  seededJitter,
  effectiveSensitivity,
  binaryDust,
  progressiveDust,
  evaluateVoyage,
  type VoyageInput,
  type VoyageType,
} from './voyage';

const CFG = DEFAULT_VOYAGE_CONFIG;

/** Build a voyage input with sensible defaults; override per-test. */
function input(overrides: Partial<VoyageInput> = {}): VoyageInput {
  return {
    voyageType: 'run',
    startPrice: 100,
    currentPrice: 100,
    completionPct: 0.5,
    leverageJitterSeed: 1,
    voyageLevel: 1,
    ...overrides,
  };
}

/**
 * A current price safely above any jittered liquidation threshold for `type`.
 * Even Expedition (250×, ±20% jitter) liquidates at ≈0.48% below entry, so a
 * price equal to entry is always "unliquidated".
 */
const SAFE_PRICE = 100;

describe('catalog (ADR-003 §2 / memo §1.1)', () => {
  it('models exactly the three voyage tiers', () => {
    expect(VOYAGE_TYPES).toEqual(['sprint', 'run', 'expedition']);
  });

  it('Sprint: 5m / 2500× / binary', () => {
    expect(VOYAGE_CATALOG.sprint).toMatchObject({
      durationMinutes: 5,
      leverage: 2_500,
      payout: 'binary',
    });
  });

  it('Run: 30m / 750× / progressive', () => {
    expect(VOYAGE_CATALOG.run).toMatchObject({
      durationMinutes: 30,
      leverage: 750,
      payout: 'progressive',
    });
  });

  it('Expedition: 90m / 250× / progressive', () => {
    expect(VOYAGE_CATALOG.expedition).toMatchObject({
      durationMinutes: 90,
      leverage: 250,
      payout: 'progressive',
    });
  });

  it('paramsFor throws on an unknown voyage type', () => {
    expect(() => paramsFor('cruise' as VoyageType)).toThrow(/unknown voyage type/);
  });
});

describe('happy path — success across all three tiers', () => {
  it.each(VOYAGE_TYPES)('%s completes unliquidated at completion=1', (type) => {
    const r = evaluateVoyage(input({ voyageType: type, currentPrice: SAFE_PRICE, completionPct: 1 }));
    expect(r.status).toBe('success');
    expect(r.influenceRefund).toBe(CFG.influenceCost);
    expect(r.completionAtFailure).toBeNull();
    expect(r.dustEarned).toBeGreaterThan(0);
  });

  it('Sprint success pays the level-scaled binary payout (not a completion curve)', () => {
    const r = evaluateVoyage(input({ voyageType: 'sprint', completionPct: 1, voyageLevel: 1 }));
    expect(r.dustEarned).toBe(CFG.binaryDustMin);
  });

  it('Run success pays the full dust_per_success coefficient at completion=1', () => {
    const r = evaluateVoyage(input({ voyageType: 'run', completionPct: 1 }));
    expect(r.dustEarned).toBeCloseTo(VOYAGE_CATALOG.run.dustPerSuccess, 9);
  });

  it('Expedition success pays the full dust_per_success coefficient at completion=1', () => {
    const r = evaluateVoyage(input({ voyageType: 'expedition', completionPct: 1 }));
    expect(r.dustEarned).toBeCloseTo(VOYAGE_CATALOG.expedition.dustPerSuccess, 9);
  });
});

describe('live state', () => {
  it('progressive voyage is live and accrues partial cargo before completion', () => {
    const r = evaluateVoyage(input({ voyageType: 'run', completionPct: 0.5, currentPrice: SAFE_PRICE }));
    expect(r.status).toBe('live');
    expect(r.influenceRefund).toBe(0);
    expect(r.completionAtFailure).toBeNull();
    expect(r.dustEarned).toBeCloseTo(progressiveDust('run', 0.5), 9);
    expect(r.dustEarned).toBeGreaterThan(0);
  });

  it('binary voyage earns nothing while live (no partial payout)', () => {
    const r = evaluateVoyage(input({ voyageType: 'sprint', completionPct: 0.9, currentPrice: SAFE_PRICE }));
    expect(r.status).toBe('live');
    expect(r.dustEarned).toBe(0);
    expect(r.influenceRefund).toBe(0);
  });
});

describe('failure — liquidation loses the stake', () => {
  it('failed when current price breaches the threshold', () => {
    const r = evaluateVoyage(input({ voyageType: 'run', currentPrice: 50, completionPct: 0.3 }));
    expect(r.status).toBe('failed');
    expect(r.dustEarned).toBe(0);
    expect(r.influenceRefund).toBe(0);
  });

  it('records completionAtFailure at the breach point', () => {
    const r = evaluateVoyage(input({ voyageType: 'run', currentPrice: 1, completionPct: 0.42 }));
    expect(r.status).toBe('failed');
    expect(r.completionAtFailure).toBe(0.42);
  });

  it('a failed progressive voyage forfeits accrued cargo (dust 0 despite high completion)', () => {
    const r = evaluateVoyage(input({ voyageType: 'expedition', currentPrice: 1, completionPct: 0.99 }));
    expect(r.status).toBe('failed');
    expect(r.dustEarned).toBe(0);
  });

  it('liquidation can occur at completion=1 (term reached but breached) → failed, not success', () => {
    const r = evaluateVoyage(input({ voyageType: 'run', currentPrice: 1, completionPct: 1 }));
    expect(r.status).toBe('failed');
    expect(r.completionAtFailure).toBe(1);
  });
});

describe('binary vs progressive payout shape', () => {
  it('binary payout scales linearly across Voyage Levels 1..5', () => {
    const dusts = [1, 2, 3, 4, 5].map((lvl) => binaryDust(lvl));
    expect(dusts).toEqual([50, 62.5, 75, 87.5, 100]);
  });

  it('binary payout clamps below level 1 and above max level', () => {
    expect(binaryDust(0)).toBe(CFG.binaryDustMin);
    expect(binaryDust(99)).toBe(CFG.binaryDustMax);
  });

  it('progressive uses completion^1.2 verbatim (50% completion ≈ 44% payout)', () => {
    const full = VOYAGE_CATALOG.run.dustPerSuccess;
    const half = progressiveDust('run', 0.5);
    expect(half / full).toBeCloseTo(Math.pow(0.5, 1.2), 9);
    expect(half / full).toBeCloseTo(0.4353, 3);
  });

  it('progressive curve is monotonic increasing in completion', () => {
    const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map((c) => progressiveDust('expedition', c));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
  });

  it('progressive payout is exactly 0 at completion=0', () => {
    expect(progressiveDust('run', 0)).toBe(0);
    expect(progressiveDust('expedition', 0)).toBe(0);
  });

  it('progressive payout equals the coefficient at completion=1', () => {
    expect(progressiveDust('run', 1)).toBeCloseTo(VOYAGE_CATALOG.run.dustPerSuccess, 9);
  });

  it('progressive clamps completion outside [0,1] before applying the curve', () => {
    expect(progressiveDust('run', 2)).toBeCloseTo(VOYAGE_CATALOG.run.dustPerSuccess, 9);
    expect(progressiveDust('run', -1)).toBe(0);
  });
});

describe('leverage jitter — seeded, bounded, deterministic', () => {
  it('seededJitter is in [-1, 1)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const j = seededJitter(seed);
      expect(j).toBeGreaterThanOrEqual(-1);
      expect(j).toBeLessThan(1);
    }
  });

  it('seededJitter is deterministic for a given seed', () => {
    expect(seededJitter(12345)).toBe(seededJitter(12345));
  });

  it('different seeds generally produce different jitter', () => {
    expect(seededJitter(1)).not.toBe(seededJitter(2));
  });

  it('seededJitter coerces non-integer / non-finite-adjacent seeds stably', () => {
    expect(seededJitter(7.9)).toBe(seededJitter(7)); // truncated to 7
    expect(() => seededJitter(NaN)).toThrow(TypeError);
  });

  it('effective sensitivity stays within base × [1 - maxJitter, 1 + maxJitter)', () => {
    const base = 1 / VOYAGE_CATALOG.run.leverage;
    const lo = base * (1 - CFG.maxJitterFraction);
    const hi = base * (1 + CFG.maxJitterFraction);
    for (let seed = 0; seed < 500; seed++) {
      const s = effectiveSensitivity('run', seed);
      expect(s).toBeGreaterThanOrEqual(lo);
      expect(s).toBeLessThan(hi);
    }
  });

  it('higher leverage tiers have a tighter (smaller) base sensitivity', () => {
    // Hold jitter fixed via the same seed; Sprint (2500×) liquidates on a
    // smaller move than Expedition (250×).
    const sprint = effectiveSensitivity('sprint', 42);
    const expedition = effectiveSensitivity('expedition', 42);
    expect(sprint).toBeLessThan(expedition);
  });

  it('the jitter seed shifts the liquidation threshold deterministically', () => {
    const a = evaluateVoyage(input({ leverageJitterSeed: 1 }));
    const b = evaluateVoyage(input({ leverageJitterSeed: 2 }));
    // Same inputs except the seed → thresholds differ but each is reproducible.
    expect(a.liquidationThreshold).not.toBe(b.liquidationThreshold);
    expect(evaluateVoyage(input({ leverageJitterSeed: 1 })).liquidationThreshold).toBe(
      a.liquidationThreshold,
    );
  });
});

describe('determinism (acceptance c)', () => {
  it('identical (seed, inputs) yields a deep-equal result', () => {
    const i = input({ voyageType: 'expedition', completionPct: 0.7, leverageJitterSeed: 99 });
    expect(evaluateVoyage(i)).toEqual(evaluateVoyage(i));
  });

  it('repeated evaluation does not mutate the input', () => {
    const i = input({ leverageJitterSeed: 7 });
    const snapshot = JSON.stringify(i);
    evaluateVoyage(i);
    evaluateVoyage(i);
    expect(JSON.stringify(i)).toBe(snapshot);
  });
});

describe('edge case — price exactly at the threshold', () => {
  it('current price exactly equal to the threshold is treated as a breach (failed)', () => {
    const i = input({ voyageType: 'run', startPrice: 100, completionPct: 0.5 });
    const sensitivity = effectiveSensitivity('run', i.leverageJitterSeed);
    const threshold = 100 * (1 - sensitivity);
    const r = evaluateVoyage({ ...i, currentPrice: threshold });
    expect(r.status).toBe('failed');
    expect(r.completionAtFailure).toBe(0.5);
  });

  it('a hair above the threshold is not a breach (live/success)', () => {
    const i = input({ voyageType: 'run', startPrice: 100, completionPct: 0.5 });
    const sensitivity = effectiveSensitivity('run', i.leverageJitterSeed);
    const threshold = 100 * (1 - sensitivity);
    const r = evaluateVoyage({ ...i, currentPrice: threshold * (1 + 1e-9) });
    expect(r.status).toBe('live');
  });
});

describe('edge case — completion boundaries', () => {
  it('completion=0 with a safe price is live, earns nothing yet', () => {
    const r = evaluateVoyage(input({ voyageType: 'run', completionPct: 0, currentPrice: SAFE_PRICE }));
    expect(r.status).toBe('live');
    expect(r.dustEarned).toBe(0);
    expect(r.completionAtFailure).toBeNull();
  });

  it('completion=0 with a breached price is failed at completion 0', () => {
    const r = evaluateVoyage(input({ voyageType: 'run', completionPct: 0, currentPrice: 1 }));
    expect(r.status).toBe('failed');
    expect(r.completionAtFailure).toBe(0);
  });

  it('completion=1 with a safe price is a success across all tiers', () => {
    for (const type of VOYAGE_TYPES) {
      const r = evaluateVoyage(input({ voyageType: type, completionPct: 1, currentPrice: SAFE_PRICE }));
      expect(r.status).toBe('success');
    }
  });
});

describe('input validation (purity guards)', () => {
  it('rejects a non-positive start price', () => {
    expect(() => evaluateVoyage(input({ startPrice: 0 }))).toThrow(RangeError);
  });

  it('rejects a non-positive current price', () => {
    expect(() => evaluateVoyage(input({ currentPrice: -5 }))).toThrow(RangeError);
  });

  it('rejects a NaN price', () => {
    expect(() => evaluateVoyage(input({ currentPrice: NaN }))).toThrow(TypeError);
  });

  it('rejects completion outside [0, 1]', () => {
    expect(() => evaluateVoyage(input({ completionPct: 1.5 }))).toThrow(RangeError);
    expect(() => evaluateVoyage(input({ completionPct: -0.1 }))).toThrow(RangeError);
  });

  it('rejects a non-finite voyage level', () => {
    expect(() => evaluateVoyage(input({ voyageLevel: Infinity }))).toThrow(TypeError);
  });
});

describe('result surfaces audit fields', () => {
  it('exposes the jittered liquidation threshold and sensitivity', () => {
    const r = evaluateVoyage(input({ voyageType: 'run', startPrice: 100, leverageJitterSeed: 3 }));
    expect(r.effectiveSensitivity).toBeCloseTo(effectiveSensitivity('run', 3), 12);
    expect(r.liquidationThreshold).toBeCloseTo(100 * (1 - r.effectiveSensitivity), 9);
  });
});
