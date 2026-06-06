// [SWO_V2_SANCTUARY_QUESTS_V2] — pure engine for the STAR-focused quest economy.
// See docs/SANCTUARY_ECONOMY_REDESIGN.md.
//
// Two quest kinds, both STAR-centric (legacy XP/bond-only quests are retired):
//   • earn  — no stake. Cost resources + a long wall-clock wait, return a small
//             GUARANTEED STAR amount. The non-gambling income floor. Two of them:
//             24h → 5 ★ and 48h → 15 ★.
//   • wager — stake a FIXED amount of STAR (5 / 15 / 30) up front. Tiered odds
//             shown before committing. On win the stake returns × a payout
//             multiplier; on lose it's forfeit. The single RNG (the roll) sits
//             on top of explicit player choices (Risk doctrine).
//
// Charms (bought in the Shop) are TRADE-OFFS that feed back into this loop —
// a wager "gambit" raises the payout multiplier but costs more stake; an earn
// "prospect" raises the STAR payout but costs more resources. Bigger upside,
// real downside. A guardrail (CHARM_EV_CAP) keeps even a charmed wager from
// running away into a STAR printer. Kept DOM-free for node tests.

import type { ResourceKey, ResourceSnapshot } from './walletResources';
import { RESOURCE_MIN } from './walletResources';

export type QuestKind = 'earn' | 'wager';
export type WagerTierLabel = 'safe' | 'risky' | 'reckless';

export type ResourceCost = Readonly<Record<ResourceKey, number>>;

/**
 * Charmed-wager expected-value ceiling. A gambit charm boosts the payout (and
 * raises the stake cost), which would otherwise push EV above 1 and let players
 * farm STAR. We clamp the effective `winChance × payoutMult` to this cap so a
 * charm is "remove the house edge, take bigger swings" — never free money. The
 * charm itself is a STAR sink to buy, so the net loop stays balanced. Base
 * (un-charmed) wagers keep their own house edge well below this.
 */
export const CHARM_EV_CAP = 1.15;

export interface WagerTier {
  label: WagerTierLabel;
  /** Win chance, 0..1. (Charms do NOT change the odds — they change the swing.) */
  baseWinChance: number;
  /** On win, total returned = stake × this multiplier (includes the stake). */
  payoutMult: number;
}

export interface QuestDef {
  key: string;
  kind: QuestKind;
  title: string;
  description: string;
  /** Wall-clock duration in seconds. */
  durationSeconds: number;
  /** Resource cost subtracted on start. */
  cost: ResourceCost;
  /** Minimum pool levels required to start (per resource). */
  thresholds: ResourceCost;
  /** earn-only: guaranteed STAR payout (before a prospect charm). */
  earnStar?: number;
  /** wager-only: tiers the player picks between. */
  tiers?: WagerTier[];
  /** wager-only: the fixed stake amounts a player may pick. */
  stakeOptions?: number[];
}

// --- Charm effects (trade-offs) ---------------------------------------------

export type CharmEffectType =
  | 'gambit' // wager: +upside payout multiplier, +downside stake cost
  | 'prospect'; // earn: +upside STAR payout, +downside resource cost

export interface CharmEffect {
  itemKey: string;
  type: CharmEffectType;
  /** Fraction added to the upside (payout mult for gambit, STAR for prospect). */
  upside: number;
  /** Fraction added to the downside (stake cost for gambit, resources for prospect). */
  downside: number;
}

// --- Resource cost / threshold gating ---------------------------------------

const RESOURCE_KEYS: ResourceKey[] = ['hunger', 'happiness', 'energy'];

/**
 * A quest's resource cost after charms. A prospect charm RAISES the cost (its
 * downside); a gambit charm doesn't touch resources. Rounded, never negative.
 */
export function questResourceCost(def: QuestDef, charm?: CharmEffect | null): ResourceCost {
  const mult = charm?.type === 'prospect' ? 1 + Math.max(0, charm.downside) : 1;
  return {
    hunger: Math.max(0, Math.round(def.cost.hunger * mult)),
    happiness: Math.max(0, Math.round(def.cost.happiness * mult)),
    energy: Math.max(0, Math.round(def.cost.energy * mult)),
  };
}

