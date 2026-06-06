// GraphQL client adapter that connects the SWO casino-indexer Ponder
// endpoint to the `RecentBets` wallet-sheet component.
//
// Two responsibilities:
//
//   1. `fetchRecentBets(endpoint, player, limit, fetchImpl?)` — POST a small
//      GraphQL query to the indexer's `/graphql` endpoint, unioning bets
//      across the three game tables (`bets`, `diceBets`, `hiloSessions`).
//      The fetch impl is injectable so tests can drive without network.
//
//   2. `mapRecentBetsToWallet(rows)` — adapter that turns the cross-game
//      indexer rows into the `WalletBet` shape `components/casino/RecentBets`
//      already consumes (game, betId, stakeWei, payoutWei, outcome,
//      blockNumber, txHash). The component then renders verify links + an
//      explorer link without knowing anything about the indexer.

import type { WalletBet, WalletGame } from '@/components/casino/RecentBets';

/** Mirrors `services/casino-indexer/src/recent-bets.ts#RecentBet`. */
export interface IndexerRecentBetRow {
  game: WalletGame;
  id: string;
  player: string;
  status: string;
  stake: string;
  payout: string | null;
  blockPlaced: string;
  settledAt: string | null;
  txHash?: string | null;
}

export interface FetchRecentBetsOptions {
  endpoint: string;
  player: string;
  limit?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

const RECENT_BETS_QUERY = `
  query RecentBets($player: String!, $limit: Int!) {
    bets(
      where: { player: $player, status_in: ["won", "lost", "refunded"] }
      orderBy: "blockPlaced"
      orderDirection: "desc"
      limit: $limit
    ) {
      items {
        id
        player
        status
        stake
        payout
        blockPlaced
        settledAt
      }
    }
    diceBets(
      where: { player: $player, status_in: ["won", "lost", "refunded"] }
      orderBy: "blockPlaced"
      orderDirection: "desc"
      limit: $limit
    ) {
      items {
        id
        player
        status
        stake
        payout
        blockPlaced
        settledAt
      }
    }
    hiloSessions(
      where: { player: $player, status_in: ["cashed", "lost", "refunded", "pushed"] }
      orderBy: "blockOpened"
      orderDirection: "desc"
      limit: $limit
    ) {
      items {
        id
        player
        status
        stake
        payout
        blockOpened
        settledAt
      }
    }
  }
`.trim();

interface GraphQLEnvelope {
  data?: {
    bets?: { items?: Array<Omit<IndexerRecentBetRow, 'game'>> };
    diceBets?: { items?: Array<Omit<IndexerRecentBetRow, 'game'>> };
    hiloSessions?: {
      items?: Array<
        Omit<IndexerRecentBetRow, 'game' | 'blockPlaced'> & {
          blockOpened: string;
        }
      >;
    };
  };
  errors?: Array<{ message: string }>;
}

function compareNewestFirst(
  a: IndexerRecentBetRow,
  b: IndexerRecentBetRow,
): number {
  const aBlk = BigInt(a.blockPlaced);
  const bBlk = BigInt(b.blockPlaced);
  if (aBlk !== bBlk) return aBlk > bBlk ? -1 : 1;
  try {
    const aId = BigInt(a.id);
    const bId = BigInt(b.id);
    return aId > bId ? -1 : aId < bId ? 1 : 0;
  } catch {
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  }
}

export async function fetchRecentBets(
  opts: FetchRecentBetsOptions,
): Promise<IndexerRecentBetRow[]> {
  const { endpoint, player, limit = 24, fetchImpl, signal } = opts;
  const f = fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
  if (!f) throw new Error('fetchRecentBets: no fetch implementation available');

  const res = await f(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: RECENT_BETS_QUERY,
      variables: { player: player.toLowerCase(), limit },
    }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`indexer returned ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as GraphQLEnvelope;
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  const data = json.data ?? {};
  const merged: IndexerRecentBetRow[] = [];

  for (const r of data.bets?.items ?? []) {
    merged.push({ ...r, game: 'coinflip' });
  }
  for (const r of data.diceBets?.items ?? []) {
    merged.push({ ...r, game: 'dice' });
  }
  for (const r of data.hiloSessions?.items ?? []) {
    const { blockOpened, ...rest } = r;
    merged.push({ ...rest, game: 'hilo', blockPlaced: blockOpened });
  }

  merged.sort(compareNewestFirst);
  return merged.slice(0, limit);
}

/**
 * Adapt indexer rows into the `WalletBet` shape that
 * `components/casino/RecentBets` already renders.
 */
export function mapRecentBetsToWallet(
  rows: IndexerRecentBetRow[],
): WalletBet[] {
  return rows.map((r) => ({
    game: r.game,
    betId: r.id,
    stakeWei: r.stake,
    payoutWei: r.payout,
    outcome: r.status,
    blockNumber: r.blockPlaced,
    txHash: r.txHash ?? null,
  }));
}
