'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import EventBus from '@/components/sanctuary/EventBus';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';
import { getQuestSource, type QuestSource } from '@/game/config/questSourceMap';

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

interface NPCClickPayload {
  npcId: string;
  npcName: string;
  zone: string;
  dialogue: string;
  screenX: number;
  screenY: number;
}

interface ExpeditionListing {
  id: string;
  title: string;
  description: string;
  npcSource: string;
  star_cost: number;
  tier: 'easy' | 'medium' | 'hard';
  rewards: { xp: number; bond: number; trait?: string | null };
  active_row_id: number | null;
}

type TabFilter = 'all' | 'room' | 'daily' | 'weekly';

const TIER_COLOR: Record<ExpeditionListing['tier'], string> = {
  easy: '#44ff88',
  medium: '#ffd700',
  hard: '#ff66aa',
};

const QUEST_TYPE_BADGE: Record<string, { label: string; color: string }> = {
  daily: { label: 'DAILY', color: '#44ff88' },
  weekly: { label: 'WEEKLY', color: '#66bbff' },
  seasonal: { label: 'SEASON', color: '#ffd700' },
};

const TABS: { key: TabFilter; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'room', label: 'ROOM' },
  { key: 'daily', label: 'DAILY' },
  { key: 'weekly', label: 'WEEKLY' },
];

interface QuestWithSource extends Quest {
  source: QuestSource;
}

interface QuestGroup {
  key: string;
  source: QuestSource;
  quests: QuestWithSource[];
}

