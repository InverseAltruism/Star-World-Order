/**
 * Magic Eden API Integration for Star World Order
 * 
 * This module provides integration with Magic Eden's public Monad API
 * for fetching NFT collections owned by wallet addresses.
 * 
 * Magic Eden Public API Documentation:
 * https://api-docs.magiceden.io/
 * 
 * Rate Limits (Free Tier):
 * - 180 requests per minute
 * - No API key required for public endpoints
 * 
 * Caching Strategy:
 * - Cache NFT data for 1 hour to minimize API calls
 * - Use database for persistent historical data (24 hour TTL)
 * 
 * Endpoints Used:
 * - POST /v4/evm-public/collections/user-collections - Get user's NFT collections
 */

import { logger } from './logger';

// Magic Eden API base URL for Monad
const MAGIC_EDEN_API_BASE = 'https://api-mainnet.magiceden.dev/v4/evm-public';

// Cache TTL in milliseconds (1 hour to minimize API calls)
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Rate limit configuration
const RATE_LIMIT_RETRY_DELAY_MS = 2000; // 2 second delay on rate limit
const RATE_LIMIT_MAX_RETRIES = 3;

// In-memory cache for NFT collections
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const collectionsCache = new Map<string, CacheEntry<MagicEdenUserCollectionsResponse>>();

/**
 * Magic Eden API response types - matching actual API response structure
 */
export interface MagicEdenCollectionRaw {
  id: string;
  chain: string;
  name: string;
  symbol?:  string;
  media: {
    url?:  string;
    type?: string;
  };
  verification: string;
  chainData:  {
    contract: string;
    transferability?:  string;
    collectionBidSupported?: boolean;
    isMinting?: boolean;
  };
  ownedCount:  number;
  listedCount?:  number;
}

export interface MagicEdenUserCollectionsResponseRaw {
  collections: MagicEdenCollectionRaw[];
}

/**
 * Normalized collection type for internal use
 */
export interface MagicEdenCollection {
  contract: string;
  name: string;
  symbol?: string;
  ownedCount: number;
  media:  {
    url?: string;
    type?: string;
  };
  verified: boolean;
}

export interface MagicEdenUserCollectionsResponse {
  collections: MagicEdenCollection[];
}

/**
 * Generic NFT holding for Treasury display
 */
export interface TreasuryNFTHolding {
  collectionName: string;
  contractAddress: string;
  imageUrl:  string;
  ownedCount: number;
  isVerified: boolean;
}

/**
 * Check if cache entry is still valid
 */
function isCacheValid<T>(entry: CacheEntry<T> | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL;
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Normalize raw Magic Eden response to our internal format
 */
function normalizeCollections(raw: MagicEdenUserCollectionsResponseRaw): MagicEdenUserCollectionsResponse {
  const collections: MagicEdenCollection[] = (raw.collections || [])
    .filter(c => c && (c.chainData?. contract || c.id))
    .map(c => ({
      contract: c.chainData?.contract || c.id || '',
      name: c.name || 'Unknown Collection',
      symbol: c.symbol,
      ownedCount: c.ownedCount || 0,
      media: {
        url: c.media?. url || '',
        type: c.media?.type,
      },
      verified: c.verification === 'VERIFIED',
    }));

  return { collections };
}

/**
 * Fetch NFT collections for a wallet address from Magic Eden API
 * 
 * @param walletAddress Wallet address to fetch collections for
 * @returns Magic Eden collections response
 */
export async function fetchUserCollections(
  walletAddress: string
): Promise<MagicEdenUserCollectionsResponse> {
  const cacheKey = walletAddress.toLowerCase();
  
  // Check cache first
  const cached = collectionsCache.get(cacheKey);
  if (cached && isCacheValid(cached)) {
    logger.debug('MagicEden:  Returning cached collections', { walletAddress });
    return cached. data;
  }

  // Retry loop for rate limiting
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    try {
      const url = `${MAGIC_EDEN_API_BASE}/collections/user-collections`;
      
      logger.debug('MagicEden: Fetching user collections', { url, walletAddress, attempt });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON. stringify({
          chain: 'monad',
          walletAddresses: [walletAddress],
        }),
      });

      if (!response.ok) {
        // Check for rate limiting (429)
        if (response.status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
          const delayMs = RATE_LIMIT_RETRY_DELAY_MS * Math.pow(2, attempt);
          logger.warn('MagicEden: Rate limited, retrying... ', { 
            status: response.status,
            attempt:  attempt + 1,
            maxRetries: RATE_LIMIT_MAX_RETRIES,
            delayMs,
          });
          await sleep(delayMs);
          continue;
        }

        const errorText = await response.text().catch(() => 'Unable to read response body');
        logger.error('MagicEden: HTTP error response', {
          status: response.status,
          statusText: response.statusText,
          endpoint: '/collections/user-collections',
          walletAddress,
          responseBody: errorText. substring(0, 500),
        });
        throw new Error(`Magic Eden API error: ${response.status} ${response.statusText}`);
      }

      const rawData:  MagicEdenUserCollectionsResponseRaw = await response. json();

      // Log raw response for debugging
      logger. info('MagicEden: Raw API response', {
        walletAddress,
        rawCollectionCount: rawData?. collections?.length || 0,
        firstCollection: rawData?.collections?.[0] ?  {
          id: rawData.collections[0]. id,
          name: rawData.collections[0].name,
          contract: rawData.collections[0]. chainData?.contract,
          ownedCount: rawData.collections[0].ownedCount,
          mediaUrl: rawData.collections[0].media?.url,
        } : null,
      });

      // Validate response structure
      if (!rawData || !Array.isArray(rawData.collections)) {
        logger.warn('MagicEden: Invalid response structure', { 
          walletAddress,
          hasData: !!rawData,
          hasCollections: rawData && 'collections' in rawData,
        });
        return { collections: [] };
      }

      // Normalize the response
      const data = normalizeCollections(rawData);

      // Cache the successful response
      collectionsCache.set(cacheKey, {
        data,
        timestamp:  Date.now(),
      });

      logger.info('MagicEden: Successfully fetched and normalized collections', {
        walletAddress,
        collectionCount: data.collections.length,
        totalNFTs: data.collections.reduce((sum, c) => sum + c.ownedCount, 0),
        collections: data.collections. map(c => ({
          name: c.name,
          contract: c.contract,
          count: c.ownedCount,
          imageUrl: c.media?.url?. substring(0, 50),
        })),
      });

      return data;
    } catch (error) {
      logger.error('MagicEden: Failed to fetch collections', {
        walletAddress,
        attempt,
        error: String(error),
      });
      
      if (attempt < RATE_LIMIT_MAX_RETRIES) {
        const delayMs = RATE_LIMIT_RETRY_DELAY_MS * Math.pow(2, attempt);
        await sleep(delayMs);
        continue;
      }
    }
  }
  
  logger.warn('MagicEden:  Returning empty result after retries exhausted', { walletAddress });
  return { collections: [] };
}

