'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { useDAOAccess } from './useDAOAccess';
import {
  Proposal,
  ProposalState,
  Vote,
  ForumThread,
  ForumReply,
  ThreadCategory,
  StakingInfo,
  UserStakingSummary,
  getStoredProposals,
  saveStoredProposals,
  createProposal,
  updateProposalState,
  getStoredVotes,
  castVote,
  getProposalVotes,
  hasUserVoted,
  getUserVote,
  getStoredThreads,
  saveStoredThreads,
  createThread,
  addReply,
  getThreadsByCategory,
  getThreadById,
  getUserStakingSummary,
  stakeToken,
  requestUnstake,
  unstakeToken,
  calculateStakingRewards,
  getStoredStakingData,
  isGovernanceConfigured,
  isStakingConfigured,
  getProposalStateLabel,
  getProposalStateColor,
  getCategoryLabel,
  formatRelativeTime,
  truncateAddress,
  formatMON,
  generateId,
} from '@/lib/governance';

export interface UseGovernanceResult {
  // Proposals
  proposals: Proposal[];
  activeProposals: Proposal[];
  pastProposals: Proposal[];
  isLoadingProposals: boolean;
  createNewProposal: (title: string, description: string) => Promise<{ success: boolean; error?: string; proposal?: Proposal }>;
  
  // Voting
  vote: (proposalId: string, support: boolean, reason?: string) => Promise<{ success: boolean; error?: string }>;
  hasVoted: (proposalId: string) => boolean;
  getUserVoteOnProposal: (proposalId: string) => Vote | undefined;
  getVotesForProposal: (proposalId: string) => Vote[];
  
  // Forum
  threads: ForumThread[];
  isLoadingThreads: boolean;
  createNewThread: (title: string, content: string, category: ThreadCategory, proposalId?: string) => Promise<{ success: boolean; error?: string; thread?: ForumThread }>;
  replyToThread: (threadId: string, content: string) => Promise<{ success: boolean; error?: string }>;
  getThreadsByCategory: (category: ThreadCategory) => ForumThread[];
  
  // Staking
  stakingSummary: UserStakingSummary | null;
  isLoadingStaking: boolean;
  stakeNFT: (tokenId: number) => Promise<{ success: boolean; error?: string }>;
  requestUnstakeNFT: (tokenId: number) => Promise<{ success: boolean; error?: string }>;
  unstakeNFT: (tokenId: number) => Promise<{ success: boolean; error?: string; rewards?: bigint }>;
  
  // User info
  votingPower: number;
  isConnected: boolean;
  address: string | undefined;
  
  // Contract status
  isGovernanceDeployed: boolean;
  isStakingDeployed: boolean;
  
  // Refresh
  refresh: () => void;
}

/**
 * Hook for interacting with DAO governance
 * 
 * Provides functions for:
 * - Creating and viewing proposals
 * - Voting on proposals
 * - Managing forum threads
 * - Staking NFTs
 */
