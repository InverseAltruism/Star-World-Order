/**
 * Star Forge Stats API
 * 
 * GET /api/starforge/stats - Get game statistics
 * 
 * This endpoint returns jackpot pools, treasury balances,
 * recent wins, and player history.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getAllStarForgeJackpots,
  getAllStarForgeTreasury,
  getRecentStarForgeGames,
  getPlayerStarForgeGames,
  getStarForgeStats,
} from '@/lib/db';
import { formatMON } from '@/lib/starforge';
import { logger } from '@/lib/logger';

/**
 * GET /api/starforge/stats
 * 
 * Query params:
 * - playerAddress: (optional) Get player-specific history
 * - limit: (optional) Number of recent games to return (default 20)
 * 
 * Response:
 * {
 *   success: boolean;
 *   stats: {
 *     totalGames: number;
 *     totalWagered: string;
 *     totalPaidOut: string;
 *     houseProfit: string;
 *   };
 *   jackpots: Array<{
 *     tier: string;
 *     poolAmount: string;
 *     lastWinner: string | null;
 *     lastWonAt: string | null;
 *   }>;
 *   treasury: Array<{
 *     tier: string;
 *     balance: string;
 *     totalGames: number;
 *   }>;
 *   recentGames: Array<Game>;
 *   playerGames?: Array<Game>;
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const playerAddress = searchParams.get('playerAddress');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    
    // Get overall stats
    const stats = getStarForgeStats();
    
    // Get jackpot pools
    const jackpots = getAllStarForgeJackpots();
    
    // Get treasury stats
    const treasury = getAllStarForgeTreasury();
    
    // Get recent games
    const recentGames = getRecentStarForgeGames(limit);
    
    // Get player games if address provided
    let playerGames;
    if (playerAddress) {
      playerGames = getPlayerStarForgeGames(playerAddress, limit);
    }
    
    // Format response
    const response: any = {
      success: true,
      stats: {
        totalGames: stats.totalGames,
        totalWagered: stats.totalWagered,
        totalPaidOut: stats.totalPaidOut,
        houseProfit: stats.houseProfit,
      },
      jackpots: jackpots.map(j => ({
        tier: j.tier,
        poolAmount: j.pool_amount,
        poolAmountFormatted: formatMON(BigInt(j.pool_amount)),
        lastWinner: j.last_winner,
        lastWonAt: j.last_won_at,
        totalContributions: j.total_contributions,
        totalPayouts: j.total_payouts,
        winCount: j.win_count,
      })),
      treasury: treasury.map(t => ({
        tier: t.tier,
        balance: t.balance,
        balanceFormatted: formatMON(BigInt(t.balance)),
        totalGames: t.total_games,
        totalWagered: t.total_wagered,
        totalPaidOut: t.total_paid_out,
        houseProfit: t.house_profit,
      })),
      recentGames: recentGames.map(g => ({
        id: g.id,
        playerAddress: g.player_address,
        tier: g.tier,
        pattern: g.pattern,
        multiplier: g.multiplier,
        payout: g.payout,
        payoutFormatted: g.payout ? formatMON(BigInt(g.payout)) : '0 MON',
        isStarHolder: g.is_star_holder === 1,
        completedAt: g.completed_at,
      })),
    };
    
    // Add player games if requested
    if (playerGames) {
      response.playerGames = playerGames.map(g => ({
        id: g.id,
        tier: g.tier,
        entryFee: g.entry_fee,
        entryFeeFormatted: formatMON(BigInt(g.entry_fee)),
        pattern: g.pattern,
        multiplier: g.multiplier,
        payout: g.payout,
        payoutFormatted: g.payout ? formatMON(BigInt(g.payout)) : '0 MON',
        grid: g.grid,
        status: g.status,
        createdAt: g.created_at,
        completedAt: g.completed_at,
        serverSeedHash: g.server_seed_hash,
        isStarHolder: g.is_star_holder === 1,
      }));
    }
    
    logger.info('Stats requested', {
      playerAddress,
      totalGames: stats.totalGames,
    });
    
    return NextResponse.json(response);
  } catch (error) {
    logger.error('Failed to fetch stats', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
