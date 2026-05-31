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
 * - DAO Treasury fee on each sale (configurable percentage)
 * 
 * Architecture:
 * - Uses a simple escrow pattern where the seller approves the marketplace contract
 * - On purchase, the contract transfers MON from buyer to seller and NFT to buyer
 * - A small percentage fee goes to the DAO Treasury
 * - All transactions are trustless and atomic
 * 
 * Available Open Source Libraries for EVM NFT Marketplaces:
 * 
 * 1. @opensea/seaport-js (v4.0.5) - MIT License
 *    - OpenSea's Seaport protocol SDK
 *    - Supports custom fee recipients (perfect for DAO treasury)
 *    - Uses ethers v6 (compatible with our stack)
 *    - Battle-tested, widely deployed
 *    - GitHub: https://github.com/ProjectOpenSea/seaport-js
 *    - Seaport contracts deployed on many EVM chains
 * 
 * 2. @traderxyz/nft-swap-sdk (v0.33.0) - MIT License
 *    - 0x protocol based NFT swap library
 *    - Supports ERC721, ERC1155, ERC20 swaps
 *    - Supports fee recipients for protocol fees
 *    - Uses ethers v5 (would need adapter)
 *    - GitHub: https://github.com/trader-xyz/nft-swap-sdk
 * 
 * 3. @reservoir0x/reservoir-sdk (v2.5.7) - MIT License
 *    - Aggregates liquidity from multiple marketplaces
 *    - Supports custom royalties and fees
 *    - API-based approach
 *    - Good for cross-marketplace listing
 * 
 * For Monad deployment, we recommend either:
 * - Deploy Seaport contracts to Monad and use seaport-js SDK
 * - Build custom OTC contract with fee mechanism (this implementation)
 * 
 * The custom approach gives full control over:
 * - DAO treasury fee percentage
 * - Gas optimization for Monad
 * - Simpler UX for Star Skrumpey-specific features
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
 * DAO Treasury address on Monad
 * This address receives a percentage of each sale
 */
export const DAO_TREASURY_ADDRESS = process.env.NEXT_PUBLIC_DAO_TREASURY_ADDRESS || '0x0000000000000000000000000000000000000000';

/**
 * DAO Treasury fee percentage (in basis points)
 * 250 = 2.5%, 100 = 1%, 500 = 5%
 * Default: 2.5% (250 basis points)
 */
export const DAO_FEE_BPS = parseInt(process.env.NEXT_PUBLIC_DAO_FEE_BPS || '250', 10);

/**
 * Basis points divisor (100% = 10000 bps)
 */
export const BPS_DIVISOR = 10000;

/**
 * Calculate DAO treasury fee from sale price
 * @param price - Sale price in wei
 * @returns Fee amount in wei
 */
export function calculateDAOFee(price: bigint): bigint {
  return (price * BigInt(DAO_FEE_BPS)) / BigInt(BPS_DIVISOR);
}

/**
 * Calculate seller proceeds after DAO fee
 * @param price - Sale price in wei
 * @returns Seller proceeds in wei
 */
export function calculateSellerProceeds(price: bigint): bigint {
  const fee = calculateDAOFee(price);
  return price - fee;
}

/**
 * Get fee percentage as human readable string
 */
export function getDAOFeePercentage(): string {
  return (DAO_FEE_BPS / 100).toFixed(2);
}

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
 * This is a simplified escrow-style marketplace contract ABI with DAO treasury fee support
 * 
 * The contract handles:
 * 1. createListing(tokenId, price) - Seller lists NFT
 * 2. buyListing(listingId) payable - Buyer purchases NFT (fee goes to DAO treasury)
 * 3. cancelListing(listingId) - Seller cancels listing
 * 4. getListing(listingId) - Get listing details
 * 5. getActiveListings() - Get all active listings
 * 6. getDAOTreasury() - Get DAO treasury address
 * 7. getFeeBps() - Get fee in basis points
 * 
 * Fee Distribution on Purchase:
 * - DAO Treasury receives: price * feeBps / 10000
 * - Seller receives: price - (price * feeBps / 10000)
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
  // Get DAO treasury address
  {
    inputs: [],
    name: 'daoTreasury',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Get fee in basis points
  {
    inputs: [],
    name: 'feeBps',
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
      { indexed: false, name: 'daoFee', type: 'uint256' },
      { indexed: false, name: 'sellerProceeds', type: 'uint256' },
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
 * Zero address constant
 */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

/**
 * Check if marketplace contract is configured
 */
export function isMarketplaceConfigured(): boolean {
  return MARKETPLACE_CONTRACT_ADDRESS !== ZERO_ADDRESS && 
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
 * Generate a unique listing ID
 * Uses crypto.randomUUID when available for better uniqueness
 */
export function generateListingId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/**
 * Generate a unique transaction ID (prefixed to avoid collision with listing IDs)
 */
export function generateTransactionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'tx_' + crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'tx_' + Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
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

// truncateAddress re-exported from the canonical formatter.
export { truncateAddress } from './format';

/**
 * Transaction history event type
 */
export enum TransactionType {
  Listed = 'listed',
  Sold = 'sold',
  Cancelled = 'cancelled',
}

/**
 * Transaction history entry
 */
export interface TransactionHistoryEntry {
  id: string;
  type: TransactionType;
  tokenId: number;
  seller: string;
  buyer?: string;
  price: bigint;
  priceFormatted: string;
  starVariant?: string;
  timestamp: number;
  txHash?: string;
}

/**
 * Storage key for transaction history (demo mode)
 */
const HISTORY_STORAGE_KEY = 'swo_marketplace_history';

/**
 * Get transaction history from localStorage (demo mode)
 */
export function getTransactionHistory(): TransactionHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!stored) return [];
    
    const history = JSON.parse(stored) as Array<TransactionHistoryEntry & { price: string }>;
    return history.map(h => ({
      ...h,
      price: BigInt(h.price),
    }));
  } catch {
    return [];
  }
}

