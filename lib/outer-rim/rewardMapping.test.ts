/**
 * Tests for the Star Vault reward-mapping reducer (memo 2 §5).
 *
 * Covers the three named invariants:
 *   (a) parimutuel sub-pool closure,
 *   (b) real PnL is the only term that breaks closure ("real yield"),
 *   (c) negative Mode-B PnL floored at the loss budget → vault never negative,
 * plus the named scenarios (all-synthetic, positive-Mode-B, loss-budget-clamp,
 * Mode-C-rake-only), pro-rata correctness, purity, and input validation.
 *
 * Spec refs: docs/SANCTUARY_ADR_003_OUTER_RIM.md §4, docs/SANCTUARY_OUTER_RIM_HYBRID_RFC.md §3,
 * docs/PERPL_INTEGRATION_REFERENCE.md.
 */
import { describe, it, expect } from 'vitest';
import {
  mapRewards,
  parimutuelClosure,
  DEFAULT_SKIM_RATE,
  type SyntheticVaultCycle,
  type RealYieldInputs,
} from './rewardMapping';

const cleaned3: SyntheticVaultCycle['cleaned'] = [
  { id: 'a', cleaned: 100 },
  { id: 'b', cleaned: 300 },
  { id: 'c', cleaned: 600 },
];

function sumRewards(rewards: { reward: number }[]): number {
  return rewards.reduce((acc, r) => acc + r.reward, 0);
}

describe('mapRewards — all-synthetic (Mode A only)', () => {
  it('pool is the synthetic pool net of 2% skim, no real terms', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, cleaned: cleaned3 };
    const r = mapRewards(cycle);
    expect(r.grossInflow).toBe(1000);
    expect(r.skim).toBeCloseTo(20, 9); // 2% of 1000
    expect(r.cycleVaultPool).toBeCloseTo(980, 9);
    expect(r.flooredModeBPnl).toBe(0);
    expect(r.realYield).toBe(0); // no real yield when Mode-B PnL is 0
  });

  it('distributes the whole pool pro-rata across cleaned DUST', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, cleaned: cleaned3 };
    const r = mapRewards(cycle);
    // totalCleaned = 1000; shares 0.1 / 0.3 / 0.6 of 980
    expect(r.rewards.find((x) => x.id === 'a')!.reward).toBeCloseTo(98, 9);
    expect(r.rewards.find((x) => x.id === 'b')!.reward).toBeCloseTo(294, 9);
    expect(r.rewards.find((x) => x.id === 'c')!.reward).toBeCloseTo(588, 9);
    expect(sumRewards(r.rewards)).toBeCloseTo(r.cycleVaultPool, 9);
  });

  it('matches ADR-003 §4.2 reward formula exactly for a single cleaner', () => {
    const cycle: SyntheticVaultCycle = {
      syntheticParimutuelPool: 500,
      cleaned: [{ id: 'solo', cleaned: 42 }],
    };
    const r = mapRewards(cycle);
    expect(r.rewards[0].reward).toBeCloseTo(r.cycleVaultPool, 9); // share = 1
  });
});

describe('mapRewards — casino house edge (ADR-003 §4.3 item 2)', () => {
  it('casino house edge is folded into the gross inflow', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, cleaned: cleaned3 };
    const r = mapRewards(cycle, { casinoHouseEdge: 250 });
    expect(r.grossInflow).toBe(1250);
    expect(r.cycleVaultPool).toBeCloseTo(1250 * (1 - DEFAULT_SKIM_RATE), 9);
    expect(r.realYield).toBe(0); // casino edge is deterministic, not real yield
  });
});

describe('mapRewards — positive Mode-B PnL (Hybrid-RFC §3.2)', () => {
  it('positive hedge PnL increases the pool and is the real yield', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, cleaned: cleaned3 };
    const r = mapRewards(cycle, { modeBPnl: 400, lossBudget: 500 });
    expect(r.flooredModeBPnl).toBe(400); // positive PnL never floored
    expect(r.grossInflow).toBe(1400);
    expect(r.cycleVaultPool).toBeCloseTo(1400 * 0.98, 9);
    expect(r.realYield).toBeCloseTo(400 * 0.98, 9);
  });

  it('real yield equals pool minus the closed deterministic pool (invariant b)', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, cleaned: cleaned3 };
    const real: RealYieldInputs = { casinoHouseEdge: 200, modeCRake: 50, modeBPnl: 300, lossBudget: 1000 };
    const withReal = mapRewards(cycle, real);
    const withoutModeB = mapRewards(cycle, { ...real, modeBPnl: 0 });
    expect(withReal.cycleVaultPool - withoutModeB.cycleVaultPool).toBeCloseTo(
      withReal.realYield,
      9,
    );
  });
});

