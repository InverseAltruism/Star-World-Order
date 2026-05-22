/**
 * GET /api/casino/health
 *
 * Returns the current casino-keeper snapshot:
 *
 *   {
 *     "keeperOnline":     boolean,
 *     "lastSettleBlock":  "12345" | null,   // decimal string for BigInt safety
 *     "pendingBetCount":  number,
 *     "bankrollBalance":  "1000000000000000000"  // wei as decimal string
 *   }
 *
 * Query params:
 *   ?text=1   — render a Telegram-friendly plain-text body instead of JSON
 *   ?chain=N  — override the chain id (default: 10143 testnet; 143 mainnet
 *               once predicted deployment lands)
 *
 * The route is intentionally thin: all decision logic lives in
 * `lib/casino/healthDoctor.ts` so it can be unit-tested without network.
 * Two probes are composed here:
 *
 *   probeChain   → viem.publicClient → bankroll.balance() + getBlockNumber()
 *   probeIndexer → POST to the casino-indexer GraphQL endpoint
 *
 * On probe failure the route returns a degraded snapshot (with
 * `keeperOnline: false`) and a 200 OK so the upstream poller in
 * `scripts/casino/keeperHealthMonitor.ts` can still consume the body. The
 * monitor decides what to alert on via its own consecutive-offline state
 * machine — this endpoint just reports observations.
 */

import { NextResponse } from 'next/server';
import { createPublicClient, http, type PublicClient } from 'viem';
import { monad } from '@/lib/wagmi';
import { MONAD_MAINNET_RPC_URLS } from '@/lib/rpcClient';
import { getCasinoAddresses } from '@/lib/casino/addresses';
import {
  type IndexerState,
  collectHealth,
  formatHealthText,
} from '@/lib/casino/healthDoctor';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_CHAIN_ID = 10143;
const INDEXER_TIMEOUT_MS = 5_000;

const BANKROLL_ABI = [
  {
    name: 'balance',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const HEALTH_QUERY = `
  query CasinoHealth {
    pendingCoinflip: bets(
      where: { status: "pending" }
      orderBy: "blockPlaced"
      orderDirection: "asc"
      limit: 1
    ) { items { blockPlaced } }
    pendingDice: diceBets(
      where: { status: "pending" }
      orderBy: "blockPlaced"
      orderDirection: "asc"
      limit: 1
    ) { items { blockPlaced } }
    pendingHilo: hiloSessions(
      where: { status: "open" }
      orderBy: "blockOpened"
      orderDirection: "asc"
      limit: 1
    ) { items { blockOpened } }
    pendingCountCoinflip: bets(where: { status: "pending" }, limit: 1000) { items { id } }
    pendingCountDice: diceBets(where: { status: "pending" }, limit: 1000) { items { id } }
    pendingCountHilo: hiloSessions(where: { status: "open" }, limit: 1000) { items { id } }
    lastCoinflip: bets(
      where: { status_in: ["won", "lost", "refunded"] }
      orderBy: "settledAt"
      orderDirection: "desc"
      limit: 1
    ) { items { settledAt } }
    lastDice: diceBets(
      where: { status_in: ["won", "lost", "refunded"] }
      orderBy: "settledAt"
      orderDirection: "desc"
      limit: 1
    ) { items { settledAt } }
    lastHilo: hiloSessions(
      where: { status_in: ["cashed", "lost", "refunded", "pushed"] }
      orderBy: "settledAt"
      orderDirection: "desc"
      limit: 1
    ) { items { settledAt } }
  }
`.trim();

interface HealthQueryEnvelope {
  data?: {
    pendingCoinflip?: { items?: Array<{ blockPlaced?: string | null }> };
    pendingDice?: { items?: Array<{ blockPlaced?: string | null }> };
    pendingHilo?: { items?: Array<{ blockOpened?: string | null }> };
    pendingCountCoinflip?: { items?: Array<{ id: string }> };
    pendingCountDice?: { items?: Array<{ id: string }> };
    pendingCountHilo?: { items?: Array<{ id: string }> };
    lastCoinflip?: { items?: Array<{ settledAt?: string | null }> };
    lastDice?: { items?: Array<{ settledAt?: string | null }> };
    lastHilo?: { items?: Array<{ settledAt?: string | null }> };
  };
  errors?: Array<{ message: string }>;
}

function parseOptionalBigInt(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function maxBigIntOrNull(
  values: Array<bigint | null>,
): bigint | null {
  let max: bigint | null = null;
  for (const v of values) {
    if (v === null) continue;
    if (max === null || v > max) max = v;
  }
  return max;
}

function minBigIntOrNull(
  values: Array<bigint | null>,
): bigint | null {
  let min: bigint | null = null;
  for (const v of values) {
    if (v === null) continue;
    if (min === null || v < min) min = v;
  }
  return min;
}

function indexerStateFromEnvelope(env: HealthQueryEnvelope): IndexerState {
  const data = env.data ?? {};
  const lastSettleBlock = maxBigIntOrNull([
    parseOptionalBigInt(data.lastCoinflip?.items?.[0]?.settledAt),
    parseOptionalBigInt(data.lastDice?.items?.[0]?.settledAt),
    parseOptionalBigInt(data.lastHilo?.items?.[0]?.settledAt),
  ]);
  const oldestPendingBlock = minBigIntOrNull([
    parseOptionalBigInt(data.pendingCoinflip?.items?.[0]?.blockPlaced),
    parseOptionalBigInt(data.pendingDice?.items?.[0]?.blockPlaced),
    parseOptionalBigInt(data.pendingHilo?.items?.[0]?.blockOpened),
  ]);
  const pendingBetCount =
    (data.pendingCountCoinflip?.items?.length ?? 0) +
    (data.pendingCountDice?.items?.length ?? 0) +
    (data.pendingCountHilo?.items?.length ?? 0);
  return { lastSettleBlock, pendingBetCount, oldestPendingBlock };
}

async function fetchIndexerState(endpoint: string): Promise<IndexerState> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INDEXER_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: HEALTH_QUERY }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`indexer http ${res.status}`);
    }
    const json = (await res.json()) as HealthQueryEnvelope;
    if (json.errors && json.errors.length > 0) {
      throw new Error(json.errors.map((e) => e.message).join('; '));
    }
    return indexerStateFromEnvelope(json);
  } finally {
    clearTimeout(timer);
  }
}

