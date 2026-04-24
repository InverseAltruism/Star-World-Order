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

interface NPCClickPayload {
  npcId: string;
  npcName: string;
  zone: string;
  dialogue: string;
  screenX: number;
  screenY: number;
}

const QUEST_TYPE_BADGE: Record<string, { label: string; color: string }> = {
  daily: { label: 'DAILY', color: '#44ff88' },
  weekly: { label: 'WEEKLY', color: '#66bbff' },
  seasonal: { label: 'SEASONAL', color: '#ffd700' },
};

export default function QuestDialog({
  walletAddress,
  tokenId,
}: {
  walletAddress: string | undefined;
  tokenId: number | null;
}) {
  const [npc, setNpc] = useState<NPCClickPayload | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setVisible(false);
    setTimeout(() => setNpc(null), 200);
  }, []);

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

  const handleNPCClick = useCallback(
    (payload: NPCClickPayload) => {
      if (payload.npcId === 'spawn-fox' || payload.npcId === 'quest-board') {
        return;
      }
      setNpc(payload);
      setVisible(true);
      loadQuests();
    },
    [loadQuests]
  );

  useEffect(() => {
    EventBus.on('npc-clicked', handleNPCClick);
    return () => {
      EventBus.off('npc-clicked', handleNPCClick);
    };
  }, [handleNPCClick]);

  useEffect(() => {
    if (!visible) return;
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
  }, [visible, close]);

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

  if (!npc) return null;

  const zoneQuests = quests.filter(() => true);
  const activeQuests = zoneQuests.filter((q) => !q.progress?.completed);
  const completedQuests = zoneQuests.filter((q) => q.progress?.completed);

  return (
    <div className="absolute inset-0 z-40 pointer-events-none">
      <div
        ref={panelRef}
        className={`absolute right-4 top-4 w-72 max-h-[80%] overflow-y-auto pointer-events-auto
          bg-black/95 border border-[#00f7ff]/40 rounded-lg shadow-[0_0_20px_rgba(0,247,255,0.2)]
          transition-all duration-200 ${
            visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
          }`}
      >
        {/* NPC Header */}
        <div className="sticky top-0 bg-black/95 border-b border-[#00f7ff]/20 p-3 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🧙</span>
              <div>
                <h3 className="text-[#00f7ff] font-['Press_Start_2P'] text-[8px]">
                  {npc.npcName}
                </h3>
                <span className="text-gray-500 text-[6px]">{npc.zone}</span>
              </div>
            </div>
            <button
              onClick={close}
              className="text-gray-500 hover:text-white text-sm transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-gray-400 text-[7px] mt-2 italic">&ldquo;{npc.dialogue}&rdquo;</p>
        </div>

        {/* Quest List */}
        <div className="p-3 space-y-2">
          {loading && (
            <p className="text-gray-500 text-[7px] text-center py-2">Loading quests...</p>
          )}

          {!loading && activeQuests.length === 0 && completedQuests.length === 0 && (
            <div className="text-center py-4 space-y-1">
              <p className="text-[#ffd700]/40 text-[10px]">📜</p>
              <p className="text-gray-500 text-[8px]">No quests available.</p>
              <p className="text-gray-600 text-[7px]">Check back later!</p>
            </div>
          )}

          {activeQuests.map((quest) => {
            const badge = QUEST_TYPE_BADGE[quest.quest_type] ?? QUEST_TYPE_BADGE.seasonal;
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
                    <span className="text-[6px] text-[#ffd700]">+{quest.reward_xp} XP</span>
                  )}
                  {quest.reward_bond > 0 && (
                    <span className="text-[6px] text-[#ff66aa]">+{quest.reward_bond} Bond</span>
                  )}
                  {quest.reward_trait && (
                    <span className="text-[6px] text-[#9966ff]">🏷️ {quest.reward_trait}</span>
                  )}
                </div>
              </div>
            );
          })}

          {completedQuests.map((quest) => {
            const canClaim = quest.progress?.completed && !quest.progress?.reward_claimed;

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
      </div>
    </div>
  );
}
