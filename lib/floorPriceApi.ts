/**
 * Local Floor Price API Integration
 * 
 * Fetches floor prices from our own ME scraper API running on starworldorder.com
 * This is faster and more reliable than external APIs since it's on our infrastructure.
 */

import { logger } from './logger';

// API endpoint - use internal URL when on same server for better performance
const FLOOR_PRICE_API = process.env.FLOOR_PRICE_API_URL || 'https://starworldorder.com/nft/api';

// Cache for floor prices (5 minute TTL - API updates every 30 min anyway)
interface FloorPriceCache {
  prices: Map<string, number>;
  timestamp: number;
}

let floorPriceCache: FloorPriceCache | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CollectionData {
  name: string;
  symbol: string;
  floor_price: number;
  floor_price_raw: string;
  currency: string;
  image_url: string;
}

interface CollectionsResponse {
  collections: CollectionData[];
}

/**
 * Fetch all floor prices from our local API and cache them
 */
async function fetchAllFloorPrices(): Promise<Map<string, number>> {
  try {
    const response = await fetch(`${FLOOR_PRICE_API}/collections`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      // Short timeout since it's local
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data: CollectionsResponse = await response.json();
    
    if (!data.collections || !Array.isArray(data.collections)) {
      throw new Error('Invalid API response format');
    }

    // Create a map of lowercase collection name -> floor price
    const priceMap = new Map<string, number>();
    for (const collection of data.collections) {
      if (collection.name && typeof collection.floor_price === 'number') {
        priceMap.set(collection.name.toLowerCase(), collection.floor_price);
      }
    }

    logger.info('Fetched floor prices from local API', {
      collectionCount: priceMap.size,
    });

    return priceMap;
  } catch (error) {
    logger.error('Failed to fetch floor prices from local API', {
      error: String(error),
    });
    return new Map();
  }
}

/**
 * Get floor price for a collection by name
 * Uses cached data when available
 * 
 * @param collectionName - The name of the collection (case-insensitive)
 * @returns Floor price in MON, or null if not found
 */
export async function getFloorPriceByName(collectionName: string): Promise<number | null> {
  // Check cache
  const now = Date.now();
  if (floorPriceCache && (now - floorPriceCache.timestamp < CACHE_TTL)) {
    const price = floorPriceCache.prices.get(collectionName.toLowerCase());
    if (price !== undefined) {
      logger.debug('Floor price cache hit', { collection: collectionName, price });
      return price;
    }
  }

  // Fetch fresh data
  const prices = await fetchAllFloorPrices();
  
  // Update cache
  floorPriceCache = {
    prices,
    timestamp: now,
  };

  const price = prices.get(collectionName.toLowerCase());
  return price ?? null;
}

/**
 * Get all cached floor prices from local API
 * Useful for batch lookups by collection name
 * Returns Map<collectionName (lowercase), floorPrice>
 */
export async function getLocalApiFloorPrices(): Promise<Map<string, number>> {
  const now = Date.now();
  
  // Use cache if fresh
  if (floorPriceCache && (now - floorPriceCache.timestamp < CACHE_TTL)) {
    return floorPriceCache.prices;
  }

  // Fetch fresh data
  const prices = await fetchAllFloorPrices();
  
  // Update cache
  floorPriceCache = {
    prices,
    timestamp: now,
  };

  return prices;
}

/**
 * Clear the floor price cache
 */
export function clearFloorPriceCache(): void {
  floorPriceCache = null;
  logger.info('Floor price cache cleared');
}