describe('mapRewards — Mode-C rake only (Hybrid-RFC §3.3)', () => {
  it('Mode-C rake is deterministic and does not register as real yield', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 800, cleaned: cleaned3 };
    const r = mapRewards(cycle, { modeCRake: 120 });
    expect(r.grossInflow).toBe(920);
    expect(r.cycleVaultPool).toBeCloseTo(920 * 0.98, 9);
    expect(r.realYield).toBe(0);
    expect(r.flooredModeBPnl).toBe(0);
  });
});

describe('mapRewards — loss-budget clamp (invariant c)', () => {
  it('negative Mode-B PnL is floored at -lossBudget', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, cleaned: cleaned3 };
    const r = mapRewards(cycle, { modeBPnl: -800, lossBudget: 300 });
    expect(r.flooredModeBPnl).toBe(-300); // floored, not -800
    expect(r.grossInflow).toBe(700); // 1000 - 300
    expect(r.realYield).toBeCloseTo(-300 * 0.98, 9); // real yield can be negative
  });

  it('loss exactly at the budget is not clamped further', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, cleaned: cleaned3 };
    const r = mapRewards(cycle, { modeBPnl: -300, lossBudget: 300 });
    expect(r.flooredModeBPnl).toBe(-300);
    expect(r.grossInflow).toBe(700);
  });

  it('default loss budget of 0 absorbs no real loss', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, cleaned: cleaned3 };
    const r = mapRewards(cycle, { modeBPnl: -500 });
    expect(r.flooredModeBPnl).toBeCloseTo(0, 9); // floored at -lossBudget = 0
    expect(r.grossInflow).toBe(1000);
  });

  it('vault never goes negative even with a catastrophic loss', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 100, cleaned: cleaned3 };
    // lossBudget intentionally larger than inflows → clamp must defend.
    const r = mapRewards(cycle, { modeBPnl: -10_000, lossBudget: 10_000 });
    expect(r.cycleVaultPool).toBe(0);
    expect(r.cycleVaultPool).toBeGreaterThanOrEqual(0);
    expect(sumRewards(r.rewards)).toBeCloseTo(0, 9);
  });

  it('correctly-sized loss budget keeps the pool non-negative without the clamp', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, cleaned: cleaned3 };
    // lossBudget ≤ synthetic + casino + rake → gross stays ≥ 0.
    const r = mapRewards(cycle, { modeBPnl: -2000, casinoHouseEdge: 200, modeCRake: 50, lossBudget: 1250 });
    expect(r.flooredModeBPnl).toBe(-1250);
    expect(r.grossInflow).toBe(0); // 1000 + 200 + 50 - 1250
    expect(r.cycleVaultPool).toBe(0);
  });
});

describe('parimutuelClosure — invariant (a) sub-pool stays closed', () => {
  it('synthetic in equals synthetic out + skim + seed', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, cleaned: cleaned3 };
    const c = parimutuelClosure(cycle);
    expect(c.syntheticIn).toBe(1000);
    expect(c.skim).toBeCloseTo(20, 9);
    expect(c.seed).toBe(0);
    expect(c.syntheticOut).toBeCloseTo(980, 9);
    expect(c.residual).toBeCloseTo(0, 9);
    expect(c.syntheticOut + c.skim + c.seed).toBeCloseTo(c.syntheticIn, 9);
  });

  it('closure holds with a retained seed', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, seed: 150, cleaned: cleaned3 };
    const c = parimutuelClosure(cycle);
    expect(c.seed).toBe(150);
    expect(c.skim).toBeCloseTo(20, 9);
    expect(c.syntheticOut).toBeCloseTo(830, 9); // 1000 - 20 - 150
    expect(c.residual).toBeCloseTo(0, 9);
  });

  it('closure is independent of real PnL (b): real terms never enter it', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, cleaned: cleaned3 };
    const c = parimutuelClosure(cycle);
    // adding huge real PnL to mapRewards does not change the synthetic closure
    mapRewards(cycle, { modeBPnl: 99999, lossBudget: 99999 });
    const c2 = parimutuelClosure(cycle);
    expect(c2).toEqual(c);
    expect(c.residual).toBeCloseTo(0, 9);
  });

  it('rejects a seed larger than the pool', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 100, seed: 200, cleaned: cleaned3 };
    expect(() => parimutuelClosure(cycle)).toThrow(/seed/);
  });
});

