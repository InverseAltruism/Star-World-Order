'use client';

import { useState } from 'react';
import AccessGate from '@/components/AccessGate';

type TabId = 'governance' | 'forum' | 'treasury';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const tabs: Tab[] = [
  { id: 'governance', label: 'GOVERNANCE', icon: '🗳️' },
  { id: 'forum', label: 'STAR COUNCIL', icon: '💬' },
  { id: 'treasury', label: 'TREASURY', icon: '💎' },
];

// Mock proposals for demo
const mockProposals = [
  {
    id: 1,
    title: 'SWO-001: Expand Star Trait Collection',
    status: 'active',
    votesFor: 42,
    votesAgainst: 7,
    endDate: '2025-01-15',
    description: 'Proposal to mint additional Star trait NFTs for new members...',
  },
  {
    id: 2,
    title: 'SWO-002: Treasury Allocation for Dev',
    status: 'passed',
    votesFor: 88,
    votesAgainst: 12,
    endDate: '2024-12-01',
    description: 'Allocate 10% of treasury for development efforts...',
  },
  {
    id: 3,
    title: 'SWO-003: Community Art Contest',
    status: 'pending',
    votesFor: 0,
    votesAgainst: 0,
    endDate: '2025-02-01',
    description: 'Host a pixel art contest for community engagement...',
  },
];

// Mock forum threads
const mockThreads = [
  {
    id: 1,
    title: 'Welcome to Star World Order!',
    author: '0x1234...abcd',
    replies: 24,
    lastActivity: '2 hours ago',
    pinned: true,
  },
  {
    id: 2,
    title: 'Ideas for next proposal',
    author: '0x5678...efgh',
    replies: 12,
    lastActivity: '5 hours ago',
    pinned: false,
  },
  {
    id: 3,
    title: 'Star Skrumpey lore discussion',
    author: '0x9abc...ijkl',
    replies: 45,
    lastActivity: '1 day ago',
    pinned: false,
  },
];

