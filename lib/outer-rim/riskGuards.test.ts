/**
 * Unit tests for the Outer Rim real-execution risk guards.
 *
 * Each guard has at least a trip case and a reset/clear case, per the
 * [SWO_OUTER_RIM_RISK_GUARDRAILS] acceptance criteria. Everything is pure:
 * no clock, no network, no venue.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RISK_CONFIG,
  notionalCapGuard,
  leverageCapGuard,
  leverageCapFor,
  initCircuitBreaker,
  stepCircuitBreaker,
  resetCircuitBreaker,
  circuitBreakerGuard,
  oracleDivergenceGuard,
  failedOpenGuard,
  budgetExhaustionGuard,
  assessRealLeg,
  type CircuitBreakerState,
} from './riskGuards';

const DAY = 86_400_000;

describe('Guard 1 — per-epoch notional cap', () => {
  it('trips when projected notional exceeds % of treasury', () => {
    // cap = 1000 * 0.10 = 100 MON
    const v = notionalCapGuard(90, 20, 1000);
    expect(v.tripped).toBe(true);
    expect(v.action).toBe('degrade-to-synthetic');
  });

  it('clears when projected notional stays within the cap', () => {
    const v = notionalCapGuard(50, 40, 1000);
    expect(v.tripped).toBe(false);
    expect(v.ok).toBe(true);
  });
});

describe('Guard 2 — leverage cap', () => {
  it('Mode C caps at 5× (well under the 50× venue cap)', () => {
    expect(leverageCapFor('C')).toBe(5);
    expect(leverageCapFor('B')).toBe(10);
    expect(leverageCapGuard(6, 'C').tripped).toBe(true);
  });

  it('clears when leverage is within the mode cap', () => {
    expect(leverageCapGuard(5, 'C').ok).toBe(true);
    expect(leverageCapGuard(10, 'B').ok).toBe(true);
  });

  it('rejects invalid (non-positive / NaN) leverage on a real mode', () => {
    expect(leverageCapGuard(0, 'C').tripped).toBe(true);
    expect(leverageCapGuard(NaN, 'B').tripped).toBe(true);
  });

  it('Mode A has no real leverage to bound', () => {
    expect(leverageCapGuard(9999, 'A').ok).toBe(true);
  });
});

describe('Guard 3 — daily loss circuit breaker', () => {
  const t0 = 10 * DAY; // arbitrary day boundary

  it('trips (opens) once cumulative daily loss reaches the limit', () => {
    let s = initCircuitBreaker(t0);
    s = stepCircuitBreaker(s, { type: 'loss', amountMon: 100, nowMs: t0 });
    expect(s.status).toBe('closed');
    s = stepCircuitBreaker(s, { type: 'loss', amountMon: 200, nowMs: t0 + 1000 }); // 300 >= 250
    expect(s.status).toBe('open');
    expect(circuitBreakerGuard(s)).toMatchObject({ tripped: true, action: 'halt-real' });
  });

  it('re-arms (resets) on a tick after the cooldown elapses', () => {
    let s: CircuitBreakerState = {
      status: 'open',
      openedAtMs: t0,
      reason: 'x',
      dayIndex: Math.floor(t0 / DAY),
      cumulativeLossMon: 300,
    };
    // before cooldown → still open
    s = stepCircuitBreaker(s, { type: 'tick', nowMs: t0 + DEFAULT_RISK_CONFIG.breakerCooldownMs - 1 });
    expect(s.status).toBe('open');
    // after cooldown → closed
    s = stepCircuitBreaker(s, { type: 'tick', nowMs: t0 + DEFAULT_RISK_CONFIG.breakerCooldownMs });
    expect(s.status).toBe('closed');
    expect(circuitBreakerGuard(s).ok).toBe(true);
  });

  it('resets the cumulative loss tally on a UTC day rollover', () => {
    let s = initCircuitBreaker(t0);
    s = stepCircuitBreaker(s, { type: 'loss', amountMon: 200, nowMs: t0 });
    s = stepCircuitBreaker(s, { type: 'tick', nowMs: t0 + DAY }); // next day
    expect(s.cumulativeLossMon).toBe(0);
  });

  it('manual reset re-arms immediately', () => {
    const open: CircuitBreakerState = {
      status: 'open',
      openedAtMs: t0,
      reason: 'x',
      dayIndex: Math.floor(t0 / DAY),
      cumulativeLossMon: 999,
    };
    const s = resetCircuitBreaker(open, t0 + 5);
    expect(s.status).toBe('closed');
    expect(s.cumulativeLossMon).toBe(0);
  });
});

describe('Guard 4 — oracle ↔ venue divergence', () => {
  it('trips when divergence exceeds tolerance (default 50 bps)', () => {
    // 100 vs 100.6 → 60 bps > 50
    const v = oracleDivergenceGuard(100, 100.6);
    expect(v.tripped).toBe(true);
    expect(v.action).toBe('refund-and-degrade');
  });

  it('clears when within tolerance', () => {
    // 100 vs 100.3 → 30 bps < 50
    expect(oracleDivergenceGuard(100, 100.3).ok).toBe(true);
  });

  it('treats a non-positive price as a failed reconciliation', () => {
    expect(oracleDivergenceGuard(0, 100).tripped).toBe(true);
  });
});

describe('Guard 5 — failed-open handling', () => {
  it('clears on a clean fill at/above min fraction', () => {
    expect(failedOpenGuard({ status: 'filled', filledFraction: 1 }).ok).toBe(true);
  });

  it.each(['no-fill', 'timeout', 'rejected'] as const)(
    'trips on %s → refund-and-degrade',
    (status) => {
      const v = failedOpenGuard({ status, filledFraction: 0 });
      expect(v.tripped).toBe(true);
      expect(v.action).toBe('refund-and-degrade');
    },
  );

  it('trips on a partial fill below the minimum fraction', () => {
    expect(failedOpenGuard({ status: 'partial', filledFraction: 0.5 }).tripped).toBe(true);
  });

  it('clears on a partial fill at/above the minimum fraction', () => {
    expect(failedOpenGuard({ status: 'partial', filledFraction: 0.97 }).ok).toBe(true);
  });
});

describe('Guard 6 — per-epoch real-position budget', () => {
  it('trips when the per-epoch budget is exhausted', () => {
    const v = budgetExhaustionGuard(DEFAULT_RISK_CONFIG.maxRealPositionsPerEpoch);
    expect(v.tripped).toBe(true);
    expect(v.action).toBe('degrade-to-synthetic');
  });

  it('clears at the start of a fresh epoch (used = 0)', () => {
    expect(budgetExhaustionGuard(0).ok).toBe(true);
  });
});

describe('assessRealLeg — composition & precedence', () => {
  const base = {
    mode: 'C' as const,
    leverage: 5,
    requestedNotionalMon: 10,
    epochNotionalUsedMon: 0,
    epochRealPositionsUsed: 0,
    treasuryMon: 1000,
    breaker: initCircuitBreaker(0),
  };

  it('allows a clean Mode C request', () => {
    expect(assessRealLeg(base).ok).toBe(true);
  });

  it('Mode A short-circuits to allow', () => {
    expect(assessRealLeg({ ...base, mode: 'A', leverage: 9999 }).ok).toBe(true);
  });

  it('open breaker halts before any other check', () => {
    const breaker: CircuitBreakerState = {
      status: 'open',
      openedAtMs: 0,
      reason: 'daily loss',
      dayIndex: 0,
      cumulativeLossMon: 300,
    };
    const v = assessRealLeg({ ...base, breaker, leverage: 9999 });
    expect(v.action).toBe('halt-real');
  });

  it('flags leverage breach when system is otherwise healthy', () => {
    const v = assessRealLeg({ ...base, leverage: 6 });
    expect(v.tripped).toBe(true);
    expect(v.action).toBe('degrade-to-synthetic');
  });
});
