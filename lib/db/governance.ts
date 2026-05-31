/**
 * Governance System Database Functions (Web2 Style) — db helpers. Extracted from the lib/db.ts god-file.
 * Handle via ./connection.
 */
import crypto from 'crypto';
import { getDatabase } from './connection';
import { getResilientClient } from '../rpcClient';


export type ProposalStateDB = 'pending' | 'active' | 'defeated' | 'succeeded' | 'executed' | 'cancelled';

export interface GovernanceProposal {
  id: string;
  title: string;
  description: string;
  proposer_address: string;
  proposer_display_name?: string | null;
  state: ProposalStateDB;
  for_votes: number;
  against_votes: number;
  abstain_votes: number;
  quorum: number;
  unique_voter_count: number;
  min_voters: number;
  yes_threshold_percent: number;
  max_abstain_percent: number;
  category: ProposalCategory;
  forum_thread_id: string | null;
  defeat_reason: string | null;
  voting_duration_weeks: number;
  start_time: string | null;
  end_time: string | null;
  snapshot_block: number | null; // Block number for snapshot-based voting power
  created_at: string;
  executed_at: string | null;
  cancelled_at: string | null;
}

export interface GovernanceVote {
  id: number;
  proposal_id: string;
  voter_address: string;
  voter_display_name?: string | null;
  support: number; // 0 = No, 1 = Yes, 2 = Abstain
  voting_power: number;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export type ProposalCategory = 'treasury' | 'community' | 'technical' | 'governance' | 'general';

// Category metadata
export const PROPOSAL_CATEGORIES = {
  treasury: { label: 'Treasury', icon: '💰', description: 'Fund allocation requests' },
  community: { label: 'Community', icon: '🎉', description: 'Events, partnerships, contests' },
  technical: { label: 'Technical', icon: '⚙️', description: 'Contract/site changes' },
  governance: { label: 'Governance', icon: '📜', description: 'Rule changes (quorum, voting periods)' },
  general: { label: 'General', icon: '📋', description: 'Anything else' },
} as const;

/**
 * Get current block number from blockchain
 * Used for snapshot-based voting power calculation
 */
async function getCurrentBlockNumber(): Promise<number> {
  try {
    const client = await getResilientClient();
    const block = await client.getBlockNumber();
    return Number(block);
  } catch (error) {
    console.error('Failed to get current block number:', error);
    // Return 0 as fallback - proposals without snapshot_block will use real-time voting power
    return 0;
  }
}

/**
 * Create a new governance proposal
 */
export async function createGovernanceProposal(data: {
  title: string;
  description: string;
  proposerAddress: string;
  votingDurationWeeks?: number;
  quorum?: number;
  category?: ProposalCategory;
}): Promise<GovernanceProposal> {
  const db = getDatabase();
  
  const id = `prop-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date();
  const endTime = new Date(now.getTime() + (data.votingDurationWeeks || 1) * 7 * 24 * 60 * 60 * 1000);
  
  // Capture current block number for snapshot-based voting
  const snapshotBlock = await getCurrentBlockNumber();
  
  const stmt = db.prepare(`
    INSERT INTO governance_proposals (
      id, title, description, proposer_address, state, 
      voting_duration_weeks, quorum, category, start_time, end_time, snapshot_block
    )
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    data.title,
    data.description,
    data.proposerAddress.toLowerCase(),
    data.votingDurationWeeks || 1,
    data.quorum || 10,
    data.category || 'general',
    now.toISOString(),
    endTime.toISOString(),
    snapshotBlock
  );
  
  const getStmt = db.prepare('SELECT * FROM governance_proposals WHERE id = ?');
  return getStmt.get(id) as GovernanceProposal;
}

/**
 * Determine proposal outcome based on enhanced quorum rules
 */
