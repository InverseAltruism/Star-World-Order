// Cross-game recent-bets aggregation.
//
// Pulls settled rows from each game's store, normalises them to a shared
// `RecentBet` shape, and merges newest-first by block number. Used by the
// per-wallet recent-outcomes ticker. Per-game endpoints keep returning their
// typed rows; this helper is the cross-game union.

import type { Address } from 'viem';

import type { BetStore } from './bet-store';
import type { DiceBetStore } from './dice-store';
import type { HiLoSessionStore } from './hilo-store';

export type RecentGame = 'coinflip' | 'dice' | 'hilo';

export interface RecentBet {
  game: RecentGame;
  /** Coinflip/dice betId or hilo sessionId, stringified. */
  id: string;
  player: string;
  status: string;
  stake: string;
  payout: string | null;
  /** Block the bet was placed (or hilo session opened) in — sort key. */
  blockPlaced: string;
  settledAt: string | null;
}

export interface RecentBetsDeps {
  coinflip: BetStore;
  dice: DiceBetStore;
  hilo: HiLoSessionStore;
}

const TERMINAL_COINFLIP = new Set(['won', 'lost', 'refunded']);
const TERMINAL_DICE = new Set(['won', 'lost', 'refunded']);
const TERMINAL_HILO = new Set(['cashed', 'lost', 'refunded', 'pushed']);

function compareNewestFirst(a: RecentBet, b: RecentBet): number {
  const aBlk = BigInt(a.blockPlaced);
  const bBlk = BigInt(b.blockPlaced);
  if (aBlk !== bBlk) return aBlk > bBlk ? -1 : 1;
  try {
    const aId = BigInt(a.id);
    const bId = BigInt(b.id);
    return aId > bId ? -1 : aId < bId ? 1 : 0;
  } catch {
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  }
}

export async function recentBetsForPlayer(
  deps: RecentBetsDeps,
  player: Address,
  limit: number = 24,
): Promise<RecentBet[]> {
  const cap = Math.max(1, Math.floor(limit));
  const perGame = Math.min(cap * 3, 200);

  const [coinflipRows, diceRows, hiloRows] = await Promise.all([
    deps.coinflip.findByPlayer(player, perGame),
    deps.dice.findByPlayer(player, perGame),
    deps.hilo.findByPlayer(player, perGame),
  ]);

  const merged: RecentBet[] = [];
  for (const r of coinflipRows) {
    if (!TERMINAL_COINFLIP.has(r.status)) continue;
    merged.push({
      game: 'coinflip',
      id: r.betId,
      player: r.player,
      status: r.status,
      stake: r.stake,
      payout: r.payout,
      blockPlaced: r.blockPlaced,
      settledAt: r.settledAt,
    });
  }
  for (const r of diceRows) {
    if (!TERMINAL_DICE.has(r.status)) continue;
    merged.push({
      game: 'dice',
      id: r.betId,
      player: r.player,
      status: r.status,
      stake: r.stake,
      payout: r.payout,
      blockPlaced: r.blockPlaced,
      settledAt: r.settledAt,
    });
  }
  for (const r of hiloRows) {
    if (!TERMINAL_HILO.has(r.status)) continue;
    merged.push({
      game: 'hilo',
      id: r.sessionId,
      player: r.player,
      status: r.status,
      stake: r.stake,
      payout: r.payout,
      blockPlaced: r.blockOpened,
      settledAt: r.settledAt,
    });
  }

  merged.sort(compareNewestFirst);
  return merged.slice(0, cap);
}
