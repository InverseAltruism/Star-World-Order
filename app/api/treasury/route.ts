/**
 * Treasury API Route
 * GET /api/treasury - Get treasury wallet data including MON balance, NFT holdings
 */

import { NextResponse } from 'next/server';
import { SKRUMPEY_CONTRACT_ADDRESS } from '@/lib/starSkrumpey';
import { getResilientClient, retryWithBackoff } from '@/lib/rpcClient';
import { logger } from '@/lib/logger';
import { formatEther } from 'viem';
import { fetchCollectionFloorPrice } from '@/lib/blockvision';
import { getFloorPriceByContract } from '@/lib/floorPrices';

// Treasury wallet address
const TREASURY_ADDRESS = '0xa209cfb0c8abdf5e3e3e7f4628214bdb597d55af' as const;

// Magic Eden API
const MAGIC_EDEN_API = 'https://api-mainnet.magiceden.dev/v4/evm-public/collections/user-collections';

// Known Skrumpeys contract address (fallback if env var not set)
const KNOWN_SKRUMPEY_ADDRESS = '0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0';

// Cache for treasury data (1 hour TTL)
let treasuryCache: {
  data: TreasuryData;
  timestamp: number;
} | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export interface NFTHolding {
  tokenId: string;
  name:  string;
  collectionName:  string;
  contractAddress: string;
  imageUrl?:  string;
  quantity: number;
  isStarSkrumpey: boolean;
  constellation?:  string;
  isVerified:  boolean;
  estimatedFloorPrice?: number;
}

export interface TreasuryActivity {
  type: 'nft_in' | 'nft_out' | 'mon_in' | 'mon_out';
  transactionHash: string;
  timestamp: number;
  description: string;
  amount: string;
  collectionName?: string;
  tokenId?: string;
  imageUrl?: string;
}

export interface TreasuryData {
  address: string;
  monBalance: string;
  monBalanceFormatted: string;
  nftHoldings: NFTHolding[];
  nftCount: number;
  collectionCount: number;
  starSkrumpeyCount: number;
  estimatedValueMON: string;
  estimatedNFTValueMON: string;
  recentActivities:  TreasuryActivity[];
  lastUpdated: string;
}

/**
 * Clear the treasury cache (exported for admin use)
 */
export function clearTreasuryCache(): void {
  treasuryCache = null;
  logger.info('Treasury: Cache cleared');
}

/**
 * Fetch treasury MON balance
 */
async function fetchTreasuryBalance(): Promise<bigint> {
  try {
    const client = await getResilientClient();
    const balance = await retryWithBackoff(async () => {
      return await client.getBalance({ address: TREASURY_ADDRESS });
    });
    return balance;
  } catch (error) {
    logger.error('Failed to fetch treasury balance', { error:  String(error) });
    return BigInt(0);
  }
}

/**
 * Fetch NFTs directly from Magic Eden API
 */
async function fetchTreasuryNFTs(): Promise<NFTHolding[]> {
  try {
    logger.info('Fetching NFTs from Magic Eden API', { address: TREASURY_ADDRESS });
    
    // Get API key from environment (optional - API works without it but may have higher rate limits)
    const apiKey = process.env.MAGIC_EDEN_API_KEY;
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    // Add Authorization header if API key is available
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(MAGIC_EDEN_API, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        chain: 'monad',
        walletAddresses: [TREASURY_ADDRESS],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Magic Eden API error', { status: response.status, error: errorText });
      return [];
    }

    const rawData = await response.json();
    logger.info('Magic Eden raw response', { 
      collectionCount: rawData?. collections?.length || 0 
    });

    if (!rawData?.collections || ! Array.isArray(rawData. collections)) {
      logger.warn('No collections in response');
      return [];
    }

    const skrumpeyContractLower = (SKRUMPEY_CONTRACT_ADDRESS || KNOWN_SKRUMPEY_ADDRESS).toLowerCase();

    // Map Magic Eden response to our NFTHolding format
    const holdings:  NFTHolding[] = rawData.collections
      .filter((c: any) => c && (c.chainData?.contract || c.id))
      .map((c: any) => {
        const contractAddress = c.chainData?.contract || c.id || '';
        const isSkrumpey = contractAddress.toLowerCase() === skrumpeyContractLower;
        
        return {
          tokenId: '0',
          name: c.name || 'Unknown Collection',
          collectionName: c.name || 'Unknown Collection',
          contractAddress:  contractAddress,
          imageUrl:  c.media?.url || '',
          quantity: c. ownedCount || 0,
          isStarSkrumpey: false,
          isVerified: c.verification === 'VERIFIED',
          estimatedFloorPrice: 0,
        };
      });

    // Sort:  Skrumpeys first, then by quantity
    holdings.sort((a, b) => {
      const aIsSkrumpey = a.contractAddress.toLowerCase() === skrumpeyContractLower;
      const bIsSkrumpey = b.contractAddress.toLowerCase() === skrumpeyContractLower;
      if (aIsSkrumpey && !bIsSkrumpey) return -1;
      if (! aIsSkrumpey && bIsSkrumpey) return 1;
      return b.quantity - a.quantity;
    });

    logger.info('Mapped NFT holdings', { 
      count: holdings.length,
      totalNFTs: holdings.reduce((sum, h) => sum + h.quantity, 0),
      collections: holdings.map(h => ({ name: h.name, count: h.quantity }))
    });

    return holdings;
  } catch (error) {
    logger.error('Failed to fetch treasury NFTs', { error: String(error) });
    return [];
  }
}

