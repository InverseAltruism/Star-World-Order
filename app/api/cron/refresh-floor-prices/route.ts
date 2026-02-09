/**
 * Cron Job: Refresh Floor Prices
 * 
 * GET /api/cron/refresh-floor-prices - Refresh NFT floor prices from marketplaces
 * 
 * This endpoint should be called every 15 minutes to:
 * 1. Fetch floor prices from Magic Eden API
 * 2. (Future) Fetch floor prices from OpenSea API
 * 3. Store aggregated data in the database
 * 4. Update the in-memory cache
 * 
 * Security: This endpoint validates a CRON_SECRET token to prevent unauthorized access.
 * Set CRON_SECRET environment variable in production.
 * 
 * Usage:
 * - Systemd timer: Call via curl with Authorization header
 * - Vercel cron: Add to vercel.json crons configuration
 * - Manual: curl -H "Authorization: Bearer <CRON_SECRET>" https://your-domain/api/cron/refresh-floor-prices
 * 
 * Recommended cron schedule: Every 15 minutes
 * - Crontab: *​/15 * * * *
 * - Systemd timer: OnUnitActiveSec=15min
 */

import { NextResponse } from 'next/server';
import {
  refreshAllFloorPrices,
  getCacheStats,
  initializeFloorPricesTable,
} from '@/lib/floorPrices';
import { logger } from '@/lib/logger';
import { validateCronSecret } from '@/lib/cronAuth';

// Minimum time between refreshes (10 minutes)
const MIN_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

// Track last refresh time to prevent abuse
let lastRefreshAttempt = 0;

/**
 * GET /api/cron/refresh-floor-prices
 * Refresh floor prices from marketplaces
 */
export async function GET(request: Request) {
  const auth = validateCronSecret(request, 'refresh-floor-prices');
  if (!auth.valid) {
    logger.warn('FloorPrices Cron: Unauthorized request', { error: auth.error });
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: 401 }
    );
  }
  
  try {
    logger.info('FloorPrices Cron: Starting refresh');
    
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
    
    // Perform the refresh
    const result = await refreshAllFloorPrices();
    const cacheStats = getCacheStats();
    
    if (!result.success) {
      logger.error('FloorPrices Cron: Refresh failed', { error: result.error });
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to refresh floor prices',
        cacheStats,
      }, { status: 500 });
    }
    
    logger.info('FloorPrices Cron: Refresh complete', {
      collectionsUpdated: result.collectionsUpdated,
    });
    
    return NextResponse.json({
      success: true,
      message: 'Floor prices refreshed successfully',
      data: {
        collectionsUpdated: result.collectionsUpdated,
        timestamp: new Date().toISOString(),
        nextRefreshDue: cacheStats.nextRefreshDue,
      },
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
