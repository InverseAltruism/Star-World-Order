// useRecentBets — React hook that drives `components/casino/RecentBets`
// from the SWO casino-indexer GraphQL endpoint.
//
// Closes acceptance bullet (d) of [SWO_CASINO_INDEXER_PORT]: the
// `RecentBets` component itself stays pure (parent-fed `bets` prop), and
// this hook is the canonical consumer that turns an indexer endpoint +
// player address into the `WalletBet[]` shape it already renders.
//
// Wiring contract:
//   - `endpoint`  Ponder GraphQL URL. When undefined/empty the hook
//                 short-circuits to an empty `bets` array — the wallet
//                 sheet still renders the empty-state pill instead of
//                 throwing during the pre-indexer window.
//   - `player`    The wallet address (any case — lowercased before
//                 hitting the indexer). Undefined → empty bets.
//   - `limit`     Max rows to render (default 24).
//   - `fetchImpl` Injectable for tests; defaults to `globalThis.fetch`.
//
// Returns `{ bets, loading, error }`. The fetch is aborted on unmount
// or when any input changes so React 18 strict-mode double-mount does
// not fire two concurrent requests. `loading` is derived from the
// relationship between the current request key and the key of the most
// recent resolved result — this keeps all `setState` calls inside async
// callbacks rather than synchronously in the effect body.

'use client';

import { useEffect, useState } from 'react';

import type { WalletBet } from '@/components/casino/RecentBets';

import {
  fetchRecentBets,
  mapRecentBetsToWallet,
} from './recentBetsIndexer';

export interface UseRecentBetsOptions {
  endpoint?: string;
  player?: string;
  limit?: number;
  fetchImpl?: typeof fetch;
}

export interface UseRecentBetsState {
  bets: WalletBet[];
  loading: boolean;
  error: Error | null;
}

const EMPTY: WalletBet[] = [];

interface ResolvedResult {
  key: string | null;
  bets: WalletBet[];
  error: Error | null;
}

function requestKey(
  endpoint: string | undefined,
  player: string | undefined,
  limit: number,
): string | null {
  if (!endpoint || !player) return null;
  return `${endpoint}|${player.toLowerCase()}|${limit}`;
}

export function useRecentBets(opts: UseRecentBetsOptions): UseRecentBetsState {
  const { endpoint, player, limit = 24, fetchImpl } = opts;
  const key = requestKey(endpoint, player, limit);

  const [result, setResult] = useState<ResolvedResult>({
    key: null,
    bets: EMPTY,
    error: null,
  });

  useEffect(() => {
    if (!endpoint || !player || !key) return;
    const controller = new AbortController();
    let cancelled = false;
    fetchRecentBets({
      endpoint,
      player,
      limit,
      fetchImpl,
      signal: controller.signal,
    })
      .then((rows) => {
        if (cancelled) return;
        setResult({
          key,
          bets: mapRecentBetsToWallet(rows),
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setResult({
          key,
          bets: EMPTY,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [endpoint, player, limit, fetchImpl, key]);

  if (!key) {
    return { bets: EMPTY, loading: false, error: null };
  }
  if (result.key !== key) {
    return { bets: EMPTY, loading: true, error: null };
  }
  return { bets: result.bets, loading: false, error: result.error };
}
