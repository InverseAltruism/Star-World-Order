// Coverage for the CasinoCoinflip event handlers.
//
// Drives the in-memory mock RPC fixture through the runtime-agnostic
// handlers (src/handlers.ts) and asserts the resulting `bets` rows. This
// is the test that backs the "writes ≥1 bets row" acceptance criterion —
// `npx vitest run services/casino-indexer` exercises it without needing
// Ponder + a real RPC.

import { describe, expect, test } from 'vitest';

import { inMemoryBetStore } from '../src/bet-store';
import {
  bootstrapWithFixture,
  buildMockRpcFixture,
} from '../src/index';
import {
  onBetPlaced,
  onBetSettled,
  onBetRefunded,
} from '../src/handlers';

const ALICE = '0x000000000000000000000000000000000000a11c' as const;
const SEED = ('0x' + 'ab'.repeat(32)) as `0x${string}`;
const COMMIT = ('0x' + '11'.repeat(32)) as `0x${string}`;
const REVEAL = ('0x' + 'ce'.repeat(32)) as `0x${string}`;

describe('CasinoCoinflip handlers', () => {
  test('fixture writes ≥1 bets row (acceptance: dev --once)', async () => {
    const { store } = await bootstrapWithFixture();
    const total = await store.count();
    expect(total).toBeGreaterThanOrEqual(1);
    expect(total).toBe(3);
  });

  test('BetPlaced creates a pending row with the correct shape', async () => {
    const store = inMemoryBetStore();
    await onBetPlaced(
      store,
      {
        betId: 42n,
        player: ALICE,
        side: 0,
        stake: 1_000_000_000_000_000n,
        clientSeed: SEED,
        serverCommit: COMMIT,
        nonce: 7n,
        blockPlaced: 200n,
      },
      { blockNumber: 200n },
    );
    const row = await store.get('42');
    expect(row).not.toBeNull();
    expect(row?.status).toBe('pending');
    expect(row?.side).toBe('heads');
    expect(row?.outcome).toBeNull();
    expect(row?.payout).toBeNull();
    expect(row?.serverReveal).toBeNull();
    expect(row?.settledAt).toBeNull();
    expect(row?.player).toBe(ALICE);
    expect(row?.stake).toBe('1000000000000000');
    expect(row?.nonce).toBe('7');
    expect(row?.blockPlaced).toBe('200');
  });

  test('BetSettled upgrades the row with rolled outcome + payout + settledAt', async () => {
    const store = inMemoryBetStore();
    await onBetPlaced(
      store,
      {
        betId: 1n,
        player: ALICE,
        side: 0,
        stake: 1n,
        clientSeed: SEED,
        serverCommit: COMMIT,
        nonce: 0n,
        blockPlaced: 100n,
      },
      { blockNumber: 100n },
    );
    await onBetSettled(
      store,
      {
        betId: 1n,
        player: ALICE,
        outcome: 1,
        won: false,
        payout: 0n,
        serverReveal: REVEAL,
      },
      { blockNumber: 105n },
    );
    const row = await store.get('1');
    expect(row?.status).toBe('lost');
    expect(row?.outcome).toBe('tails');
    expect(row?.payout).toBe('0');
    expect(row?.serverReveal).toBe(REVEAL);
    expect(row?.settledAt).toBe('105');
  });

  test('BetRefunded marks the row refunded with settledAt = refund block', async () => {
    const store = inMemoryBetStore();
    await onBetPlaced(
      store,
      {
        betId: 9n,
        player: ALICE,
        side: 1,
        stake: 1n,
        clientSeed: SEED,
        serverCommit: COMMIT,
        nonce: 0n,
        blockPlaced: 50n,
      },
      { blockNumber: 50n },
    );
    await onBetRefunded(
      store,
      { betId: 9n, player: ALICE, stake: 1n },
      { blockNumber: 9999n },
    );
    const row = await store.get('9');
    expect(row?.status).toBe('refunded');
    expect(row?.payout).toBe('0');
    expect(row?.outcome).toBeNull();
    expect(row?.settledAt).toBe('9999');
  });

  test('fixture deterministically replays in event order', () => {
    const fixture = buildMockRpcFixture();
    const kinds = fixture.events.map((e) => e.kind);
    expect(kinds).toEqual([
      'BetPlaced',
      'BetSettled',
      'BetPlaced',
      'BetSettled',
      'BetPlaced',
      'BetRefunded',
    ]);
  });
});
