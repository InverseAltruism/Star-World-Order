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

// Extended types for database-backed features
export interface ExtendedForumThread extends ForumThread {
  likesCount?: number;
  dislikesCount?: number;
  isEdited?: boolean;
  originalContent?: string;
}

export interface ExtendedForumReply extends ForumReply {
  likesCount?: number;
  dislikesCount?: number;
  isEdited?: boolean;
  originalContent?: string;
}

/**
 * Database proposal format from API
 */
interface DatabaseProposal {
  id: string;
  title: string;
  description: string;
  proposer_address: string;
  proposer_display_name?: string | null;
  state: string;
  for_votes: number;
  against_votes: number;
  abstain_votes: number;
  unique_voter_count: number;
  min_voters: number;
  yes_threshold_percent: number;
  max_abstain_percent: number;
  category: string;
  forum_thread_id: string | null;
  defeat_reason: string | null;
  voting_duration_weeks: number;
  end_time: string | null;
  start_time: string | null;
  created_at: string;
  executed_at: string | null;
  cancelled_at: string | null;
  quorum?: number;
}

export interface UseGovernanceResult {
  // Proposals
  proposals: Proposal[];
  activeProposals: Proposal[];
  pastProposals: Proposal[];
  isLoadingProposals: boolean;
  createNewProposal: (title: string, description: string, votingDurationWeeks?: number, category?: string) => Promise<{ success: boolean; error?: string; proposal?: Proposal }>;
  
  // Voting (enhanced with three-way voting)
  vote: (proposalId: string, support: 'yes' | 'no' | 'abstain' | number, reason?: string) => Promise<{ success: boolean; error?: string }>;
  changeVote: (proposalId: string, newSupport: 'yes' | 'no' | 'abstain' | number, reason?: string) => Promise<{ success: boolean; error?: string }>;
  canChangeVote: (proposalId: string) => Promise<{ allowed: boolean; reason?: string; hoursRemaining?: number }>;
  hasVoted: (proposalId: string) => boolean;
  getUserVoteOnProposal: (proposalId: string) => Vote | undefined;
  getVotesForProposal: (proposalId: string) => Vote[];
  
  // Proposal management
  cancelProposal: (proposalId: string) => Promise<{ success: boolean; error?: string }>;
  canCancelProposal: (proposalId: string) => Promise<{ allowed: boolean; reason?: string; hoursUntilLockout?: number }>;
  
  // Forum
  threads: ForumThread[];
  isLoadingThreads: boolean;
  createNewThread: (title: string, content: string, category: ThreadCategory, proposalId?: string) => Promise<{ success: boolean; error?: string; thread?: ForumThread }>;
  replyToThread: (threadId: string, content: string) => Promise<{ success: boolean; error?: string }>;
  getThreadsByCategory: (category: ThreadCategory) => ForumThread[];
  
  // Forum editing & likes (new)
  editThread: (threadId: string, newContent: string) => Promise<{ success: boolean; error?: string }>;
  editReply: (replyId: string, newContent: string) => Promise<{ success: boolean; error?: string }>;
  toggleLike: (targetId: string, targetType: 'thread' | 'reply', likeType: 'like' | 'dislike') => Promise<{ success: boolean; action?: string }>;
  getUserLikeStatus: (targetId: string, targetType: 'thread' | 'reply') => 'like' | 'dislike' | null;
  likeStatuses: Map<string, 'like' | 'dislike'>;
  
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
 * - Forum likes and editing
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
  
  // Like statuses for forum items
  const [likeStatuses, setLikeStatuses] = useState<Map<string, 'like' | 'dislike'>>(new Map());
  
  // Use database API or fallback to localStorage
  const useDatabase = true; // Flag to enable database-backed features
  
  const isGovernanceDeployed = isGovernanceConfigured();
  const isStakingDeployed = isStakingConfigured();
  
  // User's voting power (number of Star Skrumpeys)
  const votingPower = starSkrumpeys.length;
  
