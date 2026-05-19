// Pure event handlers for CasinoHiLo.
//
// HiLo splits state across two tables: a mutable `HiLoSession` row plus
// append-only `HiLoStep` rows. The handlers take both stores and keep them
// in sync — `onHiLoSessionOpened` creates the session, `onHiLoStepPlayed`
// appends a step + updates the session's running multiplier/currentCard
// (and flips status to "lost" when the player busts), and the close
// handlers (cashed/refunded/pushed) terminate the session.

import type { Address, Hex } from 'viem';

import type {
  HiLoSessionStore,
  HiLoStepStore,
  HiLoDirection,
} from './hilo-store';

export interface HiLoSessionOpenedArgs {
  sessionId: bigint;
  player: Address;
  stake: bigint;
  clientSeed: Hex;
  serverCommit: Hex;
  initialCard: number;
  nonce: bigint;
  blockOpened: bigint;
}

export interface HiLoStepPlayedArgs {
  sessionId: bigint;
  player: Address;
  direction: HiLoDirection;
  prevCard: number;
  newCard: number;
  won: boolean;
  newMultiplier: bigint;
  serverReveal: Hex;
  nextCommit: Hex;
}

export interface HiLoSessionCashedArgs {
  sessionId: bigint;
  player: Address;
  payout: bigint;
  finalMultiplier: bigint;
}

export interface HiLoSessionRefundedArgs {
  sessionId: bigint;
  player: Address;
  stake: bigint;
}

export interface HiLoSessionPushedArgs {
  sessionId: bigint;
  player: Address;
  stake: bigint;
  card: number;
  multiplier: bigint;
}

export interface EventEnvelope {
  blockNumber: bigint;
}

const ONE_E18 = 1_000_000_000_000_000_000n;

export async function onHiLoSessionOpened(
  sessions: HiLoSessionStore,
  args: HiLoSessionOpenedArgs,
  _ev: EventEnvelope,
): Promise<void> {
  await sessions.create({
    sessionId: args.sessionId.toString(),
    player: args.player,
    stake: args.stake.toString(),
    clientSeed: args.clientSeed,
    serverCommit: args.serverCommit,
    initialCard: args.initialCard,
    currentCard: args.initialCard,
    nonce: args.nonce.toString(),
    status: 'open',
    multiplier: ONE_E18.toString(),
    finalMultiplier: null,
    payout: null,
    blockOpened: args.blockOpened.toString(),
    settledAt: null,
    stepCount: 0,
  });
}

export async function onHiLoStepPlayed(
  sessions: HiLoSessionStore,
  steps: HiLoStepStore,
  args: HiLoStepPlayedArgs,
  ev: EventEnvelope,
): Promise<void> {
  const sessionId = args.sessionId.toString();
  const cur = await sessions.get(sessionId);
  if (!cur) {
    throw new Error(`hilo step before session opened (${sessionId})`);
  }
  const stepIdx = cur.stepCount;

  await steps.append({
    id: `${sessionId}-${stepIdx}`,
    sessionId,
    stepIdx,
    player: args.player,
    direction: args.direction,
    prevCard: args.prevCard,
    newCard: args.newCard,
    won: args.won,
    newMultiplier: args.newMultiplier.toString(),
    serverReveal: args.serverReveal,
    nextCommit: args.nextCommit,
    blockNumber: ev.blockNumber.toString(),
  });

  if (!args.won) {
    await sessions.update(sessionId, {
      currentCard: args.newCard,
      multiplier: args.newMultiplier.toString(),
      stepCount: stepIdx + 1,
      status: 'lost',
      finalMultiplier: args.newMultiplier.toString(),
      settledAt: ev.blockNumber.toString(),
    });
  } else {
    await sessions.update(sessionId, {
      currentCard: args.newCard,
      multiplier: args.newMultiplier.toString(),
      stepCount: stepIdx + 1,
      serverCommit: args.nextCommit,
    });
  }
}

export async function onHiLoSessionCashed(
  sessions: HiLoSessionStore,
  args: HiLoSessionCashedArgs,
  ev: EventEnvelope,
): Promise<void> {
  await sessions.update(args.sessionId.toString(), {
    status: 'cashed',
    payout: args.payout.toString(),
    finalMultiplier: args.finalMultiplier.toString(),
    settledAt: ev.blockNumber.toString(),
  });
}

export async function onHiLoSessionRefunded(
  sessions: HiLoSessionStore,
  args: HiLoSessionRefundedArgs,
  ev: EventEnvelope,
): Promise<void> {
  await sessions.update(args.sessionId.toString(), {
    status: 'refunded',
    payout: args.stake.toString(),
    settledAt: ev.blockNumber.toString(),
  });
}

export async function onHiLoSessionPushed(
  sessions: HiLoSessionStore,
  args: HiLoSessionPushedArgs,
  ev: EventEnvelope,
): Promise<void> {
  await sessions.update(args.sessionId.toString(), {
    status: 'pushed',
    payout: args.stake.toString(),
    finalMultiplier: args.multiplier.toString(),
    settledAt: ev.blockNumber.toString(),
  });
}
