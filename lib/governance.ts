/**
 * Governance Module for Star World Order DAO
 * 
 * This module provides governance functionality including:
 * - Proposal creation and management
 * - Voting on proposals
 * - Proposal state tracking
 * - Integration with on-chain governance contracts
 * 
 * Governance Model:
 * - NFT-weighted voting (1 Star Skrumpey = 1 vote)
 * - Configurable voting periods and quorum
 * - Proposal lifecycle: Pending → Active → Defeated/Succeeded → Executed
 * 
 * Open Source Governance Libraries Reference:
 * 
 * 1. OpenZeppelin Governor (v4.x/v5.x)
 *    - Industry standard governance framework
 *    - Used by Compound, Uniswap, ENS, and many more
 *    - Modular design with extensions for various voting mechanisms
 *    - GitHub: https://github.com/OpenZeppelin/openzeppelin-contracts/tree/master/contracts/governance
 * 
 * 2. Compound Governance Bravo
 *    - Battle-tested governance implementation
 *    - Proposal creation with action queues
 *    - Timelock for delayed execution
 *    - GitHub: https://github.com/compound-finance/compound-governance
 * 
 * 3. Nouns DAO
 *    - NFT-based governance (1 NFT = 1 vote)
 *    - Fork of Compound Bravo with modifications
 *    - GitHub: https://github.com/nounsDAO/nouns-monorepo
 * 
 * 4. Snapshot.org
 *    - Off-chain voting with on-chain verification
 *    - Gasless voting using signatures
 *    - Supports multiple voting strategies
 *    - GitHub: https://github.com/snapshot-labs
 * 
 * For Star World Order, we use a hybrid approach:
 * - On-chain proposal storage and execution
 * - NFT-based voting power (Star Skrumpeys)
 * - Optional off-chain discussion via forum
 */

import { createPublicClient, http, parseEther, formatEther } from 'viem';
import { monad } from './wagmi';
import { SKRUMPEY_CONTRACT_ADDRESS } from './starSkrumpey';

/**
 * Governance contract address on Monad
 */
export const GOVERNANCE_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_GOVERNANCE_CONTRACT || '0x0000000000000000000000000000000000000000';

/**
 * Staking contract address on Monad
 */
export const STAKING_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_STAKING_CONTRACT || '0x0000000000000000000000000000000000000000';

/**
 * Zero address constant
 */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

/**
 * Check if governance contract is configured
 */
export function isGovernanceConfigured(): boolean {
  return GOVERNANCE_CONTRACT_ADDRESS !== ZERO_ADDRESS && 
         GOVERNANCE_CONTRACT_ADDRESS !== '';
}

/**
 * Check if staking contract is configured
 */
export function isStakingConfigured(): boolean {
  return STAKING_CONTRACT_ADDRESS !== ZERO_ADDRESS && 
         STAKING_CONTRACT_ADDRESS !== '';
}

/**
 * Proposal state enum
 */
export enum ProposalState {
  Pending = 'pending',
  Active = 'active',
  Defeated = 'defeated',
  Succeeded = 'succeeded',
  Executed = 'executed',
  Cancelled = 'cancelled',
}

/**
 * Proposal interface
 */
export interface Proposal {
  id: string;
  title: string;
  description: string;
  proposer: string;
  state: ProposalState;
  forVotes: number;
  againstVotes: number;
  startBlock: number;
  endBlock: number;
  createdAt: number;
  executedAt?: number;
  cancelledAt?: number;
}

/**
 * Vote interface
 */
export interface Vote {
  proposalId: string;
  voter: string;
  support: boolean;
  weight: number;
  reason?: string;
  timestamp: number;
}

/**
 * Forum thread interface
 */
export interface ForumThread {
  id: string;
  title: string;
  content: string;
  author: string;
  createdAt: number;
  updatedAt: number;
  replies: ForumReply[];
  pinned: boolean;
  locked: boolean;
  category: ThreadCategory;
  proposalId?: string; // Link to governance proposal if applicable
  // Extended fields for database-backed forum
  likesCount?: number;
  dislikesCount?: number;
  isEdited?: boolean;
  originalContent?: string;
}

