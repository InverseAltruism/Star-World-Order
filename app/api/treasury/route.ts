/**
 * Treasury API Route
 * 
 * GET /api/treasury - Get treasury wallet data including MON balance, NFT holdings, and transactions
 * 
 * Treasury wallet: 0xa209cfb0c8abdf5e3e3e7f4628214bdb597d55af
 * 
 * Uses Magic Eden API for NFT holdings and direct RPC for MON balance.
 * SQLite caching for 24-hour persistence.
 */

import { NextResponse } from 'next/server';
import { 
  SKRUMPEY_CONTRACT_ADDRESS,
} from '@/lib/starSkrumpey';
import { getCachedTreasuryNFTs, cacheTreasuryNFTs, getTreasuryNFTCacheAge } from '@/lib/db';
import { getResilientClient, retryWithBackoff } from '@/lib/rpcClient';
import { logger } from '@/lib/logger';
import { formatEther } from 'viem';
import { 
  getTreasuryNFTHoldings as getMagicEdenNFTHoldings,
  TreasuryNFTHolding as MagicEdenNFTHolding,
} from '@/lib/magiceden';

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
 * Fetch ALL NFTs owned by treasury using Magic Eden API with SQLite cache
 * Cache TTL: 24 hours
 * 
 * Data Flow:
 * 1. Check SQLite cache (24 hour TTL)
 * 2. If cache miss, fetch from Magic Eden API
 * 3. Store in SQLite cache for next time
 * 4. Enrich with Star Skrumpey metadata
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
    
    // Step 2: Cache miss - fetch via Magic Eden API
    logger.info('Cache miss - fetching NFTs via Magic Eden API', { address: TREASURY_ADDRESS });
    const { holdings: magicEdenHoldings } = await getMagicEdenNFTHoldings(TREASURY_ADDRESS);
    
    // Step 3: Save to cache for next time
    if (magicEdenHoldings.length > 0) {
      const cacheData = magicEdenHoldings.map(holding => ({
        wallet_address: TREASURY_ADDRESS,
        contract_address: holding.contractAddress,
        token_id: '0', // Magic Eden returns collection-level data, not individual token IDs
        name: holding.collectionName,
        collection_name: holding.collectionName,
        image_url: holding.imageUrl,
        metadata_json: JSON.stringify({
          ownedCount: holding.ownedCount,
          isVerified: holding.isVerified,
        }),
      }));
      
      cacheTreasuryNFTs(TREASURY_ADDRESS, cacheData);
      logger.info('Cached treasury NFTs', { count: magicEdenHoldings.length });
    }
    
    // Step 4: Convert to NFTHolding format with enrichment
    return convertMagicEdenToNFTHoldings(magicEdenHoldings);
  } catch (error) {
    logger.error('Failed to fetch treasury NFTs', { error: String(error) });
    return [];
  }
}

/**
 * Convert Magic Eden holdings to NFTHolding format with enrichment
 */
function convertMagicEdenToNFTHoldings(holdings: MagicEdenNFTHolding[]): NFTHolding[] {
  const skrumpeyContractLower = (SKRUMPEY_CONTRACT_ADDRESS || KNOWN_SKRUMPEY_ADDRESS).toLowerCase();
  
  const nfts: NFTHolding[] = holdings.map(holding => {
    const isSkrumpeyContract = holding.contractAddress.toLowerCase() === skrumpeyContractLower;
    
    return {
      tokenId: '0', // Magic Eden doesn't provide individual token IDs, only collection-level data
      name: holding.collectionName,
      collectionName: holding.collectionName,
      contractAddress: holding.contractAddress,
      imageUrl: holding.imageUrl,
      quantity: holding.ownedCount,
      isStarSkrumpey: false, // Can't determine individual Star Skrumpeys from collection-level data
      isVerified: holding.isVerified,
      estimatedFloorPrice: 0, // Floor prices not yet available - will show "Coming soon ~DN"
    };
  });
  
  // Sort: Skrumpeys first, then by quantity (descending), then by name
  return nfts.sort((a, b) => {
    const aIsSkrumpey = a.contractAddress.toLowerCase() === skrumpeyContractLower;
    const bIsSkrumpey = b.contractAddress.toLowerCase() === skrumpeyContractLower;
    
    if (aIsSkrumpey && !bIsSkrumpey) return -1;
    if (!aIsSkrumpey && bIsSkrumpey) return 1;
    if (a.quantity !== b.quantity) return b.quantity - a.quantity;
    return a.collectionName.localeCompare(b.collectionName);
  });
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
  const skrumpeyContractLower = (SKRUMPEY_CONTRACT_ADDRESS || KNOWN_SKRUMPEY_ADDRESS).toLowerCase();
  
  const nfts: NFTHolding[] = cachedNFTs.map(nft => {
    const isSkrumpeyContract = nft.contract_address.toLowerCase() === skrumpeyContractLower;
    
    // Parse metadata JSON if available
    let quantity = 1;
    let isVerified = false;
    if (nft.metadata_json) {
      try {
        const parsed = JSON.parse(nft.metadata_json);
        quantity = parsed.ownedCount || parsed.quantity || 1;
        isVerified = parsed.isVerified || false;
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    return {
      tokenId: nft.token_id,
      name: nft.name || `${nft.collection_name}`,
      collectionName: nft.collection_name,
      contractAddress: nft.contract_address,
      imageUrl: nft.image_url,
      quantity,
      isStarSkrumpey: false, // Can't determine from cached collection-level data
      isVerified,
      estimatedFloorPrice: 0, // Floor prices not yet available
    };
  });
  
  // Sort: Skrumpeys first, then by quantity, then by collection name
  return nfts.sort((a, b) => {
    const aIsSkrumpey = a.contractAddress.toLowerCase() === skrumpeyContractLower;
    const bIsSkrumpey = b.contractAddress.toLowerCase() === skrumpeyContractLower;
    
    if (aIsSkrumpey && !bIsSkrumpey) return -1;
    if (!aIsSkrumpey && bIsSkrumpey) return 1;
    if (a.quantity !== b.quantity) return b.quantity - a.quantity;
    return a.collectionName.localeCompare(b.collectionName);
  });
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

    // Fetch fresh data - balance and NFTs in parallel
    const [balance, nfts] = await Promise.all([
      fetchTreasuryBalance(),
      fetchTreasuryNFTs(),
    ]);
    
    // Note: Floor prices are not yet available via Magic Eden for Monad
    // All NFTs will have estimatedFloorPrice = 0 (display "Coming soon ~DN" in UI)

    // Format balance
    const monBalanceFormatted = formatEther(balance);
    const monBalanceNum = parseFloat(monBalanceFormatted);
    
    // Count NFTs and collections
    const nftCount = nfts.reduce((sum, nft) => sum + nft.quantity, 0);
    const uniqueCollections = [...new Set(nfts.map(n => n.contractAddress.toLowerCase()))];
    const uniqueCollectionsCount = uniqueCollections.length;
    const starSkrumpeyCount = nfts.filter(n => n.isStarSkrumpey).reduce((sum, n) => sum + n.quantity, 0);
    
    // Calculate total NFT value based on floor prices (currently 0)
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
