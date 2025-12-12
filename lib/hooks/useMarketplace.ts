'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { useDAOAccess } from './useDAOAccess';
import {
  Listing,
  ListingStatus,
  MARKETPLACE_CONTRACT_ADDRESS,
  MARKETPLACE_ABI,
  ERC721_MARKETPLACE_ABI,
  isMarketplaceConfigured,
  validateListing,
  validatePurchase,
  validateListingPrice,
  getStoredListings,
  saveStoredListings,
  createMockListing,
  formatPriceFromWei,
  truncateAddress,
  calculateDAOFee,
  calculateSellerProceeds,
  getDAOFeePercentage,
  DAO_FEE_BPS,
} from '@/lib/marketplace';
import { SKRUMPEY_CONTRACT_ADDRESS, OwnedToken } from '@/lib/starSkrumpey';

export interface UseMarketplaceResult {
  /** All active listings */
  listings: Listing[];
  /** User's own listings */
  userListings: Listing[];
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** User's MON balance */
  balance: bigint;
  /** Formatted MON balance */
  balanceFormatted: string;
  /** Whether marketplace contract is deployed */
  isContractDeployed: boolean;
  /** Create a new listing */
  createListing: (tokenId: number, priceInMon: string, starVariant?: string) => Promise<{ success: boolean; error?: string; listingId?: string }>;
  /** Buy a listing */
  buyListing: (listingId: string) => Promise<{ success: boolean; error?: string }>;
  /** Cancel a listing */
  cancelListing: (listingId: string) => Promise<{ success: boolean; error?: string }>;
  /** Approve NFT for marketplace */
  approveNFT: (tokenId: number) => Promise<{ success: boolean; error?: string; txHash?: string }>;
  /** Refresh listings */
  refresh: () => void;
  /** User's Star Skrumpeys available for listing */
  availableForListing: OwnedToken[];
  /** Transaction pending state */
  isPending: boolean;
}

/**
 * Zero balance constant to avoid repeated BigInt creation
 */
const ZERO_BALANCE = BigInt(0);

/**
 * Hook for interacting with the OTC marketplace
 * 
 * Provides functions for:
 * - Viewing listings
 * - Creating listings
 * - Buying listings
 * - Canceling listings
 * - Approving NFTs for the marketplace
 * 
 * In demo mode (when marketplace contract is not deployed), uses localStorage
 * to simulate marketplace functionality.
 */
