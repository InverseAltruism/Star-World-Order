import { describe, it, expect } from 'vitest';
import { resolveArcade, isValidArcadeStake, ARCADE_MAX_MULT, ARCADE_HOUSE_RAKE, MINIGAME_PAR } from '../arcade';

describe('arcade skill-wager resolver', () => {
  it('hitting par returns the house edge (a small loss, not break-even)', () => {
    const par = MINIGAME_PAR['star-catch'];
    const r = resolveArcade('star-catch', 100, par);
    expect(r.payoutMult).toBeCloseTo(ARCADE_HOUSE_RAKE, 6);
    expect(r.net).toBeLessThan(0); // house keeps an edge at par
    expect(r.won).toBe(false);
  });

  it('beating par by ~9% breaks even / profits', () => {
    const par = MINIGAME_PAR['star-catch'];
    expect(resolveArcade('star-catch', 100, Math.round(par * 1.1)).won).toBe(true);
    expect(resolveArcade('star-catch', 100, par).won).toBe(false);
  });

  it('a flop loses the whole stake', () => {
    const r = resolveArcade('star-catch', 30, 0);
    expect(r.payout).toBe(0);
    expect(r.net).toBe(-30);
    expect(r.won).toBe(false);
  });

  it('a great score wins but is capped at MAX_MULT × rake', () => {
    const par = MINIGAME_PAR['lore-trivia'];
    const r = resolveArcade('lore-trivia', 10, par * 10);
    expect(r.payoutMult).toBeCloseTo(ARCADE_MAX_MULT * ARCADE_HOUSE_RAKE, 6);
    expect(r.payout).toBe(Math.round(10 * ARCADE_MAX_MULT * ARCADE_HOUSE_RAKE));
    expect(r.net).toBeGreaterThan(0);
  });

  it('payout scales with score below the cap', () => {
    const par = MINIGAME_PAR['forge-hammer'];
    const low = resolveArcade('forge-hammer', 15, par * 0.5);
    const high = resolveArcade('forge-hammer', 15, par * 1.5);
    expect(high.payout).toBeGreaterThan(low.payout);
    expect(low.won).toBe(false);
    expect(high.won).toBe(true);
  });

  it('effective max payout is bounded (no runaway faucet)', () => {
    // Even an absurd score cannot pay more than MAX_MULT×rake of the stake.
    const r = resolveArcade('star-catch', 30, 999999);
    expect(r.payout).toBeLessThanOrEqual(Math.round(30 * ARCADE_MAX_MULT * ARCADE_HOUSE_RAKE));
  });

  it('only fixed stakes are valid', () => {
    expect(isValidArcadeStake(15)).toBe(true);
    expect(isValidArcadeStake(7)).toBe(false);
  });

  it('unknown game falls back to a default par (no crash)', () => {
    expect(() => resolveArcade('mystery', 5, 100)).not.toThrow();
  });
});
