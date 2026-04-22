/**
 * Star Skrumpey Access Control
 * 
 * This module handles the logic for determining if a wallet holds a Star Skrumpey NFT.
 * Star Skrumpeys are Skrumpey NFTs that have the "star" trait, granting access to the DAO.
 * 
 * Skrumpeys Contract Address: See SKRUMPEY_CONTRACT_ADDRESS constant below
 * Explorer: https://monadscan.com/address/{SKRUMPEY_CONTRACT_ADDRESS}
 * 
 * Star Traits - Constellation Variants:
 * - aether: Ethereal cosmic energy
 * - spectra: Spectral light patterns
 * - solveil: Solar essence
 * - nebulu: Nebula-infused
 * - chroma: Chromatic brilliance
 * - rose: Rose-tinted stardust
 * - monflare: Monad flare energy
 * - auracore: Core aura manifestation
 * - parallel: Parallel dimension aligned
 * - prime: Prime constellation
 * 
 * Access Control Logic:
 * 1. Check if user owns any Skrumpey NFTs
 * 2. For each owned NFT, check if token ID is in the STAR_SKRUMPEY_IDS allow-list
 * 3. Only holders of NFTs with star traits get DAO access
 * 4. In development mode with NEXT_PUBLIC_DEV_ACCESS_ENABLED=true, all connected wallets get access
 */

import { createPublicClient, http } from 'viem';
import { monad } from './wagmi';
import { getResilientClient, retryWithBackoff } from './rpcClient';
import { logger } from './logger';
import { STAR_CONSTELLATION_MAP } from '../data/starConstellationData';

/**
 * Star Skrumpey Token IDs - Allow-list of token IDs with the Star trait
 * 
 * These token IDs have been identified as having the Star constellation trait.
 * Total: 333 Star Skrumpeys
 * 
 * IPFS Metadata: bafybeibs4foulw6giemwwxwye2qtc3bd2lx34va6c3lpkjvsweevxudsjm
 * IPFS Images: bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu
 * 
 * Location: This list was generated from constellation_token_ids.txt
 * Last updated: December 2024
 */
export const STAR_SKRUMPEY_IDS: readonly number[] = [
  3, 17, 20, 23, 38, 40, 60, 84, 96, 106, 108, 118, 120, 141, 149, 164, 180, 191, 204, 206,
  211, 226, 258, 270, 271, 274, 294, 332, 338, 339, 341, 346, 357, 362, 368, 406, 421, 431,
  439, 442, 456, 461, 511, 533, 547, 558, 562, 563, 567, 588, 594, 596, 627, 629, 643, 650,
  652, 659, 672, 675, 680, 693, 701, 704, 705, 709, 710, 714, 717, 726, 753, 759, 760, 762,
  775, 794, 800, 803, 804, 806, 807, 829, 841, 845, 850, 854, 857, 870, 877, 880, 888, 890,
  893, 905, 909, 918, 933, 950, 951, 960, 962, 984, 988, 1003, 1015, 1022, 1043, 1048, 1049,
  1052, 1059, 1075, 1096, 1101, 1103, 1108, 1118, 1132, 1139, 1142, 1152, 1163, 1197, 1202,
  1210, 1222, 1228, 1235, 1250, 1284, 1287, 1310, 1342, 1358, 1362, 1369, 1370, 1374, 1377,
  1407, 1417, 1419, 1429, 1459, 1461, 1475, 1487, 1495, 1507, 1516, 1517, 1522, 1537, 1540,
  1547, 1548, 1557, 1564, 1578, 1594, 1601, 1603, 1604, 1612, 1617, 1634, 1636, 1651, 1655,
  1672, 1681, 1700, 1702, 1716, 1756, 1766, 1782, 1791, 1795, 1799, 1804, 1807, 1814, 1824,
  1830, 1841, 1864, 1868, 1874, 1917, 1931, 1942, 1947, 1968, 1978, 1987, 1988, 1993, 2010,
  2041, 2043, 2058, 2064, 2081, 2084, 2093, 2128, 2131, 2137, 2146, 2165, 2183, 2185, 2198,
  2201, 2207, 2210, 2239, 2240, 2242, 2258, 2260, 2276, 2278, 2281, 2289, 2294, 2295, 2317,
  2325, 2346, 2356, 2397, 2402, 2421, 2446, 2454, 2460, 2464, 2466, 2470, 2480, 2489, 2497,
  2526, 2528, 2536, 2537, 2548, 2558, 2563, 2574, 2585, 2596, 2597, 2599, 2610, 2614, 2620,
  2634, 2635, 2645, 2660, 2667, 2682, 2689, 2694, 2722, 2729, 2730, 2754, 2756, 2763, 2781,
  2785, 2789, 2825, 2835, 2842, 2844, 2858, 2862, 2867, 2876, 2891, 2901, 2935, 2958, 2970,
  2985, 2987, 2992, 2999, 3022, 3035, 3056, 3073, 3083, 3096, 3101, 3117, 3134, 3144, 3146,
  3159, 3166, 3169, 3176, 3189, 3199, 3205, 3206, 3211, 3219, 3221, 3222, 3227, 3258, 3263,
  3266, 3267, 3268, 3271, 3279, 3284, 3288, 3294, 3295, 3298, 3311, 3319, 3329, 3332,
] as const;

