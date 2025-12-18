/**
 * Cron Job: Refresh Holder Data
 * 
 * GET /api/cron/refresh-holders - Refresh holder data and record snapshots
 * 
 * This endpoint should be called periodically (e.g., every 4 hours) to:
 * 1. Fetch fresh holder data from the blockchain
 * 2. Record new holder snapshots in the database for chart data
 * 3. Clean up old snapshots (older than 7 days)
 * 
 * Security: This endpoint validates a CRON_SECRET token to prevent unauthorized access.
 * Set CRON_SECRET environment variable in production.
 * 
 * Usage:
 * - Systemd timer: Call via curl with Authorization header
 * - Vercel cron: Add to vercel.json crons configuration
 * - Manual: curl -H "Authorization: Bearer <CRON_SECRET>" https://your-domain/api/cron/refresh-holders
 */

import { NextResponse } from 'next/server';
import { 
  insertHolderSnapshotsBatch, 
  getLatestHolderSnapshot,
  cleanupOldHolderSnapshots,
} from '@/lib/db';
import { 
  STAR_SKRUMPEY_IDS, 
  SKRUMPEY_CONTRACT_ADDRESS,
} from '@/lib/starSkrumpey';
import { getStarSkrumpeyMetadataBatch } from '@/lib/db';
import { getResilientClient, retryWithBackoff } from '@/lib/rpcClient';
import { logger } from '@/lib/logger';

// ERC721 ABI for ownership check
const ERC721_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Minimum time between refreshes (1 hour)
const MIN_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

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
 * Fetch current holder data from blockchain and calculate counts per constellation.
 */
async function fetchCurrentHolderData(): Promise<{
  totalHolders: number;
  holdersByConstellation: Record<string, number>;
  holderAddresses: string[];
}> {
  if (!SKRUMPEY_CONTRACT_ADDRESS) {
    logger.warn('SKRUMPEY_CONTRACT_ADDRESS not configured');
    return { totalHolders: 0, holdersByConstellation: {}, holderAddresses: [] };
  }

  try {
    const client = await getResilientClient();

    // Batch check ownership of all Star Skrumpey IDs using multicall
    const ownershipResults = await retryWithBackoff(async () => {
      return await client.multicall({
        contracts: STAR_SKRUMPEY_IDS.map(tokenId => ({
          address: SKRUMPEY_CONTRACT_ADDRESS as `0x${string}`,
          abi: ERC721_ABI,
          functionName: 'ownerOf',
          args: [BigInt(tokenId)],
        })),
        allowFailure: true,
      });
    });

    // Get metadata for constellation info
    const metadataMap = getStarSkrumpeyMetadataBatch([...STAR_SKRUMPEY_IDS]);

    // Track unique holders and count by constellation
    const holderAddresses = new Set<string>();
    const holdersByConstellation: Record<string, Set<string>> = {};

    // Valid constellation types
    const validConstellations = new Set([
      'aether', 'spectra', 'solveil', 'nebulu', 'chroma',
      'rose', 'monflare', 'auracore', 'parallel', 'prime'
    ]);

    for (let i = 0; i < ownershipResults.length; i++) {
      const result = ownershipResults[i];
      
      if (result.status === 'success') {
        const owner = String(result.result).toLowerCase();
        const tokenId = STAR_SKRUMPEY_IDS[i];
        const constellation = metadataMap.get(tokenId)?.constellation?.toLowerCase();
        
        holderAddresses.add(owner);
        
        // Only track valid constellation types
        if (constellation && validConstellations.has(constellation)) {
          if (!holdersByConstellation[constellation]) {
            holdersByConstellation[constellation] = new Set();
          }
          holdersByConstellation[constellation].add(owner);
        }
      }
    }

    // Convert sets to counts
    const countsByConstellation: Record<string, number> = {};
    for (const [constellation, holders] of Object.entries(holdersByConstellation)) {
      countsByConstellation[constellation] = holders.size;
    }

    return {
      totalHolders: holderAddresses.size,
      holdersByConstellation: countsByConstellation,
      holderAddresses: Array.from(holderAddresses),
    };
  } catch (error) {
    logger.error('Failed to fetch holder data', { error: String(error) });
    return { totalHolders: 0, holdersByConstellation: {}, holderAddresses: [] };
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
    logger.info('Cron job started: refresh-holders');
    
    // Check when we last refreshed to avoid too-frequent updates
    const lastSnapshot = getLatestHolderSnapshot('all');
    const now = Date.now();
    
    if (lastSnapshot) {
      const lastRefreshTime = new Date(lastSnapshot.created_at).getTime();
      const timeSinceLastRefresh = now - lastRefreshTime;
      
      if (timeSinceLastRefresh < MIN_REFRESH_INTERVAL_MS) {
        const minutesRemaining = Math.ceil((MIN_REFRESH_INTERVAL_MS - timeSinceLastRefresh) / 60000);
        logger.info('Skipping refresh - too soon since last update', { 
          minutesRemaining,
          lastRefresh: lastSnapshot.created_at,
        });
        
        return NextResponse.json({
          success: true,
          skipped: true,
          message: `Skipped - last refresh was ${Math.floor(timeSinceLastRefresh / 60000)} minutes ago. Minimum interval is ${MIN_REFRESH_INTERVAL_MS / 60000} minutes.`,
          lastRefresh: lastSnapshot.created_at,
          nextRefreshAvailable: new Date(lastRefreshTime + MIN_REFRESH_INTERVAL_MS).toISOString(),
        });
      }
    }
    
    // Fetch current holder data from blockchain
    logger.info('Fetching holder data from blockchain...');
    const { totalHolders, holdersByConstellation, holderAddresses } = await fetchCurrentHolderData();
    
    if (totalHolders === 0) {
      logger.warn('No holders found - possible RPC issue');
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch holder data from blockchain',
      }, { status: 500 });
    }
    
    // Prepare and insert holder snapshots
    const snapshots = [
      { constellation: 'all', holderCount: totalHolders },
      ...Object.entries(holdersByConstellation).map(([c, count]) => ({
        constellation: c,
        holderCount: count,
      })),
    ];
    
    insertHolderSnapshotsBatch(snapshots);
    
    logger.info('Recorded holder snapshots', { 
      totalHolders, 
      constellations: Object.keys(holdersByConstellation).length,
      snapshotsRecorded: snapshots.length,
    });
    
    // Cleanup old snapshots (keep last 7 days)
    cleanupOldHolderSnapshots();
    logger.info('Cleaned up old holder snapshots');
    
    return NextResponse.json({
      success: true,
      message: 'Holder data refreshed successfully',
      data: {
        totalHolders,
        uniqueWallets: holderAddresses.length,
        constellationCounts: holdersByConstellation,
        snapshotsRecorded: snapshots.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Cron job failed: refresh-holders', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to refresh holder data' },
      { status: 500 }
    );
  }
}
