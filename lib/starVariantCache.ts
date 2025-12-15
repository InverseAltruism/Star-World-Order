/**
 * Star Variant Metadata Cache
 * 
 * This module handles fetching and caching actual star constellation variants
 * from NFT metadata stored on-chain. It provides a fallback mechanism if metadata
 * cannot be fetched.
 * 
 * Features:
 * - Fetches real constellation data from tokenURI metadata
 * - In-memory caching to avoid repeated RPC calls
 * - Batch fetching for efficiency
 * - Fallback to deterministic mapping if fetching fails
 */

import { getResilientClient, retryWithBackoff } from './rpcClient';
import { SKRUMPEY_CONTRACT_ADDRESS, STAR_TRAIT_VARIANTS, StarTraitVariant } from './starSkrumpey';
import { logger } from './logger';

// ERC721 ABI for tokenURI
const ERC721_METADATA_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// NFT Metadata interface
interface NFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  attributes?: Array<{
    trait_type: string;
    value: string;
  }>;
}

// In-memory cache for star variants
// Map<tokenId, variant>
const variantCache = new Map<number, StarTraitVariant>();

// Track which tokens we've attempted to fetch (to avoid refetching failures)
const fetchAttempts = new Set<number>();

/**
 * Parse tokenURI to extract metadata
 */
function parseTokenURI(tokenURI: string): NFTMetadata | null {
  try {
    // Handle base64 encoded data URI
    if (tokenURI.startsWith('data:application/json;base64,')) {
      const base64Data = tokenURI.replace('data:application/json;base64,', '');
      const jsonStr = atob(base64Data);
      return JSON.parse(jsonStr);
    }
    
    // Handle plain JSON data URI
    if (tokenURI.startsWith('data:application/json,')) {
      const jsonStr = decodeURIComponent(tokenURI.replace('data:application/json,', ''));
      return JSON.parse(jsonStr);
    }
    
    // For IPFS or HTTP URLs, return null (would need to fetch)
    // In production, these should be proxied through the app
    logger.debug('Unsupported tokenURI format for parsing', { 
      prefix: tokenURI.substring(0, 30) 
    });
    return null;
  } catch (error) {
    logger.warn('Failed to parse tokenURI', { error: String(error) });
    return null;
  }
}

/**
 * Extract constellation variant from metadata attributes
 */
function extractConstellationVariant(metadata: NFTMetadata): StarTraitVariant | null {
  if (!metadata.attributes) {
    return null;
  }
  
  // Look for "Constellation" trait
  for (const attr of metadata.attributes) {
    const traitType = attr.trait_type?.toLowerCase();
    const traitValue = attr.value?.toLowerCase();
    
    if (traitType === 'constellation' || traitType === 'star') {
      // Check if the value matches any known star variant
      for (const variant of STAR_TRAIT_VARIANTS) {
        if (traitValue.includes(variant.toLowerCase())) {
          return variant;
        }
      }
    }
  }
  
  return null;
}

/**
 * Fetch star variant from blockchain metadata for a single token
 */
async function fetchStarVariantFromChain(tokenId: number): Promise<StarTraitVariant | null> {
  if (!SKRUMPEY_CONTRACT_ADDRESS) {
    logger.warn('SKRUMPEY_CONTRACT_ADDRESS not configured');
    return null;
  }
  
  try {
    const client = await getResilientClient();
    
    // Fetch tokenURI from contract
    const tokenURI = await retryWithBackoff(async () => {
      return await client.readContract({
        address: SKRUMPEY_CONTRACT_ADDRESS as `0x${string}`,
        abi: ERC721_METADATA_ABI,
        functionName: 'tokenURI',
        args: [BigInt(tokenId)],
      }) as string;
    });
    
    // Parse metadata
    const metadata = parseTokenURI(tokenURI);
    if (!metadata) {
      logger.debug('Could not parse metadata for token', { tokenId });
      return null;
    }
    
    // Extract constellation variant
    const variant = extractConstellationVariant(metadata);
    if (variant) {
      logger.debug('Found star variant from chain', { tokenId, variant });
      return variant;
    }
    
    logger.debug('No constellation variant found in metadata', { tokenId });
    return null;
  } catch (error) {
    logger.warn('Failed to fetch star variant from chain', {
      tokenId,
      error: String(error),
    });
    return null;
  }
}

/**
 * Get star variant for a token ID, with caching and fallback
 * 
 * This is the main function to use. It will:
 * 1. Check cache first
 * 2. Try to fetch from blockchain if not cached
 * 3. Fall back to deterministic mapping if fetching fails
 * 
 * @param tokenId - The token ID to get variant for
 * @param useFallback - Whether to use fallback mapping if fetching fails (default: true)
 * @returns The star variant, or undefined if not a star skrumpey
 */
