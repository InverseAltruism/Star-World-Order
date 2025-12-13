'use client';

import { useContext } from 'react';
import { OwnedToken } from '@/lib/starSkrumpey';

// Import context but make it optional for backward compatibility
let DAOAccessContext: React.Context<any> | undefined;
try {
  const module = require('@/lib/contexts/DAOAccessContext');
  DAOAccessContext = module.DAOAccessContext;
} catch {
  // Context not available, will use standalone mode
}

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
 * 
 * This hook now uses the DAOAccessContext when available, which provides:
 * - Caching with 5-minute TTL
 * - Request deduplication
 * - localStorage persistence across page navigations
 */
export function useDAOAccess(): UseDAOAccessResult {
  // Try to use context if available
  if (DAOAccessContext) {
    try {
      const context = useContext(DAOAccessContext);
      if (context) {
        return context;
      }
    } catch {
      // Context not available, fall through to error
    }
  }

  // Context not available - throw helpful error
  throw new Error(
    'useDAOAccess must be used within a DAOAccessProvider. ' +
    'Wrap your app with <DAOAccessProvider> in providers.tsx'
  );
}
