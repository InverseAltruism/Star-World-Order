/**
 * Governance API Route
 * 
 * Web2-style governance system with database-backed proposals and votes.
 * Provides endpoints for:
 * - Creating proposals
 * - Voting on proposals (Yes/No/Abstain)
 * - Changing votes (24-hour window)
 * - Canceling proposals (proposer only, 48-hour lockout)
 * - Getting proposal data
 * - Checking vote status
 * - Issuing nonces for secure vote signing
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createGovernanceProposal,
  getGovernanceProposals,
  getGovernanceProposalById,
  castGovernanceVote,
  changeGovernanceVote,
  canChangeVote,
  cancelGovernanceProposal,
  canProposerCancelProposal,
  getGovernanceVotes,
  hasUserVotedOnProposal,
  getUserVoteOnProposal,
  updateGovernanceProposalState,
  ProposalStateDB,
  ProposalCategory,
  issueGovernanceNonce,
  expireOldGovernanceNonces,
  createForumThread,
  linkForumThreadToProposal,
} from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  reconstructVoteMessage,
  verifyVoteSignature,
  validateChoice,
  validateProposalId,
  normalizeAddress,
  constructVoteTypedData,
  verifyEIP712VoteSignature,
  getChainId,
} from '@/lib/voteSignature';
import { verifyAdminAccess } from '@/lib/adminAuth';
import { verifyWalletAccess } from '@/lib/walletAuth';

/**
 * GET /api/governance
 * 
 * Get governance proposals and votes
 * Query params:
 * - action: 'proposals' | 'proposal' | 'votes' | 'hasVoted' | 'userVote' | 'canChangeVote' | 'canCancel' | 'snapshotStatus' | 'verifySnapshot' | 'nonce'
 * - id: proposal ID (for proposal, votes, hasVoted, userVote, canChangeVote, canCancel, verifySnapshot, nonce)
 * - state: filter by proposal state
 * - category: filter by proposal category
 * - address: voter address (for hasVoted, userVote, nonce) or proposer address (for canCancel)
 * - snapshotId: Snapshot proposal ID for verification (optional, defaults to id)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'proposals';
    const proposalId = searchParams.get('id');
    const state = searchParams.get('state') as ProposalStateDB | null;
    const category = searchParams.get('category') as ProposalCategory | null;
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
      
      // Filter by category if provided (client-side filtering for now)
      const filteredProposals = category 
        ? proposals.filter(p => p.category === category)
        : proposals;
      
      return NextResponse.json({
        success: true,
        proposals: filteredProposals,
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

    // Check if vote can be changed
    if (action === 'canChangeVote') {
      if (!proposalId) {
        return NextResponse.json(
          { success: false, error: 'Proposal ID required' },
          { status: 400 }
        );
      }

      const result = canChangeVote(proposalId);
      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    // Check if proposer can cancel
    if (action === 'canCancel') {
      if (!proposalId || !address) {
        return NextResponse.json(
          { success: false, error: 'Proposal ID and address required' },
          { status: 400 }
        );
      }

      const result = canProposerCancelProposal(proposalId, address);
      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    // Check Snapshot configuration status
    if (action === 'snapshotStatus') {
      // Dynamically import snapshot module to avoid issues if not configured
      const { isSnapshotConfigured, getSnapshotSpaceUrl, SNAPSHOT_SPACE_ID } = await import('@/lib/snapshot');
      
      return NextResponse.json({
        success: true,
        configured: isSnapshotConfigured(),
        spaceId: SNAPSHOT_SPACE_ID || null,
        spaceUrl: isSnapshotConfigured() ? getSnapshotSpaceUrl() : null,
      });
    }

    // Verify votes against Snapshot
    if (action === 'verifySnapshot') {
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

      // Dynamically import snapshot verification
      const { verifyVotesWithSnapshot, isSnapshotConfigured } = await import('@/lib/snapshot');
      
      if (!isSnapshotConfigured()) {
        return NextResponse.json({
          success: true,
          configured: false,
          message: 'Snapshot is not configured. Set NEXT_PUBLIC_SNAPSHOT_SPACE in environment variables.',
        });
      }

      // Get Snapshot proposal ID from the request or use the database proposal ID
      const snapshotProposalId = searchParams.get('snapshotId') || proposalId;

      const verification = await verifyVotesWithSnapshot(snapshotProposalId, {
        yes: proposal.for_votes,
        no: proposal.against_votes,
        abstain: proposal.abstain_votes || 0,
      });

      return NextResponse.json({
        success: true,
        configured: true,
        verification,
      });
    }

    // Issue a nonce for vote signing
    if (action === 'nonce') {
      if (!proposalId || !address) {
        return NextResponse.json(
          { success: false, error: 'Proposal ID and address required' },
          { status: 400 }
        );
      }

      // Check if proposal exists
      const proposal = getGovernanceProposalById(proposalId);
      if (!proposal) {
        return NextResponse.json(
          { success: false, error: 'Proposal not found' },
          { status: 404 }
        );
      }

      // Clean up expired nonces periodically
      expireOldGovernanceNonces();

      // Issue a new nonce
      const nonce = issueGovernanceNonce(proposalId, address);

      return NextResponse.json({
        success: true,
        nonce: nonce.nonce,
        issuedAt: nonce.issued_at,
        expiresAt: nonce.expires_at,
        snapshotBlock: proposal.snapshot_block,
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
 * - action: 'createProposal' | 'vote' | 'changeVote' | 'cancelProposal' | 'updateState'
 * - For createProposal: title, description, proposerAddress, votingDurationWeeks (1-4), category (optional)
 * - For vote: proposalId, voterAddress, support (0=No, 1=Yes, 2=Abstain), votingPower, reason (optional)
 * - For changeVote: proposalId, voterAddress, newSupport (0/1/2), reason (optional)
 * - For cancelProposal: proposalId, userAddress
 * - For updateState: proposalId, newState (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // Create a new proposal
    if (action === 'createProposal') {
      const { title, description, proposerAddress, votingDurationWeeks, quorum, category } = body;

      if (!title || !description || !proposerAddress) {
        return NextResponse.json(
          { success: false, error: 'Title, description, and proposerAddress are required' },
          { status: 400 }
        );
      }

      const walletAuth = await verifyWalletAccess(request, proposerAddress);
      if (!walletAuth.valid) {
        return NextResponse.json(
          { success: false, error: walletAuth.error },
          { status: 401 }
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

      // Validate category if provided
      const validCategories = ['treasury', 'community', 'technical', 'governance', 'general'];
      if (category && !validCategories.includes(category)) {
        return NextResponse.json(
          { success: false, error: 'Invalid category' },
          { status: 400 }
        );
      }

      const proposal = await createGovernanceProposal({
        title,
        description,
        proposerAddress,
        votingDurationWeeks: duration,
        quorum: quorum || 10,
        category: category || 'general',
      });

      // Automatically create a forum thread in the 'governance' category for discussion
      try {
        const categoryDisplay = (category || 'general').toUpperCase();
        const votingPeriodText = `${duration} week${duration > 1 ? 's' : ''}`;
        
        const forumThreadContent = [
          '## 📜 Governance Proposal Discussion',
          '',
          `**Proposal:** ${title}`,
          '',
          `**Category:** ${categoryDisplay}`,
          '',
          `**Voting Period:** ${votingPeriodText}`,
          '',
          '---',
          '',
          '### Description',
          '',
          description,
          '',
          '---',
          '',
          '*This discussion thread was automatically created for the governance proposal. Please discuss the proposal here before casting your vote.*',
        ].join('\n');
        
        const forumThread = createForumThread({
          title: `[VOTE] ${title}`,
          content: forumThreadContent,
          authorAddress: proposerAddress,
          category: 'governance',
          proposalId: proposal.id,
        });
        
        // Link the forum thread to the proposal
        linkForumThreadToProposal(proposal.id, forumThread.id);
        
        logger.info('Governance: Forum thread created for proposal', { 
          proposalId: proposal.id, 
          forumThreadId: forumThread.id 
        });
      } catch (forumError) {
        // Log the error but don't fail the proposal creation
        logger.error('Governance: Failed to create forum thread for proposal', { 
          proposalId: proposal.id, 
          error: String(forumError) 
        });
      }

      logger.info('Governance: Proposal created', { proposalId: proposal.id, title, category: proposal.category });
      return NextResponse.json({
        success: true,
        proposal,
      });
    }

    // Cast a vote
    if (action === 'vote') {
      const { proposalId, voterAddress, support, votingPower, reason, signature, nonce, signatureVersion, typedData } = body;

      // Strict input validation
      if (!proposalId || !voterAddress || support === undefined) {
        return NextResponse.json(
          { success: false, error: 'ProposalId, voterAddress, and support are required' },
          { status: 400 }
        );
      }

      // Validate proposal ID format
      if (!validateProposalId(proposalId)) {
        return NextResponse.json(
          { success: false, error: 'Invalid proposal ID format' },
          { status: 400 }
        );
      }

      // Validate and normalize voter address
      const normalizedVoterAddress = normalizeAddress(voterAddress);
      if (!normalizedVoterAddress) {
        return NextResponse.json(
          { success: false, error: 'Invalid voter address' },
          { status: 400 }
        );
      }

      // Validate support value (0=No, 1=Yes, 2=Abstain)
      const supportValue = typeof support === 'boolean' ? (support ? 1 : 0) : parseInt(support, 10);
      if (!validateChoice(supportValue)) {
        return NextResponse.json(
          { success: false, error: 'Support must be 0 (No), 1 (Yes), or 2 (Abstain)' },
          { status: 400 }
        );
      }

      // Get the proposal
      const proposal = getGovernanceProposalById(proposalId);
      if (!proposal) {
        return NextResponse.json(
          { success: false, error: 'Proposal not found' },
          { status: 404 }
        );
      }

      // Get chain ID from environment
      const chainId = getChainId();

      if (!signature || !nonce) {
        return NextResponse.json(
          { success: false, error: 'Signature and nonce are required for voting' },
          { status: 400 }
        );
      }

      // Import nonce validation
      const { consumeGovernanceNonce } = await import('@/lib/db');
      
      // 1. Validate and consume the nonce
      const nonceRecord = consumeGovernanceNonce(nonce, proposalId, normalizedVoterAddress);
      if (!nonceRecord) {
        return NextResponse.json(
          { success: false, error: 'Invalid or expired nonce. Please request a new nonce and try again.' },
          { status: 400 }
        );
      }

      // Determine signature version (prefer EIP-712 if not specified)
      const version = signatureVersion || 'eip712';

      // 2. Verify signature based on version
      let isValidSignature = false;
      let reconstructedTypedData: any = null;

      if (version === 'eip712') {
        // EIP-712 verification
        // Reconstruct typed data server-side (NEVER trust client)
        reconstructedTypedData = constructVoteTypedData(
          proposalId,
          supportValue,
          normalizedVoterAddress,
          nonce,
          proposal.snapshot_block || 0,
          chainId
        );

        // Verify the EIP-712 signature
        isValidSignature = await verifyEIP712VoteSignature(
          normalizedVoterAddress,
          reconstructedTypedData,
          signature as `0x${string}`,
          chainId
        );
      } else {
        // Legacy EIP-191 verification
        const serverMessage = reconstructVoteMessage(
          proposalId,
          supportValue,
          nonce,
          proposal.snapshot_block || 0,
          proposal.title,
          chainId,
          'starworldorder.com'
        );

        isValidSignature = await verifyVoteSignature(
          normalizedVoterAddress,
          serverMessage,
          signature as `0x${string}`
        );
      }

      if (!isValidSignature) {
        return NextResponse.json(
          { success: false, error: 'Invalid signature. Signature verification failed.' },
          { status: 400 }
        );
      }

      // Signature is valid, proceed with vote
      logger.info('Governance: Valid signature verified', { 
        proposalId, 
        voterAddress: normalizedVoterAddress.slice(0, 10) + '...',
        version
      });

      // Store vote with signature data
      const result = castGovernanceVote({
        proposalId,
        voterAddress: normalizedVoterAddress,
        support: supportValue,
        votingPower: parseInt(votingPower, 10) || 1,
        reason,
        signature,
        signatureVersion: version,
        signatureData: {
          message: version === 'eip191' ? 'server-reconstructed' : undefined,
          timestamp: Date.now(),
          nonce,
          typedData: version === 'eip712' ? reconstructedTypedData : undefined,
        },
      });

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }

      const supportLabel = supportValue === 1 ? 'Yes' : supportValue === 0 ? 'No' : 'Abstain';
      logger.info('Governance: Vote cast', { 
        proposalId, 
        voterAddress: normalizedVoterAddress.slice(0, 10) + '...', 
        support: supportLabel,
        version
      });
      return NextResponse.json({
        success: true,
        vote: result.vote,
      });
    }

    // Change a vote
    if (action === 'changeVote') {
      const { proposalId, voterAddress, newSupport, reason } = body;

      if (!proposalId || !voterAddress || newSupport === undefined) {
        return NextResponse.json(
          { success: false, error: 'ProposalId, voterAddress, and newSupport are required' },
          { status: 400 }
        );
      }

      const walletAuth = await verifyWalletAccess(request, voterAddress);
      if (!walletAuth.valid) {
        return NextResponse.json(
          { success: false, error: walletAuth.error },
          { status: 401 }
        );
      }

      // Validate support value
      const supportValue = parseInt(newSupport, 10);
      if (![0, 1, 2].includes(supportValue)) {
        return NextResponse.json(
          { success: false, error: 'NewSupport must be 0 (No), 1 (Yes), or 2 (Abstain)' },
          { status: 400 }
        );
      }

      const result = changeGovernanceVote({
        proposalId,
        voterAddress,
        newSupport: supportValue,
        votingPower: 1, // Not used in change, kept for consistency
        reason,
      });

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }

      const supportLabel = supportValue === 1 ? 'Yes' : supportValue === 0 ? 'No' : 'Abstain';
      logger.info('Governance: Vote changed', { 
        proposalId, 
        voterAddress: voterAddress.slice(0, 10) + '...', 
        newSupport: supportLabel 
      });
      return NextResponse.json({
        success: true,
        vote: result.vote,
      });
    }

    // Cancel a proposal
    if (action === 'cancelProposal') {
      const { proposalId, userAddress } = body;

      if (!proposalId || !userAddress) {
        return NextResponse.json(
          { success: false, error: 'ProposalId and userAddress are required' },
          { status: 400 }
        );
      }

      const walletAuth = await verifyWalletAccess(request, userAddress);
      if (!walletAuth.valid) {
        return NextResponse.json(
          { success: false, error: walletAuth.error },
          { status: 401 }
        );
      }

      const result = cancelGovernanceProposal(proposalId, userAddress);

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }

      logger.info('Governance: Proposal cancelled', { 
        proposalId, 
        userAddress: userAddress.slice(0, 10) + '...' 
      });
      return NextResponse.json({
        success: true,
        message: 'Proposal cancelled successfully',
      });
    }

    // Update proposal state (admin-only)
    if (action === 'updateState') {
      const auth = await verifyAdminAccess(request);
      if (!auth.valid) {
        return NextResponse.json(
          { success: false, error: auth.error },
          { status: 401 }
        );
      }

      const { proposalId, newState, defeatReason } = body;

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

      const updated = updateGovernanceProposalState(proposalId, newState, defeatReason);
      if (!updated) {
        return NextResponse.json(
          { success: false, error: 'Failed to update proposal state' },
          { status: 400 }
        );
      }

      logger.info('Governance: Proposal state updated', { proposalId, newState, defeatReason });
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
