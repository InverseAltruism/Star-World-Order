/**
 * Holder Stats API Route
 * 
 * GET /api/holder-stats - Get holder count history for charts
 * 
 * Query Parameters:
 * - constellation: 'all' | specific constellation name (default: 'all')
 * - timeRange: '1H' | '1D' | '1W' (default: '1D')
 *   - 1H: Last 24 hours (hourly data)
 *   - 1D: Last 30 days (daily data)
 *   - 1W: Last 90 days (weekly data)
 * 
 * This endpoint returns historical holder count data for charting,
 * and also records a new snapshot if enough time has passed since the last one.
 */

import { NextResponse } from 'next/server';
import { 
  getHolderSnapshots, 
  insertHolderSnapshotsBatch, 
  getLatestHolderSnapshot,
  HolderSnapshot,
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

// Minimum time between snapshots (5 minutes)
const MIN_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

// All constellation types
const CONSTELLATIONS = [
  'all', 'aether', 'spectra', 'solveil', 'nebulu', 'chroma',
  'rose', 'monflare', 'auracore', 'parallel', 'prime'
] as const;

export interface HolderStatsResponse {
  success: boolean;
  data?: {
    constellation: string;
    currentHolders: number;
    history: Array<{
      timestamp: number;
      holderCount: number;
    }>;
    lastUpdated: string;
  };
  error?: string;
}

/**
 * Fetch current holder data from blockchain and calculate counts per constellation.
 */
async function fetchCurrentHolderData(): Promise<{
  totalHolders: number;
  holdersByConstellation: Record<string, number>;
}> {
  if (!SKRUMPEY_CONTRACT_ADDRESS) {
    logger.warn('SKRUMPEY_CONTRACT_ADDRESS not configured');
    return { totalHolders: 0, holdersByConstellation: {} };
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

    // Valid constellation types (skip tokens with invalid/unknown constellations)
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
    };
  } catch (error) {
    logger.error('Failed to fetch holder data', { error: String(error) });
    return { totalHolders: 0, holdersByConstellation: {} };
  }
}

/**
 * Check if we should record a new snapshot based on time since last one.
 */
function shouldRecordSnapshot(lastSnapshot: HolderSnapshot | null): boolean {
  if (!lastSnapshot) return true;
  
  const lastTime = new Date(lastSnapshot.created_at).getTime();
  const now = Date.now();
  
  return (now - lastTime) >= MIN_SNAPSHOT_INTERVAL_MS;
}

/**
 * Check if a value is a valid constellation
 */
function isValidConstellation(value: string): boolean {
  return (CONSTELLATIONS as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const constellation = searchParams.get('constellation')?.toLowerCase() || 'all';
    const timeRange = searchParams.get('timeRange') || '1H';
    
    // Validate constellation
    if (!isValidConstellation(constellation)) {
      return NextResponse.json(
        { success: false, error: `Invalid constellation: ${constellation}` },
        { status: 400 }
      );
    }
    
    // Validate time range
    if (timeRange !== '1H' && timeRange !== '1D' && timeRange !== '1W') {
      return NextResponse.json(
        { success: false, error: `Invalid timeRange: ${timeRange}. Use '1H', '1D', or '1W'` },
        { status: 400 }
      );
    }
    
    // Check if we need to record a new snapshot
    const lastAllSnapshot = getLatestHolderSnapshot('all');
    
    if (shouldRecordSnapshot(lastAllSnapshot)) {
      logger.info('Recording new holder snapshot');
      
      // Fetch current data from blockchain
      const { totalHolders, holdersByConstellation } = await fetchCurrentHolderData();
      
      if (totalHolders > 0) {
        // Prepare batch insert
        const snapshots = [
          { constellation: 'all', holderCount: totalHolders },
          ...Object.entries(holdersByConstellation).map(([c, count]) => ({
            constellation: c,
            holderCount: count,
          })),
        ];
        
        insertHolderSnapshotsBatch(snapshots);
        logger.info('Recorded holder snapshots', { totalHolders, constellations: Object.keys(holdersByConstellation).length });
      }
    }
    
    // Get historical data based on time range
    // 1H = last 24 hours (hourly data), 1D = last 30 days (daily data), 1W = last 90 days (weekly data)
    let hoursBack: number;
    if (timeRange === '1H') {
      hoursBack = 24;
    } else if (timeRange === '1D') {
      hoursBack = 24 * 30; // 30 days
    } else {
      hoursBack = 24 * 90; // 90 days for 1W
    }
    const history = getHolderSnapshots(constellation, hoursBack, 200);
    
    // Get current holder count
    const latestSnapshot = getLatestHolderSnapshot(constellation);
    const currentHolders = latestSnapshot?.holder_count || 0;
    
    // Convert to response format
    const historyData = history.map(snapshot => ({
      timestamp: new Date(snapshot.created_at).getTime(),
      holderCount: snapshot.holder_count,
    }));
    
    return NextResponse.json({
      success: true,
      data: {
        constellation,
        currentHolders,
        history: historyData,
        lastUpdated: latestSnapshot?.created_at || new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to get holder stats:', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch holder stats' },
      { status: 500 }
    );
  }
}
