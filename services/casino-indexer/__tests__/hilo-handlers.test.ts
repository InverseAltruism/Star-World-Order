// Coverage for the CasinoHiLo event handlers.
// Exercises the session lifecycle: opened → step → step → cashed.
// Also covers refunded, pushed, and bust-on-step.

import { describe, expect, test } from 'vitest';

import {
  inMemoryHiLoSessionStore,
  inMemoryHiLoStepStore,
} from '../src/hilo-store';
import {
  onHiLoSessionOpened,
  onHiLoStepPlayed,
  onHiLoSessionCashed,
  onHiLoSessionRefunded,
  onHiLoSessionPushed,
} from '../src/hilo-handlers';

const ALICE = '0x000000000000000000000000000000000000a11c' as const;
const SEED = ('0x' + 'ab'.repeat(32)) as `0x${string}`;
const COMMIT = ('0x' + '11'.repeat(32)) as `0x${string}`;
const NEXT_COMMIT = ('0x' + '22'.repeat(32)) as `0x${string}`;
const REVEAL = ('0x' + 'ce'.repeat(32)) as `0x${string}`;

const ONE_E18 = 1_000_000_000_000_000_000n;

describe('CasinoHiLo handlers', () => {
  test('SessionOpened creates an open session at 1.0x', async () => {
    const sessions = inMemoryHiLoSessionStore();
    await onHiLoSessionOpened(
      sessions,
      {
        sessionId: 1n,
        player: ALICE,
        stake: 1_000_000_000_000_000n,
        clientSeed: SEED,
        serverCommit: COMMIT,
        initialCard: 7,
        nonce: 0n,
        blockOpened: 100n,
      },
      { blockNumber: 100n },
    );
    const row = await sessions.get('1');
    expect(row?.status).toBe('open');
    expect(row?.initialCard).toBe(7);
    expect(row?.currentCard).toBe(7);
    expect(row?.multiplier).toBe(ONE_E18.toString());
    expect(row?.finalMultiplier).toBeNull();
    expect(row?.payout).toBeNull();
    expect(row?.stepCount).toBe(0);
    expect(row?.settledAt).toBeNull();
  });

  test('StepPlayed (won) advances multiplier + nextCommit + stepCount', async () => {
    const sessions = inMemoryHiLoSessionStore();
    const steps = inMemoryHiLoStepStore();
    await onHiLoSessionOpened(
      sessions,
      {
        sessionId: 1n,
        player: ALICE,
        stake: 1n,
        clientSeed: SEED,
        serverCommit: COMMIT,
        initialCard: 7,
        nonce: 0n,
        blockOpened: 100n,
      },
      { blockNumber: 100n },
    );
    const newMultiplier = 1_500_000_000_000_000_000n;
    await onHiLoStepPlayed(
      sessions,
      steps,
      {
        sessionId: 1n,
        player: ALICE,
        direction: 'higher',
        prevCard: 7,
        newCard: 10,
        won: true,
        newMultiplier,
        serverReveal: REVEAL,
        nextCommit: NEXT_COMMIT,
      },
      { blockNumber: 101n },
    );
    const session = await sessions.get('1');
    expect(session?.status).toBe('open');
    expect(session?.currentCard).toBe(10);
    expect(session?.multiplier).toBe(newMultiplier.toString());
    expect(session?.stepCount).toBe(1);
    expect(session?.serverCommit).toBe(NEXT_COMMIT);

    const stepRows = await steps.findBySession('1');
    expect(stepRows.length).toBe(1);
    expect(stepRows[0].id).toBe('1-0');
    expect(stepRows[0].direction).toBe('higher');
    expect(stepRows[0].won).toBe(true);
    expect(stepRows[0].newMultiplier).toBe(newMultiplier.toString());
  });

  test('StepPlayed (lost) busts the session — status flips to lost', async () => {
    const sessions = inMemoryHiLoSessionStore();
    const steps = inMemoryHiLoStepStore();
    await onHiLoSessionOpened(
      sessions,
      {
        sessionId: 2n,
        player: ALICE,
        stake: 1n,
        clientSeed: SEED,
        serverCommit: COMMIT,
        initialCard: 5,
        nonce: 0n,
        blockOpened: 200n,
      },
      { blockNumber: 200n },
    );
    await onHiLoStepPlayed(
      sessions,
      steps,
      {
        sessionId: 2n,
        player: ALICE,
        direction: 'lower',
        prevCard: 5,
        newCard: 9,
        won: false,
        newMultiplier: 0n,
        serverReveal: REVEAL,
        nextCommit: NEXT_COMMIT,
      },
      { blockNumber: 201n },
    );
    const session = await sessions.get('2');
    expect(session?.status).toBe('lost');
    expect(session?.currentCard).toBe(9);
    expect(session?.finalMultiplier).toBe('0');
    expect(session?.settledAt).toBe('201');
  });

  test('StepPlayed before SessionOpened throws', async () => {
    const sessions = inMemoryHiLoSessionStore();
    const steps = inMemoryHiLoStepStore();
    await expect(
      onHiLoStepPlayed(
        sessions,
        steps,
        {
          sessionId: 99n,
          player: ALICE,
          direction: 'higher',
          prevCard: 7,
          newCard: 10,
          won: true,
          newMultiplier: ONE_E18,
          serverReveal: REVEAL,
          nextCommit: NEXT_COMMIT,
        },
        { blockNumber: 300n },
      ),
    ).rejects.toThrow(/hilo step before session opened/);
  });

  test('SessionCashedOut sets cashed status + payout + finalMultiplier', async () => {
    const sessions = inMemoryHiLoSessionStore();
    await onHiLoSessionOpened(
      sessions,
      {
        sessionId: 3n,
        player: ALICE,
        stake: 100n,
        clientSeed: SEED,
        serverCommit: COMMIT,
        initialCard: 7,
        nonce: 0n,
        blockOpened: 100n,
      },
      { blockNumber: 100n },
    );
    await onHiLoSessionCashed(
      sessions,
      {
        sessionId: 3n,
        player: ALICE,
        payout: 250n,
        finalMultiplier: 2_500_000_000_000_000_000n,
      },
      { blockNumber: 150n },
    );
    const session = await sessions.get('3');
    expect(session?.status).toBe('cashed');
    expect(session?.payout).toBe('250');
    expect(session?.finalMultiplier).toBe('2500000000000000000');
    expect(session?.settledAt).toBe('150');
  });

  test('SessionRefunded pays the stake back', async () => {
    const sessions = inMemoryHiLoSessionStore();
    await onHiLoSessionOpened(
      sessions,
      {
        sessionId: 4n,
        player: ALICE,
        stake: 77n,
        clientSeed: SEED,
        serverCommit: COMMIT,
        initialCard: 7,
        nonce: 0n,
        blockOpened: 100n,
      },
      { blockNumber: 100n },
    );
    await onHiLoSessionRefunded(
      sessions,
      { sessionId: 4n, player: ALICE, stake: 77n },
      { blockNumber: 9999n },
    );
    const session = await sessions.get('4');
    expect(session?.status).toBe('refunded');
    expect(session?.payout).toBe('77');
    expect(session?.settledAt).toBe('9999');
  });

  test('SessionPushed sets pushed status with captured multiplier', async () => {
    const sessions = inMemoryHiLoSessionStore();
    await onHiLoSessionOpened(
      sessions,
      {
        sessionId: 5n,
        player: ALICE,
        stake: 50n,
        clientSeed: SEED,
        serverCommit: COMMIT,
        initialCard: 7,
        nonce: 0n,
        blockOpened: 100n,
      },
      { blockNumber: 100n },
    );
    await onHiLoSessionPushed(
      sessions,
      {
        sessionId: 5n,
        player: ALICE,
        stake: 50n,
        card: 7,
        multiplier: 1_750_000_000_000_000_000n,
      },
      { blockNumber: 175n },
    );
    const session = await sessions.get('5');
    expect(session?.status).toBe('pushed');
    expect(session?.payout).toBe('50');
    expect(session?.finalMultiplier).toBe('1750000000000000000');
    expect(session?.settledAt).toBe('175');
  });
});
