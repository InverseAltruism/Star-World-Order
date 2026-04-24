'use client';

import { useState, useEffect, useCallback } from 'react';
import EventBus from '@/components/sanctuary/EventBus';

interface CompanionData {
  nickname: string | null;
  token_id: number;
  mood: string | null;
  bond_score: number;
  total_xp: number;
  level: number;
}

interface CompanionHUDProps {
  walletAddress: string | undefined;
}

const MOOD_EMOJI: Record<string, string> = {
  happy: '\u{1F60A}',
  excited: '\u{1F929}',
  calm: '\u{1F60C}',
  sleepy: '\u{1F634}',
  curious: '\u{1F9D0}',
};

const XP_PER_LEVEL = 100;

function xpForLevel(level: number): number {
  return (level - 1) * (level - 1) * XP_PER_LEVEL;
}

function xpProgress(totalXp: number, level: number): { current: number; needed: number } {
  const thisLevel = xpForLevel(level);
  const nextLevel = xpForLevel(level + 1);
  return { current: totalXp - thisLevel, needed: nextLevel - thisLevel };
}

export default function CompanionHUD({ walletAddress }: CompanionHUDProps) {
  const [companion, setCompanion] = useState<CompanionData | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [locationVisible, setLocationVisible] = useState(false);

  useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;

    async function fetchCompanion() {
      try {
        const res = await fetch(
          `/api/sanctuary/companion?address=${walletAddress}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.companion) {
          setCompanion({
            nickname: data.companion.nickname,
            token_id: data.companion.token_id,
            mood: data.companion.mood,
            bond_score: data.companion.bond_score,
            total_xp: data.companion.total_xp ?? 0,
            level: data.companion.level ?? 1,
          });
        }
      } catch {
        // HUD is non-critical
      }
    }

    fetchCompanion();
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const onEnter = useCallback((payload: { name: string }) => {
    setLocationName(payload.name);
    setLocationVisible(true);
  }, []);

  const onExit = useCallback(() => {
    setLocationVisible(false);
  }, []);

  useEffect(() => {
    EventBus.on('location-entered', onEnter);
    EventBus.on('location-exited', onExit);
    return () => {
      EventBus.off('location-entered', onEnter);
      EventBus.off('location-exited', onExit);
    };
  }, [onEnter, onExit]);

  const openJournal = useCallback(() => {
    EventBus.emit('journal-overlay-toggle');
  }, []);

  const openTraits = useCallback(() => {
    EventBus.emit('traits-overlay-toggle');
  }, []);

  if (!companion) return null;

  const displayName =
    companion.nickname || `Skrumpey #${companion.token_id}`;
  const moodEmoji = MOOD_EMOJI[companion.mood ?? ''] ?? '\u{1F438}';
  const bondPct = Math.min((companion.bond_score / 100) * 100, 100);
  const xp = xpProgress(companion.total_xp, companion.level);
  const xpPct = xp.needed > 0 ? Math.min((xp.current / xp.needed) * 100, 100) : 100;

  return (
    <>
      {/* Companion status bar */}
      <div className="absolute top-2 left-2 z-20 flex items-center gap-2 bg-black/80 border border-[#2a2a4e] rounded px-3 py-1.5 pointer-events-none select-none">
        <span className="text-base leading-none">{moodEmoji}</span>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[8px] text-[#ffd700] font-['Press_Start_2P'] truncate max-w-[120px]">
            {displayName}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[6px] text-gray-500 w-6 text-right">BND</span>
            <div className="w-14 h-1 bg-[#1a1a2e] rounded-full overflow-hidden border border-[#2a2a4e]">
              <div
                className="h-full rounded-full bg-[#ff66aa] transition-all duration-500"
                style={{ width: `${bondPct}%` }}
              />
            </div>
            <span className="text-[6px] text-gray-500 w-6 text-right">
              L{companion.level}
            </span>
            <div className="w-14 h-1 bg-[#1a1a2e] rounded-full overflow-hidden border border-[#2a2a4e]">
              <div
                className="h-full rounded-full bg-[#00f7ff] transition-all duration-500"
                style={{ width: `${xpPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Journal book icon */}
      <button
        onClick={openJournal}
        className="absolute bottom-2 left-2 z-20 flex items-center gap-1 bg-black/80 border border-[#8b5a2b]/60 rounded px-2 py-1 hover:bg-[#3a2410]/80 hover:border-[#ffd700]/60 transition-colors pointer-events-auto select-none"
        aria-label="Open journal (J)"
        title="Journal (J)"
      >
        <span className="text-[10px] leading-none">📖</span>
        <span className="text-[6px] text-[#ffd700]/80 font-['Press_Start_2P']">[J]</span>
      </button>

      {/* Traits icon */}
      <button
        onClick={openTraits}
        className="absolute bottom-2 left-16 z-20 flex items-center gap-1 bg-black/80 border border-[#6644aa]/60 rounded px-2 py-1 hover:bg-[#1a0f3a]/80 hover:border-[#9966ff]/60 transition-colors pointer-events-auto select-none"
        aria-label="Open traits (T)"
        title="Traits (T)"
      >
        <span className="text-[10px] leading-none">🌌</span>
        <span className="text-[6px] text-[#9966ff]/80 font-['Press_Start_2P']">[T]</span>
      </button>

      {/* Location indicator */}
      {locationName && (
        <div
          className={`absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-black/80 border border-[#9966ff]/40 rounded px-3 py-1 pointer-events-none select-none transition-all duration-300 ${
            locationVisible
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 -translate-y-2'
          }`}
        >
          <span className="text-[8px] text-[#9966ff] font-['Press_Start_2P'] uppercase tracking-wider">
            {locationName}
          </span>
        </div>
      )}
    </>
  );
}
