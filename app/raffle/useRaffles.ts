import { useCallback, useEffect, useRef, useState } from 'react';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';
import type {
  ActiveRaffleData,
  HolderTiers,
  Raffle,
  RaffleEntry,
  SocialConnections,
  UserTier,
} from './types';

/**
 * useRaffles - owns the raffle data layer for the raffle page.
 *
 * Fetches all active + past raffles (with per-raffle detail), the user's tier,
 * holder-tier config, and the user's social connections. It also owns the
 * fetch-driven win/lose result animation state, because the eligibility check
 * (`checkAndShowResultAnimation`) runs *inside* `fetchRaffles` — so the
 * animation flags are a product of the data layer, not of UI actions.
 *
 * Action-driven state (entry confirmation, the entering spinner, tab/UI state)
 * stays in the consuming component. `refetch` lets the component refresh after
 * a successful entry, and `setError` lets it surface entry errors through the
 * same channel as fetch errors.
 *
 * The `fetchIdRef` request-id guard discards stale results (e.g. on a wallet
 * switch) so an older in-flight fetch can't clobber fresher state.
 */
export function useRaffles(address: string | undefined) {
  const [activeRaffles, setActiveRaffles] = useState<ActiveRaffleData[]>([]);
  const [pastRaffles, setPastRaffles] = useState<Raffle[]>([]);
  const [userTier, setUserTier] = useState<UserTier | null>(null);
  const [holderTiers, setHolderTiers] = useState<HolderTiers | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userSocialConnections, setUserSocialConnections] = useState<SocialConnections | null>(null);

  // Fetch-driven result animation state
  const [showWinAnimation, setShowWinAnimation] = useState(false);
  const [showLoseAnimation, setShowLoseAnimation] = useState(false);
  const [winAnimationData, setWinAnimationData] = useState<{ raffleName: string; prizeName: string } | null>(null);

  /**
   * Helper function to check and show win/lose animation for a drawn raffle.
   * Returns true if animation was triggered (to avoid showing multiple animations).
   */
  const checkAndShowResultAnimation = async (
    raffleData: { raffle: Raffle; userEntry: RaffleEntry | null; hasViewedResult: boolean },
    userAddress: string
  ): Promise<boolean> => {
    // Only show animation for drawn raffles the user entered and hasn't viewed yet
    if (raffleData.raffle.status !== 'drawn' || !raffleData.userEntry || raffleData.hasViewedResult) {
      return false;
    }

    const isWinner = raffleData.raffle.winner_address?.toLowerCase() === userAddress.toLowerCase();

    if (isWinner) {
      setWinAnimationData({
        raffleName: raffleData.raffle.name,
        prizeName: raffleData.raffle.prize_description,
      });
      setShowWinAnimation(true);
    } else {
      setShowLoseAnimation(true);
    }

    // Mark as viewed so animation only shows once
    const walletAuthHeader = await getWalletAuthHeader(userAddress);
    if (!walletAuthHeader) {
      return true;
    }

    await fetch('/api/raffle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-auth': walletAuthHeader,
      },
      body: JSON.stringify({
        action: 'markViewed',
        walletAddress: userAddress,
        raffleId: raffleData.raffle.id,
      }),
    });

    return true;
  };

  // Fetch ALL active and past raffles
  const fetchIdRef = useRef(0);
  const fetchRaffles = useCallback(async () => {
    // Request-id guard: if a newer fetchRaffles starts (e.g. wallet switch), the
    // older one's results are discarded instead of clobbering fresh state.
    const myId = ++fetchIdRef.current;
    const isStale = () => fetchIdRef.current !== myId;
    try {
      setIsLoading(true);

      // Fetch both active and past raffles
      const [activeRes, pastRes] = await Promise.all([
        fetch(`/api/raffle?type=active${address ? `&address=${address}` : ''}`),
        fetch(`/api/raffle?type=past${address ? `&address=${address}` : ''}`),
      ]);

      const activeData = await activeRes.json();
      const pastData = await pastRes.json();
      if (isStale()) return;

      // Track if we've shown an animation to avoid showing multiple
      let animationShown = false;

      // Always set past raffles for the History tab
      if (pastData.success) {
        setPastRaffles(pastData.raffles || []);
        setHolderTiers(pastData.holderTiers);

        // Check past (drawn) raffles for win/lose animation. Fetch the details for
        // all drawn-with-entry raffles in PARALLEL, then walk them in order and
        // show the first eligible animation.
        if (address && pastData.raffles) {
          const drawn = (pastData.raffles as Raffle[]).filter(
            (r) => r.status === 'drawn' && r.userEntry
          );
          const details = await Promise.all(
            drawn.map((r) => fetch(`/api/raffle?id=${r.id}&address=${address}`).then((res) => res.json()))
          );
          if (isStale()) return;
          for (const detailData of details) {
            if (detailData.success && !animationShown) {
              animationShown = await checkAndShowResultAnimation(
                {
                  raffle: detailData.raffle,
                  userEntry: detailData.userEntry,
                  hasViewedResult: detailData.hasViewedResult,
                },
                address
              );
              if (animationShown) break;
            }
          }
        }
      }

      if (activeData.success && activeData.raffles.length > 0) {
        // Fetch detailed data for ALL active raffles in parallel
        const raffleDetailsPromises = activeData.raffles.map(async (raffle: Raffle) => {
          const detailRes = await fetch(`/api/raffle?id=${raffle.id}${address ? `&address=${address}` : ''}`);
          const detailData = await detailRes.json();

          if (detailData.success) {
            // Store social connections for later use
            if (detailData.socialConnections) {
              setUserSocialConnections(detailData.socialConnections);
            }

            // Check for winner animation (edge case: drawn but still briefly "active")
            if (!animationShown && address) {
              animationShown = await checkAndShowResultAnimation(
                {
                  raffle: detailData.raffle,
                  userEntry: detailData.userEntry,
                  hasViewedResult: detailData.hasViewedResult,
                },
                address
              );
            }

            return {
              raffle: detailData.raffle,
              entries: detailData.entries || [],
              stats: detailData.stats || { participants: 0, totalTickets: 0 },
              userEntry: detailData.userEntry,
              socialConnections: detailData.socialConnections,
              userTier: detailData.userTier,
              holderTiers: detailData.holderTiers,
            } as ActiveRaffleData & { holderTiers?: HolderTiers | null };
          }
          return null;
        });

        const raffleDetails = (await Promise.all(raffleDetailsPromises)).filter(
          (r): r is ActiveRaffleData & { holderTiers?: HolderTiers | null } => r !== null
        );
        if (isStale()) return;
        setActiveRaffles(raffleDetails);

        // Reuse the first raffle's ALREADY-FETCHED detail for the user's tier
        // (was a redundant extra round-trip).
        if (raffleDetails.length > 0) {
          const first = raffleDetails[0];
          setUserTier(first.userTier);
          if (first.holderTiers) setHolderTiers(first.holderTiers);
        }
      } else if (!isStale()) {
        setActiveRaffles([]);
      }
    } catch (err) {
      console.error('Error fetching raffles:', err);
      if (!isStale()) setError('Failed to load raffles');
    } finally {
      if (!isStale()) setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchRaffles();
  }, [fetchRaffles]);

  return {
    activeRaffles,
    pastRaffles,
    userTier,
    holderTiers,
    isLoading,
    error,
    setError,
    userSocialConnections,
    showWinAnimation,
    setShowWinAnimation,
    showLoseAnimation,
    setShowLoseAnimation,
    winAnimationData,
    refetch: fetchRaffles,
  };
}
