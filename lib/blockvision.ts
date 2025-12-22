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

// Cache TTL in milliseconds (1 hour to minimize API calls)
const CACHE_TTL = 60 * 60 * 1000;

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
    // BlockVision API params: when both verified=false and unknown=false,
    // the API returns ALL NFTs (both verified and unverified collections)
    // Setting verified=true would return ONLY verified collections
    // Setting unknown=true would return ONLY unverified/unknown collections
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
 * @param maxPages Maximum pages to fetch (default: 50, supports up to 250 collections)
 * @returns All NFT collections owned by the address
 */
export async function fetchAllAccountNFTs(
  address: string,
  maxPages: number = 50
): Promise<BlockVisionNFTCollection[]> {
  const allCollections: BlockVisionNFTCollection[] = [];
  let currentPage = 1;
  let hasMore = true;
  // Safety limit: cap at 50 pages max (250 collections) to prevent runaway requests
  const safeMaxPages = Math.min(maxPages, 50);

  while (hasMore && currentPage <= safeMaxPages) {
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

/**
 * BlockVision NFT Activity types
 */
export interface BlockVisionNFTActivityItem {
  name: string;
  contractAddress: string;
  tokenId: string;
  image: string;
  qty: string;
}

export interface BlockVisionAddress {
  address: string;
  type: string;
  isContract: boolean;
  verified: boolean;
  ens: string;
  name: string;
  isContractCreated: boolean;
}

export interface BlockVisionActivity {
  transactionHash: string;
  method: string;
  blockNumber: number;
  timestamp: number;
  from: string;
  to: string;
  type: string;
  nft: BlockVisionNFTActivityItem;
  collectionName: string;
  verified: boolean;
  fromAddress: BlockVisionAddress;
  toAddress: BlockVisionAddress;
}

export interface BlockVisionActivityResponse {
  code: number;
  reason?: string;
  message: string;
  result: {
    data: BlockVisionActivity[];
    nextPageCursor: string;
    total: number;
  };
}

/**
 * Simplified treasury activity for UI display
 */
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

// Activity cache
const activityCache = new Map<string, CacheEntry<TreasuryActivity[]>>();

/**
 * Fetch NFT activities for an account from BlockVision API
 * 
 * @param address Wallet address to fetch activities for
 * @param limit Max results (default 20, max 50)
 * @returns BlockVision activity response
 */
export async function fetchAccountNFTActivities(
  address: string,
  limit: number = 20
): Promise<BlockVisionActivityResponse> {
  if (!BLOCKVISION_API_KEY) {
    logger.warn('BlockVision API key not configured');
    return {
      code: -1,
      message: 'BlockVision API key not configured',
      result: {
        data: [],
        nextPageCursor: '',
        total: 0,
      },
    };
  }

  try {
    const url = new URL(`${BLOCKVISION_API_BASE}/collection/activities`);
    url.searchParams.set('address', address);
    url.searchParams.set('limit', String(Math.min(limit, 50)));
    // Get newest first (descending order)
    url.searchParams.set('ascendingOrder', 'false');

    logger.debug('BlockVision: Fetching NFT activities', { url: url.toString() });

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

    const data: BlockVisionActivityResponse = await response.json();

    if (data.code !== 0) {
      logger.warn('BlockVision API returned non-zero code for activities', { 
        code: data.code, 
        reason: data.reason,
        message: data.message 
      });
    }

    logger.info('BlockVision: Successfully fetched NFT activities', {
      address,
      total: data.result.total,
    });

    return data;
  } catch (error) {
    logger.error('BlockVision: Failed to fetch NFT activities', {
      address,
      error: String(error),
    });
    
    return {
      code: -1,
      message: String(error),
      result: {
        data: [],
        nextPageCursor: '',
        total: 0,
      },
    };
  }
}

/**
 * Get treasury activities (NFT transfers in/out)
 * Results are cached for 1 hour
 * 
 * @param address Treasury wallet address
 * @param limit Max number of activities to fetch
 * @returns Array of treasury activities
 */
export async function getTreasuryActivities(
  address: string,
  limit: number = 10
): Promise<TreasuryActivity[]> {
  const cacheKey = `activities-${address.toLowerCase()}`;
  
  // Check cache
  const cached = activityCache.get(cacheKey);
  if (cached && isCacheValid(cached)) {
    logger.debug('BlockVision: Returning cached activities', { address });
    return cached.data;
  }

  const response = await fetchAccountNFTActivities(address, limit);
  
  if (response.code !== 0 || !response.result.data.length) {
    return [];
  }

  const addressLower = address.toLowerCase();
  const activities: TreasuryActivity[] = response.result.data.map((activity) => {
    const isIncoming = activity.to.toLowerCase() === addressLower;
    const type: 'nft_in' | 'nft_out' = isIncoming ? 'nft_in' : 'nft_out';
    
    // Build NFT name for display
    const nftName = activity.nft.name || `#${activity.nft.tokenId}`;
    const actionWord = activity.method || (isIncoming ? 'Received' : 'Sent');
    
    return {
      type,
      transactionHash: activity.transactionHash,
      timestamp: activity.timestamp,
      description: `${actionWord} ${nftName}`,
      amount: `${activity.nft.qty || '1'} NFT`,
      collectionName: activity.collectionName,
      tokenId: activity.nft.tokenId,
      imageUrl: activity.nft.image,
    };
  });

  // Cache the results
  activityCache.set(cacheKey, {
    data: activities,
    timestamp: Date.now(),
  });

  return activities;
}

/**
 * Clear activities cache
 */
export function clearActivityCache(): void {
  activityCache.clear();
  logger.info('BlockVision: Activity cache cleared');
}

/**
 * BlockVision Collection Floor Price response types
 */
export interface BlockVisionFloorPriceResponse {
  code: number;
  reason?: string;
  message: string;
  result: {
    floorPrice: string;
    floorPriceUSD?: string;
    collectionAddress: string;
    currency?: string;
  };
}

// Floor price cache (1 hour TTL)
const floorPriceCache = new Map<string, CacheEntry<number>>();

/**
 * Fetch floor price for an NFT collection from BlockVision API
 * 
 * @param collectionAddress Contract address of the NFT collection
 * @returns Floor price in MON (native currency), or null if not available
 */
export async function fetchCollectionFloorPrice(
  collectionAddress: string
): Promise<number | null> {
  const cacheKey = `floor-${collectionAddress.toLowerCase()}`;
  
  // Check cache first
  const cached = floorPriceCache.get(cacheKey);
  if (cached && isCacheValid(cached)) {
    logger.debug('BlockVision: Returning cached floor price', { collectionAddress });
    return cached.data;
  }

  if (!BLOCKVISION_API_KEY) {
    logger.warn('BlockVision API key not configured for floor price');
    return null;
  }

  try {
    const url = new URL(`${BLOCKVISION_API_BASE}/collection/floor-price`);
    url.searchParams.set('collectionAddress', collectionAddress);

    logger.debug('BlockVision: Fetching floor price', { url: url.toString() });

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

    const data: BlockVisionFloorPriceResponse = await response.json();

    if (data.code !== 0) {
      logger.warn('BlockVision API returned non-zero code for floor price', { 
        code: data.code, 
        reason: data.reason,
        message: data.message,
        collectionAddress,
      });
      return null;
    }

    // Parse floor price (it comes as a string)
    const floorPrice = parseFloat(data.result.floorPrice);
    
    if (isNaN(floorPrice)) {
      logger.warn('BlockVision: Invalid floor price value', { 
        collectionAddress, 
        floorPrice: data.result.floorPrice 
      });
      return null;
    }

    // Cache the successful result
    floorPriceCache.set(cacheKey, {
      data: floorPrice,
      timestamp: Date.now(),
    });

    logger.info('BlockVision: Successfully fetched floor price', {
      collectionAddress,
      floorPrice,
      currency: data.result.currency,
    });

    return floorPrice;
  } catch (error) {
    logger.error('BlockVision: Failed to fetch floor price', {
      collectionAddress,
      error: String(error),
    });
    
    return null;
  }
}

/**
 * Fetch floor prices for multiple collections
 * 
 * @param collectionAddresses Array of collection contract addresses
 * @returns Map of collection address to floor price
 */
export async function fetchMultipleFloorPrices(
  collectionAddresses: string[]
): Promise<Map<string, number>> {
  const floorPrices = new Map<string, number>();
  
  // Fetch floor prices in parallel (but respect rate limits)
  const results = await Promise.all(
    collectionAddresses.map(async (address) => {
      const floorPrice = await fetchCollectionFloorPrice(address);
      return { address: address.toLowerCase(), floorPrice };
    })
  );
  
  for (const { address, floorPrice } of results) {
    if (floorPrice !== null) {
      floorPrices.set(address, floorPrice);
    }
  }
  
  return floorPrices;
}

/**
 * Clear floor price cache
 */
export function clearFloorPriceCache(): void {
  floorPriceCache.clear();
  logger.info('BlockVision: Floor price cache cleared');
}