function determineProposalOutcome(proposal: GovernanceProposal): { 
  newState: ProposalStateDB; 
  defeatReason?: string;
} {
  const totalVotes = proposal.for_votes + proposal.against_votes + proposal.abstain_votes;
  const uniqueVoters = proposal.unique_voter_count;
  
  // Rule 1: Minimum unique voters required
  if (uniqueVoters < proposal.min_voters) {
    return { 
      newState: 'defeated', 
      defeatReason: `Did not reach minimum voter count (${uniqueVoters}/${proposal.min_voters})`
    };
  }
  
  // If no votes at all, defeat
  if (totalVotes === 0) {
    return { 
      newState: 'defeated', 
      defeatReason: 'No votes cast'
    };
  }
  
  // Rule 2: Abstain cannot exceed max threshold
  const abstainPercent = (proposal.abstain_votes / totalVotes) * 100;
  if (abstainPercent > proposal.max_abstain_percent) {
    return { 
      newState: 'defeated', 
      defeatReason: `Too many abstain votes (${abstainPercent.toFixed(1)}% > ${proposal.max_abstain_percent}%)`
    };
  }
  
  // Rule 3: Yes must be ≥ threshold % of all votes
  const yesPercent = (proposal.for_votes / totalVotes) * 100;
  if (yesPercent >= proposal.yes_threshold_percent) {
    return { newState: 'succeeded' };
  }
  
  return { 
    newState: 'defeated', 
    defeatReason: `Did not reach ${proposal.yes_threshold_percent}% approval (${yesPercent.toFixed(1)}%)`
  };
}

/**
 * Get all governance proposals
 */
export function getGovernanceProposals(options?: {
  state?: ProposalStateDB;
  limit?: number;
  offset?: number;
}): GovernanceProposal[] {
  const db = getDatabase();
  const limit = options?.limit || 100;
  const offset = options?.offset || 0;
  
  try {
    let query = `
      SELECT 
        gp.*,
        p.display_name as proposer_display_name
      FROM governance_proposals gp
      LEFT JOIN user_profiles p ON LOWER(gp.proposer_address) = LOWER(p.wallet_address)
    `;
    const params: (string | number)[] = [];
    
    if (options?.state) {
      query += ' WHERE gp.state = ?';
      params.push(options.state);
    }
    
    query += ' ORDER BY gp.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const stmt = db.prepare(query);
    const proposals = stmt.all(...params) as GovernanceProposal[];
    
    // Check if any active proposals have expired and update their state
    const now = new Date();
    for (const proposal of proposals) {
      if (proposal.state === 'active' && proposal.end_time) {
        const endTime = new Date(proposal.end_time);
        if (now > endTime) {
          // Auto-update expired proposals with enhanced quorum logic
          const { newState, defeatReason } = determineProposalOutcome(proposal);
          updateGovernanceProposalState(proposal.id, newState, defeatReason);
          proposal.state = newState;
          if (defeatReason) {
            proposal.defeat_reason = defeatReason;
          }
        }
      }
    }
    
    return proposals;
  } catch (error) {
    console.error('Error getting governance proposals:', error);
    return [];
  }
}

/**
 * Get a single governance proposal by ID
 */
