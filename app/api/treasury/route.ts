/**
 * Treasury API Route
 * 
 * GET /api/treasury - Get treasury wallet data including MON balance, NFT holdings, and transactions
 * 
 * Treasury wallet: 0xa209cfb0c8abdf5e3e3e7f4628214bdb597d55af
 */

import { NextResponse } from 'next/server';
import { 
  STAR_SKRUMPEY_IDS, 
  SKRUMPEY_CONTRACT_ADDRESS,
  getStarVariantForTokenId,
} from '@/lib/starSkrumpey';
import { getStarSkrumpeyMetadataBatch } from '@/lib/db';
import { getResilientClient, retryWithBackoff } from '@/lib/rpcClient';
import { logger } from '@/lib/logger';
import { formatEther } from 'viem';

// Treasury wallet address
const TREASURY_ADDRESS = '0xa209cfb0c8abdf5e3e3e7f4628214bdb597d55af' as const;

// ERC721 ABI for ownership check
const ERC721_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Cache for treasury data (2 minute TTL for more frequent updates)
let treasuryCache: {
  data: TreasuryData;
  timestamp: number;
} | null = null;
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

export interface NFTHolding {
  tokenId: number;
  constellation?: string;
  imageUrl?: string;
}

export interface TreasuryData {
  address: string;
  monBalance: string;
  monBalanceFormatted: string;
  nftHoldings: NFTHolding[];
  nftCount: number;
  // Estimated total value in MON (NFT floor price * count + MON balance)
  estimatedValueMON: string;
  lastUpdated: string;
}

/**
 * Fetch treasury MON balance
 */
async function fetchTreasuryBalance(): Promise<bigint> {
  try {
    const client = await getResilientClient();
    
    const balance = await retryWithBackoff(async () => {
      return await client.getBalance({
        address: TREASURY_ADDRESS,
      });
    });
    
    return balance;
  } catch (error) {
    logger.error('Failed to fetch treasury balance', { error: String(error) });
    return BigInt(0);
  }
}

/**
 * Fetch Star Skrumpey NFTs owned by treasury
 */
async function fetchTreasuryNFTs(): Promise<NFTHolding[]> {
  if (!SKRUMPEY_CONTRACT_ADDRESS) {
    logger.warn('SKRUMPEY_CONTRACT_ADDRESS not configured');
    return [];
  }

  const nfts: NFTHolding[] = [];

  try {
    const client = await getResilientClient();

    // Batch check ownership of all Star Skrumpey IDs
    const ownershipResults = await retryWithBackoff(async () => {
      return await client.multicall({
        contracts: STAR_SKRUMPEY_IDS.map(tokenId => ({
          address: SKRUMPEY_CONTRACT_ADDRESS as `0x${string}`,
          abi: ERC721_ABI,
          functionName: 'ownerOf',
          args: [BigInt(tokenId)],
        })),
        allowFailure: true,
      });
    });

    // Get metadata for all tokens (for constellation info)
    const metadataMap = getStarSkrumpeyMetadataBatch([...STAR_SKRUMPEY_IDS]);

    // Process results
    for (let i = 0; i < ownershipResults.length; i++) {
      const result = ownershipResults[i];
      
      if (result.status === 'success') {
        const owner = String(result.result).toLowerCase();
        const tokenId = STAR_SKRUMPEY_IDS[i];
        
        if (owner === TREASURY_ADDRESS.toLowerCase()) {
          const metadata = metadataMap.get(tokenId);
          nfts.push({
            tokenId,
            constellation: metadata?.constellation || getStarVariantForTokenId(tokenId),
            imageUrl: metadata?.image_url,
          });
        }
      }
    }

    return nfts.sort((a, b) => a.tokenId - b.tokenId);
  } catch (error) {
    logger.error('Failed to fetch treasury NFTs', { error: String(error) });
    return [];
  }
}

export async function GET() {
  try {
    // Check cache first
    const now = Date.now();
    if (treasuryCache && (now - treasuryCache.timestamp < CACHE_TTL)) {
      logger.debug('Returning cached treasury data');
      return NextResponse.json({
        success: true,
        data: treasuryCache.data,
        cached: true,
      });
    }

    // Fetch fresh data in parallel
    const [balance, nfts] = await Promise.all([
      fetchTreasuryBalance(),
      fetchTreasuryNFTs(),
    ]);

    // Format balance
    const monBalanceFormatted = formatEther(balance);
    
    // TODO: Implement proper NFT valuation with price oracle or marketplace floor price
    // Currently showing MON balance only - NFT value not included
    const estimatedValueMON = monBalanceFormatted;

    const treasuryData: TreasuryData = {
      address: TREASURY_ADDRESS,
      monBalance: balance.toString(),
      monBalanceFormatted: parseFloat(monBalanceFormatted).toFixed(4),
      nftHoldings: nfts,
      nftCount: nfts.length,
      estimatedValueMON: parseFloat(estimatedValueMON).toFixed(4),
      lastUpdated: new Date().toISOString(),
    };

    // Update cache
    treasuryCache = {
      data: treasuryData,
      timestamp: now,
    };

    logger.info('Treasury data fetched', {
      balance: treasuryData.monBalanceFormatted,
      nftCount: treasuryData.nftCount,
    });

    return NextResponse.json({
      success: true,
      data: treasuryData,
      cached: false,
    });
  } catch (error) {
    logger.error('Failed to get treasury data:', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch treasury data' },
      { status: 500 }
    );
  }
}
