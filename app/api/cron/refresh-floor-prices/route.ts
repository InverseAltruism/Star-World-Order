/**
 * Cron Job: Refresh Floor Prices
 * 
 * GET /api/cron/refresh-floor-prices - Refresh NFT floor prices from marketplaces
 * 
 * This endpoint should be called every 15-30 minutes to:
 * 1. Scrape floor prices from Magic Eden API (primary source)
 * 2. Scrape floor prices from OpenSea API (secondary, if API key configured)
 * 3. Aggregate and store data in the database
 * 4. Update the in-memory cache
 * 
 * Security: This endpoint validates a CRON_SECRET token to prevent unauthorized access.
 * Set CRON_SECRET environment variable in production.
 * 
 * Environment Variables:
 * - CRON_SECRET: Secret token for authentication (required in production)
 * - OPENSEA_API_KEY: Optional - enables OpenSea as secondary data source
 * 
 * Usage:
 * - Systemd timer: Call via curl with Authorization header
 * - Vercel cron: Add to vercel.json crons configuration
 * - Manual: curl -H "Authorization: Bearer <CRON_SECRET>" https://your-domain/api/cron/refresh-floor-prices
 * 
 * Recommended cron schedule: Every 15-30 minutes
 * - Crontab: 0,15,30,45 * * * * (every 15 min) or 0,30 * * * * (every 30 min)
 * - Systemd timer: OnUnitActiveSec=15min or OnUnitActiveSec=30min
 */

import { NextResponse } from 'next/server';
import { 
  refreshAllFloorPrices, 
  getCacheStats,
  initializeFloorPricesTable,
} from '@/lib/floorPrices';
import { getScraperConfig } from '@/lib/floorPriceScraper';
import { logger } from '@/lib/logger';

// Minimum time between refreshes (10 minutes)
const MIN_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

// Track last refresh time to prevent abuse
let lastRefreshAttempt = 0;

/**
 * Validate the cron secret token
 */
function validateCronSecret(request: Request): boolean {
  // In development, allow without token
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // If no secret is configured, allow the request (but log warning)
    logger.warn('CRON_SECRET not configured - allowing unauthenticated cron request');
    return true;
  }
  
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return false;
  }
  
  // Support "Bearer <token>" format
  const token = authHeader.replace('Bearer ', '');
  return token === cronSecret;
}

/**
 * GET /api/cron/refresh-floor-prices
 * Refresh floor prices from marketplaces via automated scraping
 */
export async function GET(request: Request) {
  // Validate cron secret
  if (!validateCronSecret(request)) {
    logger.warn('FloorPrices Cron: Unauthorized request');
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  try {
    logger.info('FloorPrices Cron: Starting automated floor price refresh');
    
    // Check rate limiting
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshAttempt;
    
    if (timeSinceLastRefresh < MIN_REFRESH_INTERVAL_MS) {
      const waitTimeMinutes = Math.ceil((MIN_REFRESH_INTERVAL_MS - timeSinceLastRefresh) / 60000);
      
      logger.info('FloorPrices Cron: Rate limited', {
        waitTimeMinutes,
        lastRefreshAttempt: new Date(lastRefreshAttempt).toISOString(),
      });
      
      return NextResponse.json({
        success: false,
        skipped: true,
        message: `Rate limited. Please wait ${waitTimeMinutes} minutes before next refresh.`,
        lastRefresh: new Date(lastRefreshAttempt).toISOString(),
        nextRefreshAvailable: new Date(lastRefreshAttempt + MIN_REFRESH_INTERVAL_MS).toISOString(),
      });
    }
    
    // Update last refresh attempt time
    lastRefreshAttempt = now;
    
    // Initialize database table if needed
    initializeFloorPricesTable();
    
    // Get scraper configuration info
    const scraperConfig = getScraperConfig();
    
    // Perform the automated scrape and refresh
    const result = await refreshAllFloorPrices();
    const cacheStats = getCacheStats();
    
    if (!result.success) {
      logger.error('FloorPrices Cron: Refresh failed', { error: result.error });
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to refresh floor prices',
        message: result.message,
        scraperConfig,
        cacheStats,
      }, { status: 500 });
    }
    
    logger.info('FloorPrices Cron: Refresh complete', {
      collectionsUpdated: result.collectionsUpdated,
      sources: result.sources,
    });
    
    return NextResponse.json({
      success: true,
      message: result.message || 'Floor prices refreshed successfully',
      data: {
        collectionsUpdated: result.collectionsUpdated,
        sources: result.sources,
        timestamp: new Date().toISOString(),
        nextRefreshDue: cacheStats.nextRefreshDue,
      },
      scraperConfig,
      cacheStats,
    });
  } catch (error) {
    logger.error('FloorPrices Cron: Error', { error: String(error) });
    
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/refresh-floor-prices
 * Also support POST for webhook-style triggers
 */
export async function POST(request: Request) {
  return GET(request);
}
