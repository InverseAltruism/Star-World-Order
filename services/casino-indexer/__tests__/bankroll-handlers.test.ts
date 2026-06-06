// Coverage for CasinoBankroll handlers — one row per event, idempotent on
// (txHash, logIndex). The handlers are append-only so each test asserts
// the shape of a single row rather than a state machine.

import { describe, expect, test } from 'vitest';

import { inMemoryBankrollStore } from '../src/bankroll-store';
import {
  onCircuitBreakerReset,
  onCircuitBreakerTripped,
  onDeposited,
  onGamePayout,
  onGameSettled,
  onWithdrawn,
} from '../src/bankroll-handlers';

const ALICE = '0x000000000000000000000000000000000000a11c' as const;
const BOB = '0x000000000000000000000000000000000000b0b0' as const;
const GAME = '0x000000000000000000000000000000000000bbbb' as const;
const TX = ('0x' + 'fe'.repeat(32)) as `0x${string}`;
const TX2 = ('0x' + 'de'.repeat(32)) as `0x${string}`;

describe('CasinoBankroll handlers', () => {
  test('Deposited writes a deposit row keyed on (txHash, logIndex)', async () => {
    const store = inMemoryBankrollStore();
    await onDeposited(
      store,
      { from: ALICE, amount: 5_000_000_000_000_000_000n },
      { blockNumber: 100n, blockTimestamp: 1_700_000_000n, txHash: TX, logIndex: 2 },
    );
    const row = await store.get(`${TX}-2`);
    expect(row).not.toBeNull();
    expect(row?.kind).toBe('deposit');
    expect(row?.counterparty).toBe(ALICE);
    expect(row?.recipient).toBeNull();
    expect(row?.amount).toBe('5000000000000000000');
    expect(row?.blockNumber).toBe('100');
    expect(row?.timestamp).toBe('1700000000');
    expect(row?.txHash).toBe(TX);
  });

  test('Withdrawn writes a withdraw row', async () => {
    const store = inMemoryBankrollStore();
    await onWithdrawn(
      store,
      { to: BOB, amount: 250n },
      { blockNumber: 101n, blockTimestamp: 1_700_000_010n, txHash: TX, logIndex: 0 },
    );
    const row = await store.get(`${TX}-0`);
    expect(row?.kind).toBe('withdraw');
    expect(row?.counterparty).toBe(BOB);
    expect(row?.amount).toBe('250');
  });

  test('GamePayout captures both game and recipient', async () => {
    const store = inMemoryBankrollStore();
    await onGamePayout(
      store,
      { game: GAME, recipient: ALICE, amount: 1_960_000_000_000_000n },
      { blockNumber: 102n, blockTimestamp: 1_700_000_020n, txHash: TX, logIndex: 1 },
    );
    const row = await store.get(`${TX}-1`);
    expect(row?.kind).toBe('gamePayout');
    expect(row?.counterparty).toBe(GAME);
    expect(row?.recipient).toBe(ALICE);
    expect(row?.amount).toBe('1960000000000000');
  });

  test('GameSettled records the credited stake', async () => {
    const store = inMemoryBankrollStore();
    await onGameSettled(
      store,
      { game: GAME, amount: 1_000_000_000_000_000n },
      { blockNumber: 103n, blockTimestamp: 1_700_000_030n, txHash: TX, logIndex: 3 },
    );
    const row = await store.get(`${TX}-3`);
    expect(row?.kind).toBe('gameSettled');
    expect(row?.counterparty).toBe(GAME);
    expect(row?.recipient).toBeNull();
    expect(row?.amount).toBe('1000000000000000');
  });

  test('CircuitBreakerTripped stores drawdown delta and event timestamp', async () => {
    const store = inMemoryBankrollStore();
    await onCircuitBreakerTripped(
      store,
      {
        windowStartBalance: 10_000_000_000_000_000_000n,
        currentBalance: 6_000_000_000_000_000_000n,
        maxDrawdown24hWei: 3_000_000_000_000_000_000n,
        timestamp: 1_700_000_100n,
      },
      { blockNumber: 200n, blockTimestamp: 1_700_000_111n, txHash: TX2, logIndex: 0 },
    );
    const row = await store.get(`${TX2}-0`);
    expect(row?.kind).toBe('circuitBreakerTripped');
    expect(row?.counterparty).toBeNull();
    expect(row?.recipient).toBeNull();
    // 10e18 − 6e18 = 4e18 drawdown delta
    expect(row?.amount).toBe('4000000000000000000');
    // Prefers event-payload timestamp over the envelope.
    expect(row?.timestamp).toBe('1700000100');
  });

  test('CircuitBreakerReset stores currentBalance snapshot', async () => {
    const store = inMemoryBankrollStore();
    await onCircuitBreakerReset(
      store,
      { currentBalance: 7_500_000_000_000_000_000n, timestamp: 1_700_086_400n },
      { blockNumber: 250n, blockTimestamp: 1_700_086_500n, txHash: TX2, logIndex: 1 },
    );
    const row = await store.get(`${TX2}-1`);
    expect(row?.kind).toBe('circuitBreakerReset');
    expect(row?.amount).toBe('7500000000000000000');
    expect(row?.timestamp).toBe('1700086400');
  });

  test('list returns rows newest-first', async () => {
    const store = inMemoryBankrollStore();
    await onDeposited(
      store,
      { from: ALICE, amount: 1n },
      { blockNumber: 100n, blockTimestamp: 1n, txHash: TX, logIndex: 0 },
    );
    await onWithdrawn(
      store,
      { to: BOB, amount: 2n },
      { blockNumber: 200n, blockTimestamp: 2n, txHash: TX2, logIndex: 0 },
    );
    const rows = await store.list(10);
    expect(rows.map((r) => r.kind)).toEqual(['withdraw', 'deposit']);
  });

  test('replaying the same (txHash, logIndex) is idempotent', async () => {
    const store = inMemoryBankrollStore();
    const ev = {
      blockNumber: 100n,
      blockTimestamp: 1n,
      txHash: TX,
      logIndex: 0,
    };
    await onDeposited(store, { from: ALICE, amount: 1n }, ev);
    await onDeposited(store, { from: ALICE, amount: 1n }, ev);
    expect(await store.count()).toBe(1);
  });
});
