/**
 * STAR Points System for Star World Order DAO
 * 
 * Staking Mechanics:
 * - 1 Star Skrumpey staked = 1 STAR per 24 hours
 * - Multiple NFTs can be staked simultaneously
 * - No unstaking period (immediate unstaking)
 * - STAR points are earned through staking
 * 
 * Governance Voting Power:
 * - Simple 1:1 voting: 1 Star Skrumpey NFT = 1 Vote
 * - Example: Hold 8 Star Skrumpeys = 8 Voting Power
 * - Simple, fair, and transparent!
 * 
 * Future Features:
 * - Point shop for rewards
 * - Special privileges based on STAR balance
 */

import { formatEther, parseEther } from 'viem';

// Storage keys
const STAR_BALANCE_KEY = 'swo_star_balance';
const STAR_STAKING_KEY = 'swo_star_staking';
const STAR_HISTORY_KEY = 'swo_star_history';

// Constants
export const STAR_PER_NFT_PER_DAY = 1; // 1 STAR per staked NFT per 24 hours
export const STAR_ACCRUAL_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Staked NFT info
 */
export interface StakedNFT {
  tokenId: number;
  stakedAt: number; // Timestamp when staked
  lastClaimAt: number; // Last time STAR was claimed
  starVariant?: string;
}

/**
 * User STAR balance data
 */
export interface StarBalance {
  address: string;
  balance: number; // Total STAR earned
  stakedNFTs: StakedNFT[];
  lastUpdated: number;
}

/**
 * STAR transaction history entry
 */
export interface StarTransaction {
  id: string;
  address: string;
  type: 'stake' | 'unstake' | 'claim' | 'spend' | 'governance_vote';
  amount: number;
  tokenId?: number;
  timestamp: number;
  description: string;
}

/**
 * Governance vote with voting power
 */
export interface WeightedVote {
  address: string;
  starBalance: number;
  nftCount: number;
  rawVotingPower: number; // Total NFT count
  weightedVotingPower: number; // 1 NFT = 1 Vote
  support: boolean;
  reason?: string;
}

// ============ Storage Functions ============

/**
 * Get all STAR balances from storage
 */