// Create a Set for O(1) lookup performance
const STAR_SKRUMPEY_ID_SET = new Set(STAR_SKRUMPEY_IDS);

// Export the Set for use in other modules
export const STAR_SKRUMPEY_IDS_SET = STAR_SKRUMPEY_ID_SET;

/**
 * Check if a token ID is a Star Skrumpey (has the Star trait)
 * Uses allow-list for fast O(1) lookup
 */
export function isStarSkrumpeyId(tokenId: number): boolean {
  return STAR_SKRUMPEY_ID_SET.has(tokenId);
}

/**
 * Get the star constellation variant for a token ID from static map
 * 
 * ⚠️ NOTE: This returns data from the static STAR_CONSTELLATION_MAP which may be
 * placeholder data. For accurate constellation information, prefer fetching
 * metadata from /api/metadata which reads directly from IPFS.
 * 
 * The ProfileCard component has been updated to use IPFS metadata as the
 * source of truth with this function as a fallback.
 */
export function getStarVariantForTokenId(tokenId: number): StarTraitVariant | undefined {
  if (!isStarSkrumpeyId(tokenId)) {
    return undefined;
  }
  
  // Return from static map (may be placeholder data - prefer /api/metadata for accuracy)
  return STAR_CONSTELLATION_MAP[tokenId] as StarTraitVariant | undefined;
}

/**
 * Star trait constellation variants with rarity information
 * 
 * Rarity distribution:
 * - aether: 52 NFTs
 * - spectra: 52 NFTs
 * - solveil: 46 NFTs
 * - nebulu: 44 NFTs
 * - chroma: 42 NFTs
 * - rose: 36 NFTs
 * - monflare: 27 NFTs
 * - auracore: 23 NFTs
 * - parallel: 10 NFTs
 * - prime: 1 NFT (1 of 1)
 */
export const STAR_TRAIT_VARIANTS = [
  'aether',
  'spectra',
  'solveil',
  'nebulu',
  'chroma',
  'rose',
  'monflare',
  'auracore',
  'parallel',
  'prime',
] as const;

/**
 * Rarity counts for each constellation type
 */
export const CONSTELLATION_RARITY: Record<StarTraitVariant, number> = {
  aether: 52,
  spectra: 52,
  solveil: 46,
  nebulu: 44,
  chroma: 42,
  rose: 36,
  monflare: 27,
  auracore: 23,
  parallel: 10,
  prime: 1,
};

export type StarTraitVariant = typeof STAR_TRAIT_VARIANTS[number];

// Interface for NFT metadata
interface NFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  attributes?: Array<{
    trait_type: string;
    value: string;
  }>;
}

// Interface for owned token info
export interface OwnedToken {
  tokenId: number;
  hasStar: boolean;
  starVariant?: StarTraitVariant;
}

// Skrumpey NFT Contract Address on Monad
// Must be configured in .env.local before production deployment
export const SKRUMPEY_CONTRACT_ADDRESS: string | undefined = process.env.NEXT_PUBLIC_SKRUMPEY_CONTRACT;

// IPFS base URL for Skrumpey images (fallback only)
export const SKRUMPEY_IPFS_BASE = 'https://ipfs-proxy.magiceden.dev/ipfs/bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu';

/**
 * Get the image URL for a Skrumpey token.
 * Prefers self-hosted assets at /assets/skrumpey/{id}.png.
 * Falls back to IPFS proxy for GIF variants.
 */
export function getSkrumpeyImageUrl(tokenId: number, isGif: boolean = false): string {
  if (isGif) {
    return `${SKRUMPEY_IPFS_BASE}/${tokenId}.gif`;
  }
  return `/assets/skrumpey/${tokenId}.png`;
}

