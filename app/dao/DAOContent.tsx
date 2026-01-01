'use client';

import { useState, useEffect, useCallback } from 'react';
import AccessGate from '@/components/AccessGate';
import MembersContent from '@/app/members/MembersContent';
import TreasuryContent from '@/app/treasury/TreasuryContent';
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
 * Create Proposal Modal
 */
function CreateProposalModal({
  isOpen,
  onClose,
  onCreate,
  isPending,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, description: string, votingDurationWeeks: number) => Promise<{ success: boolean; error?: string }>;
  isPending: boolean;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [votingDuration, setVotingDuration] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setError(null);
    const result = await onCreate(title, description, votingDuration);
    if (result.success) {
      setTitle('');
      setDescription('');
      setVotingDuration(1);
      onClose();
    } else {
      setError(result.error || 'Failed to create proposal');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="pixel-card p-6 max-w-lg w-full animate-slide-in-up">
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
  onVote: (proposalId: string, support: boolean, reason?: string) => Promise<{ success: boolean; error?: string }>;
  isPending: boolean;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !proposal) return null;

  const handleVote = async (support: boolean) => {
    setError(null);
    const result = await onVote(proposal.id, support, reason || undefined);
    if (result.success) {
      setReason('');
      onClose();
    } else {
      setError(result.error || 'Failed to cast vote');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="pixel-card p-6 max-w-lg w-full animate-slide-in-up">
        <h3 className="text-[#ffd700] text-sm tracking-wider mb-4 animate-glow-pulse">
          🗳️ CAST YOUR VOTE
        </h3>
        
        <div className="mb-4">
          <h4 className="text-gray-200 text-[10px] font-bold mb-2">{proposal.title}</h4>
          <p className="text-gray-500 text-xs">{proposal.description.slice(0, 200)}...</p>
        </div>
        
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
          
          <div className="flex gap-3">
            <button
              onClick={() => handleVote(true)}
              disabled={isPending}
              className="flex-1 pixel-btn text-xs !bg-[#44ff88] !border-[#66ffaa_#22aa44_#22aa44_#66ffaa] smooth-transition hover-lift disabled:opacity-50"
            >
              {isPending ? '...' : '✓ VOTE FOR'}
            </button>
            <button
              onClick={() => handleVote(false)}
              disabled={isPending}
              className="flex-1 pixel-btn text-xs !bg-[#ff4466] !border-[#ff6688_#aa2244_#aa2244_#ff6688] smooth-transition hover-lift disabled:opacity-50"
            >
              {isPending ? '...' : '✕ VOTE AGAINST'}
            </button>
          </div>
          
          <button
            onClick={onClose}
            className="w-full pixel-btn text-xs !bg-[#1a1a2e] !border-[#3a3a5e_#1a1a2e_#1a1a2e_#3a3a5e] smooth-transition hover-lift"
          >
            CANCEL
          </button>
        </div>
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
}: {
  proposals: Proposal[];
  onCreateProposal: (title: string, description: string, votingDurationWeeks: number) => Promise<{ success: boolean; error?: string }>;
  onVote: (proposalId: string, support: boolean, reason?: string) => Promise<{ success: boolean; error?: string }>;
  hasVoted: (proposalId: string) => boolean;
  votingPower: number;
  isLoading: boolean;
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleCreate = async (title: string, description: string, votingDurationWeeks: number) => {
    setIsPending(true);
    const result = await onCreateProposal(title, description, votingDurationWeeks);
    setIsPending(false);
    return result;
  };

  const handleVote = async (proposalId: string, support: boolean, reason?: string) => {
    setIsPending(true);
    const result = await onVote(proposalId, support, reason);
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

      {/* Proposals List */}
      {proposals.length === 0 ? (
        <div className="pixel-card p-8 text-center animate-slide-in-up">
          <div className="text-4xl mb-4 animate-pixel-float">📜</div>
          <h3 className="text-[#ffd700] text-xs tracking-wider mb-2">NO PROPOSALS YET</h3>
          <p className="text-gray-500 text-xs">Be the first to create a proposal for The Order!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {proposals.map((proposal, index) => {
            const delayClass = `animate-delay-${Math.min(index + 1, 6)}`;
            const totalVotes = proposal.forVotes + proposal.againstVotes || 1;
            const hasUserVoted = hasVoted(proposal.id);
            const isActive = proposal.state === ProposalState.Active;
            
            return (
              <div key={proposal.id} className={`pixel-card p-4 smooth-transition animate-slide-in-up ${delayClass}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h4 className="text-gray-200 text-[10px] font-bold mb-1">
                      {proposal.title}
                    </h4>
                    <p className="text-gray-500 text-xs">
                      {proposal.description.slice(0, 100)}...
                    </p>
                    <p className="text-gray-600 text-[10px] mt-1">
                      Proposed by {truncateAddress(proposal.proposer)} • {formatRelativeTime(proposal.createdAt)}
                    </p>
                  </div>
                  <span 
                    className="text-[10px] px-2 py-1 rounded"
                    style={{ 
                      backgroundColor: `${getProposalStateColor(proposal.state)}20`,
                      color: getProposalStateColor(proposal.state)
                    }}
                  >
                    {getProposalStateLabel(proposal.state).toUpperCase()}
                  </span>
                </div>

                {/* Voting Progress */}
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-[#44ff88]">FOR: {proposal.forVotes}</span>
                      <span className="text-[#ff4466]">AGAINST: {proposal.againstVotes}</span>
                    </div>
                    <div className="h-2 bg-[#1a1a2e] rounded overflow-hidden flex">
                      <div 
                        className="h-full bg-[#44ff88] smooth-transition" 
                        style={{ width: `${(proposal.forVotes / totalVotes) * 100}%` }} 
                      />
                      <div 
                        className="h-full bg-[#ff4466] smooth-transition" 
                        style={{ width: `${(proposal.againstVotes / totalVotes) * 100}%` }} 
                      />
                    </div>
                  </div>
                  <span className="text-gray-500 text-[10px]">
                    {proposal.forVotes + proposal.againstVotes} votes
                  </span>
                </div>

                {/* Vote Buttons */}
                {isActive && !hasUserVoted && (
                  <div className="flex gap-2 mt-3">
                    <button 
                      onClick={() => setSelectedProposal(proposal)}
                      className="flex-1 pixel-btn text-[10px] !py-1 !bg-[#9966ff] !border-[#bb99ff_#5533aa_#5533aa_#bb99ff] smooth-transition hover-lift"
                    >
                      🗳️ CAST VOTE
                    </button>
                  </div>
                )}
                
                {isActive && hasUserVoted && (
                  <div className="mt-3 text-center">
                    <span className="text-[#44ff88] text-xs">✓ You have voted on this proposal</span>
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
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedThread, setSelectedThread] = useState<ForumThread | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<ThreadCategory>(ThreadCategory.General);
  const [replyContent, setReplyContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  
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
          author: truncateAddress(data.thread.author_address),
          authorAddress: data.thread.author_address,
          category: data.thread.category as ThreadCategory,
          pinned: Boolean(data.thread.pinned),
          locked: Boolean(data.thread.locked),
          createdAt: new Date(data.thread.created_at).getTime(),
          updatedAt: new Date(data.thread.updated_at).getTime(),
          replies: (data.replies || []).map((r: { id: string; thread_id: string; content: string; author_address: string; created_at: string; likes_count?: number; dislikes_count?: number; is_edited?: number; original_content?: string }) => ({
            id: r.id,
            threadId: r.thread_id,
            content: r.content,
            author: truncateAddress(r.author_address),
            authorAddress: r.author_address,
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
      }
    } catch (error) {
      console.error('Failed to fetch thread details:', error);
    } finally {
      setIsLoadingThread(false);
    }
  }, []);

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

  // Sort threads: pinned first, then by last activity
  const sortedThreads = [...threads].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

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
                <span>by {selectedThread.author}</span>
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
                      <span>{reply.author}</span>
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
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="pixel-card p-6 max-w-lg w-full animate-slide-in-up">
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

      {/* Thread List */}
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
                </div>
                <h4 className={`text-sm font-bold mb-1 ${thread.pinned ? 'text-[#ffd700]' : 'text-gray-200'}`}>
                  {thread.title}
                </h4>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>by {thread.author}</span>
                  <span>{thread.replies.length} replies</span>
                  <span>{formatRelativeTime(thread.updatedAt)}</span>
                </div>
              </div>

              <div className="text-gray-600 text-xs">💬</div>
            </div>
          );
        })}
      </div>

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
            <li>• Use STAR for governance voting (√STAR + NFT count)</li>
            <li>• Late joiners stay competitive with sqrt weighting</li>
          </ul>
        </div>
      </div>

      {/* Voting Power Breakdown */}
      {votingPower && (
        <div className="pixel-card p-4 animate-slide-in-up animate-delay-1">
          <h4 className="text-[#9966ff] text-xs mb-3">VOTING POWER BREAKDOWN</h4>
          <div className="bg-[#0a0a15] rounded-lg p-4">
            <div className="space-y-2 text-[10px]">
              <div className="flex justify-between">
                <span className="text-gray-500">NFT Voting Power:</span>
                <span className="text-[#9966ff]">{votingPower.nftVotingPower.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">STAR Voting Power:</span>
                <span className="text-[#ffd700]">{votingPower.starVotingPower.toFixed(2)}</span>
              </div>
              <div className="text-gray-600 text-[5px] mb-1">
                (√{formatStarAmount(votingPower.starBalance + votingPower.pendingStars)} STAR = {votingPower.starVotingPower.toFixed(2)})
              </div>
              <div className="border-t border-[#2a2a4e] pt-2 flex justify-between">
                <span className="text-gray-300">Total Weighted Power:</span>
                <span className="text-[#00ffff] font-bold">{votingPower.weightedVotingPower.toFixed(2)}</span>
              </div>
            </div>
            <p className="text-gray-600 text-[10px] mt-3">
              ℹ️ Weighted voting uses √STAR + NFT count to balance early vs late members
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
          <li>• Governance voting power = √(STAR) + NFT count</li>
          <li>• Sqrt weighting ensures late joiners stay competitive</li>
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
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="pixel-card p-6 max-w-lg w-full animate-slide-in-up max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
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
            
            <div className="space-y-4 text-sm">
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

              {/* Voting Power */}
              <div className="bg-[#0a0a15] rounded-lg p-4">
                <h4 className="text-[#44ff88] text-xs mb-2 font-bold">⚖️ VOTING POWER</h4>
                <ul className="text-gray-300 text-xs space-y-1">
                  <li>• <span className="text-[#9966ff]">1 Star Skrumpey NFT</span> = 1 base vote</li>
                  <li>• <span className="text-[#ffd700]">STAR tokens</span> from staking add voting weight</li>
                  <li>• Formula: <span className="text-[#00ffff]">√(STAR) + NFT Count</span></li>
                  <li>• This ensures late joiners can still compete!</li>
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
                  <li>• Proposals require quorum to pass</li>
                </ul>
              </div>

              {/* How to Participate */}
              <div className="bg-[#0a0a15] rounded-lg p-4">
                <h4 className="text-[#ffd700] text-xs mb-2 font-bold">📝 HOW TO PARTICIPATE</h4>
                <ol className="text-gray-300 text-xs space-y-1 list-decimal list-inside">
                  <li>Hold at least 1 Star Skrumpey NFT</li>
                  <li>Connect your wallet</li>
                  <li>Create proposals or vote on existing ones</li>
                  <li>Stake NFTs to earn STAR and boost voting power</li>
                  <li>Discuss in Star Council forum</li>
                </ol>
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
              className="w-full pixel-btn pixel-btn-gold text-xs mt-4"
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
        {/* Tab Navigation */}
        <div className="flex flex-wrap justify-center gap-2 mb-8 animate-slide-in-up animate-delay-1">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
              disabled={tab.disabled}
              className={`pixel-btn text-xs !px-4 !py-2 smooth-transition ${
                tab.disabled 
                  ? '!opacity-50 !cursor-not-allowed !bg-[#1a1a2e] !border-[#2a2a3e_#1a1a2e_#1a1a2e_#2a2a3e]'
                  : activeTab === tab.id 
                    ? 'pixel-btn-gold hover-lift' 
                    : '!bg-[#1a1a2e] !border-[#3a3a5e_#1a1a2e_#1a1a2e_#3a3a5e] hover-lift'
              }`}
              style={{ animationDelay: `${0.1 + index * 0.1}s` }}
              title={tab.disabled ? 'Coming Soon' : undefined}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
              {tab.disabled && <span className="ml-1 text-[8px]">(Soon)</span>}
            </button>
          ))}
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
