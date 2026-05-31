'use client';

import { useState, useEffect, useCallback } from 'react';
import ClickableUsername from '@/components/ClickableUsername';
import {
  ThreadCategory,
  getCategoryLabel,
  formatRelativeTime,
  truncateAddress,
  ForumThread,
  ForumReply,
} from '@/lib/hooks/useGovernance';

/**
 * Forum Tab Component
 */
export default function ForumTab({
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
