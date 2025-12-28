/**
 * Star Forge Reveal API
 * 
 * POST /api/starforge/reveal - Reveal game result and process payout
 * 
 * This endpoint receives the client seed, generates the grid,
 * matches patterns, and processes the payout.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  generateGrid,
  hashServerSeed,
  findBestPattern,
  calculatePayout,
  TIERS,
} from '@/lib/starforge';
import {
  getStarForgeGame,
  completeStarForgeGame,
  addToStarForgeJackpot,
  awardStarForgeJackpot,
  updateStarForgeTreasury,
} from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * POST /api/starforge/reveal
 * 
 * Body:
 * {
 *   gameId: string;
 *   clientSeed: string;  // Client's random seed
 * }
 * 
 * Response:
 * {
 *   success: boolean;
 *   result: {
 *     grid: number;
 *     pattern: string;
 *     multiplier: number;
 *     payout: string;
 *     isJackpot: boolean;
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gameId, clientSeed } = body;
    
    // Validate inputs
    if (!gameId || typeof gameId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid game ID' },
        { status: 400 }
      );
    }
    
    if (!clientSeed || typeof clientSeed !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid client seed' },
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
    
    // Check if game already revealed
    if (game.status === 'completed') {
      return NextResponse.json(
        { success: false, error: 'Game already revealed' },
        { status: 400 }
      );
    }
    
    // TODO: In production, retrieve server seed from secure storage
    // For now, we need to generate it again (INSECURE - just for development)
    // In production: const serverSeed = await redis.get(`starforge:seed:${gameId}`);
    
    // For development: Generate a deterministic server seed from game data
    // WARNING: This is NOT secure for production!
    const serverSeed = game.server_seed_hash; // TEMPORARY
    
    // Verify server seed hash (in production with real server seed)
    // const computedHash = hashServerSeed(serverSeed);
    // if (computedHash !== game.server_seed_hash) {
    //   return NextResponse.json(
    //     { success: false, error: 'Server seed hash mismatch' },
    //     { status: 400 }
    //   );
    // }
    
    // Generate grid from seeds
    const grid = generateGrid(serverSeed, clientSeed, game.nonce);
    
    // Find best matching pattern
    const patternResult = findBestPattern(grid);
    
    // Check if jackpot (Supernova)
    const isJackpot = patternResult.pattern === 'supernova';
    
    // Calculate payout
    let payout: bigint;
    let payoutStr: string;
    
    if (isJackpot) {
      // Award jackpot pool
      // TODO: Get jackpot pool from database
      // For now, use a placeholder
      payout = BigInt(0); // Should be from jackpotPool
      payoutStr = '0'; // Placeholder
      
      // Award jackpot
      // awardStarForgeJackpot(game.tier, game.player_address, payoutStr);
    } else {
      // Regular payout
      payout = calculatePayout(
        BigInt(game.entry_fee),
        patternResult.multiplier,
        game.is_star_holder === 1
      );
      payoutStr = payout.toString();
    }
    
    // Store result in database
    const completedGame = completeStarForgeGame({
      id: gameId,
      server_seed: serverSeed,
      client_seed: clientSeed,
      grid,
      pattern: patternResult.pattern,
      multiplier: patternResult.multiplier,
      payout: payoutStr,
    });
    
    if (!completedGame) {
      return NextResponse.json(
        { success: false, error: 'Failed to complete game' },
        { status: 500 }
      );
    }
    
    // Update treasury stats
    const houseFee = BigInt(game.entry_fee) - payout;
    updateStarForgeTreasury(
      game.tier,
      game.entry_fee,
      payoutStr,
      houseFee.toString()
    );
    
    logger.info('Star Forge game revealed', {
      gameId,
      pattern: patternResult.pattern,
      multiplier: patternResult.multiplier,
      payout: payoutStr,
      isJackpot,
    });
    
    return NextResponse.json({
      success: true,
      result: {
        grid,
        gridArray: grid.toString(2).padStart(25, '0').split('').map(b => b === '1'),
        pattern: patternResult.pattern,
        multiplier: patternResult.multiplier,
        starCount: patternResult.starCount,
        payout: payoutStr,
        isJackpot,
        serverSeed,
        clientSeed,
        nonce: game.nonce,
      },
    });
  } catch (error) {
    logger.error('Failed to reveal game', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to reveal game' },
      { status: 500 }
    );
  }
}
