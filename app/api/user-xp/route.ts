/**
 * User XP API
 * 
 * GET /api/user-xp - Get user's XP and level info
 * POST /api/user-xp - Add XP to user (admin use)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getUserXP,
  getXPProgress,
  getXPLeaderboard,
  addUserXP,
} from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/user-xp
 * Query params:
 * - address: wallet address (required for individual user)
 * - leaderboard: if true, return top XP holders
 * - limit: limit for leaderboard (default 10)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const showLeaderboard = searchParams.get('leaderboard') === 'true';
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    // Return leaderboard
    if (showLeaderboard) {
      const leaderboard = getXPLeaderboard(Math.min(limit, 100));
      return NextResponse.json({
        success: true,
        leaderboard,
      });
    }

    // Return specific user's XP
    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Missing address parameter' },
        { status: 400 }
      );
    }

    const userXP = getUserXP(address);
    const xpProgress = getXPProgress(userXP.total_xp);

    return NextResponse.json({
      success: true,
      userXP: {
        ...userXP,
        ...xpProgress,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch user XP', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user XP' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user-xp
 * Body:
 * - walletAddress: user's wallet address (required)
 * - xpAmount: amount of XP to add (required)
 * - reason: reason for XP addition (optional, for logging)
 * 
 * SECURITY NOTE: This endpoint is for admin/internal use only.
 * XP should normally be awarded through quest completion (/api/quests).
 * In production, this endpoint should be:
 * 1. Protected with authentication (admin only)
 * 2. Rate limited to prevent abuse
 * 3. Potentially restricted to server-side calls only
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, xpAmount, reason } = body;

    if (!walletAddress || typeof xpAmount !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: walletAddress, xpAmount' },
        { status: 400 }
      );
    }

    if (xpAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'xpAmount must be positive' },
        { status: 400 }
      );
    }
    
    // Limit max XP per request to prevent abuse
    if (xpAmount > 1000) {
      return NextResponse.json(
        { success: false, error: 'xpAmount exceeds maximum allowed (1000)' },
        { status: 400 }
      );
    }

    // Add XP to user
    const userXP = addUserXP(walletAddress, xpAmount);
    const xpProgress = getXPProgress(userXP.total_xp);

    logger.info('XP added to user', {
      walletAddress,
      xpAmount,
      reason: reason || 'manual',
      newTotal: userXP.total_xp,
      newLevel: userXP.level,
    });

    return NextResponse.json({
      success: true,
      message: `Added ${xpAmount} XP`,
      userXP: {
        ...userXP,
        ...xpProgress,
      },
    });
  } catch (error) {
    logger.error('Failed to add user XP', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to add user XP' },
      { status: 500 }
    );
  }
}