export function useGovernance(): UseGovernanceResult {
  const { address, isConnected } = useAccount();
  const { starSkrumpeys, isLoading: isDAOLoading } = useDAOAccess();
  
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [stakingSummary, setStakingSummary] = useState<UserStakingSummary | null>(null);
  const [isLoadingProposals, setIsLoadingProposals] = useState(false);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isLoadingStaking, setIsLoadingStaking] = useState(false);
  
  const isGovernanceDeployed = isGovernanceConfigured();
  const isStakingDeployed = isStakingConfigured();
  
  // User's voting power (number of Star Skrumpeys)
  const votingPower = starSkrumpeys.length;
  
  // Load proposals
  const loadProposals = useCallback(() => {
    setIsLoadingProposals(true);
    try {
      const stored = getStoredProposals();
      setProposals(stored);
    } catch (error) {
      console.error('Failed to load proposals:', error);
    } finally {
      setIsLoadingProposals(false);
    }
  }, []);
  
  // Load forum threads
  const loadThreads = useCallback(() => {
    setIsLoadingThreads(true);
    try {
      const stored = getStoredThreads();
      setThreads(stored);
    } catch (error) {
      console.error('Failed to load threads:', error);
    } finally {
      setIsLoadingThreads(false);
    }
  }, []);
  
  // Load staking summary
  const loadStakingSummary = useCallback(() => {
    if (!address) {
      setStakingSummary(null);
      return;
    }
    
    setIsLoadingStaking(true);
    try {
      const summary = getUserStakingSummary(address);
      setStakingSummary(summary);
    } catch (error) {
      console.error('Failed to load staking summary:', error);
    } finally {
      setIsLoadingStaking(false);
    }
  }, [address]);
  
  // Load all data on mount
  useEffect(() => {
    loadProposals();
    loadThreads();
  }, [loadProposals, loadThreads]);
  
  // Load staking when address changes
  useEffect(() => {
    loadStakingSummary();
  }, [loadStakingSummary]);
  
  // Active and past proposals
  const activeProposals = useMemo(() => 
    proposals.filter(p => p.state === ProposalState.Active || p.state === ProposalState.Pending),
    [proposals]
  );
  
  const pastProposals = useMemo(() =>
    proposals.filter(p => 
      p.state === ProposalState.Defeated || 
      p.state === ProposalState.Succeeded || 
      p.state === ProposalState.Executed ||
      p.state === ProposalState.Cancelled
    ),
    [proposals]
  );
  
  // Create new proposal
  const createNewProposal = useCallback(async (
    title: string,
    description: string
  ): Promise<{ success: boolean; error?: string; proposal?: Proposal }> => {
    if (!address || !isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    if (votingPower === 0) {
      return { success: false, error: 'You need at least 1 Star Skrumpey to create proposals' };
    }
    
    if (!title.trim() || !description.trim()) {
      return { success: false, error: 'Title and description are required' };
    }
    
    try {
      const proposal = createProposal(title.trim(), description.trim(), address);
      loadProposals();
      return { success: true, proposal };
    } catch (error) {
      console.error('Failed to create proposal:', error);
      return { success: false, error: 'Failed to create proposal' };
    }
  }, [address, isConnected, votingPower, loadProposals]);
  
  // Vote on proposal
  const vote = useCallback(async (
    proposalId: string,
    support: boolean,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!address || !isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    if (votingPower === 0) {
      return { success: false, error: 'You need at least 1 Star Skrumpey to vote' };
    }
    
    const result = castVote(proposalId, address, support, votingPower, reason);
    if (result.success) {
      loadProposals();
    }
    return result;
  }, [address, isConnected, votingPower, loadProposals]);
  
  // Check if user has voted
  const checkHasVoted = useCallback((proposalId: string): boolean => {
    if (!address) return false;
    return hasUserVoted(proposalId, address);
  }, [address]);
  
  // Get user's vote on proposal
  const getUserVoteOnProposal = useCallback((proposalId: string): Vote | undefined => {
    if (!address) return undefined;
    return getUserVote(proposalId, address);
  }, [address]);
  
  // Get all votes for a proposal
  const getVotesForProposal = useCallback((proposalId: string): Vote[] => {
    return getProposalVotes(proposalId);
  }, []);
  
  // Create new forum thread
  const createNewThread = useCallback(async (
    title: string,
    content: string,
    category: ThreadCategory,
    proposalId?: string
  ): Promise<{ success: boolean; error?: string; thread?: ForumThread }> => {
    if (!address || !isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    if (votingPower === 0) {
      return { success: false, error: 'You need at least 1 Star Skrumpey to create threads' };
    }
    
    if (!title.trim() || !content.trim()) {
      return { success: false, error: 'Title and content are required' };
    }
    
    try {
      const thread = createThread(title.trim(), content.trim(), truncateAddress(address), category, proposalId);
      loadThreads();
      return { success: true, thread };
    } catch (error) {
      console.error('Failed to create thread:', error);
      return { success: false, error: 'Failed to create thread' };
    }
  }, [address, isConnected, votingPower, loadThreads]);
  
  // Reply to thread
  const replyToThread = useCallback(async (
    threadId: string,
    content: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!address || !isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    if (votingPower === 0) {
      return { success: false, error: 'You need at least 1 Star Skrumpey to reply' };
    }
    
    if (!content.trim()) {
      return { success: false, error: 'Reply content is required' };
    }
    
    const result = addReply(threadId, content.trim(), truncateAddress(address));
    if (result.success) {
      loadThreads();
    }
    return result;
  }, [address, isConnected, votingPower, loadThreads]);
  
  // Get threads by category
  const getThreadsByCategoryFn = useCallback((category: ThreadCategory): ForumThread[] => {
    return threads.filter(t => t.category === category);
  }, [threads]);
  
  // Stake NFT
  const stakeNFT = useCallback(async (tokenId: number): Promise<{ success: boolean; error?: string }> => {
    if (!address || !isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    const result = stakeToken(tokenId, address);
    if (result.success) {
      loadStakingSummary();
    }
    return result;
  }, [address, isConnected, loadStakingSummary]);
  
  // Request unstake
  const requestUnstakeNFT = useCallback(async (tokenId: number): Promise<{ success: boolean; error?: string }> => {
    if (!address || !isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    const result = requestUnstake(tokenId, address);
    if (result.success) {
      loadStakingSummary();
    }
    return result;
  }, [address, isConnected, loadStakingSummary]);
  
  // Complete unstake
  const unstakeNFT = useCallback(async (tokenId: number): Promise<{ success: boolean; error?: string; rewards?: bigint }> => {
    if (!address || !isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    const result = unstakeToken(tokenId, address);
    if (result.success) {
      loadStakingSummary();
    }
    return result;
  }, [address, isConnected, loadStakingSummary]);
  
  // Refresh all data
  const refresh = useCallback(() => {
    loadProposals();
    loadThreads();
    loadStakingSummary();
  }, [loadProposals, loadThreads, loadStakingSummary]);
  
  return {
    // Proposals
    proposals,
    activeProposals,
    pastProposals,
    isLoadingProposals: isLoadingProposals || isDAOLoading,
    createNewProposal,
    
    // Voting
    vote,
    hasVoted: checkHasVoted,
    getUserVoteOnProposal,
    getVotesForProposal,
    
    // Forum
    threads,
    isLoadingThreads: isLoadingThreads || isDAOLoading,
    createNewThread,
    replyToThread,
    getThreadsByCategory: getThreadsByCategoryFn,
    
    // Staking
    stakingSummary,
    isLoadingStaking: isLoadingStaking || isDAOLoading,
    stakeNFT,
    requestUnstakeNFT,
    unstakeNFT,
    
    // User info
    votingPower,
    isConnected,
    address,
    
    // Contract status
    isGovernanceDeployed,
    isStakingDeployed,
    
    // Refresh
    refresh,
  };
}

// Re-export types and utilities
export {
  ProposalState,
  ThreadCategory,
  getProposalStateLabel,
  getProposalStateColor,
  getCategoryLabel,
  formatRelativeTime,
  truncateAddress,
  formatMON,
};
export type { Proposal, Vote, ForumThread, ForumReply, StakingInfo, UserStakingSummary };
