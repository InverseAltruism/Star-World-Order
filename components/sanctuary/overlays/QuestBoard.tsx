'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import EventBus from '@/components/sanctuary/EventBus';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';

interface Quest {
  id: number;
  season: string;
  title: string;
  description: string;
  quest_type: string;
  requirement_type: string;
  requirement_count: number;
  reward_xp: number;
  reward_bond: number;
  reward_trait: string | null;
  progress: {
    current_count: number;
    completed: number;
    reward_claimed: number;
  } | null;
}

type TabFilter = 'all' | 'daily' | 'weekly' | 'seasonal';

const QUEST_TYPE_BADGE: Record<string, { label: string; color: string }> = {
  daily: { label: 'DAILY', color: '#44ff88' },
  weekly: { label: 'WEEKLY', color: '#66bbff' },
  seasonal: { label: 'SEASONAL', color: '#ffd700' },
};

const TABS: { key: TabFilter; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'daily', label: 'DAILY' },
  { key: 'weekly', label: 'WEEKLY' },
  { key: 'seasonal', label: 'SEASON' },
];

export default function QuestBoard({
  walletAddress,
  tokenId,
}: {
  walletAddress: string | undefined;
  tokenId: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<TabFilter>('all');
  const [claiming, setClaiming] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const loadQuests = useCallback(async () => {
    if (!walletAddress || tokenId === null) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sanctuary/quests?address=${walletAddress}&token_id=${tokenId}`
      );
      const data = await res.json();
      if (data.success) setQuests(data.quests ?? []);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [walletAddress, tokenId]);

  useEffect(() => {
    const handleOpen = () => {
      setOpen(true);
      loadQuests();
    };
    EventBus.on('quest-board-open', handleOpen);
    return () => {
      EventBus.off('quest-board-open', handleOpen);
    };
  }, [loadQuests]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, close]);

  const claimReward = useCallback(
    async (questId: number) => {
      if (!walletAddress || tokenId === null) return;
      setClaiming(questId);
      try {
        const walletAuthHeader = await getWalletAuthHeader(walletAddress);
        if (!walletAuthHeader) {
          setClaiming(null);
          return;
        }
        const res = await fetch('/api/sanctuary/quests/claim', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-wallet-auth': walletAuthHeader,
          },
          body: JSON.stringify({
            address: walletAddress,
            token_id: tokenId,
            quest_id: questId,
          }),
        });
        const data = await res.json();
        if (data.success) {
          await loadQuests();
          EventBus.emit('quest-claimed', { questId });
        }
      } catch {
        // Non-critical
      } finally {
        setClaiming(null);
      }
    },
    [walletAddress, tokenId, loadQuests]
  );

  if (!open) return null;

  const filtered = tab === 'all' ? quests : quests.filter((q) => q.quest_type === tab);
  const active = filtered.filter((q) => !q.progress?.completed);
  const completed = filtered.filter((q) => q.progress?.completed);
  const totalCompleted = quests.filter((q) => q.progress?.completed).length;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
      <div
        ref={panelRef}
        className={`w-80 max-h-[85%] overflow-hidden flex flex-col pointer-events-auto
          bg-black/95 border border-[#ffd700]/40 rounded-lg shadow-[0_0_25px_rgba(255,215,0,0.15)]
          transition-all duration-200 ${
            open ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
      >
        {/* Header */}
        <div className="bg-[#1a0033] border-b border-[#ffd700]/20 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <h3 className="text-[#ffd700] font-['Press_Start_2P'] text-[8px]">
                QUEST BOARD
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-[6px]">
                {totalCompleted}/{quests.length}
              </span>
              <button
                onClick={close}
                className="text-gray-500 hover:text-white text-sm transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-2 py-1 text-[6px] font-['Press_Start_2P'] rounded transition-colors ${
                  tab === t.key
                    ? 'bg-[#ffd700]/20 text-[#ffd700] border border-[#ffd700]/40'
                    : 'text-gray-500 hover:text-gray-300 border border-transparent'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quest List */}
        <div className="overflow-y-auto flex-1 p-3 space-y-2">
          {loading && (
            <p className="text-gray-500 text-[7px] text-center py-4">Loading quests...</p>
          )}

          {!loading && active.length === 0 && completed.length === 0 && (
            <div className="text-center py-6 space-y-1">
              <p className="text-[#ffd700]/40 text-[12px]">🗺️</p>
              <p className="text-gray-500 text-[8px]">No quests available.</p>
              <p className="text-gray-600 text-[7px]">New quests appear each season!</p>
            </div>
          )}

          {active.length > 0 && (
            <div className="space-y-2">
              <p className="text-gray-500 text-[6px] font-['Press_Start_2P'] tracking-wider">
                ACTIVE
              </p>
              {active.map((quest) => {
                const badge =
                  QUEST_TYPE_BADGE[quest.quest_type] ?? QUEST_TYPE_BADGE.seasonal;
                const current = quest.progress?.current_count ?? 0;
                const pct = Math.min((current / quest.requirement_count) * 100, 100);

                return (
                  <div
                    key={quest.id}
                    className="bg-[#0a0a15] rounded-lg border border-[#2a2a4e] p-3"
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <span
                          className="text-[6px] px-1.5 py-0.5 rounded mr-1.5"
                          style={{
                            color: badge.color,
                            backgroundColor: badge.color + '20',
                            border: `1px solid ${badge.color}40`,
                          }}
                        >
                          {badge.label}
                        </span>
                        <span className="text-white text-[8px]">{quest.title}</span>
                      </div>
                      <span className="text-gray-500 text-[7px] shrink-0 ml-1">
                        {current}/{quest.requirement_count}
                      </span>
                    </div>
                    <p className="text-gray-500 text-[7px] mb-1.5">{quest.description}</p>
                    <div className="h-1 bg-[#1a1a2e] rounded-full overflow-hidden border border-[#2a2a4e]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: badge.color }}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {quest.reward_xp > 0 && (
                        <span className="text-[6px] text-[#ffd700]">
                          +{quest.reward_xp} XP
                        </span>
                      )}
                      {quest.reward_bond > 0 && (
                        <span className="text-[6px] text-[#ff66aa]">
                          +{quest.reward_bond} Bond
                        </span>
                      )}
                      {quest.reward_trait && (
                        <span className="text-[6px] text-[#9966ff]">
                          🏷️ {quest.reward_trait}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {completed.length > 0 && (
            <div className="space-y-2">
              <p className="text-gray-500 text-[6px] font-['Press_Start_2P'] tracking-wider mt-2">
                COMPLETED
              </p>
              {completed.map((quest) => {
                const canClaim =
                  quest.progress?.completed && !quest.progress?.reward_claimed;

                return (
                  <div
                    key={quest.id}
                    className={`bg-[#0a0a15] rounded-lg border p-3 ${
                      canClaim ? 'border-[#ffd700]/40' : 'border-[#2a2a4e] opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[8px] mr-1">✨</span>
                        <span className="text-white text-[8px]">{quest.title}</span>
                      </div>
                      {canClaim ? (
                        <button
                          onClick={() => claimReward(quest.id)}
                          disabled={claiming !== null}
                          className="px-2 py-0.5 bg-[#ffd700]/20 border border-[#ffd700]/40 rounded text-[#ffd700] text-[7px] hover:bg-[#ffd700]/30 disabled:opacity-40 transition-colors"
                        >
                          {claiming === quest.id ? '...' : 'CLAIM'}
                        </button>
                      ) : (
                        <span className="text-gray-600 text-[7px]">CLAIMED</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
