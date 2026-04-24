'use client';

import { useState, useEffect } from 'react';
import EventBus from '@/components/sanctuary/EventBus';

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

const QUEST_TYPE_BADGE: Record<string, { label: string; color: string }> = {
  daily: { label: 'D', color: '#44ff88' },
  weekly: { label: 'W', color: '#66bbff' },
  seasonal: { label: 'S', color: '#ffd700' },
};

const MAX_VISIBLE = 3;

interface QuestTrackerProps {
  walletAddress: string | undefined;
  tokenId: number | null;
}

export default function QuestTracker({ walletAddress, tokenId }: QuestTrackerProps) {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!walletAddress || tokenId === null) return;
    let cancelled = false;

    async function fetchQuests() {
      try {
        const res = await fetch(
          `/api/sanctuary/quests?address=${walletAddress}&token_id=${tokenId}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.success) {
          setQuests(data.quests ?? []);
        }
      } catch {
        // Non-critical
      }
    }

    fetchQuests();
    return () => {
      cancelled = true;
    };
  }, [walletAddress, tokenId, refreshTick]);

  useEffect(() => {
    const refresh = () => setRefreshTick((t) => t + 1);
    EventBus.on('quest-claimed', refresh);
    EventBus.on('companion-interacted', refresh);
    EventBus.on('location-entered', refresh);
    return () => {
      EventBus.off('quest-claimed', refresh);
      EventBus.off('companion-interacted', refresh);
      EventBus.off('location-entered', refresh);
    };
  }, []);

  const activeQuests = quests
    .filter((q) => !q.progress?.completed)
    .sort((a, b) => {
      const order = ['daily', 'weekly', 'seasonal'];
      return order.indexOf(a.quest_type) - order.indexOf(b.quest_type);
    })
    .slice(0, MAX_VISIBLE);

  const readyToClaim = quests.filter(
    (q) => q.progress?.completed && !q.progress?.reward_claimed
  ).length;

  if (!walletAddress || tokenId === null || activeQuests.length === 0) {
    return null;
  }

  const openBoard = (e: React.MouseEvent) => {
    e.stopPropagation();
    EventBus.emit('quest-board-open');
  };

  return (
    <div className="absolute top-2 right-2 z-20 pointer-events-none select-none">
      <div
        className="w-56 bg-black/85 border border-[#ffd700]/30 rounded-lg
          shadow-[0_0_15px_rgba(255,215,0,0.15)] pointer-events-auto overflow-hidden"
      >
        {/* Header */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-2 py-1.5 bg-[#1a0033]/60 border-b border-[#ffd700]/20 hover:bg-[#1a0033]/80 transition-colors"
          aria-label={expanded ? 'Collapse quest tracker' : 'Expand quest tracker'}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[9px]">📜</span>
            <span className="text-[#ffd700] font-['Press_Start_2P'] text-[8px]">
              QUESTS
            </span>
            <span className="text-gray-500 text-[7px]">
              ({activeQuests.length})
            </span>
            {readyToClaim > 0 && (
              <span
                className="text-[6px] px-1 py-0.5 rounded bg-[#ffd700]/20 text-[#ffd700] border border-[#ffd700]/40 animate-pulse"
                title={`${readyToClaim} reward${readyToClaim === 1 ? '' : 's'} ready to claim`}
              >
                !{readyToClaim}
              </span>
            )}
          </div>
          <span className="text-gray-500 text-[8px]">
            {expanded ? '▾' : '▸'}
          </span>
        </button>

        {/* Quest list */}
        {expanded && (
          <div className="p-2 space-y-1.5">
            {activeQuests.map((quest) => {
              const badge =
                QUEST_TYPE_BADGE[quest.quest_type] ?? QUEST_TYPE_BADGE.seasonal;
              const current = quest.progress?.current_count ?? 0;
              const pct = Math.min(
                (current / quest.requirement_count) * 100,
                100
              );

              return (
                <div
                  key={quest.id}
                  className="bg-[#0a0a15]/80 rounded border border-[#2a2a4e] px-2 py-1.5"
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <span
                        className="text-[6px] px-1 rounded shrink-0"
                        style={{
                          color: badge.color,
                          backgroundColor: badge.color + '20',
                          border: `1px solid ${badge.color}40`,
                        }}
                        title={quest.quest_type}
                      >
                        {badge.label}
                      </span>
                      <span className="text-white text-[8px] truncate">
                        {quest.title}
                      </span>
                    </div>
                    <span className="text-gray-400 text-[7px] shrink-0 tabular-nums">
                      {current}/{quest.requirement_count}
                    </span>
                  </div>
                  <div className="h-1 bg-[#1a1a2e] rounded-full overflow-hidden border border-[#2a2a4e]">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: badge.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}

            <button
              onClick={openBoard}
              className="w-full mt-1 py-1 text-[7px] text-[#ffd700]/70 hover:text-[#ffd700] border border-[#ffd700]/20 hover:border-[#ffd700]/50 rounded transition-colors font-['Press_Start_2P']"
            >
              OPEN BOARD
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