function groupBySource(quests: QuestWithSource[]): QuestGroup[] {
  const map = new Map<string, QuestGroup>();
  for (const quest of quests) {
    const key = quest.source.npcId;
    const existing = map.get(key);
    if (existing) {
      existing.quests.push(quest);
    } else {
      map.set(key, { key, source: quest.source, quests: [quest] });
    }
  }
  return Array.from(map.values());
}

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
  const [expeditions, setExpeditions] = useState<ExpeditionListing[]>([]);
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

  const loadExpeditions = useCallback(async () => {
    if (!walletAddress || tokenId === null) return;
    try {
      const res = await fetch(
        `/api/sanctuary/expeditions/list?address=${walletAddress}&token_id=${tokenId}`
      );
      const data = await res.json();
      if (data.success) setExpeditions(data.expeditions ?? []);
    } catch {
      // Non-critical — expedition list is additive over the quest board.
    }
  }, [walletAddress, tokenId]);

  const launchExpedition = useCallback((entry: ExpeditionListing) => {
    EventBus.emit('expedition-open', {
      expedition_id: entry.id,
      row_id: entry.active_row_id,
    });
  }, []);

  useEffect(() => {
    const handleOpen = () => {
      setOpen(true);
      loadQuests();
      loadExpeditions();
    };
    const handleNPCClick = (payload: NPCClickPayload) => {
      if (payload.npcId !== 'quest-board') return;
      setOpen(true);
      loadQuests();
      loadExpeditions();
    };
    const handleExpeditionAbandoned = () => {
      // Active-run badge clears on abandon — refresh listings.
      loadExpeditions();
    };
    EventBus.on('quest-board-open', handleOpen);
    EventBus.on('npc-clicked', handleNPCClick);
    EventBus.on('expedition-abandoned', handleExpeditionAbandoned);
    return () => {
      EventBus.off('quest-board-open', handleOpen);
      EventBus.off('npc-clicked', handleNPCClick);
      EventBus.off('expedition-abandoned', handleExpeditionAbandoned);
    };
  }, [loadQuests, loadExpeditions]);

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

  const navigateToRoom = useCallback(
    (room: string) => {
      EventBus.emit('highlight-door', { room });
      close();
    },
    [close]
  );

  const questsWithSource = useMemo<QuestWithSource[]>(
    () =>
      quests.map((q) => ({
        ...q,
        source: getQuestSource(q.requirement_type),
      })),
    [quests]
  );

  const filtered = useMemo<QuestWithSource[]>(() => {
    switch (tab) {
      case 'room':
        return questsWithSource.filter((q) => q.source.room !== null);
      case 'daily':
        return questsWithSource.filter((q) => q.quest_type === 'daily');
      case 'weekly':
        return questsWithSource.filter((q) => q.quest_type === 'weekly');
      case 'all':
      default:
        return questsWithSource;
    }
  }, [questsWithSource, tab]);

  const activeGroups = useMemo(
    () => groupBySource(filtered.filter((q) => !q.progress?.completed)),
    [filtered]
  );
  const completed = filtered.filter((q) => q.progress?.completed);
  const totalCompleted = quests.filter((q) => q.progress?.completed).length;

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
      <div
        ref={panelRef}
        className={`w-96 max-h-[85%] overflow-hidden flex flex-col pointer-events-auto
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
                aria-label="Close quest board"
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
        <div className="overflow-y-auto flex-1 p-3 space-y-3">
          {loading && (
            <p className="text-gray-500 text-[7px] text-center py-4">Loading quests...</p>
          )}

          {!loading && activeGroups.length === 0 && completed.length === 0 && (
            <div className="text-center py-6 space-y-1">
              <p className="text-[#ffd700]/40 text-[12px]">🗺️</p>
              <p className="text-gray-500 text-[8px]">No quests in this category.</p>
              <p className="text-gray-600 text-[7px]">Try a different tab!</p>
            </div>
          )}

          {activeGroups.map((group) => (
            <div key={group.key} className="space-y-1.5">
              {/* Group header: NPC name + zone + Go button */}
              <div className="flex items-center justify-between bg-[#0a0a15]/80 rounded px-2 py-1.5 border border-[#00f7ff]/20">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[9px]">🧙</span>
                  <div className="min-w-0">
                    <p className="text-[#00f7ff] text-[8px] font-['Press_Start_2P'] truncate">
                      {group.source.npcName}
                    </p>
                    <p className="text-gray-500 text-[6px] truncate">{group.source.zone}</p>
                  </div>
                </div>
                {group.source.room && (
                  <button
                    onClick={() => navigateToRoom(group.source.room as string)}
                    className="px-2 py-1 text-[6px] font-['Press_Start_2P'] text-[#00f7ff]
                      bg-[#00f7ff]/10 border border-[#00f7ff]/40 rounded
                      hover:bg-[#00f7ff]/20 hover:shadow-[0_0_8px_#00f7ff] transition-all shrink-0 ml-2"
                    title={`Highlight the door to ${group.source.room}`}
                  >
                    GO ▸
                  </button>
                )}
              </div>

              {/* Quests under this source */}
              {group.quests.map((quest) => {
                const badge =
                  QUEST_TYPE_BADGE[quest.quest_type] ?? QUEST_TYPE_BADGE.seasonal;
                const current = quest.progress?.current_count ?? 0;
                const pct = Math.min((current / quest.requirement_count) * 100, 100);

                return (
                  <div
                    key={quest.id}
                    className="bg-[#0a0a15] rounded-lg border border-[#2a2a4e] p-3 ml-3"
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
          ))}

          {expeditions.length > 0 && (
            <div className="space-y-2" data-testid="expedition-section">
              <p className="text-gray-500 text-[6px] font-['Press_Start_2P'] tracking-wider mt-2">
                EXPEDITIONS
              </p>
              {expeditions.map((exp) => {
                const color = TIER_COLOR[exp.tier];
                const isActive = exp.active_row_id !== null;
                return (
                  <div
                    key={exp.id}
                    data-testid={`expedition-card-${exp.id}`}
                    className="bg-[#0a0a15] rounded-lg border border-[#9966ff]/30 p-3"
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div className="min-w-0">
                        <span
                          className="text-[6px] px-1.5 py-0.5 rounded mr-1.5 uppercase"
                          style={{
                            color,
                            backgroundColor: color + '20',
                            border: `1px solid ${color}40`,
                          }}
                        >
                          {exp.tier}
                        </span>
                        <span className="text-white text-[8px]">{exp.title}</span>
                      </div>
                      <span className="text-[#ffd700] text-[7px] shrink-0 ml-2">
                        ⭐ {exp.star_cost}
                      </span>
                    </div>
                    <p className="text-gray-500 text-[7px] mb-1.5">
                      {exp.description}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {exp.rewards.xp > 0 && (
                          <span className="text-[6px] text-[#ffd700]">
                            +{exp.rewards.xp} XP
                          </span>
                        )}
                        {exp.rewards.bond > 0 && (
                          <span className="text-[6px] text-[#ff66aa]">
                            +{exp.rewards.bond} Bond
                          </span>
                        )}
                        {exp.rewards.trait && (
                          <span className="text-[6px] text-[#9966ff]">
                            🏷️ {exp.rewards.trait}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => launchExpedition(exp)}
                        data-testid={`expedition-launch-${exp.id}`}
                        className="px-2 py-1 rounded border border-[#9966ff]/40 bg-[#9966ff]/10
                          hover:bg-[#9966ff]/20 text-[#9966ff] text-[6px] font-['Press_Start_2P']
                          transition-colors shrink-0"
                      >
                        {isActive ? 'RESUME ▸' : 'BEGIN ▸'}
                      </button>
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
                        <span className="text-gray-600 text-[6px] ml-1.5">
                          · {quest.source.npcName}
                        </span>
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