/**
 * Forum reply interface
 */
export interface ForumReply {
  id: string;
  threadId: string;
  content: string;
  author: string;
  createdAt: number;
  likes: number;
  // Extended fields for database-backed forum
  likesCount?: number;
  dislikesCount?: number;
  isEdited?: boolean;
  originalContent?: string;
}

/**
 * Thread category enum
 */
export enum ThreadCategory {
  General = 'general',
  Proposals = 'proposals',
  Ideas = 'ideas',
  Support = 'support',
  Announcements = 'announcements',
}

/**
 * Staking info interface
 */
export interface StakingInfo {
  tokenId: number;
  owner: string;
  stakedAt: number;
  lastClaimAt: number;
  unstakeRequestAt: number;
  isStaked: boolean;
  pendingRewards: bigint;
  multiplier: number;
}

/**
 * User staking summary
 */
export interface UserStakingSummary {
  stakedTokens: number[];
  totalStaked: number;
  totalPendingRewards: bigint;
  totalClaimedRewards: bigint;
}

/**
 * Storage keys for local storage (demo mode)
 */
const PROPOSALS_STORAGE_KEY = 'swo_governance_proposals';
const VOTES_STORAGE_KEY = 'swo_governance_votes';
const FORUM_THREADS_STORAGE_KEY = 'swo_forum_threads';
const STAKING_STORAGE_KEY = 'swo_staking_data';

/**
 * Generate unique ID
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * Create public client for Monad
 */
export function getPublicClient() {
  return createPublicClient({
    chain: monad,
    transport: http(),
  });
}

// ============ Proposal Functions ============

/**
 * Get stored proposals from localStorage (demo mode)
 */
export function getStoredProposals(): Proposal[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(PROPOSALS_STORAGE_KEY);
    if (!stored) return getDefaultProposals();
    return JSON.parse(stored);
  } catch {
    return getDefaultProposals();
  }
}

/**
 * Save proposals to localStorage (demo mode)
 */
export function saveStoredProposals(proposals: Proposal[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(PROPOSALS_STORAGE_KEY, JSON.stringify(proposals));
  } catch (error) {
    console.error('Failed to save proposals:', error);
  }
}

/**
 * Get default demo proposals
 */
function getDefaultProposals(): Proposal[] {
  const now = Date.now();
  return [
    {
      id: 'swo-001',
      title: 'SWO-001: Expand Star Trait Collection',
      description: 'Proposal to mint additional Star trait NFTs for new members joining the Star World Order. This would allow for controlled growth of the DAO while maintaining exclusivity.\n\nKey points:\n- Mint up to 50 new Star Skrumpeys\n- Distribution through community events\n- Existing holder vote required\n- 30-day vesting period for new mints',
      proposer: '0x1234567890abcdef1234567890abcdef12345678',
      state: ProposalState.Active,
      forVotes: 42,
      againstVotes: 7,
      startBlock: 1000000,
      endBlock: 1100000,
      createdAt: now - 3 * 24 * 60 * 60 * 1000, // 3 days ago
    },
    {
      id: 'swo-002',
      title: 'SWO-002: Treasury Allocation for Development',
      description: 'Allocate 10% of the DAO treasury for ongoing development efforts including:\n\n- Smart contract audits\n- UI/UX improvements\n- Infrastructure costs\n- Developer bounties\n\nThis allocation would be managed by a 3/5 multisig consisting of elected community members.',
      proposer: '0xabcdef1234567890abcdef1234567890abcdef12',
      state: ProposalState.Succeeded,
      forVotes: 88,
      againstVotes: 12,
      startBlock: 900000,
      endBlock: 1000000,
      createdAt: now - 14 * 24 * 60 * 60 * 1000, // 14 days ago
      executedAt: now - 7 * 24 * 60 * 60 * 1000, // 7 days ago
    },
    {
      id: 'swo-003',
      title: 'SWO-003: Community Art Contest',
      description: 'Host a pixel art contest for community engagement with prizes from the treasury:\n\n- 1st Place: 1000 MON\n- 2nd Place: 500 MON\n- 3rd Place: 250 MON\n\nTheme: "The Cosmic Realm"\nDuration: 2 weeks\nJudging: Community vote',
      proposer: '0x9876543210fedcba9876543210fedcba98765432',
      state: ProposalState.Pending,
      forVotes: 0,
      againstVotes: 0,
      startBlock: 1200000,
      endBlock: 1300000,
      createdAt: now - 1 * 24 * 60 * 60 * 1000, // 1 day ago
    },
    {
      id: 'swo-004',
      title: 'SWO-004: Partnership with Monad Ecosystem',
      description: 'Establish formal partnerships with other projects in the Monad ecosystem:\n\n- Cross-promotion agreements\n- Shared liquidity pools\n- Collaborative NFT drops\n- Joint governance initiatives',
      proposer: '0xfedcba9876543210fedcba9876543210fedcba98',
      state: ProposalState.Defeated,
      forVotes: 15,
      againstVotes: 45,
      startBlock: 800000,
      endBlock: 900000,
      createdAt: now - 21 * 24 * 60 * 60 * 1000, // 21 days ago
    },
  ];
}

