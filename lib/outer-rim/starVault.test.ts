/**
 * Tests for the pure Star Vault cycle-settlement reducer (ADR-003 §4).
 *
 * Covers the required scenarios — 1-player, 100-player, dust-of-0 (no reward),
 * pool-empty, casino-inflow-only — plus split escalation, the conservation
 * invariant (Σ rewards + skim + nextSeed === totalInflows), pro-rata
 * correctness, purity, and input validation.
 *
 * Spec refs: docs/SANCTUARY_ADR_003_OUTER_RIM.md §4; memo
 * swo_offshore_protocol_analysis_2026-05-23.md §1.3/§4.1; Offshore swiss-vault doc.
 */
import { describe, it, expect } from 'vitest';
import {
  settleStarVaultCycle,
  DEFAULT_SPLIT,
  ESCALATED_SPLIT,
  DEFAULT_SKIM_RATE,
  DEFAULT_DEPLETION_THRESHOLD,
  type StarVaultCycleInput,
  type StarVaultSettlement,
} from './starVault';

function sumRewards(s: StarVaultSettlement): number {
  return s.rewards.reduce((acc, r) => acc + r.reward, 0);
}

/** The conservation invariant (c): inflows fully accounted for. */
function expectConservation(s: StarVaultSettlement): void {
  expect(sumRewards(s) + s.protocolSkim + s.nextCycleSeed).toBeCloseTo(s.totalInflows, 9);
}

const baseInfluence = { oldest: 1000, middle: 500, newest: 300 };

describe('settleStarVaultCycle — pool composition (default split)', () => {
  it('releases 40/30/30 of the reserve plus casino edge, less 2% skim', () => {
    const input: StarVaultCycleInput = {
      priorLostInfluence: baseInfluence,
      casinoHouseEdge: 200,
      cleaned: [{ id: 'a', dust: 100 }],
    };
    const s = settleStarVaultCycle(input);
    // released = 0.4*1000 + 0.3*500 + 0.3*300 = 400 + 150 + 90 = 640
    const released = 640;
    expect(s.grossPool).toBeCloseTo(released + 200, 9);
    expect(s.protocolSkim).toBeCloseTo(0.02 * (released + 200), 9);
    expect(s.distributablePool).toBeCloseTo(0.98 * (released + 200), 9);
    expect(s.escalated).toBe(false);
    expect(s.splitApplied).toEqual(DEFAULT_SPLIT);
  });

  it('retains the un-released reserve (60/70/70) as the next-cycle seed', () => {
    const input: StarVaultCycleInput = {
      priorLostInfluence: baseInfluence,
      casinoHouseEdge: 0,
      cleaned: [{ id: 'a', dust: 50 }],
    };
    const s = settleStarVaultCycle(input);
    // retained = 0.6*1000 + 0.7*500 + 0.7*300 = 600 + 350 + 210 = 1160
    expect(s.nextCycleSeed).toBeCloseTo(1160, 9);
  });

  it('reports totalInflows as the full reserve plus casino edge', () => {
    const s = settleStarVaultCycle({
      priorLostInfluence: baseInfluence,
      casinoHouseEdge: 200,
      cleaned: [{ id: 'a', dust: 1 }],
    });
    expect(s.totalInflows).toBeCloseTo(1000 + 500 + 300 + 200, 9);
  });
});

