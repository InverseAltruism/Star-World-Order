/**
 * BlockVision API Integration for Star World Order
 * 
 * This module provides integration with BlockVision's Monad Indexing API
 * for fetching NFT holdings, token balances, and other account data.
 * 
 * API Documentation: https://docs.blockvision.org/reference/retrieve-monad-account-nfts
 * 
 * Rate Limits (Free Tier):
 * - 10,000,000 Compute Units per month
 * - 300 Compute Units per second
 * - Retrieve Account's NFTs: 300 CU per call
 * 
 * Caching Strategy:
 * - Cache NFT data for 5 minutes to minimize API calls
 * - Use database for persistent historical data
 */

import { logger } from './logger';

// BlockVision API base URL
const BLOCKVISION_API_BASE = 'https://api.blockvision.org/v2/monad';

// Get API key from environment
const BLOCKVISION_API_KEY = process.env.BLOCKVISION_API || '';

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

// In-memory cache for NFT data
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const nftCache = new Map<string, CacheEntry<BlockVisionNFTResponse>>();

/**
 * BlockVision API response types
 */
export interface BlockVisionNFTItem {
  name: string;
  contractAddress: string;
  tokenId: string;
  image: string;
  qty: string;
}

export interface BlockVisionNFTCollection {
  contractAddress: string;
  verified: boolean;
  name: string;
  image: string;
  ercStandard: string;
  items: BlockVisionNFTItem[];
}

export interface BlockVisionNFTResponse {
  code: number;
  reason?: string;
  message: string;
  result: {
    data: BlockVisionNFTCollection[];
    total: number;
    nextPageIndex: number;
    collectionTotal: number;
    verifiedTotal: number;
    unknownTotal: number;
  };
}

/**
 * Generic NFT holding for Treasury display
 */
export interface TreasuryNFTHolding {
  tokenId: string;
  name: string;
  collectionName: string;
  contractAddress: string;
  imageUrl: string;
  quantity: number;
  isVerified: boolean;
  ercStandard: string;
}

/**
 * Check if cache entry is still valid
 */
function isCacheValid<T>(entry: CacheEntry<T> | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL;
}

/**
 * Fetch NFTs for an account from BlockVision API
 * Includes all collections (verified and unverified)
 * 
 * @param address Wallet address to fetch NFTs for
 * @param pageIndex Page number (default 1, 5 collections per page)
 * @returns BlockVision NFT response
 */
export async function fetchAccountNFTs(
  address: string,
  pageIndex: number = 1
): Promise<BlockVisionNFTResponse> {
  const cacheKey = `${address.toLowerCase()}-${pageIndex}`;
  
  // Check cache first
  const cached = nftCache.get(cacheKey);
  if (cached && isCacheValid(cached)) {
    logger.debug('BlockVision: Returning cached NFT data', { address, pageIndex });
    return cached.data;
  }

  if (!BLOCKVISION_API_KEY) {
    logger.warn('BlockVision API key not configured');
    return {
      code: -1,
      message: 'BlockVision API key not configured',
      result: {
        data: [],
        total: 0,
        nextPageIndex: 1,
        collectionTotal: 0,
        verifiedTotal: 0,
        unknownTotal: 0,
      },
    };
  }

  try {
    const url = new URL(`${BLOCKVISION_API_BASE}/account/nfts`);
    url.searchParams.set('address', address);
    url.searchParams.set('pageIndex', String(pageIndex));
    // Include both verified and unverified collections
    url.searchParams.set('verified', 'false');
    url.searchParams.set('unknown', 'false');

    logger.debug('BlockVision: Fetching NFTs', { url: url.toString() });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-KEY': BLOCKVISION_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`BlockVision API error: ${response.status} ${response.statusText}`);
    }

    const data: BlockVisionNFTResponse = await response.json();

    if (data.code !== 0) {
      logger.warn('BlockVision API returned non-zero code', { 
        code: data.code, 
        reason: data.reason,
        message: data.message 
      });
    }

    // Cache the successful response
    nftCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });

    logger.info('BlockVision: Successfully fetched NFTs', {
      address,
      pageIndex,
      total: data.result.total,
      collections: data.result.collectionTotal,
    });

    return data;
  } catch (error) {
    logger.error('BlockVision: Failed to fetch NFTs', {
      address,
      error: String(error),
    });
    
    // Return empty result on error
    return {
      code: -1,
      message: String(error),
      result: {
        data: [],
        total: 0,
        nextPageIndex: pageIndex,
        collectionTotal: 0,
        verifiedTotal: 0,
        unknownTotal: 0,
      },
    };
  }
}

/**
 * Fetch ALL NFTs for an account (handles pagination)
 * 
 * @param address Wallet address to fetch NFTs for
 * @returns All NFT collections owned by the address
 */
export async function fetchAllAccountNFTs(
  address: string
): Promise<BlockVisionNFTCollection[]> {
  const allCollections: BlockVisionNFTCollection[] = [];
  let currentPage = 1;
  let hasMore = true;
  const maxPages = 20; // Safety limit to prevent infinite loops

  while (hasMore && currentPage <= maxPages) {
    const response = await fetchAccountNFTs(address, currentPage);
    
    if (response.code !== 0 || !response.result.data.length) {
      break;
    }

    allCollections.push(...response.result.data);
    
    // Check if there are more pages
    if (response.result.nextPageIndex === currentPage) {
      // No more pages
      hasMore = false;
    } else {
      currentPage = response.result.nextPageIndex;
    }
  }

  return allCollections;
}

/**
 * Convert BlockVision NFT data to Treasury NFT holdings format
 * 
 * @param collections BlockVision NFT collections
 * @returns Array of treasury NFT holdings
 */
export function convertToTreasuryHoldings(
  collections: BlockVisionNFTCollection[]
): TreasuryNFTHolding[] {
  const holdings: TreasuryNFTHolding[] = [];

  for (const collection of collections) {
    for (const item of collection.items) {
      holdings.push({
        tokenId: item.tokenId,
        name: item.name || `#${item.tokenId}`,
        collectionName: collection.name || 'Unknown Collection',
        contractAddress: collection.contractAddress,
        imageUrl: item.image || '',
        quantity: parseInt(item.qty, 10) || 1,
        isVerified: collection.verified,
        ercStandard: collection.ercStandard,
      });
    }
  }

  return holdings;
}

/**
 * Get all NFT holdings for a treasury address
 * This is the main function to use for fetching treasury NFTs
 * 
 * @param address Treasury wallet address
 * @returns Array of all NFT holdings with metadata
 */
export async function getTreasuryNFTHoldings(
  address: string
): Promise<{
  holdings: TreasuryNFTHolding[];
  totalCount: number;
  collectionCount: number;
}> {
  const collections = await fetchAllAccountNFTs(address);
  const holdings = convertToTreasuryHoldings(collections);
  
  return {
    holdings,
    totalCount: holdings.reduce((sum, h) => sum + h.quantity, 0),
    collectionCount: collections.length,
  };
}

/**
 * Clear the NFT cache (useful for manual refresh)
 */
export function clearNFTCache(): void {
  nftCache.clear();
  logger.info('BlockVision: NFT cache cleared');
}

/**
 * Get cache stats for monitoring
 */
export function getCacheStats(): {
  entries: number;
  oldestEntry: number | null;
} {
  let oldestTimestamp: number | null = null;
  
  for (const entry of nftCache.values()) {
    if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
      oldestTimestamp = entry.timestamp;
    }
  }

  return {
    entries: nftCache.size,
    oldestEntry: oldestTimestamp,
  };
}
