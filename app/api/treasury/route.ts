/**
 * Treasury API Route
 * 
 * GET /api/treasury - Get treasury wallet data including MON balance, NFT holdings, and transactions
 * 
 * Treasury wallet: 0xa209cfb0c8abdf5e3e3e7f4628214bdb597d55af
 * 
 * Uses BlockVision Monad Indexing API to fetch all NFT holdings across all collections.
 */

import { NextResponse } from 'next/server';
import { 
  SKRUMPEY_CONTRACT_ADDRESS,
  getStarVariantForTokenId,
  STAR_SKRUMPEY_IDS_SET,
} from '@/lib/starSkrumpey';
import { getStarSkrumpeyMetadataBatch } from '@/lib/db';
import { getResilientClient, retryWithBackoff } from '@/lib/rpcClient';
import { logger } from '@/lib/logger';
import { formatEther } from 'viem';
import { getTreasuryNFTHoldings, TreasuryNFTHolding } from '@/lib/blockvision';

// Treasury wallet address
const TREASURY_ADDRESS = '0xa209cfb0c8abdf5e3e3e7f4628214bdb597d55af' as const;

// Cache for treasury data (2 minute TTL for more frequent updates)
let treasuryCache: {
  data: TreasuryData;
  timestamp: number;
} | null = null;
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

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
 * Fetch ALL NFTs owned by treasury using BlockVision API
 * Includes Star Skrumpeys and all other collections
 */
async function fetchTreasuryNFTs(): Promise<NFTHolding[]> {
  try {
    // Use BlockVision API to get all NFTs
    const { holdings } = await getTreasuryNFTHoldings(TREASURY_ADDRESS);
    
    // Get Star Skrumpey metadata for enrichment
    const starSkrumpeyTokenIds = holdings
      .filter(h => h.contractAddress.toLowerCase() === SKRUMPEY_CONTRACT_ADDRESS?.toLowerCase())
      .map(h => parseInt(h.tokenId, 10))
      .filter(id => !isNaN(id) && STAR_SKRUMPEY_IDS_SET.has(id));
    
    const metadataMap = getStarSkrumpeyMetadataBatch(starSkrumpeyTokenIds);
    
    // Convert to our NFTHolding format with Star Skrumpey enrichment
    const nfts: NFTHolding[] = holdings.map((holding: TreasuryNFTHolding) => {
      const tokenIdNum = parseInt(holding.tokenId, 10);
      const isSkrumpeyContract = holding.contractAddress.toLowerCase() === SKRUMPEY_CONTRACT_ADDRESS?.toLowerCase();
      const isStarSkrumpey = isSkrumpeyContract && !isNaN(tokenIdNum) && STAR_SKRUMPEY_IDS_SET.has(tokenIdNum);
      
      // Get constellation data for Star Skrumpeys
      let constellation: string | undefined;
      if (isStarSkrumpey) {
        const metadata = metadataMap.get(tokenIdNum);
        constellation = metadata?.constellation || getStarVariantForTokenId(tokenIdNum);
      }
      
      return {
        tokenId: holding.tokenId,
        name: holding.name,
        collectionName: holding.collectionName,
        contractAddress: holding.contractAddress,
        imageUrl: holding.imageUrl || undefined,
        quantity: holding.quantity,
        isStarSkrumpey,
        constellation,
        isVerified: holding.isVerified,
      };
    });
    
    // Sort: Star Skrumpeys first (by token ID), then other NFTs by collection name
    return nfts.sort((a, b) => {
      if (a.isStarSkrumpey && !b.isStarSkrumpey) return -1;
      if (!a.isStarSkrumpey && b.isStarSkrumpey) return 1;
      if (a.isStarSkrumpey && b.isStarSkrumpey) {
        return parseInt(a.tokenId, 10) - parseInt(b.tokenId, 10);
      }
      return a.collectionName.localeCompare(b.collectionName);
    });
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
    
    // Count NFTs and collections
    const nftCount = nfts.reduce((sum, nft) => sum + nft.quantity, 0);
    const uniqueCollections = new Set(nfts.map(n => n.contractAddress.toLowerCase()));
    const collectionCount = uniqueCollections.size;
    const starSkrumpeyCount = nfts.filter(n => n.isStarSkrumpey).reduce((sum, n) => sum + n.quantity, 0);
    
    // TODO: Implement proper NFT valuation with price oracle or marketplace floor price
    // Currently showing MON balance only - NFT value not included
    const estimatedValueMON = monBalanceFormatted;

    const treasuryData: TreasuryData = {
      address: TREASURY_ADDRESS,
      monBalance: balance.toString(),
      monBalanceFormatted: parseFloat(monBalanceFormatted).toFixed(4),
      nftHoldings: nfts,
      nftCount,
      collectionCount,
      starSkrumpeyCount,
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
