// Pure event handlers for CasinoBankroll.
//
// Append-only translation: each event becomes a row in the bankroll table.
// The store is runtime-agnostic (see bankroll-store.ts) so vitest can drive
// the handlers without Ponder + a live RPC.

import type { Address, Hex } from 'viem';

import type { BankrollStore } from './bankroll-store';

export interface BankrollEventEnvelope {
  blockNumber: bigint;
  /** Block timestamp; required because bankroll cash-flow is time-series. */
  blockTimestamp: bigint;
  txHash: Hex;
  logIndex: number;
}

export interface DepositedArgs {
  from: Address;
  amount: bigint;
}

export interface WithdrawnArgs {
  to: Address;
  amount: bigint;
}

export interface GamePayoutArgs {
  game: Address;
  recipient: Address;
  amount: bigint;
}

export interface GameSettledArgs {
  game: Address;
  amount: bigint;
}

export interface CircuitBreakerTrippedArgs {
  windowStartBalance: bigint;
  currentBalance: bigint;
  maxDrawdown24hWei: bigint;
  timestamp: bigint;
}

export interface CircuitBreakerResetArgs {
  currentBalance: bigint;
  timestamp: bigint;
}

function rowId(ev: BankrollEventEnvelope): string {
  return `${ev.txHash}-${ev.logIndex}`;
}

export async function onDeposited(
  store: BankrollStore,
  args: DepositedArgs,
  ev: BankrollEventEnvelope,
): Promise<void> {
  await store.create({
    id: rowId(ev),
    kind: 'deposit',
    counterparty: args.from,
    recipient: null,
    amount: args.amount.toString(),
    blockNumber: ev.blockNumber.toString(),
    timestamp: ev.blockTimestamp.toString(),
    txHash: ev.txHash,
  });
}

export async function onWithdrawn(
  store: BankrollStore,
  args: WithdrawnArgs,
  ev: BankrollEventEnvelope,
): Promise<void> {
  await store.create({
    id: rowId(ev),
    kind: 'withdraw',
    counterparty: args.to,
    recipient: null,
    amount: args.amount.toString(),
    blockNumber: ev.blockNumber.toString(),
    timestamp: ev.blockTimestamp.toString(),
    txHash: ev.txHash,
  });
}

export async function onGamePayout(
  store: BankrollStore,
  args: GamePayoutArgs,
  ev: BankrollEventEnvelope,
): Promise<void> {
  await store.create({
    id: rowId(ev),
    kind: 'gamePayout',
    counterparty: args.game,
    recipient: args.recipient,
    amount: args.amount.toString(),
    blockNumber: ev.blockNumber.toString(),
    timestamp: ev.blockTimestamp.toString(),
    txHash: ev.txHash,
  });
}

export async function onGameSettled(
  store: BankrollStore,
  args: GameSettledArgs,
  ev: BankrollEventEnvelope,
): Promise<void> {
  await store.create({
    id: rowId(ev),
    kind: 'gameSettled',
    counterparty: args.game,
    recipient: null,
    amount: args.amount.toString(),
    blockNumber: ev.blockNumber.toString(),
    timestamp: ev.blockTimestamp.toString(),
    txHash: ev.txHash,
  });
}

export async function onCircuitBreakerTripped(
  store: BankrollStore,
  args: CircuitBreakerTrippedArgs,
  ev: BankrollEventEnvelope,
): Promise<void> {
  await store.create({
    id: rowId(ev),
    kind: 'circuitBreakerTripped',
    counterparty: null,
    recipient: null,
    // Repurpose `amount` as the drawdown delta — windowStart minus current.
    // Treasury consumers can read `windowStartBalance - currentBalance` to
    // see how much was lost in the rolling window.
    amount: (args.windowStartBalance - args.currentBalance).toString(),
    blockNumber: ev.blockNumber.toString(),
    // Event payload carries its own timestamp; prefer it over the envelope
    // because the contract captures `block.timestamp` at the trip site.
    timestamp: args.timestamp.toString(),
    txHash: ev.txHash,
  });
}

export async function onCircuitBreakerReset(
  store: BankrollStore,
  args: CircuitBreakerResetArgs,
  ev: BankrollEventEnvelope,
): Promise<void> {
  await store.create({
    id: rowId(ev),
    kind: 'circuitBreakerReset',
    counterparty: null,
    recipient: null,
    amount: args.currentBalance.toString(),
    blockNumber: ev.blockNumber.toString(),
    timestamp: args.timestamp.toString(),
    txHash: ev.txHash,
  });
}
