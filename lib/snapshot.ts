/**
 * Snapshot.org Integration for Star World Order DAO
 * 
 * This module provides integration with Snapshot for decentralized vote verification.
 * 
 * Star World Order uses a HYBRID governance model:
 * - PRIMARY: Web2 database-backed voting (fast, free, stored in SQLite)
 * - VERIFICATION: Snapshot.org for decentralized proof (optional, transparent)
 * 
 * Why Hybrid?
 * - Web2 voting is instant and free (no gas fees)
 * - Snapshot provides cryptographic proof and transparency
 * - Results can be cross-verified between both systems
 * 
 * Snapshot Features Used:
 * - Off-chain voting with wallet signatures
 * - ERC-721 voting strategy (Star Skrumpey NFTs)
 * - IPFS storage for proposal and vote data
 * - Public verifiability
 * 
 * @see https://docs.snapshot.box/
 * @see https://docs.snapshot.box/user-guides/voting-strategies
 */

import { SKRUMPEY_CONTRACT_ADDRESS } from './starSkrumpey';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Snapshot Hub URL (GraphQL endpoint)
 */
export const SNAPSHOT_HUB_URL = process.env.NEXT_PUBLIC_SNAPSHOT_HUB || 'https://hub.snapshot.org';

/**
 * Snapshot Space ID for Star World Order
 * Format: ENS name or custom subdomain (e.g., 'starworldorder.eth')
 */
export const SNAPSHOT_SPACE_ID = process.env.NEXT_PUBLIC_SNAPSHOT_SPACE || '';

/**
 * Monad Chain ID for Snapshot
 * Note: As of 2024, Snapshot supports Monad via custom network configuration
 */
export const MONAD_CHAIN_ID = process.env.NEXT_PUBLIC_MONAD_CHAIN_ID || '143';

/**
 * Check if Snapshot is configured
 */
