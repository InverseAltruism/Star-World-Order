'use client';

import { useState, useEffect } from 'react';
import { useSignMessage, useSignTypedData, useAccount } from 'wagmi';
import ClickableUsername from '@/components/ClickableUsername';
import {
  ProposalState,
  getProposalStateLabel,
  getProposalStateColor,
  formatRelativeTime,
  Proposal,
} from '@/lib/hooks/useGovernance';
import {
  createEIP712VoteSignatureRequest,
  getChainId,
} from '@/lib/voteSignature';

// Default minimum voters for quorum (used when not specified in proposal)
const DEFAULT_MIN_VOTERS = 10;

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
export default function GovernanceTab({
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
