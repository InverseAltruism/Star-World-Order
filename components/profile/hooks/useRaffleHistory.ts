import { useState, useEffect, useCallback } from 'react';
import type { AuthenticatedJsonHeaders } from './useAuthHeaders';
import type { RaffleHistoryEntry } from '../types';

/**
 * Owns the raffle-history data cluster: the entry list, the unviewed-won
 * count (for the tab badge), the fetch (which can optionally mark won raffles
 * as viewed), and the mount effect that primes the badge.
 */
export function useRaffleHistory(
  address: string | undefined,
  getAuthenticatedJsonHeaders: () => Promise<AuthenticatedJsonHeaders>,
) {
  const [raffleHistory, setRaffleHistory] = useState<RaffleHistoryEntry[]>([]);
  const [isLoadingRaffles, setIsLoadingRaffles] = useState(false);
  const [unviewedWonCount, setUnviewedWonCount] = useState(0); // Count of unviewed won raffles from API

  // Fetch raffle history
  // markAsViewed: when true, also marks won raffles as viewed after fetching
  const fetchRaffleHistory = useCallback(async (markAsViewed = false) => {
    if (!address) return;

    setIsLoadingRaffles(true);
    try {
      const response = await fetch(`/api/raffle?type=history&address=${address}`);
      const data = await response.json();

      if (data.success) {
        const entries = data.entries || [];
        setRaffleHistory(entries);
        setUnviewedWonCount(data.unviewedWonCount || 0);

        // Mark won raffles as viewed if requested (when user clicks on raffles tab)
        if (markAsViewed) {
          const unviewedWonRaffles = entries.filter((r: RaffleHistoryEntry) => r.won && !r.hasViewed);
          if (unviewedWonRaffles.length > 0) {
            const headers = await getAuthenticatedJsonHeaders();
            if (!headers) {
              return;
            }
            // Mark asynchronously without blocking
            Promise.allSettled(
              unviewedWonRaffles.map((entry: RaffleHistoryEntry) =>
                fetch('/api/raffle', {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                    action: 'markViewed',
                    walletAddress: address,
                    raffleId: entry.raffle_id,
                  }),
                })
              )
            ).then(() => {
              // Reset the count locally after marking
              setUnviewedWonCount(0);
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch raffle history:', error);
    } finally {
      setIsLoadingRaffles(false);
    }
  }, [address, getAuthenticatedJsonHeaders]);

  // Fetch raffle history on mount to show badge in tab navigation
  useEffect(() => {
    if (address) {
      fetchRaffleHistory(false); // Don't mark as viewed on initial mount
    }
  }, [address, fetchRaffleHistory]);

  return { raffleHistory, isLoadingRaffles, unviewedWonCount, fetchRaffleHistory };
}
