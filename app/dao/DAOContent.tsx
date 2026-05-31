'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import AccessGate from '@/components/AccessGate';
import { useGovernance } from '@/lib/hooks/useGovernance';

// Shared loading fallback for the lazily-loaded tab bodies.
const TabLoading = () => (
  <div className="py-20 text-center text-[#9966ff] text-sm tracking-wider animate-pulse">LOADING…</div>
);

// Members & Treasury are full cross-page bodies; Forum and Staking are heavy tab
// bodies — all code-split so they're not in the DAO page's initial JS and only
// load when their tab is opened. GovernanceTab is the DEFAULT tab, so it stays a
// static import (no load flash on first paint).
import GovernanceTab from './tabs/GovernanceTab';
const ForumTab = dynamic(() => import('./tabs/ForumTab'), { ssr: false, loading: TabLoading });
const MembersContent = dynamic(() => import('@/app/members/MembersContent'), { ssr: false, loading: TabLoading });
const TreasuryContent = dynamic(() => import('@/app/treasury/TreasuryContent'), { ssr: false, loading: TabLoading });
const StakingTab = dynamic(() => import('./tabs/StakingTab'), { ssr: false, loading: TabLoading });

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

export default function DAOContent() {
  const [activeTab, setActiveTab] = useState<TabId>('governance');
  const [selectedForumThreadId, setSelectedForumThreadId] = useState<string | null>(null);
  
  const {
    proposals,
    threads,
    votingPower,
    isLoadingProposals,
    isLoadingThreads,
    isLoadingStaking,
    createNewProposal,
    vote,
    hasVoted,
    createNewThread,
    replyToThread,
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