// Development access override - only works in development mode
// Set NEXT_PUBLIC_DEV_ACCESS_ENABLED=true in .env.local to enable
export const DEV_ACCESS_ENABLED = 
  process.env.NODE_ENV === 'development' && 
  process.env.NEXT_PUBLIC_DEV_ACCESS_ENABLED === 'true';

// ERC721 Enumerable ABI for ownership and metadata checks
const ERC721_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }],
    name: 'tokenOfOwnerByIndex',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Check if a trait value is a star trait
 */
export function isStarTrait(traitValue: string): boolean {
  const normalized = traitValue.toLowerCase();
  return STAR_TRAIT_VARIANTS.some(variant => normalized.includes(variant));
}

/**
 * Get the star variant from a trait value
 */
export function getStarVariant(traitValue: string): StarTraitVariant | undefined {
  const normalized = traitValue.toLowerCase();
  return STAR_TRAIT_VARIANTS.find(variant => normalized.includes(variant));
}

/**
 * Check if NFT metadata contains a star trait
 */
export function hasStarTraitInMetadata(metadata: NFTMetadata): { hasStar: boolean; variant?: StarTraitVariant } {
  if (!metadata.attributes) {
    return { hasStar: false };
  }

  // Check for star trait in attributes
  for (const attr of metadata.attributes) {
    // Check if trait_type is "star" or "constellation" or similar
    const traitType = attr.trait_type.toLowerCase();
    const traitValue = attr.value.toLowerCase();
    
    // Look for star traits in trait_type or value
    if (traitType.includes('star') || traitType.includes('constellation') || traitType === 'type') {
      const variant = getStarVariant(traitValue);
      if (variant) {
        return { hasStar: true, variant };
      }
      // Check if the value directly indicates star status
      if (STAR_TRAIT_VARIANTS.some(v => traitValue.includes(v))) {
        return { hasStar: true, variant: getStarVariant(traitValue) };
      }
    }
    
    // Also check if any attribute value contains star trait variants
    if (STAR_TRAIT_VARIANTS.some(v => traitValue.includes(v))) {
      return { hasStar: true, variant: getStarVariant(traitValue) };
    }
  }

  return { hasStar: false };
}

/**
 * Fetch NFT metadata from tokenURI
 * Uses a 5-second timeout for better UX responsiveness
 */
