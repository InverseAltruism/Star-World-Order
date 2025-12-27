/**
 * Treasury API Route
 * 
 * GET /api/treasury - Get treasury wallet data including MON balance, NFT holdings, and transactions
 * 
 * Treasury wallet: 0xa209cfb0c8abdf5e3e3e7f4628214bdb597d55af
 * 
 * Uses direct RPC calls with SQLite caching to fetch NFT holdings.
 * Falls back to BlockVision API if available for floor prices and activities.
 */

import { NextResponse } from 'next/server';
import { 
  SKRUMPEY_CONTRACT_ADDRESS,
  getStarVariantForTokenId,
  STAR_SKRUMPEY_IDS_SET,
} from '@/lib/starSkrumpey';
import { getStarSkrumpeyMetadataBatch, getCachedTreasuryNFTs, cacheTreasuryNFTs, getTreasuryNFTCacheAge } from '@/lib/db';
import { getResilientClient, retryWithBackoff } from '@/lib/rpcClient';
import { logger } from '@/lib/logger';
import { formatEther } from 'viem';
import { TreasuryActivity, fetchMultipleFloorPrices } from '@/lib/blockvision';
import { fetchNFTsViaRPC, RPCNFTHolding } from '@/lib/rpcNftFetcher';

// Treasury wallet address
const TREASURY_ADDRESS = '0xa209cfb0c8abdf5e3e3e7f4628214bdb597d55af' as const;

// Cache for treasury data (1 hour TTL to minimize API calls)
let treasuryCache: {
  data: TreasuryData;
  timestamp: number;
} | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Clear the treasury cache (exported for admin use)
 */
export function clearTreasuryCache(): void {
  treasuryCache = null;
  logger.info('Treasury: Cache cleared');
}

// Known Skrumpeys contract address (fallback if env var not set)
const KNOWN_SKRUMPEY_ADDRESS = '0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0';

// Star Skrumpey premium multiplier (Star trait NFTs are worth more)
const STAR_SKRUMPEY_PREMIUM = 1.5;

export interface NFTHolding {
  tokenId: string;
  name: string;
  collectionName: string;
  contractAddress: string;
  imageUrl?: string;
  quantity: number;
  isStarSkrumpey: boolean;
  constellation?: string;
  isVerified: boolean;
  // Estimated floor price for this NFT in MON
  estimatedFloorPrice?: number;
}