describe('settleStarVaultCycle — split escalation (memo §1.3)', () => {
  it('does NOT escalate at exactly the 80% threshold (strict >)', () => {
    const s = settleStarVaultCycle({
      priorLostInfluence: baseInfluence,
      casinoHouseEdge: 0,
      cleaned: [{ id: 'a', dust: 1 }],
      priorPoolDepletion: DEFAULT_DEPLETION_THRESHOLD,
    });
    expect(s.escalated).toBe(false);
    expect(s.splitApplied).toEqual(DEFAULT_SPLIT);
  });

  it('escalates to 70/15/15 when prior pool depleted >80%', () => {
    const s = settleStarVaultCycle({
      priorLostInfluence: baseInfluence,
      casinoHouseEdge: 0,
      cleaned: [{ id: 'a', dust: 1 }],
      priorPoolDepletion: 0.81,
    });
    expect(s.escalated).toBe(true);
    expect(s.splitApplied).toEqual(ESCALATED_SPLIT);
    // released = 0.7*1000 + 0.15*500 + 0.15*300 = 700 + 75 + 45 = 820
    expect(s.grossPool).toBeCloseTo(820, 9);
  });

  it('escalated split front-loads more reward than the default split', () => {
    const common: StarVaultCycleInput = {
      priorLostInfluence: baseInfluence,
      casinoHouseEdge: 0,
      cleaned: [{ id: 'a', dust: 1 }],
    };
    const def = settleStarVaultCycle({ ...common, priorPoolDepletion: 0.5 });
    const esc = settleStarVaultCycle({ ...common, priorPoolDepletion: 0.95 });
    expect(esc.grossPool).toBeGreaterThan(def.grossPool);
    expect(esc.nextCycleSeed).toBeLessThan(def.nextCycleSeed);
  });
});

describe('settleStarVaultCycle — required scenarios', () => {
  it('1-player: the sole cleaner takes the entire distributable pool', () => {
    const s = settleStarVaultCycle({
      priorLostInfluence: baseInfluence,
      casinoHouseEdge: 200,
      cleaned: [{ id: 'solo', dust: 42 }],
    });
    expect(s.rewards).toHaveLength(1);
    expect(s.rewards[0].reward).toBeCloseTo(s.distributablePool, 9);
    expect(s.undistributed).toBe(0);
    expectConservation(s);
  });

  it('100-player: pro-rata, sums to the pool, conserves inflows', () => {
    const cleaned = Array.from({ length: 100 }, (_, i) => ({
      id: `s${i}`,
      dust: i + 1, // 1..100
    }));
    const s = settleStarVaultCycle({
      priorLostInfluence: baseInfluence,
      casinoHouseEdge: 5000,
      cleaned,
    });
    expect(s.rewards).toHaveLength(100);
    expect(s.totalCleaned).toBe((100 * 101) / 2); // 5050
    expect(sumRewards(s)).toBeCloseTo(s.distributablePool, 6);
    // largest cleaner (dust=100) earns 100× the smallest (dust=1)
    const smallest = s.rewards[0].reward;
    const largest = s.rewards[99].reward;
    expect(largest / smallest).toBeCloseTo(100, 6);
    expectConservation(s);
  });

  it('dust-of-0: a zero-cleaning Skrumpey earns no reward; others split the pool', () => {
    const s = settleStarVaultCycle({
      priorLostInfluence: baseInfluence,
      casinoHouseEdge: 0,
      cleaned: [
        { id: 'idle', dust: 0 },
        { id: 'active', dust: 100 },
      ],
    });
    const idle = s.rewards.find((r) => r.id === 'idle')!;
    const active = s.rewards.find((r) => r.id === 'active')!;
    expect(idle.reward).toBe(0);
    expect(active.reward).toBeCloseTo(s.distributablePool, 9);
    expectConservation(s);
  });

  it('pool-empty: zero inflows ⇒ zero pool, zero rewards, zero seed, zero skim', () => {
    const s = settleStarVaultCycle({
      priorLostInfluence: { oldest: 0, middle: 0, newest: 0 },
      casinoHouseEdge: 0,
      cleaned: [
        { id: 'a', dust: 10 },
        { id: 'b', dust: 20 },
      ],
    });
    expect(s.grossPool).toBe(0);
    expect(s.protocolSkim).toBe(0);
    expect(s.distributablePool).toBe(0);
    expect(s.nextCycleSeed).toBe(0);
    expect(sumRewards(s)).toBe(0);
    expect(s.totalInflows).toBe(0);
    expectConservation(s);
  });

  it('casino-inflow-only: pool funded entirely by house edge', () => {
    const s = settleStarVaultCycle({
      priorLostInfluence: { oldest: 0, middle: 0, newest: 0 },
      casinoHouseEdge: 1000,
      cleaned: [{ id: 'a', dust: 100 }],
    });
    expect(s.grossPool).toBeCloseTo(1000, 9);
    expect(s.protocolSkim).toBeCloseTo(20, 9);
    expect(s.distributablePool).toBeCloseTo(980, 9);
    expect(s.nextCycleSeed).toBe(0); // nothing retained — no influence reserve
    expect(s.rewards[0].reward).toBeCloseTo(980, 9);
    expectConservation(s);
  });

  it('nobody cleaned: distributable pool rolls into the next-cycle seed', () => {
    const s = settleStarVaultCycle({
      priorLostInfluence: baseInfluence,
      casinoHouseEdge: 200,
      cleaned: [
        { id: 'a', dust: 0 },
        { id: 'b', dust: 0 },
      ],
    });
    expect(s.totalCleaned).toBe(0);
    expect(sumRewards(s)).toBe(0);
    expect(s.undistributed).toBeCloseTo(s.distributablePool, 9);
    // retained influence (1160) + undistributed pool
    expect(s.nextCycleSeed).toBeCloseTo(1160 + s.distributablePool, 9);
    expectConservation(s);
  });

  it('empty cleaned ledger: no rewards, pool seeds forward', () => {
    const s = settleStarVaultCycle({
      priorLostInfluence: baseInfluence,
      casinoHouseEdge: 0,
      cleaned: [],
    });
    expect(s.rewards).toEqual([]);
    expect(s.totalCleaned).toBe(0);
    expect(s.undistributed).toBeCloseTo(s.distributablePool, 9);
    expectConservation(s);
  });
});

