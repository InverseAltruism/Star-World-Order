'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  
  // Load online users
  const loadOnlineUsers = useCallback(() => {
    const users = getOnlineUsers();
    setOnlineUsers(users);
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
  
  // Update online presence periodically
  useEffect(() => {
    if (!address || !isConnected) return;
    
    // Get the first star skrumpey for avatar
    const firstStar = starSkrumpeys[0];
    
    const updatePresenceInterval = () => {
      updateOnlinePresence(address, {
        nftTokenId: firstStar?.tokenId,
        starVariant: firstStar?.starVariant,
        status: 'online',
      });
      loadOnlineUsers();
    };
    
    updatePresenceInterval();
    const interval = setInterval(updatePresenceInterval, 60000); // Update every minute
    
    return () => {
      clearInterval(interval);
      if (address) {
        removeOnlinePresence(address);
      }
    };
  }, [address, isConnected, starSkrumpeys, loadOnlineUsers]);
  
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
  
  // Update online presence
  const updatePresence = useCallback((status: 'online' | 'away' | 'busy') => {
    if (!address) return;
    
    const firstStar = starSkrumpeys[0];
    updateOnlinePresence(address, {
      nftTokenId: firstStar?.tokenId,
      starVariant: firstStar?.starVariant,
      status,
    });
    loadOnlineUsers();
  }, [address, starSkrumpeys, loadOnlineUsers]);
  
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
