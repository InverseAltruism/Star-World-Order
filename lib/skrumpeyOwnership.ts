import { getResilientClient, retryWithBackoff } from './rpcClient';
import { logger } from './logger';
import { parseAbi, type Address } from 'viem';

const SKRUMPEY_CONTRACT = process.env.NEXT_PUBLIC_SKRUMPEY_CONTRACT as Address | undefined;

const ERC721_OWNER_ABI = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
]);

/**
 * Check if a wallet owns a specific Skrumpey token via on-chain ownerOf.
 * Single RPC call — works regardless of ERC721Enumerable support.
 */
export async function verifyTokenOwnership(walletAddress: string, tokenId: number): Promise<boolean> {
  if (!SKRUMPEY_CONTRACT) {
    logger.warn('SKRUMPEY_CONTRACT not configured, cannot verify ownership');
    return false;
  }

  try {
    const client = await getResilientClient();
    const owner = await retryWithBackoff(async () =>
      client.readContract({
        address: SKRUMPEY_CONTRACT,
        abi: ERC721_OWNER_ABI,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      })
    ) as string;

    return owner.toLowerCase() === walletAddress.toLowerCase();
  } catch (error) {
    logger.error('Failed to verify token ownership', {
      tokenId,
      address: walletAddress.slice(0, 10) + '...',
      error: String(error),
    });
    return false;
  }
}

/**
 * Get all token IDs owned by a wallet using batched ownerOf checks.
 * Checks a given set of candidate token IDs via multicall.
 */
export async function getOwnedTokenIds(
  walletAddress: string,
  candidateTokenIds: number[],
): Promise<number[]> {
  if (!SKRUMPEY_CONTRACT || candidateTokenIds.length === 0) return [];

  try {
    const client = await getResilientClient();

    const BATCH_SIZE = 500;
    const owned: number[] = [];

    for (let i = 0; i < candidateTokenIds.length; i += BATCH_SIZE) {
      const batch = candidateTokenIds.slice(i, i + BATCH_SIZE);
      const results = await retryWithBackoff(async () =>
        client.multicall({
          contracts: batch.map(tokenId => ({
            address: SKRUMPEY_CONTRACT!,
            abi: ERC721_OWNER_ABI,
            functionName: 'ownerOf',
            args: [BigInt(tokenId)],
          })),
          allowFailure: true,
        })
      );

      const addr = walletAddress.toLowerCase();
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === 'success' && String(r.result).toLowerCase() === addr) {
          owned.push(batch[j]);
        }
      }
    }

    return owned;
  } catch (error) {
    logger.error('Failed to get owned token IDs', {
      address: walletAddress.slice(0, 10) + '...',
      error: String(error),
    });
    return [];
  }
}

/**
 * Get the Skrumpey balance for a wallet (how many they own total).
 */
export async function getSkrumpeyBalance(walletAddress: string): Promise<number> {
  if (!SKRUMPEY_CONTRACT) return 0;

  try {
    const client = await getResilientClient();
    const balance = await retryWithBackoff(async () =>
      client.readContract({
        address: SKRUMPEY_CONTRACT,
        abi: ERC721_OWNER_ABI,
        functionName: 'balanceOf',
        args: [walletAddress as Address],
      })
    ) as bigint;
    return Number(balance);
  } catch (error) {
    logger.error('Failed to get Skrumpey balance', {
      address: walletAddress.slice(0, 10) + '...',
      error: String(error),
    });
    return 0;
  }
}
