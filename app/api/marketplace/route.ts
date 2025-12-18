/**
 * Marketplace API Route
 * 
 * GET /api/marketplace - Get marketplace analytics for Star Skrumpeys including:
 * - Constellation rarity distribution
 * - Trait analytics (aura, background, form)
 * - Holder distribution by tier
 * 
 * ============================================================================
 * TODO: RE-ENABLE MAGIC EDEN API WHEN MONAD SUPPORT IS ADDED
 * ============================================================================
 * 
 * As of December 2024, Magic Eden's public API does not support Monad chain.
 * The web UI works but uses internal/undocumented endpoints.
 * 
 * Tested endpoints that DO NOT work for Monad:
 * - /v3/monad/collections/{contract}/listings - 400 Bad Request
 * - /v3/rtp/monad/collections/{contract}/tokens/v1 - Not Found
 * - /v2/evm/monad/collections/{contract}/listings - Not Found
 * - /v2/collections/{symbol}/listings?chain=monad - Returns Solana data
 * 
 * When Magic Eden adds Monad API support, uncomment the fetchActiveListings() 
 * and fetchSalesHistory() functions and update the endpoint URLs.
 * 
 * Commented out sections are marked with: MAGIC EDEN API - DISABLED
 * ============================================================================
 */

import { NextResponse } from 'next/server';
import { SKRUMPEY_CONTRACT_ADDRESS, STAR_SKRUMPEY_IDS, isStarSkrumpeyId } from '@/lib/starSkrumpey';
import { getStarSkrumpeyMetadataBatch, getConstellationDistribution, getTraitDistribution } from '@/lib/db';
import { logger } from '@/lib/logger';

// Magic Eden API base URL for Monad
const MAGIC_EDEN_API_BASE = 'https://api-mainnet.magiceden.dev/v3';

// Cache for marketplace data (2 minute TTL for faster updates)
let marketplaceCache: {
  data: MarketplaceData;
  timestamp: number;
} | null = null;
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * Sale activity from Magic Eden
 */
export interface SaleActivity {
  tokenId: number;
  price: number; // Price in MON
  priceUsd?: number;
  seller: string;
  buyer: string;
  timestamp: number;
  txHash: string;
  constellation?: string;
}

/**
 * Listing from Magic Eden
 */
export interface ActiveListing {
  tokenId: number;
  price: number; // Price in MON
  seller: string;
  timestamp: number;
  constellation?: string;
}

/**
 * Floor price data point for chart
 */
export interface FloorPricePoint {
  timestamp: number;
  price: number;
}

/**
 * Constellation floor price
 */
export interface ConstellationFloor {
  constellation: string;
  floorPrice: number;
  count: number;
  listedCount: number;
}

/**
 * Complete marketplace data response
 */
export interface MarketplaceData {
  // Floor prices (DISABLED - Magic Eden API not available)
  overallFloor: number;
  constellationFloors: ConstellationFloor[];
  
  // Chart data (DISABLED - Magic Eden API not available)
  floorChartHourly: FloorPricePoint[];
  floorChartDaily: FloorPricePoint[];
  
  // Sales history (DISABLED - Magic Eden API not available)
  topSales: SaleActivity[];
  recentSales: SaleActivity[];
  
  // Listings (DISABLED - Magic Eden API not available)
  activeListings: ActiveListing[];
  totalListed: number;
  totalUnlisted: number;
  
  // Last updated timestamp
  lastUpdated: string;
  
  // NEW: Database-powered analytics
  constellationDistribution?: Record<string, number>;
  traitDistribution?: {
    aura: Record<string, number>;
    background: Record<string, number>;
    form: Record<string, number>;
  };
}

/* MAGIC EDEN API - DISABLED - Comment out until Monad support is added
/**
 * Fetch active listings from Magic Eden API
 */
