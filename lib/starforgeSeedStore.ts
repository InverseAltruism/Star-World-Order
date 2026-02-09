import { logger } from '@/lib/logger';

interface PendingSeedRecord {
  serverSeed: string;
  playerAddress: string;
  expiresAt: number;
}

const pendingSeeds = new Map<string, PendingSeedRecord>();
const SEED_TTL_MS = 15 * 60 * 1000; // 15 minutes

function pruneExpiredSeeds(now: number): void {
  for (const [gameId, record] of pendingSeeds.entries()) {
    if (record.expiresAt <= now) {
      pendingSeeds.delete(gameId);
    }
  }
}

export function storeStarForgeServerSeed(
  gameId: string,
  playerAddress: string,
  serverSeed: string
): void {
  const now = Date.now();
  pruneExpiredSeeds(now);

  pendingSeeds.set(gameId, {
    serverSeed,
    playerAddress: playerAddress.toLowerCase(),
    expiresAt: now + SEED_TTL_MS,
  });
}

export function getStarForgeServerSeed(
  gameId: string,
  expectedPlayerAddress?: string
): string | null {
  const now = Date.now();
  pruneExpiredSeeds(now);

  const record = pendingSeeds.get(gameId);
  if (!record) {
    return null;
  }

  if (
    expectedPlayerAddress &&
    record.playerAddress !== expectedPlayerAddress.toLowerCase()
  ) {
    logger.warn('Star Forge seed access mismatch', { gameId });
    return null;
  }

  return record.serverSeed;
}

export function consumeStarForgeServerSeed(
  gameId: string,
  expectedPlayerAddress?: string
): string | null {
  const seed = getStarForgeServerSeed(gameId, expectedPlayerAddress);
  if (!seed) {
    return null;
  }
  pendingSeeds.delete(gameId);
  return seed;
}
