/**
 * Floor Price Scraper for Star World Order
 * 
 * This module provides automated floor price fetching for Monad NFT collections
 * from Magic Eden and OpenSea marketplaces.
 * 
 * Features:
 * - Magic Eden API integration for Monad collections
 * - OpenSea API integration as fallback
 * - Rate limiting and retry logic
 * - Batch processing to minimize API calls
 * - Aggregates data from multiple sources
 * 
 * API Endpoints:
 * - Magic Eden: https://api-mainnet.magiceden.dev/v4/evm-public/collections
 * - OpenSea: https://api.opensea.io/api/v2/collections (requires API key)
 * 
 * Refresh Interval: 15-30 minutes (configurable via cron)
 */

import { logger } from './logger';
import { CollectionFloorPrice, upsertFloorPricesBatch, initializeFloorPricesTable } from './floorPrices';

// ============================================================
// CONSTANTS & CONFIGURATION
// ============================================================

// Magic Eden API configuration
const MAGIC_EDEN_API_BASE = 'https://api-mainnet.magiceden.dev/v4/evm-public';
const MAGIC_EDEN_CHAIN = 'monad';
const MAGIC_EDEN_COLLECTIONS_LIMIT = 100; // Max collections per request

// OpenSea API configuration (requires API key)
const OPENSEA_API_BASE = 'https://api.opensea.io/api/v2';
const OPENSEA_CHAIN = 'monad';

// Rate limiting
const API_REQUEST_DELAY_MS = 500; // 500ms between requests
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// MON to USD conversion (approximate, update as needed)
// TODO: Integrate with price oracle for accurate conversion
const MON_TO_USD_RATE = 5.0; // Placeholder rate

// ============================================================
// TYPES
// ============================================================

interface MagicEdenCollection {
  id: string;
  name: string;
  symbol?: string;
  chainData?: {
    contract: string;
    transferability?: string;
  };
  media?: {
    url?: string;
    type?: string;
  };
  verification?: string;
  stats?: {
    floorPrice?: number | string;
    listedCount?: number;
    volume24h?: number | string;
    volumeTotal?: number | string;
    salesCount24h?: number;
    holdersCount?: number;
  };
}

interface MagicEdenTrendingResponse {
  collections?: MagicEdenCollection[];
  total?: number;
}

interface OpenSeaCollection {
  collection: string;
  name: string;
  description?: string;
  image_url?: string;
  contracts?: Array<{
    address: string;
    chain: string;
  }>;
}

interface OpenSeaCollectionStats {
  total?: {
    volume?: number;
    sales?: number;
    average_price?: number;
    num_owners?: number;
    market_cap?: number;
    floor_price?: number;
    floor_price_symbol?: string;
  };
  intervals?: Array<{
    interval: string;
    volume?: number;
    sales?: number;
  }>;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delayMs: number = RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const backoffDelay = delayMs * Math.pow(2, attempt);
        logger.warn('FloorPriceScraper: Retry attempt', {
          attempt: attempt + 1,
          maxRetries,
          delayMs: backoffDelay,
          error: String(error),
        });
        await sleep(backoffDelay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Parse floor price from various formats (string, number, null)
 */
function parseFloorPrice(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Convert MON price to USD
 */
function monToUsd(monPrice: number | null): number | null {
  if (monPrice === null) return null;
  return monPrice * MON_TO_USD_RATE;
}

// ============================================================
// MAGIC EDEN API FUNCTIONS
// ============================================================

/**
 * Fetch trending/top collections from Magic Eden
 */
async function fetchMagicEdenTrendingCollections(): Promise<MagicEdenCollection[]> {
  const allCollections: MagicEdenCollection[] = [];
  let offset = 0;
  const limit = MAGIC_EDEN_COLLECTIONS_LIMIT;
  let hasMore = true;
  
  while (hasMore) {
    try {
      // Magic Eden trending collections endpoint
      const url = `${MAGIC_EDEN_API_BASE}/collections?chain=${MAGIC_EDEN_CHAIN}&sortBy=volume24h&sortDirection=desc&limit=${limit}&offset=${offset}`;
      
      logger.debug('FloorPriceScraper: Fetching Magic Eden collections', { url, offset, limit });
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Star-World-Order/1.0',
        },
      });
      
      if (!response.ok) {
        // Handle rate limiting
        if (response.status === 429) {
          logger.warn('FloorPriceScraper: Magic Eden rate limited, waiting...');
          await sleep(5000);
          continue;
        }
        
        throw new Error(`Magic Eden API error: ${response.status} ${response.statusText}`);
      }
      
      const data: MagicEdenTrendingResponse = await response.json();
      
      if (!data.collections || data.collections.length === 0) {
        hasMore = false;
        break;
      }
      
      allCollections.push(...data.collections);
      
      // Check if we should continue paginating
      if (data.collections.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
        await sleep(API_REQUEST_DELAY_MS); // Rate limit ourselves
      }
      
      // Safety limit to prevent infinite loops
      if (offset >= 1000) {
        hasMore = false;
      }
      
    } catch (error) {
      logger.error('FloorPriceScraper: Error fetching Magic Eden collections', {
        error: String(error),
        offset,
      });
      throw error;
    }
  }
  