export function getAllStarBalances(): Map<string, StarBalance> {
  if (typeof window === 'undefined') return new Map();
  
  try {
    const stored = localStorage.getItem(STAR_BALANCE_KEY);
    if (!stored) return new Map();
    const parsed = JSON.parse(stored);
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

/**
 * Save all STAR balances to storage
 */
export function saveAllStarBalances(balances: Map<string, StarBalance>): void {
  if (typeof window === 'undefined') return;
  
  try {
    const obj: Record<string, StarBalance> = {};
    balances.forEach((value, key) => {
      obj[key.toLowerCase()] = value;
    });
    localStorage.setItem(STAR_BALANCE_KEY, JSON.stringify(obj));
  } catch (error) {
    console.error('Failed to save STAR balances:', error);
  }
}

/**
 * Get user's STAR balance
 */
export function getUserStarBalance(address: string): StarBalance {
  const balances = getAllStarBalances();
  const existing = balances.get(address.toLowerCase());
  
  if (existing) {
    // Update pending STAR from staked NFTs
    return updatePendingStars(existing);
  }
  
  return {
    address: address.toLowerCase(),
    balance: 0,
    stakedNFTs: [],
    lastUpdated: Date.now(),
  };
}

/**
 * Update pending STAR for staked NFTs
 */
function updatePendingStars(balance: StarBalance): StarBalance {
  const now = Date.now();
  let pendingStars = 0;
  
  for (const nft of balance.stakedNFTs) {
    // Calculate full days since last claim
    const timeSinceLastClaim = now - nft.lastClaimAt;
    const fullDays = Math.floor(timeSinceLastClaim / STAR_ACCRUAL_INTERVAL_MS);
    pendingStars += fullDays * STAR_PER_NFT_PER_DAY;
  }
  
  return {
    ...balance,
    lastUpdated: now,
  };
}

/**
 * Get STAR transaction history
 */
export function getStarHistory(address: string): StarTransaction[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(STAR_HISTORY_KEY);
    if (!stored) return [];
    const all: StarTransaction[] = JSON.parse(stored);
    return all.filter(tx => tx.address.toLowerCase() === address.toLowerCase());
  } catch {
    return [];
  }
}

/**
 * Add STAR transaction to history
 */
function addStarTransaction(transaction: Omit<StarTransaction, 'id'>): void {
  if (typeof window === 'undefined') return;
  
  try {
    const stored = localStorage.getItem(STAR_HISTORY_KEY);
    const history: StarTransaction[] = stored ? JSON.parse(stored) : [];
    
    // Use crypto.randomUUID() for robust ID generation
    const id = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? `star-tx-${crypto.randomUUID()}`
      : `star-tx-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    
    history.unshift({
      ...transaction,
      id,
    });
    
    // Keep only last 100 transactions per user
    localStorage.setItem(STAR_HISTORY_KEY, JSON.stringify(history.slice(0, 1000)));
  } catch (error) {
    console.error('Failed to add STAR transaction:', error);
  }
}

// ============ Staking Functions ============

/**
 * Stake an NFT to earn STAR
 * No lock period - can unstake immediately
 */
export function stakeNFTForStar(
  address: string,
  tokenId: number,
  starVariant?: string
): { success: boolean; error?: string } {
  const balances = getAllStarBalances();
  const userBalance = balances.get(address.toLowerCase()) || {
    address: address.toLowerCase(),
    balance: 0,
    stakedNFTs: [],
    lastUpdated: Date.now(),
  };
  
  // Check if already staked
  if (userBalance.stakedNFTs.some(nft => nft.tokenId === tokenId)) {
    return { success: false, error: 'NFT already staked' };
  }
  
  // Add staked NFT
  const now = Date.now();
  userBalance.stakedNFTs.push({
    tokenId,
    stakedAt: now,
    lastClaimAt: now,
    starVariant,
  });
  userBalance.lastUpdated = now;
  
  balances.set(address.toLowerCase(), userBalance);
  saveAllStarBalances(balances);
  
  // Record transaction
  addStarTransaction({
    address: address.toLowerCase(),
    type: 'stake',
    amount: 0,
    tokenId,
    timestamp: now,
    description: `Staked Star Skrumpey #${tokenId}${starVariant ? ` (${starVariant})` : ''}`,
  });
  
  return { success: true };
}

/**
 * Stake multiple NFTs at once
 */
export function stakeMultipleNFTs(
  address: string,
  tokens: Array<{ tokenId: number; starVariant?: string }>
): { success: boolean; error?: string; stakedCount: number } {
  let stakedCount = 0;
  
  for (const token of tokens) {
    const result = stakeNFTForStar(address, token.tokenId, token.starVariant);
    if (result.success) {
      stakedCount++;
    }
  }
  
  return { success: stakedCount > 0, stakedCount };
}

/**
 * Unstake an NFT immediately (no cooldown)
 * Claims any pending STAR before unstaking
 */