/**
 * Save transaction history to localStorage (demo mode)
 */
export function saveTransactionHistory(history: TransactionHistoryEntry[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    const serializable = history.map(h => ({
      ...h,
      price: h.price.toString(),
    }));
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(serializable));
  } catch (error) {
    console.error('Failed to save history:', error);
  }
}

/**
 * Add a transaction to history
 */
export function addTransactionToHistory(
  type: TransactionType,
  listing: Listing,
  buyer?: string,
  txHash?: string
): void {
  const history = getTransactionHistory();
  const entry: TransactionHistoryEntry = {
    id: generateTransactionId(),
    type,
    tokenId: listing.tokenId,
    seller: listing.seller,
    buyer,
    price: listing.price,
    priceFormatted: listing.priceFormatted,
    starVariant: listing.starVariant,
    timestamp: Date.now(),
    txHash,
  };
  history.unshift(entry); // Add to beginning (newest first)
  // Keep last 100 transactions
  if (history.length > 100) {
    history.splice(100);
  }
  saveTransactionHistory(history);
}

/**
 * Sort options for listings
 */
export enum SortOption {
  PriceLowHigh = 'price_low_high',
  PriceHighLow = 'price_high_low',
  Newest = 'newest',
  Oldest = 'oldest',
  TokenId = 'token_id',
}

/**
 * Filter options for listings
 */
export interface FilterOptions {
  minPrice?: string;
  maxPrice?: string;
  starVariant?: string;
  seller?: string;
}

/**
 * Star trait variants for filtering
 */
export const STAR_VARIANTS = [
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
 * Sort listings by the specified option
 */
export function sortListings(listings: Listing[], sortBy: SortOption): Listing[] {
  const sorted = [...listings];
  switch (sortBy) {
    case SortOption.PriceLowHigh:
      return sorted.sort((a, b) => Number(a.price - b.price));
    case SortOption.PriceHighLow:
      return sorted.sort((a, b) => Number(b.price - a.price));
    case SortOption.Newest:
      return sorted.sort((a, b) => b.createdAt - a.createdAt);
    case SortOption.Oldest:
      return sorted.sort((a, b) => a.createdAt - b.createdAt);
    case SortOption.TokenId:
      return sorted.sort((a, b) => a.tokenId - b.tokenId);
    default:
      return sorted;
  }
}

/**
 * Filter listings by the specified options
 */
export function filterListings(listings: Listing[], filters: FilterOptions): Listing[] {
  return listings.filter(listing => {
    // Filter by min price
    if (filters.minPrice) {
      const minWei = parseEther(filters.minPrice);
      if (listing.price < minWei) return false;
    }
    
    // Filter by max price
    if (filters.maxPrice) {
      const maxWei = parseEther(filters.maxPrice);
      if (listing.price > maxWei) return false;
    }
    
    // Filter by star variant
    if (filters.starVariant && listing.starVariant !== filters.starVariant) {
      return false;
    }
    
    // Filter by seller
    if (filters.seller && listing.seller.toLowerCase() !== filters.seller.toLowerCase()) {
      return false;
    }
    
    return true;
  });
}

/**
 * Get human-readable label for sort option
 */
export function getSortOptionLabel(option: SortOption): string {
  switch (option) {
    case SortOption.PriceLowHigh:
      return 'Price: Low to High';
    case SortOption.PriceHighLow:
      return 'Price: High to Low';
    case SortOption.Newest:
      return 'Newest First';
    case SortOption.Oldest:
      return 'Oldest First';
    case SortOption.TokenId:
      return 'Token ID';
    default:
      return 'Sort';
  }
}

/**
 * Get human-readable label for transaction type
 */
export function getTransactionTypeLabel(type: TransactionType): string {
  switch (type) {
    case TransactionType.Listed:
      return 'Listed';
    case TransactionType.Sold:
      return 'Sold';
    case TransactionType.Cancelled:
      return 'Cancelled';
    default:
      return 'Unknown';
  }
}

/**
 * Get icon for transaction type
 */
export function getTransactionTypeIcon(type: TransactionType): string {
  switch (type) {
    case TransactionType.Listed:
      return '📋';
    case TransactionType.Sold:
      return '💰';
    case TransactionType.Cancelled:
      return '❌';
    default:
      return '❓';
  }
}

/**
 * Get color for transaction type
 */
export function getTransactionTypeColor(type: TransactionType): string {
  switch (type) {
    case TransactionType.Listed:
      return '#9966ff';
    case TransactionType.Sold:
      return '#44ff88';
    case TransactionType.Cancelled:
      return '#ff4466';
    default:
      return '#666666';
  }
}

/**
 * Format timestamp to relative time
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}