function getPublicClient(chainId: number): PublicClient {
  const url =
    process.env.CASINO_HEALTH_RPC_URL ??
    (chainId === 10143
      ? 'https://testnet-rpc.monad.xyz'
      : MONAD_MAINNET_RPC_URLS[0]);
  return createPublicClient({
    chain: monad,
    transport: http(url, { timeout: 5_000, retryCount: 1 }),
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const wantsText = url.searchParams.get('text') === '1';
  const chainIdParam = url.searchParams.get('chain');
  const chainId = chainIdParam ? Number(chainIdParam) : DEFAULT_CHAIN_ID;
  const addresses = getCasinoAddresses(chainId);

  if (!addresses) {
    const body = {
      keeperOnline: false,
      lastSettleBlock: null,
      pendingBetCount: 0,
      bankrollBalance: '0',
      error: `no_casino_deployment_for_chain_${chainId}`,
    };
    if (wantsText) {
      return new NextResponse(
        `[SWO casino keeper] no deployment for chain ${chainId}`,
        { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } },
      );
    }
    return NextResponse.json(body, { status: 200 });
  }

  const indexerEndpoint =
    process.env.CASINO_INDEXER_URL ?? 'http://localhost:42069/graphql';

  try {
    const client = getPublicClient(chainId);
    const snapshot = await collectHealth({
      probeChain: async () => {
        const [currentBlock, bankrollBalanceWei] = await Promise.all([
          client.getBlockNumber(),
          client.readContract({
            address: addresses.bankroll,
            abi: BANKROLL_ABI,
            functionName: 'balance',
          }) as Promise<bigint>,
        ]);
        return { currentBlock, bankrollBalanceWei };
      },
      probeIndexer: async () => {
        try {
          return await fetchIndexerState(indexerEndpoint);
        } catch (err) {
          logger.warn('casino health: indexer probe failed', {
            error: err instanceof Error ? err.message : String(err),
            endpoint: indexerEndpoint,
          });
          // Degrade gracefully — chain probe still gives us bankrollBalance,
          // and the missing settle data leaves keeperOnline at its safe
          // default (true, because pendingBetCount is reported as 0).
          return { lastSettleBlock: null, pendingBetCount: 0, oldestPendingBlock: null };
        }
      },
    });

    if (wantsText) {
      return new NextResponse(formatHealthText(snapshot), {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    return NextResponse.json(snapshot, { status: 200 });
  } catch (err) {
    logger.error('casino health: chain probe failed', {
      error: err instanceof Error ? err.message : String(err),
      chainId,
    });
    const body = {
      keeperOnline: false,
      lastSettleBlock: null,
      pendingBetCount: 0,
      bankrollBalance: '0',
      error: 'chain_probe_failed',
    };
    if (wantsText) {
      return new NextResponse(
        `[SWO casino keeper] OFFLINE — chain probe failed`,
        { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } },
      );
    }
    return NextResponse.json(body, { status: 200 });
  }
}