async function fetchMetadata(tokenURI: string): Promise<NFTMetadata | null> {
  try {
    // Handle IPFS URIs
    let url = tokenURI;
    if (tokenURI.startsWith('ipfs://')) {
      url = tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/');
    }
    // Handle data URIs (base64 encoded JSON)
    if (tokenURI.startsWith('data:application/json;base64,')) {
      const base64Data = tokenURI.replace('data:application/json;base64,', '');
      const jsonStr = atob(base64Data);
      return JSON.parse(jsonStr);
    }
    if (tokenURI.startsWith('data:application/json,')) {
      const jsonStr = decodeURIComponent(tokenURI.replace('data:application/json,', ''));
      return JSON.parse(jsonStr);
    }

    const response = await fetch(url, { 
      signal: AbortSignal.timeout(5000) // 5 second timeout for better UX
    });
    if (!response.ok) {
      console.warn(`Failed to fetch metadata from ${url}: ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn('Error fetching metadata:', error);
    return null;
  }
}

/**
 * Process items in batches with concurrency control
 * Prevents overwhelming IPFS gateways or HTTP endpoints
 */
async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 5
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}

/**
 * In-memory cache for Star ownership checks to prevent duplicate RPC calls
 * when multiple raffles/endpoints fetch data in parallel for the same address.
 */
const starOwnershipCache = new Map<string, { tokens: OwnedToken[]; timestamp: number }>();
const STAR_OWNERSHIP_CACHE_TTL = 30 * 1000; // 30 seconds - short TTL for real-time accuracy

/**
 * Check Star Skrumpey ownership using batched multicall
 * 
 * This is the primary strategy (Tier 1) that checks ownership of all 333 known
 * Star Skrumpey token IDs in a single batched multicall. This approach makes
 * O(1) RPC calls regardless of how many NFTs the user owns, avoiding rate limiting.
 * 
 * Results are cached for 30 seconds to prevent duplicate RPC calls when
 * multiple parallel API requests check the same address.
 * 
 * @param address - The wallet address to check
 * @returns Array of owned Star Skrumpey tokens
 */
export async function checkStarOwnershipBatched(address: string): Promise<OwnedToken[]> {
  if (!SKRUMPEY_CONTRACT_ADDRESS) {
    logger.warn('SKRUMPEY_CONTRACT_ADDRESS not configured');
    return [];
  }

  const normalizedAddress = address.toLowerCase();
  
  // Check cache first
  const cached = starOwnershipCache.get(normalizedAddress);
  if (cached && Date.now() - cached.timestamp < STAR_OWNERSHIP_CACHE_TTL) {
    logger.debug('Returning cached Star ownership', {
      address: address.slice(0, 10) + '...',
      ownedStars: cached.tokens.length,
    });
    return cached.tokens;
  }

  logger.info('Checking Star ownership via batched multicall', { 
    address: address.slice(0, 10) + '...',
    totalStarIds: STAR_SKRUMPEY_IDS.length,
  });

  try {
    // Get a resilient client with fallback support
    const client = await getResilientClient();

    // Batch check ownership of all 333 Star Skrumpey IDs using multicall
    const ownershipChecks = await retryWithBackoff(async () => {
      logger.debug('Executing multicall for Star ownership', {
        contractCount: STAR_SKRUMPEY_IDS.length,
      });

      return await client.multicall({
        contracts: STAR_SKRUMPEY_IDS.map(tokenId => ({
          address: SKRUMPEY_CONTRACT_ADDRESS as `0x${string}`,
          abi: ERC721_ABI,
          functionName: 'ownerOf',
          args: [BigInt(tokenId)],
        })),
        allowFailure: true, // Allow individual calls to fail (token might not exist)
      });
    });

    // Filter to find which Star Skrumpeys are owned by the connected wallet
    const ownedStars: OwnedToken[] = [];
    
    for (let i = 0; i < ownershipChecks.length; i++) {
      const result = ownershipChecks[i];
      
      // Check if the call succeeded and the owner matches
      // Viem's multicall with allowFailure returns { status: 'success', result: T } | { status: 'failure', error: Error }
      if (result.status === 'success') {
        // For ownerOf, result is the owner address (string)
        const owner = String(result.result).toLowerCase();
        if (owner === address.toLowerCase()) {
          const tokenId = STAR_SKRUMPEY_IDS[i];
          ownedStars.push({
            tokenId,
            hasStar: true,
            starVariant: getStarVariantForTokenId(tokenId),
          });
        }
      }
    }

    logger.info('Star ownership check complete', {
      address: address.slice(0, 10) + '...',
      ownedStars: ownedStars.length,
      tokenIds: ownedStars.map(t => t.tokenId).join(', '),
    });

    // Cache the result
    starOwnershipCache.set(normalizedAddress, { tokens: ownedStars, timestamp: Date.now() });

    return ownedStars;
  } catch (error) {
    logger.error('Failed to check Star ownership via batched multicall', {
      address: address.slice(0, 10) + '...',
      error: String(error),
    });
    
    // Return empty array on failure - graceful degradation
    return [];
  }
}

/**
 * Fetch user's Skrumpey NFTs from the blockchain (Legacy Method)
 * 
 * NOTE: This is the old implementation that causes rate limiting issues.
 * It's kept for backward compatibility and as a fallback, but the new
 * checkStarOwnershipBatched() function should be preferred.
 * 
 * Uses the STAR_SKRUMPEY_IDS allow-list for fast Star trait detection
 * This avoids rate limiting from metadata fetches
 * 
 * @param address - The wallet address to check
 * @returns Array of owned tokens with star trait information
 */
export async function fetchUserSkrumpeys(address: string): Promise<OwnedToken[]> {
  // If no contract address is configured, return empty array
  if (!SKRUMPEY_CONTRACT_ADDRESS) {
    console.warn('SKRUMPEY_CONTRACT_ADDRESS not configured');
    return [];
  }

  try {
    const client = createPublicClient({
      chain: monad,
      transport: http(),
    });

    // Get user's balance
    const balance = await client.readContract({
      address: SKRUMPEY_CONTRACT_ADDRESS as `0x${string}`,
      abi: ERC721_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    });

    const balanceNum = Number(balance);
    if (balanceNum === 0) {
      return [];
    }

    // Create array of indices to fetch
    const indices = Array.from({ length: balanceNum }, (_, i) => i);
    
    // Process tokens in batches to reduce RPC load
    const BATCH_SIZE = 5;
    
    const fetchTokenData = async (index: number): Promise<OwnedToken | null> => {
      try {
        // Get token ID at index
        const tokenId = await client.readContract({
          address: SKRUMPEY_CONTRACT_ADDRESS as `0x${string}`,
          abi: ERC721_ABI,
          functionName: 'tokenOfOwnerByIndex',
          args: [address as `0x${string}`, BigInt(index)],
        });

        const tokenIdNum = Number(tokenId);
        
        // Use allow-list for fast Star trait detection (avoids metadata fetches)
        const hasStar = isStarSkrumpeyId(tokenIdNum);
        
        return {
          tokenId: tokenIdNum,
          hasStar,
          starVariant: hasStar ? getStarVariantForTokenId(tokenIdNum) : undefined,
        };
      } catch {
        return null;
      }
    };

    // Fetch tokens in batches
    const results = await processBatch(indices, fetchTokenData, BATCH_SIZE);
    return results.filter((token): token is OwnedToken => token !== null);
  } catch (error) {
    console.error('Error fetching user Skrumpeys:', error);
    return [];
  }
}

/**
 * Check if any of the owned tokens have the star trait
 */
export function hasStarSkrumpey(tokens: OwnedToken[]): boolean {
  return tokens.some(token => token.hasStar);
}

/**
 * Get all Star Skrumpeys from owned tokens
 */
export function getStarSkrumpeys(tokens: OwnedToken[]): OwnedToken[] {
  return tokens.filter(token => token.hasStar);
}

/**
 * Check if a wallet address has DAO access (holds at least one Star Skrumpey)
 * 
 * Uses the new batched multicall approach to avoid rate limiting.
 * 
 * Note: Regular Skrumpey holders (without Star trait) do NOT get access.
 * Only holders of NFTs with star traits in their metadata are granted access.
 * 
 * @param address - The wallet address to check
 * @returns Promise<boolean> - true if wallet has DAO access
 */
export async function checkDAOAccess(address: string): Promise<boolean> {
  const ownedTokens = await checkStarOwnershipBatched(address);
  return hasStarSkrumpey(ownedTokens);
}

/**
 * Check if a wallet address owns ANY Skrumpey NFT (Star or regular)
 * 
 * Uses Magic Eden API first (more reliable), falls back to RPC balanceOf if API fails.
 * This is used for public raffles and chat access.
 * 
 * @param address - The wallet address to check
 * @returns Promise<{ hasSkrumpey: boolean; balance: number }> - ownership status and balance
 */
export async function checkSkrumpeyOwnership(address: string): Promise<{ hasSkrumpey: boolean; balance: number }> {
  if (!SKRUMPEY_CONTRACT_ADDRESS) {
    logger.warn('SKRUMPEY_CONTRACT_ADDRESS not configured');
    return { hasSkrumpey: false, balance: 0 };
  }

  const skrumpeyContractLower = SKRUMPEY_CONTRACT_ADDRESS.toLowerCase();

  // Try Magic Eden API first (more reliable and uses our API key)
  try {
    const { fetchUserCollections } = await import('./magiceden');
    const collections = await fetchUserCollections(address);
    
    // Check if Skrumpey collection is in the user's collections
    const skrumpeyCollection = collections.collections.find(
      c => c.contract.toLowerCase() === skrumpeyContractLower
    );
    
    if (skrumpeyCollection) {
      const balance = skrumpeyCollection.ownedCount;
      logger.info('Checked Skrumpey ownership via Magic Eden API', {
        address: address.slice(0, 10) + '...',
        balance,
      });
      return { hasSkrumpey: balance > 0, balance };
    }
    
    logger.debug('No Skrumpey collection found in Magic Eden response', {
      address: address.slice(0, 10) + '...',
      collectionsFound: collections.collections.length,
    });
  } catch (error) {
    logger.debug('Magic Eden API check failed, falling back to RPC', {
      address: address.slice(0, 10) + '...',
      error: String(error),
    });
  }

  // Fallback to RPC balanceOf check
  try {
    const client = await getResilientClient();

    const balance = await retryWithBackoff(async () => {
      return await client.readContract({
        address: SKRUMPEY_CONTRACT_ADDRESS as `0x${string}`,
        abi: ERC721_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      });
    });

    const balanceNum = Number(balance);
    
    logger.debug('Checked Skrumpey ownership via RPC', {
      address: address.slice(0, 10) + '...',
      balance: balanceNum,
    });

    return { hasSkrumpey: balanceNum > 0, balance: balanceNum };
  } catch (error) {
    logger.error('Failed to check Skrumpey ownership', {
      address: address.slice(0, 10) + '...',
      error: String(error),
    });
    return { hasSkrumpey: false, balance: 0 };
  }
}
