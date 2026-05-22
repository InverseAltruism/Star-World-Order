'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import EventBus from '@/components/sanctuary/EventBus';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';
import { resolveCompanionMood, type MoodStatInput } from '@/lib/sanctuary/mood';
import {
  alertIcon,
  describeNeeds,
  lowStats,
  newlyCrossed,
  type NeedStats,
} from '@/lib/sanctuary/needs';
import { streakChipLabel, type StreakStatus } from '@/lib/sanctuary/streaks';

interface CompanionData {
  nickname: string | null;
  token_id: number;
  mood: string | null;
  bond_score: number;
  total_xp: number;
  level: number;
  companion_xp: number;
  companion_level: number;
  current_activity: string;
  activity_ends_at: string | null;
  equipped_cosmetics: string | null;
  // V2.4 vitality stats (optional — null/undefined for legacy companions).
  // When populated, drive stat-derived mood; when null, trait-mood fallback
  // applies. The 'sleeping' branch in the mood resolver renders the 💤
  // marker until the companion auto-wakes (energy ≥ 100).
  hunger: number | null;
  happiness: number | null;
  energy: number | null;
  is_sleeping: number | null;
  // [SWO_V2_SANCTUARY_STREAKS] Daily-visit streak (null when the companion
  // endpoint pre-dates the v2.7 migration — chip simply hides).
  streak_current: number | null;
  streak_status: StreakStatus | null;
}

interface CompanionHUDProps {
  walletAddress: string | undefined;
}

export const MOOD_EMOJI: Record<string, string> = {
  happy: '\u{1F60A}',
  excited: '\u{1F929}',
  calm: '\u{1F60C}',
  sleepy: '\u{1F634}',
  curious: '\u{1F9D0}',
  // V2.4 stat-derived moods
  sleeping: '\u{1F4A4}',
  hungry: '\u{1F37D}\u{FE0F}',
  lonely: '\u{1F62E}\u{200D}\u{1F4A8}',
  idle: '\u{1F643}',
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

// Per-companion XP thresholds (must match COMPANION_LEVEL_THRESHOLDS in lib/db.ts)
const COMPANION_LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500];

function companionXpProgress(xp: number, level: number): { current: number; needed: number } {
  const idx = Math.min(level - 1, COMPANION_LEVEL_THRESHOLDS.length - 1);
  const thisLevel = COMPANION_LEVEL_THRESHOLDS[idx] ?? 0;
  const nextLevel = COMPANION_LEVEL_THRESHOLDS[idx + 1];
  if (nextLevel === undefined) {
    return { current: 1, needed: 1 };
  }
  return { current: Math.max(0, xp - thisLevel), needed: nextLevel - thisLevel };
}

