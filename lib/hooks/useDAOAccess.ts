'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { 
  checkStarOwnershipBatched,
  hasStarSkrumpey, 
  getStarSkrumpeys,
  DEV_ACCESS_ENABLED,
  OwnedToken 
} from '@/lib/starSkrumpey';

export interface UseDAOAccessResult {
  /** Whether the wallet has DAO access (holds a Star Skrumpey) */
  hasAccess: boolean;
  /** Whether access check is in progress */
  isLoading: boolean;
  /** Error message if check failed */
  error: string | null;
  /** All Skrumpey tokens owned by the wallet */
  ownedSkrumpeys: OwnedToken[];
  /** Star Skrumpey tokens owned by the wallet */
  starSkrumpeys: OwnedToken[];
  /** Whether wallet is connected */
  isConnected: boolean;
  /** Connected wallet address */
  address: string | undefined;
  /** Refresh access check */
  refresh: () => Promise<void>;
  /** Timestamp of last successful check */
  lastChecked: number | null;
  /** Number of retry attempts made */
  retryCount: number;
}

/**
 * Hook to check if connected wallet has DAO access
 * 
 * Access is granted only to holders of Star Skrumpey NFTs (tokens with the Star trait).
 * Regular Skrumpey holders do NOT get access - only Star trait holders.
 * 
 * In development mode, access can be enabled for all connected wallets by setting
 * NEXT_PUBLIC_DEV_ACCESS_ENABLED=true in .env.local
 * 
 * Returns access status, owned NFTs, and loading state
 */
export function useDAOAccess(): UseDAOAccessResult {
  const { address, isConnected } = useAccount();
  const [hasAccess, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownedSkrumpeys, setOwnedSkrumpeys] = useState<OwnedToken[]>([]);
  const [starSkrumpeys, setStarSkrumpeys] = useState<OwnedToken[]>([]);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const checkAccess = useCallback(async () => {
    if (!address || !isConnected) {
      setHasAccess(false);
      setOwnedSkrumpeys([]);
      setStarSkrumpeys([]);
      setError(null);
      setLastChecked(null);
      setRetryCount(0);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use the new batched multicall approach to avoid rate limiting
      const owned = await checkStarOwnershipBatched(address);
      setOwnedSkrumpeys(owned);
      
      const stars = getStarSkrumpeys(owned);
      setStarSkrumpeys(stars);
      
      setHasAccess(hasStarSkrumpey(owned));
      setLastChecked(Date.now());
      setRetryCount(0); // Reset retry count on success
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check DAO access';
      setError(message);
      setHasAccess(false);
      setRetryCount(prev => prev + 1);
    } finally {
      setIsLoading(false);
    }
  }, [address, isConnected]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  // Development access override - only enabled when explicitly configured
  // Set NEXT_PUBLIC_DEV_ACCESS_ENABLED=true in .env.local to enable
  // This allows testing the DAO features without holding a Star Skrumpey
  const effectiveAccess = DEV_ACCESS_ENABLED ? isConnected : hasAccess;

  return {
    hasAccess: effectiveAccess,
    isLoading,
    error,
    ownedSkrumpeys,
    starSkrumpeys,
    isConnected,
    address,
    refresh: checkAccess,
    lastChecked,
    retryCount,
  };
}