/**
 * Create a new proposal
 */
export function createProposal(
  title: string,
  description: string,
  proposer: string
): Proposal {
  const proposals = getStoredProposals();
  const proposalNumber = proposals.length + 1;
  
  const newProposal: Proposal = {
    id: `swo-${String(proposalNumber).padStart(3, '0')}`,
    title: `SWO-${String(proposalNumber).padStart(3, '0')}: ${title}`,
    description,
    proposer,
    state: ProposalState.Pending,
    forVotes: 0,
    againstVotes: 0,
    startBlock: 0, // Would be set from contract
    endBlock: 0,
    createdAt: Date.now(),
  };
  
  proposals.unshift(newProposal);
  saveStoredProposals(proposals);
  
  return newProposal;
}

/**
 * Update proposal state
 */
export function updateProposalState(proposalId: string, newState: ProposalState): void {
  const proposals = getStoredProposals();
  const index = proposals.findIndex(p => p.id === proposalId);
  
  if (index !== -1) {
    proposals[index].state = newState;
    if (newState === ProposalState.Executed) {
      proposals[index].executedAt = Date.now();
    } else if (newState === ProposalState.Cancelled) {
      proposals[index].cancelledAt = Date.now();
    }
    saveStoredProposals(proposals);
  }
}

// ============ Voting Functions ============

/**
 * Get stored votes from localStorage (demo mode)
 */
