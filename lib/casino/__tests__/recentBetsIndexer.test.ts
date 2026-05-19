// Coverage for the Ponder GraphQL client that feeds `RecentBets`.
//
// Verifies: (1) fetchRecentBets unions across the three game tables and
// emits newest-first; (2) mapRecentBetsToWallet adapts to the WalletBet
// shape `components/casino/RecentBets` already renders.

import { describe, expect, test, vi } from 'vitest';

import {
  fetchRecentBets,
  mapRecentBetsToWallet,
  type IndexerRecentBetRow,
} from '@/lib/casino/recentBetsIndexer';

const ALICE = '0x000000000000000000000000000000000000a11c';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchRecentBets', () => {
  test('unions the three game tables newest-first', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: {
          bets: {
            items: [
              {
                id: '1',
                player: ALICE,
                status: 'won',
                stake: '1000',
                payout: '2000',
                blockPlaced: '100',
                settledAt: '101',
              },
            ],
          },
          diceBets: {
            items: [
              {
                id: '2',
                player: ALICE,
                status: 'lost',
                stake: '1000',
                payout: '0',
                blockPlaced: '200',
                settledAt: '201',
              },
            ],
          },
          hiloSessions: {
            items: [
              {
                id: '3',
                player: ALICE,
                status: 'cashed',
                stake: '1000',
                payout: '3500',
                blockOpened: '300',
                settledAt: '301',
              },
            ],
          },
        },
      }),
    );

    const rows = await fetchRecentBets({
      endpoint: 'https://indexer.example/graphql',
      player: ALICE,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(rows.map((r) => r.game)).toEqual(['hilo', 'dice', 'coinflip']);
    expect(rows[0].id).toBe('3');
    expect(rows[0].blockPlaced).toBe('300');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0] as unknown as
      | [string, RequestInit]
      | undefined;
    const init = call?.[1];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      variables: { player: ALICE, limit: 24 },
    });
  });

  test('surfaces non-OK responses as a thrown error', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('boom', { status: 502, statusText: 'Bad Gateway' }),
    );
    await expect(
      fetchRecentBets({
        endpoint: 'https://indexer.example/graphql',
        player: ALICE,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/502/);
  });

  test('surfaces GraphQL errors', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ errors: [{ message: 'no such field' }] }),
    );
    await expect(
      fetchRecentBets({
        endpoint: 'https://indexer.example/graphql',
        player: ALICE,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/no such field/);
  });
});

describe('mapRecentBetsToWallet', () => {
  test('adapts indexer rows into the WalletBet shape', () => {
    const rows: IndexerRecentBetRow[] = [
      {
        game: 'coinflip',
        id: '7',
        player: ALICE,
        status: 'won',
        stake: '1000000000000000',
        payout: '1960000000000000',
        blockPlaced: '120',
        settledAt: '121',
        txHash: '0xabc',
      },
      {
        game: 'hilo',
        id: '3',
        player: ALICE,
        status: 'cashed',
        stake: '1',
        payout: '5',
        blockPlaced: '300',
        settledAt: '301',
      },
    ];
    const wallet = mapRecentBetsToWallet(rows);
    expect(wallet).toEqual([
      {
        game: 'coinflip',
        betId: '7',
        stakeWei: '1000000000000000',
        payoutWei: '1960000000000000',
        outcome: 'won',
        blockNumber: '120',
        txHash: '0xabc',
      },
      {
        game: 'hilo',
        betId: '3',
        stakeWei: '1',
        payoutWei: '5',
        outcome: 'cashed',
        blockNumber: '300',
        txHash: null,
      },
    ]);
  });
});