export function unstakeNFTImmediately(
  address: string,
  tokenId: number
): { success: boolean; error?: string; claimedStars: number } {
  const balances = getAllStarBalances();
  const userBalance = balances.get(address.toLowerCase());
  
  if (!userBalance) {
    return { success: false, error: 'No staked NFTs found', claimedStars: 0 };
  }
  
  const nftIndex = userBalance.stakedNFTs.findIndex(nft => nft.tokenId === tokenId);
  if (nftIndex === -1) {
    return { success: false, error: 'NFT not staked', claimedStars: 0 };
  }
  
  const nft = userBalance.stakedNFTs[nftIndex];
  const now = Date.now();
  
  // Calculate earned STAR before unstaking
  const timeSinceLastClaim = now - nft.lastClaimAt;
  const fullDays = Math.floor(timeSinceLastClaim / STAR_ACCRUAL_INTERVAL_MS);
  const claimedStars = fullDays * STAR_PER_NFT_PER_DAY;
  
  // Add claimed STAR to balance
  userBalance.balance += claimedStars;
  
  // Remove NFT from staked list
  userBalance.stakedNFTs.splice(nftIndex, 1);
  userBalance.lastUpdated = now;
  
  balances.set(address.toLowerCase(), userBalance);
  saveAllStarBalances(balances);
  
  // Record transactions
  if (claimedStars > 0) {
    addStarTransaction({
      address: address.toLowerCase(),
      type: 'claim',
      amount: claimedStars,
      tokenId,
      timestamp: now,
      description: `Claimed ${claimedStars} STAR from NFT #${tokenId}`,
    });
  }
  
  addStarTransaction({
    address: address.toLowerCase(),
    type: 'unstake',
    amount: 0,
    tokenId,
    timestamp: now,
    description: `Unstaked Star Skrumpey #${tokenId}`,
  });
  
  return { success: true, claimedStars };
}

/**
 * Claim all pending STAR from staked NFTs
 */
export function claimAllPendingStars(address: string): { success: boolean; claimed: number } {
  const balances = getAllStarBalances();
  const userBalance = balances.get(address.toLowerCase());
  
  if (!userBalance || userBalance.stakedNFTs.length === 0) {
    return { success: false, claimed: 0 };
  }
  
  const now = Date.now();
  let totalClaimed = 0;
  
  for (const nft of userBalance.stakedNFTs) {
    const timeSinceLastClaim = now - nft.lastClaimAt;
    const fullDays = Math.floor(timeSinceLastClaim / STAR_ACCRUAL_INTERVAL_MS);
    const claimed = fullDays * STAR_PER_NFT_PER_DAY;
    
    if (claimed > 0) {
      totalClaimed += claimed;
      nft.lastClaimAt = now;
    }
  }
  
  if (totalClaimed > 0) {
    userBalance.balance += totalClaimed;
    userBalance.lastUpdated = now;
    
    balances.set(address.toLowerCase(), userBalance);
    saveAllStarBalances(balances);
    
    addStarTransaction({
      address: address.toLowerCase(),
      type: 'claim',
      amount: totalClaimed,
      timestamp: now,
      description: `Claimed ${totalClaimed} STAR from ${userBalance.stakedNFTs.length} staked NFTs`,
    });
  }
  
  return { success: true, claimed: totalClaimed };
}

/**
 * Get pending STAR (not yet claimed)
 */
export function getPendingStars(address: string): number {
  const balance = getUserStarBalance(address);
  const now = Date.now();
  let pending = 0;
  
  for (const nft of balance.stakedNFTs) {
    const timeSinceLastClaim = now - nft.lastClaimAt;
    const fullDays = Math.floor(timeSinceLastClaim / STAR_ACCRUAL_INTERVAL_MS);
    pending += fullDays * STAR_PER_NFT_PER_DAY;
  }
  
  return pending;
}

// ============ Governance Voting Power Functions ============

/**
 * Calculate voting power
 * Formula: 1 Star Skrumpey NFT = 1 Vote
 * 
 * Simple, fair, and transparent!
 * Example: Hold 8 Star Skrumpeys = 8 Voting Power
 */
export function calculateWeightedVotingPower(
  starBalance: number,
  nftCount: number
): number {
  // Simple 1:1 voting: 1 NFT = 1 Vote
  return nftCount;
}

/**
 * Get voting power breakdown for a user
 * Voting Power = Number of Star Skrumpey NFTs held
 */
