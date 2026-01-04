'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useDAOAccess } from './useDAOAccess';
import {
  StarBalance,
  StakedNFT,
  StarTransaction,
  OnlineUser,
  getUserStarBalance,
  getPendingStars,
  stakeNFTForStar,
  stakeMultipleNFTs,
  unstakeNFTImmediately,
  claimAllPendingStars,
  getVotingPowerBreakdown,
  getStarHistory,
  getTimeUntilNextStar,
  formatStarAmount,
  updateOnlinePresence,
  getOnlineUsers,
  removeOnlinePresence,
  STAR_PER_NFT_PER_DAY,
} from '@/lib/starPoints';

export interface UseStarPointsResult {
  // Balance info
  starBalance: number;
  pendingStars: number;
  totalStars: number;
  stakedNFTs: StakedNFT[];
  
  // Voting power
  votingPower: {
    starBalance: number;
    pendingStars: number;
    stakedNFTCount: number;
    ownedNFTCount: number;
    starVotingPower: number;
    nftVotingPower: number;
    totalVotingPower: number;
    weightedVotingPower: number;
  } | null;
  
  // Available tokens (owned but not staked)
  availableToStake: Array<{ tokenId: number; starVariant?: string }>;
  
  // Staking functions
  stakeNFT: (tokenId: number, starVariant?: string) => { success: boolean; error?: string };
  stakeAll: () => { success: boolean; stakedCount: number };
  unstakeNFT: (tokenId: number) => { success: boolean; error?: string; claimedStars: number };
  claimStars: () => { success: boolean; claimed: number };
  
  // History
  history: StarTransaction[];
  
  // Time tracking
  timeUntilNextStar: { hours: number; minutes: number; seconds: number } | null;
  
  // Online presence
  onlineUsers: OnlineUser[];
  updatePresence: (status: 'online' | 'away' | 'busy') => void;
  
  // Loading states
  isLoading: boolean;
  
  // Refresh
  refresh: () => void;
}

/**
 * Hook for managing STAR points and staking
 */