export async function GET(request: Request) {
  try {
    // Check for force refresh parameter
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';
    
    // Check cache (skip if force refresh or cache has no NFTs)
    const now = Date.now();
    if (!forceRefresh && treasuryCache && (now - treasuryCache.timestamp < CACHE_TTL)) {
      // Only use cache if it has NFT data
      if (treasuryCache.data.nftHoldings.length > 0) {
        logger.debug('Returning cached treasury data');
        return NextResponse. json({
          success: true,
          data: treasuryCache.data,
          cached: true,
        });
      }
      logger.info('Cache has no NFTs, fetching fresh data');
    }

    // Fetch fresh data
    const [balance, nfts] = await Promise.all([
      fetchTreasuryBalance(),
      fetchTreasuryNFTs(),
    ]);

    const monBalanceFormatted = formatEther(balance);
    const monBalanceNum = parseFloat(monBalanceFormatted);
    
    const nftCount = nfts.reduce((sum, nft) => sum + nft.quantity, 0);
    const uniqueCollections = [... new Set(nfts.map(n => n.contractAddress. toLowerCase()))];
    const starSkrumpeyCount = nfts.filter(n => n.isStarSkrumpey).reduce((sum, n) => sum + n.quantity, 0);

    // Calculate NFT values using floor prices
    // Try BlockVision API first, fall back to database floor prices
    logger.info('Calculating NFT values for treasury holdings', { 
      collectionCount: uniqueCollections.length 
    });
    
    let totalNFTValue = 0;
    const nftsWithPrices = await Promise.all(
      nfts.map(async (nft) => {
        let floorPrice: number | null = null;
        
        // Try BlockVision API first
        try {
          floorPrice = await fetchCollectionFloorPrice(nft.contractAddress);
          if (floorPrice !== null) {
            logger.debug('Got floor price from BlockVision', {
              contract: nft.contractAddress,
              floorPrice,
            });
          }
        } catch (error) {
          logger.debug('BlockVision floor price fetch failed, trying database', {
            contract: nft.contractAddress,
            error: String(error),
          });
        }
        
        // Fall back to database floor prices if BlockVision didn't return a value
        if (floorPrice === null) {
          const dbFloorPrice = getFloorPriceByContract(nft.contractAddress);
          if (dbFloorPrice && dbFloorPrice.floorPriceMON !== null) {
            floorPrice = dbFloorPrice.floorPriceMON;
            logger.debug('Got floor price from database', {
              contract: nft.contractAddress,
              floorPrice,
            });
          }
        }
        
        // Calculate value for this NFT holding (floor price * quantity)
        const nftValue = floorPrice !== null ? floorPrice * nft.quantity : 0;
        totalNFTValue += nftValue;
        
        return {
          ...nft,
          estimatedFloorPrice: floorPrice || undefined,
        };
      })
    );

    const estimatedNFTValueMON = totalNFTValue.toFixed(4);
    const totalValueMON = (monBalanceNum + totalNFTValue).toFixed(4);

    logger.info('Treasury NFT valuation complete', {
      totalNFTValue: estimatedNFTValueMON,
      totalValue: totalValueMON,
      collectionsWithPrices: nftsWithPrices.filter(n => n.estimatedFloorPrice !== undefined).length,
    });

    const treasuryData:  TreasuryData = {
      address: TREASURY_ADDRESS,
      monBalance: balance.toString(),
      monBalanceFormatted: monBalanceNum.toFixed(4),
      nftHoldings: nftsWithPrices,
      nftCount,
      collectionCount: uniqueCollections.length,
      starSkrumpeyCount,
      estimatedValueMON: totalValueMON,
      estimatedNFTValueMON: estimatedNFTValueMON,
      recentActivities:  [],
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
      collectionCount: treasuryData. collectionCount,
    });

    return NextResponse.json({
      success: true,
      data: treasuryData,
      cached: false,
    });
  } catch (error) {
    logger.error('Failed to get treasury data', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch treasury data' },
      { status: 500 }
    );
  }
}