/*
async function fetchActiveListings(): Promise<ActiveListing[]> {
  if (!SKRUMPEY_CONTRACT_ADDRESS) {
    return [];
  }

  try {
    // Magic Eden Monad listings endpoint
    const response = await fetch(
      `${MAGIC_EDEN_API_BASE}/monad/collections/${SKRUMPEY_CONTRACT_ADDRESS}/listings?limit=500`,
      {
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      logger.warn('Magic Eden listings API returned error', { 
        status: response.status,
        statusText: response.statusText 
      });
      return [];
    }

    const data = await response.json();
    
    // Get metadata for constellation info
    const tokenIds = (data.listings || data || [])
      .filter((l: { tokenId?: string | number }) => l.tokenId && isStarSkrumpeyId(Number(l.tokenId)))
      .map((l: { tokenId: string | number }) => Number(l.tokenId));
    const metadataMap = getStarSkrumpeyMetadataBatch(tokenIds);
    
    return (data.listings || data || [])
      .filter((l: { tokenId?: string | number }) => l.tokenId && isStarSkrumpeyId(Number(l.tokenId)))
      .map((listing: { 
        tokenId: string | number;
        price?: number | string;
        maker?: string;
        seller?: string;
        createdAt?: string | number;
        timestamp?: number;
      }) => ({
        tokenId: Number(listing.tokenId),
        price: Number(listing.price || 0) / 1e18, // Convert from wei to MON
        seller: listing.maker || listing.seller || '',
        timestamp: typeof listing.createdAt === 'string' 
          ? new Date(listing.createdAt).getTime() 
          : (listing.timestamp || Date.now()),
        constellation: metadataMap.get(Number(listing.tokenId))?.constellation || undefined,
      }));
  } catch (error) {
    logger.error('Failed to fetch listings from Magic Eden', { error: String(error) });
    return [];
  }
}
*/ /* END MAGIC EDEN API - DISABLED */

/* MAGIC EDEN API - DISABLED - Comment out until Monad support is added
/**
 * Fetch sales history from Magic Eden API
 */
/*
async function fetchSalesHistory(): Promise<SaleActivity[]> {
  if (!SKRUMPEY_CONTRACT_ADDRESS) {
    return [];
  }

  try {
    // Magic Eden Monad activities endpoint
    const response = await fetch(
      `${MAGIC_EDEN_API_BASE}/monad/collections/${SKRUMPEY_CONTRACT_ADDRESS}/activities?type=sale&limit=200`,
      {
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      logger.warn('Magic Eden activities API returned error', { 
        status: response.status,
        statusText: response.statusText 
      });
      return [];
    }

    const data = await response.json();
    
    // Get metadata for constellation info
    const tokenIds = (data.activities || data || [])
      .filter((a: { tokenId?: string | number }) => a.tokenId && isStarSkrumpeyId(Number(a.tokenId)))
      .map((a: { tokenId: string | number }) => Number(a.tokenId));
    const metadataMap = getStarSkrumpeyMetadataBatch(tokenIds);
    
    return (data.activities || data || [])
      .filter((a: { tokenId?: string | number; type?: string }) => 
        a.tokenId && 
        isStarSkrumpeyId(Number(a.tokenId)) &&
        (a.type === 'sale' || a.type === 'SALE')
      )
      .map((activity: {
        tokenId: string | number;
        price?: number | string;
        fromAddress?: string;
        seller?: string;
        toAddress?: string;
        buyer?: string;
        timestamp?: string | number;
        createdAt?: string | number;
        transactionHash?: string;
        txHash?: string;
      }) => ({
        tokenId: Number(activity.tokenId),
        price: Number(activity.price || 0) / 1e18, // Convert from wei to MON
        seller: activity.fromAddress || activity.seller || '',
        buyer: activity.toAddress || activity.buyer || '',
        timestamp: typeof activity.timestamp === 'string' 
          ? new Date(activity.timestamp).getTime()
          : (typeof activity.createdAt === 'string'
            ? new Date(activity.createdAt).getTime()
            : (activity.timestamp || Date.now())),
        txHash: activity.transactionHash || activity.txHash || '',
        constellation: metadataMap.get(Number(activity.tokenId))?.constellation || undefined,
      }));
  } catch (error) {
    logger.error('Failed to fetch sales from Magic Eden', { error: String(error) });
    return [];
  }
}
*/ /* END MAGIC EDEN API - DISABLED */

/**
 * Generate floor price chart data from sales
 * Smooths data using moving average
 */
function generateFloorChartData(
  sales: SaleActivity[],
  listings: ActiveListing[],
  hourly: boolean
): FloorPricePoint[] {
  if (sales.length === 0 && listings.length === 0) {
    return [];
  }

  const now = Date.now();
  const period = hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 1 hour or 1 day
  const lookback = hourly ? 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000; // 24 hours or 30 days
  
  // Combine and sort all price events by timestamp
  const priceEvents = [
    ...sales.map(s => ({ timestamp: s.timestamp, price: s.price })),
  ].sort((a, b) => a.timestamp - b.timestamp);
  
  // If no sales, use current floor from listings
  const currentFloor = listings.length > 0 
    ? Math.min(...listings.map(l => l.price))
    : 0;
  
  // Generate data points
  const points: FloorPricePoint[] = [];
  const startTime = now - lookback;
  
  for (let t = startTime; t <= now; t += period) {
    // Get lowest price in this period (or up to this time)
    const relevantPrices = priceEvents
      .filter(e => e.timestamp <= t && e.timestamp > t - lookback)
      .map(e => e.price)
      .filter(p => p > 0);
    
    // Use the minimum price as floor, or current floor if no data
    const floorPrice = relevantPrices.length > 0 
      ? Math.min(...relevantPrices)
      : currentFloor;
    
    if (floorPrice > 0) {
      points.push({ timestamp: t, price: floorPrice });
    }
  }
  
  // Apply simple moving average smoothing (3-point)
  if (points.length >= 3) {
    const smoothed: FloorPricePoint[] = [];
    for (let i = 0; i < points.length; i++) {
      if (i === 0) {
        smoothed.push(points[i]);
      } else if (i === points.length - 1) {
        smoothed.push(points[i]);
      } else {
        // 3-point average
        const avg = (points[i - 1].price + points[i].price + points[i + 1].price) / 3;
        smoothed.push({ timestamp: points[i].timestamp, price: avg });
      }
    }
    return smoothed;
  }
  
  return points;
}

