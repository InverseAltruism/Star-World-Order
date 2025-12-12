/**
 * OTC Marketplace for Star Skrumpeys
 * 
 * This module provides direct contract interaction for peer-to-peer NFT trading
 * without relying on centralized marketplaces like Magic Eden or OpenSea.
 * 
 * The OTC marketplace allows:
 * - Listing Star Skrumpeys for sale at a fixed price in MON
 * - Buying listed Star Skrumpeys by sending the exact MON amount
 * - Canceling active listings
 * 
 * Architecture:
 * - Uses a simple escrow pattern where the seller approves the marketplace contract
 * - On purchase, the contract transfers MON from buyer to seller and NFT to buyer
 * - All transactions are trustless and atomic
 */

import { createPublicClient, http, encodeFunctionData, parseEther, formatEther } from 'viem';
import { monad } from './wagmi';
import { SKRUMPEY_CONTRACT_ADDRESS } from './starSkrumpey';

/**
 * Marketplace contract address on Monad
 * In a real deployment, this would be a deployed smart contract
 * For simulation, we use a mock address that represents our OTC contract
 */
export const MARKETPLACE_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_MARKETPLACE_CONTRACT || '0x0000000000000000000000000000000000000000';

/**
 * Listing status
 */
export enum ListingStatus {
  Active = 'active',
  Sold = 'sold',
  Cancelled = 'cancelled',
}

/**
 * Marketplace listing
 */
export interface Listing {
  id: string;
  tokenId: number;
  seller: string;
  price: bigint; // Price in MON (wei)
  priceFormatted: string; // Price in MON (human readable)
  status: ListingStatus;
  createdAt: number;
  starVariant?: string;
  imageUrl?: string;
}

/**
 * Minimal ERC721 ABI for marketplace operations
 */
export const ERC721_MARKETPLACE_ABI = [
  // Read functions
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getApproved',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'owner', type: 'address' }, { name: 'operator', type: 'address' }],
    name: 'isApprovedForAll',
    outputs: [{ name: '', type: 'bool' }],
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
  // Write functions
  {
    inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }],
    name: 'approve',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }],
    name: 'setApprovalForAll',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }],
    name: 'transferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }],
    name: 'safeTransferFrom',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

/**
 * OTC Marketplace ABI
 * This is a simplified escrow-style marketplace contract ABI
 * 
 * The contract handles:
 * 1. createListing(tokenId, price) - Seller lists NFT
 * 2. buyListing(listingId) payable - Buyer purchases NFT
 * 3. cancelListing(listingId) - Seller cancels listing
 * 4. getListing(listingId) - Get listing details
 * 5. getActiveListings() - Get all active listings
 */
export const MARKETPLACE_ABI = [
  // Create a listing
  {
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'price', type: 'uint256' },
    ],
    name: 'createListing',
    outputs: [{ name: 'listingId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Buy a listing
  {
    inputs: [{ name: 'listingId', type: 'uint256' }],
    name: 'buyListing',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  // Cancel a listing
  {
    inputs: [{ name: 'listingId', type: 'uint256' }],
    name: 'cancelListing',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Get listing details
  {
    inputs: [{ name: 'listingId', type: 'uint256' }],
    name: 'getListing',
    outputs: [
      {
        components: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'seller', type: 'address' },
          { name: 'price', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // Get active listings count
  {
    inputs: [],
    name: 'getActiveListingsCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'listingId', type: 'uint256' },
      { indexed: true, name: 'seller', type: 'address' },
      { indexed: true, name: 'tokenId', type: 'uint256' },
      { indexed: false, name: 'price', type: 'uint256' },
    ],
    name: 'ListingCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'listingId', type: 'uint256' },
      { indexed: true, name: 'buyer', type: 'address' },
      { indexed: false, name: 'price', type: 'uint256' },
    ],
    name: 'ListingPurchased',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'listingId', type: 'uint256' },
    ],
    name: 'ListingCancelled',
    type: 'event',
  },
] as const;

/**
 * Create a public client for Monad
 */
export function getPublicClient() {
  return createPublicClient({
    chain: monad,
    transport: http(),
  });
}

/**
 * Check if an NFT is approved for the marketplace
 */
export async function isNFTApprovedForMarketplace(tokenId: number): Promise<boolean> {
  if (!SKRUMPEY_CONTRACT_ADDRESS) {
    throw new Error('Skrumpey contract address not configured');
  }
  
  const client = getPublicClient();
  
  try {
    // Check specific approval
    const approved = await client.readContract({
      address: SKRUMPEY_CONTRACT_ADDRESS as `0x${string}`,
      abi: ERC721_MARKETPLACE_ABI,
      functionName: 'getApproved',
      args: [BigInt(tokenId)],
    });
    
    if (approved.toLowerCase() === MARKETPLACE_CONTRACT_ADDRESS.toLowerCase()) {
      return true;
    }
    
    // Check operator approval
    const owner = await client.readContract({
      address: SKRUMPEY_CONTRACT_ADDRESS as `0x${string}`,
      abi: ERC721_MARKETPLACE_ABI,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)],
    });
    
    const isApprovedForAll = await client.readContract({
      address: SKRUMPEY_CONTRACT_ADDRESS as `0x${string}`,
      abi: ERC721_MARKETPLACE_ABI,
      functionName: 'isApprovedForAll',
      args: [owner, MARKETPLACE_CONTRACT_ADDRESS as `0x${string}`],
    });
    
    return isApprovedForAll;
  } catch (error) {
    console.error('Error checking NFT approval:', error);
    return false;
  }
}