export function isSnapshotConfigured(): boolean {
  return SNAPSHOT_SPACE_ID.length > 0;
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Snapshot Space configuration
 */
export interface SnapshotSpace {
  id: string;
  name: string;
  about: string;
  network: string;
  symbol: string;
  members: string[];
  admins: string[];
  strategies: SnapshotStrategy[];
  voting: {
    delay: number;
    period: number;
    type: string;
    quorum: number;
  };
  filters: {
    minScore: number;
    onlyMembers: boolean;
  };
}

/**
 * Snapshot Voting Strategy
 */
export interface SnapshotStrategy {
  name: string;
  network: string;
  params: Record<string, unknown>;
}

/**
 * Snapshot Proposal
 */
export interface SnapshotProposal {
  id: string;
  title: string;
  body: string;
  choices: string[];
  start: number;
  end: number;
  snapshot: string;
  state: 'pending' | 'active' | 'closed';
  author: string;
  space: {
    id: string;
    name: string;
  };
  scores: number[];
  scores_total: number;
  votes: number;
  quorum: number;
}

/**
 * Snapshot Vote
 */
export interface SnapshotVote {
  id: string;
  voter: string;
  created: number;
  choice: number | number[] | Record<string, number>;
  vp: number; // voting power
  reason?: string;
}

/**
 * Vote choice for three-way voting
 */
export type SnapshotVoteChoice = 'For' | 'Against' | 'Abstain';

/**
 * Proposal creation parameters
 */
export interface CreateSnapshotProposalParams {
  title: string;
  body: string;
  discussion?: string;
  start?: number; // Unix timestamp
  end?: number; // Unix timestamp
  snapshot?: number; // Block number
}

// =============================================================================
// SNAPSHOT GRAPHQL API
// =============================================================================

/**
 * GraphQL query to get space info
 */
const SPACE_QUERY = `
  query Space($id: String!) {
    space(id: $id) {
      id
      name
      about
      network
      symbol
      members
      admins
      strategies {
        name
        network
        params
      }
      voting {
        delay
        period
        type
        quorum
      }
      filters {
        minScore
        onlyMembers
      }
    }
  }
`;

/**
 * GraphQL query to get proposals
 */
const PROPOSALS_QUERY = `
  query Proposals($space: String!, $first: Int!, $skip: Int!, $state: String) {
    proposals(
      first: $first
      skip: $skip
      where: {
        space: $space
        state: $state
      }
      orderBy: "created"
      orderDirection: desc
    ) {
      id
      title
      body
      choices
      start
      end
      snapshot
      state
      author
      space {
        id
        name
      }
      scores
      scores_total
      votes
      quorum
    }
  }
`;

/**
 * GraphQL query to get a single proposal
 */
const PROPOSAL_QUERY = `
  query Proposal($id: String!) {
    proposal(id: $id) {
      id
      title
      body
      choices
      start
      end
      snapshot
      state
      author
      space {
        id
        name
      }
      scores
      scores_total
      votes
      quorum
    }
  }
`;

/**
 * GraphQL query to get votes for a proposal
 */
const VOTES_QUERY = `
  query Votes($proposal: String!, $first: Int!, $skip: Int!) {
    votes(
      first: $first
      skip: $skip
      where: {
        proposal: $proposal
      }
      orderBy: "created"
      orderDirection: desc
    ) {
      id
      voter
      created
      choice
      vp
      reason
    }
  }
`;

/**
 * GraphQL query to get a user's voting power
 */
const VOTING_POWER_QUERY = `
  query VotingPower($space: String!, $voter: String!, $proposal: String!) {
    vp(space: $space, voter: $voter, proposal: $proposal) {
      vp
      vp_by_strategy
      vp_state
    }
  }
`;

/**
 * Execute a GraphQL query against the Snapshot Hub
 */
async function executeQuery<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${SNAPSHOT_HUB_URL}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`Snapshot API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  
  if (result.errors) {
    throw new Error(`Snapshot GraphQL error: ${result.errors[0]?.message || 'Unknown error'}`);
  }

  return result.data as T;
}

// =============================================================================
// SPACE FUNCTIONS
// =============================================================================

/**
 * Get Snapshot space configuration
 */
export async function getSnapshotSpace(): Promise<SnapshotSpace | null> {
  if (!isSnapshotConfigured()) {
    console.warn('Snapshot is not configured. Set NEXT_PUBLIC_SNAPSHOT_SPACE environment variable.');
    return null;
  }

  try {
    const data = await executeQuery<{ space: SnapshotSpace }>(SPACE_QUERY, {
      id: SNAPSHOT_SPACE_ID,
    });
    return data.space;
  } catch (error) {
    console.error('Failed to fetch Snapshot space:', error);
    return null;
  }
}

// =============================================================================
// PROPOSAL FUNCTIONS
// =============================================================================

/**
 * Get proposals from Snapshot
 */
export async function getSnapshotProposals(options?: {
  state?: 'pending' | 'active' | 'closed' | 'all';
  first?: number;
  skip?: number;
}): Promise<SnapshotProposal[]> {
  if (!isSnapshotConfigured()) {
    return [];
  }

  const { state = 'all', first = 20, skip = 0 } = options || {};

  try {
    const data = await executeQuery<{ proposals: SnapshotProposal[] }>(PROPOSALS_QUERY, {
      space: SNAPSHOT_SPACE_ID,
      first,
      skip,
      state: state === 'all' ? null : state,
    });
    return data.proposals;
  } catch (error) {
    console.error('Failed to fetch Snapshot proposals:', error);
    return [];
  }
}

/**
 * Get a single proposal from Snapshot
 */
export async function getSnapshotProposal(proposalId: string): Promise<SnapshotProposal | null> {
  try {
    const data = await executeQuery<{ proposal: SnapshotProposal }>(PROPOSAL_QUERY, {
      id: proposalId,
    });
    return data.proposal;
  } catch (error) {
    console.error('Failed to fetch Snapshot proposal:', error);
    return null;
  }
}

/**
 * Get votes for a Snapshot proposal
 */
export async function getSnapshotVotes(proposalId: string, options?: {
  first?: number;
  skip?: number;
}): Promise<SnapshotVote[]> {
  const { first = 100, skip = 0 } = options || {};

  try {
    const data = await executeQuery<{ votes: SnapshotVote[] }>(VOTES_QUERY, {
      proposal: proposalId,
      first,
      skip,
    });
    return data.votes;
  } catch (error) {
    console.error('Failed to fetch Snapshot votes:', error);
    return [];
  }
}

/**
 * Get a user's voting power for a proposal
 */
export async function getSnapshotVotingPower(
  voterAddress: string,
  proposalId: string
): Promise<number> {
  if (!isSnapshotConfigured()) {
    return 0;
  }

  try {
    const data = await executeQuery<{
      vp: { vp: number; vp_by_strategy: number[]; vp_state: string };
    }>(VOTING_POWER_QUERY, {
      space: SNAPSHOT_SPACE_ID,
      voter: voterAddress,
      proposal: proposalId,
    });
    return data.vp?.vp || 0;
  } catch (error) {
    console.error('Failed to fetch voting power:', error);
    return 0;
  }
}

// =============================================================================
// VOTE VERIFICATION HELPERS
// =============================================================================

/**
 * Result of vote verification between database and Snapshot
 */
export interface VoteVerificationResult {
  matches: boolean;
  databaseVotes: {
    yes: number;
    no: number;
    abstain: number;
    total: number;
  };
  snapshotVotes: {
    yes: number;
    no: number;
    abstain: number;
    total: number;
  } | null;
  discrepancies: string[];
}

/**
 * Compare database votes with Snapshot votes for a proposal
 * 
 * This is the key verification function that allows users to verify
 * that the database voting results match Snapshot's decentralized record.
 */
export async function verifyVotesWithSnapshot(
  proposalId: string,
  databaseResults: { yes: number; no: number; abstain: number }
): Promise<VoteVerificationResult> {
  const result: VoteVerificationResult = {
    matches: false,
    databaseVotes: {
      ...databaseResults,
      total: databaseResults.yes + databaseResults.no + databaseResults.abstain,
    },
    snapshotVotes: null,
    discrepancies: [],
  };

  if (!isSnapshotConfigured()) {
    result.discrepancies.push('Snapshot is not configured');
    return result;
  }

  try {
    const proposal = await getSnapshotProposal(proposalId);
    
    if (!proposal) {
      result.discrepancies.push('Proposal not found on Snapshot');
      return result;
    }

    // Snapshot stores scores per choice: [0] = For, [1] = Against, [2] = Abstain
    // This assumes standard three-way voting setup
    const [yesScore, noScore, abstainScore] = proposal.scores;
    
    result.snapshotVotes = {
      yes: Math.round(yesScore || 0),
      no: Math.round(noScore || 0),
      abstain: Math.round(abstainScore || 0),
      total: Math.round(proposal.scores_total || 0),
    };

    // Check for discrepancies (allow small rounding differences)
    const tolerance = 1; // Allow 1 vote difference due to rounding
    
    if (Math.abs(result.databaseVotes.yes - result.snapshotVotes.yes) > tolerance) {
      result.discrepancies.push(
        `YES votes differ: DB=${result.databaseVotes.yes}, Snapshot=${result.snapshotVotes.yes}`
      );
    }
    
    if (Math.abs(result.databaseVotes.no - result.snapshotVotes.no) > tolerance) {
      result.discrepancies.push(
        `NO votes differ: DB=${result.databaseVotes.no}, Snapshot=${result.snapshotVotes.no}`
      );
    }
    
    if (Math.abs(result.databaseVotes.abstain - result.snapshotVotes.abstain) > tolerance) {
      result.discrepancies.push(
        `ABSTAIN votes differ: DB=${result.databaseVotes.abstain}, Snapshot=${result.snapshotVotes.abstain}`
      );
    }

    result.matches = result.discrepancies.length === 0;
    
  } catch (error) {
    result.discrepancies.push(`Error verifying votes: ${error}`);
  }

  return result;
}

// =============================================================================
// URL HELPERS
// =============================================================================

/**
 * Get URL to the Snapshot space page
 */
export function getSnapshotSpaceUrl(): string {
  if (!isSnapshotConfigured()) {
    return 'https://snapshot.org';
  }
  return `https://snapshot.org/#/${SNAPSHOT_SPACE_ID}`;
}