export interface TreasuryData {
  address: string;
  monBalance: string;
  monBalanceFormatted: string;
  nftHoldings: NFTHolding[];
  nftCount: number;
  collectionCount: number;
  starSkrumpeyCount: number;
  // Estimated total value in MON (NFT floor price * count + MON balance)
  estimatedValueMON: string;
  // Separate NFT value for transparency
  estimatedNFTValueMON: string;
  // Recent activities (NFT transfers, etc.)
  recentActivities: TreasuryActivity[];
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
 * Fetch ALL NFTs owned by treasury using RPC with SQLite cache
 * Cache TTL: 24 hours
 * Falls back to BlockVision if available (but not required)
 */
async function fetchTreasuryNFTs(): Promise<NFTHolding[]> {
  try {
    // Step 1: Check SQLite cache first (24 hour TTL)
    const cachedNFTs = getCachedTreasuryNFTs(TREASURY_ADDRESS, 24);
    
    if (cachedNFTs && cachedNFTs.length > 0) {
      const cacheAge = getTreasuryNFTCacheAge(TREASURY_ADDRESS);
      logger.info('Using cached treasury NFTs', {
        count: cachedNFTs.length,
        ageHours: cacheAge?.toFixed(2),
      });
      
      // Convert cached NFTs to NFTHolding format
      return convertCachedToNFTHoldings(cachedNFTs);
    }
    
    // Step 2: Cache miss - fetch via RPC
    logger.info('Cache miss - fetching NFTs via RPC', { address: TREASURY_ADDRESS });
    const rpcNFTs = await fetchNFTsViaRPC(TREASURY_ADDRESS as `0x${string}`);
    
    // Step 3: Save to cache for next time
    if (rpcNFTs.length > 0) {
      const cacheData = rpcNFTs.map(nft => ({
        wallet_address: TREASURY_ADDRESS,
        contract_address: nft.contractAddress,
        token_id: nft.tokenId,
        name: nft.name,
        collection_name: nft.collectionName,
        image_url: nft.imageUrl,
        metadata_json: JSON.stringify({
          metadataUri: nft.metadataUri,
          quantity: nft.quantity,
        }),
      }));
      
      cacheTreasuryNFTs(TREASURY_ADDRESS, cacheData);
      logger.info('Cached treasury NFTs', { count: rpcNFTs.length });
    }
    
    // Step 4: Convert to NFTHolding format with enrichment
    return convertRPCToNFTHoldings(rpcNFTs);
  } catch (error) {
    logger.error('Failed to fetch treasury NFTs', { error: String(error) });
    return [];
  }
}

/**
 * Convert cached NFTs to NFTHolding format with enrichment
 */
function convertCachedToNFTHoldings(cachedNFTs: Array<{
  contract_address: string;
  token_id: string;
  name?: string;
  collection_name: string;
  image_url?: string;
  metadata_json?: string;
}>): NFTHolding[] {
  const skrumpeyContractLower = SKRUMPEY_CONTRACT_ADDRESS?.toLowerCase() ?? '';
  
  // Get Star Skrumpey metadata for enrichment
  const starSkrumpeyTokenIds = cachedNFTs
    .filter(nft => nft.contract_address.toLowerCase() === skrumpeyContractLower)
    .map(nft => parseInt(nft.token_id, 10))
    .filter(id => !isNaN(id) && STAR_SKRUMPEY_IDS_SET.has(id));
  
  const metadataMap = getStarSkrumpeyMetadataBatch(starSkrumpeyTokenIds);
  
  // Get unique collection addresses for floor price lookup
  const uniqueCollections = [...new Set(cachedNFTs.map(nft => nft.contract_address.toLowerCase()))];
  
  // Note: Floor prices are fetched in the main GET handler
  // This conversion happens before that step
  
  const nfts: NFTHolding[] = cachedNFTs.map(nft => {
    const tokenIdNum = parseInt(nft.token_id, 10);
    const isSkrumpeyContract = skrumpeyContractLower !== '' && nft.contract_address.toLowerCase() === skrumpeyContractLower;
    const isStarSkrumpey = isSkrumpeyContract && !isNaN(tokenIdNum) && STAR_SKRUMPEY_IDS_SET.has(tokenIdNum);
    
    let constellation: string | undefined;
    if (isStarSkrumpey) {
      const metadata = metadataMap.get(tokenIdNum);
      constellation = metadata?.constellation || getStarVariantForTokenId(tokenIdNum);
    }
    
    // Parse metadata JSON if available
    let quantity = 1;
    if (nft.metadata_json) {
      try {
        const parsed = JSON.parse(nft.metadata_json);
        quantity = parsed.quantity || 1;
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    return {
      tokenId: nft.token_id,
      name: nft.name || `${nft.collection_name} #${nft.token_id}`,
      collectionName: nft.collection_name,
      contractAddress: nft.contract_address,
      imageUrl: nft.image_url,
      quantity,
      isStarSkrumpey,
      constellation,
      isVerified: false, // RPC-fetched NFTs don't have verified flag
    };
  });
  
  // Sort: Star Skrumpeys first, then by collection name
  return nfts.sort((a, b) => {
    if (a.isStarSkrumpey && !b.isStarSkrumpey) return -1;
    if (!a.isStarSkrumpey && b.isStarSkrumpey) return 1;
    if (a.isStarSkrumpey && b.isStarSkrumpey) {
      return parseInt(a.tokenId, 10) - parseInt(b.tokenId, 10);
    }
    return a.collectionName.localeCompare(b.collectionName);
  });
}

/**
 * Convert RPC NFTs to NFTHolding format with enrichment
 */
function convertRPCToNFTHoldings(rpcNFTs: RPCNFTHolding[]): NFTHolding[] {
  const skrumpeyContractLower = SKRUMPEY_CONTRACT_ADDRESS?.toLowerCase() ?? '';
  
  // Get Star Skrumpey metadata for enrichment
  const starSkrumpeyTokenIds = rpcNFTs
    .filter(nft => nft.contractAddress.toLowerCase() === skrumpeyContractLower)
    .map(nft => parseInt(nft.tokenId, 10))
    .filter(id => !isNaN(id) && STAR_SKRUMPEY_IDS_SET.has(id));
  
  const metadataMap = getStarSkrumpeyMetadataBatch(starSkrumpeyTokenIds);
  
  const nfts: NFTHolding[] = rpcNFTs.map(nft => {
    const tokenIdNum = parseInt(nft.tokenId, 10);
    const isSkrumpeyContract = skrumpeyContractLower !== '' && nft.contractAddress.toLowerCase() === skrumpeyContractLower;
    const isStarSkrumpey = isSkrumpeyContract && !isNaN(tokenIdNum) && STAR_SKRUMPEY_IDS_SET.has(tokenIdNum);
    
    let constellation: string | undefined;
    if (isStarSkrumpey) {
      const metadata = metadataMap.get(tokenIdNum);
      constellation = metadata?.constellation || getStarVariantForTokenId(tokenIdNum);
    }
    
    return {
      tokenId: nft.tokenId,
      name: nft.name,
      collectionName: nft.collectionName,
      contractAddress: nft.contractAddress,
      imageUrl: nft.imageUrl,
      quantity: nft.quantity,
      isStarSkrumpey,
      constellation,
      isVerified: false, // RPC-fetched NFTs don't have verified flag
    };
  });
  
  // Sort: Star Skrumpeys first, then by collection name
  return nfts.sort((a, b) => {
    if (a.isStarSkrumpey && !b.isStarSkrumpey) return -1;
    if (!a.isStarSkrumpey && b.isStarSkrumpey) return 1;
    if (a.isStarSkrumpey && b.isStarSkrumpey) {
      return parseInt(a.tokenId, 10) - parseInt(b.tokenId, 10);
    }
    return a.collectionName.localeCompare(b.collectionName);
  });
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

    // Fetch fresh data - balance and NFTs in parallel
    const [balance, nfts] = await Promise.all([
      fetchTreasuryBalance(),
      fetchTreasuryNFTs(),
    ]);
    
    // Get unique collection addresses for floor price lookup
    const uniqueCollections = [...new Set(nfts.map(n => n.contractAddress.toLowerCase()))];
    
    // Try to fetch floor prices from BlockVision (optional - graceful degradation)
    let floorPricesMap = new Map<string, number>();
    try {
      floorPricesMap = await fetchMultipleFloorPrices(uniqueCollections);
      logger.info('Fetched floor prices for collections', {
        requestedCollections: uniqueCollections.length,
        receivedPrices: floorPricesMap.size,
      });
    } catch (error) {
      logger.warn('Failed to fetch floor prices (continuing without)', { 
        error: String(error),
      });
    }
    
    // Apply floor prices to NFTs
    for (const nft of nfts) {
      const contractLower = nft.contractAddress.toLowerCase();
      let estimatedFloorPrice = floorPricesMap.get(contractLower) || 0;
      
      // Apply premium for Star Skrumpeys (they are rarer and worth more)
      if (nft.isStarSkrumpey && estimatedFloorPrice > 0) {
        estimatedFloorPrice *= STAR_SKRUMPEY_PREMIUM;
      }
      
      nft.estimatedFloorPrice = estimatedFloorPrice;
    }

    // Format balance
    const monBalanceFormatted = formatEther(balance);
    const monBalanceNum = parseFloat(monBalanceFormatted);
    
    // Count NFTs and collections
    const nftCount = nfts.reduce((sum, nft) => sum + nft.quantity, 0);
    const uniqueCollectionsCount = uniqueCollections.length;
    const starSkrumpeyCount = nfts.filter(n => n.isStarSkrumpey).reduce((sum, n) => sum + n.quantity, 0);
    
    // Calculate total NFT value based on floor prices
    const nftValue = nfts.reduce((sum, nft) => {
      return sum + ((nft.estimatedFloorPrice || 0) * nft.quantity);
    }, 0);
    
    // Total value = MON balance + NFT value
    const totalValue = monBalanceNum + nftValue;

    const treasuryData: TreasuryData = {
      address: TREASURY_ADDRESS,
      monBalance: balance.toString(),
      monBalanceFormatted: monBalanceNum.toFixed(4),
      nftHoldings: nfts,
      nftCount,
      collectionCount: uniqueCollectionsCount,
      starSkrumpeyCount,
      estimatedValueMON: totalValue.toFixed(4),
      estimatedNFTValueMON: nftValue.toFixed(4),
      recentActivities: [], // Activities not available via RPC
      lastUpdated: new Date().toISOString(),
    };

    // Update cache
    treasuryCache = {
      data: treasuryData,
      timestamp: now,
    };

    logger.info('Treasury data fetched', {
      balance: treasuryData.monBalanceFormatted,
      nftValue: treasuryData.estimatedNFTValueMON,
      totalValue: treasuryData.estimatedValueMON,
      nftCount: treasuryData.nftCount,
      collectionCount: treasuryData.collectionCount,
      starSkrumpeyCount: treasuryData.starSkrumpeyCount,
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