export function useStarPoints(): UseStarPointsResult {
  const { address, isConnected } = useAccount();
  const { starSkrumpeys, isLoading: isDAOLoading } = useDAOAccess();
  
  const [balance, setBalance] = useState<StarBalance | null>(null);
  const [pendingStars, setPendingStars] = useState(0);
  const [history, setHistory] = useState<StarTransaction[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [timeUntilNext, setTimeUntilNext] = useState<{ hours: number; minutes: number; seconds: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Track previous NFT data to avoid redundant updates
  const prevNFTDataRef = useRef<string>('');
  
  // Helper function to fetch profile data (display name and avatar) from profile (DRY principle)
  const fetchProfileData = useCallback(async (walletAddress: string): Promise<{ displayName?: string; avatarTokenId?: number }> => {
    try {
      const profileResponse = await fetch(`/api/profile?address=${walletAddress}`);
      const profileData = await profileResponse.json();
      if (profileData.success && profileData.profile) {
        const result: { displayName?: string; avatarTokenId?: number } = {};
        if (profileData.profile.display_name) {
          result.displayName = profileData.profile.display_name;
        }
        // avatar_url stores the token ID as a string
        if (profileData.profile.avatar_url) {
          const tokenId = parseInt(profileData.profile.avatar_url, 10);
          if (!isNaN(tokenId)) {
            result.avatarTokenId = tokenId;
          }
        }
        return result;
      }
    } catch (e) {
      console.error('Failed to fetch profile for presence:', e);
    }
    return {};
  }, []);
  
  // Load balance data
  const loadBalance = useCallback(() => {
    if (!address) {
      setBalance(null);
      setPendingStars(0);
      return;
    }
    
    setIsLoading(true);
    try {
      const userBalance = getUserStarBalance(address);
      const pending = getPendingStars(address);
      setBalance(userBalance);
      setPendingStars(pending);
      
      // Load history
      const userHistory = getStarHistory(address);
      setHistory(userHistory);
    } catch (error) {
      console.error('Failed to load STAR balance:', error);
    } finally {
      setIsLoading(false);
    }
  }, [address]);
  
  // Load online users from server API
  const loadOnlineUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/presence');
      const data = await response.json();
      if (data.success && data.users) {
        // Transform server data to OnlineUser format
        const transformedUsers = data.users.map((presence: ApiPresenceUser) => ({
          address: presence.wallet_address,
          displayName: presence.display_name || undefined,
          nftTokenId: presence.nft_token_id || undefined,
          starVariant: presence.star_variant || undefined,
          lastSeen: new Date(presence.last_seen).getTime(),
          status: presence.status,
          lastMessage: presence.last_message || undefined,
          lastMessageAt: presence.last_message_at ? new Date(presence.last_message_at).getTime() : undefined,
        }));
        setOnlineUsers(transformedUsers);
      }
    } catch (error) {
      console.error('Failed to load online users:', error);
      // Fallback to localStorage as backup
      const users = getOnlineUsers();
      setOnlineUsers(users);
    }
  }, []);
  
  // Update time until next STAR
  useEffect(() => {
    if (!balance || balance.stakedNFTs.length === 0) {
      setTimeUntilNext(null);
      return;
    }
    
    // Find the oldest staked NFT's last claim time
    const oldestLastClaim = Math.min(...balance.stakedNFTs.map(nft => nft.lastClaimAt));
    
    const updateTime = () => {
      const time = getTimeUntilNextStar(oldestLastClaim);
      setTimeUntilNext({ hours: time.hours, minutes: time.minutes, seconds: time.seconds });
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    
    return () => clearInterval(interval);
  }, [balance]);
  
  // Load data on mount and when address changes
  useEffect(() => {
    loadBalance();
    loadOnlineUsers();
  }, [loadBalance, loadOnlineUsers]);
  
  // Poll for online users updates every 10 seconds for chat bubbles
  useEffect(() => {
    const interval = setInterval(loadOnlineUsers, 10000);
    return () => clearInterval(interval);
  }, [loadOnlineUsers]);
  
  // Send initial presence immediately when address is available (Issue 2 fix)
  useEffect(() => {
    if (!address || !isConnected) return;
    
    const sendInitialPresence = async () => {
      // Fetch profile data (display name and avatar) from profile
      const { displayName, avatarTokenId } = await fetchProfileData(address);
      // Fallback to first Star Skrumpey if no avatar selected
      const firstStar = starSkrumpeys[0];
      // Validate avatarTokenId is still owned by user, otherwise use first star
      const ownedTokenIds = starSkrumpeys.map(s => s.tokenId);
      const validatedAvatarTokenId = avatarTokenId && ownedTokenIds.includes(avatarTokenId) ? avatarTokenId : undefined;
      const nftTokenId = validatedAvatarTokenId || firstStar?.tokenId;
      
      try {
        await fetch('/api/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: address,
            displayName,
            nftTokenId,
            starVariant: firstStar?.starVariant,
            status: 'online',
          }),
        });
        loadOnlineUsers();
      } catch (error) {
        console.error('Failed to send initial presence:', error);
        // Fallback to localStorage
        updateOnlinePresence(address, {
          nftTokenId,
          status: 'online',
        });
      }
    };
    
    sendInitialPresence();
  }, [address, isConnected, starSkrumpeys, loadOnlineUsers, fetchProfileData]);
  
  // Update online presence with NFT data when available and periodically
  useEffect(() => {
    if (!address || !isConnected) return;
    
    const updatePresenceOnServer = async () => {
      // Fetch profile data (display name and avatar) from profile
      const { displayName, avatarTokenId } = await fetchProfileData(address);
      // Fallback to first Star Skrumpey if no avatar selected
      const firstStar = starSkrumpeys[0];
      // Validate avatarTokenId is still owned by user, otherwise use first star
      const ownedTokenIds = starSkrumpeys.map(s => s.tokenId);
      const validatedAvatarTokenId = avatarTokenId && ownedTokenIds.includes(avatarTokenId) ? avatarTokenId : undefined;
      const nftTokenId = validatedAvatarTokenId || firstStar?.tokenId;
      
      try {
        await fetch('/api/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: address,
            displayName,
            nftTokenId,
            starVariant: firstStar?.starVariant,
            status: 'online',
          }),
        });
        loadOnlineUsers();
      } catch (error) {
        console.error('Failed to update presence:', error);
        // Fallback to localStorage
        updateOnlinePresence(address, {
          nftTokenId,
          starVariant: firstStar?.starVariant,
          status: 'online',
        });
      }
    };
    
    // Update immediately when NFT data is available and has actually changed
    if (starSkrumpeys.length > 0) {
      const currentNFTData = JSON.stringify(starSkrumpeys.map(s => ({ tokenId: s.tokenId, starVariant: s.starVariant })));
      if (currentNFTData !== prevNFTDataRef.current) {
        prevNFTDataRef.current = currentNFTData;
        updatePresenceOnServer();
      }
    }
    
    const interval = setInterval(updatePresenceOnServer, 60000); // Update every 60 seconds
    
    return () => {
      clearInterval(interval);
      if (address) {
        // Remove presence on disconnect using sendBeacon for reliability (Issue 3 fix)
        // sendBeacon uses POST, so we add _method field for the server to handle as DELETE
        const data = JSON.stringify({ walletAddress: address, _method: 'DELETE' });
        const blob = new Blob([data], { type: 'application/json' });
        
        // Try sendBeacon first (more reliable on page close)
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          navigator.sendBeacon('/api/presence', blob);
        } else {
          // Fallback to fetch with DELETE method
          fetch('/api/presence', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress: address }),
          }).catch(() => {
            // Fallback to localStorage
            removeOnlinePresence(address);
          });
        }
      }
    };
  }, [address, isConnected, starSkrumpeys, loadOnlineUsers, fetchProfileData]);
  
  // Calculate voting power
  const votingPower = useMemo(() => {
    if (!address) return null;
    return getVotingPowerBreakdown(address, starSkrumpeys.length);
  }, [address, starSkrumpeys.length, balance, pendingStars]);
  
  // Calculate available tokens (owned but not staked)
  const availableToStake = useMemo(() => {
    if (!balance) return starSkrumpeys;
    
    const stakedIds = new Set(balance.stakedNFTs.map(nft => nft.tokenId));
    return starSkrumpeys.filter(token => !stakedIds.has(token.tokenId));
  }, [starSkrumpeys, balance]);
  
  // Stake a single NFT
  const stakeNFT = useCallback((tokenId: number, starVariant?: string) => {
    if (!address) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    const result = stakeNFTForStar(address, tokenId, starVariant);
    if (result.success) {
      loadBalance();
    }
    return result;
  }, [address, loadBalance]);
  
  // Stake all available NFTs
  const stakeAll = useCallback(() => {
    if (!address) {
      return { success: false, stakedCount: 0 };
    }
    
    const result = stakeMultipleNFTs(address, availableToStake);
    if (result.success) {
      loadBalance();
    }
    return result;
  }, [address, availableToStake, loadBalance]);
  
  // Unstake an NFT (immediate, no cooldown)
  const unstakeNFT = useCallback((tokenId: number) => {
    if (!address) {
      return { success: false, error: 'Wallet not connected', claimedStars: 0 };
    }
    
    const result = unstakeNFTImmediately(address, tokenId);
    if (result.success) {
      loadBalance();
    }
    return result;
  }, [address, loadBalance]);
  
  // Claim all pending STAR
  const claimStars = useCallback(() => {
    if (!address) {
      return { success: false, claimed: 0 };
    }
    
    const result = claimAllPendingStars(address);
    if (result.success) {
      loadBalance();
    }
    return result;
  }, [address, loadBalance]);
  
  // Update online presence using server API
  const updatePresence = useCallback(async (status: 'online' | 'away' | 'busy') => {
    if (!address) return;
    
    // Fetch profile data (display name and avatar) from profile
    const { displayName, avatarTokenId } = await fetchProfileData(address);
    
    const firstStar = starSkrumpeys[0];
    // Validate avatarTokenId is still owned by user, otherwise use first star
    const ownedTokenIds = starSkrumpeys.map(s => s.tokenId);
    const validatedAvatarTokenId = avatarTokenId && ownedTokenIds.includes(avatarTokenId) ? avatarTokenId : undefined;
    const nftTokenId = validatedAvatarTokenId || firstStar?.tokenId;
    try {
      await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          displayName,
          nftTokenId,
          starVariant: firstStar?.starVariant,
          status,
        }),
      });
      loadOnlineUsers();
    } catch (error) {
      console.error('Failed to update presence:', error);
      // Fallback to localStorage
      updateOnlinePresence(address, {
        nftTokenId,
        starVariant: firstStar?.starVariant,
        status,
      });
    }
  }, [address, starSkrumpeys, loadOnlineUsers, fetchProfileData]);
  
  // Refresh all data
  const refresh = useCallback(() => {
    loadBalance();
    loadOnlineUsers();
  }, [loadBalance, loadOnlineUsers]);
  
  return {
    // Balance info
    starBalance: balance?.balance || 0,
    pendingStars,
    totalStars: (balance?.balance || 0) + pendingStars,
    stakedNFTs: balance?.stakedNFTs || [],
    
    // Voting power
    votingPower,
    
    // Available tokens
    availableToStake,
    
    // Staking functions
    stakeNFT,
    stakeAll,
    unstakeNFT,
    claimStars,
    
    // History
    history,
    
    // Time tracking
    timeUntilNextStar: timeUntilNext,
    
    // Online presence
    onlineUsers,
    updatePresence,
    
    // Loading
    isLoading: isLoading || isDAOLoading,
    
    // Refresh
    refresh,
  };
}

// Re-export types
export type { StarBalance, StakedNFT, StarTransaction, OnlineUser };
export { formatStarAmount, STAR_PER_NFT_PER_DAY };

// API response types
interface ApiPresenceUser {
  wallet_address: string;
  display_name: string | null;
  nft_token_id: number | null;
  star_variant: string | null;
  status: 'online' | 'away' | 'busy';
  last_message: string | null;
  last_message_at: string | null;
  last_seen: string;
}