/**
 * Calculate constellation floor prices
 */
function calculateConstellationFloors(
  listings: ActiveListing[],
  totalByConstellation: Map<string, number>
): ConstellationFloor[] {
  const constellations = [
    'aether', 'spectra', 'solveil', 'nebulu', 'chroma',
    'rose', 'monflare', 'auracore', 'parallel', 'prime'
  ];
  
  return constellations.map(constellation => {
    const constellationListings = listings.filter(l => l.constellation === constellation);
    const floorPrice = constellationListings.length > 0
      ? Math.min(...constellationListings.map(l => l.price))
      : 0;
    const total = totalByConstellation.get(constellation) || 0;
    
    return {
      constellation,
      floorPrice,
      count: total,
      listedCount: constellationListings.length,
    };
  });
}

/**
 * Generate test data for visual verification (dev mode only)
 */
function generateTestData(): MarketplaceData {
  const now = Date.now();
  const hourlyData: FloorPricePoint[] = [];
  const dailyData: FloorPricePoint[] = [];
  
  // Generate hourly data (24 points)
  for (let i = 24; i >= 0; i--) {
    const basePrice = 12 + Math.sin(i / 4) * 2 + (Math.random() - 0.5) * 0.5;
    hourlyData.push({
      timestamp: now - i * 60 * 60 * 1000,
      price: Math.max(10, basePrice),
    });
  }
  
  // Generate daily data (30 points)
  for (let i = 30; i >= 0; i--) {
    const basePrice = 8 + (30 - i) * 0.15 + (Math.random() - 0.5) * 1;
    dailyData.push({
      timestamp: now - i * 24 * 60 * 60 * 1000,
      price: Math.max(6, basePrice),
    });
  }
  
  return {
    overallFloor: 12.5,
    constellationFloors: [
      { constellation: 'prime', floorPrice: 150.0, count: 1, listedCount: 0 },
      { constellation: 'parallel', floorPrice: 45.0, count: 10, listedCount: 2 },
      { constellation: 'auracore', floorPrice: 35.5, count: 21, listedCount: 3 },
      { constellation: 'monflare', floorPrice: 28.0, count: 27, listedCount: 4 },
      { constellation: 'rose', floorPrice: 22.5, count: 38, listedCount: 5 },
      { constellation: 'chroma', floorPrice: 18.0, count: 44, listedCount: 6 },
      { constellation: 'nebulu', floorPrice: 15.5, count: 47, listedCount: 8 },
      { constellation: 'solveil', floorPrice: 14.0, count: 46, listedCount: 7 },
      { constellation: 'spectra', floorPrice: 13.0, count: 52, listedCount: 9 },
      { constellation: 'aether', floorPrice: 12.5, count: 47, listedCount: 10 },
    ],
    floorChartHourly: hourlyData,
    floorChartDaily: dailyData,
    topSales: [
      { tokenId: 3332, price: 250.0, seller: '0x1234567890abcdef1234567890abcdef12345678', buyer: '0xabcdef1234567890abcdef1234567890abcdef12', timestamp: now - 1 * 24 * 60 * 60 * 1000, txHash: '0xabc123', constellation: 'prime' },
      { tokenId: 2789, price: 85.5, seller: '0x2345678901bcdef12345678901bcdef123456789', buyer: '0xbcdef1234567890abcdef1234567890abcdef123', timestamp: now - 2 * 24 * 60 * 60 * 1000, txHash: '0xdef456', constellation: 'parallel' },
      { tokenId: 1417, price: 62.0, seller: '0x3456789012cdef123456789012cdef1234567890', buyer: '0xcdef1234567890abcdef1234567890abcdef1234', timestamp: now - 3 * 24 * 60 * 60 * 1000, txHash: '0xghi789', constellation: 'auracore' },
      { tokenId: 710, price: 48.5, seller: '0x4567890123def1234567890123def12345678901', buyer: '0xdef1234567890abcdef1234567890abcdef12345', timestamp: now - 4 * 24 * 60 * 60 * 1000, txHash: '0xjkl012', constellation: 'monflare' },
      { tokenId: 3, price: 42.0, seller: '0x5678901234ef12345678901234ef123456789012', buyer: '0xef1234567890abcdef1234567890abcdef123456', timestamp: now - 5 * 24 * 60 * 60 * 1000, txHash: '0xmno345', constellation: 'aether' },
    ],
    recentSales: [
      { tokenId: 3332, price: 250.0, seller: '0x1234567890abcdef1234567890abcdef12345678', buyer: '0xabcdef1234567890abcdef1234567890abcdef12', timestamp: now - 1 * 24 * 60 * 60 * 1000, txHash: '0xabc123', constellation: 'prime' },
      { tokenId: 2789, price: 85.5, seller: '0x2345678901bcdef12345678901bcdef123456789', buyer: '0xbcdef1234567890abcdef1234567890abcdef123', timestamp: now - 2 * 24 * 60 * 60 * 1000, txHash: '0xdef456', constellation: 'parallel' },
      { tokenId: 1417, price: 62.0, seller: '0x3456789012cdef123456789012cdef1234567890', buyer: '0xcdef1234567890abcdef1234567890abcdef1234', timestamp: now - 3 * 24 * 60 * 60 * 1000, txHash: '0xghi789', constellation: 'auracore' },
      { tokenId: 710, price: 48.5, seller: '0x4567890123def1234567890123def12345678901', buyer: '0xdef1234567890abcdef1234567890abcdef12345', timestamp: now - 4 * 24 * 60 * 60 * 1000, txHash: '0xjkl012', constellation: 'monflare' },
      { tokenId: 3, price: 42.0, seller: '0x5678901234ef12345678901234ef123456789012', buyer: '0xef1234567890abcdef1234567890abcdef123456', timestamp: now - 5 * 24 * 60 * 60 * 1000, txHash: '0xmno345', constellation: 'aether' },
    ],
    activeListings: [],
    totalListed: 54,
    totalUnlisted: 279,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Main GET handler - Returns database-powered analytics
 */
export async function GET(request: Request) {
  try {
    // Check for test mode (dev only - useful for visual verification)
    const { searchParams } = new URL(request.url);
    const isTestMode = searchParams.get('test') === 'true';
    
    if (isTestMode && process.env.NODE_ENV === 'development') {
      logger.debug('Returning test marketplace data');
      return NextResponse.json({
        success: true,
        data: generateTestData(),
        cached: false,
        testMode: true,
      });
    }
    
    // Check cache first
    const now = Date.now();
    if (marketplaceCache && (now - marketplaceCache.timestamp < CACHE_TTL)) {
      logger.debug('Returning cached marketplace data');
      return NextResponse.json({
        success: true,
        data: marketplaceCache.data,
        cached: true,
      });
    }

    /* MAGIC EDEN API - DISABLED
    // Fetch fresh data in parallel
    const [listings, sales] = await Promise.all([
      fetchActiveListings(),
      fetchSalesHistory(),
    ]);
    */
    
    // Database-powered analytics (no API calls needed)
    const constellationDist = getConstellationDistribution();
    const auraDist = getTraitDistribution('aura');
    const backgroundDist = getTraitDistribution('background');
    const formDist = getTraitDistribution('form');
    
    // Convert constellation distribution to ConstellationFloor format
    const constellationFloors: ConstellationFloor[] = Object.entries(constellationDist).map(([constellation, count]) => ({
      constellation,
      floorPrice: 0, // No Magic Eden data available
      count,
      listedCount: 0, // No Magic Eden data available
    }));
    
    const marketplaceData: MarketplaceData = {
      overallFloor: 0, // No Magic Eden data
      constellationFloors,
      floorChartHourly: [], // No Magic Eden data
      floorChartDaily: [], // No Magic Eden data
      topSales: [], // No Magic Eden data
      recentSales: [], // No Magic Eden data
      activeListings: [], // No Magic Eden data
      totalListed: 0, // No Magic Eden data
      totalUnlisted: STAR_SKRUMPEY_IDS.length,
      lastUpdated: new Date().toISOString(),
      // New database-powered analytics
      constellationDistribution: constellationDist,
      traitDistribution: {
        aura: auraDist,
        background: backgroundDist,
        form: formDist,
      },
    };
    
    // Update cache
    marketplaceCache = {
      data: marketplaceData,
      timestamp: now,
    };

    return NextResponse.json({
      success: true,
      data: marketplaceData,
      cached: false,
    });
  } catch (error) {
    logger.error('Failed to get marketplace data:', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch marketplace data' },
      { status: 500 }
    );
  }
}
