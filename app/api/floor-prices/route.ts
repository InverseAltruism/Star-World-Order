/**
 * Floor Prices API Route
 * 
 * GET /api/floor-prices - Get floor prices for all Monad NFT collections
 * 
 * This is a public API endpoint that provides floor prices for NFT collections
 * on the Monad blockchain, aggregated from Magic Eden and OpenSea marketplaces.
 * 
 * Query Parameters:
 * - contract: (optional) Filter by specific contract address
 * - limit: (optional) Limit number of results (default: 100, max: 500)
 * - sortBy: (optional) Sort field: 'floor_price', 'volume', 'name' (default: 'floor_price')
 * - sortOrder: (optional) Sort order: 'asc', 'desc' (default: 'desc')
 * - verified: (optional) Filter to verified collections only: 'true', 'false'
 * 
 * Response:
 * - success: boolean
 * - data: {
 *     collections: CollectionFloorPrice[],
 *     totalCollections: number,
 *     lastUpdated: string (ISO timestamp),
 *     nextUpdate: string (ISO timestamp),
 *     cacheTTLSeconds: number
 *   }
 * - error?: string (if success is false)
 * 
 * Rate Limiting:
 * - No rate limiting on the read endpoint
 * - Data is cached and refreshed every 15 minutes via cron job
 * 
 * Usage Example:
 * - Get all collections: GET /api/floor-prices
 * - Get specific collection: GET /api/floor-prices?contract=0x...
 * - Get top 10 by volume: GET /api/floor-prices?limit=10&sortBy=volume
 * - Get verified only: GET /api/floor-prices?verified=true
 */

import { NextResponse } from 'next/server';
import { 
  getAllFloorPrices, 
  getFloorPrice,
  getCacheStats,
  CollectionFloorPrice,
} from '@/lib/floorPrices';
import { logger } from '@/lib/logger';

// CORS headers for public API access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'public, max-age=60, s-maxage=300', // 1 min browser, 5 min CDN
};

/**
 * Handle OPTIONS request for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * GET /api/floor-prices
 * Get floor prices for Monad NFT collections
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    
    // Parse query parameters
    const contractAddress = url.searchParams.get('contract');
    const limitParam = url.searchParams.get('limit');
    const sortBy = url.searchParams.get('sortBy') || 'floor_price';
    const sortOrder = url.searchParams.get('sortOrder') || 'desc';
    const verifiedOnly = url.searchParams.get('verified') === 'true';
    
    // Validate and parse limit
    let limit = 100;
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        limit = Math.min(parsedLimit, 500); // Max 500
      }
    }
    
    // If specific contract requested, return just that one
    if (contractAddress) {
      const floorPrice = await getFloorPrice(contractAddress);
      const cacheStats = getCacheStats();
      
      if (!floorPrice) {
        return NextResponse.json(
          {
            success: false,
            error: `Collection not found: ${contractAddress}`,
            data: null,
          },
          { status: 404, headers: corsHeaders }
        );
      }
      
      return NextResponse.json(
        {
          success: true,
          data: {
            collections: [floorPrice],
            totalCollections: 1,
            lastUpdated: cacheStats.lastRefresh || new Date().toISOString(),
            nextUpdate: cacheStats.nextRefreshDue || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            cacheTTLSeconds: cacheStats.cacheTTLSeconds,
          },
        },
        { headers: corsHeaders }
      );
    }
    
    // Get all floor prices
    let collections = await getAllFloorPrices();
    const cacheStats = getCacheStats();
    
    // Filter by verified if requested
    if (verifiedOnly) {
      collections = collections.filter(c => c.isVerified);
    }
    
    // Sort collections
    collections = sortCollections(collections, sortBy, sortOrder);
    
    // Apply limit
    const totalBeforeLimit = collections.length;
    collections = collections.slice(0, limit);
    
    logger.debug('FloorPrices API: Returning data', {
      totalCollections: totalBeforeLimit,
      returnedCollections: collections.length,
      sortBy,
      sortOrder,
      verifiedOnly,
    });
    
    return NextResponse.json(
      {
        success: true,
        data: {
          collections,
          totalCollections: totalBeforeLimit,
          lastUpdated: cacheStats.lastRefresh || new Date().toISOString(),
          nextUpdate: cacheStats.nextRefreshDue || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          cacheTTLSeconds: cacheStats.cacheTTLSeconds,
        },
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    logger.error('FloorPrices API: Error', { error: String(error) });
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch floor prices',
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * Sort collections by specified field
 */
function sortCollections(
  collections: CollectionFloorPrice[],
  sortBy: string,
  sortOrder: string
): CollectionFloorPrice[] {
  const isAsc = sortOrder === 'asc';
  
  return [...collections].sort((a, b) => {
    let valueA: number | string | null;
    let valueB: number | string | null;
    
    switch (sortBy) {
      case 'floor_price':
        valueA = a.floorPriceMON;
        valueB = b.floorPriceMON;
        break;
      case 'volume':
        valueA = a.volume24h;
        valueB = b.volume24h;
        break;
      case 'volume_total':
        valueA = a.volumeTotal;
        valueB = b.volumeTotal;
        break;
      case 'sales':
        valueA = a.salesCount24h;
        valueB = b.salesCount24h;
        break;
      case 'holders':
        valueA = a.holdersCount;
        valueB = b.holdersCount;
        break;
      case 'listed':
        valueA = a.listedCount;
        valueB = b.listedCount;
        break;
      case 'name':
        valueA = a.name.toLowerCase();
        valueB = b.name.toLowerCase();
        break;
      default:
        valueA = a.floorPriceMON;
        valueB = b.floorPriceMON;
    }
    
    // Handle null values (put them at the end)
    if (valueA === null && valueB === null) return 0;
    if (valueA === null) return 1;
    if (valueB === null) return -1;
    
    // String comparison
    if (typeof valueA === 'string' && typeof valueB === 'string') {
      return isAsc 
        ? valueA.localeCompare(valueB) 
        : valueB.localeCompare(valueA);
    }
    
    // Number comparison
    const numA = valueA as number;
    const numB = valueB as number;
    
    return isAsc ? numA - numB : numB - numA;
  });
}