function formatCountdown(endsAtIso: string): { label: string; done: boolean } {
  const endsAt = new Date(endsAtIso + 'Z').getTime();
  const remaining = Math.max(0, endsAt - Date.now());
  if (remaining <= 0) return { label: 'READY', done: true };
  const totalSeconds = Math.ceil(remaining / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return { label: `${h}h ${m.toString().padStart(2, '0')}m`, done: false };
  if (m > 0) return { label: `${m}m ${s.toString().padStart(2, '0')}s`, done: false };
  return { label: `${s}s`, done: false };
}

function isOnQuest(activity: string | null | undefined, endsAt: string | null | undefined): boolean {
  if (!activity || !activity.startsWith('exploring:')) return false;
  if (!endsAt) return false;
  return true;
}

export default function CompanionHUD({ walletAddress }: CompanionHUDProps) {
  const [companion, setCompanion] = useState<CompanionData | null>(null);
  const [starBalance, setStarBalance] = useState<number | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [locationVisible, setLocationVisible] = useState(false);
  const [tick, setTick] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [claimFeedback, setClaimFeedback] = useState<string | null>(null);
  const prevAwayRef = useRef<boolean>(false);
  // Tracks the last observed vitality snapshot so we can detect downward
  // crossings of the alert threshold. The visible alert state is derived
  // from the current snapshot, but `prevNeedsRef` lets us emit the
  // companion-need-alert event at most once per stat per cross.
  const prevNeedsRef = useRef<NeedStats | null>(null);

  const fetchStarBalance = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const res = await fetch(`/api/sanctuary/star/balance?wallet=${walletAddress}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setStarBalance(data.balance ?? 0);
      }
    } catch {
      // HUD is non-critical
    }
  }, [walletAddress]);

  const fetchCompanion = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const res = await fetch(`/api/sanctuary/companion?address=${walletAddress}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.companion) {
        const equipped = data.companion.equipped_cosmetics ?? null;
        setCompanion({
          nickname: data.companion.nickname,
          token_id: data.companion.token_id,
          mood: data.companion.mood,
          bond_score: data.companion.bond_score,
          total_xp: data.companion.total_xp ?? 0,
          level: data.companion.level ?? 1,
          companion_xp: data.companion.companion_xp ?? data.companion.xp ?? 0,
          companion_level: data.companion.companion_level ?? data.companion.level ?? 1,
          current_activity: data.companion.current_activity ?? 'lounging',
          activity_ends_at: data.companion.activity_ends_at ?? null,
          equipped_cosmetics: equipped,
          hunger: data.companion.hunger ?? null,
          happiness: data.companion.happiness ?? null,
          energy: data.companion.energy ?? null,
          is_sleeping: data.companion.is_sleeping ?? null,
          streak_current: data.companion.streak_current ?? null,
          streak_status: (data.companion.streak_status ?? null) as StreakStatus | null,
        });
        // Push the loadout into the Phaser scene so cosmetic layers render.
        EventBus.emit('companion-cosmetics', equipped);
      }
    } catch {
      // HUD is non-critical
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) return;
    fetchCompanion();
    fetchStarBalance();
  }, [walletAddress, fetchCompanion, fetchStarBalance]);

  useEffect(() => {
    const onQuestStarted = () => fetchCompanion();
    const onQuestClaimed = () => {
      fetchCompanion();
      fetchStarBalance();
    };
    const onStarChanged = () => fetchStarBalance();
    EventBus.on('companion-quest-started', onQuestStarted);
    EventBus.on('companion-quest-claimed', onQuestClaimed);
    EventBus.on('star-balance-changed', onStarChanged);
    return () => {
      EventBus.off('companion-quest-started', onQuestStarted);
      EventBus.off('companion-quest-claimed', onQuestClaimed);
      EventBus.off('star-balance-changed', onStarChanged);
    };
  }, [fetchCompanion, fetchStarBalance]);

  const onQuest = isOnQuest(companion?.current_activity, companion?.activity_ends_at);

  useEffect(() => {
    if (!onQuest) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [onQuest]);

  useEffect(() => {
    if (prevAwayRef.current !== onQuest) {
      EventBus.emit('companion-away', { away: onQuest });
      prevAwayRef.current = onQuest;
    }
  }, [onQuest]);

  useEffect(() => {
    if (!companion) return;
    const next: NeedStats = {
      hunger: companion.hunger,
      happiness: companion.happiness,
      energy: companion.energy,
    };
    const crossed = newlyCrossed(prevNeedsRef.current, next);
    if (crossed.length > 0) {
      EventBus.emit('companion-need-alert', { stats: crossed });
    }
    prevNeedsRef.current = next;
  }, [companion]);

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

  const openCompanionMenu = useCallback(() => {
    if (typeof window === 'undefined') return;
    EventBus.emit('companion-clicked', {
      screenX: window.innerWidth / 2,
      screenY: window.innerHeight / 2,
    });
  }, []);

  const handleClaim = useCallback(async () => {
    if (!walletAddress || !companion || claiming) return;
    setClaiming(true);
    setClaimFeedback(null);
    try {
      const walletAuthHeader = await getWalletAuthHeader(walletAddress);
      if (!walletAuthHeader) {
        setClaiming(false);
        return;
      }
      const res = await fetch('/api/sanctuary/companion/complete-activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-auth': walletAuthHeader,
        },
        body: JSON.stringify({ address: walletAddress, token_id: companion.token_id }),
      });
      const data = await res.json();
      if (data.success) {
        const bonus = data.starBonus ? ' ✨STAR' : '';
        setClaimFeedback(`REWARDS CLAIMED${bonus}`);
        EventBus.emit('companion-quest-claimed', { tokenId: companion.token_id });
        if (data.leveledUp && data.levelAfter) {
          EventBus.emit('companion-level-up', {
            tokenId: companion.token_id,
            levelBefore: data.levelBefore,
            levelAfter: data.levelAfter,
          });
        }
        await fetchCompanion();
        setTimeout(() => setClaimFeedback(null), 2500);
      } else {
        setClaimFeedback(data.error ?? 'Claim failed');
        setTimeout(() => setClaimFeedback(null), 2500);
      }
    } catch {
      setClaimFeedback('Claim failed');
      setTimeout(() => setClaimFeedback(null), 2500);
    } finally {
      setClaiming(false);
    }
  }, [walletAddress, companion, claiming, fetchCompanion]);

  if (!companion) return null;

  const displayName =
    companion.nickname || `Skrumpey #${companion.token_id}`;
  const statsInput: MoodStatInput | null =
    companion.hunger !== null && companion.happiness !== null && companion.energy !== null
      ? {
          hunger: companion.hunger,
          happiness: companion.happiness,
          energy: companion.energy,
          is_sleeping: companion.is_sleeping ?? 0,
        }
      : null;
  const effectiveMood = resolveCompanionMood(statsInput, companion.mood);
  const moodEmoji = MOOD_EMOJI[effectiveMood ?? ''] ?? '\u{1F438}';
  const bondPct = Math.min((companion.bond_score / 100) * 100, 100);
  const xp = xpProgress(companion.total_xp, companion.level);
  const xpPct = xp.needed > 0 ? Math.min((xp.current / xp.needed) * 100, 100) : 100;
  const compXp = companionXpProgress(companion.companion_xp, companion.companion_level);
  const compXpPct = compXp.needed > 0 ? Math.min((compXp.current / compXp.needed) * 100, 100) : 100;

  const needSnapshot: NeedStats = {
    hunger: companion.hunger,
    happiness: companion.happiness,
    energy: companion.energy,
  };
  const lowNeeds = lowStats(needSnapshot);
  const alertVisible = lowNeeds.length > 0;
  const alertGlyph = alertIcon(lowNeeds);
  const alertTooltip = describeNeeds(needSnapshot);

  const questName = onQuest
    ? companion.current_activity.slice('exploring:'.length)
    : null;
  const countdown = onQuest && companion.activity_ends_at
    ? formatCountdown(companion.activity_ends_at)
    : null;
  // touch tick so linter treats it as used for countdown re-render
  void tick;

  const streakLabel =
    companion.streak_current !== null && companion.streak_current > 0
      ? streakChipLabel(
          companion.streak_current,
          companion.streak_status ?? 'active',
        )
      : null;
  const streakPaused = companion.streak_status === 'paused';

  return (
    <>
      {/* STAR currency badge */}
      {starBalance !== null && (
        <div
          className="absolute top-2 right-2 z-20 flex items-center gap-1.5 bg-black/80 border border-[#ffd700]/50 rounded px-2.5 py-1 pointer-events-none select-none shadow-[0_0_8px_rgba(255,215,0,0.2)]"
          aria-label={`STAR balance: ${starBalance}`}
          title={`STAR balance: ${starBalance.toLocaleString()}`}
        >
          <span className="text-[10px] leading-none">⭐</span>
          <span className="text-[8px] text-[#ffd700] font-['Press_Start_2P'] tabular-nums">
            {starBalance.toLocaleString()}
          </span>
        </div>
      )}

      {/* [SWO_V2_SANCTUARY_STREAKS] Compassionate streak chip — identity, not
          power. Shows current day count + a "paused" indicator after a single
          missed day. Renders nothing until the companion endpoint emits a
          streak field (post v2.7 migration). */}
      {streakLabel && (
        <div
          className={`absolute top-2 right-24 z-20 flex items-center gap-1.5 bg-black/80 rounded px-2.5 py-1 pointer-events-none select-none border ${
            streakPaused
              ? 'border-[#9966ff]/50 shadow-[0_0_8px_rgba(153,102,255,0.2)]'
              : 'border-[#ff8855]/50 shadow-[0_0_8px_rgba(255,136,85,0.2)]'
          }`}
          aria-label={`Visit streak: ${streakLabel}`}
          title={
            streakPaused
              ? 'Streak paused — you missed a day. Visit again tomorrow to resume.'
              : `Visit streak: ${streakLabel}`
          }
        >
          <span
            className={`text-[8px] font-['Press_Start_2P'] tabular-nums ${
              streakPaused ? 'text-[#b099ff]' : 'text-[#ffaa66]'
            }`}
          >
            {streakLabel}
          </span>
        </div>
      )}

      {/* Need alert badge — soft, non-blocking, appears when any vitality
          stat drops below NEED_ALERT_THRESHOLD. Click jumps to the
          companion radial menu so the user can feed/pet/talk. The slot is
          absolutely positioned so toggling visibility never relayouts the
          rest of the HUD. */}
      {alertVisible && (
        <button
          type="button"
          onClick={openCompanionMenu}
          className="absolute top-12 right-2 z-20 flex items-center justify-center w-7 h-7 bg-black/80 border border-[#ff6644]/70 rounded-full text-base leading-none pointer-events-auto select-none shadow-[0_0_8px_rgba(255,102,68,0.35)] hover:bg-[#3a1410]/80 hover:border-[#ff8866] transition-colors animate-pulse"
          aria-label={`Companion needs attention: ${alertTooltip}`}
          title={`${alertTooltip} — tap to interact`}
        >
          <span aria-hidden="true">{alertGlyph}</span>
        </button>
      )}

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
          <div className="flex items-center gap-1.5">
            <span className="text-[6px] text-[#ffd700] w-6 text-right" title="Training level (per Skrumpey)">
              T{companion.companion_level}
            </span>
            <div
              className="w-28 h-1 bg-[#1a1a2e] rounded-full overflow-hidden border border-[#2a2a4e]"
              title={`Training XP: ${companion.companion_xp}`}
            >
              <div
                className="h-full rounded-full bg-[#ffd700] transition-all duration-500"
                style={{ width: `${compXpPct}%` }}
              />
            </div>
            <span className="text-[6px] text-gray-500 w-14 text-right tabular-nums">
              {compXp.needed > 0 ? `${compXp.current}/${compXp.needed}` : 'MAX'}
            </span>
          </div>
        </div>
      </div>

      {/* Quest away-state panel */}
      {onQuest && questName && countdown && (
        <div className="absolute top-14 left-2 z-20 bg-black/90 border border-[#9966ff]/50 rounded px-3 py-2 pointer-events-auto select-none max-w-[200px] shadow-[0_0_12px_rgba(153,102,255,0.25)]">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs">{countdown.done ? '✨' : '💤'}</span>
            <span className="text-[7px] text-[#9966ff] font-['Press_Start_2P'] uppercase tracking-wider">
              On Quest
            </span>
          </div>
          <p className="text-[8px] text-white font-['Press_Start_2P'] leading-tight mb-1 truncate">
            {questName}
          </p>
          <p className={`text-[10px] font-['Press_Start_2P'] mb-1.5 ${countdown.done ? 'text-[#44ff88]' : 'text-[#ffd700]'}`}>
            {countdown.done ? '✨ READY' : `⏱ ${countdown.label}`}
          </p>
          {countdown.done ? (
            <button
              onClick={handleClaim}
              disabled={claiming}
              className="w-full py-1.5 bg-[#44ff88]/20 border border-[#44ff88]/60 rounded text-[#44ff88] text-[7px] font-['Press_Start_2P'] uppercase tracking-wider hover:bg-[#44ff88]/30 disabled:opacity-40 transition-colors"
              aria-label="Claim quest rewards"
            >
              {claiming ? '...' : 'Claim'}
            </button>
          ) : (
            <div className="text-[6px] text-gray-500 text-center leading-tight">
              Skrumpey is busy
            </div>
          )}
          {claimFeedback && (
            <p className="text-[6px] text-[#ffd700] mt-1 text-center">{claimFeedback}</p>
          )}
        </div>
      )}

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