  logger.info('FloorPriceScraper: Fetched Magic Eden collections', {
    count: allCollections.length,
  });
  
  return allCollections;
}

/**
 * Convert Magic Eden collection to our CollectionFloorPrice format
 */
function convertMagicEdenToFloorPrice(collection: MagicEdenCollection): CollectionFloorPrice | null {
  const contractAddress = collection.chainData?.contract || collection.id;
  
  if (!contractAddress) {
    logger.debug('FloorPriceScraper: Skipping collection without contract address', {
      name: collection.name,
    });
    return null;
  }
  
  const floorPriceMON = parseFloorPrice(collection.stats?.floorPrice);
  
  return {
    contractAddress: contractAddress.toLowerCase(),
    name: collection.name || 'Unknown Collection',
    symbol: collection.symbol,
    imageUrl: collection.media?.url,
    floorPriceMON,
    floorPriceUSD: monToUsd(floorPriceMON),
    listedCount: collection.stats?.listedCount || 0,
    volume24h: parseFloorPrice(collection.stats?.volume24h),
    volumeTotal: parseFloorPrice(collection.stats?.volumeTotal),
    salesCount24h: collection.stats?.salesCount24h || null,
    holdersCount: collection.stats?.holdersCount || null,
    source: 'magic_eden',
    isVerified: collection.verification === 'VERIFIED',
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================
// OPENSEA API FUNCTIONS
// ============================================================

/**
 * Fetch collections from OpenSea (requires API key)
 * Note: OpenSea's free tier has strict rate limits
 */
async function fetchOpenSeaCollections(): Promise<CollectionFloorPrice[]> {
  const apiKey = process.env.OPENSEA_API_KEY;
  
  if (!apiKey) {
    logger.debug('FloorPriceScraper: OpenSea API key not configured, skipping');
    return [];
  }
  
  const collections: CollectionFloorPrice[] = [];
  
  try {
    // OpenSea collections endpoint for a specific chain
    const url = `${OPENSEA_API_BASE}/collections?chain=${OPENSEA_CHAIN}&limit=100`;
    
    logger.debug('FloorPriceScraper: Fetching OpenSea collections', { url });
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-KEY': apiKey,
      },
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        logger.error('FloorPriceScraper: OpenSea API key invalid');
        return [];
      }
      if (response.status === 429) {
        logger.warn('FloorPriceScraper: OpenSea rate limited');
        return [];
      }
      throw new Error(`OpenSea API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.collections || !Array.isArray(data.collections)) {
      return [];
    }
    
    // OpenSea returns basic collection info, need to fetch stats separately
    for (const osCollection of data.collections as OpenSeaCollection[]) {
      const contractAddress = osCollection.contracts?.[0]?.address;
      if (!contractAddress) continue;
      
      // Fetch individual collection stats
      await sleep(API_REQUEST_DELAY_MS);
      
      try {
        const statsUrl = `${OPENSEA_API_BASE}/collections/${osCollection.collection}/stats`;
        const statsResponse = await fetch(statsUrl, {
          headers: {
            'Accept': 'application/json',
            'X-API-KEY': apiKey,
          },
        });
        
        if (!statsResponse.ok) continue;
        
        const stats: OpenSeaCollectionStats = await statsResponse.json();
        
        const floorPriceMON = stats.total?.floor_price || null;
        
        collections.push({
          contractAddress: contractAddress.toLowerCase(),
          name: osCollection.name || 'Unknown Collection',
          symbol: undefined,
          imageUrl: osCollection.image_url,
          floorPriceMON,
          floorPriceUSD: monToUsd(floorPriceMON),
          listedCount: 0, // OpenSea doesn't provide this in basic stats
          volume24h: stats.intervals?.find(i => i.interval === 'one_day')?.volume || null,
          volumeTotal: stats.total?.volume || null,
          salesCount24h: stats.intervals?.find(i => i.interval === 'one_day')?.sales || null,
          holdersCount: stats.total?.num_owners || null,
          source: 'opensea',
          isVerified: false, // Would need to check collection metadata
          updatedAt: new Date().toISOString(),
        });
        
      } catch (error) {
        logger.debug('FloorPriceScraper: Error fetching OpenSea collection stats', {
          collection: osCollection.collection,
          error: String(error),
        });
      }
    }
    
  } catch (error) {
    logger.error('FloorPriceScraper: Error fetching OpenSea collections', {
      error: String(error),
    });
  }
  
  logger.info('FloorPriceScraper: Fetched OpenSea collections', {
    count: collections.length,
  });
  
  return collections;
}

// ============================================================
// AGGREGATION FUNCTIONS
// ============================================================

/**
 * Aggregate floor prices from multiple sources
 * Magic Eden is prioritized, OpenSea is used as fallback/supplement
 */
function aggregateFloorPrices(
  magicEdenData: CollectionFloorPrice[],
  openSeaData: CollectionFloorPrice[]
): CollectionFloorPrice[] {
  const aggregated = new Map<string, CollectionFloorPrice>();
  
  // Add Magic Eden data first (primary source)
  for (const collection of magicEdenData) {
    aggregated.set(collection.contractAddress, collection);
  }
  
  // Add OpenSea data for collections not in Magic Eden
  // Or update with OpenSea data if it has more complete information
  for (const collection of openSeaData) {
    const existing = aggregated.get(collection.contractAddress);
    
    if (!existing) {
      // New collection from OpenSea
      aggregated.set(collection.contractAddress, collection);
    } else {
      // Merge data - prefer Magic Eden but fill in missing fields
      const merged: CollectionFloorPrice = {
        ...existing,
        // Keep Magic Eden price if available, otherwise use OpenSea
        floorPriceMON: existing.floorPriceMON ?? collection.floorPriceMON,
        floorPriceUSD: existing.floorPriceUSD ?? collection.floorPriceUSD,
        // Supplement missing stats
        volume24h: existing.volume24h ?? collection.volume24h,
        volumeTotal: existing.volumeTotal ?? collection.volumeTotal,
        salesCount24h: existing.salesCount24h ?? collection.salesCount24h,
        holdersCount: existing.holdersCount ?? collection.holdersCount,
        // Mark as aggregated if we used both sources
        source: 'aggregated',
      };
      aggregated.set(collection.contractAddress, merged);
    }
  }
  
  return Array.from(aggregated.values());
}

// ============================================================
// MAIN SCRAPER FUNCTION
// ============================================================

/**
 * Scrape floor prices from all available sources
 * This is the main function called by the cron job
 */
export async function scrapeAllFloorPrices(): Promise<{
  success: boolean;
  collectionsUpdated: number;
  sources: {
    magicEden: number;
    openSea: number;
  };
  error?: string;
}> {
  logger.info('FloorPriceScraper: Starting floor price scrape');
  
  const startTime = Date.now();
  
  try {
    // Initialize database table
    initializeFloorPricesTable();
    
    // Fetch from Magic Eden (primary source)
    let magicEdenCollections: CollectionFloorPrice[] = [];
    try {
      const meRaw = await retryWithBackoff(() => fetchMagicEdenTrendingCollections());
      magicEdenCollections = meRaw
        .map(convertMagicEdenToFloorPrice)
        .filter((c): c is CollectionFloorPrice => c !== null);
    } catch (error) {
      logger.error('FloorPriceScraper: Failed to fetch Magic Eden data', {
        error: String(error),
      });
    }
    
    // Fetch from OpenSea (secondary source, if API key available)
    let openSeaCollections: CollectionFloorPrice[] = [];
    try {
      openSeaCollections = await fetchOpenSeaCollections();
    } catch (error) {
      logger.error('FloorPriceScraper: Failed to fetch OpenSea data', {
        error: String(error),
      });
    }
    
    // Aggregate data from all sources
    const aggregatedData = aggregateFloorPrices(magicEdenCollections, openSeaCollections);
    
    if (aggregatedData.length === 0) {
      logger.warn('FloorPriceScraper: No collections found from any source');
      return {
        success: false,
        collectionsUpdated: 0,
        sources: {
          magicEden: 0,
          openSea: 0,
        },
        error: 'No collections found from any source',
      };
    }
    
    // Save to database
    upsertFloorPricesBatch(aggregatedData);
    
    const duration = Date.now() - startTime;
    
    logger.info('FloorPriceScraper: Scrape completed successfully', {
      collectionsUpdated: aggregatedData.length,
      magicEdenCount: magicEdenCollections.length,
      openSeaCount: openSeaCollections.length,
      durationMs: duration,
    });
    
    return {
      success: true,
      collectionsUpdated: aggregatedData.length,
      sources: {
        magicEden: magicEdenCollections.length,
        openSea: openSeaCollections.length,
      },
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('FloorPriceScraper: Scrape failed', {
      error: String(error),
      durationMs: duration,
    });
    
    return {
      success: false,
      collectionsUpdated: 0,
      sources: {
        magicEden: 0,
        openSea: 0,
      },
      error: String(error),
    };
  }
}

/**
 * Get scraper configuration info
 */
export function getScraperConfig(): {
  magicEdenEnabled: boolean;
  openSeaEnabled: boolean;
  rateLimitDelayMs: number;
  maxRetries: number;
} {
  return {
    magicEdenEnabled: true,
    openSeaEnabled: !!process.env.OPENSEA_API_KEY,
    rateLimitDelayMs: API_REQUEST_DELAY_MS,
    maxRetries: MAX_RETRIES,
  };
}