export function getStoredVotes(): Vote[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(VOTES_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Save votes to localStorage (demo mode)
 */
export function saveStoredVotes(votes: Vote[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(VOTES_STORAGE_KEY, JSON.stringify(votes));
  } catch (error) {
    console.error('Failed to save votes:', error);
  }
}

/**
 * Cast a vote on a proposal
 */
export function castVote(
  proposalId: string,
  voter: string,
  support: boolean,
  weight: number,
  reason?: string
): { success: boolean; error?: string } {
  const votes = getStoredVotes();
  
  // Check if already voted
  const existingVote = votes.find(
    v => v.proposalId === proposalId && v.voter.toLowerCase() === voter.toLowerCase()
  );
  
  if (existingVote) {
    return { success: false, error: 'You have already voted on this proposal' };
  }
  
  // Create vote
  const newVote: Vote = {
    proposalId,
    voter,
    support,
    weight,
    reason,
    timestamp: Date.now(),
  };
  
  votes.push(newVote);
  saveStoredVotes(votes);
  
  // Update proposal vote counts
  const proposals = getStoredProposals();
  const proposalIndex = proposals.findIndex(p => p.id === proposalId);
  
  if (proposalIndex !== -1) {
    if (support) {
      proposals[proposalIndex].forVotes += weight;
    } else {
      proposals[proposalIndex].againstVotes += weight;
    }
    saveStoredProposals(proposals);
  }
  
  return { success: true };
}

/**
 * Get votes for a proposal
 */
export function getProposalVotes(proposalId: string): Vote[] {
  return getStoredVotes().filter(v => v.proposalId === proposalId);
}

/**
 * Check if user has voted on a proposal
 */
export function hasUserVoted(proposalId: string, voter: string): boolean {
  return getStoredVotes().some(
    v => v.proposalId === proposalId && v.voter.toLowerCase() === voter.toLowerCase()
  );
}

/**
 * Get user's vote on a proposal
 */
export function getUserVote(proposalId: string, voter: string): Vote | undefined {
  return getStoredVotes().find(
    v => v.proposalId === proposalId && v.voter.toLowerCase() === voter.toLowerCase()
  );
}

// ============ Forum Functions ============

/**
 * Get stored forum threads from localStorage (demo mode)
 */
export function getStoredThreads(): ForumThread[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(FORUM_THREADS_STORAGE_KEY);
    if (!stored) return getDefaultThreads();
    return JSON.parse(stored);
  } catch {
    return getDefaultThreads();
  }
}

/**
 * Save forum threads to localStorage (demo mode)
 */
export function saveStoredThreads(threads: ForumThread[]): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(FORUM_THREADS_STORAGE_KEY, JSON.stringify(threads));
  } catch (error) {
    console.error('Failed to save threads:', error);
  }
}

/**
 * Get default demo forum threads
 */
