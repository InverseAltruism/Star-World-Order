'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { 
  fetchUserSkrumpeys, 
  hasStarSkrumpey, 
  getStarSkrumpeys,
  STAR_SKRUMPEY_IDS 
} from '@/lib/starSkrumpey';

export interface UseDAOAccessResult {
  /** Whether the wallet has DAO access (holds a Star Skrumpey) */
  hasAccess: boolean;
  /** Whether access check is in progress */
  isLoading: boolean;
  /** Error message if check failed */
  error: string | null;
  /** All Skrumpey token IDs owned by the wallet */
  ownedSkrumpeys: number[];
  /** Star Skrumpey token IDs owned by the wallet */
  starSkrumpeys: number[];
  /** Whether wallet is connected */
  isConnected: boolean;
  /** Connected wallet address */
  address: string | undefined;
  /** Refresh access check */
  refresh: () => Promise<void>;
}

/**
 * Hook to check if connected wallet has DAO access
 * Returns access status, owned NFTs, and loading state
 */
export function useDAOAccess(): UseDAOAccessResult {
  const { address, isConnected } = useAccount();
  const [hasAccess, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownedSkrumpeys, setOwnedSkrumpeys] = useState<number[]>([]);
  const [starSkrumpeys, setStarSkrumpeys] = useState<number[]>([]);

  const checkAccess = useCallback(async () => {
    if (!address || !isConnected) {
      setHasAccess(false);
      setOwnedSkrumpeys([]);
      setStarSkrumpeys([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const owned = await fetchUserSkrumpeys(address);
      setOwnedSkrumpeys(owned);
      
      const stars = getStarSkrumpeys(owned);
      setStarSkrumpeys(stars);
      
      setHasAccess(hasStarSkrumpey(owned));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check DAO access';
      setError(message);
      setHasAccess(false);
    } finally {
      setIsLoading(false);
    }
  }, [address, isConnected]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  // For demo/development: Allow access if allow-list is empty (no restrictions yet)
  const effectiveAccess = STAR_SKRUMPEY_IDS.length === 0 ? true : hasAccess;

  return {
    hasAccess: effectiveAccess,
    isLoading,
    error,
    ownedSkrumpeys,
    starSkrumpeys,
    isConnected,
    address,
    refresh: checkAccess,
  };
}
