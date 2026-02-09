/**
 * Star Forge Commit API
 * 
 * POST /api/starforge/commit - Create a new game commitment
 * 
 * This endpoint generates a server seed and stores the commitment
 * before the client makes any move. This ensures provable fairness.
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  createCommitment,
} from '@/lib/starforge';
import { createStarForgeGame } from '@/lib/db';
import { logger } from '@/lib/logger';
import { parseEther } from 'viem';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { storeStarForgeServerSeed } from '@/lib/starforgeSeedStore';
import { checkStarOwnershipBatched } from '@/lib/starSkrumpey';

// Rate limiting storage (in-memory for now)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute in ms
const MAX_GAMES_PER_WINDOW = 10;

/**
 * Check rate limit for player
 */
function checkRateLimit(playerAddress: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const cutoffTime = now - RATE_LIMIT_WINDOW;
  
  // Get player's recent game timestamps
  let timestamps = rateLimitMap.get(playerAddress) || [];
  
  // Filter out old timestamps
  timestamps = timestamps.filter(t => t > cutoffTime);
  
  // Check if under limit
  const allowed = timestamps.length < MAX_GAMES_PER_WINDOW;
  const remaining = MAX_GAMES_PER_WINDOW - timestamps.length;
  
  if (allowed) {
    // Add current timestamp
    timestamps.push(now);
    rateLimitMap.set(playerAddress, timestamps);
  }
  
  return { allowed, remaining };
}

/**
 * Check if player holds at least one Star Skrumpey NFT.
 */
async function checkStarHolder(playerAddress: string): Promise<boolean> {
  try {
    const ownedStars = await checkStarOwnershipBatched(playerAddress);
    return ownedStars.length > 0;
  } catch (error) {
    logger.warn('Star Forge: failed to verify Star holder status', {
      playerAddress: playerAddress.slice(0, 10) + '...',
      error: String(error),
    });
    return false;
  }
}

/**
 * POST /api/starforge/commit
 * 
 * Body:
 * {
 *   playerAddress: string;  // Wallet address
 *   tier: 'bronze' | 'silver' | 'gold';
 * }
 * 
 * Response:
 * {
 *   success: boolean;
 *   gameId: string;
 *   serverSeedHash: string;
 *   nonce: number;
 *   entryFee: string;
 *   isStarHolder: boolean;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { playerAddress, tier } = body;
    
    // Validate inputs
    if (!playerAddress || typeof playerAddress !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid player address' },
        { status: 400 }
      );
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(playerAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid player address format' },
        { status: 400 }
      );
    }

    const walletAuth = await verifyWalletAccess(request, playerAddress);
    if (!walletAuth.valid) {
      return NextResponse.json(
        { success: false, error: walletAuth.error },
        { status: 401 }
      );
    }
    
    if (!tier || !['bronze', 'silver', 'gold'].includes(tier)) {
      return NextResponse.json(
        { success: false, error: 'Invalid tier. Must be bronze, silver, or gold' },
        { status: 400 }
      );
    }
    
    // Check rate limit
    const rateLimit = checkRateLimit(playerAddress.toLowerCase());
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Rate limit exceeded. Maximum 10 games per minute.',
          remaining: 0
        },
        { status: 429 }
      );
    }
    
    // Check if player holds Star Skrumpey
    const isStarHolder = await checkStarHolder(playerAddress);
    
    // Get entry fee for tier
    const TIER_FEES = {
      bronze: parseEther('45').toString(),
      silver: parseEther('225').toString(),
      gold: parseEther('450').toString(),
    };
    
    const entryFee = TIER_FEES[tier as keyof typeof TIER_FEES];
    
    // Generate commitment (server seed + hash)
    const nonce = Date.now(); // In production, use sequential nonce per player
    const { commitment, serverSeed } = createCommitment(nonce);
    
    // Generate unique game ID
    const gameId = `${playerAddress}-${tier}-${nonce}`;
    
    // Store game in database
    const game = createStarForgeGame({
      id: gameId,
      player_address: playerAddress,
      tier: tier as 'bronze' | 'silver' | 'gold',
      entry_fee: entryFee,
      server_seed_hash: commitment.serverSeedHash,
      nonce: commitment.nonce,
      is_star_holder: isStarHolder,
    });

    // Keep the real seed server-side until reveal.
    storeStarForgeServerSeed(game.id, playerAddress, serverSeed);
    
    // Store server seed temporarily (in production, use Redis or secure storage)
    // For now, we'll include it in the game data but not send to client
    // In production: await redis.setex(`starforge:seed:${gameId}`, 3600, serverSeed);
    
    logger.info('Star Forge game committed', {
      gameId,
      playerAddress,
      tier,
      isStarHolder,
    });
    
    return NextResponse.json({
      success: true,
      gameId,
      serverSeedHash: commitment.serverSeedHash,
      nonce: commitment.nonce,
      entryFee,
      isStarHolder,
      rateLimit: {
        remaining: rateLimit.remaining - 1,
        resetAt: Date.now() + RATE_LIMIT_WINDOW,
      },
    });
  } catch (error) {
    logger.error('Failed to create game commitment', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to create game commitment' },
      { status: 500 }
    );
  }
}
