// Cross-game recent-bets aggregation: smoke + sort-order coverage.

import { describe, expect, test } from 'vitest';

import { inMemoryBetStore } from '../src/bet-store';
import { inMemoryDiceBetStore } from '../src/dice-store';
import { inMemoryHiLoSessionStore } from '../src/hilo-store';
import { recentBetsForPlayer } from '../src/recent-bets';
import { onBetPlaced, onBetSettled } from '../src/handlers';
import { onDiceBetPlaced, onDiceBetSettled } from '../src/dice-handlers';
import {
  onHiLoSessionOpened,
  onHiLoSessionCashed,
} from '../src/hilo-handlers';

const ALICE = '0x000000000000000000000000000000000000a11c' as const;
const SEED = ('0x' + 'ab'.repeat(32)) as `0x${string}`;
const COMMIT = ('0x' + '11'.repeat(32)) as `0x${string}`;
const REVEAL = ('0x' + 'ce'.repeat(32)) as `0x${string}`;

describe('recentBetsForPlayer', () => {
  test('merges settled rows from all three games newest-first', async () => {
    const coinflip = inMemoryBetStore();
    const dice = inMemoryDiceBetStore();
    const hilo = inMemoryHiLoSessionStore();

    await onBetPlaced(
      coinflip,
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
      coinflip,
      {
        betId: 1n,
        player: ALICE,
        outcome: 0,
        won: true,
        payout: 2n,
        serverReveal: REVEAL,
      },
      { blockNumber: 101n },
    );

    await onDiceBetPlaced(
      dice,
      {
        betId: 2n,
        player: ALICE,
        rollUnder: 50,
        stake: 1n,
        clientSeed: SEED,
        serverCommit: COMMIT,
        nonce: 0n,
        blockPlaced: 200n,
      },
      { blockNumber: 200n },
    );
    await onDiceBetSettled(
      dice,
      {
        betId: 2n,
        player: ALICE,
        rollUnder: 50,
        roll: 17,
        won: true,
        payout: 4n,
        serverReveal: REVEAL,
      },
      { blockNumber: 201n },
    );

    await onHiLoSessionOpened(
      hilo,
      {
        sessionId: 3n,
        player: ALICE,
        stake: 1n,
        clientSeed: SEED,
        serverCommit: COMMIT,
        initialCard: 7,
        nonce: 0n,
        blockOpened: 300n,
      },
      { blockNumber: 300n },
    );
    await onHiLoSessionCashed(
      hilo,
      {
        sessionId: 3n,
        player: ALICE,
        payout: 5n,
        finalMultiplier: 2_500_000_000_000_000_000n,
      },
      { blockNumber: 301n },
    );

    const rows = await recentBetsForPlayer({ coinflip, dice, hilo }, ALICE);
    expect(rows.map((r) => r.game)).toEqual(['hilo', 'dice', 'coinflip']);
    expect(rows[0].id).toBe('3');
    expect(rows[0].status).toBe('cashed');
    expect(rows[2].id).toBe('1');
    expect(rows[2].status).toBe('won');
  });

  test('limit clamps the merged result', async () => {
    const coinflip = inMemoryBetStore();
    const dice = inMemoryDiceBetStore();
    const hilo = inMemoryHiLoSessionStore();

    for (let i = 1; i <= 5; i++) {
      await onBetPlaced(
        coinflip,
        {
          betId: BigInt(i),
          player: ALICE,
          side: 0,
          stake: 1n,
          clientSeed: SEED,
          serverCommit: COMMIT,
          nonce: 0n,
          blockPlaced: BigInt(100 + i),
        },
        { blockNumber: BigInt(100 + i) },
      );
      await onBetSettled(
        coinflip,
        {
          betId: BigInt(i),
          player: ALICE,
          outcome: 0,
          won: true,
          payout: 2n,
          serverReveal: REVEAL,
        },
        { blockNumber: BigInt(100 + i + 1) },
      );
    }

    const rows = await recentBetsForPlayer(
      { coinflip, dice, hilo },
      ALICE,
      2,
    );
    expect(rows.length).toBe(2);
    expect(rows[0].id).toBe('5');
    expect(rows[1].id).toBe('4');
  });
});