export function useMarketplace(): UseMarketplaceResult {
  const { address, isConnected } = useAccount();
  const { starSkrumpeys, isLoading: isDAOLoading } = useDAOAccess();
  
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  
  // Get user's MON balance
  const { data: balanceData } = useBalance({
    address: address,
  });
  
  const balance = balanceData?.value ?? ZERO_BALANCE;
  const balanceFormatted = balanceData ? formatPriceFromWei(balanceData.value) : '0';
  
  // Contract write hooks
  const { writeContractAsync } = useWriteContract();
  
  // Check if marketplace contract is deployed
  const isContractDeployed = isMarketplaceConfigured();
  
  // Load listings
  const loadListings = useCallback(() => {
    setIsLoading(true);
    try {
      if (isContractDeployed) {
        // In production, fetch from contract events/state
        // For now, use stored listings
        const stored = getStoredListings();
        setListings(stored.filter(l => l.status === ListingStatus.Active));
      } else {
        // Demo mode - load from localStorage
        const stored = getStoredListings();
        setListings(stored.filter(l => l.status === ListingStatus.Active));
      }
      setError(null);
    } catch (err) {
      setError('Failed to load listings');
      console.error('Load listings error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isContractDeployed]);
  
  // Load listings on mount and when dependencies change
  useEffect(() => {
    loadListings();
  }, [loadListings]);
  
  // Filter user's listings
  const userListings = listings.filter(
    l => address && l.seller.toLowerCase() === address.toLowerCase()
  );
  
  // Get Star Skrumpeys available for listing (not already listed)
  const listedTokenIds = new Set(
    listings
      .filter(l => l.status === ListingStatus.Active && address && l.seller.toLowerCase() === address.toLowerCase())
      .map(l => l.tokenId)
  );
  const availableForListing = starSkrumpeys.filter(token => !listedTokenIds.has(token.tokenId));
  
  /**
   * Approve NFT for the marketplace contract
   */
  const approveNFT = useCallback(async (tokenId: number): Promise<{ success: boolean; error?: string; txHash?: string }> => {
    if (!address || !isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    if (!SKRUMPEY_CONTRACT_ADDRESS) {
      return { success: false, error: 'NFT contract not configured' };
    }
    
    if (!isContractDeployed) {
      // Demo mode - simulate approval
      return { success: true, txHash: '0x' + 'demo'.repeat(16) };
    }
    
    setIsPending(true);
    try {
      const hash = await writeContractAsync({
        address: SKRUMPEY_CONTRACT_ADDRESS as `0x${string}`,
        abi: ERC721_MARKETPLACE_ABI,
        functionName: 'approve',
        args: [MARKETPLACE_CONTRACT_ADDRESS as `0x${string}`, BigInt(tokenId)],
      });
      
      return { success: true, txHash: hash };
    } catch (err) {
      console.error('Approval error:', err);
      const message = err instanceof Error ? err.message : 'Failed to approve NFT';
      return { success: false, error: message };
    } finally {
      setIsPending(false);
    }
  }, [address, isConnected, isContractDeployed, writeContractAsync]);
  
  /**
   * Create a new listing
   */
  const createListing = useCallback(async (
    tokenId: number,
    priceInMon: string,
    starVariant?: string
  ): Promise<{ success: boolean; error?: string; listingId?: string }> => {
    if (!address || !isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    // Validate price
    const priceValidation = validateListingPrice(priceInMon);
    if (!priceValidation.valid) {
      return { success: false, error: priceValidation.error };
    }
    
    setIsPending(true);
    setError(null);
    
    try {
      if (isContractDeployed) {
        // Production mode - call contract
        const validation = await validateListing(tokenId, address, priceInMon);
        if (!validation.valid) {
          return { success: false, error: validation.errors.join(', ') };
        }
        
        const priceWei = parseEther(priceInMon);
        
        const hash = await writeContractAsync({
          address: MARKETPLACE_CONTRACT_ADDRESS as `0x${string}`,
          abi: MARKETPLACE_ABI,
          functionName: 'createListing',
          args: [BigInt(tokenId), priceWei],
        });
        
        // Wait a bit for transaction, then reload
        setTimeout(loadListings, 2000);
        
        return { success: true, listingId: hash };
      } else {
        // Demo mode - create mock listing
        const newListing = createMockListing(tokenId, address, priceInMon, starVariant);
        
        const allListings = getStoredListings();
        allListings.push(newListing);
        saveStoredListings(allListings);
        
        // Reload listings
        loadListings();
        
        return { success: true, listingId: newListing.id };
      }
    } catch (err) {
      console.error('Create listing error:', err);
      const message = err instanceof Error ? err.message : 'Failed to create listing';
      return { success: false, error: message };
    } finally {
      setIsPending(false);
    }
  }, [address, isConnected, isContractDeployed, writeContractAsync, loadListings]);
  
  /**
   * Buy a listing
   */
  const buyListing = useCallback(async (listingId: string): Promise<{ success: boolean; error?: string }> => {
    if (!address || !isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    const listing = listings.find(l => l.id === listingId);
    if (!listing) {
      return { success: false, error: 'Listing not found' };
    }
    
    // Validate purchase
    const validation = validatePurchase(listing, address, balance);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') };
    }
    
    setIsPending(true);
    setError(null);
    
    try {
      if (isContractDeployed) {
        // Production mode - call contract
        await writeContractAsync({
          address: MARKETPLACE_CONTRACT_ADDRESS as `0x${string}`,
          abi: MARKETPLACE_ABI,
          functionName: 'buyListing',
          args: [BigInt(listingId)],
          value: listing.price,
        });
        
        // Wait for transaction, then reload
        setTimeout(loadListings, 2000);
        
        return { success: true };
      } else {
        // Demo mode - update listing status
        const allListings = getStoredListings();
        const index = allListings.findIndex(l => l.id === listingId);
        if (index !== -1) {
          allListings[index].status = ListingStatus.Sold;
          saveStoredListings(allListings);
        }
        
        // Reload listings
        loadListings();
        
        return { success: true };
      }
    } catch (err) {
      console.error('Buy listing error:', err);
      const message = err instanceof Error ? err.message : 'Failed to buy listing';
      return { success: false, error: message };
    } finally {
      setIsPending(false);
    }
  }, [address, isConnected, listings, balance, isContractDeployed, writeContractAsync, loadListings]);
  
  /**
   * Cancel a listing
   */
  const cancelListing = useCallback(async (listingId: string): Promise<{ success: boolean; error?: string }> => {
    if (!address || !isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    const listing = listings.find(l => l.id === listingId);
    if (!listing) {
      return { success: false, error: 'Listing not found' };
    }
    
    // Verify ownership
    if (listing.seller.toLowerCase() !== address.toLowerCase()) {
      return { success: false, error: 'You can only cancel your own listings' };
    }
    
    setIsPending(true);
    setError(null);
    
    try {
      if (isContractDeployed) {
        // Production mode - call contract
        await writeContractAsync({
          address: MARKETPLACE_CONTRACT_ADDRESS as `0x${string}`,
          abi: MARKETPLACE_ABI,
          functionName: 'cancelListing',
          args: [BigInt(listingId)],
        });
        
        // Wait for transaction, then reload
        setTimeout(loadListings, 2000);
        
        return { success: true };
      } else {
        // Demo mode - update listing status
        const allListings = getStoredListings();
        const index = allListings.findIndex(l => l.id === listingId);
        if (index !== -1) {
          allListings[index].status = ListingStatus.Cancelled;
          saveStoredListings(allListings);
        }
        
        // Reload listings
        loadListings();
        
        return { success: true };
      }
    } catch (err) {
      console.error('Cancel listing error:', err);
      const message = err instanceof Error ? err.message : 'Failed to cancel listing';
      return { success: false, error: message };
    } finally {
      setIsPending(false);
    }
  }, [address, isConnected, listings, isContractDeployed, writeContractAsync, loadListings]);
  
  return {
    listings,
    userListings,
    isLoading: isLoading || isDAOLoading,
    error,
    balance,
    balanceFormatted,
    isContractDeployed,
    createListing,
    buyListing,
    cancelListing,
    approveNFT,
    refresh: loadListings,
    availableForListing,
    isPending,
  };
}

// Re-export utilities for use in components
export { truncateAddress, formatPriceFromWei, ListingStatus, calculateDAOFee, calculateSellerProceeds, getDAOFeePercentage, DAO_FEE_BPS };
export type { Listing };