export async function getStarVariantWithMetadata(
  tokenId: number,
  useFallback: boolean = true
): Promise<StarTraitVariant | undefined> {
  // Check cache first
  if (variantCache.has(tokenId)) {
    return variantCache.get(tokenId);
  }
  
  // Don't refetch if we've already tried and failed
  if (fetchAttempts.has(tokenId)) {
    if (useFallback) {
      // Use deterministic fallback
      const fallbackVariant = STAR_TRAIT_VARIANTS[tokenId % STAR_TRAIT_VARIANTS.length];
      logger.debug('Using fallback variant for token', { tokenId, fallbackVariant });
      return fallbackVariant;
    }
    return undefined;
  }
  
  // Mark as attempted
  fetchAttempts.add(tokenId);
  
  // Try to fetch from chain
  const variant = await fetchStarVariantFromChain(tokenId);
  
  if (variant) {
    // Cache the result
    variantCache.set(tokenId, variant);
    return variant;
  }
  
  // Fall back to deterministic mapping if enabled
  if (useFallback) {
    const fallbackVariant = STAR_TRAIT_VARIANTS[tokenId % STAR_TRAIT_VARIANTS.length];
    logger.debug('Using fallback variant for token', { tokenId, fallbackVariant });
    // Don't cache fallback values - they're not real
    return fallbackVariant;
  }
  
  return undefined;
}

/**
 * Batch fetch star variants for multiple tokens
 * Uses multicall for efficiency
 * 
 * @param tokenIds - Array of token IDs to fetch variants for
 * @param useFallback - Whether to use fallback mapping for failed fetches
 * @returns Map of tokenId -> variant
 */
export async function batchFetchStarVariants(
  tokenIds: number[],
  useFallback: boolean = true
): Promise<Map<number, StarTraitVariant>> {
  const results = new Map<number, StarTraitVariant>();
  
  // Filter out cached tokens
  const tokensToFetch = tokenIds.filter(id => !variantCache.has(id) && !fetchAttempts.has(id));
  
  // Return cached results immediately for already cached tokens
  for (const tokenId of tokenIds) {
    if (variantCache.has(tokenId)) {
      results.set(tokenId, variantCache.get(tokenId)!);
    }
  }
  
  if (tokensToFetch.length === 0) {
    return results;
  }
  
  if (!SKRUMPEY_CONTRACT_ADDRESS) {
    logger.warn('SKRUMPEY_CONTRACT_ADDRESS not configured');
    // Fall back to deterministic mapping if enabled
    if (useFallback) {
      for (const tokenId of tokensToFetch) {
        results.set(tokenId, STAR_TRAIT_VARIANTS[tokenId % STAR_TRAIT_VARIANTS.length]);
      }
    }
    return results;
  }
  
  try {
    const client = await getResilientClient();
    
    // Batch fetch tokenURIs using multicall
    const tokenURIs = await retryWithBackoff(async () => {
      return await client.multicall({
        contracts: tokensToFetch.map(tokenId => ({
          address: SKRUMPEY_CONTRACT_ADDRESS as `0x${string}`,
          abi: ERC721_METADATA_ABI,
          functionName: 'tokenURI',
          args: [BigInt(tokenId)],
        })),
        allowFailure: true,
      });
    });
    
    // Process results
    for (let i = 0; i < tokenURIs.length; i++) {
      const tokenId = tokensToFetch[i];
      const result = tokenURIs[i];
      
      fetchAttempts.add(tokenId);
      
      if (result.status === 'success') {
        const tokenURI = result.result as string;
        const metadata = parseTokenURI(tokenURI);
        
        if (metadata) {
          const variant = extractConstellationVariant(metadata);
          if (variant) {
            variantCache.set(tokenId, variant);
            results.set(tokenId, variant);
            continue;
          }
        }
      }
      
      // Use fallback if enabled
      if (useFallback) {
        const fallbackVariant = STAR_TRAIT_VARIANTS[tokenId % STAR_TRAIT_VARIANTS.length];
        results.set(tokenId, fallbackVariant);
      }
    }
  } catch (error) {
    logger.error('Failed to batch fetch star variants', {
      tokenCount: tokensToFetch.length,
      error: String(error),
    });
    
    // Fall back to deterministic mapping if enabled
    if (useFallback) {
      for (const tokenId of tokensToFetch) {
        results.set(tokenId, STAR_TRAIT_VARIANTS[tokenId % STAR_TRAIT_VARIANTS.length]);
      }
    }
  }
  
  return results;
}

/**
 * Get cache statistics for debugging
 */
export function getCacheStats(): {
  cachedCount: number;
  attemptedCount: number;
  cachedTokens: number[];
} {
  return {
    cachedCount: variantCache.size,
    attemptedCount: fetchAttempts.size,
    cachedTokens: Array.from(variantCache.keys()),
  };
}

/**
 * Clear the cache (useful for testing)
 */
export function clearCache(): void {
  variantCache.clear();
  fetchAttempts.clear();
  logger.info('Star variant cache cleared');
}