describe('settleStarVaultCycle — conservation invariant (c)', () => {
  it('holds for the default split', () => {
    expectConservation(
      settleStarVaultCycle({
        priorLostInfluence: baseInfluence,
        casinoHouseEdge: 333,
        cleaned: [
          { id: 'a', dust: 100 },
          { id: 'b', dust: 300 },
          { id: 'c', dust: 600 },
        ],
      }),
    );
  });

  it('holds for the escalated split', () => {
    expectConservation(
      settleStarVaultCycle({
        priorLostInfluence: baseInfluence,
        casinoHouseEdge: 333,
        cleaned: [
          { id: 'a', dust: 100 },
          { id: 'b', dust: 300 },
        ],
        priorPoolDepletion: 0.9,
      }),
    );
  });

  it('holds for casino-only inflow', () => {
    expectConservation(
      settleStarVaultCycle({
        priorLostInfluence: { oldest: 0, middle: 0, newest: 0 },
        casinoHouseEdge: 777,
        cleaned: [{ id: 'a', dust: 5 }],
      }),
    );
  });

  it('holds across randomized fuzz inputs', () => {
    // deterministic LCG so the test stays pure/reproducible
    let seed = 123456789;
    const rand = () => {
      seed = (1103515245 * seed + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let t = 0; t < 50; t++) {
      const n = 1 + Math.floor(rand() * 12);
      const cleaned = Array.from({ length: n }, (_, i) => ({
        id: `s${i}`,
        dust: Math.floor(rand() * 1000),
      }));
      const s = settleStarVaultCycle({
        priorLostInfluence: {
          oldest: rand() * 10000,
          middle: rand() * 10000,
          newest: rand() * 10000,
        },
        casinoHouseEdge: rand() * 5000,
        cleaned,
        priorPoolDepletion: rand(),
      });
      expectConservation(s);
    }
  });
});

describe('settleStarVaultCycle — pro-rata correctness (ADR-003 §4.2)', () => {
  it('reward shares equal cleaned-DUST shares', () => {
    const s = settleStarVaultCycle({
      priorLostInfluence: baseInfluence,
      casinoHouseEdge: 0,
      cleaned: [
        { id: 'a', dust: 100 }, // 1/6
        { id: 'b', dust: 200 }, // 2/6
        { id: 'c', dust: 300 }, // 3/6
      ],
    });
    const pool = s.distributablePool;
    expect(s.rewards[0].reward).toBeCloseTo(pool * (100 / 600), 9);
    expect(s.rewards[1].reward).toBeCloseTo(pool * (200 / 600), 9);
    expect(s.rewards[2].reward).toBeCloseTo(pool * (300 / 600), 9);
  });

  it('echoes each entry id and dust onto its reward line', () => {
    const s = settleStarVaultCycle({
      priorLostInfluence: baseInfluence,
      casinoHouseEdge: 0,
      cleaned: [{ id: 'x', dust: 7 }],
    });
    expect(s.rewards[0].id).toBe('x');
    expect(s.rewards[0].dust).toBe(7);
  });
});

describe('settleStarVaultCycle — configuration', () => {
  it('honors a custom skim rate', () => {
    const s = settleStarVaultCycle(
      {
        priorLostInfluence: { oldest: 0, middle: 0, newest: 0 },
        casinoHouseEdge: 1000,
        cleaned: [{ id: 'a', dust: 1 }],
      },
      { skimRate: 0.05 },
    );
    expect(s.protocolSkim).toBeCloseTo(50, 9);
    expect(s.distributablePool).toBeCloseTo(950, 9);
  });

  it('honors a custom split and depletion threshold', () => {
    const s = settleStarVaultCycle(
      {
        priorLostInfluence: { oldest: 1000, middle: 0, newest: 0 },
        casinoHouseEdge: 0,
        cleaned: [{ id: 'a', dust: 1 }],
        priorPoolDepletion: 0.6,
      },
      {
        defaultSplit: [0.5, 0.5, 0.5],
        escalatedSplit: [0.9, 0.9, 0.9],
        depletionThreshold: 0.5,
      },
    );
    // 0.6 > 0.5 → escalated; released = 0.9*1000 = 900
    expect(s.escalated).toBe(true);
    expect(s.grossPool).toBeCloseTo(900, 9);
  });

  it('exposes the ratified default constants', () => {
    expect(DEFAULT_SPLIT).toEqual([0.4, 0.3, 0.3]);
    expect(ESCALATED_SPLIT).toEqual([0.7, 0.15, 0.15]);
    expect(DEFAULT_SKIM_RATE).toBe(0.02);
    expect(DEFAULT_DEPLETION_THRESHOLD).toBe(0.8);
  });
});

describe('settleStarVaultCycle — purity', () => {
  it('is deterministic: same input → deep-equal output', () => {
    const input: StarVaultCycleInput = {
      priorLostInfluence: baseInfluence,
      casinoHouseEdge: 200,
      cleaned: [
        { id: 'a', dust: 100 },
        { id: 'b', dust: 300 },
      ],
    };
    expect(settleStarVaultCycle(input)).toEqual(settleStarVaultCycle(input));
  });

  it('does not mutate its inputs', () => {
    const input: StarVaultCycleInput = {
      priorLostInfluence: { oldest: 1000, middle: 500, newest: 300 },
      casinoHouseEdge: 200,
      cleaned: [{ id: 'a', dust: 100 }],
    };
    const snapshot = JSON.stringify(input);
    settleStarVaultCycle(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('settleStarVaultCycle — input validation', () => {
  const ok: StarVaultCycleInput = {
    priorLostInfluence: baseInfluence,
    casinoHouseEdge: 0,
    cleaned: [{ id: 'a', dust: 1 }],
  };

  it('rejects negative lost Influence', () => {
    expect(() =>
      settleStarVaultCycle({ ...ok, priorLostInfluence: { oldest: -1, middle: 0, newest: 0 } }),
    ).toThrow(RangeError);
  });

  it('rejects negative casino house edge', () => {
    expect(() => settleStarVaultCycle({ ...ok, casinoHouseEdge: -1 })).toThrow(RangeError);
  });

  it('rejects negative cleaned dust', () => {
    expect(() => settleStarVaultCycle({ ...ok, cleaned: [{ id: 'a', dust: -5 }] })).toThrow(
      RangeError,
    );
  });

  it('rejects a non-finite inflow', () => {
    expect(() => settleStarVaultCycle({ ...ok, casinoHouseEdge: NaN })).toThrow(TypeError);
  });

  it('rejects priorPoolDepletion outside [0, 1]', () => {
    expect(() => settleStarVaultCycle({ ...ok, priorPoolDepletion: 1.5 })).toThrow(RangeError);
  });

  it('rejects a skim rate ≥ 1', () => {
    expect(() => settleStarVaultCycle(ok, { skimRate: 1 })).toThrow(RangeError);
  });

  it('rejects a split weight outside [0, 1]', () => {
    expect(() => settleStarVaultCycle(ok, { defaultSplit: [1.2, 0.3, 0.3] })).toThrow(RangeError);
  });
});