/**
 * Get approval transaction data for the marketplace
 */
export function getApprovalTxData(tokenId: number): `0x${string}` {
  return encodeFunctionData({
    abi: ERC721_MARKETPLACE_ABI,
    functionName: 'approve',
    args: [MARKETPLACE_CONTRACT_ADDRESS as `0x${string}`, BigInt(tokenId)],
  });
}

/**
 * Get create listing transaction data
 */
export function getCreateListingTxData(tokenId: number, priceInMon: string): `0x${string}` {
  const priceWei = parseEther(priceInMon);
  return encodeFunctionData({
    abi: MARKETPLACE_ABI,
    functionName: 'createListing',
    args: [BigInt(tokenId), priceWei],
  });
}

/**
 * Get buy listing transaction data
 */
export function getBuyListingTxData(listingId: string): `0x${string}` {
  return encodeFunctionData({
    abi: MARKETPLACE_ABI,
    functionName: 'buyListing',
    args: [BigInt(listingId)],
  });
}

/**
 * Get cancel listing transaction data
 */
export function getCancelListingTxData(listingId: string): `0x${string}` {
  return encodeFunctionData({
    abi: MARKETPLACE_ABI,
    functionName: 'cancelListing',
    args: [BigInt(listingId)],
  });
}

/**
 * Parse price from string to wei
 */
export function parsePriceToWei(priceInMon: string): bigint {
  return parseEther(priceInMon);
}

/**
 * Format price from wei to MON string
 */
export function formatPriceFromWei(priceInWei: bigint): string {
  return formatEther(priceInWei);
}

/**
 * Validate listing price
 */
export function validateListingPrice(priceInMon: string): { valid: boolean; error?: string } {
  if (!priceInMon || priceInMon.trim() === '') {
    return { valid: false, error: 'Price is required' };
  }
  
  const price = parseFloat(priceInMon);
  
  if (isNaN(price)) {
    return { valid: false, error: 'Invalid price format' };
  }
  
  if (price <= 0) {
    return { valid: false, error: 'Price must be greater than 0' };
  }
  
  if (price > 1000000) {
    return { valid: false, error: 'Price exceeds maximum (1,000,000 MON)' };
  }
  
  return { valid: true };
}

/**
 * Simulate error types for marketplace operations
 */
export enum MarketplaceErrorType {
  NotOwner = 'NOT_OWNER',
  NotApproved = 'NOT_APPROVED',
  ListingNotFound = 'LISTING_NOT_FOUND',
  ListingNotActive = 'LISTING_NOT_ACTIVE',
  InsufficientFunds = 'INSUFFICIENT_FUNDS',
  CannotBuyOwnListing = 'CANNOT_BUY_OWN_LISTING',
  TransactionFailed = 'TRANSACTION_FAILED',
  ContractNotConfigured = 'CONTRACT_NOT_CONFIGURED',
}

/**
 * Marketplace error class
 */
