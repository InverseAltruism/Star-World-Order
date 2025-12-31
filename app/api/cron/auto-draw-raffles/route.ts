/**
 * Cron Job: Auto-Draw Raffles
 * 
 * GET /api/cron/auto-draw-raffles - Automatically draw winners for ended raffles
 * 
 * This endpoint should be called periodically (e.g., every 5-15 minutes) to:
 * 1. Find raffles that have ended but haven't been drawn yet
 * 2. Automatically draw winners using verifiable randomness
 * 
 * Security: This endpoint validates a CRON_SECRET token to prevent unauthorized access.
 * Set CRON_SECRET environment variable in production.
 * 
 * Usage:
 * - Systemd timer: Call via curl with Authorization header
 * - Vercel cron: Add to vercel.json crons configuration
 * - Manual: curl -H "Authorization: Bearer <CRON_SECRET>" https://your-domain/api/cron/auto-draw-raffles
 */

import { NextResponse } from 'next/server';
import { 
  getRafflesNeedingDraw,
  drawRaffleWinner,
  getRaffleEntries,
} from '@/lib/db';
import { logger } from '@/lib/logger';
import { getResilientClient } from '@/lib/rpcClient';

/**
 * Validate the cron secret token
 */
function validateCronSecret(request: Request): boolean {
  // In development, allow without token but log warning
  if (process.env.NODE_ENV === 'development') {
    logger.info('Development mode - allowing cron request without authentication');
    return true;
  }
  
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // Fail securely - require authentication in production
    logger.error('CRON_SECRET not configured - rejecting cron request for security');
    return false;
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
 * Get a recent block hash from the blockchain for randomness seed
 */
async function getBlockHash(): Promise<string> {
  try {
    const client = await getResilientClient();
    const block = await client.getBlock({ blockTag: 'latest' });
    return block.hash || `fallback-${Date.now()}-${Math.random().toString(36)}`;
  } catch (error) {
    logger.warn('Failed to get block hash, using fallback', { error: String(error) });
    return `fallback-${Date.now()}-${Math.random().toString(36)}`;
  }
}

export async function GET(request: Request) {
  // Validate cron secret
  if (!validateCronSecret(request)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    logger.info('Cron job started: auto-draw-raffles');
    
    // Get raffles that need to be drawn
    const rafflesToDraw = getRafflesNeedingDraw();
    
    if (rafflesToDraw.length === 0) {
      logger.info('No raffles need to be drawn');
      return NextResponse.json({
        success: true,
        message: 'No raffles need to be drawn',
        rafflesDrawn: 0,
        timestamp: new Date().toISOString(),
      });
    }
    
    logger.info(`Found ${rafflesToDraw.length} raffle(s) to draw`, {
      raffleIds: rafflesToDraw.map(r => r.id),
    });
    
    // Get a block hash for randomness
    const blockHash = await getBlockHash();
    
    // Draw each raffle
    const results: Array<{
      raffleId: string;
      raffleName: string;
      success: boolean;
      winner?: string;
      error?: string;
    }> = [];
    
    for (const raffle of rafflesToDraw) {
      // Check if raffle has entries
      const entries = getRaffleEntries(raffle.id);
      
      if (entries.length === 0) {
        logger.info(`Raffle ${raffle.id} has no entries, skipping draw`, {
          raffleName: raffle.name,
        });
        results.push({
          raffleId: raffle.id,
          raffleName: raffle.name,
          success: false,
          error: 'No entries in raffle',
        });
        continue;
      }
      
      // Draw the winner
      const drawResult = drawRaffleWinner(raffle.id, blockHash);
      
      if (drawResult.success) {
        logger.info(`Raffle ${raffle.id} drawn successfully`, {
          raffleName: raffle.name,
          winner: drawResult.winner?.wallet_address.slice(0, 10) + '...',
          seed: drawResult.seed,
        });
        results.push({
          raffleId: raffle.id,
          raffleName: raffle.name,
          success: true,
          winner: drawResult.winner?.wallet_address,
        });
      } else {
        logger.error(`Failed to draw raffle ${raffle.id}`, {
          raffleName: raffle.name,
          error: drawResult.error,
        });
        results.push({
          raffleId: raffle.id,
          raffleName: raffle.name,
          success: false,
          error: drawResult.error,
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    
    return NextResponse.json({
      success: true,
      message: `Drew ${successCount} of ${rafflesToDraw.length} raffle(s)`,
      rafflesDrawn: successCount,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Cron job failed: auto-draw-raffles', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to auto-draw raffles' },
      { status: 500 }
    );
  }
}
