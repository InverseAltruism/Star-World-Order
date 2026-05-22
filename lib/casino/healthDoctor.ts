/**
 * Casino keeper doctor — pure decision + formatting helpers.
 *
 * Ported from `keeper/doctor.ts` so the same logic powers both the
 * `/api/casino/health` route and any external health checker that wants
 * to derive the same view from raw inputs without touching the network.
 *
 * The wire side (RPC + indexer fetches) lives in `app/api/casino/health/
 * route.ts`. Everything in this module is deterministic and unit-tested.
 *
 * Why a separate "doctor" lib instead of folding into keeperHealthMonitor?
 *   keeperHealthMonitor decides whether to *alert* given a series of poll
 *   observations. The doctor *produces* one observation by inspecting the
 *   chain and indexer. They sit on opposite sides of the `/api/casino/
 *   health` boundary — one fills the response, the other polls it.
 */
export interface HealthSnapshot {
  keeperOnline: boolean;
  lastSettleBlock: string | null;
  pendingBetCount: number;
  bankrollBalance: string;
}

export interface HealthSnapshotInput {
  currentBlock: bigint;
  lastSettleBlock: bigint | null;
  pendingBetCount: number;
  oldestPendingBlock: bigint | null;
  bankrollBalanceWei: bigint;
  staleThresholdBlocks?: bigint;
}

/**
 * Default tolerance before an unsettled pending bet flags the keeper as
 * offline. The CosmicFlip happy path settles within 1 block; 10 blocks
 * (~5 sec on Monad mainnet) is a generous "the keeper is still alive"
 * window while staying well under the contract's refund EXPIRY_BLOCKS.
 */
export const DEFAULT_STALE_THRESHOLD_BLOCKS = 10n;

export function decideKeeperOnline(args: {
  currentBlock: bigint;
  oldestPendingBlock: bigint | null;
  pendingBetCount: number;
  staleThresholdBlocks: bigint;
}): boolean {
  if (args.pendingBetCount === 0) return true;
  if (args.oldestPendingBlock === null) return true;
  const lag = args.currentBlock - args.oldestPendingBlock;
  return lag <= args.staleThresholdBlocks;
}

export function buildHealthSnapshot(input: HealthSnapshotInput): HealthSnapshot {
  const staleThresholdBlocks =
    input.staleThresholdBlocks ?? DEFAULT_STALE_THRESHOLD_BLOCKS;
  const keeperOnline = decideKeeperOnline({
    currentBlock: input.currentBlock,
    oldestPendingBlock: input.oldestPendingBlock,
    pendingBetCount: input.pendingBetCount,
    staleThresholdBlocks,
  });
  return {
    keeperOnline,
    lastSettleBlock:
      input.lastSettleBlock === null ? null : input.lastSettleBlock.toString(),
    pendingBetCount: input.pendingBetCount,
    bankrollBalance: input.bankrollBalanceWei.toString(),
  };
}

export function formatWeiToMon(wei: bigint): string {
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const whole = abs / 10n ** 18n;
  const frac = abs % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, '0').slice(0, 4);
  return `${negative ? '-' : ''}${whole}.${fracStr}`;
}

export function formatHealthText(snap: HealthSnapshot): string {
  const status = snap.keeperOnline ? 'ONLINE' : 'OFFLINE';
  const settle = snap.lastSettleBlock ?? '—';
  const wei = (() => {
    try {
      return BigInt(snap.bankrollBalance);
    } catch {
      return 0n;
    }
  })();
  const mon = formatWeiToMon(wei);
  return [
    `[SWO casino keeper] ${status}`,
    `pending: ${snap.pendingBetCount}`,
    `last settle block: ${settle}`,
    `bankroll: ${mon} MON (${snap.bankrollBalance} wei)`,
  ].join('\n');
}

/**
 * Indexer view of pending/settled state. Returned by `IndexerProbe`; the
 * concrete fetcher lives in the route file (GraphQL POST). Strings are
 * BigInt-safe — the indexer returns decimal strings for block numbers.
 */
export interface IndexerState {
  lastSettleBlock: bigint | null;
  pendingBetCount: number;
  oldestPendingBlock: bigint | null;
}

export type IndexerProbe = () => Promise<IndexerState>;
export type ChainProbe = () => Promise<{ currentBlock: bigint; bankrollBalanceWei: bigint }>;

export interface CollectHealthDeps {
  probeChain: ChainProbe;
  probeIndexer: IndexerProbe;
  staleThresholdBlocks?: bigint;
}

/**
 * Compose the two probes into one snapshot. Either probe may throw — the
 * route catches and returns a degraded snapshot rather than failing the
 * whole endpoint, but the composition itself stays pure (deps are
 * injected so the test can drive any failure mode it wants).
 */
export async function collectHealth(
  deps: CollectHealthDeps,
): Promise<HealthSnapshot> {
  const [chain, indexer] = await Promise.all([deps.probeChain(), deps.probeIndexer()]);
  return buildHealthSnapshot({
    currentBlock: chain.currentBlock,
    bankrollBalanceWei: chain.bankrollBalanceWei,
    lastSettleBlock: indexer.lastSettleBlock,
    pendingBetCount: indexer.pendingBetCount,
    oldestPendingBlock: indexer.oldestPendingBlock,
    staleThresholdBlocks: deps.staleThresholdBlocks,
  });
}