export function getGovernanceProposalById(proposalId: string): GovernanceProposal | null {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT 
        gp.*,
        p.display_name as proposer_display_name
      FROM governance_proposals gp
      LEFT JOIN user_profiles p ON LOWER(gp.proposer_address) = LOWER(p.wallet_address)
      WHERE gp.id = ?
    `);
    const proposal = stmt.get(proposalId) as GovernanceProposal | undefined;
    
    if (proposal && proposal.state === 'active' && proposal.end_time) {
      const now = new Date();
      const endTime = new Date(proposal.end_time);
      if (now > endTime) {
        const { newState, defeatReason } = determineProposalOutcome(proposal);
        updateGovernanceProposalState(proposal.id, newState, defeatReason);
        proposal.state = newState;
        if (defeatReason) {
          proposal.defeat_reason = defeatReason;
        }
      }
    }
    
    return proposal || null;
  } catch {
    return null;
  }
}

/**
 * Update governance proposal state
 */
export function updateGovernanceProposalState(
  proposalId: string, 
  newState: ProposalStateDB,
  defeatReason?: string
): boolean {
  const db = getDatabase();
  
  try {
    let query = 'UPDATE governance_proposals SET state = ?';
    const params: (string | null)[] = [newState];
    
    if (newState === 'executed') {
      query += ', executed_at = ?';
      params.push(new Date().toISOString());
    } else if (newState === 'cancelled') {
      query += ', cancelled_at = ?';
      params.push(new Date().toISOString());
    }
    
    query += ' WHERE id = ?';
    params.push(proposalId);
    
    const stmt = db.prepare(query);
    const result = stmt.run(...params);
    return result.changes > 0;
  } catch {
    return false;
  }
}

/**
 * Link a forum thread to a governance proposal
 */
export function linkForumThreadToProposal(
  proposalId: string,
  forumThreadId: string
): boolean {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare('UPDATE governance_proposals SET forum_thread_id = ? WHERE id = ?');
    const result = stmt.run(forumThreadId, proposalId);
    return result.changes > 0;
  } catch {
    return false;
  }
}

/**
 * Cast a vote on a governance proposal
 * Returns error if user already voted
 * 
 * Optionally includes cryptographic signature for vote verification.
 * Supports both EIP-712 (new) and EIP-191 (legacy) signatures.
 */
export function castGovernanceVote(data: {
  proposalId: string;
  voterAddress: string;
  support: number | boolean; // 0/1/2 or false/true (backward compat)
  votingPower: number;
  reason?: string;
  // Cryptographic signature data (optional but recommended for verifiability)
  signature?: string;
  signatureVersion?: 'eip712' | 'eip191';
  signatureData?: {
    message?: string; // EIP-191 only
    timestamp: number;
    nonce: string;
    typedData?: Record<string, unknown>; // EIP-712 only (JSON stringified)
  };
}): { success: boolean; error?: string; vote?: GovernanceVote } {
  const db = getDatabase();
  
  try {
    // Check if proposal exists and is active
    const proposal = getGovernanceProposalById(data.proposalId);
    if (!proposal) {
      return { success: false, error: 'Proposal not found' };
    }
    if (proposal.state !== 'active') {
      return { success: false, error: 'Proposal is not active for voting' };
    }
    
    // Check if user already voted
    const checkStmt = db.prepare('SELECT id FROM governance_votes WHERE proposal_id = ? AND voter_address = ?');
    const existingVote = checkStmt.get(data.proposalId, data.voterAddress.toLowerCase());
    if (existingVote) {
      return { success: false, error: 'You have already voted on this proposal' };
    }
    
    // Convert support to number (0=No, 1=Yes, 2=Abstain)
    let supportValue: number;
    if (typeof data.support === 'boolean') {
      supportValue = data.support ? 1 : 0;
    } else {
      supportValue = data.support;
    }
    
    // Validate support value
    if (![0, 1, 2].includes(supportValue)) {
      return { success: false, error: 'Invalid support value. Must be 0 (No), 1 (Yes), or 2 (Abstain)' };
    }
    
    // Determine signature version (default to eip712 if signature provided without version)
    const signatureVersion = data.signatureVersion || (data.signature ? 'eip712' : null);
    
    // Insert vote with optional signature data
    const insertStmt = db.prepare(`
      INSERT INTO governance_votes (
        proposal_id, voter_address, support, voting_power, reason,
        signature, signature_message, signature_timestamp, signature_nonce,
        signature_version, signature_typed_data
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insertStmt.run(
      data.proposalId,
      data.voterAddress.toLowerCase(),
      supportValue,
      data.votingPower,
      data.reason || null,
      data.signature || null,
      data.signatureData?.message || null,
      data.signatureData?.timestamp || null,
      data.signatureData?.nonce || null,
      signatureVersion || 'eip191', // Default to eip191 for backward compat
      data.signatureData?.typedData ? JSON.stringify(data.signatureData.typedData) : null
    );
    
    // Update proposal vote counts and unique voter count
    let updateQuery: string;
    if (supportValue === 1) {
      updateQuery = 'UPDATE governance_proposals SET for_votes = for_votes + ?, unique_voter_count = unique_voter_count + 1 WHERE id = ?';
    } else if (supportValue === 0) {
      updateQuery = 'UPDATE governance_proposals SET against_votes = against_votes + ?, unique_voter_count = unique_voter_count + 1 WHERE id = ?';
    } else {
      updateQuery = 'UPDATE governance_proposals SET abstain_votes = abstain_votes + ?, unique_voter_count = unique_voter_count + 1 WHERE id = ?';
    }
    const updateStmt = db.prepare(updateQuery);
    updateStmt.run(data.votingPower, data.proposalId);
    
    // Get the inserted vote
    const getStmt = db.prepare('SELECT * FROM governance_votes WHERE id = ?');
    const vote = getStmt.get(result.lastInsertRowid) as GovernanceVote;
    
    return { success: true, vote };
  } catch (error) {
    console.error('Error casting governance vote:', error);
    return { success: false, error: 'Failed to cast vote' };
  }
}

/**
 * Change a vote within the 24-hour window
 */
