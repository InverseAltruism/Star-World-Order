'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import dynamic from 'next/dynamic';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';
import { resolveCompanionMood, type MoodStatInput } from '@/lib/sanctuary/mood';
import { describeNeeds, lowStats, type NeedStats } from '@/lib/sanctuary/needs';
import {
  greetingForMood,
  lastVisitedPhrase,
  type CozyMood,
} from '@/lib/sanctuary/companionGreeting';
import { MOOD_EMOJI } from '@/components/sanctuary/overlays/CompanionHUD';
import EventBus from '@/components/sanctuary/EventBus';
import { emitCompanionVfx } from '@/lib/sanctuary/vfxEvents';
import {
  bondMilestoneBanner,
  crossedBondMilestones,
  highestMilestone,
  readLastCelebratedMilestone,
  writeLastCelebratedMilestone,
  type BondMilestone,
} from '@/lib/sanctuary/bondMilestones';
import {
  freshestVisitIso,
  readLastVisit,
  writeLastVisit,
} from '@/lib/sanctuary/lastVisitStore';
import {
  actionAriaDisabled,
  actionStateClass,
  bondHint,
  bondProgress,
  resolveActionState,
  type ActionId,
} from '@/lib/sanctuary/companionShell';

const SanctuaryContent = dynamic(() => import('./SanctuaryContent'), { ssr: false });

interface CompanionData {
  token_id: number;
  nickname: string | null;
  mood: string | null;
  bond_score: number;
  total_xp: number;
  level: number;
  companion_xp: number;
  companion_level: number;
  hunger: number | null;
  happiness: number | null;
  energy: number | null;
  is_sleeping: number | null;
  stats_updated_at: string | null;
  image_url: string | null;
  constellation: string | null;
  current_activity: string;
  activity_ends_at: string | null;
}

interface SpriteReaction {
  id: number;
  kind: ActionId;
}

interface StatDelta {
  id: number;
  stat: 'hunger' | 'happiness' | 'energy';
  delta: number;
}

const ACTION_REACTION_EMOJI: Record<ActionId, string[]> = {
  feed: ['🍎', '✨'],
  pet: ['💗', '💗', '✨'],
  talk: ['💬', '💕'],
  sleep: ['💤', '🌙'],
  play: ['⭐', '✨', '💫'],
};

interface JournalEntry {
  id: number;
  entry_type: string;
  content: string;
  created_at: string;
}

interface ChatLine {
  id: number;
  role: 'user' | 'companion';
  content: string;
}

const ACTIONS: { id: ActionId; icon: string; label: string }[] = [
  { id: 'feed', icon: '🍎', label: 'Feed' },
  { id: 'pet', icon: '🐾', label: 'Pet' },
  { id: 'talk', icon: '💬', label: 'Talk' },
  { id: 'sleep', icon: '💤', label: 'Sleep' },
  { id: 'play', icon: '🎾', label: 'Play' },
];

const NEED_LABEL: Record<'hunger' | 'happiness' | 'energy', string> = {
  hunger: 'Hungry — feed me!',
  happiness: 'Lonely — let’s talk',
  energy: 'Sleepy — needs rest',
};

interface BondCelebration {
  id: number;
  milestone: BondMilestone;
  message: string;
}

const MOOD_LABEL: Record<string, string> = {
  happy: 'Happy',
  excited: 'Excited',
  calm: 'Calm',
  sleepy: 'Sleepy',
  curious: 'Curious',
  sleeping: 'Sleeping',
  hungry: 'Hungry',
  lonely: 'Lonely',
  idle: 'Idle',
};

const BOND_NOTCHES: readonly number[] = [25, 50, 75, 100];