  // Load proposals from API or localStorage
  const loadProposals = useCallback(async () => {
    setIsLoadingProposals(true);
    try {
      if (useDatabase) {
        const response = await fetch('/api/governance?action=proposals');
        const data = await response.json();
        if (data.success && data.proposals) {
          // Convert database format to Proposal format
          const convertedProposals: Proposal[] = data.proposals.map((p: DatabaseProposal) => ({
            id: p.id,
            title: p.title,
            description: p.description,
            proposer: p.proposer_address,
            proposerDisplayName: p.proposer_display_name,
            state: p.state as ProposalState,
            forVotes: p.for_votes,
            againstVotes: p.against_votes,
            startBlock: 0,
            endBlock: 0,
            createdAt: new Date(p.created_at).getTime(),
            executedAt: p.executed_at ? new Date(p.executed_at).getTime() : undefined,
            cancelledAt: p.cancelled_at ? new Date(p.cancelled_at).getTime() : undefined,
            // Extended properties for UI
            votingDurationWeeks: p.voting_duration_weeks,
            endTime: p.end_time,
            startTime: p.start_time,
            quorum: p.quorum,
            forumThreadId: p.forum_thread_id,
          }));
          setProposals(convertedProposals);
        }
      } else {
        const stored = getStoredProposals();
        setProposals(stored);
      }
    } catch (error) {
      console.error('Failed to load proposals:', error);
      // Fallback to localStorage
      const stored = getStoredProposals();
      setProposals(stored);
    } finally {
      setIsLoadingProposals(false);
    }
  }, []);
  