export function getVotingPowerBreakdown(address: string, nftCount: number): {
  starBalance: number;
  pendingStars: number;
  stakedNFTCount: number;
  ownedNFTCount: number;
  starVotingPower: number;
  nftVotingPower: number;
  totalVotingPower: number;
  weightedVotingPower: number;
} {
  const balance = getUserStarBalance(address);
  const pendingStars = getPendingStars(address);
  
  // Simple 1:1 voting: 1 NFT = 1 Vote
  const nftVotingPower = nftCount;
  const starVotingPower = 0; // STAR tokens don't affect voting power
  const totalVotingPower = nftCount;
  const weightedVotingPower = nftCount;
  
  return {
    starBalance: balance.balance,
    pendingStars,
    stakedNFTCount: balance.stakedNFTs.length,
    ownedNFTCount: nftCount,
    starVotingPower,
    nftVotingPower,
    totalVotingPower,
    weightedVotingPower,
  };
}

/**
 * Use STAR for governance vote (records but doesn't deduct)
 */
export function recordGovernanceVote(
  address: string,
  proposalId: string,
  weightedPower: number
): void {
  const now = Date.now();
  
  addStarTransaction({
    address: address.toLowerCase(),
    type: 'governance_vote',
    amount: weightedPower,
    timestamp: now,
    description: `Voted on proposal ${proposalId} with ${weightedPower} voting power`,
  });
}

// ============ Online Presence Functions (for Hangout Hub) ============

const ONLINE_USERS_KEY = 'swo_online_users';
const ONLINE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Online user info
 */
export interface OnlineUser {
  address: string;
  displayName?: string;
  avatarUrl?: string;
  nftTokenId?: number;
  starVariant?: string;
  lastSeen: number;
  status: 'online' | 'away' | 'busy';
  lastMessage?: string;
  lastMessageAt?: number;
}

/**
 * Update user's online presence
 */
export function updateOnlinePresence(
  address: string,
  info: Omit<OnlineUser, 'address' | 'lastSeen'>
): void {
  if (typeof window === 'undefined') return;
  
  try {
    const stored = localStorage.getItem(ONLINE_USERS_KEY);
    const users: Record<string, OnlineUser> = stored ? JSON.parse(stored) : {};
    
    users[address.toLowerCase()] = {
      address: address.toLowerCase(),
      ...info,
      lastSeen: Date.now(),
    };
    
    localStorage.setItem(ONLINE_USERS_KEY, JSON.stringify(users));
  } catch (error) {
    console.error('Failed to update online presence:', error);
  }
}

/**
 * Get all online users (active within timeout period)
 */
export function getOnlineUsers(): OnlineUser[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(ONLINE_USERS_KEY);
    if (!stored) return [];
    
    const users: Record<string, OnlineUser> = JSON.parse(stored);
    const now = Date.now();
    
    // Filter to only show users active within timeout
    return Object.values(users).filter(
      user => now - user.lastSeen < ONLINE_TIMEOUT_MS
    );
  } catch {
    return [];
  }
}

/**
 * Remove user from online list (on disconnect)
 */
export function removeOnlinePresence(address: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const stored = localStorage.getItem(ONLINE_USERS_KEY);
    if (!stored) return;
    
    const users: Record<string, OnlineUser> = JSON.parse(stored);
    delete users[address.toLowerCase()];
    
    localStorage.setItem(ONLINE_USERS_KEY, JSON.stringify(users));
  } catch (error) {
    console.error('Failed to remove online presence:', error);
  }
}

// ============ Utility Functions ============

/**
 * Format STAR amount for display
 */
export function formatStarAmount(amount: number): string {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(2)}M`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(2)}K`;
  }
  return amount.toFixed(0);
}

/**
 * Get time until next STAR accrual
 */
export function getTimeUntilNextStar(lastClaimAt: number): {
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
} {
  const now = Date.now();
  const timeSinceLastClaim = now - lastClaimAt;
  const timeRemaining = STAR_ACCRUAL_INTERVAL_MS - (timeSinceLastClaim % STAR_ACCRUAL_INTERVAL_MS);
  
  const hours = Math.floor(timeRemaining / (60 * 60 * 1000));
  const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((timeRemaining % (60 * 1000)) / 1000);
  
  return { hours, minutes, seconds, totalMs: timeRemaining };
}
