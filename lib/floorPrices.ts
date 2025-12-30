/**
 * NFT Floor Price Aggregator for Star World Order
 * 
 * This module provides floor price data for Monad NFT collections.
 * 
 * Features:
 * - Automated floor price scraping from Magic Eden API
 * - OpenSea API integration (requires OPENSEA_API_KEY env var)
 * - 15-minute cache TTL for efficiency
 * - SQLite persistence for data durability
 * - Public API for querying floor prices
 * 
 * Data Sources:
 * - Magic Eden API (primary): https://api-mainnet.magiceden.dev/v4/evm-public/collections
 * - OpenSea API (secondary): https://api.opensea.io/api/v2/collections (requires API key)
 * 
 * Refresh Schedule:
 * - Recommended: Every 15-30 minutes via cron job
 * - Call /api/cron/refresh-floor-prices to trigger refresh
 */

import { logger } from './logger';
import { getDatabase } from './db';

// ============================================================
// CONSTANTS & CONFIGURATION
// ============================================================

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
  source: 'magic_eden' | 'opensea' | 'aggregated' | 'manual';
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
      source TEXT NOT NULL CHECK (source IN ('magic_eden', 'opensea', 'aggregated', 'manual')),
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
      source: 'magic_eden' | 'opensea' | 'aggregated' | 'manual';
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
      source: 'magic_eden' | 'opensea' | 'aggregated' | 'manual';
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
// MANUAL DATA ENTRY FUNCTIONS
// ============================================================

/**
 * NOTE: Magic Eden and OpenSea do not provide public floor price APIs for Monad.
 * The following functions are placeholders that return empty data.
 * Floor prices must be manually entered via the admin panel or through
 * future browser automation/scraping implementation.
 */

/**
 * Placeholder for fetching trending collections
 * Returns empty array since no public API is available
 */
async function fetchTrendingCollections(): Promise<CollectionFloorPrice[]> {
  logger.info('FloorPrices: No public API available for floor prices. Use manual entry via admin panel.');
  return [];
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
 * Refresh all floor prices
 * 
 * This function scrapes floor prices from Magic Eden and OpenSea APIs,
 * stores them in the database, and updates the in-memory cache.
 * 
 * Data sources:
 * - Magic Eden API (primary) - Free public API
 * - OpenSea API (secondary) - Requires API key in OPENSEA_API_KEY env var
 */
export async function refreshAllFloorPrices(): Promise<{
  success: boolean;
  collectionsUpdated: number;
  error?: string;
  message?: string;
  sources?: {
    magicEden: number;
    openSea: number;
  };
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
    logger.info('FloorPrices: Starting refresh with automated scraper');
    
    // Initialize table if needed
    initializeFloorPricesTable();
    
    // Import and run the scraper dynamically to avoid circular dependencies
    const { scrapeAllFloorPrices } = await import('./floorPriceScraper');
    const scrapeResult = await scrapeAllFloorPrices();
    
    if (!scrapeResult.success) {
      // Scraping failed, fall back to loading existing DB data
      logger.warn('FloorPrices: Scraping failed, loading existing data from database', {
        error: scrapeResult.error,
      });
      
      const dbCollections = getFloorPricesFromDB();
      
      // Update in-memory cache from database
      floorPriceCache.data.clear();
      for (const collection of dbCollections) {
        floorPriceCache.data.set(collection.contractAddress, collection);
      }
      floorPriceCache.lastRefresh = Date.now();
      
      return {
        success: dbCollections.length > 0,
        collectionsUpdated: dbCollections.length,
        message: `Scraping failed. Loaded ${dbCollections.length} cached collections from database.`,
        error: scrapeResult.error,
        sources: scrapeResult.sources,
      };
    }
    
    // Scraping succeeded - reload from database into memory cache
    const dbCollections = getFloorPricesFromDB();
    
    // Update in-memory cache from database
    floorPriceCache.data.clear();
    for (const collection of dbCollections) {
      floorPriceCache.data.set(collection.contractAddress, collection);
    }
    floorPriceCache.lastRefresh = Date.now();
    
    // Cleanup old entries
    cleanupOldFloorPrices();
    
    logger.info('FloorPrices: Refresh complete', {
      collectionsUpdated: scrapeResult.collectionsUpdated,
      sources: scrapeResult.sources,
    });
    
    return {
      success: true,
      collectionsUpdated: scrapeResult.collectionsUpdated,
      message: `Successfully scraped ${scrapeResult.collectionsUpdated} collections from marketplaces.`,
      sources: scrapeResult.sources,
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