function getDefaultThreads(): ForumThread[] {
  const now = Date.now();
  
  // Pre-generate thread IDs so we can reference them in replies
  const thread1Id = generateId();
  const thread2Id = generateId();
  const thread3Id = generateId();
  const thread4Id = generateId();
  
  return [
    {
      id: thread1Id,
      title: 'Welcome to Star World Order!',
      content: 'Welcome, Star bearers! This is the official Star Council forum where we discuss all things related to the Star World Order DAO.\n\n**Forum Guidelines:**\n- Be respectful to fellow members\n- Stay on topic\n- No spam or self-promotion\n- Have fun!\n\n✦ chosen by the stars ✦',
      author: '0x1234...abcd',
      createdAt: now - 30 * 24 * 60 * 60 * 1000,
      updatedAt: now - 2 * 60 * 60 * 1000,
      replies: [
        {
          id: generateId(),
          threadId: thread1Id,
          content: 'Excited to be part of this community! 🌟',
          author: '0x5678...efgh',
          createdAt: now - 25 * 24 * 60 * 60 * 1000,
          likes: 15,
        },
        {
          id: generateId(),
          threadId: thread1Id,
          content: 'The N64 vibes are amazing. Love the aesthetic!',
          author: '0x9abc...ijkl',
          createdAt: now - 20 * 24 * 60 * 60 * 1000,
          likes: 23,
        },
      ],
      pinned: true,
      locked: false,
      category: ThreadCategory.Announcements,
    },
    {
      id: thread2Id,
      title: 'Ideas for next proposal',
      content: 'Hey everyone! I wanted to start a discussion about potential future proposals. What features or initiatives would you like to see in the Star World Order?\n\nSome ideas I\'ve been thinking about:\n- NFT staking rewards\n- Collaborative art projects\n- Cross-chain expansion\n\nWhat do you think?',
      author: '0x5678...efgh',
      createdAt: now - 7 * 24 * 60 * 60 * 1000,
      updatedAt: now - 5 * 60 * 60 * 1000,
      replies: [
        {
          id: generateId(),
          threadId: thread2Id,
          content: 'I love the staking rewards idea! Would incentivize long-term holding.',
          author: '0xmnop...qrst',
          createdAt: now - 6 * 24 * 60 * 60 * 1000,
          likes: 8,
        },
      ],
      pinned: false,
      locked: false,
      category: ThreadCategory.Ideas,
    },
    {
      id: thread3Id,
      title: 'Star Skrumpey lore discussion',
      content: 'I\'ve been diving deep into the lore behind Star Skrumpeys. These cosmic creatures are fascinating!\n\nDid you know each star variant has unique properties?\n- **Aether**: Ethereal cosmic energy\n- **Spectra**: Spectral light patterns\n- **Solveil**: Solar essence\n- **Nebulu**: Nebula-infused\n\nWhat\'s your favorite variant and why?',
      author: '0x9abc...ijkl',
      createdAt: now - 14 * 24 * 60 * 60 * 1000,
      updatedAt: now - 24 * 60 * 60 * 1000,
      replies: [
        {
          id: generateId(),
          threadId: thread3Id,
          content: 'Aether gang! The ethereal vibes are unmatched.',
          author: '0xuvwx...yz12',
          createdAt: now - 10 * 24 * 60 * 60 * 1000,
          likes: 12,
        },
        {
          id: generateId(),
          threadId: thread3Id,
          content: 'Monflare for me - that Monad energy hits different 🔥',
          author: '0x3456...7890',
          createdAt: now - 8 * 24 * 60 * 60 * 1000,
          likes: 18,
        },
      ],
      pinned: false,
      locked: false,
      category: ThreadCategory.General,
    },
    {
      id: thread4Id,
      title: 'Discussion: SWO-001 Expansion Proposal',
      content: 'This thread is for discussing the SWO-001 proposal to expand the Star trait collection.\n\n**Key Questions:**\n1. How many new Star Skrumpeys should be minted?\n2. How should they be distributed?\n3. What impact will this have on existing holders?\n\nPlease share your thoughts!',
      author: '0x1234...abcd',
      createdAt: now - 3 * 24 * 60 * 60 * 1000,
      updatedAt: now - 6 * 60 * 60 * 1000,
      replies: [
        {
          id: generateId(),
          threadId: thread4Id,
          content: 'I think 50 is a good number. Not too many to dilute, but enough to grow.',
          author: '0xdefg...hijk',
          createdAt: now - 2 * 24 * 60 * 60 * 1000,
          likes: 5,
        },
      ],
      pinned: false,
      locked: false,
      category: ThreadCategory.Proposals,
      proposalId: 'swo-001',
    },
  ];
}

/**
 * Create a new forum thread
 */
export function createThread(
  title: string,
  content: string,
  author: string,
  category: ThreadCategory,
  proposalId?: string
): ForumThread {
  const threads = getStoredThreads();
  
  const newThread: ForumThread = {
    id: generateId(),
    title,
    content,
    author,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    replies: [],
    pinned: false,
    locked: false,
    category,
    proposalId,
  };
  
  threads.unshift(newThread);
  saveStoredThreads(threads);
  
  return newThread;
}

/**
 * Add a reply to a thread
 */
export function addReply(
  threadId: string,
  content: string,
  author: string
): { success: boolean; error?: string } {
  const threads = getStoredThreads();
  const threadIndex = threads.findIndex(t => t.id === threadId);
  
  if (threadIndex === -1) {
    return { success: false, error: 'Thread not found' };
  }
  
  if (threads[threadIndex].locked) {
    return { success: false, error: 'Thread is locked' };
  }
  
  const newReply: ForumReply = {
    id: generateId(),
    threadId,
    content,
    author,
    createdAt: Date.now(),
    likes: 0,
  };
  
  threads[threadIndex].replies.push(newReply);
  threads[threadIndex].updatedAt = Date.now();
  saveStoredThreads(threads);
  
  return { success: true };
}

/**
 * Get threads by category
 */
export function getThreadsByCategory(category: ThreadCategory): ForumThread[] {
  return getStoredThreads().filter(t => t.category === category);
}

/**
 * Get thread by ID
 */
export function getThreadById(threadId: string): ForumThread | undefined {
  return getStoredThreads().find(t => t.id === threadId);
}

