'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSignMessage, useSignTypedData, useAccount } from 'wagmi';
import AccessGate from '@/components/AccessGate';
import MembersContent from '@/app/members/MembersContent';
import TreasuryContent from '@/app/treasury/TreasuryContent';
import ClickableUsername from '@/components/ClickableUsername';
import {
  useGovernance,
  ProposalState,
  ThreadCategory,
  getProposalStateLabel,
  getProposalStateColor,
  getCategoryLabel,
  formatRelativeTime,
  truncateAddress,
  formatMON,
  Proposal,
  ForumThread,
  ForumReply,
} from '@/lib/hooks/useGovernance';
import { useStarPoints, formatStarAmount, STAR_PER_NFT_PER_DAY } from '@/lib/hooks/useStarPoints';
import {
  createVoteSignatureRequest,
  createEIP712VoteSignatureRequest,
  SIGNATURE_SAFETY_EXPLANATION,
  getChainId,
} from '@/lib/voteSignature';

// Default minimum voters for quorum (used when not specified in proposal)
const DEFAULT_MIN_VOTERS = 10;

type TabId = 'governance' | 'forum' | 'members' | 'treasury' | 'staking';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
  disabled?: boolean;
}

const tabs: Tab[] = [
  { id: 'governance', label: 'GOVERNANCE', icon: '🗳️' },
  { id: 'forum', label: 'STAR COUNCIL', icon: '💬' },
  { id: 'members', label: 'MEMBERS', icon: '👥' },
  { id: 'treasury', label: 'TREASURY', icon: '💰' },
  { id: 'staking', label: 'STAKING', icon: '🔒', disabled: true },
];

/**
 * Snapshot verification link component
 * Shows a link to verify votes on Snapshot.org if configured
 */
