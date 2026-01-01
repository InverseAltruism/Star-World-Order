/**
 * Governance API Route
 * 
 * Web2-style governance system with database-backed proposals and votes.
 * Provides endpoints for:
 * - Creating proposals
 * - Voting on proposals
 * - Getting proposal data
 * - Checking vote status
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createGovernanceProposal,
  getGovernanceProposals,
  getGovernanceProposalById,
  castGovernanceVote,
  getGovernanceVotes,
  hasUserVotedOnProposal,
  getUserVoteOnProposal,
  updateGovernanceProposalState,
  ProposalStateDB,
} from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/governance
 * 
 * Get governance proposals and votes
 * Query params:
 * - action: 'proposals' | 'proposal' | 'votes' | 'hasVoted' | 'userVote'
 * - id: proposal ID (for proposal, votes, hasVoted, userVote)
 * - state: filter by proposal state
 * - address: voter address (for hasVoted, userVote)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'proposals';
    const proposalId = searchParams.get('id');
    const state = searchParams.get('state') as ProposalStateDB | null;
    const address = searchParams.get('address');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Get all proposals
    if (action === 'proposals') {
      const proposals = getGovernanceProposals({
        state: state || undefined,
        limit,
        offset,
      });
      
      return NextResponse.json({
        success: true,
        proposals,
      });
    }

    // Get single proposal
    if (action === 'proposal') {
      if (!proposalId) {
        return NextResponse.json(
          { success: false, error: 'Proposal ID required' },
          { status: 400 }
        );
      }

      const proposal = getGovernanceProposalById(proposalId);
      if (!proposal) {
        return NextResponse.json(
          { success: false, error: 'Proposal not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        proposal,
      });
    }

    // Get votes for a proposal
    if (action === 'votes') {
      if (!proposalId) {
        return NextResponse.json(
          { success: false, error: 'Proposal ID required' },
          { status: 400 }
        );
      }

      const votes = getGovernanceVotes(proposalId);
      return NextResponse.json({
        success: true,
        votes,
      });
    }

    // Check if user has voted
    if (action === 'hasVoted') {
      if (!proposalId || !address) {
        return NextResponse.json(
          { success: false, error: 'Proposal ID and address required' },
          { status: 400 }
        );
      }

      const hasVoted = hasUserVotedOnProposal(proposalId, address);
      return NextResponse.json({
        success: true,
        hasVoted,
      });
    }

    // Get user's vote on a proposal
    if (action === 'userVote') {
      if (!proposalId || !address) {
        return NextResponse.json(
          { success: false, error: 'Proposal ID and address required' },
          { status: 400 }
        );
      }

      const vote = getUserVoteOnProposal(proposalId, address);
      return NextResponse.json({
        success: true,
        vote,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('Governance API GET error:', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/governance
 * 
 * Create proposals and cast votes
 * Body:
 * - action: 'createProposal' | 'vote' | 'updateState'
 * - For createProposal: title, description, proposerAddress, votingDurationWeeks (1-4)
 * - For vote: proposalId, voterAddress, support (boolean), votingPower, reason (optional)
 * - For updateState: proposalId, newState (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // Create a new proposal
    if (action === 'createProposal') {
      const { title, description, proposerAddress, votingDurationWeeks, quorum } = body;

      if (!title || !description || !proposerAddress) {
        return NextResponse.json(
          { success: false, error: 'Title, description, and proposerAddress are required' },
          { status: 400 }
        );
      }

      // Validate voting duration (1-4 weeks)
      const duration = parseInt(votingDurationWeeks, 10) || 1;
      if (duration < 1 || duration > 4) {
        return NextResponse.json(
          { success: false, error: 'Voting duration must be between 1 and 4 weeks' },
          { status: 400 }
        );
      }

      const proposal = createGovernanceProposal({
        title,
        description,
        proposerAddress,
        votingDurationWeeks: duration,
        quorum: quorum || 10,
      });

      logger.info('Governance: Proposal created', { proposalId: proposal.id, title });
      return NextResponse.json({
        success: true,
        proposal,
      });
    }

    // Cast a vote
    if (action === 'vote') {
      const { proposalId, voterAddress, support, votingPower, reason } = body;

      if (!proposalId || !voterAddress || support === undefined) {
        return NextResponse.json(
          { success: false, error: 'ProposalId, voterAddress, and support are required' },
          { status: 400 }
        );
      }

      const result = castGovernanceVote({
        proposalId,
        voterAddress,
        support: Boolean(support),
        votingPower: parseInt(votingPower, 10) || 1,
        reason,
      });

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }

      logger.info('Governance: Vote cast', { 
        proposalId, 
        voterAddress: voterAddress.slice(0, 10) + '...', 
        support 
      });
      return NextResponse.json({
        success: true,
        vote: result.vote,
      });
    }

    // Update proposal state (could be admin-only in production)
    if (action === 'updateState') {
      const { proposalId, newState } = body;

      if (!proposalId || !newState) {
        return NextResponse.json(
          { success: false, error: 'ProposalId and newState are required' },
          { status: 400 }
        );
      }

      const validStates: ProposalStateDB[] = ['pending', 'active', 'defeated', 'succeeded', 'executed', 'cancelled'];
      if (!validStates.includes(newState)) {
        return NextResponse.json(
          { success: false, error: 'Invalid state' },
          { status: 400 }
        );
      }

      const updated = updateGovernanceProposalState(proposalId, newState);
      if (!updated) {
        return NextResponse.json(
          { success: false, error: 'Failed to update proposal state' },
          { status: 400 }
        );
      }

      logger.info('Governance: Proposal state updated', { proposalId, newState });
      return NextResponse.json({
        success: true,
        message: 'State updated',
      });
    }

    return NextResponse.json(
      { success: false, error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('Governance API POST error:', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
