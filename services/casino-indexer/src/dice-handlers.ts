// Pure event handlers for CasinoDice.
//
// Mirrors `handlers.ts` (coinflip): runtime-agnostic, takes a `DiceBetStore`
// instead of binding to Ponder's `context.db.*` directly.

import type { Address, Hex } from 'viem';

import type { DiceBetStore } from './dice-store';

export interface DicePlacedArgs {
  betId: bigint;
  player: Address;
  rollUnder: number;
  stake: bigint;
  clientSeed: Hex;
  serverCommit: Hex;
  nonce: bigint;
  blockPlaced: bigint;
}

export interface DiceSettledArgs {
  betId: bigint;
  player: Address;
  rollUnder: number;
  roll: number;
  won: boolean;
  payout: bigint;
  serverReveal: Hex;
}

export interface DiceRefundedArgs {
  betId: bigint;
  player: Address;
  stake: bigint;
}

export interface EventEnvelope {
  blockNumber: bigint;
}

export async function onDiceBetPlaced(
  store: DiceBetStore,
  args: DicePlacedArgs,
  _ev: EventEnvelope,
): Promise<void> {
  await store.create({
    betId: args.betId.toString(),
    player: args.player,
    rollUnder: args.rollUnder,
    roll: null,
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

export async function onDiceBetSettled(
  store: DiceBetStore,
  args: DiceSettledArgs,
  ev: EventEnvelope,
): Promise<void> {
  await store.update(args.betId.toString(), {
    status: args.won ? 'won' : 'lost',
    roll: args.roll,
    payout: args.payout.toString(),
    serverReveal: args.serverReveal,
    settledAt: ev.blockNumber.toString(),
  });
}

export async function onDiceBetRefunded(
  store: DiceBetStore,
  args: DiceRefundedArgs,
  ev: EventEnvelope,
): Promise<void> {
  await store.update(args.betId.toString(), {
    status: 'refunded',
    payout: '0',
    settledAt: ev.blockNumber.toString(),
  });
}