function SnapshotVerifyLink({ proposalId }: { proposalId: string }) {
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    // Check Snapshot status on mount
    const checkSnapshot = async () => {
      try {
        const response = await fetch('/api/governance?action=snapshotStatus');
        const data = await response.json();
        if (data.success && data.configured) {
          setConfigured(true);
          // Construct the proposal URL
          const baseUrl = data.spaceUrl || 'https://snapshot.org';
          setSnapshotUrl(`${baseUrl}/proposal/${proposalId}`);
        }
      } catch (error) {
        // Silently fail - Snapshot is optional
        console.debug('Snapshot status check failed:', error);
      }
    };
    checkSnapshot();
  }, [proposalId]);

  if (!configured || !snapshotUrl) {
    return null;
  }

  return (
    <a
      href={snapshotUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[10px] text-[#9966ff] hover:text-[#ffd700] transition-colors"
      title="Verify votes on Snapshot.org"
    >
      🔍 Verify
    </a>
  );
}

/**
 * Format time remaining for a proposal vote
 * Returns a human-readable string like "2d 5h 30m" or "ENDED"
 */
function formatVoteTimeRemaining(endTime: string | null | undefined): { text: string; isUrgent: boolean; isEnded: boolean } {
  if (!endTime) {
    return { text: 'No end time', isUrgent: false, isEnded: false };
  }
  
  const end = new Date(endTime).getTime();
  const now = Date.now();
  const diff = end - now;
  
  if (diff <= 0) {
    return { text: 'ENDED', isUrgent: false, isEnded: true };
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  // Urgent if less than 24 hours
  const isUrgent = diff < 24 * 60 * 60 * 1000;
  
  if (days > 0) {
    return { text: `${days}d ${hours}h`, isUrgent, isEnded: false };
  }
  if (hours > 0) {
    return { text: `${hours}h ${minutes}m`, isUrgent, isEnded: false };
  }
  return { text: `${minutes}m`, isUrgent, isEnded: false };
}

/**
 * Extended Proposal type that includes database fields
 */
interface ExtendedProposal extends Proposal {
  endTime?: string | null;
  startTime?: string | null;
  votingDurationWeeks?: number;
  quorum?: number;
  abstainVotes?: number;
  uniqueVoterCount?: number;
  minVoters?: number;
  category?: string;
  defeatReason?: string | null;
  forumThreadId?: string | null;
}

/**
 * Proposal categories with icons
 */
const PROPOSAL_CATEGORIES = [
  { value: 'general', label: '📋 General', description: 'Anything else' },
  { value: 'treasury', label: '💰 Treasury', description: 'Fund allocation requests' },
  { value: 'community', label: '🎉 Community', description: 'Events, partnerships, contests' },
  { value: 'technical', label: '⚙️ Technical', description: 'Contract/site changes' },
  { value: 'governance', label: '📜 Governance', description: 'Rule changes (quorum, voting periods)' },
];

/**
 * Create Proposal Modal with category support
 */
function CreateProposalModal({
  isOpen,
  onClose,
  onCreate,
  isPending,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, description: string, votingDurationWeeks: number, category?: string) => Promise<{ success: boolean; error?: string }>;
  isPending: boolean;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [votingDuration, setVotingDuration] = useState<number>(1);
  const [category, setCategory] = useState<string>('general');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setError(null);
    const result = await onCreate(title, description, votingDuration, category);
    if (result.success) {
      setTitle('');
      setDescription('');
      setVotingDuration(1);
      setCategory('general');
      onClose();
    } else {
      setError(result.error || 'Failed to create proposal');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in overflow-hidden">
      <div className="pixel-card p-6 max-w-lg w-full animate-slide-in-up max-h-[90vh] overflow-y-auto overscroll-contain touch-pan-y">
        <h3 className="text-[#ffd700] text-sm tracking-wider mb-4 animate-glow-pulse">
          CREATE NEW PROPOSAL
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="text-[#9966ff] text-xs block mb-2">PROPOSAL TITLE</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a short, descriptive title..."
              className="w-full bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-4 py-3 text-white text-[10px] focus:border-[#ffd700] focus:outline-none smooth-transition"
            />
          </div>

          <div>
            <label className="text-[#9966ff] text-xs block mb-2">CATEGORY</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-4 py-3 text-white text-[10px] focus:border-[#ffd700] focus:outline-none smooth-transition cursor-pointer"
            >
              {PROPOSAL_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="text-[#9966ff] text-xs block mb-2">DESCRIPTION</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your proposal in detail. Include rationale, expected outcomes, and any relevant information..."
              rows={6}
              className="w-full bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-4 py-3 text-white text-[10px] focus:border-[#ffd700] focus:outline-none smooth-transition resize-none"
            />
          </div>

          <div>
            <label className="text-[#9966ff] text-xs block mb-2">VOTING DURATION</label>
            <select
              value={votingDuration}
              onChange={(e) => setVotingDuration(parseInt(e.target.value, 10))}
              className="w-full bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-4 py-3 text-white text-[10px] focus:border-[#ffd700] focus:outline-none smooth-transition cursor-pointer"
            >
              <option value={1}>1 Week</option>
              <option value={2}>2 Weeks</option>
              <option value={3}>3 Weeks</option>
              <option value={4}>4 Weeks</option>
            </select>
          </div>
          
          {error && (
            <div className="text-[#ff4466] text-xs bg-[#ff4466]/10 px-3 py-2 rounded">
              {error}
            </div>
          )}
          
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 pixel-btn text-xs !bg-[#1a1a2e] !border-[#3a3a5e_#1a1a2e_#1a1a2e_#3a3a5e] smooth-transition hover-lift"
            >
              CANCEL
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending || !title.trim() || !description.trim()}
              className="flex-1 pixel-btn pixel-btn-gold text-xs smooth-transition hover-lift disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'CREATING...' : 'CREATE PROPOSAL'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Vote Modal
 */
/**
 * Support type for three-way voting
 */
type VoteSupport = 'yes' | 'no' | 'abstain' | number;

function VoteModal({
  isOpen,
  proposal,
  onClose,
  onVote,
  isPending,
}: {
  isOpen: boolean;
  proposal: Proposal | null;
  onClose: () => void;
  onVote: (proposalId: string, support: VoteSupport, reason?: string, signature?: string, signatureData?: { message?: string; timestamp: number; nonce: string; typedData?: any }, signatureVersion?: 'eip712' | 'eip191') => Promise<{ success: boolean; error?: string }>;
  isPending: boolean;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showSafetyInfo, setShowSafetyInfo] = useState(false);
  const [pendingVote, setPendingVote] = useState<VoteSupport | null>(null);
  const [voteStep, setVoteStep] = useState<'choice' | 'signing'>('choice');
  
  const { signTypedDataAsync, isPending: isSigningPendingTyped } = useSignTypedData();
  const { signMessageAsync, isPending: isSigningPendingMessage } = useSignMessage();
  const { address } = useAccount();
  
  const isSigningPending = isSigningPendingTyped || isSigningPendingMessage;

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setReason('');
      setError(null);
      setShowSafetyInfo(false);
      setPendingVote(null);
      setVoteStep('choice');
    }
  }, [isOpen]);

  if (!isOpen || !proposal) return null;

  const handleVoteClick = (support: VoteSupport) => {
    setPendingVote(support);
    setVoteStep('signing');
    setError(null);
  };

  const handleConfirmVote = async () => {
    if (!pendingVote || !address) return;
    
    setError(null);
    
    try {
      // STEP 1: Fetch server-issued nonce
      const nonceResponse = await fetch(
        `/api/governance?action=nonce&id=${encodeURIComponent(proposal.id)}&address=${encodeURIComponent(address)}`,
        { method: 'GET' }
      );
      
      if (!nonceResponse.ok) {
        throw new Error('Failed to obtain voting nonce');
      }
      
      const nonceData = await nonceResponse.json();
      if (!nonceData.success || !nonceData.nonce) {
        throw new Error(nonceData.error || 'Failed to obtain voting nonce');
      }
      
      const { nonce, snapshotBlock } = nonceData;
      const chainId = getChainId();
      
      // STEP 2: Create EIP-712 typed data with server-issued nonce
      const signatureRequest = createEIP712VoteSignatureRequest(
        proposal.id,
        pendingVote,
        address,
        nonce,
        snapshotBlock || 0,
        chainId
      );
      
      // STEP 3: Request EIP-712 signature from wallet
      const signature = await signTypedDataAsync({
        domain: signatureRequest.domain,
        types: signatureRequest.types,
        primaryType: signatureRequest.primaryType,
        message: signatureRequest.message,
      });
      
      // STEP 4: Submit vote with EIP-712 signature and typed data
      const result = await onVote(
        proposal.id,
        pendingVote,
        reason || undefined,
        signature,
        { 
          nonce: signatureRequest.nonce,
          timestamp: Date.now(),
          typedData: signatureRequest.message,
        },
        'eip712'
      );
      
      if (result.success) {
        setReason('');
        setPendingVote(null);
        setVoteStep('choice');
        onClose();
      } else {
        setError(result.error || 'Failed to cast vote');
        setVoteStep('choice');
      }
    } catch (err) {
      // Handle signature rejection or other errors
      // Check for common rejection patterns across wallet implementations
      const errorMessage = (err as Error).message?.toLowerCase() || '';
      const isUserRejection = 
        errorMessage.includes('user rejected') ||
        errorMessage.includes('user denied') ||
        errorMessage.includes('rejected by user') ||
        errorMessage.includes('user cancelled') ||
        errorMessage.includes('action_rejected') ||
        (err as { code?: number }).code === 4001; // EIP-1193 user rejection code
      
      if (isUserRejection) {
        setError('Signature cancelled. Your vote was not recorded.');
      } else {
        setError(errorMessage.includes('nonce') 
          ? 'Voting session expired. Please try again.'
          : 'Failed to sign vote. Please try again.');
      }
      setVoteStep('choice');
    }
  };

  const handleBack = () => {
    setVoteStep('choice');
    setPendingVote(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in overflow-hidden">
      <div className="pixel-card p-6 max-w-lg w-full animate-slide-in-up overscroll-contain max-h-[90vh] overflow-y-auto">
        <h3 className="text-[#ffd700] text-sm tracking-wider mb-4 animate-glow-pulse">
          🗳️ {voteStep === 'choice' ? 'CAST YOUR VOTE' : 'CONFIRM YOUR VOTE'}
        </h3>
        
        <div className="mb-4">
          <h4 className="text-gray-200 text-[10px] font-bold mb-2">{proposal.title}</h4>
          <div className="bg-[#0a0a15] border border-[#2a2a4e] rounded-lg p-3 max-h-[200px] overflow-y-auto scrollbar-pixel">
            <p className="text-gray-400 text-xs whitespace-pre-wrap leading-relaxed">{proposal.description}</p>
          </div>
        </div>
        
        {voteStep === 'choice' ? (
          // Step 1: Vote Choice
          <div className="space-y-4">
            <div>
              <label className="text-[#9966ff] text-xs block mb-2">REASON (OPTIONAL)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain your vote (optional)..."
                rows={3}
                className="w-full bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-4 py-3 text-white text-[10px] focus:border-[#ffd700] focus:outline-none smooth-transition resize-none"
              />
            </div>
            
            {error && (
              <div className="text-[#ff4466] text-xs bg-[#ff4466]/10 px-3 py-2 rounded">
                ⚠️ {error}
              </div>
            )}
            
            {/* Three-way voting buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => handleVoteClick('yes')}
                disabled={isPending || isSigningPending}
                className="flex-1 pixel-btn text-xs !bg-[#44ff88] !border-[#66ffaa_#22aa44_#22aa44_#66ffaa] smooth-transition hover-lift disabled:opacity-50"
              >
                ✓ YES
              </button>
              <button
                onClick={() => handleVoteClick('no')}
                disabled={isPending || isSigningPending}
                className="flex-1 pixel-btn text-xs !bg-[#ff4466] !border-[#ff6688_#aa2244_#aa2244_#ff6688] smooth-transition hover-lift disabled:opacity-50"
              >
                ✕ NO
              </button>
              <button
                onClick={() => handleVoteClick('abstain')}
                disabled={isPending || isSigningPending}
                className="flex-1 pixel-btn text-xs !bg-[#ffd700] !border-[#ffee44_#ccaa00_#ccaa00_#ffee44] smooth-transition hover-lift disabled:opacity-50 text-black"
              >
                ◯ ABSTAIN
              </button>
            </div>
            
            <button
              onClick={onClose}
              className="w-full pixel-btn text-xs !bg-[#1a1a2e] !border-[#3a3a5e_#1a1a2e_#1a1a2e_#3a3a5e] smooth-transition hover-lift"
            >
              CANCEL
            </button>
          </div>
        ) : (
          // Step 2: Signature Confirmation
          <div className="space-y-4">
            {/* Vote summary */}
            <div className="bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg p-4">
              <div className="text-center mb-3">
                <span className="text-gray-400 text-xs">Your vote:</span>
                <div className={`text-2xl font-bold mt-1 ${
                  pendingVote === 'yes' ? 'text-[#44ff88]' : 
                  pendingVote === 'no' ? 'text-[#ff4466]' : 
                  'text-[#ffd700]'
                }`}>
                  {pendingVote === 'yes' ? '✓ YES' : pendingVote === 'no' ? '✕ NO' : '◯ ABSTAIN'}
                </div>
              </div>
            </div>
            
            {/* Safety Notice - Simplified and less alarming */}
            <div className="bg-[#0a0a15] border border-[#2a2a4e] rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-[#9966ff] text-sm">✍️</span>
                <div>
                  <p className="text-gray-300 text-[10px]">
                    Sign to confirm your vote. This is a standard signature (not a transaction).
                  </p>
                </div>
              </div>
            </div>
            
            {/* Expandable details - More discrete toggle */}
            <button
              onClick={() => setShowSafetyInfo(!showSafetyInfo)}
              className="w-full text-gray-500 text-[9px] hover:text-[#9966ff] transition-colors flex items-center justify-center gap-1"
            >
              {showSafetyInfo ? '▼' : '▶'} What does signing mean?
            </button>
            
            {showSafetyInfo && (
              <div className="bg-[#0a0a15] border border-[#2a2a4e] rounded-lg p-3">
                <p className="text-gray-400 text-[9px] leading-relaxed">
                  <span className="text-[#44ff88]">✓ Safe:</span> Signatures prove you own your wallet and confirm your vote choice.<br/><br/>
                  <span className="text-[#ff4466]">✗ Cannot:</span> Move tokens, NFTs, or interact with contracts.<br/><br/>
                  This is the same standard used by Snapshot, OpenSea, and other major protocols.
                </p>
              </div>
            )}
            
            {error && (
              <div className="text-[#ff4466] text-xs bg-[#ff4466]/10 px-3 py-2 rounded">
                ⚠️ {error}
              </div>
            )}
            
            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleBack}
                disabled={isPending || isSigningPending}
                className="flex-1 pixel-btn text-xs !bg-[#1a1a2e] !border-[#3a3a5e_#1a1a2e_#1a1a2e_#3a3a5e] smooth-transition hover-lift disabled:opacity-50"
              >
                ← BACK
              </button>
              <button
                onClick={handleConfirmVote}
                disabled={isPending || isSigningPending}
                className="flex-1 pixel-btn text-xs !bg-[#9966ff] !border-[#bb99ff_#5533aa_#5533aa_#bb99ff] smooth-transition hover-lift disabled:opacity-50"
              >
                {isPending || isSigningPending ? '⏳ SIGNING...' : '✍️ SIGN & VOTE'}
              </button>
            </div>
            
            <p className="text-gray-600 text-[9px] text-center">
              Your wallet will prompt you to sign a message.
              This is NOT a transaction and costs no gas.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Vote info for voters modal
 */
interface VoteInfo {
  id: number;
  proposal_id: string;
  voter_address: string;
  voter_display_name?: string | null;
  support: number;
  voting_power: number;
  reason: string | null;
  created_at: string;
}

/**
 * Voters Modal - Shows who voted and their reasons (supports three-way voting)
 */
function VotersModal({
  isOpen,
  proposalId,
  proposalTitle,
  onClose,
}: {
  isOpen: boolean;
  proposalId: string;
  proposalTitle: string;
  onClose: () => void;
}) {
  const [votes, setVotes] = useState<VoteInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'for' | 'against' | 'abstain'>('all');

  useEffect(() => {
    if (!isOpen || !proposalId) return;
    
    const fetchVotes = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/governance?action=votes&id=${proposalId}`);
        const data = await response.json();
        if (data.success) {
          setVotes(data.votes || []);
        }
      } catch (error) {
        console.error('Failed to fetch votes:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchVotes();
  }, [isOpen, proposalId]);

  if (!isOpen) return null;

  const filteredVotes = votes.filter(vote => {
    if (filter === 'all') return true;
    if (filter === 'for') return vote.support === 1;
    if (filter === 'against') return vote.support === 0;
    if (filter === 'abstain') return vote.support === 2;
    return true;
  });

  const forVotes = votes.filter(v => v.support === 1);
  const againstVotes = votes.filter(v => v.support === 0);
  const abstainVotes = votes.filter(v => v.support === 2);

  // Helper to get vote display info
  const getVoteDisplay = (support: number) => {
    switch (support) {
      case 1: return { label: '✓ YES', color: 'text-[#44ff88]', bg: 'bg-[#44ff88]/10 border-[#44ff88]/30' };
      case 0: return { label: '✕ NO', color: 'text-[#ff4466]', bg: 'bg-[#ff4466]/10 border-[#ff4466]/30' };
      case 2: return { label: '◯ ABSTAIN', color: 'text-[#ffd700]', bg: 'bg-[#ffd700]/10 border-[#ffd700]/30' };
      default: return { label: 'UNKNOWN', color: 'text-gray-500', bg: 'bg-gray-500/10 border-gray-500/30' };
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in overflow-hidden">
      <div className="pixel-card p-6 max-w-lg w-full animate-slide-in-up max-h-[80vh] flex flex-col overscroll-contain">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-[#ffd700] text-sm tracking-wider animate-glow-pulse">
              🗳️ VOTERS
            </h3>
            <p className="text-gray-500 text-xs mt-1 line-clamp-1">{proposalTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-xl"
          >
            ×
          </button>
        </div>

        {/* Vote Summary - Now includes abstain */}
        <div className="flex flex-wrap gap-3 mb-4 text-xs">
          <div className="flex items-center gap-1 text-[#44ff88]">
            <span>✓ YES:</span>
            <span className="font-bold">{forVotes.length}</span>
            <span className="text-gray-500">({forVotes.reduce((sum, v) => sum + v.voting_power, 0)})</span>
          </div>
          <div className="flex items-center gap-1 text-[#ff4466]">
            <span>✕ NO:</span>
            <span className="font-bold">{againstVotes.length}</span>
            <span className="text-gray-500">({againstVotes.reduce((sum, v) => sum + v.voting_power, 0)})</span>
          </div>
          <div className="flex items-center gap-1 text-[#ffd700]">
            <span>◯ ABSTAIN:</span>
            <span className="font-bold">{abstainVotes.length}</span>
            <span className="text-gray-500">({abstainVotes.reduce((sum, v) => sum + v.voting_power, 0)})</span>
          </div>
        </div>

        {/* Filter Tabs - Now includes abstain */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {(['all', 'for', 'against', 'abstain'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-lg ${
                filter === f
                  ? 'bg-[#ffd700]/20 text-[#ffd700] border border-[#ffd700]/50'
                  : 'bg-[#1a1a2e] text-gray-500 hover:text-white'
              }`}
            >
              {f === 'for' ? 'YES' : f.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Voters List */}
        <div className="flex-1 overflow-y-auto space-y-2 scrollbar-pixel">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-3xl animate-spin">⭐</div>
            </div>
          ) : filteredVotes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-xs">No votes yet</p>
            </div>
          ) : (
            filteredVotes.map(vote => {
              const display = getVoteDisplay(vote.support);
              return (
                <div 
                  key={vote.id} 
                  className={`p-3 rounded-lg border ${display.bg}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={display.color}>
                        {display.label}
                      </span>
                      <ClickableUsername 
                        address={vote.voter_address} 
                        displayName={vote.voter_display_name} 
                        className="text-xs font-bold"
                      />
                    </div>
                    <span className="text-gray-500 text-xs">
                      {vote.voting_power} vote{vote.voting_power > 1 ? 's' : ''}
                    </span>
                  </div>
                  {vote.reason && (
                    <p className="text-gray-400 text-xs mt-1 italic">&quot;{vote.reason}&quot;</p>
                  )}
                  <p className="text-gray-600 text-[10px] mt-1">
                    {formatRelativeTime(new Date(vote.created_at).getTime())}
                  </p>
                </div>
              );
            })
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full pixel-btn text-xs !bg-[#1a1a2e] !border-[#3a3a5e_#1a1a2e_#1a1a2e_#3a3a5e]"
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}

/**
 * Governance Tab Component
 */
function GovernanceTab({
  proposals,
  onCreateProposal,
  onVote,
  hasVoted,
  votingPower,
  isLoading,
  onViewDiscussion,
}: {
  proposals: Proposal[];
  onCreateProposal: (title: string, description: string, votingDurationWeeks: number, category?: string) => Promise<{ success: boolean; error?: string }>;
  onVote: (
    proposalId: string,
    support: VoteSupport,
    reason?: string,
    signature?: string,
    signatureData?: { message?: string; timestamp: number; nonce: string; typedData?: any },
    signatureVersion?: 'eip712' | 'eip191'
  ) => Promise<{ success: boolean; error?: string }>;
  hasVoted: (proposalId: string) => boolean;
  votingPower: number;
  isLoading: boolean;
  onViewDiscussion?: (forumThreadId: string) => void;
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [viewVotersProposal, setViewVotersProposal] = useState<Proposal | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [govSubTab, setGovSubTab] = useState<'active' | 'history'>('active');
  const [, setTimeUpdate] = useState(0); // Force re-render for countdown

  // Update countdown every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeUpdate(prev => prev + 1);
    }, 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  // Filter proposals by status
  const activeProposals = proposals.filter(
    p => p.state === ProposalState.Active || p.state === ProposalState.Pending
  );
  const historyProposals = proposals.filter(
    p => p.state === ProposalState.Defeated || 
         p.state === ProposalState.Succeeded || 
         p.state === ProposalState.Executed ||
         p.state === ProposalState.Cancelled
  ).sort((a, b) => b.createdAt - a.createdAt); // Most recent first

  const handleCreate = async (title: string, description: string, votingDurationWeeks: number, category?: string) => {
    setIsPending(true);
    const result = await onCreateProposal(title, description, votingDurationWeeks, category);
    setIsPending(false);
    return result;
  };

  const handleVote = async (
    proposalId: string,
    support: VoteSupport,
    reason?: string,
    signature?: string,
    signatureData?: { message?: string; timestamp: number; nonce: string; typedData?: any },
    signatureVersion?: 'eip712' | 'eip191'
  ) => {
    setIsPending(true);
    const result = await onVote(
      proposalId,
      support,
      reason,
      signature,
      signatureData,
      signatureVersion
    );
    setIsPending(false);
    return result;
  };

  if (isLoading) {
    return (
      <div className="pixel-card p-8 text-center animate-slide-in-up">
        <div className="text-4xl mb-4 animate-spin">⭐</div>
        <p className="text-[#ffd700] text-xs animate-pixel-pulse">LOADING PROPOSALS...</p>
      </div>
    );
  }

  // Helper to get pass/fail result for a proposal
  const getProposalResult = (proposal: Proposal): { passed: boolean; reason: string } => {
    if (proposal.state === ProposalState.Succeeded || proposal.state === ProposalState.Executed) {
      return { passed: true, reason: 'Passed' };
    }
    if (proposal.state === ProposalState.Defeated) {
      if (proposal.forVotes < proposal.againstVotes) {
        return { passed: false, reason: 'More votes against' };
      }
      return { passed: false, reason: 'Did not reach quorum' };
    }
    if (proposal.state === ProposalState.Cancelled) {
      return { passed: false, reason: 'Cancelled by proposer' };
    }
    return { passed: false, reason: 'Unknown' };
  };

  const displayProposals = govSubTab === 'active' ? activeProposals : historyProposals;

  return (
    <div className="space-y-6">
      {/* Create Proposal Modal */}
      <CreateProposalModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
        isPending={isPending}
      />
      
      {/* Vote Modal */}
      <VoteModal
        isOpen={selectedProposal !== null}
        proposal={selectedProposal}
        onClose={() => setSelectedProposal(null)}
        onVote={handleVote}
        isPending={isPending}
      />

      {/* Voters Modal */}
      <VotersModal
        isOpen={viewVotersProposal !== null}
        proposalId={viewVotersProposal?.id || ''}
        proposalTitle={viewVotersProposal?.title || ''}
        onClose={() => setViewVotersProposal(null)}
      />

      {/* Header */}
      <div className="flex justify-between items-center animate-slide-in-up">
        <div>
          <h3 className="text-[#ffd700] text-xs tracking-wider animate-glow-pulse">GOVERNANCE</h3>
          <p className="text-gray-500 text-[10px]">Your voting power: {votingPower} ⭐</p>
        </div>
        <div className="flex items-center gap-2">
          <GovernanceInfoButton />
          <button 
            onClick={() => setShowCreateModal(true)}
            className="pixel-btn pixel-btn-gold text-xs !px-3 !py-2 smooth-transition hover-lift"
          >
            + NEW PROPOSAL
          </button>
        </div>
      </div>

      {/* Active/History Sub-tabs */}
      <div className="flex gap-2 animate-slide-in-up animate-delay-1">
        <button
          onClick={() => setGovSubTab('active')}
          className={`px-4 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
            govSubTab === 'active'
              ? 'bg-[#44ff88]/20 border-[#44ff88] text-[#44ff88]'
              : 'bg-[#1a1a2e] border-[#2a2a4e] text-gray-400 hover:border-[#44ff88]/50'
          }`}
        >
          🗳️ ACTIVE ({activeProposals.length})
        </button>
        <button
          onClick={() => setGovSubTab('history')}
          className={`px-4 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
            govSubTab === 'history'
              ? 'bg-[#9966ff]/20 border-[#9966ff] text-[#9966ff]'
              : 'bg-[#1a1a2e] border-[#2a2a4e] text-gray-400 hover:border-[#9966ff]/50'
          }`}
        >
          📜 HISTORY ({historyProposals.length})
        </button>
      </div>

      {/* Proposals List */}
      {displayProposals.length === 0 ? (
        <div className="pixel-card p-8 text-center animate-slide-in-up">
          <div className="text-4xl mb-4 animate-pixel-float">{govSubTab === 'active' ? '📜' : '📁'}</div>
          <h3 className="text-[#ffd700] text-xs tracking-wider mb-2">
            {govSubTab === 'active' ? 'NO ACTIVE PROPOSALS' : 'NO PAST PROPOSALS'}
          </h3>
          <p className="text-gray-500 text-xs">
            {govSubTab === 'active' 
              ? 'Be the first to create a proposal for The Order!' 
              : 'Completed proposals will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayProposals.map((proposal, index) => {
            const delayClass = `animate-delay-${Math.min(index + 1, 6)}`;
            const extendedProposal = proposal as ExtendedProposal;
            const abstainVotes = extendedProposal.abstainVotes || 0;
            const totalVotes = (proposal.forVotes + proposal.againstVotes + abstainVotes) || 1;
            const hasUserVoted = hasVoted(proposal.id);
            const isActive = proposal.state === ProposalState.Active;
            const isPending = proposal.state === ProposalState.Pending;
            const timeInfo = formatVoteTimeRemaining(extendedProposal.endTime);
            const result = govSubTab === 'history' ? getProposalResult(proposal) : null;
            
            // Category badge helper
            const getCategoryIcon = (cat: string | undefined) => {
              switch (cat) {
                case 'treasury': return '💰';
                case 'community': return '🎉';
                case 'technical': return '⚙️';
                case 'governance': return '📜';
                default: return '📋';
              }
            };
            
            return (
              <div key={proposal.id} className={`pixel-card p-4 smooth-transition animate-slide-in-up ${delayClass}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    {/* Category badge */}
                    {extendedProposal.category && (
                      <span className="text-[9px] px-2 py-0.5 rounded bg-[#9966ff]/20 text-[#9966ff] mb-1 inline-block">
                        {getCategoryIcon(extendedProposal.category)} {extendedProposal.category.toUpperCase()}
                      </span>
                    )}
                    <h4 className="text-gray-200 text-[10px] font-bold mb-1">
                      {proposal.title}
                    </h4>
                    <p className="text-gray-500 text-xs">
                      {proposal.description.slice(0, 100)}...
                    </p>
                    <p className="text-gray-600 text-[10px] mt-1">
                      Proposed by <ClickableUsername 
                        address={proposal.proposer} 
                        displayName={proposal.proposerDisplayName} 
                        className="text-[10px]"
                      /> • {formatRelativeTime(proposal.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span 
                      className="text-[10px] px-2 py-1 rounded"
                      style={{ 
                        backgroundColor: `${getProposalStateColor(proposal.state)}20`,
                        color: getProposalStateColor(proposal.state)
                      }}
                    >
                      {getProposalStateLabel(proposal.state).toUpperCase()}
                    </span>
                    {/* Time Remaining for Active Proposals */}
                    {(isActive || isPending) && extendedProposal.endTime && (
                      <div className={`text-[9px] px-2 py-0.5 rounded ${
                        timeInfo.isUrgent 
                          ? 'bg-[#ff4466]/20 text-[#ff4466] animate-pulse' 
                          : 'bg-[#0a0a15] text-[#ffd700]'
                      }`}>
                        ⏱️ {timeInfo.text}
                      </div>
                    )}
                  </div>
                </div>

                {/* Voting Progress - 3-bar chart including abstain */}
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-[#44ff88]">YES: {proposal.forVotes}</span>
                      <span className="text-[#ffd700]">ABSTAIN: {abstainVotes}</span>
                      <span className="text-[#ff4466]">NO: {proposal.againstVotes}</span>
                    </div>
                    <div className="h-2 bg-[#1a1a2e] rounded overflow-hidden flex">
                      <div 
                        className="h-full bg-[#44ff88] smooth-transition" 
                        style={{ width: `${(proposal.forVotes / totalVotes) * 100}%` }} 
                      />
                      <div 
                        className="h-full bg-[#ffd700] smooth-transition" 
                        style={{ width: `${(abstainVotes / totalVotes) * 100}%` }} 
                      />
                      <div 
                        className="h-full bg-[#ff4466] smooth-transition" 
                        style={{ width: `${(proposal.againstVotes / totalVotes) * 100}%` }} 
                      />
                    </div>
                    {/* Unique voters / Quorum indicator */}
                    {(extendedProposal.minVoters || extendedProposal.uniqueVoterCount !== undefined) && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-gray-600 text-[9px]">
                          Voters: {extendedProposal.uniqueVoterCount || 0}/{extendedProposal.minVoters || DEFAULT_MIN_VOTERS}
                        </span>
                        {(extendedProposal.uniqueVoterCount || 0) >= (extendedProposal.minVoters || DEFAULT_MIN_VOTERS) ? (
                          <span className="text-[#44ff88] text-[9px]">✓ Quorum reached</span>
                        ) : (
                          <span className="text-gray-500 text-[9px]">
                            {(extendedProposal.minVoters || DEFAULT_MIN_VOTERS) - (extendedProposal.uniqueVoterCount || 0)} more voters needed
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={() => setViewVotersProposal(proposal)}
                      className="text-[#9966ff] text-[10px] hover:text-[#ffd700] hover:underline smooth-transition cursor-pointer"
                      title="Click to view voters"
                    >
                      {totalVotes} votes
                    </button>
                    <SnapshotVerifyLink proposalId={proposal.id} />
                  </div>
                </div>

                {/* History: Pass/Fail Result with defeat reason */}
                {govSubTab === 'history' && result && (
                  <div className={`mt-3 p-2 rounded-lg flex items-center gap-2 ${
                    result.passed 
                      ? 'bg-[#44ff88]/10 border border-[#44ff88]/30' 
                      : 'bg-[#ff4466]/10 border border-[#ff4466]/30'
                  }`}>
                    <span className={`text-lg ${result.passed ? 'text-[#44ff88]' : 'text-[#ff4466]'}`}>
                      {result.passed ? '✓' : '✗'}
                    </span>
                    <div>
                      <span className={`text-xs font-bold ${result.passed ? 'text-[#44ff88]' : 'text-[#ff4466]'}`}>
                        {result.passed ? 'PASSED' : 'FAILED'}
                      </span>
                      <span className="text-gray-500 text-[10px] ml-2">
                        {extendedProposal.defeatReason || result.reason}
                      </span>
                    </div>
                  </div>
                )}

                {/* Vote Buttons (only for active tab) */}
                {govSubTab === 'active' && isActive && !hasUserVoted && (
                  <div className="flex gap-2 mt-3">
                    <button 
                      onClick={() => setSelectedProposal(proposal)}
                      className="flex-1 pixel-btn text-[10px] !py-1 !bg-[#9966ff] !border-[#bb99ff_#5533aa_#5533aa_#bb99ff] smooth-transition hover-lift"
                    >
                      🗳️ CAST VOTE
                    </button>
                  </div>
                )}
                
                {govSubTab === 'active' && isActive && hasUserVoted && (
                  <div className="mt-3 text-center">
                    <span className="text-[#44ff88] text-xs">✓ You have voted on this proposal</span>
                  </div>
                )}

                {/* View Discussion Link */}
                {extendedProposal.forumThreadId && onViewDiscussion && (
                  <div className="mt-3 pt-3 border-t border-[#2a2a4e]">
                    <button
                      onClick={() => onViewDiscussion(extendedProposal.forumThreadId as string)}
                      className="flex items-center justify-center gap-2 text-[#00ffff] text-[10px] hover:text-[#ffd700] transition-colors w-full"
                    >
                      💬 View Discussion Thread
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Forum Tab Component
 */
function ForumTab({
  threads,
  onCreateThread,
  onReply,
  onEditThread,
  onEditReply,
  onToggleLike,
  getUserLikeStatus,
  currentUserAddress,
  votingPower,
  isLoading,
  initialSelectedThreadId,
  onThreadSelected,
}: {
  threads: ForumThread[];
  onCreateThread: (title: string, content: string, category: ThreadCategory) => Promise<{ success: boolean; error?: string }>;
  onReply: (threadId: string, content: string) => Promise<{ success: boolean; error?: string }>;
  onEditThread: (threadId: string, newContent: string) => Promise<{ success: boolean; error?: string }>;
  onEditReply: (replyId: string, newContent: string) => Promise<{ success: boolean; error?: string }>;
  onToggleLike: (targetId: string, targetType: 'thread' | 'reply', likeType: 'like' | 'dislike') => Promise<{ success: boolean; action?: string }>;
  getUserLikeStatus: (targetId: string, targetType: 'thread' | 'reply') => 'like' | 'dislike' | null;
  currentUserAddress?: string;
  votingPower: number;
  isLoading: boolean;
  initialSelectedThreadId?: string | null;
  onThreadSelected?: () => void;
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedThread, setSelectedThread] = useState<ForumThread | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<ThreadCategory>(ThreadCategory.General);
  const [replyContent, setReplyContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  
  // Forum sub-tab state: 'general' shows all non-governance threads, 'governance' shows only governance threads
  const [forumSubTab, setForumSubTab] = useState<'general' | 'governance'>('general');
  
  // Edit states
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editThreadContent, setEditThreadContent] = useState('');
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editReplyContent, setEditReplyContent] = useState('');
  const [showOriginalThreadId, setShowOriginalThreadId] = useState<string | null>(null);
  const [showOriginalReplyId, setShowOriginalReplyId] = useState<string | null>(null);
  const [isLoadingThread, setIsLoadingThread] = useState(false);

  // Fetch thread details with replies when selecting a thread
  const fetchThreadDetails = useCallback(async (threadId: string) => {
    setIsLoadingThread(true);
    try {
      const response = await fetch(`/api/forum?action=thread&id=${threadId}`);
      const data = await response.json();
      
      if (data.success && data.thread) {
        // Convert database format to ForumThread format
        const thread: ForumThread = {
          id: data.thread.id,
          title: data.thread.title,
          content: data.thread.content,
          author: data.thread.author_display_name || truncateAddress(data.thread.author_address),
          authorAddress: data.thread.author_address,
          authorDisplayName: data.thread.author_display_name,
          category: data.thread.category as ThreadCategory,
          pinned: Boolean(data.thread.pinned),
          locked: Boolean(data.thread.locked),
          createdAt: new Date(data.thread.created_at).getTime(),
          updatedAt: new Date(data.thread.updated_at).getTime(),
          replies: (data.replies || []).map((r: { id: string; thread_id: string; content: string; author_address: string; author_display_name?: string | null; created_at: string; likes_count?: number; dislikes_count?: number; is_edited?: number; original_content?: string }) => ({
            id: r.id,
            threadId: r.thread_id,
            content: r.content,
            author: r.author_display_name || truncateAddress(r.author_address),
            authorAddress: r.author_address,
            authorDisplayName: r.author_display_name,
            createdAt: new Date(r.created_at).getTime(),
            likes: 0,
            likesCount: r.likes_count || 0,
            dislikesCount: r.dislikes_count || 0,
            isEdited: Boolean(r.is_edited),
            originalContent: r.original_content,
          })),
          proposalId: data.thread.proposal_id,
          likesCount: data.thread.likes_count || 0,
          dislikesCount: data.thread.dislikes_count || 0,
          isEdited: Boolean(data.thread.is_edited),
          originalContent: data.thread.original_content,
        };
        setSelectedThread(thread);
        // Set forum sub-tab to governance if this is a governance thread
        if (data.thread.category === 'governance') {
          setForumSubTab('governance');
        }
      }
    } catch (error) {
      console.error('Failed to fetch thread details:', error);
    } finally {
      setIsLoadingThread(false);
    }
  }, []);

  // Handle initial thread selection from governance tab
  useEffect(() => {
    if (initialSelectedThreadId && !isLoading) {
      fetchThreadDetails(initialSelectedThreadId);
      onThreadSelected?.();
    }
  }, [initialSelectedThreadId, isLoading, fetchThreadDetails, onThreadSelected]);

  // Handle thread selection - fetch full thread with replies
  const handleSelectThread = useCallback((thread: ForumThread) => {
    // First show the thread immediately (with empty replies)
    setSelectedThread(thread);
    // Then fetch the full thread with replies
    fetchThreadDetails(thread.id);
  }, [fetchThreadDetails]);

  const handleCreateThread = async () => {
    setError(null);
    setIsPending(true);
    const result = await onCreateThread(newTitle, newContent, newCategory);
    setIsPending(false);
    if (result.success) {
      setNewTitle('');
      setNewContent('');
      setNewCategory(ThreadCategory.General);
      setShowCreateModal(false);
    } else {
      setError(result.error || 'Failed to create thread');
    }
  };

  const handleReply = async () => {
    if (!selectedThread || !currentUserAddress) return;
    setError(null);
    setIsPending(true);
    
    // Save original state for potential revert
    const originalThread = selectedThread;
    
    // Optimistic update - add reply immediately to UI
    const optimisticReply: ForumReply = {
      id: `temp-${Date.now()}`,
      threadId: selectedThread.id,
      content: replyContent,
      author: 'You',
      authorAddress: currentUserAddress,
      likes: 0,
      createdAt: Date.now(),
    };
    
    setSelectedThread({
      ...selectedThread,
      replies: [...selectedThread.replies, optimisticReply],
    });
    
    const result = await onReply(selectedThread.id, replyContent);
    setIsPending(false);
    
    if (result.success) {
      setReplyContent('');
      // Fetch full thread with replies from API to get the real data
      await fetchThreadDetails(selectedThread.id);
    } else {
      // Revert optimistic update on error
      setSelectedThread(originalThread);
      setError(result.error || 'Failed to add reply');
    }
  };

  const handleEditThread = async () => {
    if (!editingThreadId) return;
    setIsPending(true);
    const result = await onEditThread(editingThreadId, editThreadContent);
    setIsPending(false);
    if (result.success) {
      setEditingThreadId(null);
      setEditThreadContent('');
      // Refresh thread to show updated content
      if (selectedThread) {
        await fetchThreadDetails(selectedThread.id);
      }
    } else {
      setError(result.error || 'Failed to edit thread');
    }
  };

  const handleEditReply = async () => {
    if (!editingReplyId) return;
    setIsPending(true);
    const result = await onEditReply(editingReplyId, editReplyContent);
    setIsPending(false);
    if (result.success) {
      setEditingReplyId(null);
      setEditReplyContent('');
      // Refresh thread to show updated reply content
      if (selectedThread) {
        await fetchThreadDetails(selectedThread.id);
      }
    } else {
      setError(result.error || 'Failed to edit reply');
    }
  };

  const startEditThread = (thread: ForumThread) => {
    setEditingThreadId(thread.id);
    setEditThreadContent(thread.content);
  };

  const startEditReply = (reply: ForumReply) => {
    setEditingReplyId(reply.id);
    setEditReplyContent(reply.content);
  };

  const isAuthor = (authorAddress?: string) => {
    if (!authorAddress) return false;
    return currentUserAddress?.toLowerCase() === authorAddress.toLowerCase();
  };

  // Handle like toggle with optimistic update and refresh
  const handleToggleLike = async (targetId: string, targetType: 'thread' | 'reply', likeType: 'like' | 'dislike') => {
    const result = await onToggleLike(targetId, targetType, likeType);
    if (result.success && selectedThread) {
      // Refresh thread to get updated like counts
      await fetchThreadDetails(selectedThread.id);
    }
    return result;
  };

  // Filter threads based on sub-tab
  const filteredThreads = threads.filter((thread) => {
    if (forumSubTab === 'governance') {
      return thread.category === ThreadCategory.Governance;
    } else {
      // General tab shows all non-governance threads
      return thread.category !== ThreadCategory.Governance;
    }
  });

  // Sort threads: pinned first, then by last activity
  const sortedThreads = [...filteredThreads].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  });
  
  // Count threads for each tab
  const generalCount = threads.filter(t => t.category !== ThreadCategory.Governance).length;
  const governanceCount = threads.filter(t => t.category === ThreadCategory.Governance).length;

  if (isLoading) {
    return (
      <div className="pixel-card p-8 text-center animate-slide-in-up">
        <div className="text-4xl mb-4 animate-spin">⭐</div>
        <p className="text-[#ffd700] text-xs animate-pixel-pulse">LOADING FORUM...</p>
      </div>
    );
  }

  // Thread View
  if (selectedThread) {
    const threadLikeStatus = getUserLikeStatus(selectedThread.id, 'thread');
    const threadIsEdited = selectedThread.isEdited;
    const threadOriginalContent = selectedThread.originalContent;
    
    return (
      <div className="space-y-4 animate-slide-in-up">
        <button 
          onClick={() => setSelectedThread(null)}
          className="text-[#9966ff] text-sm hover:text-[#ffd700] smooth-transition"
        >
          ← Back to threads
        </button>
        
        <div className="pixel-card p-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <span className="text-[#9966ff] text-xs uppercase">{getCategoryLabel(selectedThread.category)}</span>
              <h3 className="text-[#ffd700] text-lg font-bold">{selectedThread.title}</h3>
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <span>by <ClickableUsername 
                  address={selectedThread.authorAddress || ''} 
                  displayName={selectedThread.author} 
                  className="text-xs"
                /></span>
                <span>•</span>
                <span>{formatRelativeTime(selectedThread.createdAt)}</span>
                {threadIsEdited && (
                  <>
                    <span>•</span>
                    <span 
                      className="text-gray-600 italic cursor-pointer hover:text-[#9966ff]"
                      onClick={() => setShowOriginalThreadId(showOriginalThreadId === selectedThread.id ? null : selectedThread.id)}
                    >
                      *edited {showOriginalThreadId === selectedThread.id ? '(hide original)' : '(view original)'}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedThread.pinned && <span className="text-[#ffd700]">📌</span>}
              {isAuthor(selectedThread.authorAddress) && !editingThreadId && (
                <button
                  onClick={() => startEditThread(selectedThread)}
                  className="text-gray-500 text-xs hover:text-[#9966ff]"
                >
                  ✏️ Edit
                </button>
              )}
            </div>
          </div>
          
          {/* Show original content if toggled */}
          {showOriginalThreadId === selectedThread.id && threadOriginalContent && (
            <div className="bg-[#ff4466]/10 rounded-lg p-4 mb-4 border border-[#ff4466]/30">
              <p className="text-gray-500 text-[10px] mb-2">ORIGINAL VERSION</p>
              <p className="text-gray-400 text-sm whitespace-pre-wrap leading-relaxed">{threadOriginalContent}</p>
            </div>
          )}
          
          {/* Thread content (editable) */}
          {editingThreadId === selectedThread.id ? (
            <div className="space-y-3 mb-4">
              <textarea
                value={editThreadContent}
                onChange={(e) => setEditThreadContent(e.target.value)}
                rows={6}
                className="w-full bg-[#0a0a15] border-2 border-[#ffd700] rounded-lg px-4 py-3 text-white text-sm focus:outline-none resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleEditThread}
                  disabled={isPending}
                  className="pixel-btn pixel-btn-gold text-[10px] !py-1 !px-3"
                >
                  {isPending ? 'SAVING...' : 'SAVE'}
                </button>
                <button
                  onClick={() => { setEditingThreadId(null); setEditThreadContent(''); }}
                  className="pixel-btn text-[10px] !py-1 !px-3 !bg-[#1a1a2e] !border-[#3a3a5e_#1a1a2e_#1a1a2e_#3a3a5e]"
                >
                  CANCEL
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#0a0a15] rounded-lg p-4 mb-4">
              <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{selectedThread.content}</p>
            </div>
          )}
          
          {/* Like/Dislike buttons for thread */}
          <div className="flex items-center gap-4 mb-4 border-t border-[#2a2a4e] pt-4">
            <button
              onClick={() => handleToggleLike(selectedThread.id, 'thread', 'like')}
              className={`flex items-center gap-1 text-xs px-3 py-1 rounded transition-colors ${
                threadLikeStatus === 'like' 
                  ? 'bg-[#44ff88]/20 text-[#44ff88]' 
                  : 'bg-[#1a1a2e] text-gray-500 hover:text-[#44ff88]'
              }`}
            >
              👍 {selectedThread.likesCount || 0}
            </button>
            <button
              onClick={() => handleToggleLike(selectedThread.id, 'thread', 'dislike')}
              className={`flex items-center gap-1 text-xs px-3 py-1 rounded transition-colors ${
                threadLikeStatus === 'dislike' 
                  ? 'bg-[#ff4466]/20 text-[#ff4466]' 
                  : 'bg-[#1a1a2e] text-gray-500 hover:text-[#ff4466]'
              }`}
            >
              👎 {selectedThread.dislikesCount || 0}
            </button>
          </div>
          
          {/* Replies */}
          <div className="space-y-3 mb-4">
            <h4 className="text-[#9966ff] text-sm">REPLIES ({selectedThread.replies.length})</h4>
            {selectedThread.replies.map((reply) => {
              const replyLikeStatus = getUserLikeStatus(reply.id, 'reply');
              const replyIsEdited = reply.isEdited;
              const replyOriginalContent = reply.originalContent;
              
              return (
                <div key={reply.id} className="bg-[#1a1a2e] rounded-lg p-3">
                  {/* Show original reply if toggled */}
                  {showOriginalReplyId === reply.id && replyOriginalContent && (
                    <div className="bg-[#ff4466]/10 rounded-lg p-3 mb-3 border border-[#ff4466]/30">
                      <p className="text-gray-500 text-[10px] mb-1">ORIGINAL VERSION</p>
                      <p className="text-gray-400 text-sm leading-relaxed">{replyOriginalContent}</p>
                    </div>
                  )}
                  
                  {editingReplyId === reply.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editReplyContent}
                        onChange={(e) => setEditReplyContent(e.target.value)}
                        rows={3}
                        className="w-full bg-[#0a0a15] border-2 border-[#ffd700] rounded-lg px-3 py-2 text-white text-sm focus:outline-none resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleEditReply}
                          disabled={isPending}
                          className="pixel-btn pixel-btn-gold text-[10px] !py-1 !px-3"
                        >
                          {isPending ? 'SAVING...' : 'SAVE'}
                        </button>
                        <button
                          onClick={() => { setEditingReplyId(null); setEditReplyContent(''); }}
                          className="pixel-btn text-[10px] !py-1 !px-3 !bg-[#0a0a15] !border-[#2a2a4e]"
                        >
                          CANCEL
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-300 text-sm leading-relaxed">{reply.content}</p>
                  )}
                  
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2 text-gray-500 text-xs">
                      <ClickableUsername 
                        address={reply.authorAddress || ''} 
                        displayName={reply.author} 
                        className="text-xs"
                      />
                      <span>•</span>
                      <span>{formatRelativeTime(reply.createdAt)}</span>
                      {replyIsEdited && (
                        <>
                          <span>•</span>
                          <span 
                            className="text-gray-600 italic cursor-pointer hover:text-[#9966ff]"
                            onClick={() => setShowOriginalReplyId(showOriginalReplyId === reply.id ? null : reply.id)}
                          >
                            *edited
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isAuthor(reply.authorAddress) && !editingReplyId && (
                        <button
                          onClick={() => startEditReply(reply)}
                          className="text-gray-500 text-[10px] hover:text-[#9966ff]"
                        >
                          ✏️
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleLike(reply.id, 'reply', 'like')}
                        className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                          replyLikeStatus === 'like' ? 'text-[#44ff88]' : 'text-gray-600 hover:text-[#44ff88]'
                        }`}
                      >
                        👍 {reply.likesCount ?? reply.likes ?? 0}
                      </button>
                      <button
                        onClick={() => handleToggleLike(reply.id, 'reply', 'dislike')}
                        className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                          replyLikeStatus === 'dislike' ? 'text-[#ff4466]' : 'text-gray-600 hover:text-[#ff4466]'
                        }`}
                      >
                        👎 {reply.dislikesCount ?? 0}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Reply Form */}
          {!selectedThread.locked && (
            <div className="space-y-3">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write your reply..."
                rows={3}
                className="w-full bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-4 py-3 text-white text-sm focus:border-[#ffd700] focus:outline-none smooth-transition resize-none"
              />
              {error && (
                <div className="text-[#ff4466] text-xs bg-[#ff4466]/10 px-3 py-2 rounded">
                  {error}
                </div>
              )}
              <button
                onClick={handleReply}
                disabled={isPending || !replyContent.trim()}
                className="pixel-btn pixel-btn-gold text-xs !px-4 !py-2 smooth-transition hover-lift disabled:opacity-50"
              >
                {isPending ? 'POSTING...' : 'POST REPLY'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Create Thread Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in overflow-hidden">
          <div className="pixel-card p-6 max-w-lg w-full animate-slide-in-up max-h-[90vh] overflow-y-auto overscroll-contain touch-pan-y">
            <h3 className="text-[#ffd700] text-sm tracking-wider mb-4">✦ NEW THREAD ✦</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-[#9966ff] text-xs block mb-2">CATEGORY</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as ThreadCategory)}
                  className="w-full bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-4 py-2 text-white text-[10px] focus:border-[#ffd700] focus:outline-none cursor-pointer"
                >
                  {Object.values(ThreadCategory).map((cat) => (
                    <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="text-[#9966ff] text-xs block mb-2">TITLE</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Thread title..."
                  className="w-full bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-4 py-3 text-white text-[10px] focus:border-[#ffd700] focus:outline-none smooth-transition"
                />
              </div>
              
              <div>
                <label className="text-[#9966ff] text-xs block mb-2">CONTENT</label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Write your thread content..."
                  rows={5}
                  className="w-full bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-4 py-3 text-white text-[10px] focus:border-[#ffd700] focus:outline-none smooth-transition resize-none"
                />
              </div>
              
              {error && (
                <div className="text-[#ff4466] text-xs bg-[#ff4466]/10 px-3 py-2 rounded">
                  ⚠️ {error}
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 pixel-btn text-xs !bg-[#1a1a2e] !border-[#3a3a5e_#1a1a2e_#1a1a2e_#3a3a5e] smooth-transition hover-lift"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleCreateThread}
                  disabled={isPending || !newTitle.trim() || !newContent.trim()}
                  className="flex-1 pixel-btn pixel-btn-gold text-xs smooth-transition hover-lift disabled:opacity-50"
                >
                  {isPending ? '⏳ CREATING...' : '✨ CREATE'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Forum Header */}
      <div className="flex justify-between items-center animate-slide-in-up">
        <h3 className="text-[#ffd700] text-sm tracking-wider animate-glow-pulse">STAR COUNCIL FORUM</h3>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="pixel-btn pixel-btn-gold text-xs !px-3 !py-2 smooth-transition hover-lift"
        >
          + NEW THREAD
        </button>
      </div>

      {/* Forum Sub-tabs */}
      <div className="flex gap-2 animate-slide-in-up animate-delay-1">
        <button
          onClick={() => setForumSubTab('general')}
          className={`px-4 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
            forumSubTab === 'general'
              ? 'bg-[#9966ff]/20 border-[#9966ff] text-[#9966ff]'
              : 'bg-[#1a1a2e] border-[#2a2a4e] text-gray-400 hover:border-[#9966ff]/50'
          }`}
        >
          💬 GENERAL ({generalCount})
        </button>
        <button
          onClick={() => setForumSubTab('governance')}
          className={`px-4 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
            forumSubTab === 'governance'
              ? 'bg-[#ffd700]/20 border-[#ffd700] text-[#ffd700]'
              : 'bg-[#1a1a2e] border-[#2a2a4e] text-gray-400 hover:border-[#ffd700]/50'
          }`}
        >
          🗳️ GOVERNANCE ({governanceCount})
        </button>
      </div>

      {/* Thread List */}
      {sortedThreads.length === 0 ? (
        <div className="pixel-card p-8 text-center animate-slide-in-up animate-delay-2">
          <div className="text-4xl mb-4 animate-pixel-float">{forumSubTab === 'governance' ? '🗳️' : '💬'}</div>
          <h3 className="text-[#ffd700] text-xs tracking-wider mb-2">
            {forumSubTab === 'governance' ? 'NO GOVERNANCE DISCUSSIONS' : 'NO THREADS YET'}
          </h3>
          <p className="text-gray-500 text-xs">
            {forumSubTab === 'governance' 
              ? 'Governance discussion threads are automatically created when proposals are submitted.' 
              : 'Be the first to start a conversation!'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedThreads.map((thread, index) => {
            const delayClass = `animate-delay-${Math.min(index + 1, 6)}`;
            return (
              <div 
                key={thread.id} 
                onClick={() => handleSelectThread(thread)}
                className={`pixel-card p-4 smooth-transition cursor-pointer flex items-center gap-4 animate-slide-in-up ${delayClass}`}
              >
                {thread.pinned && <span className="text-[#ffd700] text-xs">📌</span>}
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[#9966ff] text-xs uppercase">{getCategoryLabel(thread.category)}</span>
                    {thread.proposalId && (
                      <span className="text-[#ffd700] text-[10px] px-2 py-0.5 rounded bg-[#ffd700]/10 border border-[#ffd700]/30">
                        LINKED TO PROPOSAL
                      </span>
                    )}
                  </div>
                  <h4 className={`text-sm font-bold mb-1 ${thread.pinned ? 'text-[#ffd700]' : 'text-gray-200'}`}>
                    {thread.title}
                  </h4>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>by <ClickableUsername 
                      address={thread.authorAddress || ''} 
                      displayName={thread.author} 
                      className="text-xs"
                    /></span>
                    <span>{thread.replyCount ?? thread.replies.length} replies</span>
                    <span>{formatRelativeTime(thread.updatedAt)}</span>
                  </div>
                </div>

                <div className="text-gray-600 text-xs">💬</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Forum Rules */}
      <div className="pixel-card p-4 bg-[#0a0a15]">
        <p className="text-[#9966ff] text-sm tracking-wide mb-2">COUNCIL RULES</p>
        <ul className="text-gray-400 text-sm space-y-1">
          <li>• Be respectful to fellow Star bearers</li>
          <li>• Stay on topic</li>
          <li>• No spam or self-promotion</li>
          <li>• Have fun!</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Staking Tab Component - Updated with STAR points system
 * 
 * New mechanics:
 * - 1 Star Skrumpey = 1 STAR per 24 hours
 * - Multiple NFTs can be staked
 * - No unstaking period (immediate unstake)
 * - STAR tokens usable in governance with sqrt weighting
 */
function StakingTab({
  isLoading,
}: {
  isLoading: boolean;
}) {
  const {
    starBalance,
    pendingStars,
    totalStars,
    stakedNFTs,
    availableToStake,
    votingPower,
    stakeNFT,
    stakeAll,
    unstakeNFT,
    claimStars,
    timeUntilNextStar,
    history,
  } = useStarPoints();
  
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleStake = (tokenId: number, starVariant?: string) => {
    setError(null);
    setSuccessMessage(null);
    setIsPending(true);
    
    const result = stakeNFT(tokenId, starVariant);
    setIsPending(false);
    
    if (!result.success) {
      setError(result.error || 'Failed to stake');
    } else {
      setSuccessMessage(`Staked NFT #${tokenId}! You'll earn ${STAR_PER_NFT_PER_DAY} STAR per day.`);
    }
  };

  const handleStakeAll = () => {
    setError(null);
    setSuccessMessage(null);
    setIsPending(true);
    
    const result = stakeAll();
    setIsPending(false);
    
    if (result.stakedCount > 0) {
      setSuccessMessage(`Staked ${result.stakedCount} NFTs! You'll earn ${result.stakedCount * STAR_PER_NFT_PER_DAY} STAR per day.`);
    }
  };

  const handleUnstake = (tokenId: number) => {
    setError(null);
    setSuccessMessage(null);
    setIsPending(true);
    
    const result = unstakeNFT(tokenId);
    setIsPending(false);
    
    if (!result.success) {
      setError(result.error || 'Failed to unstake');
    } else {
      setSuccessMessage(`Unstaked NFT #${tokenId}! Claimed ${result.claimedStars} STAR.`);
    }
  };

  const handleClaimAll = () => {
    setError(null);
    setSuccessMessage(null);
    
    const result = claimStars();
    
    if (result.claimed > 0) {
      setSuccessMessage(`Claimed ${result.claimed} STAR!`);
    } else {
      setError('No STAR to claim yet. Keep staking!');
    }
  };

  if (isLoading) {
    return (
      <div className="pixel-card p-8 text-center animate-slide-in-up">
        <div className="text-4xl mb-4 animate-spin">⭐</div>
        <p className="text-[#ffd700] text-xs animate-pixel-pulse">LOADING STAKING...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* STAR Balance Overview */}
      <div className="pixel-card p-6 text-center animate-slide-in-up">
        <h3 className="text-[#ffd700] text-sm tracking-wider mb-4 animate-glow-pulse">STAR STAKING</h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-[#0a0a15] p-4 rounded-lg border-2 border-[#ffd700]/30">
            <p className="text-gray-500 text-xs mb-1">STAR BALANCE</p>
            <p className="text-[#ffd700] text-xl font-bold">
              {formatStarAmount(starBalance)} ⭐
            </p>
          </div>
          <div className="bg-[#0a0a15] p-4 rounded-lg border-2 border-[#44ff88]/30">
            <p className="text-gray-500 text-xs mb-1">PENDING STAR</p>
            <p className="text-[#44ff88] text-xl font-bold">
              {formatStarAmount(pendingStars)} ⭐
            </p>
          </div>
          <div className="bg-[#0a0a15] p-4 rounded-lg border-2 border-[#9966ff]/30">
            <p className="text-gray-500 text-xs mb-1">STAKED NFTs</p>
            <p className="text-[#9966ff] text-xl font-bold">
              {stakedNFTs.length} 🐸
            </p>
          </div>
          <div className="bg-[#0a0a15] p-4 rounded-lg border-2 border-[#00ffff]/30">
            <p className="text-gray-500 text-xs mb-1">VOTING POWER</p>
            <p className="text-[#00ffff] text-xl font-bold">
              {votingPower?.weightedVotingPower.toFixed(2) || '0'}
            </p>
          </div>
        </div>
        
        {/* Time Until Next STAR */}
        {timeUntilNextStar && stakedNFTs.length > 0 && (
          <div className="bg-[#1a1a2e] rounded-lg p-4 mb-4">
            <p className="text-gray-500 text-xs mb-2">NEXT STAR IN</p>
            <p className="text-[#ffd700] text-lg font-bold animate-pixel-pulse">
              {String(timeUntilNextStar.hours).padStart(2, '0')}:
              {String(timeUntilNextStar.minutes).padStart(2, '0')}:
              {String(timeUntilNextStar.seconds).padStart(2, '0')}
            </p>
            <p className="text-gray-600 text-[10px] mt-1">
              +{stakedNFTs.length * STAR_PER_NFT_PER_DAY} STAR ({stakedNFTs.length} staked NFTs)
            </p>
          </div>
        )}
        
        {/* Claim Button */}
        {pendingStars > 0 && (
          <button
            onClick={handleClaimAll}
            className="pixel-btn pixel-btn-gold text-xs !px-6 !py-2 smooth-transition hover-lift animate-pixel-pulse"
          >
            ✨ CLAIM {pendingStars} STAR ✨
          </button>
        )}
        
        {/* Staking Benefits */}
        <div className="bg-[#1a1a2e] rounded-lg p-4 mt-4 text-left">
          <p className="text-[#ffd700] text-sm mb-2">STAR STAKING BENEFITS</p>
          <ul className="text-gray-400 text-sm space-y-1">
            <li>• Earn <span className="text-[#ffd700]">{STAR_PER_NFT_PER_DAY} STAR</span> per NFT every 24 hours</li>
            <li>• Stake multiple NFTs to multiply earnings</li>
            <li>• <span className="text-[#44ff88]">NO unstaking period</span> - unstake anytime!</li>
            <li>• <span className="text-[#9966ff]">Governance:</span> 1 Star Skrumpey = 1 Vote</li>
          </ul>
        </div>
      </div>

      {/* Voting Power Breakdown */}
      {votingPower && (
        <div className="pixel-card p-4 animate-slide-in-up animate-delay-1">
          <h4 className="text-[#9966ff] text-xs mb-3">VOTING POWER</h4>
          <div className="bg-[#0a0a15] rounded-lg p-4">
            <div className="space-y-2 text-[10px]">
              <div className="flex justify-between">
                <span className="text-gray-500">Star Skrumpeys Held:</span>
                <span className="text-[#9966ff]">{votingPower.nftVotingPower.toFixed(0)}</span>
              </div>
              <div className="border-t border-[#2a2a4e] pt-2 flex justify-between">
                <span className="text-gray-300">Total Voting Power:</span>
                <span className="text-[#00ffff] font-bold">{votingPower.nftVotingPower.toFixed(0)}</span>
              </div>
            </div>
            <p className="text-gray-600 text-[10px] mt-3">
              ℹ️ 1 Star Skrumpey = 1 Vote. Simple and fair!
            </p>
          </div>
        </div>
      )}

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="text-[#44ff88] text-xs bg-[#44ff88]/10 px-3 py-2 rounded animate-slide-in-up">
          ✓ {successMessage}
        </div>
      )}
      {error && (
        <div className="text-[#ff4466] text-xs bg-[#ff4466]/10 px-3 py-2 rounded animate-slide-in-up">
          ⚠️ {error}
        </div>
      )}

      {/* Available to Stake */}
      {availableToStake.length > 0 && (
        <div className="pixel-card p-4 animate-slide-in-up animate-delay-2">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-[#9966ff] text-xs">AVAILABLE TO STAKE ({availableToStake.length})</h4>
            {availableToStake.length > 1 && (
              <button
                onClick={handleStakeAll}
                disabled={isPending}
                className="pixel-btn text-[10px] !py-1 !px-2 !bg-[#9966ff] !border-[#bb99ff_#5533aa_#5533aa_#bb99ff] smooth-transition hover-lift disabled:opacity-50"
              >
                STAKE ALL
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {availableToStake.map((token) => (
              <div key={token.tokenId} className="bg-[#1a1a2e] rounded-lg p-3 text-center">
                <div className="text-2xl mb-2 animate-pixel-float">🐸⭐</div>
                <p className="text-gray-200 text-xs font-bold">#{token.tokenId}</p>
                {token.starVariant && (
                  <p className="text-[#9966ff] text-[10px] uppercase">{token.starVariant}</p>
                )}
                <p className="text-[#44ff88] text-[5px] mt-1">+{STAR_PER_NFT_PER_DAY} STAR/day</p>
                <button
                  onClick={() => handleStake(token.tokenId, token.starVariant)}
                  disabled={isPending}
                  className="mt-2 w-full pixel-btn text-[10px] !py-1 !bg-[#44ff88] !border-[#66ffaa_#22aa44_#22aa44_#66ffaa] smooth-transition hover-lift disabled:opacity-50"
                >
                  {isPending ? '...' : 'STAKE'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Currently Staked */}
      {stakedNFTs.length > 0 && (
        <div className="pixel-card p-4 animate-slide-in-up animate-delay-3">
          <h4 className="text-[#ffd700] text-xs mb-3">CURRENTLY STAKED ({stakedNFTs.length})</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {stakedNFTs.map((nft) => (
              <div key={nft.tokenId} className="bg-[#1a1a2e] rounded-lg p-3 text-center border-2 border-[#ffd700]/30">
                <div className="text-2xl mb-2 animate-pixel-float">🐸⭐</div>
                <p className="text-[#ffd700] text-xs font-bold">#{nft.tokenId}</p>
                {nft.starVariant && (
                  <p className="text-[#9966ff] text-[10px] uppercase">{nft.starVariant}</p>
                )}
                <p className="text-[#44ff88] text-[5px]">EARNING ⭐</p>
                <button
                  onClick={() => handleUnstake(nft.tokenId)}
                  disabled={isPending}
                  className="mt-2 w-full pixel-btn text-[10px] !py-1 !bg-[#ff4466] !border-[#ff6688_#aa2244_#aa2244_#ff6688] smooth-transition hover-lift disabled:opacity-50"
                >
                  {isPending ? '...' : 'UNSTAKE'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent History */}
      {history.length > 0 && (
        <div className="pixel-card p-4 animate-slide-in-up animate-delay-4">
          <h4 className="text-[#9966ff] text-xs mb-3">RECENT ACTIVITY</h4>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {history.slice(0, 10).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b border-[#2a2a4e] last:border-0 text-[10px]">
                <div className="flex items-center gap-2">
                  <span className={
                    tx.type === 'claim' ? 'text-[#44ff88]' :
                    tx.type === 'stake' ? 'text-[#9966ff]' :
                    tx.type === 'unstake' ? 'text-[#ff4466]' :
                    'text-[#ffd700]'
                  }>
                    {tx.type === 'claim' ? '✨' : tx.type === 'stake' ? '📥' : tx.type === 'unstake' ? '📤' : '🗳️'}
                  </span>
                  <span className="text-gray-400">{tx.description}</span>
                </div>
                <span className="text-gray-600">{formatRelativeTime(tx.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="pixel-card p-4 bg-[#0a0a15] animate-slide-in-up animate-delay-5">
        <p className="text-[#9966ff] text-sm tracking-wide mb-2">STAR SYSTEM INFO</p>
        <ul className="text-gray-400 text-sm space-y-1">
          <li>• Stake your Star Skrumpeys to earn STAR tokens</li>
          <li>• <span className="text-[#44ff88]">Instant unstaking</span> - no cooldown period!</li>
          <li>• STAR earned = Days staked × NFTs staked × {STAR_PER_NFT_PER_DAY}</li>
          <li>• <span className="text-[#ffd700]">Governance:</span> 1 Star Skrumpey = 1 Vote</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Governance Info Button Component
 * Shows a "HOW IT WORKS" button that opens an info modal
 */
function GovernanceInfoButton() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      {/* Info button */}
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#9966ff]/10 border border-[#9966ff]/30 hover:bg-[#9966ff]/20 hover:border-[#9966ff]/50 smooth-transition text-[#9966ff]"
      >
        <span className="text-sm">ℹ️</span>
        <span className="text-[10px] font-bold">HOW IT WORKS</span>
      </button>

      {/* Info Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in overflow-hidden">
          <div className="pixel-card p-6 max-w-lg w-full animate-slide-in-up max-h-[80vh] flex flex-col overscroll-contain">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h3 className="text-[#ffd700] text-sm tracking-wider animate-glow-pulse">
                ⚡ HOW GOVERNANCE WORKS
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-white text-xl"
              >
                ×
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto scrollbar-pixel space-y-4 text-sm">
              {/* Overview */}
              <div className="bg-[#0a0a15] rounded-lg p-4">
                <h4 className="text-[#00ffff] text-xs mb-2 font-bold">🌟 OVERVIEW</h4>
                <p className="text-gray-300 text-xs leading-relaxed">
                  Star World Order uses a Web2-powered governance system that provides 
                  transparent, fair voting while keeping costs low for our community. 
                  All votes and proposals are stored securely in our database with 
                  cryptographic verification.
                </p>
              </div>

              {/* Three-Way Voting */}
              <div className="bg-[#0a0a15] rounded-lg p-4">
                <h4 className="text-[#ffd700] text-xs mb-2 font-bold">🗳️ THREE-WAY VOTING</h4>
                <ul className="text-gray-300 text-xs space-y-1">
                  <li>• <span className="text-[#44ff88]">YES</span> - Vote in favor of the proposal</li>
                  <li>• <span className="text-[#ff4466]">NO</span> - Vote against the proposal</li>
                  <li>• <span className="text-[#ffd700]">ABSTAIN</span> - Counted for quorum but neutral</li>
                  <li>• You can <span className="text-[#00ffff]">change your vote</span> within 24 hours</li>
                </ul>
              </div>

              {/* Quorum Requirements */}
              <div className="bg-[#0a0a15] rounded-lg p-4">
                <h4 className="text-[#ff6ec7] text-xs mb-2 font-bold">📊 QUORUM REQUIREMENTS</h4>
                <ul className="text-gray-300 text-xs space-y-1">
                  <li>• <span className="text-[#9966ff]">Minimum {DEFAULT_MIN_VOTERS} unique voters</span> required</li>
                  <li>• <span className="text-[#44ff88]">60% YES</span> votes needed to pass</li>
                  <li>• Maximum <span className="text-[#ffd700]">30% ABSTAIN</span> votes allowed</li>
                  <li>• Proposers can cancel within first 48 hours</li>
                </ul>
              </div>

              {/* Voting Power */}
              <div className="bg-[#0a0a15] rounded-lg p-4">
                <h4 className="text-[#44ff88] text-xs mb-2 font-bold">⚖️ VOTING POWER</h4>
                <ul className="text-gray-300 text-xs space-y-1">
                  <li>• <span className="text-[#9966ff]">1 Star Skrumpey NFT</span> = <span className="text-[#ffd700]">1 Vote</span></li>
                  <li>• Hold 8 Star Skrumpeys = <span className="text-[#00ffff]">8 Voting Power</span></li>
                  <li>• Simple, fair, and transparent!</li>
                </ul>
              </div>

              {/* Security */}
              <div className="bg-[#0a0a15] rounded-lg p-4">
                <h4 className="text-[#ff6ec7] text-xs mb-2 font-bold">🔒 SECURITY</h4>
                <ul className="text-gray-300 text-xs space-y-1">
                  <li>• All votes are tied to your wallet address</li>
                  <li>• NFT ownership is verified on-chain via Monad</li>
                  <li>• One vote per wallet per proposal</li>
                  <li>• Vote history is permanently recorded</li>
                </ul>
              </div>

              {/* Categories */}
              <div className="bg-[#0a0a15] rounded-lg p-4">
                <h4 className="text-[#9966ff] text-xs mb-2 font-bold">📂 PROPOSAL CATEGORIES</h4>
                <ul className="text-gray-300 text-xs space-y-1">
                  <li>• 💰 <span className="text-[#ffd700]">Treasury</span> - Fund allocation</li>
                  <li>• 🎉 <span className="text-[#ff6ec7]">Community</span> - Events & partnerships</li>
                  <li>• ⚙️ <span className="text-[#00ffff]">Technical</span> - Contract/site changes</li>
                  <li>• 📜 <span className="text-[#9966ff]">Governance</span> - Rule changes</li>
                  <li>• 📋 <span className="text-gray-400">General</span> - Everything else</li>
                </ul>
              </div>

              {/* Why Web2 */}
              <div className="bg-[#9966ff]/10 rounded-lg p-4 border border-[#9966ff]/30">
                <h4 className="text-[#9966ff] text-xs mb-2 font-bold">💡 WHY WEB2 VOTING?</h4>
                <p className="text-gray-300 text-xs leading-relaxed">
                  On-chain voting requires gas fees for every vote, making it expensive 
                  for community participation. Our Web2 system verifies NFT ownership 
                  on-chain but stores votes off-chain, giving you the best of both worlds: 
                  <span className="text-[#44ff88]"> verified ownership + free voting!</span>
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowModal(false)}
              className="w-full pixel-btn pixel-btn-gold text-xs mt-4 flex-shrink-0"
            >
              GOT IT! ✨
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function DAOContent() {
  const [activeTab, setActiveTab] = useState<TabId>('governance');
  const [selectedForumThreadId, setSelectedForumThreadId] = useState<string | null>(null);
  
  const {
    proposals,
    threads,
    stakingSummary,
    votingPower,
    isLoadingProposals,
    isLoadingThreads,
    isLoadingStaking,
    createNewProposal,
    vote,
    hasVoted,
    createNewThread,
    replyToThread,
    stakeNFT,
    requestUnstakeNFT,
    unstakeNFT,
    isStakingDeployed,
    editThread,
    editReply,
    toggleLike,
    getUserLikeStatus,
    address,
  } = useGovernance();
  
  // Handle navigation to a forum thread from the governance tab
  const handleViewDiscussion = useCallback((forumThreadId: string) => {
    setSelectedForumThreadId(forumThreadId);
    setActiveTab('forum');
  }, []);
  
  // Get available tokens from DAO access (would come from useDAOAccess in real implementation)
  const availableTokens = stakingSummary 
    ? Array.from({ length: 3 }, (_, i) => ({ tokenId: 1000 + i, starVariant: ['aether', 'spectra', 'solveil'][i] }))
        .filter(t => !stakingSummary.stakedTokens.includes(t.tokenId))
    : [];

  return (
    <>
      {/* Page Header */}
      <div className="text-center mb-8 animate-slide-in-up">
        <h1 className="text-lg md:text-xl text-[#ffd700] pixel-glow-gold tracking-wider mb-2">
          THE ORDER
        </h1>
        <p className="text-[#9966ff] text-sm tracking-wide animate-glow-pulse">
          Star World Order DAO
        </p>
      </div>

      {/* Access-gated content */}
      <AccessGate
        title="DAO ACCESS LOCKED"
        message="Only Star Skrumpey holders may participate in The Order's governance."
      >
        {/* Tab Navigation - Scrollable on mobile */}
        <div className="mb-6 sm:mb-8 animate-slide-in-up animate-delay-1">
          <div className="flex justify-start sm:justify-center gap-1.5 sm:gap-2 overflow-x-auto pb-2 px-1 sm:px-0 -mx-2 sm:mx-0 scrollbar-hide">
            {tabs.map((tab, index) => (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                disabled={tab.disabled}
                className={`pixel-btn text-[10px] sm:text-xs !px-2 sm:!px-4 !py-1.5 sm:!py-2 smooth-transition flex-shrink-0 whitespace-nowrap ${
                  tab.disabled 
                    ? '!opacity-50 !cursor-not-allowed !bg-[#1a1a2e] !border-[#2a2a3e_#1a1a2e_#1a1a2e_#2a2a3e]'
                    : activeTab === tab.id 
                      ? 'pixel-btn-gold' 
                      : '!bg-[#1a1a2e] !border-[#3a3a5e_#1a1a2e_#1a1a2e_#3a3a5e]'
                }`}
                style={{ animationDelay: `${0.1 + index * 0.1}s` }}
                title={tab.disabled ? 'Coming Soon' : undefined}
              >
                <span className="mr-0.5 sm:mr-1">{tab.icon}</span>
                {/* Short label on mobile, full label on sm+ screens */}
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.slice(0, 3)}</span>
                {tab.disabled && <span className="ml-0.5 sm:ml-1 text-[6px] sm:text-[8px]">⏳</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className={activeTab === 'members' || activeTab === 'treasury' ? 'max-w-6xl mx-auto' : 'max-w-3xl mx-auto'}>
          {activeTab === 'governance' && (
            <GovernanceTab
              proposals={proposals}
              onCreateProposal={createNewProposal}
              onVote={vote}
              hasVoted={hasVoted}
              votingPower={votingPower}
              isLoading={isLoadingProposals}
              onViewDiscussion={handleViewDiscussion}
            />
          )}
          {activeTab === 'forum' && (
            <ForumTab
              threads={threads}
              onCreateThread={createNewThread}
              onReply={replyToThread}
              onEditThread={editThread}
              onEditReply={editReply}
              onToggleLike={toggleLike}
              getUserLikeStatus={getUserLikeStatus}
              currentUserAddress={address}
              votingPower={votingPower}
              isLoading={isLoadingThreads}
              initialSelectedThreadId={selectedForumThreadId}
              onThreadSelected={() => setSelectedForumThreadId(null)}
            />
          )}
          {activeTab === 'members' && (
            <div className="animate-slide-in-up">
              <MembersContent />
            </div>
          )}
          {activeTab === 'treasury' && (
            <div className="animate-slide-in-up">
              <TreasuryContent />
            </div>
          )}
          {activeTab === 'staking' && (
            <StakingTab
              isLoading={isLoadingStaking}
            />
          )}
        </div>
      </AccessGate>
    </>
  );
}