export interface CostGate {
  ok: boolean;
  failing: ResourceKey[];
}

/** Can this quest start given the current pool? Checks thresholds AND affordability. */
export function gateQuestStart(
  def: QuestDef,
  pool: ResourceSnapshot,
  charm?: CharmEffect | null,
): CostGate {
  const cost = questResourceCost(def, charm);
  const failing: ResourceKey[] = [];
  for (const k of RESOURCE_KEYS) {
    if (pool[k] < def.thresholds[k]) failing.push(k);
    else if (pool[k] < cost[k]) failing.push(k);
  }
  return { ok: failing.length === 0, failing };
}

/** Pool after paying a quest's (possibly charm-raised) cost — clamped at the floor. */
export function payCost(
  pool: ResourceSnapshot,
  def: QuestDef,
  charm?: CharmEffect | null,
): ResourceSnapshot {
  const cost = questResourceCost(def, charm);
  return {
    hunger: Math.max(RESOURCE_MIN, pool.hunger - cost.hunger),
    happiness: Math.max(RESOURCE_MIN, pool.happiness - cost.happiness),
    energy: Math.max(RESOURCE_MIN, pool.energy - cost.energy),
  };
}

// --- Earn payout -------------------------------------------------------------

/** Guaranteed STAR for an earn quest (scaled up by a prospect charm's upside). */
export function earnPayout(def: QuestDef, charm?: CharmEffect | null): number {
  const base = Math.max(0, def.earnStar ?? 0);
  if (charm?.type === 'prospect') return Math.round(base * (1 + Math.max(0, charm.upside)));
  return base;
}

// --- Wager: stake cost, odds, resolution ------------------------------------

/** The stake a player actually pays — a gambit charm raises it (its downside). */
export function effectiveStake(stake: number, charm?: CharmEffect | null): number {
  if (charm?.type === 'gambit') return Math.round(stake * (1 + Math.max(0, charm.downside)));
  return Math.round(stake);
}

export interface EffectiveWager {
  winChance: number;
  payoutMult: number; // after the gambit upside + EV clamp
  stake: number; // effective stake actually paid
  evMult: number; // winChance × payoutMult, ≤ CHARM_EV_CAP
  capped: boolean; // true if the EV cap clipped the gambit upside
}

/**
 * Effective wager terms after a gambit charm. The win chance is untouched
 * ("the odds seem decent"); the charm raises the payout multiplier and the
 * stake cost. The resulting EV is clamped to CHARM_EV_CAP so a charm can erase
 * the house edge and add swing, but never mint STAR.
 */
export function effectiveWager(
  tier: WagerTier,
  stake: number,
  charm?: CharmEffect | null,
): EffectiveWager {
  const winChance = tier.baseWinChance;
  const upside = charm?.type === 'gambit' ? Math.max(0, charm.upside) : 0;
  const rawMult = tier.payoutMult * (1 + upside);
  const evCeilMult = CHARM_EV_CAP / winChance;
  const payoutMult = Math.min(rawMult, evCeilMult);
  const capped = upside > 0 && payoutMult < rawMult;
  return {
    winChance,
    payoutMult,
    stake: effectiveStake(stake, charm),
    evMult: winChance * payoutMult,
    capped,
  };
}

export interface WagerOutcome {
  won: boolean;
  /** Net STAR delta vs. before staking (negative on loss = the effective stake). */
  net: number;
  /** STAR to credit on a win (effectiveStake × payoutMult); 0 on loss. */
  payout: number;
}

/** Resolve a wager deterministically given a roll in [0,1). The roll is the only RNG. */
export function resolveWager(
  tier: WagerTier,
  stake: number,
  roll: number,
  charm?: CharmEffect | null,
): WagerOutcome {
  const w = effectiveWager(tier, stake, charm);
  if (roll < w.winChance) {
    const payout = Math.round(w.stake * w.payoutMult);
    return { won: true, net: payout - w.stake, payout };
  }
  return { won: false, net: -w.stake, payout: 0 };
}

// --- Catalog -----------------------------------------------------------------

const H = 60 * 60;

