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
import { validateCronSecret } from '@/lib/cronAuth';

/**
 * Fetch a recent block hash as optional additional entropy.
 * Returns undefined if the chain is unreachable — drawRaffleWinner
 * uses server-side CSPRNG as its primary entropy source, so this
 * is supplementary, not required.
 */
async function getBlockHash(): Promise<string | undefined> {
  try {
    const client = await getResilientClient();
    const block = await client.getBlock({ blockTag: 'latest' });
    return block.hash || undefined;
  } catch (error) {
    logger.warn('Failed to get block hash, draw will use server-side entropy only', { error: String(error) });
    return undefined;
  }
}

export async function GET(request: Request) {
  const auth = validateCronSecret(request, 'auto-draw-raffles');
  if (!auth.valid) {
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
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
