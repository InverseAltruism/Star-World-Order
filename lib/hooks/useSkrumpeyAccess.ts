'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { DEV_ACCESS_ENABLED } from '@/lib/starSkrumpey';

// Cache configuration
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY = 'swo_skrumpey_access';

interface CachedAccess {
  address: string;
  hasAccess: boolean;
  balance: number;
  timestamp: number;
}

/**
 * Get cached access data from localStorage
 */
function getCachedAccess(address: string): CachedAccess | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const data: CachedAccess = JSON.parse(cached);
    
    // Check if cache is for the same address
    if (data.address.toLowerCase() !== address.toLowerCase()) {
      return null;
    }
    
    // Check if cache is still valid
    const age = Date.now() - data.timestamp;
    if (age > CACHE_TTL) {
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Failed to read cache:', error);
    return null;
  }
}

/**
 * Save access data to localStorage cache
 */
function setCachedAccess(data: CachedAccess): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to write cache:', error);
  }
}

export interface UseSkrumpeyAccessResult {
  /** Whether the wallet has access (holds any Skrumpey NFT) */
  hasAccess: boolean;
  /** Whether access check is in progress */
  isLoading: boolean;
  /** Error message if check failed */
  error: string | null;
  /** Number of Skrumpeys owned */
  balance: number;
  /** Whether wallet is connected */
  isConnected: boolean;
  /** Connected wallet address */
  address: string | undefined;
  /** Refresh access check */
  refresh: () => Promise<void>;
  /** Timestamp of last successful check */
  lastChecked: number | null;
}

/**
 * Hook to check if connected wallet has Skrumpey access
 * 
 * Access is granted to holders of ANY Skrumpey NFT (not just Star trait).
 * This is used for features like the Hangout Hub chat where all Skrumpey holders can participate.
 * 
 * In development mode, access can be enabled for all connected wallets by setting
 * NEXT_PUBLIC_DEV_ACCESS_ENABLED=true in .env.local
 * 
 * Returns access status, balance, and loading state
 */
export function useSkrumpeyAccess(): UseSkrumpeyAccessResult {
  const { address, isConnected } = useAccount();
  const [hasAccess, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [lastChecked, setLastChecked] = useState<number | null>(null);

  const checkAccess = useCallback(async () => {
    if (!address || !isConnected) {
      setHasAccess(false);
      setBalance(0);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Dev mode bypass
    if (DEV_ACCESS_ENABLED) {
      setHasAccess(true);
      setBalance(1); // Simulate 1 Skrumpey in dev mode
      setIsLoading(false);
      setError(null);
      setLastChecked(Date.now());
      return;
    }

    // Check cache first
    const cached = getCachedAccess(address);
    if (cached) {
      setHasAccess(cached.hasAccess);
      setBalance(cached.balance);
      setIsLoading(false);
      setError(null);
      setLastChecked(cached.timestamp);
      return;
    }

    // Perform fresh check via API route (server-side, avoids CORS)
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/skrumpey-access?address=${encodeURIComponent(address)}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to check Skrumpey ownership');
      }
      
      setHasAccess(data.hasAccess);
      setBalance(data.balance);
      setLastChecked(Date.now());

      // Cache the result
      setCachedAccess({
        address,
        hasAccess: data.hasAccess,
        balance: data.balance,
        timestamp: Date.now(),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check Skrumpey ownership';
      setError(errorMessage);
      setHasAccess(false);
      setBalance(0);
    } finally {
      setIsLoading(false);
    }
  }, [address, isConnected]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  return {
    hasAccess,
    isLoading,
    error,
    balance,
    isConnected,
    address,
    refresh: checkAccess,
    lastChecked,
  };
}
