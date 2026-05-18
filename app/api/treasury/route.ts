/**
 * Treasury API Route
 * GET /api/treasury - Get treasury wallet data including MON balance, NFT holdings
 */

import { NextResponse } from 'next/server';
import { SKRUMPEY_CONTRACT_ADDRESS, isStarSkrumpeyId } from '@/lib/starSkrumpey';
import { getResilientClient, retryWithBackoff } from '@/lib/rpcClient';
import { logger } from '@/lib/logger';
import { formatEther } from 'viem';
import { fetchCollectionFloorPrice } from '@/lib/blockvision';
import { fetchTrackedHoldings } from '@/lib/trackedCollections';
import { getFloorPriceByContract } from '@/lib/floorPrices';
import { getLocalApiFloorPrices } from '@/lib/floorPriceApi';

// Treasury wallet address
const TREASURY_ADDRESS = '0xa209cfb0c8abdf5e3e3e7f4628214bdb597d55af' as const;

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
 * Fetch the treasury's NFT holdings via on-chain `ownerOf` multicalls against
 * the curated list in lib/trackedCollections.ts.
 *
 * Why this approach: no Monad NFT indexer is currently viable — Magic Eden
 * dropped EVM, OpenSea has no Monad API, BlockVision's free tier is
 * rate-limited (Pro plan required). So we go direct to chain for each known
 * contract. Slow (~7s for a 3333-token contract) but free, deterministic,
 * and not dependent on any third-party. To track a new collection on the
 * treasury page, add it to TRACKED_COLLECTIONS in lib/trackedCollections.ts.
 */
async function fetchTreasuryNFTs(): Promise<{ holdings: NFTHolding[]; starSkrumpeyCount: number }> {
  try {
    logger.info('Fetching treasury NFTs via tracked-collections RPC multicall', {
      address: TREASURY_ADDRESS,
    });

    const tracked = await fetchTrackedHoldings(TREASURY_ADDRESS);
    if (tracked.length === 0) {
      logger.info('Treasury holds no tokens from any tracked collection', {
        address: TREASURY_ADDRESS,
      });
      return { holdings: [], starSkrumpeyCount: 0 };
    }

    const skrumpeyContractLower = (SKRUMPEY_CONTRACT_ADDRESS || KNOWN_SKRUMPEY_ADDRESS).toLowerCase();
    let starSkrumpeyCount = 0;

    const holdings: NFTHolding[] = tracked.map((t) => {
      const isSkrumpey = t.contractAddress.toLowerCase() === skrumpeyContractLower;
      if (isSkrumpey) {
        for (const id of t.ownedTokenIds) {
          if (isStarSkrumpeyId(id)) starSkrumpeyCount++;
        }
      }

      return {
        tokenId: '0',
        name: t.name,
        collectionName: t.name,
        contractAddress: t.contractAddress,
        imageUrl: t.imageUrl,
        quantity: t.ownedTokenIds.length,
        isStarSkrumpey: false,
        isVerified: t.isVerified,
        estimatedFloorPrice: 0,
      };
    });

    // Skrumpeys first, then by quantity desc.
    holdings.sort((a, b) => {
      const aIsSkrumpey = a.contractAddress.toLowerCase() === skrumpeyContractLower;
      const bIsSkrumpey = b.contractAddress.toLowerCase() === skrumpeyContractLower;
      if (aIsSkrumpey && !bIsSkrumpey) return -1;
      if (!aIsSkrumpey && bIsSkrumpey) return 1;
      return b.quantity - a.quantity;
    });

    logger.info('Treasury tracked holdings resolved', {
      count: holdings.length,
      totalNFTs: holdings.reduce((sum, h) => sum + h.quantity, 0),
      starSkrumpeyCount,
      collections: holdings.map((h) => ({ name: h.name, count: h.quantity })),
    });

    return { holdings, starSkrumpeyCount };
  } catch (error) {
    logger.error('Failed to fetch treasury NFTs', { error: String(error) });
    return { holdings: [], starSkrumpeyCount: 0 };
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
    const [balance, { holdings: nfts, starSkrumpeyCount }] = await Promise.all([
      fetchTreasuryBalance(),
      fetchTreasuryNFTs(),
    ]);

    const monBalanceFormatted = formatEther(balance);
    const monBalanceNum = parseFloat(monBalanceFormatted);

    const nftCount = nfts.reduce((sum, nft) => sum + nft.quantity, 0);
    const uniqueCollections = [...new Set(nfts.map((n) => n.contractAddress.toLowerCase()))];

    // Calculate NFT values using floor prices
    // Priority: 1. Local Floor Price API, 2. BlockVision, 3. Database
    logger.info('Calculating NFT values for treasury holdings', { 
      collectionCount: uniqueCollections.length 
    });
    
    // Fetch all floor prices from local API in one call (cached)
    const localFloorPrices = await getLocalApiFloorPrices();
    logger.info('Local floor price API returned prices', { 
      count: localFloorPrices.size 
    });
    
    let totalNFTValue = 0;
    const nftsWithPrices = await Promise.all(
      nfts.map(async (nft) => {
        let floorPrice: number | null = null;
        let priceSource = 'none';
        
        // 1. Try local floor price API first (fastest, our own data)
        const localPrice = localFloorPrices.get(nft.collectionName.toLowerCase());
        if (localPrice !== undefined && localPrice > 0) {
          floorPrice = localPrice;
          priceSource = 'local_api';
        }
        
        // 2. Try BlockVision API if local didn't have it
        if (floorPrice === null) {
          try {
            floorPrice = await fetchCollectionFloorPrice(nft.contractAddress);
            if (floorPrice !== null) {
              priceSource = 'blockvision';
            }
          } catch (error) {
            logger.debug('BlockVision floor price fetch failed', {
              collection: nft.collectionName,
              error: String(error),
            });
          }
        }
        
        // 3. Fall back to database floor prices
        if (floorPrice === null) {
          const dbFloorPrice = getFloorPriceByContract(nft.contractAddress);
          if (dbFloorPrice && dbFloorPrice.floorPriceMON !== null) {
            floorPrice = dbFloorPrice.floorPriceMON;
            priceSource = 'database';
          }
        }
        
        if (floorPrice !== null) {
          logger.debug('Got floor price', {
            collection: nft.collectionName,
            floorPrice,
            source: priceSource,
          });
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