  // Load forum threads from API or localStorage
  const loadThreads = useCallback(async () => {
    setIsLoadingThreads(true);
    try {
      if (useDatabase) {
        const response = await fetch('/api/forum?action=threads');
        const data = await response.json();
        if (data.success && data.threads) {
          // Convert database format to ForumThread format
          const convertedThreads: ForumThread[] = data.threads.map((t: { id: string; title: string; content: string; author_address: string; author_display_name?: string | null; category: string; pinned: number; locked: number; created_at: string; updated_at: string; proposal_id?: string; likes_count?: number; dislikes_count?: number; is_edited?: number; original_content?: string; reply_count?: number }) => ({
            id: t.id,
            title: t.title,
            content: t.content,
            author: t.author_display_name || truncateAddress(t.author_address),
            authorAddress: t.author_address, // Store full address for ownership checks
            authorDisplayName: t.author_display_name,
            category: t.category as ThreadCategory,
            pinned: Boolean(t.pinned),
            locked: Boolean(t.locked),
            createdAt: new Date(t.created_at).getTime(),
            updatedAt: new Date(t.updated_at).getTime(),
            replies: [],
            replyCount: t.reply_count || 0, // Use reply_count from DB
            proposalId: t.proposal_id,
            // Extended properties
            likesCount: t.likes_count || 0,
            dislikesCount: t.dislikes_count || 0,
            isEdited: Boolean(t.is_edited),
            originalContent: t.original_content,
          }));
          setThreads(convertedThreads);
        }
      } else {
        const stored = getStoredThreads();
        setThreads(stored);
      }
    } catch (error) {
      console.error('Failed to load threads:', error);
      // Fallback to localStorage
      const stored = getStoredThreads();
      setThreads(stored);
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
  
  // Create new proposal (with voting duration and category)
  const createNewProposalWithDuration = useCallback(async (
    title: string,
    description: string,
    votingDurationWeeks: number = 1,
    category: string = 'general'
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
      const response = await fetch('/api/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createProposal',
          title: title.trim(),
          description: description.trim(),
          proposerAddress: address,
          votingDurationWeeks,
          category,
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        loadProposals();
        // Also refresh forum threads since a governance thread is auto-created with each proposal
        loadThreads();
        return { success: true, proposal: data.proposal };
      }
      return { success: false, error: data.error || 'Failed to create proposal' };
    } catch (error) {
      console.error('Failed to create proposal:', error);
      // Fallback to localStorage version
      const proposal = createProposal(title.trim(), description.trim(), address);
      loadProposals();
      return { success: true, proposal };
    }
  }, [address, isConnected, votingPower, loadProposals, loadThreads]);
  
  // Vote on proposal (enhanced with three-way voting and signature verification)
  const vote = useCallback(async (
    proposalId: string,
    support: 'yes' | 'no' | 'abstain' | number,
    reason?: string,
    signature?: string,
    signatureData?: { message?: string; timestamp: number; nonce: string; typedData?: any },
    signatureVersion?: 'eip712' | 'eip191'
  ): Promise<{ success: boolean; error?: string }> => {
    if (!address || !isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    if (votingPower === 0) {
      return { success: false, error: 'You need at least 1 Star Skrumpey to vote' };
    }
    
    // Convert string support to number
    let supportValue: number;
    if (typeof support === 'string') {
      supportValue = support === 'yes' ? 1 : support === 'no' ? 0 : 2;
    } else {
      supportValue = support;
    }
    
    try {
      const response = await fetch('/api/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'vote',
          proposalId,
          voterAddress: address,
          support: supportValue,
          votingPower,
          reason,
          // Include signature and nonce for cryptographic verification
          signature,
          nonce: signatureData?.nonce,
          signatureVersion: signatureVersion || 'eip712',
          typedData: signatureData?.typedData,
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        loadProposals();
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to cast vote' };
    } catch (error) {
      console.error('Failed to vote:', error);
      // Fallback to localStorage (with backward compatibility)
      const result = castVote(proposalId, address, supportValue === 1, votingPower, reason);
      if (result.success) {
        loadProposals();
      }
      return result;
    }
  }, [address, isConnected, votingPower, loadProposals]);
  
  // Change vote (new)
  const changeVote = useCallback(async (
    proposalId: string,
    newSupport: 'yes' | 'no' | 'abstain' | number,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!address || !isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    // Convert string support to number
    let supportValue: number;
    if (typeof newSupport === 'string') {
      supportValue = newSupport === 'yes' ? 1 : newSupport === 'no' ? 0 : 2;
    } else {
      supportValue = newSupport;
    }
    
    try {
      const response = await fetch('/api/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'changeVote',
          proposalId,
          voterAddress: address,
          newSupport: supportValue,
          reason,
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        loadProposals();
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to change vote' };
    } catch (error) {
      console.error('Failed to change vote:', error);
      return { success: false, error: 'Failed to change vote' };
    }
  }, [address, isConnected, loadProposals]);
  
  // Check if vote can be changed (new)
  const checkCanChangeVote = useCallback(async (
    proposalId: string
  ): Promise<{ allowed: boolean; reason?: string; hoursRemaining?: number }> => {
    try {
      const response = await fetch(`/api/governance?action=canChangeVote&id=${proposalId}`);
      const data = await response.json();
      if (data.success) {
        return {
          allowed: data.allowed,
          reason: data.reason,
          hoursRemaining: data.hoursRemaining,
        };
      }
      return { allowed: false, reason: 'Failed to check vote change eligibility' };
    } catch (error) {
      console.error('Failed to check vote change:', error);
      return { allowed: false, reason: 'Error checking vote change eligibility' };
    }
  }, []);
  
  // Cancel proposal (new)
  const cancelProposal = useCallback(async (
    proposalId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!address || !isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    try {
      const response = await fetch('/api/governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancelProposal',
          proposalId,
          userAddress: address,
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        loadProposals();
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to cancel proposal' };
    } catch (error) {
      console.error('Failed to cancel proposal:', error);
      return { success: false, error: 'Failed to cancel proposal' };
    }
  }, [address, isConnected, loadProposals]);
  
  // Check if proposal can be cancelled (new)
  const checkCanCancelProposal = useCallback(async (
    proposalId: string
  ): Promise<{ allowed: boolean; reason?: string; hoursUntilLockout?: number }> => {
    if (!address) {
      return { allowed: false, reason: 'Wallet not connected' };
    }
    
    try {
      const response = await fetch(`/api/governance?action=canCancel&id=${proposalId}&address=${address}`);
      const data = await response.json();
      if (data.success) {
        return {
          allowed: data.allowed,
          reason: data.reason,
          hoursUntilLockout: data.hoursUntilLockout,
        };
      }
      return { allowed: false, reason: 'Failed to check cancellation eligibility' };
    } catch (error) {
      console.error('Failed to check cancellation:', error);
      return { allowed: false, reason: 'Error checking cancellation eligibility' };
    }
  }, [address]);
  
  // Check if user has voted
  const checkHasVoted = useCallback((proposalId: string): boolean => {
    if (!address) return false;
    return hasUserVoted(proposalId, address);
  }, [address]);
  
  // Get user's vote on proposal
  const getUserVoteOnProposalFn = useCallback((proposalId: string): Vote | undefined => {
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
      const response = await fetch('/api/forum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createThread',
          title: title.trim(),
          content: content.trim(),
          authorAddress: address,
          category,
          proposalId,
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        loadThreads();
        return { success: true, thread: data.thread };
      }
      return { success: false, error: data.error || 'Failed to create thread' };
    } catch (error) {
      console.error('Failed to create thread:', error);
      // Fallback to localStorage
      const thread = createThread(title.trim(), content.trim(), truncateAddress(address), category, proposalId);
      loadThreads();
      return { success: true, thread };
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
    
    try {
      const response = await fetch('/api/forum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reply',
          threadId,
          content: content.trim(),
          authorAddress: address,
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        loadThreads();
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to add reply' };
    } catch (error) {
      console.error('Failed to add reply:', error);
      // Fallback to localStorage
      const result = addReply(threadId, content.trim(), truncateAddress(address));
      if (result.success) {
        loadThreads();
      }
      return result;
    }
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
  
  // Edit a forum thread
  const editThread = useCallback(async (
    threadId: string,
    newContent: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!address || !isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    if (!newContent.trim()) {
      return { success: false, error: 'Content is required' };
    }
    
    try {
      const response = await fetch('/api/forum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'editThread',
          threadId,
          newContent: newContent.trim(),
          authorAddress: address,
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        loadThreads();
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to edit thread' };
    } catch (error) {
      console.error('Failed to edit thread:', error);
      return { success: false, error: 'Failed to edit thread' };
    }
  }, [address, isConnected, loadThreads]);
  
  // Edit a forum reply
  const editReply = useCallback(async (
    replyId: string,
    newContent: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!address || !isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }
    
    if (!newContent.trim()) {
      return { success: false, error: 'Content is required' };
    }
    
    try {
      const response = await fetch('/api/forum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'editReply',
          replyId,
          newContent: newContent.trim(),
          authorAddress: address,
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        loadThreads();
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to edit reply' };
    } catch (error) {
      console.error('Failed to edit reply:', error);
      return { success: false, error: 'Failed to edit reply' };
    }
  }, [address, isConnected, loadThreads]);
  
  // Toggle like/dislike on thread or reply
  const toggleLike = useCallback(async (
    targetId: string,
    targetType: 'thread' | 'reply',
    likeType: 'like' | 'dislike'
  ): Promise<{ success: boolean; action?: string }> => {
    if (!address || !isConnected) {
      return { success: false };
    }
    
    try {
      const response = await fetch('/api/forum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggleLike',
          userAddress: address,
          targetId,
          targetType,
          likeType,
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        // Update local like status
        setLikeStatuses(prev => {
          const next = new Map(prev);
          if (data.action === 'removed') {
            next.delete(targetId);
          } else {
            next.set(targetId, likeType);
          }
          return next;
        });
        loadThreads();
        return { success: true, action: data.action };
      }
      return { success: false };
    } catch (error) {
      console.error('Failed to toggle like:', error);
      return { success: false };
    }
  }, [address, isConnected, loadThreads]);
  
  // Get user's like status on a target
  const getUserLikeStatusFn = useCallback((targetId: string, targetType: 'thread' | 'reply'): 'like' | 'dislike' | null => {
    return likeStatuses.get(targetId) || null;
  }, [likeStatuses]);
  
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
    createNewProposal: createNewProposalWithDuration,
    
    // Voting (enhanced with three-way voting)
    vote,
    changeVote,
    canChangeVote: checkCanChangeVote,
    hasVoted: checkHasVoted,
    getUserVoteOnProposal: getUserVoteOnProposalFn,
    getVotesForProposal,
    
    // Proposal management
    cancelProposal,
    canCancelProposal: checkCanCancelProposal,
    
    // Forum
    threads,
    isLoadingThreads: isLoadingThreads || isDAOLoading,
    createNewThread,
    replyToThread,
    getThreadsByCategory: getThreadsByCategoryFn,
    
    // Forum editing & likes (new)
    editThread,
    editReply,
    toggleLike,
    getUserLikeStatus: getUserLikeStatusFn,
    likeStatuses,
    
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