export class MarketplaceError extends Error {
  constructor(
    public type: MarketplaceErrorType,
    message: string
  ) {
    super(message);
    this.name = 'MarketplaceError';
  }
}

/**
 * Check if marketplace contract is configured
 */
export function isMarketplaceConfigured(): boolean {
  return MARKETPLACE_CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000' && 
         MARKETPLACE_CONTRACT_ADDRESS !== '';
}

/**
 * Simulate listing validation
 * Checks ownership and approval status before listing
 */
export async function validateListing(
  tokenId: number,
  sellerAddress: string,
  priceInMon: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  // Check if marketplace is configured
  if (!isMarketplaceConfigured()) {
    errors.push('Marketplace contract not yet deployed');
  }
  
  // Validate price
  const priceValidation = validateListingPrice(priceInMon);
  if (!priceValidation.valid) {
    errors.push(priceValidation.error!);
  }
  
  // Check NFT contract
  if (!SKRUMPEY_CONTRACT_ADDRESS) {
    errors.push('NFT contract not configured');
    return { valid: false, errors };
  }
  
  try {
    const client = getPublicClient();
    
    // Verify ownership
    const owner = await client.readContract({
      address: SKRUMPEY_CONTRACT_ADDRESS as `0x${string}`,
      abi: ERC721_MARKETPLACE_ABI,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)],
    });
    
    if (owner.toLowerCase() !== sellerAddress.toLowerCase()) {
      errors.push('You do not own this NFT');
    }
    
    // Check approval (only if marketplace is configured)
    if (isMarketplaceConfigured()) {
      const isApproved = await isNFTApprovedForMarketplace(tokenId);
      if (!isApproved) {
        errors.push('NFT not approved for marketplace - approval required before listing');
      }
    }
  } catch (error) {
    console.error('Validation error:', error);
    errors.push('Failed to verify NFT ownership');
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Simulate purchase validation
 * Checks listing status, buyer balance, and prevents self-purchase
 */
export function validatePurchase(
  listing: Listing,
  buyerAddress: string,
  buyerBalance: bigint
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check if marketplace is configured
  if (!isMarketplaceConfigured()) {
    errors.push('Marketplace contract not yet deployed');
  }
  
  // Check listing status
  if (listing.status !== ListingStatus.Active) {
    errors.push('Listing is no longer active');
  }
  
  // Check buyer is not seller
  if (listing.seller.toLowerCase() === buyerAddress.toLowerCase()) {
    errors.push('Cannot buy your own listing');
  }
  
  // Check buyer balance
  if (buyerBalance < listing.price) {
    errors.push(`Insufficient MON balance (need ${listing.priceFormatted} MON)`);
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Generate a mock listing ID
 */
export function generateListingId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * Storage key for local listings (demo mode)
 */
const LISTINGS_STORAGE_KEY = 'swo_marketplace_listings';

/**
 * Get stored listings from localStorage (demo mode)
 */
export function getStoredListings(): Listing[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(LISTINGS_STORAGE_KEY);
    if (!stored) return [];
    
    const listings = JSON.parse(stored) as Array<Listing & { price: string }>;
    // Convert price strings back to bigint
    return listings.map(l => ({
      ...l,
      price: BigInt(l.price),
    }));
  } catch {
    return [];
  }
}

/**
 * Save listings to localStorage (demo mode)
 */
export function saveStoredListings(listings: Listing[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    // Convert bigint prices to strings for JSON storage
    const serializable = listings.map(l => ({
      ...l,
      price: l.price.toString(),
    }));
    localStorage.setItem(LISTINGS_STORAGE_KEY, JSON.stringify(serializable));
  } catch (error) {
    console.error('Failed to save listings:', error);
  }
}

/**
 * Create a mock listing (demo mode)
 */
export function createMockListing(
  tokenId: number,
  seller: string,
  priceInMon: string,
  starVariant?: string
): Listing {
  const priceWei = parseEther(priceInMon);
  return {
    id: generateListingId(),
    tokenId,
    seller,
    price: priceWei,
    priceFormatted: priceInMon,
    status: ListingStatus.Active,
    createdAt: Date.now(),
    starVariant,
    imageUrl: undefined, // Would be fetched from token metadata in production
  };
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
