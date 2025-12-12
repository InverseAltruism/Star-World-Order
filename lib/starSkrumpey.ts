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
 * 2. For each owned NFT, fetch metadata and check for star trait
 * 3. Only holders of NFTs with star traits get DAO access
 * 4. In development mode with NEXT_PUBLIC_DEV_ACCESS_ENABLED=true, all connected wallets get access
 */

import { createPublicClient, http } from 'viem';
import { monad } from './wagmi';

/**
 * Star trait constellation variants
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
 * Fetch user's Skrumpey NFTs from the blockchain
 * Checks each owned token for star traits via metadata
 * Uses batching to prevent overwhelming IPFS gateways
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
    
    // Process tokens in batches of 5 to prevent overwhelming IPFS gateways
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

        // Get token URI
        const tokenURI = await client.readContract({
          address: SKRUMPEY_CONTRACT_ADDRESS as `0x${string}`,
          abi: ERC721_ABI,
          functionName: 'tokenURI',
          args: [tokenId],
        });

        // Fetch and check metadata for star trait
        const metadata = await fetchMetadata(tokenURI);
        if (metadata) {
          const starCheck = hasStarTraitInMetadata(metadata);
          return {
            tokenId: Number(tokenId),
            hasStar: starCheck.hasStar,
            starVariant: starCheck.variant,
          };
        }

        return {
          tokenId: Number(tokenId),
          hasStar: false,
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
 * Note: Regular Skrumpey holders (without Star trait) do NOT get access.
 * Only holders of NFTs with star traits in their metadata are granted access.
 * 
 * @param address - The wallet address to check
 * @returns Promise<boolean> - true if wallet has DAO access
 */
export async function checkDAOAccess(address: string): Promise<boolean> {
  const ownedTokens = await fetchUserSkrumpeys(address);
  return hasStarSkrumpey(ownedTokens);
}
