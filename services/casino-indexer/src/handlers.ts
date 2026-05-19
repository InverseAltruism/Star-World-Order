// Pure event handlers for CasinoCoinflip.
//
// Designed to be runtime-agnostic: the handlers take a `BetStore` instance
// instead of binding to Ponder's `context.db.*` directly, so we can drive
// them from vitest against an in-memory store. `src/index.ts` adapts these
// handlers to the Ponder runtime by wrapping the context entity API.

import type { Address, Hex } from 'viem';

import type { BetStore } from './bet-store';
import { sideFromUint } from './bet-store';

export interface PlacedArgs {
  betId: bigint;
  player: Address;
  side: number;
  stake: bigint;
  clientSeed: Hex;
  serverCommit: Hex;
  nonce: bigint;
  blockPlaced: bigint;
}

export interface SettledArgs {
  betId: bigint;
  player: Address;
  outcome: number;
  won: boolean;
  payout: bigint;
  serverReveal: Hex;
}

export interface RefundedArgs {
  betId: bigint;
  player: Address;
  stake: bigint;
}

export interface EventEnvelope {
  /** Block number the log was mined in. Settled-at uses this. */
  blockNumber: bigint;
}

export async function onBetPlaced(
  store: BetStore,
  args: PlacedArgs,
  _ev: EventEnvelope,
): Promise<void> {
  await store.create({
    betId: args.betId.toString(),
    player: args.player,
    side: sideFromUint(args.side),
    outcome: null,
    stake: args.stake.toString(),
    clientSeed: args.clientSeed,
    serverCommit: args.serverCommit,
    nonce: args.nonce.toString(),
    status: 'pending',
    payout: null,
    serverReveal: null,
    blockPlaced: args.blockPlaced.toString(),
    settledAt: null,
  });
}

export async function onBetSettled(
  store: BetStore,
  args: SettledArgs,
  ev: EventEnvelope,
): Promise<void> {
  await store.update(args.betId.toString(), {
    status: args.won ? 'won' : 'lost',
    outcome: sideFromUint(args.outcome),
    payout: args.payout.toString(),
    serverReveal: args.serverReveal,
    settledAt: ev.blockNumber.toString(),
  });
}

export async function onBetRefunded(
  store: BetStore,
  args: RefundedArgs,
  ev: EventEnvelope,
): Promise<void> {
  await store.update(args.betId.toString(), {
    status: 'refunded',
    payout: '0',
    settledAt: ev.blockNumber.toString(),
  });
}
