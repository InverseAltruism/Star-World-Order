/**
 * NFT Floor Price Aggregator for Star World Order
 * 
 * This module fetches floor prices for Monad NFT collections from
 * Magic Eden and OpenSea marketplaces.
 * 
 * Features:
 * - Aggregates floor prices from multiple marketplaces
 * - 15-minute cache TTL for efficiency
 * - SQLite persistence for data durability
 * - Background refresh via cron job
 * - Supports all Monad NFT collections
 * 
 * Data Sources:
 * - Magic Eden: Primary source for Monad collections
 * - OpenSea: Secondary source where available
 * 
 * API Rate Limits:
 * - Magic Eden: 180 requests/minute (free tier)
 * - OpenSea: Requires API key for production use
 */

import { logger } from './logger';
import { getDatabase } from './db';

// ============================================================
// CONSTANTS & CONFIGURATION
// ============================================================

// Magic Eden API base URL
const MAGIC_EDEN_API_BASE = 'https://api-mainnet.magiceden.dev';

// OpenSea API base URL (V2)
const OPENSEA_API_BASE = 'https://api.opensea.io/api/v2';

// Cache TTL: 15 minutes for floor prices
const FLOOR_PRICE_CACHE_TTL_MS = 15 * 60 * 1000;

// In-memory cache for floor prices (faster than DB queries)
interface FloorPriceCache {
  data: Map<string, CollectionFloorPrice>;
  lastRefresh: number;
  isRefreshing: boolean;
}

const floorPriceCache: FloorPriceCache = {
  data: new Map(),
  lastRefresh: 0,
  isRefreshing: false,
};

// ============================================================
// TYPES & INTERFACES
// ============================================================

export interface CollectionFloorPrice {
  contractAddress: string;
  name: string;
  symbol?: string;
  imageUrl?: string;
  floorPriceMON: number | null;
  floorPriceUSD: number | null;
  listedCount: number;
  volume24h: number | null;
  volumeTotal: number | null;
  salesCount24h: number | null;
  holdersCount: number | null;
  source: 'magic_eden' | 'opensea' | 'aggregated';
  isVerified: boolean;
  updatedAt: string;
}

export interface FloorPriceAPIResponse {
  success: boolean;
  data: {
    collections: CollectionFloorPrice[];
    totalCollections: number;
    lastUpdated: string;
    nextUpdate: string;
    cacheTTLSeconds: number;
  };
  error?: string;
}

// Magic Eden API response types
interface MagicEdenCollection {
  id: string;
  chain: string;
  name: string;
  symbol?: string;
  image?: string;
  floorAsk?: {
    price?: {
      amount?: {
        native?: number;
        usd?: number;
      };
    };
  };
  onSaleCount?: number;
  volume?: {
    '1day'?: number;
    allTime?: number;
  };
  salesCount?: {
    '1day'?: number;
  };
  ownerCount?: number;
  verification?: string;
  chainData?: {
    contract?: string;
  };
}

interface MagicEdenTrendingResponse {
  collections: MagicEdenCollection[];
}

// OpenSea API response types
interface OpenSeaCollectionStats {
  total: {
    floor_price: number | null;
    floor_price_symbol: string;
    volume: number;
    sales: number;
    num_owners: number;
    average_price: number;
    market_cap: number;
  };
}

// ============================================================
// DATABASE FUNCTIONS
// ============================================================

/**
 * Initialize the floor prices table in the database
 */
export function initializeFloorPricesTable(): void {
  const db = getDatabase();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS nft_floor_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_address TEXT NOT NULL,
      name TEXT NOT NULL,
      symbol TEXT,
      image_url TEXT,
      floor_price_mon REAL,
      floor_price_usd REAL,
      listed_count INTEGER DEFAULT 0,
      volume_24h REAL,
      volume_total REAL,
      sales_count_24h INTEGER,
      holders_count INTEGER,
      source TEXT NOT NULL CHECK (source IN ('magic_eden', 'opensea', 'aggregated')),
      is_verified INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(contract_address)
    )
  `);
  
  // Create indexes for efficient queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_floor_prices_contract ON nft_floor_prices(contract_address);
    CREATE INDEX IF NOT EXISTS idx_floor_prices_updated ON nft_floor_prices(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_floor_prices_floor ON nft_floor_prices(floor_price_mon DESC);
  `);
  
  logger.info('FloorPrices: Database table initialized');
}