// ============ Staking Functions (Demo Mode) ============

/**
 * Get staking data from localStorage (demo mode)
 */
export function getStoredStakingData(): Map<string, StakingInfo> {
  if (typeof window === 'undefined') return new Map();
  
  try {
    const stored = localStorage.getItem(STAKING_STORAGE_KEY);
    if (!stored) return new Map();
    const parsed = JSON.parse(stored);
    return new Map(Object.entries(parsed).map(([k, v]) => {
      const info = v as StakingInfo & { pendingRewards: string };
      return [k, { ...info, pendingRewards: BigInt(info.pendingRewards) }];
    }));
  } catch {
    return new Map();
  }
}

/**
 * Save staking data to localStorage (demo mode)
 */
export function saveStoredStakingData(data: Map<string, StakingInfo>): void {
  if (typeof window === 'undefined') return;
  
  try {
    const serializable: Record<string, Omit<StakingInfo, 'pendingRewards'> & { pendingRewards: string }> = {};
    data.forEach((value, key) => {
      serializable[key] = { 
        tokenId: value.tokenId,
        owner: value.owner,
        stakedAt: value.stakedAt,
        lastClaimAt: value.lastClaimAt,
        unstakeRequestAt: value.unstakeRequestAt,
        isStaked: value.isStaked,
        multiplier: value.multiplier,
        pendingRewards: value.pendingRewards.toString(),
      };
    });
    localStorage.setItem(STAKING_STORAGE_KEY, JSON.stringify(serializable));
  } catch (error) {
    console.error('Failed to save staking data:', error);
  }
}

/**
 * Stake a token (demo mode)
 */
export function stakeToken(tokenId: number, owner: string): { success: boolean; error?: string } {
  const stakingData = getStoredStakingData();
  const key = tokenId.toString();
  
  if (stakingData.has(key) && stakingData.get(key)!.isStaked) {
    return { success: false, error: 'Token already staked' };
  }
  
  const stakeInfo: StakingInfo = {
    tokenId,
    owner,
    stakedAt: Date.now(),
    lastClaimAt: Date.now(),
    unstakeRequestAt: 0,
    isStaked: true,
    pendingRewards: BigInt(0),
    multiplier: 100,
  };
  
  stakingData.set(key, stakeInfo);
  saveStoredStakingData(stakingData);
  
  return { success: true };
}

/**
 * Request unstake (demo mode)
 */
export function requestUnstake(tokenId: number, owner: string): { success: boolean; error?: string } {
  const stakingData = getStoredStakingData();
  const key = tokenId.toString();
  const stakeInfo = stakingData.get(key);
  
  if (!stakeInfo || !stakeInfo.isStaked) {
    return { success: false, error: 'Token not staked' };
  }
  
  if (stakeInfo.owner.toLowerCase() !== owner.toLowerCase()) {
    return { success: false, error: 'Not token owner' };
  }
  
  stakeInfo.unstakeRequestAt = Date.now();
  stakingData.set(key, stakeInfo);
  saveStoredStakingData(stakingData);
  
  return { success: true };
}

/**
 * Complete unstake (demo mode)
 */
export function unstakeToken(tokenId: number, owner: string): { success: boolean; error?: string; rewards?: bigint } {
  const stakingData = getStoredStakingData();
  const key = tokenId.toString();
  const stakeInfo = stakingData.get(key);
  
  if (!stakeInfo || !stakeInfo.isStaked) {
    return { success: false, error: 'Token not staked' };
  }
  
  if (stakeInfo.owner.toLowerCase() !== owner.toLowerCase()) {
    return { success: false, error: 'Not token owner' };
  }
  
  // Check cooldown (7 days in demo mode)
  const cooldownMs = 7 * 24 * 60 * 60 * 1000;
  if (stakeInfo.unstakeRequestAt === 0) {
    return { success: false, error: 'Unstake not requested' };
  }
  
  if (Date.now() < stakeInfo.unstakeRequestAt + cooldownMs) {
    return { success: false, error: 'Cooldown not complete' };
  }
  
  // Calculate rewards
  const rewards = calculateStakingRewards(stakeInfo);
  
  // Remove stake
  stakingData.delete(key);
  saveStoredStakingData(stakingData);
  
  return { success: true, rewards };
}