function StatBar({
  label,
  value,
  color,
  pulse,
  delta,
}: {
  label: string;
  value: number;
  color: string;
  pulse?: boolean;
  delta?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-1 relative">
      <div className="flex items-center justify-between text-[8px]">
        <span className="text-gray-400 uppercase tracking-wider font-['Press_Start_2P']">
          {label}
        </span>
        <span className="text-white tabular-nums" style={{ color }}>
          {Math.round(value)}
        </span>
      </div>
      <div
        className={`h-2 bg-[#1a1a2e] rounded-full overflow-hidden border border-[#2a2a4e] ${
          pulse ? 'companion-stat-bar-pulse' : ''
        }`}
        style={pulse ? ({ '--bar-pulse-color': color } as React.CSSProperties) : undefined}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      {typeof delta === 'number' && delta !== 0 && (
        <span
          className="companion-floating-text absolute right-0 -top-1 text-[8px] font-['Press_Start_2P'] pointer-events-none tabular-nums"
          style={{ color, textShadow: `0 0 6px ${color}` }}
        >
          {delta > 0 ? `+${delta}` : `${delta}`}
        </span>
      )}
    </div>
  );
}

function BondBar({ score }: { score: number }) {
  const progress = bondProgress(score);
  return (
    <div
      className="companion-bond-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress.score)}
      aria-label="Bond progress"
    >
      <div
        className="companion-bond-bar__fill"
        style={{ width: `${progress.pct}%` }}
      />
      <div className="companion-bond-bar__notches" aria-hidden="true">
        {BOND_NOTCHES.map((m) => (
          <span
            key={m}
            className={`companion-bond-bar__notch ${
              progress.score >= m ? 'companion-bond-bar__notch--reached' : ''
            }`}
            style={{ left: `${m}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function navigateToWorld() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.set('v', '2');
  params.set('world', '1');
  const url = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({}, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function CompanionView() {
  const { address, isConnected } = useAccount();
  const [companion, setCompanion] = useState<CompanionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [interacting, setInteracting] = useState<ActionId | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLines, setChatLines] = useState<ChatLine[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [spriteReactions, setSpriteReactions] = useState<SpriteReaction[]>([]);
  const [statDeltas, setStatDeltas] = useState<StatDelta[]>([]);
  const [recentlyChanged, setRecentlyChanged] = useState<
    Set<'hunger' | 'happiness' | 'energy'>
  >(() => new Set());
  const [bondCelebration, setBondCelebration] = useState<BondCelebration | null>(null);
  // Snapshot of the localStorage "last opened" marker captured the moment we
  // first see this token id this session — so the cozy line below can refer
  // to the *previous* page-open rather than the one happening right now (we
  // overwrite the marker immediately afterward; see the effect below).
  const [localVisitMs, setLocalVisitMs] = useState<number | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionIdRef = useRef(0);
  const deltaIdRef = useRef(0);
  const celebrationIdRef = useRef(0);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCompanion = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/sanctuary/companion?address=${address}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setCompanion(
          data.companion
            ? ({
                token_id: data.companion.token_id,
                nickname: data.companion.nickname,
                mood: data.companion.mood,
                bond_score: data.companion.bond_score ?? 0,
                total_xp: data.companion.total_xp ?? 0,
                level: data.companion.level ?? 1,
                companion_xp: data.companion.companion_xp ?? data.companion.xp ?? 0,
                companion_level:
                  data.companion.companion_level ?? data.companion.level ?? 1,
                hunger: data.companion.hunger ?? null,
                happiness: data.companion.happiness ?? null,
                energy: data.companion.energy ?? null,
                is_sleeping: data.companion.is_sleeping ?? null,
                stats_updated_at: data.companion.stats_updated_at ?? null,
                image_url: data.companion.image_url ?? null,
                constellation: data.companion.constellation ?? null,
                current_activity: data.companion.current_activity ?? 'lounging',
                activity_ends_at: data.companion.activity_ends_at ?? null,
              } as CompanionData)
            : null,
        );
      }
    } catch {
      // Non-critical
    }
  }, [address]);

  const fetchJournal = useCallback(
    async (tokenId: number) => {
      if (!address) return;
      try {
        const res = await fetch(
          `/api/sanctuary/companion/journal?address=${address}&token_id=${tokenId}&page=1&limit=3`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.entries)) {
          setJournal(data.entries.slice(0, 3));
        }
      } catch {
        // Non-critical
      }
    },
    [address],
  );

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchCompanion().finally(() => setLoading(false));
  }, [address, fetchCompanion]);

  useEffect(() => {
    if (companion?.token_id !== undefined) {
      fetchJournal(companion.token_id);
    }
  }, [companion?.token_id, fetchJournal]);

  // Capture the previous "you opened the screen at" marker, then immediately
  // refresh it for the next page-open. The captured value is what feeds the
  // cozy `lastVisitedPhrase` line — overwriting first would always show "you
  // just popped in" no matter how long it had been.
  useEffect(() => {
    const tokenId = companion?.token_id;
    if (tokenId === undefined) return;
    setLocalVisitMs(readLastVisit(tokenId));
    writeLastVisit(tokenId, Date.now());
  }, [companion?.token_id]);

  const flashFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 1800);
  }, []);

  const triggerSpriteReaction = useCallback((kind: ActionId) => {
    const id = ++reactionIdRef.current;
    setSpriteReactions((prev) => [...prev, { id, kind }]);
    setTimeout(() => {
      setSpriteReactions((prev) => prev.filter((r) => r.id !== id));
    }, 1100);
  }, []);

  const triggerBondCelebration = useCallback(
    (milestone: BondMilestone, name: string) => {
      const id = ++celebrationIdRef.current;
      const message = bondMilestoneBanner(milestone, name);
      setBondCelebration({ id, milestone, message });
      if (typeof window !== 'undefined') {
        emitCompanionVfx(EventBus, {
          kind: 'heart',
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
          durationMs: 2200,
          source: `bond-milestone-${milestone}`,
        });
      }
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
      celebrationTimer.current = setTimeout(() => {
        setBondCelebration((prev) => (prev && prev.id === id ? null : prev));
      }, 2500);
    },
    [],
  );

  const pushStatDelta = useCallback(
    (stat: 'hunger' | 'happiness' | 'energy', delta: number) => {
      if (delta === 0) return;
      const id = ++deltaIdRef.current;
      setStatDeltas((prev) => [...prev, { id, stat, delta }]);
      setRecentlyChanged((prev) => {
        const next = new Set(prev);
        next.add(stat);
        return next;
      });
      setTimeout(() => {
        setStatDeltas((prev) => prev.filter((d) => d.id !== id));
        setRecentlyChanged((prev) => {
          if (!prev.has(stat)) return prev;
          const next = new Set(prev);
          next.delete(stat);
          return next;
        });
      }, 1000);
    },
    [],
  );

  const handleAction = useCallback(
    async (action: ActionId) => {
      if (!address || !companion || interacting) return;
      if (companion.is_sleeping === 1 && action !== 'sleep') {
        const name = companion.nickname || `Skrumpey #${companion.token_id}`;
        flashFeedback(`shhh — ${name} is sleeping`);
        return;
      }
      setInteracting(action);
      try {
        const authHeader = await getWalletAuthHeader(address);
        if (!authHeader) {
          flashFeedback('Wallet signature required');
          return;
        }
        const res = await fetch('/api/sanctuary/companion/interact', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-wallet-auth': authHeader,
          },
          body: JSON.stringify({
            walletAddress: address,
            token_id: companion.token_id,
            action,
          }),
        });
        const data = await res.json();
        if (data.success && data.companion) {
          const prevSnapshot = {
            hunger: companion.hunger,
            happiness: companion.happiness,
            energy: companion.energy,
          };
          const next = {
            hunger: data.companion.hunger ?? companion.hunger,
            happiness: data.companion.happiness ?? companion.happiness,
            energy: data.companion.energy ?? companion.energy,
          };
          const prevBond = companion.bond_score;
          const nextBond = data.companion.bond_score ?? prevBond;
          setCompanion((prev) =>
            prev
              ? {
                  ...prev,
                  hunger: next.hunger,
                  happiness: next.happiness,
                  energy: next.energy,
                  is_sleeping:
                    data.companion.is_sleeping ?? prev.is_sleeping,
                  bond_score: nextBond,
                  mood: data.companion.mood ?? prev.mood,
                  stats_updated_at:
                    data.companion.stats_updated_at ?? prev.stats_updated_at,
                }
              : prev,
          );
          const lastCelebrated = readLastCelebratedMilestone(companion.token_id);
          const crossings = crossedBondMilestones(
            prevBond,
            nextBond,
            lastCelebrated,
          );
          const top = highestMilestone(crossings);
          if (top !== null) {
            triggerBondCelebration(
              top,
              companion.nickname || `Skrumpey #${companion.token_id}`,
            );
            writeLastCelebratedMilestone(companion.token_id, top);
          }
          for (const k of ['hunger', 'happiness', 'energy'] as const) {
            const a = prevSnapshot[k];
            const b = next[k];
            if (typeof a === 'number' && typeof b === 'number') {
              const d = Math.round(b - a);
              if (Math.abs(d) >= 2) pushStatDelta(k, d);
            }
          }
          triggerSpriteReaction(action);
          flashFeedback(`${action.toUpperCase()} ✓`);
          fetchJournal(companion.token_id);
        } else {
          flashFeedback(data.error ?? 'Action failed');
        }
      } catch {
        flashFeedback('Network error');
      } finally {
        setInteracting(null);
      }
    },
    [address, companion, interacting, flashFeedback, fetchJournal, triggerSpriteReaction, pushStatDelta, triggerBondCelebration],
  );

  useEffect(() => {
    return () => {
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    };
  }, []);

  const handleSendChat = useCallback(async () => {
    if (!address || !companion || chatBusy) return;
    const message = chatDraft.trim();
    if (!message) return;
    setChatBusy(true);
    setChatDraft('');
    setChatLines((prev) => [
      ...prev,
      { id: Date.now(), role: 'user', content: message },
    ]);
    try {
      const authHeader = await getWalletAuthHeader(address);
      if (!authHeader) {
        flashFeedback('Wallet signature required');
        setChatBusy(false);
        return;
      }
      const res = await fetch('/api/sanctuary/companion/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-auth': authHeader,
        },
        body: JSON.stringify({
          address,
          token_id: companion.token_id,
          message,
        }),
      });
      const data = await res.json();
      if (data.success && data.companionReply?.content) {
        setChatLines((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'companion',
            content: data.companionReply.content,
          },
        ]);
      }
    } catch {
      flashFeedback('Chat failed');
    } finally {
      setChatBusy(false);
    }
  }, [address, companion, chatBusy, chatDraft, flashFeedback]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-[#00f7ff] font-['Press_Start_2P'] text-xs animate-pulse">
          Loading companion...
        </span>
      </div>
    );
  }

  if (!isConnected || !companion) {
    return <SanctuaryContent />;
  }

  const statsInput: MoodStatInput | null =
    companion.hunger !== null &&
    companion.happiness !== null &&
    companion.energy !== null
      ? {
          hunger: companion.hunger,
          happiness: companion.happiness,
          energy: companion.energy,
          is_sleeping: companion.is_sleeping ?? 0,
        }
      : null;
  const effectiveMood = resolveCompanionMood(statsInput, companion.mood) ?? 'idle';
  const moodEmoji = MOOD_EMOJI[effectiveMood] ?? '\u{1F438}';
  const moodLabel = MOOD_LABEL[effectiveMood] ?? 'Calm';

  const needs: NeedStats = {
    hunger: companion.hunger,
    happiness: companion.happiness,
    energy: companion.energy,
  };
  const lows = lowStats(needs);
  const acuteNeed = lows[0] ?? null;

  const isSleeping = companion.is_sleeping === 1;
  const moodAnimClass = isSleeping
    ? 'sanctuary-sleepy'
    : effectiveMood === 'happy' || effectiveMood === 'excited'
      ? 'sanctuary-happy'
      : 'sanctuary-idle';

  const displayName =
    companion.nickname || `Skrumpey #${companion.token_id}`;

  const greeting = greetingForMood(
    displayName,
    effectiveMood as CozyMood,
    isSleeping,
  );
  const lastVisit = lastVisitedPhrase(
    freshestVisitIso(localVisitMs, companion.stats_updated_at),
  );

  const bond = bondProgress(companion.bond_score);
  const bondNudge = bondHint(bond, displayName);

  return (
    <div className="companion-shell" data-testid="companion-shell">
      <div className="companion-shell-grid">
        {/* Zone: header + bond */}
        <section
          data-zone="header"
          data-testid="companion-zone-header"
          className="companion-zone companion-zone--header"
          aria-label="Companion header"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0 space-y-2">
              <h1
                className="text-lg text-[#ffd700] tracking-widest font-['Press_Start_2P'] truncate"
                style={{ textShadow: '0 0 20px rgba(255, 215, 0, 0.3)' }}
              >
                {displayName.toUpperCase()}
              </h1>
              <p className="text-[#bb88ff] text-[10px] italic leading-snug">
                {greeting}
              </p>
              <BondBar score={bond.score} />
              <div className="flex items-center justify-between text-[8px] text-gray-400 font-['Press_Start_2P'] tracking-wider">
                <span>Lv.{companion.level}</span>
                <span>Train {companion.companion_level}</span>
                <span>Bond {Math.round(bond.score)}</span>
              </div>
              {bondNudge && (
                <p className="text-[8px] text-[#ffd700]/80 italic">{bondNudge}</p>
              )}
              {lastVisit && (
                <p className="text-gray-500 text-[8px]">{lastVisit}</p>
              )}
            </div>
          </div>
        </section>

        {/* Zone: viewport (creature) */}
        <section
          data-zone="viewport"
          data-testid="companion-zone-viewport"
          className="companion-zone companion-zone--viewport flex flex-col items-center justify-center"
          aria-label="Companion viewport"
        >
          <div className="relative">
            <div
              className="absolute inset-0 pointer-events-none companion-cozy-stars"
              aria-hidden="true"
            >
              <span className="cozy-star" style={{ left: '12%', top: '18%' }} />
              <span className="cozy-star" style={{ left: '78%', top: '14%' }} />
              <span className="cozy-star" style={{ left: '22%', top: '82%' }} />
              <span className="cozy-star" style={{ left: '88%', top: '70%' }} />
              <span className="cozy-star" style={{ left: '50%', top: '4%' }} />
            </div>
            <div
              className={`relative ${moodAnimClass}`}
              data-testid="companion-sprite"
            >
              <div className="w-44 h-44 sm:w-56 sm:h-56 rounded-2xl overflow-hidden border-4 border-[#2a2a4e] bg-[#0a0a15] shadow-[0_0_24px_rgba(0,247,255,0.18)]">
                {companion.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={companion.image_url}
                    alt={displayName}
                    className="w-full h-full object-cover image-rendering-pixelated"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-7xl">
                    🐸
                  </div>
                )}
              </div>
              <span
                className="absolute -top-2 -right-2 bg-black/90 border border-[#9966ff]/60 rounded-full px-2 py-1 text-lg shadow-[0_0_10px_rgba(153,102,255,0.4)]"
                aria-label={`Mood: ${moodLabel}`}
                title={`Mood: ${moodLabel}`}
              >
                {moodEmoji}
              </span>

              {bondCelebration && (
                <>
                  <div
                    key={`banner-${bondCelebration.id}`}
                    className="companion-bond-banner absolute left-1/2 -top-10 z-20 pointer-events-none whitespace-nowrap rounded border border-[#ff66aa]/70 bg-black/85 px-3 py-1 text-[8px] font-['Press_Start_2P'] tracking-wider text-[#ff99cc] shadow-[0_0_12px_rgba(255,102,170,0.45)]"
                    role="status"
                    aria-live="polite"
                  >
                    {bondCelebration.message}
                  </div>
                  <div
                    key={`hearts-${bondCelebration.id}`}
                    className="absolute inset-0 pointer-events-none z-10"
                    aria-hidden="true"
                  >
                    {Array.from({ length: 10 }).map((_, i) => {
                      const angle = (i / 10) * Math.PI * 2;
                      const distance = 60 + (i % 3) * 12;
                      const dx = Math.cos(angle) * distance;
                      const dy = Math.sin(angle) * distance - 20;
                      const rot = (i % 2 === 0 ? 1 : -1) * (15 + (i % 4) * 5);
                      return (
                        <span
                          key={i}
                          className="heart-particle"
                          style={
                            {
                              '--dx': `${dx.toFixed(0)}px`,
                              '--dy': `${dy.toFixed(0)}px`,
                              '--rot': `${rot}deg`,
                              '--delay': `${i * 35}ms`,
                            } as React.CSSProperties
                          }
                        >
                          {i % 3 === 0 ? '💖' : i % 3 === 1 ? '💗' : '✨'}
                        </span>
                      );
                    })}
                  </div>
                </>
              )}

              {spriteReactions.length > 0 && (
                <div
                  className="absolute inset-0 pointer-events-none flex items-center justify-center"
                  aria-hidden="true"
                >
                  {spriteReactions.map((r) => {
                    const glyphs = ACTION_REACTION_EMOJI[r.kind];
                    return (
                      <div key={r.id} className="absolute inset-0">
                        {glyphs.map((g, i) => {
                          const angle = (i / glyphs.length) * Math.PI * 2;
                          const radius = 36;
                          const dx = Math.cos(angle) * radius;
                          const dy = Math.sin(angle) * radius - 12;
                          return (
                            <span
                              key={i}
                              className="absolute text-2xl companion-floating-text"
                              style={{
                                left: `calc(50% + ${dx}px)`,
                                top: `calc(50% + ${dy}px)`,
                                animationDelay: `${i * 60}ms`,
                              }}
                            >
                              {g}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          {isSleeping && (
            <p
              className="mt-3 text-center text-[8px] text-[#66ccff] font-['Press_Start_2P'] tracking-wider"
              role="status"
            >
              💤 Shhh — they&apos;re dreaming.
            </p>
          )}
        </section>

        {/* Zone: needs panel */}
        <section
          data-zone="needs"
          data-testid="companion-zone-needs"
          className="companion-zone space-y-3"
          aria-label="Companion needs"
        >
          <h2 className="text-[#ffd700] text-[10px] tracking-wider font-['Press_Start_2P']">
            NEEDS
          </h2>
          {acuteNeed && (
            <div
              className="border border-[#ff6644]/60 bg-[#3a1410]/60 rounded px-3 py-2 text-center"
              role="status"
            >
              <p className="text-[9px] text-[#ff8866] font-['Press_Start_2P'] uppercase tracking-wider">
                {NEED_LABEL[acuteNeed]}
              </p>
              {lows.length > 1 && (
                <p className="text-[7px] text-gray-400 mt-1">
                  {describeNeeds(needs)}
                </p>
              )}
            </div>
          )}
          <div className="space-y-3">
            <StatBar
              label="Hunger"
              value={companion.hunger ?? 0}
              color="#ff9944"
              pulse={recentlyChanged.has('hunger')}
              delta={statDeltas.find((d) => d.stat === 'hunger')?.delta}
            />
            <StatBar
              label="Happiness"
              value={companion.happiness ?? 0}
              color="#ff66aa"
              pulse={recentlyChanged.has('happiness')}
              delta={statDeltas.find((d) => d.stat === 'happiness')?.delta}
            />
            <StatBar
              label="Energy"
              value={companion.energy ?? 0}
              color="#66ccff"
              pulse={recentlyChanged.has('energy')}
              delta={statDeltas.find((d) => d.stat === 'energy')?.delta}
            />
          </div>
        </section>

        {/* Zone: action dock */}
        <section
          data-zone="actions"
          data-testid="companion-zone-actions"
          className="companion-zone space-y-3"
          aria-label="Companion actions"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-[#ffd700] text-[10px] tracking-wider font-['Press_Start_2P']">
              ACTION DOCK
            </h2>
            {feedback && (
              <span
                className="text-[8px] text-[#ffd700] font-['Press_Start_2P']"
                role="status"
              >
                {feedback}
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {ACTIONS.map((a) => {
              const state = resolveActionState({
                id: a.id,
                interacting,
                isSleeping,
              });
              const muted = state === 'sleep-locked';
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleAction(a.id)}
                  disabled={
                    state === 'disabled' ||
                    state === 'busy' ||
                    state === 'sleep-locked'
                  }
                  aria-label={muted ? `${a.label} (sleeping)` : a.label}
                  aria-disabled={actionAriaDisabled(state)}
                  data-state={state}
                  title={muted ? 'Companion is sleeping — wait until they wake' : a.label}
                  className={`companion-action-btn ${actionStateClass(state)}`}
                >
                  <span className="companion-action-btn__icon">
                    {state === 'busy' ? '⏳' : a.icon}
                  </span>
                  <span className="companion-action-btn__label">{a.label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={navigateToWorld}
            className="w-full px-4 py-2 bg-[#00f7ff]/15 border-2 border-[#00f7ff]/60 rounded-lg text-[#00f7ff] text-[9px] font-['Press_Start_2P'] tracking-widest uppercase hover:bg-[#00f7ff]/25 hover:border-[#00f7ff] transition-colors shadow-[0_0_12px_rgba(0,247,255,0.25)]"
            aria-label="Enter the Sanctuary world"
          >
            ✦ Enter Sanctuary ✦
          </button>
        </section>

        {/* Zone: journal teaser + chat */}
        <section
          data-zone="journal"
          data-testid="companion-zone-journal"
          className="companion-zone space-y-3"
          aria-label="Companion journal and chat"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[#ffd700] text-[10px] tracking-wider font-['Press_Start_2P']">
                JOURNAL
              </h2>
              <span className="text-[7px] text-gray-500">last 3</span>
            </div>
            {journal.length === 0 ? (
              <p className="text-gray-500 text-[8px] italic">
                No journal entries yet — interact to start a story.
              </p>
            ) : (
              <ul className="space-y-2">
                {journal.map((entry) => (
                  <li
                    key={entry.id}
                    className="text-[8px] text-gray-300 leading-relaxed border-l-2 border-[#9966ff]/40 pl-2"
                  >
                    {entry.content}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-[#2a2a4e]/50 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[#ffd700] text-[10px] tracking-wider font-['Press_Start_2P']">
                CHAT
              </h2>
              <button
                type="button"
                onClick={() => setChatOpen((v) => !v)}
                className="text-[8px] text-[#9966ff] hover:text-[#bb88ff] font-['Press_Start_2P']"
              >
                {chatOpen ? 'CLOSE' : 'OPEN'}
              </button>
            </div>
            {chatOpen && (
              <div className="space-y-2">
                <div className="bg-[#0a0a15] border border-[#2a2a4e] rounded p-2 max-h-32 overflow-y-auto space-y-1">
                  {chatLines.length === 0 ? (
                    <p className="text-gray-500 text-[8px] italic">
                      Say hello to {displayName}.
                    </p>
                  ) : (
                    chatLines.map((line) => (
                      <p
                        key={line.id}
                        className={`text-[8px] ${
                          line.role === 'user'
                            ? 'text-[#bb88ff] text-right'
                            : 'text-gray-300'
                        }`}
                      >
                        <span className="opacity-60">
                          {line.role === 'user' ? 'You: ' : `${displayName}: `}
                        </span>
                        {line.content}
                      </p>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleSendChat();
                      }
                    }}
                    maxLength={500}
                    placeholder={`Talk to ${displayName}...`}
                    className="flex-1 bg-[#0a0a15] border border-[#2a2a4e] rounded px-2 py-1 text-[9px] text-white placeholder-gray-600 focus:border-[#9966ff]/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSendChat()}
                    disabled={!chatDraft.trim() || chatBusy}
                    className="px-3 py-1 bg-[#9966ff]/20 border border-[#9966ff]/50 rounded text-[#9966ff] text-[8px] font-['Press_Start_2P'] hover:bg-[#9966ff]/30 disabled:opacity-40"
                  >
                    SEND
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
