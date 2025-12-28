/**
 * Star Forge Verify API
 * 
 * GET /api/starforge/verify - Verify a past game result
 * 
 * This endpoint allows players to verify that a game result
 * was fair by regenerating the grid from the seeds.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generateGrid,
  hashServerSeed,
  findBestPattern,
  verifyResult,
} from '@/lib/starforge';
import { getStarForgeGame } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/starforge/verify
 * 
 * Query params:
 * - gameId: Game identifier
 * 
 * Response:
 * {
 *   success: boolean;
 *   verification: {
 *     isValid: boolean;
 *     serverSeed: string;
 *     serverSeedHash: string;
 *     clientSeed: string;
 *     nonce: number;
 *     grid: number;
 *     pattern: string;
 *     multiplier: number;
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get('gameId');
    
    // Validate input
    if (!gameId) {
      return NextResponse.json(
        { success: false, error: 'Game ID required' },
        { status: 400 }
      );
    }
    
    // Get game from database
    const game = getStarForgeGame(gameId);
    if (!game) {
      return NextResponse.json(
        { success: false, error: 'Game not found' },
        { status: 404 }
      );
    }
    
    // Check if game is completed
    if (game.status !== 'completed') {
      return NextResponse.json(
        { success: false, error: 'Game not yet completed' },
        { status: 400 }
      );
    }
    
    // Verify server seed hash
    const computedHash = hashServerSeed(game.server_seed!);
    const hashMatches = computedHash === game.server_seed_hash;
    
    // Regenerate grid
    const regeneratedGrid = generateGrid(
      game.server_seed!,
      game.client_seed!,
      game.nonce
    );
    
    // Check if grid matches
    const gridMatches = regeneratedGrid === game.grid;
    
    // Find pattern again
    const patternResult = findBestPattern(regeneratedGrid);
    const patternMatches = patternResult.pattern === game.pattern;
    const multiplierMatches = patternResult.multiplier === game.multiplier;
    
    // Overall validity
    const isValid = hashMatches && gridMatches && patternMatches && multiplierMatches;
    
    logger.info('Game verification requested', {
      gameId,
      isValid,
      hashMatches,
      gridMatches,
      patternMatches,
      multiplierMatches,
    });
    
    return NextResponse.json({
      success: true,
      verification: {
        isValid,
        checks: {
          serverSeedHash: hashMatches,
          gridRegeneration: gridMatches,
          patternMatch: patternMatches,
          multiplierMatch: multiplierMatches,
        },
        game: {
          serverSeed: game.server_seed,
          serverSeedHash: game.server_seed_hash,
          clientSeed: game.client_seed,
          nonce: game.nonce,
          grid: game.grid,
          regeneratedGrid,
          pattern: game.pattern,
          multiplier: game.multiplier,
          payout: game.payout,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to verify game', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to verify game' },
      { status: 500 }
    );
  }
}