export function changeGovernanceVote(data: {
  proposalId: string;
  voterAddress: string;
  newSupport: number; // 0=No, 1=Yes, 2=Abstain
  votingPower: number;
  reason?: string;
}): { success: boolean; error?: string; vote?: GovernanceVote } {
  const db = getDatabase();
  
  try {
    // Check if proposal exists and is active
    const proposal = getGovernanceProposalById(data.proposalId);
    if (!proposal) {
      return { success: false, error: 'Proposal not found' };
    }
    if (proposal.state !== 'active') {
      return { success: false, error: 'Proposal is not active for voting' };
    }
    
    // Check if user has voted
    const existingVoteStmt = db.prepare('SELECT * FROM governance_votes WHERE proposal_id = ? AND voter_address = ?');
    const existingVote = existingVoteStmt.get(data.proposalId, data.voterAddress.toLowerCase()) as GovernanceVote | undefined;
    
    if (!existingVote) {
      return { success: false, error: 'You have not voted on this proposal yet' };
    }
    
    // Check 24-hour window
    if (!proposal.start_time) {
      return { success: false, error: 'Proposal start time not set' };
    }
    
    const startTime = new Date(proposal.start_time).getTime();
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    if ((now - startTime) > twentyFourHours) {
      return { success: false, error: 'Vote change window has expired (24 hours after proposal start)' };
    }
    
    // Validate new support value
    if (![0, 1, 2].includes(data.newSupport)) {
      return { success: false, error: 'Invalid support value. Must be 0 (No), 1 (Yes), or 2 (Abstain)' };
    }
    
    // If vote hasn't changed, return success
    if (existingVote.support === data.newSupport) {
      return { success: true, vote: existingVote };
    }
    
    // Update vote
    const updateVoteStmt = db.prepare(`
      UPDATE governance_votes 
      SET support = ?, reason = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    updateVoteStmt.run(data.newSupport, data.reason || existingVote.reason, existingVote.id);
    
    // Update proposal vote counts - decrement old vote, increment new vote
    const oldSupport = existingVote.support;
    const votingPower = existingVote.voting_power;
    
    // Decrement old vote count
    if (oldSupport === 1) {
      db.prepare('UPDATE governance_proposals SET for_votes = for_votes - ? WHERE id = ?').run(votingPower, data.proposalId);
    } else if (oldSupport === 0) {
      db.prepare('UPDATE governance_proposals SET against_votes = against_votes - ? WHERE id = ?').run(votingPower, data.proposalId);
    } else {
      db.prepare('UPDATE governance_proposals SET abstain_votes = abstain_votes - ? WHERE id = ?').run(votingPower, data.proposalId);
    }
    
    // Increment new vote count
    if (data.newSupport === 1) {
      db.prepare('UPDATE governance_proposals SET for_votes = for_votes + ? WHERE id = ?').run(votingPower, data.proposalId);
    } else if (data.newSupport === 0) {
      db.prepare('UPDATE governance_proposals SET against_votes = against_votes + ? WHERE id = ?').run(votingPower, data.proposalId);
    } else {
      db.prepare('UPDATE governance_proposals SET abstain_votes = abstain_votes + ? WHERE id = ?').run(votingPower, data.proposalId);
    }
    
    // Get updated vote
    const getStmt = db.prepare('SELECT * FROM governance_votes WHERE id = ?');
    const vote = getStmt.get(existingVote.id) as GovernanceVote;
    
    return { success: true, vote };
  } catch (error) {
    console.error('Error changing governance vote:', error);
    return { success: false, error: 'Failed to change vote' };
  }
}

/**
 * Check if vote can be changed (within 24-hour window)
 */
export function canChangeVote(proposalId: string): { allowed: boolean; reason?: string; hoursRemaining?: number } {
  const db = getDatabase();
  
  try {
    const proposal = getGovernanceProposalById(proposalId);
    if (!proposal) {
      return { allowed: false, reason: 'Proposal not found' };
    }
    
    if (proposal.state !== 'active') {
      return { allowed: false, reason: 'Proposal is not active' };
    }
    
    if (!proposal.start_time) {
      return { allowed: false, reason: 'Proposal start time not set' };
    }
    
    const startTime = new Date(proposal.start_time).getTime();
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const elapsed = now - startTime;
    
    if (elapsed > twentyFourHours) {
      return { allowed: false, reason: 'Vote change window expired' };
    }
    
    const hoursRemaining = Math.max(0, (twentyFourHours - elapsed) / (60 * 60 * 1000));
    return { allowed: true, hoursRemaining };
  } catch {
    return { allowed: false, reason: 'Error checking vote change eligibility' };
  }
}

/**
 * Cancel a proposal (proposer only, before 48-hour lockout)
 */
export function cancelGovernanceProposal(
  proposalId: string,
  userAddress: string
): { success: boolean; error?: string } {
  const db = getDatabase();
  
  try {
    const proposal = getGovernanceProposalById(proposalId);
    if (!proposal) {
      return { success: false, error: 'Proposal not found' };
    }
    
    // Check if user is the proposer
    if (proposal.proposer_address.toLowerCase() !== userAddress.toLowerCase()) {
      return { success: false, error: 'Only the proposer can cancel this proposal' };
    }
    
    // Check if proposal is in a cancelable state
    if (!['pending', 'active'].includes(proposal.state)) {
      return { success: false, error: 'Proposal has already concluded' };
    }
    
    // Check 48-hour lockout
    if (!proposal.end_time) {
      return { success: false, error: 'Proposal end time not set' };
    }
    
    const endTime = new Date(proposal.end_time).getTime();
    const now = Date.now();
    const fortyEightHours = 48 * 60 * 60 * 1000;
    
    if ((endTime - now) < fortyEightHours) {
      return { success: false, error: 'Cannot cancel with less than 48 hours remaining' };
    }
    
    // Cancel the proposal
    const result = updateGovernanceProposalState(proposalId, 'cancelled');
    if (!result) {
      return { success: false, error: 'Failed to cancel proposal' };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error cancelling governance proposal:', error);
    return { success: false, error: 'Failed to cancel proposal' };
  }
}

/**
 * Check if proposer can cancel proposal
 */
export function canProposerCancelProposal(
  proposalId: string,
  userAddress: string
): { allowed: boolean; reason?: string; hoursUntilLockout?: number } {
  const db = getDatabase();
  
  try {
    const proposal = getGovernanceProposalById(proposalId);
    if (!proposal) {
      return { allowed: false, reason: 'Proposal not found' };
    }
    
    if (proposal.proposer_address.toLowerCase() !== userAddress.toLowerCase()) {
      return { allowed: false, reason: 'Only the proposer can cancel' };
    }
    
    if (!['pending', 'active'].includes(proposal.state)) {
      return { allowed: false, reason: 'Proposal already concluded' };
    }
    
    if (!proposal.end_time) {
      return { allowed: false, reason: 'Proposal end time not set' };
    }
    
    const endTime = new Date(proposal.end_time).getTime();
    const now = Date.now();
    const fortyEightHours = 48 * 60 * 60 * 1000;
    const remaining = endTime - now;
    
    if (remaining < fortyEightHours) {
      return { allowed: false, reason: 'Less than 48 hours remaining' };
    }
    
    const hoursUntilLockout = Math.max(0, (remaining - fortyEightHours) / (60 * 60 * 1000));
    return { allowed: true, hoursUntilLockout };
  } catch {
    return { allowed: false, reason: 'Error checking cancellation eligibility' };
  }
}

/**
 * Get votes for a proposal
 */
export function getGovernanceVotes(proposalId: string): GovernanceVote[] {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT 
        gv.*,
        p.display_name as voter_display_name
      FROM governance_votes gv
      LEFT JOIN user_profiles p ON LOWER(gv.voter_address) = LOWER(p.wallet_address)
      WHERE gv.proposal_id = ? 
      ORDER BY gv.created_at DESC
    `);
    return stmt.all(proposalId) as GovernanceVote[];
  } catch {
    return [];
  }
}

/**
 * Check if user has voted on a proposal
 */
export function hasUserVotedOnProposal(proposalId: string, voterAddress: string): boolean {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare('SELECT id FROM governance_votes WHERE proposal_id = ? AND voter_address = ?');
    const result = stmt.get(proposalId, voterAddress.toLowerCase());
    return !!result;
  } catch {
    return false;
  }
}

/**
 * Get user's vote on a proposal
 */
export function getUserVoteOnProposal(proposalId: string, voterAddress: string): GovernanceVote | null {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare('SELECT * FROM governance_votes WHERE proposal_id = ? AND voter_address = ?');
    return stmt.get(proposalId, voterAddress.toLowerCase()) as GovernanceVote | null;
  } catch {
    return null;
  }
}
