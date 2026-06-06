// @vitest-environment happy-dom
//
// useRecentBets — acceptance contract for the indexer↔RecentBets wiring
// from [SWO_CASINO_INDEXER_PORT] bullet (d). The hook is the canonical
// consumer that turns a Ponder GraphQL endpoint + player address into
// the `WalletBet[]` shape `components/casino/RecentBets` renders.

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useRecentBets, type UseRecentBetsState } from '../useRecentBets';

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ALICE = '0x000000000000000000000000000000000000a11c';

let container: HTMLDivElement;
let root: Root;
const sink: { value: UseRecentBetsState | null } = { value: null };

function Probe(props: {
  endpoint?: string;
  player?: string;
  limit?: number;
  fetchImpl?: typeof fetch;
}) {
  const state = useRecentBets(props);
  useEffect(() => {
    sink.value = state;
  }, [state]);
  return null;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function flush(): Promise<void> {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  sink.value = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('useRecentBets', () => {
  it('returns empty + idle when endpoint or player is missing', async () => {
    await act(async () => {
      root.render(<Probe />);
    });
    expect(sink.value?.bets).toEqual([]);
    expect(sink.value?.loading).toBe(false);
    expect(sink.value?.error).toBeNull();
  });

  it('fetches rows and maps them to the WalletBet shape', async () => {
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
          diceBets: { items: [] },
          hiloSessions: {
            items: [
              {
                id: '9',
                player: ALICE,
                status: 'cashed',
                stake: '500',
                payout: '1500',
                blockOpened: '300',
                settledAt: '301',
              },
            ],
          },
        },
      }),
    );

    await act(async () => {
      root.render(
        <Probe
          endpoint="https://indexer.example/graphql"
          player={ALICE}
          fetchImpl={fetchImpl as unknown as typeof fetch}
        />,
      );
    });
    await flush();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sink.value?.loading).toBe(false);
    expect(sink.value?.error).toBeNull();
    expect(sink.value?.bets.map((b) => b.game)).toEqual(['hilo', 'coinflip']);
    expect(sink.value?.bets[0]).toMatchObject({
      game: 'hilo',
      betId: '9',
      stakeWei: '500',
      payoutWei: '1500',
      outcome: 'cashed',
      blockNumber: '300',
    });
  });

  it('reports loading=true before the fetch resolves', async () => {
    let resolveFetch: ((res: Response) => void) | null = null;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((res) => {
          resolveFetch = res;
        }),
    );
    await act(async () => {
      root.render(
        <Probe
          endpoint="https://indexer.example/graphql"
          player={ALICE}
          fetchImpl={fetchImpl as unknown as typeof fetch}
        />,
      );
    });
    // Effect has scheduled the fetch but it has not resolved yet.
    expect(sink.value?.loading).toBe(true);
    expect(sink.value?.bets).toEqual([]);
    expect(sink.value?.error).toBeNull();
    // Resolve so the effect cleanup doesn't leave a dangling promise.
    await act(async () => {
      resolveFetch?.(
        jsonResponse({
          data: {
            bets: { items: [] },
            diceBets: { items: [] },
            hiloSessions: { items: [] },
          },
        }),
      );
      await Promise.resolve();
    });
    await flush();
    expect(sink.value?.loading).toBe(false);
  });

  it('captures fetch errors without unmounting', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('boom', { status: 502, statusText: 'Bad Gateway' }),
    );
    await act(async () => {
      root.render(
        <Probe
          endpoint="https://indexer.example/graphql"
          player={ALICE}
          fetchImpl={fetchImpl as unknown as typeof fetch}
        />,
      );
    });
    await flush();
    expect(sink.value?.loading).toBe(false);
    expect(sink.value?.error?.message).toMatch(/502/);
    expect(sink.value?.bets).toEqual([]);
  });

  it('passes the player lowercased and the configured limit downstream', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: {
          bets: { items: [] },
          diceBets: { items: [] },
          hiloSessions: { items: [] },
        },
      }),
    );
    const MIXED = '0xAbCdEf0000000000000000000000000000000A11C';
    await act(async () => {
      root.render(
        <Probe
          endpoint="https://indexer.example/graphql"
          player={MIXED}
          limit={5}
          fetchImpl={fetchImpl as unknown as typeof fetch}
        />,
      );
    });
    await flush();
    const call = fetchImpl.mock.calls[0] as unknown as
      | [string, RequestInit]
      | undefined;
    const body = JSON.parse(String(call?.[1]?.body));
    expect(body.variables).toEqual({ player: MIXED.toLowerCase(), limit: 5 });
  });
});