function GovernanceTab() {
  return (
    <div className="space-y-6">
      {/* Create Proposal Button */}
      <div className="flex justify-between items-center animate-slide-in-up">
        <h3 className="text-[#ffd700] text-xs tracking-wider animate-glow-pulse">ACTIVE PROPOSALS</h3>
        <button className="pixel-btn pixel-btn-gold text-[8px] !px-3 !py-2 smooth-transition hover-lift">
          + NEW PROPOSAL
        </button>
      </div>

      {/* Proposals List */}
      <div className="space-y-4">
        {mockProposals.map((proposal, index) => {
          const delayClass = `animate-delay-${Math.min(index + 1, 6)}`;
          return (
          <div key={proposal.id} className={`pixel-card p-4 smooth-transition cursor-pointer animate-slide-in-up ${delayClass}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h4 className="text-gray-200 text-[10px] font-bold mb-1">
                  {proposal.title}
                </h4>
                <p className="text-gray-500 text-[8px]">
                  {proposal.description.slice(0, 60)}...
                </p>
              </div>
              <span className={`text-[6px] px-2 py-1 rounded ${
                proposal.status === 'active' ? 'bg-[#44ff88]/20 text-[#44ff88]' :
                proposal.status === 'passed' ? 'bg-[#ffd700]/20 text-[#ffd700]' :
                'bg-[#9966ff]/20 text-[#9966ff]'
              }`}>
                {proposal.status.toUpperCase()}
              </span>
            </div>

            {/* Voting Progress */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-[6px] mb-1">
                  <span className="text-[#44ff88]">FOR: {proposal.votesFor}</span>
                  <span className="text-[#ff4466]">AGAINST: {proposal.votesAgainst}</span>
                </div>
                {(() => {
                  const totalVotes = proposal.votesFor + proposal.votesAgainst || 1;
                  return (
                    <div className="h-2 bg-[#1a1a2e] rounded overflow-hidden flex">
                      <div 
                        className="h-full bg-[#44ff88]" 
                        style={{ width: `${(proposal.votesFor / totalVotes) * 100}%` }} 
                      />
                      <div 
                        className="h-full bg-[#ff4466]" 
                        style={{ width: `${(proposal.votesAgainst / totalVotes) * 100}%` }} 
                      />
                    </div>
                  );
                })()}
              </div>
              <span className="text-gray-500 text-[6px]">
                Ends: {proposal.endDate}
              </span>
            </div>

            {/* Vote Buttons */}
            {proposal.status === 'active' && (
              <div className="flex gap-2 mt-3">
                <button className="flex-1 pixel-btn text-[6px] !py-1 !bg-[#44ff88] !border-[#66ffaa_#22aa44_#22aa44_#66ffaa] smooth-transition hover-lift">
                  VOTE FOR
                </button>
                <button className="flex-1 pixel-btn text-[6px] !py-1 !bg-[#ff4466] !border-[#ff6688_#aa2244_#aa2244_#ff6688] smooth-transition hover-lift">
                  VOTE AGAINST
                </button>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

function ForumTab() {
  return (
    <div className="space-y-6">
      {/* Forum Header */}
      <div className="flex justify-between items-center animate-slide-in-up">
        <h3 className="text-[#ffd700] text-xs tracking-wider animate-glow-pulse">STAR COUNCIL FORUM</h3>
        <button className="pixel-btn pixel-btn-gold text-[8px] !px-3 !py-2 smooth-transition hover-lift">
          + NEW THREAD
        </button>
      </div>

      {/* Thread List */}
      <div className="space-y-3">
        {mockThreads.map((thread, index) => {
          const delayClass = `animate-delay-${Math.min(index + 1, 6)}`;
          return (
          <div 
            key={thread.id} 
            className={`pixel-card p-4 smooth-transition cursor-pointer flex items-center gap-4 animate-slide-in-up ${delayClass}`}
          >
            {/* Pin indicator */}
            {thread.pinned && (
              <span className="text-[#ffd700] text-xs">📌</span>
            )}
            
            <div className="flex-1">
              <h4 className={`text-[10px] font-bold mb-1 ${
                thread.pinned ? 'text-[#ffd700]' : 'text-gray-200'
              }`}>
                {thread.title}
              </h4>
              <div className="flex items-center gap-4 text-[6px] text-gray-500">
                <span>by {thread.author}</span>
                <span>{thread.replies} replies</span>
                <span>{thread.lastActivity}</span>
              </div>
            </div>

            {/* Reply icon */}
            <div className="text-gray-600 text-xs">
              💬
            </div>
          </div>
          );
        })}
      </div>

      {/* Forum Rules */}
      <div className="pixel-card p-4 bg-[#0a0a15]">
        <p className="text-[#9966ff] text-[8px] tracking-wide mb-2">✦ COUNCIL RULES ✦</p>
        <ul className="text-gray-500 text-[6px] space-y-1">
          <li>• Be respectful to fellow Star bearers</li>
          <li>• Stay on topic - cosmic discussions only</li>
          <li>• No spam or self-promotion</li>
          <li>• Have fun! We&apos;re all chosen by the stars</li>
        </ul>
      </div>
    </div>
  );
}

function TreasuryTab() {
  return (
    <div className="space-y-6">
      {/* Treasury Overview */}
      <div className="pixel-card p-6 text-center animate-slide-in-up">
        <h3 className="text-[#ffd700] text-xs tracking-wider mb-4 animate-glow-pulse">COSMIC TREASURY</h3>
        
        {/* Balance Display */}
        <div className="bg-[#0a0a15] p-6 rounded-lg border-2 border-[#ffd700]/30 mb-4 smooth-transition hover-lift">
          <p className="text-gray-500 text-[8px] mb-2">TOTAL BALANCE</p>
          <p className="text-[#ffd700] text-2xl font-bold pixel-glow-gold animate-pixel-pulse">
            💎 42,069 MON
          </p>
          <p className="text-gray-600 text-[6px] mt-2">≈ $XX,XXX USD</p>
        </div>

        {/* Treasury Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[#1a1a2e] p-3 rounded-lg smooth-transition hover-lift animate-slide-in-up animate-delay-1">
            <p className="text-[#44ff88] text-sm">+1,337</p>
            <p className="text-gray-500 text-[6px]">30D INFLOW</p>
          </div>
          <div className="bg-[#1a1a2e] p-3 rounded-lg smooth-transition hover-lift animate-slide-in-up animate-delay-2">
            <p className="text-[#ff4466] text-sm">-420</p>
            <p className="text-gray-500 text-[6px]">30D OUTFLOW</p>
          </div>
          <div className="bg-[#1a1a2e] p-3 rounded-lg smooth-transition hover-lift animate-slide-in-up animate-delay-3">
            <p className="text-[#9966ff] text-sm">99</p>
            <p className="text-gray-500 text-[6px]">STAR HOLDERS</p>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="pixel-card p-6 animate-slide-in-up animate-delay-4">
        <h3 className="text-[#9966ff] text-xs tracking-wider mb-4">RECENT TRANSACTIONS</h3>
        <div className="space-y-3">
          {[
            { type: 'in', amount: '+500 MON', desc: 'Royalties', date: '2 days ago' },
            { type: 'out', amount: '-200 MON', desc: 'Dev payment', date: '5 days ago' },
            { type: 'in', amount: '+337 MON', desc: 'Mint revenue', date: '1 week ago' },
          ].map((tx, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-[#2a2a4e] last:border-0 smooth-transition hover:bg-[#1a1a2e]/50 hover:px-2">
              <div className="flex items-center gap-3">
                <span className={`text-lg ${tx.type === 'in' ? 'text-[#44ff88]' : 'text-[#ff4466]'}`}>
                  {tx.type === 'in' ? '↓' : '↑'}
                </span>
                <div>
                  <p className="text-gray-300 text-[8px]">{tx.desc}</p>
                  <p className="text-gray-600 text-[6px]">{tx.date}</p>
                </div>
              </div>
              <p className={`text-[10px] ${tx.type === 'in' ? 'text-[#44ff88]' : 'text-[#ff4466]'}`}>
                {tx.amount}
              </p>
            </div>
          ))}
        </div>
        
        <button className="w-full mt-4 pixel-btn text-[8px] smooth-transition hover-lift">
          VIEW ALL TRANSACTIONS
        </button>
      </div>
    </div>
  );
}

export default function DAOContent() {
  const [activeTab, setActiveTab] = useState<TabId>('governance');

  return (
    <>
      {/* Page Header */}
      <div className="text-center mb-8 animate-slide-in-up">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="text-2xl animate-pixel-float hover-lift smooth-transition">🏛️</span>
          <h1 className="text-lg md:text-xl text-[#ffd700] pixel-glow-gold tracking-wider">
            THE ORDER
          </h1>
          <span className="text-2xl animate-pixel-float hover-lift smooth-transition" style={{ animationDelay: '0.5s' }}>⭐</span>
        </div>
        <p className="text-[#9966ff] text-[10px] tracking-wide animate-glow-pulse">
          ✦ STAR WORLD ORDER DAO ✦
        </p>
      </div>

      {/* Access-gated content */}
      <AccessGate
        title="DAO ACCESS LOCKED"
        message="Only Star Skrumpey holders may participate in The Order's governance."
      >
        {/* Tab Navigation */}
        <div className="flex justify-center gap-2 mb-8 animate-slide-in-up animate-delay-1">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pixel-btn text-[8px] !px-4 !py-2 smooth-transition hover-lift ${
                activeTab === tab.id 
                  ? 'pixel-btn-gold' 
                  : '!bg-[#1a1a2e] !border-[#3a3a5e_#1a1a2e_#1a1a2e_#3a3a5e]'
              }`}
              style={{ animationDelay: `${0.1 + index * 0.1}s` }}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="max-w-3xl mx-auto">
          {activeTab === 'governance' && <GovernanceTab />}
          {activeTab === 'forum' && <ForumTab />}
          {activeTab === 'treasury' && <TreasuryTab />}
        </div>
      </AccessGate>
    </>
  );
}
