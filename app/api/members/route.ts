/**
 * Members API Route
 * 
 * GET /api/members - Get all Star Skrumpey holders with their holdings and profile data
 * 
 * This endpoint queries the blockchain for all Star Skrumpey ownership
 * and enriches the data with user profiles from the database.
 */

import { NextResponse } from 'next/server';
import { 
  STAR_SKRUMPEY_IDS, 
  SKRUMPEY_CONTRACT_ADDRESS,
  StarTraitVariant,
  STAR_TRAIT_VARIANTS,
} from '@/lib/starSkrumpey';
import { getUserProfilesBatch, getStarSkrumpeyMetadataBatch } from '@/lib/db';
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

// Cache for holder data (5 minute TTL)
let holderCache: {
  data: MemberData[];
  timestamp: number;
} | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface MemberData {
  address: string;
  tokenIds: number[];
  starVariants: string[];
  count: number;
  displayName?: string;
  bio?: string;
  level: number;
  lastSeen?: string;
  displayedBadges?: string[];
}

/**
 * Calculate member level based on holdings and STAR points
 * Level = 1 + floor(sqrt(starCount * 10))
 * More Star Skrumpeys = higher level
 */
function calculateLevel(starCount: number, starPoints: number = 0): number {
  // Base level from NFT count (each NFT contributes significantly)
  const nftContribution = starCount * 10;
  // STAR points contribution (accumulated rewards)
  const pointsContribution = Math.sqrt(starPoints);
  // Combined level calculation
  return 1 + Math.floor(Math.sqrt(nftContribution + pointsContribution));
}

/**
 * Validate and return constellation variant if it's a valid StarTraitVariant
 */
function validateConstellation(value: string | null | undefined): StarTraitVariant | undefined {
  if (!value) return undefined;
  // Use the readonly array to validate
  return (STAR_TRAIT_VARIANTS as readonly string[]).includes(value) 
    ? value as StarTraitVariant 
    : undefined;
}

/**
 * Fetch all Star Skrumpey holders from blockchain
 */
async function fetchAllHolders(): Promise<Map<string, number[]>> {
  if (!SKRUMPEY_CONTRACT_ADDRESS) {
    logger.warn('SKRUMPEY_CONTRACT_ADDRESS not configured');
    return new Map();
  }

  logger.info('Fetching all Star Skrumpey holders', {
    totalIds: STAR_SKRUMPEY_IDS.length,
  });

  const holderMap = new Map<string, number[]>();

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

    // Process results to build holder map
    for (let i = 0; i < ownershipResults.length; i++) {
      const result = ownershipResults[i];
      
      if (result.status === 'success') {
        const owner = String(result.result).toLowerCase();
        const tokenId = STAR_SKRUMPEY_IDS[i];
        
        if (!holderMap.has(owner)) {
          holderMap.set(owner, []);
        }
        holderMap.get(owner)!.push(tokenId);
      }
    }

    logger.info('Holder fetch complete', {
      uniqueHolders: holderMap.size,
      totalTokensFound: Array.from(holderMap.values()).reduce((sum, arr) => sum + arr.length, 0),
    });

    return holderMap;
  } catch (error) {
    logger.error('Failed to fetch holders', { error: String(error) });
    return new Map();
  }
}

export async function GET() {
  try {
    // Check cache first
    const now = Date.now();
    if (holderCache && (now - holderCache.timestamp < CACHE_TTL)) {
      logger.debug('Returning cached holder data');
      return NextResponse.json({
        success: true,
        members: holderCache.data,
        totalMembers: holderCache.data.length,
        totalStarSkrumpeys: holderCache.data.reduce((sum, m) => sum + m.count, 0),
        cached: true,
        timestamp: new Date(holderCache.timestamp).toISOString(),
      });
    }

    // Fetch fresh data
    const holderMap = await fetchAllHolders();
    
    // Collect all unique token IDs from all holders
    const allTokenIds = new Set<number>();
    for (const tokenIds of holderMap.values()) {
      tokenIds.forEach(id => allTokenIds.add(id));
    }
    
    // Batch fetch all user profiles at once (performance optimization)
    const allAddresses = Array.from(holderMap.keys());
    const profilesMap = getUserProfilesBatch(allAddresses);
    
    // Batch fetch all Star Skrumpey metadata from database (accurate constellation data)
    const metadataMap = getStarSkrumpeyMetadataBatch(Array.from(allTokenIds));
    
    // Transform to member data with enriched profile info
    const members: MemberData[] = [];
    
    for (const [address, tokenIds] of holderMap.entries()) {
      // Get user profile from the batch lookup
      const profile = profilesMap.get(address.toLowerCase());
      
      // Get star variants for each token using database metadata (accurate data)
      // Use validateConstellation to ensure proper type safety
      const starVariants = tokenIds
        .map(id => {
          const meta = metadataMap.get(id);
          return validateConstellation(meta?.constellation);
        })
        .filter((v): v is StarTraitVariant => v !== undefined);
      
      // Calculate level based on holdings
      const level = calculateLevel(tokenIds.length);
      
      // Parse displayed badges from profile
      let displayedBadges: string[] | undefined;
      if (profile?.displayed_badges) {
        try {
          const parsed = JSON.parse(profile.displayed_badges);
          if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
            displayedBadges = parsed;
          }
        } catch (e) {
          // Log parsing errors for debugging
          logger.warn('Failed to parse displayed_badges', { 
            address, 
            error: String(e),
          });
        }
      }
      
      members.push({
        address,
        tokenIds: tokenIds.sort((a, b) => a - b),
        starVariants: [...new Set(starVariants)], // Unique variants
        count: tokenIds.length,
        displayName: profile?.display_name || undefined,
        bio: profile?.bio || undefined,
        level,
        lastSeen: profile?.updated_at,
        displayedBadges,
      });
    }
    
    // Sort by count (descending), then by address
    members.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.address.localeCompare(b.address);
    });

    // Update cache
    holderCache = {
      data: members,
      timestamp: now,
    };

    return NextResponse.json({
      success: true,
      members,
      totalMembers: members.length,
      totalStarSkrumpeys: members.reduce((sum, m) => sum + m.count, 0),
      cached: false,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to get members:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch members data' },
      { status: 500 }
    );
  }
}