/**
 * Get URL to a specific proposal on Snapshot
 */
export function getSnapshotProposalUrl(proposalId: string): string {
  if (!isSnapshotConfigured()) {
    return `https://snapshot.org/#/proposal/${proposalId}`;
  }
  return `https://snapshot.org/#/${SNAPSHOT_SPACE_ID}/proposal/${proposalId}`;
}

/**
 * Get URL to create a new proposal on Snapshot
 */
export function getSnapshotCreateProposalUrl(): string {
  if (!isSnapshotConfigured()) {
    return 'https://snapshot.org';
  }
  return `https://snapshot.org/#/${SNAPSHOT_SPACE_ID}/create`;
}

// =============================================================================
// RECOMMENDED SPACE CONFIGURATION
// =============================================================================

/**
 * Recommended Snapshot space configuration for Star World Order
 * 
 * This is for documentation purposes - actual setup is done in Snapshot UI
 */
export const RECOMMENDED_SPACE_CONFIG = {
  name: 'Star World Order',
  symbol: 'SWO',
  network: MONAD_CHAIN_ID,
  
  // ERC-721 voting strategy for Star Skrumpey NFTs
  strategies: [
    {
      name: 'erc721',
      network: MONAD_CHAIN_ID,
      params: {
        address: SKRUMPEY_CONTRACT_ADDRESS,
        symbol: 'STAR',
        // Optional: filter to only Star constellation NFTs
        // This would require a custom strategy
      },
    },
  ],
  
  // Three-way voting (For/Against/Abstain)
  voting: {
    type: 'single-choice', // Users pick one option
    delay: 0, // No delay before voting starts
    period: 604800, // 1 week in seconds (7 * 24 * 60 * 60)
    quorum: 10, // Minimum 10 votes required
  },
  
  // Proposal requirements
  filters: {
    minScore: 1, // Must hold at least 1 Star Skrumpey to create proposal
    onlyMembers: false, // Anyone with NFT can participate
  },
  
  // Standard choices for proposals
  choices: ['For', 'Against', 'Abstain'],
};

// =============================================================================
// SNAPSHOT.JS TYPES (for reference)
// =============================================================================

/**
 * Type declarations for @snapshot-labs/snapshot.js
 * 
 * If you want to use the official Snapshot SDK for creating proposals
 * and casting votes programmatically, install:
 * 
 *   npm install @snapshot-labs/snapshot.js
 * 
 * Note: The SDK requires wallet signing capabilities and is typically
 * used on the client-side with wagmi/viem hooks.
 */
export interface SnapshotClientConfig {
  hub: string;
  space: string;
}

/**
 * Message type for signing votes
 */
export interface VoteMessage {
  space: string;
  proposal: string;
  type: 'single-choice' | 'approval' | 'quadratic' | 'ranked-choice' | 'weighted' | 'basic';
  choice: number | number[] | Record<string, number>;
  reason?: string;
  app?: string;
  metadata?: string;
}

/**
 * Message type for signing proposals
 */
export interface ProposalMessage {
  space: string;
  type: 'single-choice' | 'approval' | 'quadratic' | 'ranked-choice' | 'weighted' | 'basic';
  title: string;
  body: string;
  choices: string[];
  start: number;
  end: number;
  snapshot: number;
  discussion?: string;
  plugins?: string;
  app?: string;
}
