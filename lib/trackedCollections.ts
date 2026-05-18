import { getResilientClient, retryWithBackoff } from './rpcClient';
import { logger } from './logger';
import { parseAbi, type Address } from 'viem';

const ERC721_OWNER_ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
]);

export interface TrackedCollection {
  contractAddress: Address;
  name: string;
  /** Tokens are assumed to live in 1..maxTokenId. */
  maxTokenId: number;
  /** Collection thumbnail (used as the row image on the treasury page). */
  imageUrl: string;
  /** Show "verified" badge. */
  isVerified: boolean;
}

// Collections the treasury cares about. To add a collection, append an entry
// here. Each new contract adds ceil(maxTokenId / 500) multicall round-trips
// to the holder check, so prefer contracts with bounded token-ID ranges.
//
// Why a hardcoded list: no Monad NFT indexer is currently usable —
// Magic Eden dropped EVM permanently, OpenSea has no Monad API, and
// BlockVision's free tier is rate-limited (Pro plan required). The
// fallback is on-chain `ownerOf` multicalls, which only works when we
// already know the contract + token-ID range.
export const TRACKED_COLLECTIONS: readonly TrackedCollection[] = [
  {
    contractAddress: '0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0' as Address,
    name: 'Skrumpey',
    maxTokenId: 3333,
    imageUrl:
      'https://ipfs-proxy.magiceden.dev/ipfs/bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu/1.png',
    isVerified: true,
  },
];

export interface TrackedHolding {
  contractAddress: string;
  name: string;
  imageUrl: string;
  isVerified: boolean;
  /** Token IDs the wallet owns from this collection. */
  ownedTokenIds: number[];
}

/**
 * For each tracked contract, find which tokens (1..maxTokenId) are owned by
 * `walletAddress` via batched on-chain multicall(`ownerOf`).
 *
 * Slow but correct: a 3333-token contract takes ~7 batches × 500 calls and
 * resolves in ~6-7s on a healthy Monad RPC. Cache the result aggressively.
 */
export async function fetchTrackedHoldings(walletAddress: string): Promise<TrackedHolding[]> {
  const out: TrackedHolding[] = [];

  for (const collection of TRACKED_COLLECTIONS) {
    const ownedTokenIds = await ownedTokensInContract(walletAddress, collection);
    if (ownedTokenIds.length > 0) {
      out.push({
        contractAddress: collection.contractAddress,
        name: collection.name,
        imageUrl: collection.imageUrl,
        isVerified: collection.isVerified,
        ownedTokenIds,
      });
    }
  }

  return out;
}

async function ownedTokensInContract(
  walletAddress: string,
  collection: TrackedCollection,
): Promise<number[]> {
  try {
    const client = await getResilientClient();
    const BATCH_SIZE = 500;
    const owned: number[] = [];
    const candidateIds = Array.from({ length: collection.maxTokenId }, (_, i) => i + 1);
    const addr = walletAddress.toLowerCase();

    for (let i = 0; i < candidateIds.length; i += BATCH_SIZE) {
      const batch = candidateIds.slice(i, i + BATCH_SIZE);
      const results = await retryWithBackoff(async () =>
        client.multicall({
          contracts: batch.map((tokenId) => ({
            address: collection.contractAddress,
            abi: ERC721_OWNER_ABI,
            functionName: 'ownerOf',
            args: [BigInt(tokenId)],
          })),
          allowFailure: true,
        }),
      );

      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === 'success' && String(r.result).toLowerCase() === addr) {
          owned.push(batch[j]);
        }
      }
    }

    return owned;
  } catch (error) {
    logger.error('Failed to fetch tracked holdings for contract', {
      contract: collection.contractAddress,
      name: collection.name,
      walletAddress: walletAddress.slice(0, 10) + '...',
      error: String(error),
    });
    return [];
  }
}
