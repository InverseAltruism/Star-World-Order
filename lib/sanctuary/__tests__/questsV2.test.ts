// [SWO_V2_SANCTUARY_QUESTS_V2] — engine tests. Headline invariant: a gambit charm
// can erase the house edge and add swing, but the EV stays ≤ CHARM_EV_CAP so no
// charm turns a wager into a STAR printer.
import { describe, it, expect } from 'vitest';
import {
  QUEST_CATALOG,
  CHARM_EV_CAP,
  getQuestDef,
  clampStake,
  isValidStake,
  questResourceCost,
  gateQuestStart,
  payCost,
  earnPayout,
  effectiveStake,
  effectiveWager,
  resolveWager,
  type CharmEffect,
  type WagerTier,
} from '../questsV2';
import type { ResourceSnapshot } from '../walletResources';

const FULL: ResourceSnapshot = { hunger: 100, happiness: 100, energy: 100 };
const GAMBIT: CharmEffect = { itemKey: 'gambit', type: 'gambit', upside: 0.35, downside: 0.25 };
const PROSPECT: CharmEffect = { itemKey: 'prospect', type: 'prospect', upside: 0.5, downside: 0.5 };

describe('quest catalog shape (per operator spec)', () => {
  it('has exactly 2 earn quests at 24h→5 and 48h→15', () => {
    const earn = QUEST_CATALOG.filter((q) => q.kind === 'earn');
    expect(earn).toHaveLength(2);
    const byDur = earn.slice().sort((a, b) => a.durationSeconds - b.durationSeconds);
    expect(byDur[0].durationSeconds).toBe(24 * 3600);
    expect(byDur[0].earnStar).toBe(5);
    expect(byDur[1].durationSeconds).toBe(48 * 3600);
    expect(byDur[1].earnStar).toBe(15);
  });

  it('has exactly 3 wager quests at 6h / 12h / 24h with fixed 5/15/30 stakes', () => {
    const wager = QUEST_CATALOG.filter((q) => q.kind === 'wager');
    expect(wager).toHaveLength(3);
    const durs = wager.map((q) => q.durationSeconds).sort((a, b) => a - b);
    expect(durs).toEqual([6 * 3600, 12 * 3600, 24 * 3600]);
    for (const q of wager) expect(q.stakeOptions).toEqual([5, 15, 30]);
  });

  it('every wager tier keeps a house edge before any charm', () => {
    for (const q of QUEST_CATALOG) {
      for (const t of q.tiers ?? []) expect(t.baseWinChance * t.payoutMult).toBeLessThan(1);
    }
  });
});

describe('fixed stakes', () => {
  const def = getQuestDef('wager-comet-dash')!;
  it('accepts only the fixed options', () => {
    expect(isValidStake(def, 15)).toBe(true);
    expect(isValidStake(def, 7)).toBe(false);
  });
  it('snaps an arbitrary stake to the nearest option', () => {
    expect(clampStake(def, 6)).toBe(5);
    expect(clampStake(def, 99)).toBe(30);
  });
});

describe('earn payout + prospect charm trade-off', () => {
  const def = getQuestDef('earn-daily-forage')!;
  it('returns the guaranteed amount with no charm', () => {
    expect(earnPayout(def)).toBe(5);
  });
  it('prospect raises STAR (upside) AND resource cost (downside)', () => {
    expect(earnPayout(def, PROSPECT)).toBe(Math.round(5 * 1.5));
    const baseCost = questResourceCost(def);
    const upCost = questResourceCost(def, PROSPECT);
    expect(upCost.hunger).toBe(Math.round(baseCost.hunger * 1.5));
  });
});

describe('resource gating', () => {
  const def = getQuestDef('earn-long-expedition')!;
  it('blocks when below threshold, allows when full', () => {
    expect(gateQuestStart(def, { hunger: 5, happiness: 100, energy: 100 }).ok).toBe(false);
    expect(gateQuestStart(def, FULL).ok).toBe(true);
  });
  it('a prospect charm can push a borderline start out of reach (higher cost)', () => {
    const pool: ResourceSnapshot = { hunger: 41, happiness: 21, energy: 33 };
    expect(gateQuestStart(def, pool).ok).toBe(true);
    expect(gateQuestStart(def, pool, PROSPECT).ok).toBe(false);
  });
  it('pays cost without dropping below the floor', () => {
    const after = payCost({ hunger: 3, happiness: 3, energy: 3 }, def);
    expect(after.hunger).toBe(0);
  });
});

describe('gambit charm — bigger swing, capped EV', () => {
  const def = getQuestDef('wager-void-gambit')!;
  const tier: WagerTier = def.tiers!.find((t) => t.label === 'safe')!;

  it('raises the effective stake (downside)', () => {
    expect(effectiveStake(20, GAMBIT)).toBe(Math.round(20 * 1.25));
    expect(effectiveStake(20)).toBe(20);
  });

  it('raises the payout multiplier (upside) but keeps win chance', () => {
    const base = effectiveWager(tier, 15);
    const charmed = effectiveWager(tier, 15, GAMBIT);
    expect(charmed.winChance).toBeCloseTo(base.winChance, 6);
    expect(charmed.payoutMult).toBeGreaterThan(base.payoutMult);
  });

  it('clamps charmed EV to CHARM_EV_CAP across all tiers', () => {
    const huge: CharmEffect = { itemKey: 'x', type: 'gambit', upside: 5, downside: 0.25 };
    for (const t of def.tiers!) {
      const w = effectiveWager(t, 15, huge);
      expect(w.evMult).toBeLessThanOrEqual(CHARM_EV_CAP + 1e-9);
      expect(w.capped).toBe(true);
    }
  });

  it('base (un-charmed) wagers stay a sink over many rolls', () => {
    const t = def.tiers!.find((x) => x.label === 'risky')!;
    let net = 0;
    const N = 100_000;
    for (let i = 0; i < N; i++) net += resolveWager(t, 15, (i + 0.5) / N).net;
    expect(net).toBeLessThan(0);
  });

  it('even a maxed gambit cannot make the long-run net exceed the EV cap', () => {
    const huge: CharmEffect = { itemKey: 'x', type: 'gambit', upside: 9, downside: 0.25 };
    const t = def.tiers!.find((x) => x.label === 'reckless')!;
    let net = 0;
    const N = 200_000;
    const stake = effectiveStake(30, huge);
    for (let i = 0; i < N; i++) net += resolveWager(t, 30, (i + 0.5) / N, huge).net;
    // mean net per play ≤ stake × (CHARM_EV_CAP − 1)
    expect(net / N).toBeLessThanOrEqual(stake * (CHARM_EV_CAP - 1) + 1e-6);
  });
});

describe('wager resolution is deterministic in the roll', () => {
  const t: WagerTier = { label: 'risky', baseWinChance: 0.42, payoutMult: 2.1 };
  it('roll below win chance wins; at/above loses', () => {
    expect(resolveWager(t, 15, 0).won).toBe(true);
    expect(resolveWager(t, 15, 0.99).won).toBe(false);
    expect(resolveWager(t, 15, 0.99).net).toBe(-15);
  });
});