/**
 * Calculate staking rewards (demo mode)
 */
export function calculateStakingRewards(stakeInfo: StakingInfo): bigint {
  if (!stakeInfo.isStaked) return BigInt(0);
  
  const now = Date.now();
  const stakeDuration = now - stakeInfo.lastClaimAt;
  const baseRewardPerDay = parseEther('0.01'); // 0.01 MON per day base
  const daysStaked = stakeDuration / (24 * 60 * 60 * 1000);
  
  // Apply multiplier based on stake duration
  let multiplier = 100;
  const totalStakeDuration = now - stakeInfo.stakedAt;
  const daysTotal = totalStakeDuration / (24 * 60 * 60 * 1000);
  
  if (daysTotal >= 365) multiplier = 200;
  else if (daysTotal >= 180) multiplier = 175;
  else if (daysTotal >= 90) multiplier = 150;
  else if (daysTotal >= 30) multiplier = 130;
  else if (daysTotal >= 7) multiplier = 110;
  
  return (baseRewardPerDay * BigInt(Math.floor(daysStaked * 100)) * BigInt(multiplier)) / BigInt(10000);
}

/**
 * Get user staking summary (demo mode)
 */
export function getUserStakingSummary(userAddress: string): UserStakingSummary {
  const stakingData = getStoredStakingData();
  const stakedTokens: number[] = [];
  let totalPendingRewards = BigInt(0);
  
  stakingData.forEach((stakeInfo) => {
    if (stakeInfo.owner.toLowerCase() === userAddress.toLowerCase() && stakeInfo.isStaked) {
      stakedTokens.push(stakeInfo.tokenId);
      totalPendingRewards += calculateStakingRewards(stakeInfo);
    }
  });
  
  return {
    stakedTokens,
    totalStaked: stakedTokens.length,
    totalPendingRewards,
    totalClaimedRewards: BigInt(0), // Would be tracked in production
  };
}

// ============ Utility Functions ============

/**
 * Get state label for display
 */
export function getProposalStateLabel(state: ProposalState): string {
  switch (state) {
    case ProposalState.Pending:
      return 'Pending';
    case ProposalState.Active:
      return 'Active';
    case ProposalState.Defeated:
      return 'Defeated';
    case ProposalState.Succeeded:
      return 'Passed';
    case ProposalState.Executed:
      return 'Executed';
    case ProposalState.Cancelled:
      return 'Cancelled';
    default:
      return 'Unknown';
  }
}

/**
 * Get state color for display
 */
export function getProposalStateColor(state: ProposalState): string {
  switch (state) {
    case ProposalState.Pending:
      return '#9966ff';
    case ProposalState.Active:
      return '#44ff88';
    case ProposalState.Defeated:
      return '#ff4466';
    case ProposalState.Succeeded:
      return '#ffd700';
    case ProposalState.Executed:
      return '#00ffff';
    case ProposalState.Cancelled:
      return '#666666';
    default:
      return '#666666';
  }
}

/**
 * Get category label for display
 */
export function getCategoryLabel(category: ThreadCategory): string {
  switch (category) {
    case ThreadCategory.General:
      return 'General';
    case ThreadCategory.Proposals:
      return 'Proposals';
    case ThreadCategory.Ideas:
      return 'Ideas';
    case ThreadCategory.Support:
      return 'Support';
    case ThreadCategory.Announcements:
      return 'Announcements';
    default:
      return 'General';
  }
}

/**
 * Format relative time
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 30) return `${Math.floor(days / 30)}mo ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format MON amount
 */
export function formatMON(amount: bigint): string {
  return formatEther(amount);
}