/**
 * The shipped quest catalog — STAR only. Two earn quests (long, safe income)
 * and three wager quests (fixed stakes, escalating duration). Wager tiers are
 * shared; longer wagers pay a touch more as the reward for the wait.
 */
const WAGER_STAKES = [5, 15, 30];

export const QUEST_CATALOG: readonly QuestDef[] = Object.freeze([
  // ---- Earn (the income floor) ----
  {
    key: 'earn-daily-forage',
    kind: 'earn',
    title: 'Daily Forage',
    description: 'A full day foraging the starlit meadow. Reliable, hands-off STAR.',
    durationSeconds: 24 * H,
    cost: { hunger: 20, happiness: 10, energy: 15 },
    thresholds: { hunger: 25, happiness: 10, energy: 18 },
    earnStar: 5,
  },
  {
    key: 'earn-long-expedition',
    kind: 'earn',
    title: 'Long Expedition',
    description: 'A two-day expedition into the deep constellations. The bigger steady haul.',
    durationSeconds: 48 * H,
    cost: { hunger: 35, happiness: 20, energy: 30 },
    thresholds: { hunger: 40, happiness: 20, energy: 32 },
    earnStar: 15,
  },
  // ---- Wager (fixed stakes 5/15/30, escalating duration) ----
  {
    key: 'wager-comet-dash',
    kind: 'wager',
    title: 'Comet Dash',
    description: 'A short chase. Stake STAR, pick your nerve — the odds are shown.',
    durationSeconds: 6 * H,
    cost: { hunger: 12, happiness: 10, energy: 14 },
    thresholds: { hunger: 14, happiness: 10, energy: 16 },
    stakeOptions: WAGER_STAKES,
    tiers: [
      { label: 'safe', baseWinChance: 0.70, payoutMult: 1.3 },
      { label: 'risky', baseWinChance: 0.42, payoutMult: 2.1 },
      { label: 'reckless', baseWinChance: 0.18, payoutMult: 5.0 },
    ],
  },
  {
    key: 'wager-nebula-run',
    kind: 'wager',
    title: 'Nebula Run',
    description: 'A half-day plunge through the nebula. Slightly fatter multipliers.',
    durationSeconds: 12 * H,
    cost: { hunger: 16, happiness: 12, energy: 18 },
    thresholds: { hunger: 18, happiness: 12, energy: 20 },
    stakeOptions: WAGER_STAKES,
    tiers: [
      { label: 'safe', baseWinChance: 0.68, payoutMult: 1.38 },
      { label: 'risky', baseWinChance: 0.40, payoutMult: 2.3 },
      { label: 'reckless', baseWinChance: 0.16, payoutMult: 5.6 },
    ],
  },
  {
    key: 'wager-void-gambit',
    kind: 'wager',
    title: 'Void Gambit',
    description: 'A full day in the void. The longest wait, the biggest swings.',
    durationSeconds: 24 * H,
    cost: { hunger: 22, happiness: 16, energy: 24 },
    thresholds: { hunger: 24, happiness: 16, energy: 26 },
    stakeOptions: WAGER_STAKES,
    tiers: [
      { label: 'safe', baseWinChance: 0.66, payoutMult: 1.45 },
      { label: 'risky', baseWinChance: 0.38, payoutMult: 2.5 },
      { label: 'reckless', baseWinChance: 0.14, payoutMult: 6.5 },
    ],
  },
]);

export function getQuestDef(key: string): QuestDef | undefined {
  return QUEST_CATALOG.find((q) => q.key === key);
}

export function getWagerTier(def: QuestDef, label: string): WagerTier | undefined {
  return def.tiers?.find((t) => t.label === label);
}

/** Snap a requested stake to the nearest allowed fixed option for the quest. */
export function clampStake(def: QuestDef, stake: number): number {
  const opts = def.stakeOptions ?? [];
  if (opts.length === 0) return 0;
  if (opts.includes(stake)) return stake;
  return opts.reduce((best, o) => (Math.abs(o - stake) < Math.abs(best - stake) ? o : best), opts[0]);
}

/** Whether a stake is exactly one of the quest's fixed options. */
export function isValidStake(def: QuestDef, stake: number): boolean {
  return (def.stakeOptions ?? []).includes(stake);
}