/**
 * Convert Magic Eden collections to Treasury NFT holdings format
 * 
 * @param collections Magic Eden collections
 * @returns Array of treasury NFT holdings
 */
export function convertToTreasuryHoldings(
  collections: MagicEdenCollection[]
): TreasuryNFTHolding[] {
  const holdings: TreasuryNFTHolding[] = [];

  for (const collection of collections) {
    if (! collection.contract) continue;
    
    holdings.push({
      collectionName: collection.name || 'Unknown Collection',
      contractAddress: collection.contract,
      imageUrl: collection.media?.url || '',
      ownedCount:  collection.ownedCount || 0,
      isVerified:  collection.verified || false,
    });
  }

  // Sort by owned count (descending)
  holdings.sort((a, b) => b.ownedCount - a. ownedCount);

  return holdings;
}

/**
 * Get all NFT holdings for a treasury address
 * This is the main function to use for fetching treasury NFTs
 * 
 * @param walletAddress Treasury wallet address
 * @returns Object with holdings, total count, and collection count
 */
export async function getTreasuryNFTHoldings(
  walletAddress: string
): Promise<{
  holdings: TreasuryNFTHolding[];
  totalCount: number;
  collectionCount: number;
}> {
  const response = await fetchUserCollections(walletAddress);
  const holdings = convertToTreasuryHoldings(response.collections);
  
  return {
    holdings,
    totalCount: holdings.reduce((sum, h) => sum + h.ownedCount, 0),
    collectionCount:  holdings.length,
  };
}

/**
 * Clear the collections cache (useful for manual refresh)
 */
export function clearCollectionsCache(): void {
  collectionsCache. clear();
  logger.info('MagicEden: Collections cache cleared');
}

/**
 * Get cache stats for monitoring
 */
export function getCacheStats(): {
  entries: number;
  oldestEntry:  number | null;
} {
  let oldestTimestamp:  number | null = null;
  
  for (const entry of collectionsCache.values()) {
    if (oldestTimestamp === null || entry. timestamp < oldestTimestamp) {
      oldestTimestamp = entry.timestamp;
    }
  }

  return {
    entries: collectionsCache.size,
    oldestEntry: oldestTimestamp,
  };
}

/**
 * Note: Floor prices are not yet supported by Magic Eden for Monad
 */
export async function fetchCollectionFloorPrice(
  _collectionAddress: string
): Promise<number | null> {
  logger.debug('MagicEden: Floor prices not yet supported for Monad');
  return null;
}

/**
 * Batch fetch floor prices (placeholder)
 */
export async function fetchMultipleFloorPrices(
  _collectionAddresses:  string[]
): Promise<Map<string, number>> {
  logger.debug('MagicEden: Floor prices not yet supported for Monad');
  return new Map();
}