/**
 * Get all floor prices from database
 */
export function getFloorPricesFromDB(): CollectionFloorPrice[] {
  const db = getDatabase();
  
  try {
    // SQLite naturally sorts NULL values as smallest, so DESC puts NULLs last
    const stmt = db.prepare(`
      SELECT * FROM nft_floor_prices 
      ORDER BY floor_price_mon DESC, name ASC
    `);
    
    const rows = stmt.all() as Array<{
      contract_address: string;
      name: string;
      symbol: string | null;
      image_url: string | null;
      floor_price_mon: number | null;
      floor_price_usd: number | null;
      listed_count: number;
      volume_24h: number | null;
      volume_total: number | null;
      sales_count_24h: number | null;
      holders_count: number | null;
      source: 'magic_eden' | 'opensea' | 'aggregated';
      is_verified: number;
      updated_at: string;
    }>;
    
    return rows.map(row => ({
      contractAddress: row.contract_address,
      name: row.name,
      symbol: row.symbol || undefined,
      imageUrl: row.image_url || undefined,
      floorPriceMON: row.floor_price_mon,
      floorPriceUSD: row.floor_price_usd,
      listedCount: row.listed_count,
      volume24h: row.volume_24h,
      volumeTotal: row.volume_total,
      salesCount24h: row.sales_count_24h,
      holdersCount: row.holders_count,
      source: row.source,
      isVerified: row.is_verified === 1,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    // Table might not exist yet
    logger.debug('FloorPrices: Table not initialized, initializing now');
    initializeFloorPricesTable();
    return [];
  }
}

/**
 * Get a single floor price by contract address
 */
export function getFloorPriceByContract(contractAddress: string): CollectionFloorPrice | null {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT * FROM nft_floor_prices WHERE contract_address = ?
    `);
    
    const row = stmt.get(contractAddress.toLowerCase()) as {
      contract_address: string;
      name: string;
      symbol: string | null;
      image_url: string | null;
      floor_price_mon: number | null;
      floor_price_usd: number | null;
      listed_count: number;
      volume_24h: number | null;
      volume_total: number | null;
      sales_count_24h: number | null;
      holders_count: number | null;
      source: 'magic_eden' | 'opensea' | 'aggregated';
      is_verified: number;
      updated_at: string;
    } | undefined;
    
    if (!row) return null;
    
    return {
      contractAddress: row.contract_address,
      name: row.name,
      symbol: row.symbol || undefined,
      imageUrl: row.image_url || undefined,
      floorPriceMON: row.floor_price_mon,
      floorPriceUSD: row.floor_price_usd,
      listedCount: row.listed_count,
      volume24h: row.volume_24h,
      volumeTotal: row.volume_total,
      salesCount24h: row.sales_count_24h,
      holdersCount: row.holders_count,
      source: row.source,
      isVerified: row.is_verified === 1,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

/**
 * Upsert floor price data to database
 */
export function upsertFloorPrice(data: CollectionFloorPrice): void {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      INSERT INTO nft_floor_prices (
        contract_address, name, symbol, image_url,
        floor_price_mon, floor_price_usd, listed_count,
        volume_24h, volume_total, sales_count_24h, holders_count,
        source, is_verified, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(contract_address) DO UPDATE SET
        name = excluded.name,
        symbol = excluded.symbol,
        image_url = excluded.image_url,
        floor_price_mon = excluded.floor_price_mon,
        floor_price_usd = excluded.floor_price_usd,
        listed_count = excluded.listed_count,
        volume_24h = excluded.volume_24h,
        volume_total = excluded.volume_total,
        sales_count_24h = excluded.sales_count_24h,
        holders_count = excluded.holders_count,
        source = excluded.source,
        is_verified = excluded.is_verified,
        updated_at = CURRENT_TIMESTAMP
    `);
    
    stmt.run(
      data.contractAddress.toLowerCase(),
      data.name,
      data.symbol || null,
      data.imageUrl || null,
      data.floorPriceMON,
      data.floorPriceUSD,
      data.listedCount,
      data.volume24h,
      data.volumeTotal,
      data.salesCount24h,
      data.holdersCount,
      data.source,
      data.isVerified ? 1 : 0
    );
  } catch (error) {
    logger.error('FloorPrices: Failed to upsert floor price', {
      contractAddress: data.contractAddress,
      error: String(error),
    });
  }
}

/**
 * Batch upsert floor prices (more efficient)
 */
export function upsertFloorPricesBatch(prices: CollectionFloorPrice[]): void {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    INSERT INTO nft_floor_prices (
      contract_address, name, symbol, image_url,
      floor_price_mon, floor_price_usd, listed_count,
      volume_24h, volume_total, sales_count_24h, holders_count,
      source, is_verified, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(contract_address) DO UPDATE SET
      name = excluded.name,
      symbol = excluded.symbol,
      image_url = excluded.image_url,
      floor_price_mon = excluded.floor_price_mon,
      floor_price_usd = excluded.floor_price_usd,
      listed_count = excluded.listed_count,
      volume_24h = excluded.volume_24h,
      volume_total = excluded.volume_total,
      sales_count_24h = excluded.sales_count_24h,
      holders_count = excluded.holders_count,
      source = excluded.source,
      is_verified = excluded.is_verified,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  const insertMany = db.transaction((priceList: CollectionFloorPrice[]) => {
    for (const data of priceList) {
      stmt.run(
        data.contractAddress.toLowerCase(),
        data.name,
        data.symbol || null,
        data.imageUrl || null,
        data.floorPriceMON,
        data.floorPriceUSD,
        data.listedCount,
        data.volume24h,
        data.volumeTotal,
        data.salesCount24h,
        data.holdersCount,
        data.source,
        data.isVerified ? 1 : 0
      );
    }
  });
  
  insertMany(prices);
  logger.info('FloorPrices: Batch upserted floor prices', { count: prices.length });
}

/**
 * Get the last update time from database
 */
export function getLastFloorPriceUpdate(): Date | null {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT MAX(updated_at) as last_update FROM nft_floor_prices
    `);
    
    const row = stmt.get() as { last_update: string | null } | undefined;
    return row?.last_update ? new Date(row.last_update) : null;
  } catch {
    return null;
  }
}

/**
 * Clean up old floor price entries (older than 24 hours without updates)
 */
export function cleanupOldFloorPrices(): number {
  const db = getDatabase();
  
  try {
    const result = db.prepare(`
      DELETE FROM nft_floor_prices 
      WHERE datetime(updated_at) < datetime('now', '-24 hours')
    `).run();
    
    if (result.changes > 0) {
      logger.info('FloorPrices: Cleaned up old entries', { deleted: result.changes });
    }
    
    return result.changes;
  } catch {
    return 0;
  }
}

// ============================================================
// MAGIC EDEN API FUNCTIONS
// ============================================================

/**
 * Sleep utility for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch trending collections from Magic Eden API
 */
export async function fetchMagicEdenTrendingCollections(
  limit: number = 100
): Promise<CollectionFloorPrice[]> {
  const collections: CollectionFloorPrice[] = [];
  
  try {
    // Magic Eden v3 RTP API for Monad collections
    const url = `${MAGIC_EDEN_API_BASE}/v3/rtp/monad/collections/trending?period=1d&limit=${limit}`;
    
    logger.debug('FloorPrices: Fetching Magic Eden trending collections', { url });
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'StarWorldOrder/1.0',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read response');
      logger.error('FloorPrices: Magic Eden API error', {
        status: response.status,
        statusText: response.statusText,
        error: errorText.substring(0, 500),
      });
      return collections;
    }
    
    const data: MagicEdenTrendingResponse = await response.json();
    
    if (!data.collections || !Array.isArray(data.collections)) {
      logger.warn('FloorPrices: Invalid Magic Eden response structure');
      return collections;
    }
    
    for (const item of data.collections) {
      const contractAddress = item.chainData?.contract || item.id;
      if (!contractAddress) continue;
      
      collections.push({
        contractAddress: contractAddress.toLowerCase(),
        name: item.name || 'Unknown Collection',
        symbol: item.symbol,
        imageUrl: item.image,
        floorPriceMON: item.floorAsk?.price?.amount?.native || null,
        floorPriceUSD: item.floorAsk?.price?.amount?.usd || null,
        listedCount: item.onSaleCount || 0,
        volume24h: item.volume?.['1day'] || null,
        volumeTotal: item.volume?.allTime || null,
        salesCount24h: item.salesCount?.['1day'] || null,
        holdersCount: item.ownerCount || null,
        source: 'magic_eden',
        isVerified: item.verification === 'VERIFIED',
        updatedAt: new Date().toISOString(),
      });
    }
    
    logger.info('FloorPrices: Fetched Magic Eden collections', {
      count: collections.length,
    });
    
    return collections;
  } catch (error) {
    logger.error('FloorPrices: Failed to fetch Magic Eden collections', {
      error: String(error),
    });
    return collections;
  }
}

/**
 * Fetch all collections (paginated) from Magic Eden
 */
export async function fetchMagicEdenAllCollections(
  maxPages: number = 5
): Promise<CollectionFloorPrice[]> {
  const allCollections: CollectionFloorPrice[] = [];
  let page = 0;
  const pageSize = 50;
  
  while (page < maxPages) {
    try {
      const offset = page * pageSize;
      const url = `${MAGIC_EDEN_API_BASE}/v3/rtp/monad/collections/v7?limit=${pageSize}&offset=${offset}&sortBy=volume&sortDirection=desc`;
      
      logger.debug('FloorPrices: Fetching Magic Eden collections page', { page, offset });
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'StarWorldOrder/1.0',
        },
      });
      
      if (!response.ok) {
        logger.warn('FloorPrices: Magic Eden page fetch failed', {
          page,
          status: response.status,
        });
        break;
      }
      
      const data = await response.json();
      
      if (!data.collections || data.collections.length === 0) {
        break;
      }
      
      for (const item of data.collections) {
        const contractAddress = item.primaryContract || item.id;
        if (!contractAddress) continue;
        
        allCollections.push({
          contractAddress: contractAddress.toLowerCase(),
          name: item.name || 'Unknown Collection',
          symbol: item.symbol,
          imageUrl: item.image,
          floorPriceMON: item.floorAsk?.price?.amount?.native || null,
          floorPriceUSD: item.floorAsk?.price?.amount?.usd || null,
          listedCount: item.onSaleCount || 0,
          volume24h: item.volume?.['1day'] || null,
          volumeTotal: item.volume?.allTime || null,
          salesCount24h: item.salesCount?.['1day'] || null,
          holdersCount: item.ownerCount || null,
          source: 'magic_eden',
          isVerified: item.openseaVerificationStatus === 'verified',
          updatedAt: new Date().toISOString(),
        });
      }
      
      page++;
      
      // Rate limit: wait 500ms between pages
      await sleep(500);
    } catch (error) {
      logger.error('FloorPrices: Error fetching Magic Eden page', {
        page,
        error: String(error),
      });
      break;
    }
  }
  
  logger.info('FloorPrices: Fetched all Magic Eden collections', {
    count: allCollections.length,
    pages: page,
  });
  
  return allCollections;
}

/**
 * Fetch floor price for a specific collection from Magic Eden
 */
export async function fetchMagicEdenCollectionFloorPrice(
  contractAddress: string
): Promise<CollectionFloorPrice | null> {
  try {
    const url = `${MAGIC_EDEN_API_BASE}/v3/rtp/monad/collections/${contractAddress.toLowerCase()}`;
    
    logger.debug('FloorPrices: Fetching Magic Eden collection', { contractAddress });
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'StarWorldOrder/1.0',
      },
    });
    
    if (!response.ok) {
      logger.warn('FloorPrices: Collection not found on Magic Eden', {
        contractAddress,
        status: response.status,
      });
      return null;
    }
    
    const data = await response.json();
    
    if (!data.collection) {
      return null;
    }
    
    const item = data.collection;
    
    return {
      contractAddress: contractAddress.toLowerCase(),
      name: item.name || 'Unknown Collection',
      symbol: item.symbol,
      imageUrl: item.image,
      floorPriceMON: item.floorAsk?.price?.amount?.native || null,
      floorPriceUSD: item.floorAsk?.price?.amount?.usd || null,
      listedCount: item.onSaleCount || 0,
      volume24h: item.volume?.['1day'] || null,
      volumeTotal: item.volume?.allTime || null,
      salesCount24h: item.salesCount?.['1day'] || null,
      holdersCount: item.ownerCount || null,
      source: 'magic_eden',
      isVerified: item.openseaVerificationStatus === 'verified',
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('FloorPrices: Failed to fetch Magic Eden collection', {
      contractAddress,
      error: String(error),
    });
    return null;
  }
}

// ============================================================
// OPENSEA API FUNCTIONS
// ============================================================

/**
 * Get OpenSea API key from environment
 */
function getOpenSeaAPIKey(): string | null {
  return process.env.OPENSEA_API_KEY || null;
}

/**
 * Fetch collection stats from OpenSea API
 */
export async function fetchOpenSeaCollectionStats(
  collectionSlug: string
): Promise<Partial<CollectionFloorPrice> | null> {
  const apiKey = getOpenSeaAPIKey();
  
  if (!apiKey) {
    logger.debug('FloorPrices: OpenSea API key not configured');
    return null;
  }
  
  try {
    const url = `${OPENSEA_API_BASE}/collections/${collectionSlug}/stats`;
    
    logger.debug('FloorPrices: Fetching OpenSea stats', { collectionSlug });
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-KEY': apiKey,
      },
    });
    
    if (!response.ok) {
      logger.warn('FloorPrices: OpenSea collection not found', {
        collectionSlug,
        status: response.status,
      });
      return null;
    }
    
    const data: OpenSeaCollectionStats = await response.json();
    
    if (!data.total) {
      return null;
    }
    
    return {
      floorPriceMON: data.total.floor_price,
      volume24h: data.total.volume,
      salesCount24h: data.total.sales,
      holdersCount: data.total.num_owners,
      source: 'opensea',
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('FloorPrices: Failed to fetch OpenSea stats', {
      collectionSlug,
      error: String(error),
    });
    return null;
  }
}

// ============================================================
// AGGREGATION & CACHING FUNCTIONS
// ============================================================

/**
 * Check if cache is valid (not expired and has data)
 */
function isCacheValid(): boolean {
  if (floorPriceCache.data.size === 0) return false;
  const age = Date.now() - floorPriceCache.lastRefresh;
  return age < FLOOR_PRICE_CACHE_TTL_MS;
}

/**
 * Get all floor prices (from cache or database)
 */
export async function getAllFloorPrices(): Promise<CollectionFloorPrice[]> {
  // Check in-memory cache first
  if (isCacheValid()) {
    logger.debug('FloorPrices: Returning cached data');
    return Array.from(floorPriceCache.data.values());
  }
  
  // Try to load from database
  const dbPrices = getFloorPricesFromDB();
  
  if (dbPrices.length > 0) {
    // Check if DB data is fresh enough
    const lastUpdate = getLastFloorPriceUpdate();
    const age = lastUpdate ? Date.now() - lastUpdate.getTime() : Infinity;
    
    if (age < FLOOR_PRICE_CACHE_TTL_MS) {
      // Update in-memory cache from DB
      floorPriceCache.data.clear();
      for (const price of dbPrices) {
        floorPriceCache.data.set(price.contractAddress.toLowerCase(), price);
      }
      floorPriceCache.lastRefresh = lastUpdate?.getTime() || Date.now();
      
      logger.debug('FloorPrices: Loaded from database', { count: dbPrices.length });
      return dbPrices;
    }
  }
  
  // Data is stale or missing - return whatever we have
  // The cron job will refresh it
  if (dbPrices.length > 0) {
    logger.debug('FloorPrices: Returning stale DB data', { count: dbPrices.length });
    return dbPrices;
  }
  
  logger.debug('FloorPrices: No data available');
  return [];
}

/**
 * Get floor price for a specific collection
 */
export async function getFloorPrice(contractAddress: string): Promise<CollectionFloorPrice | null> {
  const normalizedAddress = contractAddress.toLowerCase();
  
  // Check in-memory cache first
  if (isCacheValid() && floorPriceCache.data.has(normalizedAddress)) {
    return floorPriceCache.data.get(normalizedAddress) || null;
  }
  
  // Try database
  return getFloorPriceByContract(normalizedAddress);
}

/**
 * Refresh all floor prices from Magic Eden
 * This is the main function called by the cron job
 */
export async function refreshAllFloorPrices(): Promise<{
  success: boolean;
  collectionsUpdated: number;
  error?: string;
}> {
  // Prevent concurrent refreshes
  if (floorPriceCache.isRefreshing) {
    logger.warn('FloorPrices: Refresh already in progress');
    return {
      success: false,
      collectionsUpdated: 0,
      error: 'Refresh already in progress',
    };
  }
  
  floorPriceCache.isRefreshing = true;
  
  try {
    logger.info('FloorPrices: Starting refresh');
    
    // Initialize table if needed
    initializeFloorPricesTable();
    
    // Fetch from Magic Eden (primary source)
    const trendingCollections = await fetchMagicEdenTrendingCollections(100);
    
    // Also try to get all collections for broader coverage
    const allCollections = await fetchMagicEdenAllCollections(5);
    
    // Merge collections (trending takes precedence)
    const collectionMap = new Map<string, CollectionFloorPrice>();
    
    for (const collection of allCollections) {
      collectionMap.set(collection.contractAddress, collection);
    }
    
    for (const collection of trendingCollections) {
      collectionMap.set(collection.contractAddress, collection);
    }
    
    const mergedCollections = Array.from(collectionMap.values());
    
    if (mergedCollections.length === 0) {
      logger.warn('FloorPrices: No collections fetched');
      return {
        success: false,
        collectionsUpdated: 0,
        error: 'No collections fetched from APIs',
      };
    }
    
    // Save to database
    upsertFloorPricesBatch(mergedCollections);
    
    // Update in-memory cache
    floorPriceCache.data.clear();
    for (const collection of mergedCollections) {
      floorPriceCache.data.set(collection.contractAddress, collection);
    }
    floorPriceCache.lastRefresh = Date.now();
    
    // Cleanup old entries
    cleanupOldFloorPrices();
    
    logger.info('FloorPrices: Refresh complete', {
      collectionsUpdated: mergedCollections.length,
    });
    
    return {
      success: true,
      collectionsUpdated: mergedCollections.length,
    };
  } catch (error) {
    logger.error('FloorPrices: Refresh failed', { error: String(error) });
    return {
      success: false,
      collectionsUpdated: 0,
      error: String(error),
    };
  } finally {
    floorPriceCache.isRefreshing = false;
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  cacheSize: number;
  lastRefresh: string | null;
  isRefreshing: boolean;
  cacheTTLSeconds: number;
  nextRefreshDue: string | null;
} {
  const lastRefresh = floorPriceCache.lastRefresh > 0 
    ? new Date(floorPriceCache.lastRefresh).toISOString() 
    : null;
    
  const nextRefreshDue = floorPriceCache.lastRefresh > 0
    ? new Date(floorPriceCache.lastRefresh + FLOOR_PRICE_CACHE_TTL_MS).toISOString()
    : null;
  
  return {
    cacheSize: floorPriceCache.data.size,
    lastRefresh,
    isRefreshing: floorPriceCache.isRefreshing,
    cacheTTLSeconds: FLOOR_PRICE_CACHE_TTL_MS / 1000,
    nextRefreshDue,
  };
}

/**
 * Clear all caches (for manual refresh)
 */
export function clearFloorPriceCache(): void {
  floorPriceCache.data.clear();
  floorPriceCache.lastRefresh = 0;
  floorPriceCache.isRefreshing = false;
  logger.info('FloorPrices: Cache cleared');
}
