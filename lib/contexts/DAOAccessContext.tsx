'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAccount } from 'wagmi';
import {
  checkStarOwnershipBatched,
  hasStarSkrumpey,
  getStarSkrumpeys,
  DEV_ACCESS_ENABLED,
  OwnedToken,
} from '@/lib/starSkrumpey';

// Cache configuration
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY = 'swo_dao_access';

interface CachedAccess {
  address: string;
  hasAccess: boolean;
  starSkrumpeys: OwnedToken[];
  ownedSkrumpeys: OwnedToken[];
  timestamp: number;
}

interface DAOAccessContextValue {
  hasAccess: boolean;
  isLoading: boolean;
  error: string | null;
  ownedSkrumpeys: OwnedToken[];
  starSkrumpeys: OwnedToken[];
  isConnected: boolean;
  address: string | undefined;
  refresh: () => Promise<void>;
  lastChecked: number | null;
  retryCount: number;
}

const DAOAccessContext = createContext<DAOAccessContextValue | undefined>(undefined);

// In-memory cache for deduplication across components
let pendingCheck: Promise<OwnedToken[]> | null = null;
let lastCheckAddress: string | null = null;

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

/**
 * Clear cache for a specific address or all
 */
function clearCache(address?: string): void {
  if (typeof window === 'undefined') return;
  
  if (!address) {
    localStorage.removeItem(CACHE_KEY);
    return;
  }
  
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const data: CachedAccess = JSON.parse(cached);
      if (data.address.toLowerCase() === address.toLowerCase()) {
        localStorage.removeItem(CACHE_KEY);
      }
    }
  } catch (error) {
    console.error('Failed to clear cache:', error);
  }
}

export function DAOAccessProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const [hasAccess, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownedSkrumpeys, setOwnedSkrumpeys] = useState<OwnedToken[]>([]);
  const [starSkrumpeys, setStarSkrumpeys] = useState<OwnedToken[]>([]);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const checkAccess = useCallback(async (forceRefresh = false) => {
    if (!address || !isConnected) {
      setHasAccess(false);
      setOwnedSkrumpeys([]);
      setStarSkrumpeys([]);
      setError(null);
      setLastChecked(null);
      setRetryCount(0);
      pendingCheck = null;
      lastCheckAddress = null;
      return;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getCachedAccess(address);
      if (cached) {
        console.log('Using cached DAO access data', {
          address: address.slice(0, 10) + '...',
          age: Math.floor((Date.now() - cached.timestamp) / 1000) + 's',
        });
        setOwnedSkrumpeys(cached.ownedSkrumpeys);
        setStarSkrumpeys(cached.starSkrumpeys);
        setHasAccess(cached.hasAccess);
        setLastChecked(cached.timestamp);
        setError(null);
        return;
      }
    }

    // Request deduplication - if a check is in progress for the same address, reuse it
    if (pendingCheck && lastCheckAddress === address.toLowerCase()) {
      console.log('Reusing pending DAO access check', {
        address: address.slice(0, 10) + '...',
      });
      setIsLoading(true);
      try {
        const owned = await pendingCheck;
        const stars = getStarSkrumpeys(owned);
        
        setOwnedSkrumpeys(owned);
        setStarSkrumpeys(stars);
        setHasAccess(hasStarSkrumpey(owned));
        setLastChecked(Date.now());
        setRetryCount(0);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to check DAO access';
        setError(message);
        setRetryCount(prev => prev + 1);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Start a new check and store it for deduplication
      lastCheckAddress = address.toLowerCase();
      pendingCheck = checkStarOwnershipBatched(address);
      
      const owned = await pendingCheck;
      const stars = getStarSkrumpeys(owned);
      const access = hasStarSkrumpey(owned);
      const timestamp = Date.now();
      
      setOwnedSkrumpeys(owned);
      setStarSkrumpeys(stars);
      setHasAccess(access);
      setLastChecked(timestamp);
      setRetryCount(0);
      
      // Cache the results
      setCachedAccess({
        address,
        hasAccess: access,
        starSkrumpeys: stars,
        ownedSkrumpeys: owned,
        timestamp,
      });
      
      console.log('DAO access check complete (cached)', {
        address: address.slice(0, 10) + '...',
        hasAccess: access,
        starCount: stars.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check DAO access';
      setError(message);
      setHasAccess(false);
      setRetryCount(prev => prev + 1);
      console.error('DAO access check failed:', message);
    } finally {
      setIsLoading(false);
      pendingCheck = null;
      lastCheckAddress = null;
    }
  }, [address, isConnected]);

  // Check access when address changes
  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  // Clear cache when address changes
  useEffect(() => {
    if (address) {
      // Clear any cached data for previous addresses
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const data: CachedAccess = JSON.parse(cached);
          if (data.address.toLowerCase() !== address.toLowerCase()) {
            clearCache();
          }
        } catch {
          // Ignore parsing errors
        }
      }
    }
  }, [address]);

  // Development access override
  const effectiveAccess = DEV_ACCESS_ENABLED ? isConnected : hasAccess;

  const value: DAOAccessContextValue = {
    hasAccess: effectiveAccess,
    isLoading,
    error,
    ownedSkrumpeys,
    starSkrumpeys,
    isConnected,
    address,
    refresh: () => checkAccess(true),
    lastChecked,
    retryCount,
  };

  return (
    <DAOAccessContext.Provider value={value}>
      {children}
    </DAOAccessContext.Provider>
  );
}

/**
 * Hook to access DAO access context
 */
export function useDAOAccessContext(): DAOAccessContextValue {
  const context = useContext(DAOAccessContext);
  if (context === undefined) {
    throw new Error('useDAOAccessContext must be used within a DAOAccessProvider');
  }
  return context;
}
