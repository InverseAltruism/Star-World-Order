// Coverage for the CasinoDice event handlers.
// Mirrors handlers.test.ts but uses the rollUnder/roll shape.

import { describe, expect, test } from 'vitest';

import { inMemoryDiceBetStore } from '../src/dice-store';
import {
  onDiceBetPlaced,
  onDiceBetSettled,
  onDiceBetRefunded,
} from '../src/dice-handlers';

const ALICE = '0x000000000000000000000000000000000000a11c' as const;
const SEED = ('0x' + 'ab'.repeat(32)) as `0x${string}`;
const COMMIT = ('0x' + '11'.repeat(32)) as `0x${string}`;
const REVEAL = ('0x' + 'ce'.repeat(32)) as `0x${string}`;

describe('CasinoDice handlers', () => {
  test('BetPlaced creates a pending row with rollUnder + null roll', async () => {
    const store = inMemoryDiceBetStore();
    await onDiceBetPlaced(
      store,
      {
        betId: 7n,
        player: ALICE,
        rollUnder: 49,
        stake: 1_000_000_000_000_000n,
        clientSeed: SEED,
        serverCommit: COMMIT,
        nonce: 3n,
        blockPlaced: 300n,
      },
      { blockNumber: 300n },
    );
    const row = await store.get('7');
    expect(row?.status).toBe('pending');
    expect(row?.rollUnder).toBe(49);
    expect(row?.roll).toBeNull();
    expect(row?.payout).toBeNull();
    expect(row?.serverReveal).toBeNull();
    expect(row?.settledAt).toBeNull();
    expect(row?.stake).toBe('1000000000000000');
  });

  test('BetSettled fills in the rolled face + payout + settledAt', async () => {
    const store = inMemoryDiceBetStore();
    await onDiceBetPlaced(
      store,
      {
        betId: 1n,
        player: ALICE,
        rollUnder: 50,
        stake: 2n,
        clientSeed: SEED,
        serverCommit: COMMIT,
        nonce: 0n,
        blockPlaced: 10n,
      },
      { blockNumber: 10n },
    );
    await onDiceBetSettled(
      store,
      {
        betId: 1n,
        player: ALICE,
        rollUnder: 50,
        roll: 17,
        won: true,
        payout: 3_960_000_000_000_000n,
        serverReveal: REVEAL,
      },
      { blockNumber: 12n },
    );
    const row = await store.get('1');
    expect(row?.status).toBe('won');
    expect(row?.roll).toBe(17);
    expect(row?.payout).toBe('3960000000000000');
    expect(row?.serverReveal).toBe(REVEAL);
    expect(row?.settledAt).toBe('12');
  });

  test('BetRefunded leaves roll null and sets refunded status', async () => {
    const store = inMemoryDiceBetStore();
    await onDiceBetPlaced(
      store,
      {
        betId: 99n,
        player: ALICE,
        rollUnder: 50,
        stake: 5n,
        clientSeed: SEED,
        serverCommit: COMMIT,
        nonce: 0n,
        blockPlaced: 20n,
      },
      { blockNumber: 20n },
    );
    await onDiceBetRefunded(
      store,
      { betId: 99n, player: ALICE, stake: 5n },
      { blockNumber: 555n },
    );
    const row = await store.get('99');
    expect(row?.status).toBe('refunded');
    expect(row?.roll).toBeNull();
    expect(row?.payout).toBe('0');
    expect(row?.settledAt).toBe('555');
  });
});
