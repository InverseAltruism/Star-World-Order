import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STALE_THRESHOLD_BLOCKS,
  buildHealthSnapshot,
  collectHealth,
  decideKeeperOnline,
  formatHealthText,
  formatWeiToMon,
} from '../healthDoctor';

describe('decideKeeperOnline', () => {
  it('returns true when no pending bets exist', () => {
    expect(
      decideKeeperOnline({
        currentBlock: 100n,
        oldestPendingBlock: null,
        pendingBetCount: 0,
        staleThresholdBlocks: 10n,
      }),
    ).toBe(true);
  });

  it('returns true when oldest pending bet is within the tolerance window', () => {
    expect(
      decideKeeperOnline({
        currentBlock: 105n,
        oldestPendingBlock: 100n,
        pendingBetCount: 2,
        staleThresholdBlocks: 10n,
      }),
    ).toBe(true);
  });

  it('returns false when oldest pending bet has aged past the threshold', () => {
    expect(
      decideKeeperOnline({
        currentBlock: 120n,
        oldestPendingBlock: 100n,
        pendingBetCount: 1,
        staleThresholdBlocks: 10n,
      }),
    ).toBe(false);
  });

  it('treats missing oldest-pending as online (count without block is ambiguous, fail open)', () => {
    expect(
      decideKeeperOnline({
        currentBlock: 100n,
        oldestPendingBlock: null,
        pendingBetCount: 4,
        staleThresholdBlocks: 10n,
      }),
    ).toBe(true);
  });
});

describe('buildHealthSnapshot', () => {
  it('emits all four required fields with the right types', () => {
    const snap = buildHealthSnapshot({
      currentBlock: 1_000n,
      lastSettleBlock: 995n,
      pendingBetCount: 0,
      oldestPendingBlock: null,
      bankrollBalanceWei: 5n * 10n ** 17n,
    });
    expect(snap).toEqual({
      keeperOnline: true,
      lastSettleBlock: '995',
      pendingBetCount: 0,
      bankrollBalance: '500000000000000000',
    });
  });

  it('preserves null lastSettleBlock when the indexer has no settles yet', () => {
    const snap = buildHealthSnapshot({
      currentBlock: 1_000n,
      lastSettleBlock: null,
      pendingBetCount: 0,
      oldestPendingBlock: null,
      bankrollBalanceWei: 0n,
    });
    expect(snap.lastSettleBlock).toBeNull();
    expect(snap.bankrollBalance).toBe('0');
  });

  it('marks keeperOnline=false when the oldest pending bet has gone stale', () => {
    const snap = buildHealthSnapshot({
      currentBlock: 1_100n,
      lastSettleBlock: 900n,
      pendingBetCount: 3,
      oldestPendingBlock: 1_000n,
      bankrollBalanceWei: 1n,
    });
    expect(snap.keeperOnline).toBe(false);
    expect(snap.pendingBetCount).toBe(3);
    expect(snap.lastSettleBlock).toBe('900');
  });

  it('honours a custom staleThresholdBlocks override', () => {
    const snap = buildHealthSnapshot({
      currentBlock: 1_050n,
      lastSettleBlock: 1_000n,
      pendingBetCount: 1,
      oldestPendingBlock: 1_000n,
      bankrollBalanceWei: 0n,
      staleThresholdBlocks: 5n,
    });
    expect(snap.keeperOnline).toBe(false);
  });

  it('uses DEFAULT_STALE_THRESHOLD_BLOCKS when no override given', () => {
    const snap = buildHealthSnapshot({
      currentBlock: 1_000n + DEFAULT_STALE_THRESHOLD_BLOCKS,
      lastSettleBlock: 999n,
      pendingBetCount: 1,
      oldestPendingBlock: 1_000n,
      bankrollBalanceWei: 0n,
    });
    expect(snap.keeperOnline).toBe(true);
  });
});

describe('formatWeiToMon', () => {
  it('formats one whole MON', () => {
    expect(formatWeiToMon(10n ** 18n)).toBe('1.0000');
  });

  it('formats a fractional MON', () => {
    expect(formatWeiToMon(5n * 10n ** 17n)).toBe('0.5000');
  });

  it('handles zero', () => {
    expect(formatWeiToMon(0n)).toBe('0.0000');
  });

  it('handles negative wei (e.g. drawdown sentinel)', () => {
    expect(formatWeiToMon(-1n * 10n ** 18n)).toBe('-1.0000');
  });
});

describe('formatHealthText (Telegram-friendly)', () => {
  it('renders ONLINE with every field on its own line', () => {
    const text = formatHealthText({
      keeperOnline: true,
      lastSettleBlock: '995',
      pendingBetCount: 0,
      bankrollBalance: '1000000000000000000',
    });
    expect(text).toContain('[SWO casino keeper] ONLINE');
    expect(text).toContain('pending: 0');
    expect(text).toContain('last settle block: 995');
    expect(text).toContain('bankroll: 1.0000 MON');
    expect(text).toContain('(1000000000000000000 wei)');
  });

  it('renders OFFLINE when keeper is down and emits an em-dash for null settles', () => {
    const text = formatHealthText({
      keeperOnline: false,
      lastSettleBlock: null,
      pendingBetCount: 5,
      bankrollBalance: '0',
    });
    expect(text).toContain('OFFLINE');
    expect(text).toContain('pending: 5');
    expect(text).toContain('last settle block: —');
    expect(text).toContain('bankroll: 0.0000 MON');
  });

  it('tolerates a malformed bankrollBalance string without throwing', () => {
    const text = formatHealthText({
      keeperOnline: true,
      lastSettleBlock: '1',
      pendingBetCount: 0,
      bankrollBalance: 'not-a-bigint',
    });
    expect(text).toContain('bankroll: 0.0000 MON');
    expect(text).toContain('(not-a-bigint wei)');
  });
});

describe('collectHealth (composition with injected probes)', () => {
  it('joins chain + indexer probes into a single snapshot', async () => {
    const snap = await collectHealth({
      probeChain: async () => ({
        currentBlock: 200n,
        bankrollBalanceWei: 25n * 10n ** 17n,
      }),
      probeIndexer: async () => ({
        lastSettleBlock: 198n,
        pendingBetCount: 1,
        oldestPendingBlock: 199n,
      }),
    });
    expect(snap).toEqual({
      keeperOnline: true,
      lastSettleBlock: '198',
      pendingBetCount: 1,
      bankrollBalance: '2500000000000000000',
    });
  });

  it('propagates the offline decision when the indexer reports a stale pending bet', async () => {
    const snap = await collectHealth({
      probeChain: async () => ({
        currentBlock: 1_000n,
        bankrollBalanceWei: 0n,
      }),
      probeIndexer: async () => ({
        lastSettleBlock: 500n,
        pendingBetCount: 1,
        oldestPendingBlock: 900n,
      }),
      staleThresholdBlocks: 5n,
    });
    expect(snap.keeperOnline).toBe(false);
  });
});