describe('mapRewards — combined / conservation invariant', () => {
  it('sum of rewards equals the cycle pool when DUST is cleaned', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1234, cleaned: cleaned3 };
    const r = mapRewards(cycle, { casinoHouseEdge: 321, modeBPnl: 111, modeCRake: 22, lossBudget: 500 });
    expect(sumRewards(r.rewards)).toBeCloseTo(r.cycleVaultPool, 6);
    expect(r.undistributed).toBe(0);
  });

  it('pool decomposes into closed-deterministic part + real yield', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, cleaned: cleaned3 };
    const real: RealYieldInputs = { casinoHouseEdge: 300, modeCRake: 100, modeBPnl: 250, lossBudget: 1000 };
    const r = mapRewards(cycle, real);
    const deterministicPool = (1000 + 300 + 100) * (1 - DEFAULT_SKIM_RATE);
    expect(r.cycleVaultPool - deterministicPool).toBeCloseTo(r.realYield, 6);
  });

  it('gross inflow is the exact memo-2 §5 sum of all four terms', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, cleaned: cleaned3 };
    const r = mapRewards(cycle, { casinoHouseEdge: 300, modeBPnl: -100, modeCRake: 100, lossBudget: 500 });
    expect(r.grossInflow).toBe(1000 + 300 + -100 + 100);
  });
});

describe('mapRewards — zero / empty cleaned ledger', () => {
  it('all-zero cleaned → no distribution, pool carried as undistributed', () => {
    const cycle: SyntheticVaultCycle = {
      syntheticParimutuelPool: 1000,
      cleaned: [{ id: 'a', cleaned: 0 }, { id: 'b', cleaned: 0 }],
    };
    const r = mapRewards(cycle);
    expect(r.totalCleaned).toBe(0);
    expect(r.undistributed).toBeCloseTo(980, 9);
    expect(sumRewards(r.rewards)).toBe(0);
    expect(r.rewards.every((x) => x.reward === 0)).toBe(true);
  });

  it('empty cleaned array → no rewards, pool undistributed', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, cleaned: [] };
    const r = mapRewards(cycle);
    expect(r.rewards).toEqual([]);
    expect(r.undistributed).toBeCloseTo(980, 9);
  });
});

describe('mapRewards — configurable skim', () => {
  it('honors a custom skim rate', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, cleaned: cleaned3 };
    const r = mapRewards(cycle, {}, { skimRate: 0.05 });
    expect(r.skim).toBeCloseTo(50, 9);
    expect(r.cycleVaultPool).toBeCloseTo(950, 9);
  });

  it('skimRate of 0 takes no skim', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, cleaned: cleaned3 };
    const r = mapRewards(cycle, {}, { skimRate: 0 });
    expect(r.skim).toBe(0);
    expect(r.cycleVaultPool).toBe(1000);
  });
});

describe('mapRewards — purity', () => {
  it('does not mutate its inputs', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 1000, cleaned: cleaned3 };
    const real: RealYieldInputs = { casinoHouseEdge: 100, modeBPnl: -50, lossBudget: 200 };
    const cycleSnap = JSON.stringify(cycle);
    const realSnap = JSON.stringify(real);
    mapRewards(cycle, real);
    expect(JSON.stringify(cycle)).toBe(cycleSnap);
    expect(JSON.stringify(real)).toBe(realSnap);
  });

  it('is deterministic — identical inputs give identical outputs', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 777, cleaned: cleaned3 };
    const real: RealYieldInputs = { modeBPnl: 123, lossBudget: 500, casinoHouseEdge: 9 };
    expect(mapRewards(cycle, real)).toEqual(mapRewards(cycle, real));
  });
});

describe('mapRewards — input validation', () => {
  it('rejects a negative synthetic pool', () => {
    expect(() => mapRewards({ syntheticParimutuelPool: -1, cleaned: cleaned3 })).toThrow(/syntheticParimutuelPool/);
  });

  it('rejects a negative casino house edge', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 100, cleaned: cleaned3 };
    expect(() => mapRewards(cycle, { casinoHouseEdge: -5 })).toThrow(/casinoHouseEdge/);
  });

  it('rejects a negative loss budget', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 100, cleaned: cleaned3 };
    expect(() => mapRewards(cycle, { lossBudget: -1 })).toThrow(/lossBudget/);
  });

  it('rejects a negative cleaned value', () => {
    const cycle: SyntheticVaultCycle = {
      syntheticParimutuelPool: 100,
      cleaned: [{ id: 'bad', cleaned: -10 }],
    };
    expect(() => mapRewards(cycle)).toThrow(/cleaned/);
  });

  it('rejects a non-finite Mode-B PnL', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 100, cleaned: cleaned3 };
    expect(() => mapRewards(cycle, { modeBPnl: Number.NaN })).toThrow(/modeBPnl/);
  });

  it('rejects a skim rate ≥ 1', () => {
    const cycle: SyntheticVaultCycle = { syntheticParimutuelPool: 100, cleaned: cleaned3 };
    expect(() => mapRewards(cycle, {}, { skimRate: 1 })).toThrow(/skimRate/);
  });
});
