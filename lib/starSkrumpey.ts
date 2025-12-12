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
 * 1. The STAR_SKRUMPEY_IDS array contains token IDs that have the Star trait
 * 2. Only holders of tokens in this list get DAO access
 * 3. Holders of regular Skrumpeys (without Star trait) are denied access
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

// Allow-list of NFT IDs that have the Star trait
// This will be populated with actual IDs when provided by the team
// Only holders of these specific token IDs get DAO access
export const STAR_SKRUMPEY_IDS: number[] = [
  // Placeholder IDs - replace with actual Star Skrumpey IDs when available
  // Example: 42, 137, 256, 512, 777, 888, 999, 1024, 1337, 2048
];

// Skrumpey NFT Contract Address on Monad
// Must be configured in .env.local before production deployment
export const SKRUMPEY_CONTRACT_ADDRESS: string | undefined = process.env.NEXT_PUBLIC_SKRUMPEY_CONTRACT;

// Development access override - only works in development mode
// Set NEXT_PUBLIC_DEV_ACCESS_ENABLED=true in .env.local to enable
export const DEV_ACCESS_ENABLED = 
  process.env.NODE_ENV === 'development' && 
  process.env.NEXT_PUBLIC_DEV_ACCESS_ENABLED === 'true';

// Minimal ERC721 ABI for balance and token ownership checks
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
] as const;

/**
 * Check if a given NFT ID is a Star Skrumpey
 */
export function isStarSkrumpey(tokenId: number): boolean {
  return STAR_SKRUMPEY_IDS.includes(tokenId);
}

/**
 * Check if any of the given NFT IDs are Star Skrumpeys
 */
export function hasStarSkrumpey(tokenIds: number[]): boolean {
  return tokenIds.some(id => isStarSkrumpey(id));
}

/**
 * Get all Star Skrumpey IDs from a list of owned NFT IDs
 */
export function getStarSkrumpeys(tokenIds: number[]): number[] {
  return tokenIds.filter(id => isStarSkrumpey(id));
}

/**
 * Fetch user's Skrumpey NFTs from the blockchain
 * Checks ownership of Star Skrumpey token IDs for the given address
 * 
 * @param address - The wallet address to check
 * @returns Array of Star Skrumpey token IDs owned by the address
 */
export async function fetchUserSkrumpeys(address: string): Promise<number[]> {
  // If no contract address is configured, return empty array
  if (!SKRUMPEY_CONTRACT_ADDRESS) {
    console.warn('SKRUMPEY_CONTRACT_ADDRESS not configured');
    return [];
  }

  // If no Star Skrumpey IDs are configured, return empty array
  if (STAR_SKRUMPEY_IDS.length === 0) {
    console.warn('STAR_SKRUMPEY_IDS list is empty - no Star Skrumpeys configured');
    return [];
  }

  try {
    const client = createPublicClient({
      chain: monad,
      transport: http(),
    });

    // Check ownership of all Star Skrumpey IDs concurrently for better performance
    const ownershipChecks = STAR_SKRUMPEY_IDS.map(async (tokenId) => {
      try {
        const owner = await client.readContract({
          address: SKRUMPEY_CONTRACT_ADDRESS as `0x${string}`,
          abi: ERC721_ABI,
          functionName: 'ownerOf',
          args: [BigInt(tokenId)],
        });
        
        if (owner.toLowerCase() === address.toLowerCase()) {
          return tokenId;
        }
        return null;
      } catch {
        // Token might not exist or other error - skip it
        return null;
      }
    });

    const results = await Promise.all(ownershipChecks);
    return results.filter((id): id is number => id !== null);
  } catch (error) {
    console.error('Error fetching user Skrumpeys:', error);
    return [];
  }
}

/**
 * Check if a wallet address has DAO access (holds at least one Star Skrumpey)
 * 
 * Note: Regular Skrumpey holders (without Star trait) do NOT get access.
 * Only holders of tokens in the STAR_SKRUMPEY_IDS list are granted access.
 * 
 * @param address - The wallet address to check
 * @returns Promise<boolean> - true if wallet has DAO access
 */
export async function checkDAOAccess(address: string): Promise<boolean> {
  const ownedTokens = await fetchUserSkrumpeys(address);
  return hasStarSkrumpey(ownedTokens);
}
