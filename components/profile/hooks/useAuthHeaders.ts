import { useCallback } from 'react';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';

/**
 * Headers for an authenticated JSON request, or null when no wallet signature
 * is available.
 */
export type AuthenticatedJsonHeaders = {
  'Content-Type': string;
  'x-wallet-auth': string;
} | null;

/**
 * Builds the `{ 'Content-Type', 'x-wallet-auth' }` headers via
 * getWalletAuthHeader. Returns null if there is no address or no signature.
 */
export function useAuthHeaders(address: string | undefined) {
  return useCallback(async (): Promise<AuthenticatedJsonHeaders> => {
    if (!address) {
      return null;
    }
    const walletAuthHeader = await getWalletAuthHeader(address);
    if (!walletAuthHeader) {
      return null;
    }
    return {
      'Content-Type': 'application/json',
      'x-wallet-auth': walletAuthHeader,
    };
  }, [address]);
}
