/**
 * Raffle System API
 * 
 * GET /api/raffle - Get raffles (active, upcoming, past)
 * POST /api/raffle - Enter a raffle or admin actions
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getRaffles,
  getActiveRaffles,
  getUpcomingRaffles,
  getPastRaffles,
  getRaffleById,
  getRaffleEntries,
  getRaffleTotalEntries,
  getRaffleEntry,
  enterRaffle,
  createRaffle,
  drawRaffleWinner,
  endRaffle,
  cancelRaffle,
  hasViewedRaffleResult,
  markRaffleResultViewed,
  calculateHolderTier,
  HOLDER_TIERS,
  getUserRaffleEntries,
  checkSocialConnections,
  getRaffleEntriesForExport,
} from '@/lib/db';
import { logger } from '@/lib/logger';
import { ADMIN_WALLET_ADDRESS } from '@/lib/config';
import { checkStarOwnershipBatched } from '@/lib/starSkrumpey';

/**
 * GET /api/raffle
 * 
 * Query params:
 * - id: Get specific raffle by ID
 * - type: 'active' | 'upcoming' | 'past' | 'all' | 'history' (default: 'all')
 * - address: User's wallet address (for entry status or history)
 * - export: 'csv' to export raffle entries as CSV (admin only, requires id)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type') || 'all';
    const address = searchParams.get('address');
    const exportFormat = searchParams.get('export');
    
    // Handle user raffle history
    if (type === 'history' && address) {
      const entries = getUserRaffleEntries(address);
      return NextResponse.json({
        success: true,
        entries,
      });
    }
    
    // Handle CSV export (admin only)
    if (exportFormat === 'csv' && id) {
      const entries = getRaffleEntriesForExport(id);
      const raffle = getRaffleById(id);
      
      if (!raffle) {
        return NextResponse.json(
          { success: false, error: 'Raffle not found' },
          { status: 404 }
        );
      }
      
      // Generate CSV content
      const csvHeaders = [
        'Wallet Address',
        'Display Name',
        'Tier',
        'Entries',
        'Star Count',
        'Engagement Bonus',
        'Discord Bonus',
        'Discord Username',
        'X Username',
        'Entered At',
      ].join(',');
      
      // Helper to safely escape CSV values and prevent formula injection
      const escapeCSVValue = (value: string | number): string => {
        const strValue = String(value);
        // Prefix with single quote if starts with potentially dangerous characters
        // This prevents Excel/Sheets from interpreting as formula
        const needsPrefix = /^[=+\-@\t\r]/.test(strValue);
        // Also escape any existing quotes
        const escaped = strValue.replace(/"/g, '""');
        return needsPrefix ? `"'${escaped}"` : `"${escaped}"`;
      };
      
      const csvRows = entries.map(entry => [
        entry.wallet_address,
        entry.display_name || '',
        entry.tier,
        entry.entries_count,
        entry.star_count,
        entry.engagement_bonus,
        entry.discord_bonus,
        entry.discord_username || '',
        entry.x_username || '',
        entry.entered_at,
      ].map(v => escapeCSVValue(v)).join(','));
      
      const csvContent = [csvHeaders, ...csvRows].join('\n');
      
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${raffle.name.replace(/[^a-z0-9]/gi, '_')}_participants.csv"`,
        },
      });
    }
    
    // Get specific raffle by ID
    if (id) {
      const raffle = getRaffleById(id);
      if (!raffle) {
        return NextResponse.json(
          { success: false, error: 'Raffle not found' },
          { status: 404 }
        );
      }
      
      const entries = getRaffleEntries(id);
      const stats = getRaffleTotalEntries(id);
      
      let userEntry = null;
      let hasViewedResult = false;
      let userTier = null;
      let socialConnections = null;
      
      if (address) {
        userEntry = getRaffleEntry(id, address);
        
        // Check if user has viewed result for drawn raffles
        if (raffle.status === 'drawn') {
          hasViewedResult = hasViewedRaffleResult(id, address);
        }
        
        // Get user's current tier (from their Star count)
        try {
          const ownedStars = await checkStarOwnershipBatched(address);
          const tierInfo = calculateHolderTier(ownedStars.length);
          userTier = tierInfo;
        } catch {
          // Ignore errors
        }
        
        // Get user's social connections for requirement checking
        socialConnections = checkSocialConnections(address);
      }
      
      return NextResponse.json({
        success: true,
        raffle,
        entries,
        stats,
        userEntry,
        hasViewedResult,
        userTier,
        socialConnections,
        holderTiers: HOLDER_TIERS,
      });
    }
    
    // Get raffles by type
    let raffles;
    switch (type) {
      case 'active':
        raffles = getActiveRaffles();
        break;
      case 'upcoming':
        raffles = getUpcomingRaffles();
        break;
      case 'past':
        raffles = getPastRaffles();
        break;
      default:
        raffles = getRaffles();
    }
    
    // Include user entry status if address provided
    let rafflesWithUserStatus = raffles;
    if (address) {
      rafflesWithUserStatus = raffles.map(raffle => {
        const userEntry = getRaffleEntry(raffle.id, address);
        return {
          ...raffle,
          userEntry,
        };
      });
    }
    
    return NextResponse.json({
      success: true,
      raffles: rafflesWithUserStatus,
      holderTiers: HOLDER_TIERS,
    });
  } catch (error) {
    logger.error('Failed to fetch raffles', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch raffles' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/raffle
 * 
 * Actions:
 * - enter: Enter a raffle (requires wallet address, raffle ID)
 * - create: Create new raffle (admin only)
 * - draw: Draw winner (admin only)
 * - end: End raffle without drawing (admin only)
 * - cancel: Cancel raffle (admin only)
 * - markViewed: Mark raffle result as viewed
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, walletAddress } = body;
    
    if (!action) {
      return NextResponse.json(
        { success: false, error: 'Action required' },
        { status: 400 }
      );
    }
    
    // Handle different actions
    switch (action) {
      case 'enter': {
        const { raffleId, discordBonus, engagementBonus } = body;
        
        if (!walletAddress || !raffleId) {
          return NextResponse.json(
            { success: false, error: 'Wallet address and raffle ID required' },
            { status: 400 }
          );
        }
        
        // Validate wallet address format
        if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
          return NextResponse.json(
            { success: false, error: 'Invalid wallet address format' },
            { status: 400 }
          );
        }
        
        // Check raffle exists and is active
        const raffle = getRaffleById(raffleId);
        if (!raffle) {
          return NextResponse.json(
            { success: false, error: 'Raffle not found' },
            { status: 404 }
          );
        }
        
        if (raffle.status !== 'active') {
          return NextResponse.json(
            { success: false, error: 'Raffle is not active' },
            { status: 400 }
          );
        }
        
        // Check if raffle hasn't ended
        if (new Date(raffle.end_time) <= new Date()) {
          return NextResponse.json(
            { success: false, error: 'Raffle has ended' },
            { status: 400 }
          );
        }
        
        // Check social requirements
        const socialConnections = checkSocialConnections(walletAddress);
        
        if (raffle.require_x && !socialConnections.hasX) {
          return NextResponse.json(
            { success: false, error: 'X (Twitter) connection required for this raffle. Please connect your X account in your profile settings.' },
            { status: 403 }
          );
        }
        
        if (raffle.require_discord && !socialConnections.hasDiscord) {
          return NextResponse.json(
            { success: false, error: 'Discord connection required for this raffle. Please connect your Discord account in your profile settings.' },
            { status: 403 }
          );
        }
        
        // Verify user owns Star Skrumpeys
        const ownedStars = await checkStarOwnershipBatched(walletAddress);
        if (ownedStars.length === 0) {
          return NextResponse.json(
            { success: false, error: 'You must own at least 1 Star Skrumpey to enter' },
            { status: 403 }
          );
        }
        
        // Enter raffle
        const entry = enterRaffle({
          raffleId,
          walletAddress,
          starCount: ownedStars.length,
          discordBonus,
          engagementBonus,
        });
        
        if (!entry) {
          return NextResponse.json(
            { success: false, error: 'Failed to enter raffle' },
            { status: 500 }
          );
        }
        
        const tierInfo = calculateHolderTier(ownedStars.length);
        
        logger.info('User entered raffle', {
          walletAddress: walletAddress.slice(0, 10) + '...',
          raffleId,
          tier: tierInfo?.tier,
          entries: entry.entries_count,
          engagementBonus: entry.engagement_bonus,
        });
        
        return NextResponse.json({
          success: true,
          entry,
          tierInfo,
          message: `You're in! ${entry.entries_count} ticket${entry.entries_count > 1 ? 's' : ''} added.`,
        });
      }
      
      case 'markViewed': {
        const { raffleId } = body;
        
        if (!walletAddress || !raffleId) {
          return NextResponse.json(
            { success: false, error: 'Wallet address and raffle ID required' },
            { status: 400 }
          );
        }
        
        markRaffleResultViewed(raffleId, walletAddress);
        
        return NextResponse.json({
          success: true,
        });
      }
      
      // Admin actions
      case 'create': {
        // Verify admin
        if (walletAddress?.toLowerCase() !== ADMIN_WALLET_ADDRESS) {
          return NextResponse.json(
            { success: false, error: 'Admin access required' },
            { status: 403 }
          );
        }
        
        const { 
          name, description, prizeDescription, prizeImageUrl, startTime, endTime, 
          discordBonusEnabled, requireX, requireDiscord, tweetUrl 
        } = body;
        
        if (!name || !description || !prizeDescription || !endTime) {
          return NextResponse.json(
            { success: false, error: 'Name, description, prize description, and end time required' },
            { status: 400 }
          );
        }
        
        // Generate unique ID
        const id = `raffle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        
        const raffle = createRaffle({
          id,
          name,
          description,
          prizeDescription,
          prizeImageUrl,
          createdBy: walletAddress,
          startTime: startTime ? new Date(startTime) : new Date(),
          endTime: new Date(endTime),
          discordBonusEnabled,
          requireX,
          requireDiscord,
          tweetUrl,
        });
        
        logger.info('Raffle created', { 
          raffleId: id, 
          name,
          requireX: !!requireX,
          requireDiscord: !!requireDiscord,
          hasTweetUrl: !!tweetUrl,
        });
        
        return NextResponse.json({
          success: true,
          raffle,
        });
      }
      
      case 'draw': {
        // Verify admin
        if (walletAddress?.toLowerCase() !== ADMIN_WALLET_ADDRESS) {
          return NextResponse.json(
            { success: false, error: 'Admin access required' },
            { status: 403 }
          );
        }
        
        const { raffleId, blockHash } = body;
        
        if (!raffleId) {
          return NextResponse.json(
            { success: false, error: 'Raffle ID required' },
            { status: 400 }
          );
        }
        
        // Use provided block hash or generate a pseudo-random one
        const seed = blockHash || `${Date.now()}-${Math.random().toString(36)}`;
        
        const result = drawRaffleWinner(raffleId, seed);
        
        if (!result.success) {
          return NextResponse.json(
            { success: false, error: result.error },
            { status: 400 }
          );
        }
        
        logger.info('Raffle winner drawn', {
          raffleId,
          winner: result.winner?.wallet_address.slice(0, 10) + '...',
          seed: result.seed,
        });
        
        return NextResponse.json({
          success: true,
          winner: result.winner,
          seed: result.seed,
          raffle: getRaffleById(raffleId),
        });
      }
      
      case 'end': {
        // Verify admin
        if (walletAddress?.toLowerCase() !== ADMIN_WALLET_ADDRESS) {
          return NextResponse.json(
            { success: false, error: 'Admin access required' },
            { status: 403 }
          );
        }
        
        const { raffleId } = body;
        
        if (!raffleId) {
          return NextResponse.json(
            { success: false, error: 'Raffle ID required' },
            { status: 400 }
          );
        }
        
        const success = endRaffle(raffleId);
        
        return NextResponse.json({
          success,
          raffle: getRaffleById(raffleId),
        });
      }
      
      case 'cancel': {
        // Verify admin
        if (walletAddress?.toLowerCase() !== ADMIN_WALLET_ADDRESS) {
          return NextResponse.json(
            { success: false, error: 'Admin access required' },
            { status: 403 }
          );
        }
        
        const { raffleId } = body;
        
        if (!raffleId) {
          return NextResponse.json(
            { success: false, error: 'Raffle ID required' },
            { status: 400 }
          );
        }
        
        const success = cancelRaffle(raffleId);
        
        logger.info('Raffle cancelled', { raffleId });
        
        return NextResponse.json({
          success,
          raffle: getRaffleById(raffleId),
        });
      }
      
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error('Failed to process raffle action', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to process raffle action' },
      { status: 500 }
    );
  }
}
