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
  timeOfDayPrefix,
  type CozyMood,
} from '@/lib/sanctuary/companionGreeting';
import { MOOD_EMOJI } from '@/components/sanctuary/overlays/CompanionHUD';
import CompanionActionButton from '@/components/sanctuary/CompanionActionButton';
import CompanionChip from '@/components/sanctuary/CompanionChip';
import { COMPANION_ACTIONS } from '@/lib/sanctuary/companionAction';
import EventBus from '@/components/sanctuary/EventBus';
import type { ResourceSnapshot } from '@/lib/sanctuary/walletResources';

type ActionGate = { usesLeft: number; dailyLimit: number; readyAt: number };
import { emitCompanionVfx } from '@/lib/sanctuary/vfxEvents';

// Interactable overlays surfaced directly on the Companion view so mobile
// players can reach quests/expeditions, the shop, traits and the journal
// without walking the Phaser world. Each returns null until opened via its
// EventBus event. Minigames stay in the world hub — they need the Phaser canvas.
const QuestsV2Panel = dynamic(() => import('@/components/sanctuary/overlays/QuestsV2Panel'), { ssr: false });
const MinigameArcade = dynamic(() => import('@/components/sanctuary/overlays/MinigameArcade'), { ssr: false });

// What each quick action gives the shared resource pool (mirrors ACTION_REPLENISH
// in lib/sanctuary/walletResources.ts) — surfaced on the buttons so players see
// what they get. Quick actions only GIVE resources; quests/games spend them.
const ACTION_EFFECT: Record<string, { txt: string; color: string }> = {
  feed: { txt: '+25 food', color: '#ff9944' },
  pet: { txt: '+15 joy', color: '#ff66aa' },
  talk: { txt: '+15 joy', color: '#ff66aa' },
  play: { txt: '+20 joy', color: '#ff66aa' },
  sleep: { txt: '+30 rest', color: '#66ccff' },
};
const ExpeditionDialog = dynamic(() => import('@/components/sanctuary/overlays/ExpeditionDialog'), { ssr: false });
const ShopDialog = dynamic(() => import('@/components/sanctuary/overlays/ShopDialog'), { ssr: false });
const TraitsOverlay = dynamic(() => import('@/components/sanctuary/overlays/TraitsOverlay'), { ssr: false });
const SanctuaryWindow = dynamic(() => import('@/components/sanctuary/SanctuaryWindow'), { ssr: false });

type OwnedSkrumpey = { tokenId: number; name?: string; image?: string; isStar?: boolean };

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
  kind: QuickAction;
}

interface StatDelta {
  id: number;
  stat: 'hunger' | 'happiness' | 'energy';
  delta: number;
}

const ACTION_REACTION_EMOJI: Record<QuickAction, string[]> = {
  feed: ['🍎', '✨'],
  pet: ['💗', '💗', '✨'],
  talk: ['💬', '💕'],
  sleep: ['💤', '🌙'],
  play: ['⭐', '✨', '💫'],
};

// Pixel-art VFX sprite class names that float on top of action reactions.
// See public/sanctuary/ui/vfx/manifest.json for art traceability.
const ACTION_VFX_SPRITES: Record<QuickAction, string[]> = {
  feed: ['vfx-snack-apple', 'vfx-snack-berry', 'vfx-snack-cookie'],
  pet: ['vfx-heart-pip', 'vfx-heart-pip', 'vfx-sparkle-4pt'],
  talk: ['vfx-sparkle-4pt'],
  sleep: ['vfx-sleepy-z'],
  play: ['vfx-sparkle-burst', 'vfx-sparkle-4pt'],
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

type QuickAction = 'feed' | 'pet' | 'talk' | 'sleep' | 'play';

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

// Turn the Track-0 reward breakdown into a cozy "why that mattered" line, so a
// tap reads as a relationship moment instead of a silent stat bump. Discovering
// the preference IS the gameplay (doctrine rule 1 / 6).
function actionFeedbackMessage(
  name: string,
  action: string,
  preference?: string,
  needBoosted?: boolean,
): string {
  const verbed: Record<string, string> = {
    feed: 'the snack', pet: 'the cuddle', talk: 'the chat', play: 'playing', sleep: 'the rest',
  };
  const thing = verbed[action] ?? 'that';
  const base: Record<string, string> = {
    loved: `${name} LOVED ${thing}! 💖`,
    liked: `${name} liked ${thing} 😊`,
    neutral: `${name} appreciates ${thing}`,
    disliked: `${name} wasn't keen on ${thing} 😕`,
    hated: `${name} really disliked ${thing} 💔`,
  };
  let msg = (preference && base[preference]) || `${action.toUpperCase()} ✓`;
  if (needBoosted) msg += ' — right when they needed it!';
  return msg;
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
  const { address, isConnected, status } = useAccount();
  const [companion, setCompanion] = useState<CompanionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [interacting, setInteracting] = useState<QuickAction | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [starBalance, setStarBalance] = useState<number | null>(null);
  // Shared per-wallet resources + per-action gates (uses left + cooldown).
  const [resources, setResources] = useState<ResourceSnapshot | null>(null);
  const [gates, setGates] = useState<Record<string, ActionGate>>({});
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  // In-place view switch (no popups): the main area shows the companion, or a
  // rendered Quests / Shop panel. Traits flip the card; journal expands inline.
  const [view, setView] = useState<'companion' | 'quests' | 'shop' | 'games'>('companion');
  const [flipped, setFlipped] = useState(false);
  const [journalExpanded, setJournalExpanded] = useState(false);
  const [starPop, setStarPop] = useState<number | null>(null);
  const starPopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [owned, setOwned] = useState<OwnedSkrumpey[]>([]);
  const [ownedLoaded, setOwnedLoaded] = useState(false);
  const [switching, setSwitching] = useState<number | null>(null);
  // Chat flips over the right column (mirrors the TRAITS flip on the left).
  const [chatFlipped, setChatFlipped] = useState(false);
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
        // Keep more than 3 so the inline "expand" view has history to show
        // (the collapsed card still renders just the latest 3).
        const res = await fetch(
          `/api/sanctuary/companion/journal?address=${address}&token_id=${tokenId}&page=1&limit=25`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && Array.isArray(data.entries)) {
          setJournal(data.entries.slice(0, 25));
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

  const triggerSpriteReaction = useCallback((kind: QuickAction) => {
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
      // Emit a `heart` VFX through the shared contract so the V2 world
      // CompanionMenu (and any other listener) renders a matching burst.
      // Coordinates are best-effort screen-center for the screen surface;
      // the V2 world listener resolves its own anchoring per scene.
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

  // STAR balance for the HUD — fetched on open and kept in sync with the
  // shared `star-balance-changed` event the shop/gacha emit. Surfacing the
  // balance + "+⭐" on earn is how STAR farming becomes legible.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sanctuary/star/balance?wallet=${address}`);
        const data = await res.json();
        if (!cancelled && data.success && typeof data.balance === 'number') {
          setStarBalance(data.balance);
        }
      } catch {
        /* non-critical */
      }
    })();
    const onChange = (p: { balance?: number }) => {
      if (typeof p?.balance === 'number') setStarBalance(p.balance);
    };
    EventBus.on('star-balance-changed', onChange);
    return () => {
      cancelled = true;
      EventBus.off('star-balance-changed', onChange);
    };
  }, [address]);

  const popStar = useCallback((amount: number) => {
    setStarPop(amount);
    if (starPopTimer.current) clearTimeout(starPopTimer.current);
    starPopTimer.current = setTimeout(() => setStarPop(null), 2000);
  }, []);

  // Ingest a {resources, actions} payload (from GET /resources or an action
  // response). cooldownMs is converted to an absolute readyAt so a 1s tick can
  // render a live countdown without refetching.
  const ingestResourceState = useCallback(
    (data: {
      resources?: ResourceSnapshot;
      actions?: Record<string, { usesLeft: number; dailyLimit: number; cooldownMs: number }>;
    }) => {
      if (data.resources) setResources(data.resources);
      if (data.actions) {
        const base = Date.now();
        const next: Record<string, ActionGate> = {};
        for (const [k, v] of Object.entries(data.actions)) {
          next[k] = { usesLeft: v.usesLeft, dailyLimit: v.dailyLimit, readyAt: base + v.cooldownMs };
        }
        setGates(next);
      }
    },
    [],
  );

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sanctuary/resources?address=${address}`);
        const data = await res.json();
        if (!cancelled && data.success) ingestResourceState(data);
      } catch {
        /* non-critical */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, ingestResourceState]);

  // Drive the live cooldown countdown on the action buttons.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Companion switcher — list the wallet's owned Skrumpey and make a different
  // one active. Answers "how do I switch my Skrumpey" (there was no UI for it).
  const openSwitcher = useCallback(async () => {
    setSwitcherOpen(true);
    if (ownedLoaded || !address) return;
    try {
      const res = await fetch(`/api/sanctuary/companion/list-owned?address=${address}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.owned)) setOwned(data.owned);
    } catch {
      /* non-critical */
    } finally {
      setOwnedLoaded(true);
    }
  }, [address, ownedLoaded]);

  const doSwitch = useCallback(
    async (tid: number) => {
      if (!address || switching) return;
      setSwitching(tid);
      try {
        const authHeader = await getWalletAuthHeader(address);
        if (!authHeader) {
          flashFeedback('Wallet signature required');
          return;
        }
        const res = await fetch('/api/sanctuary/companion/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-wallet-auth': authHeader },
          body: JSON.stringify({ walletAddress: address, tokenId: tid }),
        });
        const data = await res.json();
        if (data.success) {
          setSwitcherOpen(false);
          // fetchCompanion updates the companion in place — do NOT flip the
          // `loading` flag here (fetchCompanion doesn't clear it, which left the
          // view stuck on "Loading companion…" requiring a hard refresh).
          await fetchCompanion();
        } else {
          flashFeedback(data.error ?? 'Switch failed');
        }
      } catch {
        flashFeedback('Network error');
      } finally {
        setSwitching(null);
      }
    },
    [address, switching, flashFeedback, fetchCompanion],
  );

  const handleAction = useCallback(
    async (action: QuickAction) => {
      if (!address || !companion || interacting) return;
      // Pre-emptively block sleep-action attempts with a warm message rather
      // than firing a request that the API will reject with HTTP 409. The
      // server still enforces this — this is just kinder UX.
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
        // Quick actions now fill the SHARED per-wallet resource pool (gated by
        // per-action cooldown + 24h limit) and still deepen the active
        // companion's bond. [SWO_V2_SANCTUARY_ECONOMY_REDESIGN]
        const res = await fetch('/api/sanctuary/resources/action', {
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
        if (data.success) {
          const prevRes = resources;
          ingestResourceState(data);
          // Bond celebration from the returned bondGain (server clamps 0–100).
          const prevBond = companion.bond_score;
          const nextBond = Math.max(0, Math.min(100, prevBond + (data.bondGain ?? 0)));
          setCompanion((prev) => (prev ? { ...prev, bond_score: nextBond } : prev));
          const lastCelebrated = readLastCelebratedMilestone(companion.token_id);
          const top = highestMilestone(
            crossedBondMilestones(prevBond, nextBond, lastCelebrated),
          );
          if (top !== null) {
            triggerBondCelebration(
              top,
              companion.nickname || `Skrumpey #${companion.token_id}`,
            );
            writeLastCelebratedMilestone(companion.token_id, top);
          }
          // Floating "+N" near each resource bar that moved.
          if (prevRes && data.resources) {
            for (const k of ['hunger', 'happiness', 'energy'] as const) {
              const d = Math.round((data.resources[k] ?? 0) - (prevRes[k] ?? 0));
              if (Math.abs(d) >= 2) pushStatDelta(k, d);
            }
          }
          triggerSpriteReaction(action);
          flashFeedback(
            actionFeedbackMessage(
              companion.nickname || `Skrumpey #${companion.token_id}`,
              action,
              data.preference,
              data.needBoosted,
            ),
          );
          if (typeof data.bonusStar === 'number' && data.bonusStar > 0) {
            setStarBalance((b) => (b === null ? b : b + data.bonusStar));
            popStar(data.bonusStar);
          }
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
    [address, companion, interacting, flashFeedback, fetchJournal, triggerSpriteReaction, pushStatDelta, triggerBondCelebration, popStar, resources, ingestResourceState],
  );

  useEffect(() => {
    return () => {
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
      if (starPopTimer.current) clearTimeout(starPopTimer.current);
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

  // Hold the loading state while wagmi is still (re)connecting on first paint,
  // otherwise `address` is briefly undefined and we'd flash the V1 SanctuaryContent
  // (the old star map) before the companion view appears.
  if (loading || status === 'connecting' || status === 'reconnecting') {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-[#00f7ff] font-['Press_Start_2P'] text-xs animate-pulse">
          Loading companion...
        </span>
      </div>
    );
  }

  // Connected wallet, no active companion → reuse existing pick-a-Skrumpey UX.
  // Disconnected wallets also fall through (SanctuaryContent renders the gate).
  // Pass `embedded` so V1's "SANCTUARY HAS MOVED → ?v=2" banner doesn't show
  // here — it would link straight back into CompanionView and loop.
  if (!isConnected || !companion) {
    return <SanctuaryContent embedded />;
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
  const timePrefix = timeOfDayPrefix(new Date().getHours());
  // Prefer the local "page-open" marker over `stats_updated_at` whenever it
  // is fresher, so the cozy line refreshes on every open even when the
  // player just lurks without interacting.
  const lastVisit = lastVisitedPhrase(
    freshestVisitIso(localVisitMs, companion.stats_updated_at),
  );

  return (
    <div className="space-y-6">
      {/* Top bar: switch companion (left) + STAR balance (right). The HUD is
          always visible so "how do I farm stars" has an on-screen answer, and
          tapping it jumps to the Shop. The +⭐ pop fires on a bonus drop. */}
      <div className="flex items-center justify-between">
        <button
          onClick={openSwitcher}
          aria-label="Switch your active Skrumpey"
          className="flex items-center gap-2 rounded-full border border-[#9966ff]/50 bg-[#9966ff]/10 px-4 py-2 text-[#bb88ff] transition-colors hover:bg-[#9966ff]/20 active:bg-[#9966ff]/30"
        >
          <span className="text-base leading-none" aria-hidden="true">⇄</span>
          <span className="text-[9px] font-['Press_Start_2P']">SWITCH</span>
        </button>
        <button
          onClick={() => setView('shop')}
          aria-label={`STAR balance${starBalance !== null ? `: ${starBalance}` : ''} — open shop`}
          className="relative flex items-center gap-2 rounded-full border border-[#ffd700]/50 bg-[#ffd700]/10 px-4 py-2 text-[#ffd700] transition-colors hover:bg-[#ffd700]/20 active:bg-[#ffd700]/30"
        >
          <span className="text-base leading-none" aria-hidden="true">⭐</span>
          <span className="text-xs tabular-nums font-['Press_Start_2P']">
            {starBalance ?? '—'}
          </span>
          {starPop !== null && (
            <span
              key={starPop + '-' + Date.now()}
              className="companion-floating-text absolute -top-3 right-2 text-[10px] font-['Press_Start_2P'] text-[#fff3b0] pointer-events-none"
            >
              +{starPop}⭐
            </span>
          )}
        </button>
      </div>

      {/* Header */}
      <div className="text-center space-y-1">
        <h1
          className="text-lg text-[#ffd700] tracking-widest font-['Press_Start_2P']"
          style={{ textShadow: '0 0 20px rgba(255, 215, 0, 0.3)' }}
        >
          {displayName.toUpperCase()}
        </h1>
        <p className="text-[#88ccff] text-[10px] italic px-4 leading-snug">
          {timePrefix}
        </p>
        <p className="text-[#bb88ff] text-[10px] italic px-4 leading-snug">
          {greeting}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <CompanionChip tone="gold" compact>
            Lv {companion.level}
          </CompanionChip>
          <CompanionChip tone="purple" compact>
            Training {companion.companion_level}
          </CompanionChip>
          <CompanionChip tone="pink" compact>
            Bond {Math.round(companion.bond_score)}
          </CompanionChip>
        </div>
        {lastVisit && (
          <p className="text-gray-500 text-[8px]">
            {lastVisit}
          </p>
        )}
      </div>

      {view !== 'companion' ? (
        <div className="sanctuary-panel-in swo-panel-frame p-3 space-y-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setView('companion')}
              className="flex items-center gap-1 rounded-lg border border-[#00f7ff]/50 bg-[#00f7ff]/10 px-3 py-2 text-[10px] font-['Press_Start_2P'] text-[#00f7ff] transition-colors hover:bg-[#00f7ff]/20 active:bg-[#00f7ff]/30"
            >
              ‹ {companion.nickname || `#${companion.token_id}`}
            </button>
            <span className="text-[9px] text-[#ffd700] font-['Press_Start_2P'] tracking-wider">
              {view === 'quests' ? '🗺️ QUESTS' : view === 'games' ? '🎮 GAMES' : '🛍️ SHOP'}
            </span>
          </div>
          {view === 'quests' && (
            <QuestsV2Panel walletAddress={address} tokenId={companion.token_id} />
          )}
          {view === 'games' && (
            <MinigameArcade walletAddress={address} tokenId={companion.token_id} />
          )}
          {view === 'shop' && (
            <ShopDialog inline walletAddress={address} tokenId={companion.token_id} />
          )}
        </div>
      ) : (
        <>
      <div className="grid md:grid-cols-2 gap-6">
        {/* Sprite + needs */}
        <div className="chrome-panel p-6 space-y-4 relative">
          {/* Cozy pixel-art corner flourishes (decorative). See
              public/sanctuary/ui/chrome/manifest.json. */}
          <span className="chrome-flourish-a" aria-hidden="true" />
          <span className="chrome-flourish-b" aria-hidden="true" />
          {/* Traits back-face — flips over the card (see the TRAITS button under
              the resource bars). */}
          {flipped && (
            <div className="sanctuary-flip-in absolute inset-0 z-20 flex flex-col rounded-2xl bg-[#0a0520]/98 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] text-[#bb88ff] font-['Press_Start_2P']">TRAITS</span>
                <button
                  onClick={() => setFlipped(false)}
                  aria-label="Flip back to your companion"
                  className="flex h-8 items-center gap-1 rounded border border-[#9966ff]/50 bg-[#9966ff]/10 px-2 text-[8px] text-[#bb88ff] font-['Press_Start_2P'] hover:bg-[#9966ff]/20"
                >
                  ↺ BACK
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <TraitsOverlay inline walletAddress={address} tokenId={companion.token_id} />
              </div>
            </div>
          )}
          <div className="flex justify-center">
            <div className="relative">
              {/* Cozy ambient: a few twinkling stars behind the sprite. Pure
                  decoration; pointer-events disabled so it never intercepts
                  clicks on the sprite or the mood badge. */}
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
                <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-2xl overflow-hidden border-4 border-[#2a2a4e] bg-[#0a0a15] shadow-[0_0_24px_rgba(0,247,255,0.18)] relative">
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
                  {/* Sleepy state stamp — pixel-art ZZZ overlay. The
                      manifest pairs this with the sleepy_z drift particles
                      below so the sleeping panel feels distinct. */}
                  {isSleeping && (
                    <span
                      className="vfx-sleepy-zzz-stamp"
                      data-testid="companion-vfx-sleepy"
                      aria-hidden="true"
                    />
                  )}
                  {/* Drifting Z particles — three staggered instances. */}
                  {isSleeping && (
                    <>
                      <span
                        className="vfx-sprite vfx-sleepy-z"
                        style={{ left: '70%', top: '55%', animationDelay: '0s' }}
                        aria-hidden="true"
                      />
                      <span
                        className="vfx-sprite vfx-sleepy-z"
                        style={{ left: '78%', top: '40%', animationDelay: '0.9s' }}
                        aria-hidden="true"
                      />
                      <span
                        className="vfx-sprite vfx-sleepy-z"
                        style={{ left: '64%', top: '32%', animationDelay: '1.8s' }}
                        aria-hidden="true"
                      />
                    </>
                  )}
                  {/* Very-happy aura — only renders when mood is happy/excited
                      AND bond ≥ 50 AND not sleeping. Composite of heart_glow
                      + sparkle_burst at four cozy positions. */}
                  {!isSleeping &&
                    (effectiveMood === 'happy' || effectiveMood === 'excited') &&
                    companion.bond_score >= 50 && (
                      <div
                        className="vfx-very-happy-aura"
                        data-testid="companion-vfx-very-happy"
                        aria-hidden="true"
                      >
                        <span className="vfx-sprite vfx-heart-glow vfx-aura-tl" />
                        <span className="vfx-sprite vfx-sparkle-burst vfx-aura-tr" />
                        <span className="vfx-sprite vfx-heart-pip vfx-aura-bl" />
                        <span className="vfx-sprite vfx-sparkle-4pt vfx-aura-br" />
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

                {/* Bond-milestone celebration: brief banner above the sprite
                    plus heart confetti drifting outward. Auto-clears after
                    ≤2.5s via celebrationTimer. */}
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
                        // Deterministic spread around the sprite — angles
                        // evenly distributed so the burst always feels full,
                        // with a small per-particle delay so they don't all
                        // fire on exactly the same frame.
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
                      {/* Pixel-art celebration garnish — paired with the
                          emoji burst so the milestone moment includes the
                          cozy art language too. Six sprites at fixed
                          radii. */}
                      {Array.from({ length: 6 }).map((_, i) => {
                        const angle = ((i + 0.5) / 6) * Math.PI * 2;
                        const distance = 70;
                        const dx = Math.cos(angle) * distance;
                        const dy = Math.sin(angle) * distance - 16;
                        const rot = (i % 2 === 0 ? 1 : -1) * 12;
                        const cls = i % 2 === 0
                          ? 'vfx-sparkle-burst'
                          : 'vfx-heart-glow';
                        return (
                          <span
                            key={`vfx-${i}`}
                            className={`vfx-sprite heart-particle ${cls}`}
                            data-testid="companion-vfx-celebrate"
                            style={
                              {
                                '--dx': `${dx.toFixed(0)}px`,
                                '--dy': `${dy.toFixed(0)}px`,
                                '--rot': `${rot}deg`,
                                '--delay': `${100 + i * 60}ms`,
                              } as React.CSSProperties
                            }
                          />
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Floating reaction emojis layered above the sprite. Each
                    reaction is short-lived (≤1.1s) and absolutely positioned
                    so it never relayouts the card. Multiple emoji per
                    reaction gives a small flourish per action. */}
                {spriteReactions.length > 0 && (
                  <div
                    className="absolute inset-0 pointer-events-none flex items-center justify-center"
                    aria-hidden="true"
                  >
                    {spriteReactions.map((r) => {
                      const glyphs = ACTION_REACTION_EMOJI[r.kind];
                      const vfxSprites = ACTION_VFX_SPRITES[r.kind];
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
                          {/* Pixel-art VFX layer — small snack/heart/sparkle
                              sprites that float upward alongside the emoji,
                              giving every action a tactile pixel-art beat. */}
                          {vfxSprites.map((cls, i) => {
                            const offset = ((i % 3) - 1) * 18;
                            return (
                              <span
                                key={`vfx-${i}`}
                                className={`vfx-sprite vfx-snack-float ${cls}`}
                                data-testid="companion-vfx-action"
                                style={
                                  {
                                    left: `calc(50% - 4px + ${offset}px)`,
                                    top: 'calc(50% + 30px)',
                                    animationDelay: `${i * 90}ms`,
                                    '--dx': `${offset * 0.5}px`,
                                  } as React.CSSProperties
                                }
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

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
            <div className="flex items-center justify-between">
              <span className="text-[8px] uppercase tracking-wider text-gray-500 font-['Press_Start_2P']">
                Resources
              </span>
              <span className="text-[7px] text-gray-600">shared across your Skrumpey · spent on quests &amp; games</span>
            </div>
            <StatBar
              label="Hunger"
              value={resources?.hunger ?? companion.hunger ?? 0}
              color="#ff9944"
              pulse={recentlyChanged.has('hunger')}
              delta={statDeltas.find((d) => d.stat === 'hunger')?.delta}
            />
            <StatBar
              label="Happiness"
              value={resources?.happiness ?? companion.happiness ?? 0}
              color="#ff66aa"
              pulse={recentlyChanged.has('happiness')}
              delta={statDeltas.find((d) => d.stat === 'happiness')?.delta}
            />
            <StatBar
              label="Energy"
              value={resources?.energy ?? companion.energy ?? 0}
              color="#66ccff"
              pulse={recentlyChanged.has('energy')}
              delta={statDeltas.find((d) => d.stat === 'energy')?.delta}
            />
            <button
              onClick={() => setFlipped(true)}
              aria-label="View this Skrumpey's traits"
              className="w-full rounded-lg border border-[#9966ff]/40 bg-[#9966ff]/10 py-2 text-[9px] text-[#bb88ff] font-['Press_Start_2P'] transition-colors hover:bg-[#9966ff]/20 active:bg-[#9966ff]/30"
            >
              ✨ TRAITS ⟳
            </button>
          </div>

          {isSleeping && (
            <div
              className="space-y-1 rounded-lg border border-[#66ccff]/40 bg-[#66ccff]/10 px-3 py-2 text-center"
              role="status"
            >
              <p className="text-[9px] text-[#66ccff] font-['Press_Start_2P'] tracking-wider">
                💤 Shhh — they&apos;re resting.
              </p>
              <p className="text-[8px] leading-relaxed text-gray-300">
                They&apos;ll wake on their own once rested. A full sleep clears
                tiredness and can bring a dream reward. Other actions are paused
                until they wake — waking them early costs a little bond.
              </p>
            </div>
          )}
        </div>

        {/* Actions + Journal */}
        <div className="relative space-y-4">
          {/* Chat back-face — flips over the whole right column (mirrors the
              TRAITS flip on the left card). */}
          {chatFlipped && (
            <div className="sanctuary-flip-in absolute inset-0 z-20 flex flex-col rounded-2xl bg-[#0a0520]/98 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] text-[#ffd700] font-['Press_Start_2P']">💬 CHAT · {displayName}</span>
                <button
                  onClick={() => setChatFlipped(false)}
                  aria-label="Flip back to your companion"
                  className="flex h-8 items-center gap-1 rounded border border-[#9966ff]/50 bg-[#9966ff]/10 px-2 text-[8px] text-[#bb88ff] font-['Press_Start_2P'] hover:bg-[#9966ff]/20"
                >
                  ↺ BACK
                </button>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-hidden">
                <div className="flex-1 space-y-1 overflow-y-auto rounded border border-[#2a2a4e] bg-[#0a0a15] p-2">
                  {chatLines.length === 0 ? (
                    <p className="text-[8px] italic text-gray-500">Say hello to {displayName}.</p>
                  ) : (
                    chatLines.map((line) => (
                      <p
                        key={line.id}
                        className={`text-[8px] ${line.role === 'user' ? 'text-right text-[#bb88ff]' : 'text-gray-300'}`}
                      >
                        <span className="opacity-60">{line.role === 'user' ? 'You: ' : `${displayName}: `}</span>
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
                      if (e.key === 'Enter') { e.preventDefault(); void handleSendChat(); }
                    }}
                    maxLength={500}
                    placeholder={`Talk to ${displayName}...`}
                    className="flex-1 rounded border border-[#2a2a4e] bg-[#0a0a15] px-2 py-1 text-[9px] text-white placeholder-gray-600 focus:border-[#9966ff]/60 focus:outline-none"
                  />
                  <button
                    onClick={() => void handleSendChat()}
                    disabled={!chatDraft.trim() || chatBusy}
                    className="rounded border border-[#9966ff]/50 bg-[#9966ff]/20 px-3 py-1 text-[8px] text-[#9966ff] font-['Press_Start_2P'] hover:bg-[#9966ff]/30 disabled:opacity-40"
                  >
                    SEND
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="pixel-card p-4 space-y-3">
            <span className="chrome-dust" aria-hidden="true" />
            <div className="flex items-center justify-between">
              <h2 className="text-[#ffd700] text-[10px] tracking-wider font-['Press_Start_2P']">
                QUICK ACTIONS
              </h2>
              <span className="text-[7px] text-gray-500">refill resources · limited per day</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {COMPANION_ACTIONS.map((a) => {
                const gate = gates[a.id];
                const cooldownSeconds = gate
                  ? Math.max(0, Math.ceil((gate.readyAt - nowMs) / 1000))
                  : 0;
                const outOfUses = gate ? gate.usesLeft <= 0 : false;
                const eff = ACTION_EFFECT[a.id];
                return (
                  <CompanionActionButton
                    key={a.id}
                    action={a.id}
                    label={a.label}
                    busy={interacting}
                    isSleeping={isSleeping}
                    cooldownSeconds={cooldownSeconds}
                    effectHint={
                      <span style={{ color: eff.color }}>{eff.txt}</span>
                    }
                    onActivate={
                      outOfUses
                        ? () => flashFeedback('No uses left today — back tomorrow!')
                        : handleAction
                    }
                    badgeSlot={
                      cooldownSeconds === 0 && gate ? (
                        <span
                          className={`tabular-nums ${outOfUses ? 'text-gray-500' : 'text-[#44ff88]'}`}
                        >
                          {gate.usesLeft}/{gate.dailyLimit}
                        </span>
                      ) : undefined
                    }
                  />
                );
              })}
            </div>
            {feedback && (
              <p
                className="text-[8px] text-[#ffd700] text-center font-['Press_Start_2P']"
                role="status"
              >
                {feedback}
              </p>
            )}
          </div>

          <div className="pixel-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[#ffd700] text-[10px] tracking-wider font-['Press_Start_2P']">
                JOURNAL
              </h2>
              {journal.length > 0 && (
                <button
                  onClick={() => setJournalExpanded((v) => !v)}
                  className="text-[7px] text-[#9966ff] hover:text-[#bb88ff] font-['Press_Start_2P']"
                  aria-label={journalExpanded ? 'Collapse journal' : 'Expand journal'}
                >
                  {journalExpanded ? '▴ LESS' : `▾ ALL (${journal.length})`}
                </button>
              )}
            </div>
            {journal.length === 0 ? (
              // Empty-state journal: pixel-art stickers anchor the cozy
              // text so a brand-new player sees craft, not a blank card.
              // The moon sticker swaps in while the companion is sleeping
              // for a quieter mood.
              <div
                className="vfx-journal-empty"
                data-testid="companion-vfx-journal-empty"
              >
                <span
                  className={
                    isSleeping ? 'vfx-sticker-moon' : 'vfx-sticker-paw'
                  }
                  aria-hidden="true"
                />
                <p className="text-gray-500 text-[8px] italic text-center">
                  {isSleeping
                    ? 'Shhh — they’re dreaming up tomorrow’s story.'
                    : 'No journal entries yet — interact to start a story.'}
                </p>
                <span
                  className={
                    isSleeping ? 'vfx-sticker-paw' : 'vfx-sticker-moon'
                  }
                  aria-hidden="true"
                />
              </div>
            ) : (
              <ul
                className={`space-y-2 ${
                  journalExpanded ? 'max-h-48 overflow-y-auto overscroll-contain pr-1' : ''
                }`}
              >
                {(journalExpanded ? journal : journal.slice(0, 3)).map((entry, idx) => {
                  // Rotate three sticker glyphs through the (max-3) entry
                  // list so each line gets a pixel-art bullet.
                  const stickerCls =
                    idx % 3 === 0
                      ? 'vfx-sticker-star'
                      : idx % 3 === 1
                        ? 'vfx-sticker-paw'
                        : 'vfx-sticker-moon';
                  return (
                    <li
                      key={entry.id}
                      className="text-[8px] text-gray-300 leading-relaxed border-l-2 border-[#9966ff]/40 pl-2"
                    >
                      <span
                        className={`vfx-sticker-inline ${stickerCls}`}
                        aria-hidden="true"
                      />
                      {entry.content}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <button
            onClick={() => setChatFlipped(true)}
            className="pixel-card flex w-full items-center justify-between p-4 text-left transition-transform hover:translate-y-[-2px] active:scale-[0.99]"
          >
            <span className="text-[#ffd700] text-[10px] tracking-wider font-['Press_Start_2P']">💬 CHAT</span>
            <span className="text-[8px] text-[#9966ff] font-['Press_Start_2P']">
              {chatLines.length > 0 ? `${chatLines.length} msgs ⟳` : `talk to ${displayName} ⟳`}
            </span>
          </button>
        </div>
      </div>

      {/* EXPLORE — switches the main area to an in-place panel (no popups). */}
      <div className="pixel-card p-4 space-y-3">
        <h2 className="text-[#ffd700] text-[10px] tracking-wider font-['Press_Start_2P']">
          EXPLORE
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setView('quests')}
            aria-label="Open quests"
            className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-lg border border-[#9966ff]/40 bg-[#9966ff]/10 px-2 py-3 text-center transition-colors hover:bg-[#9966ff]/20 active:bg-[#9966ff]/30"
          >
            <span className="text-2xl leading-none" aria-hidden="true">🗺️</span>
            <span className="text-[8px] leading-tight text-[#bb88ff] font-['Press_Start_2P']">QUESTS</span>
          </button>
          <button
            onClick={() => setView('games')}
            aria-label="Open the minigame arcade"
            className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-lg border border-[#00f7ff]/40 bg-[#00f7ff]/10 px-2 py-3 text-center transition-colors hover:bg-[#00f7ff]/20 active:bg-[#00f7ff]/30"
          >
            <span className="text-2xl leading-none" aria-hidden="true">🎮</span>
            <span className="text-[8px] leading-tight text-[#66e0ff] font-['Press_Start_2P']">GAMES</span>
          </button>
          <button
            onClick={() => setView('shop')}
            aria-label="Open the shop"
            className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-lg border border-[#ffd700]/40 bg-[#ffd700]/10 px-2 py-3 text-center transition-colors hover:bg-[#ffd700]/20 active:bg-[#ffd700]/30"
          >
            <span className="text-2xl leading-none" aria-hidden="true">🛍️</span>
            <span className="text-[8px] leading-tight text-[#ffd700] font-['Press_Start_2P']">SHOP</span>
          </button>
        </div>
      </div>

      {/* Full Phaser world — not released yet. Minigames are available now via
          the GAMES section above; free-roam/multiplayer is coming soon. */}
      <div className="flex justify-center">
        <div
          className="w-full cursor-not-allowed select-none rounded-lg border-2 border-dashed border-[#00f7ff]/30 bg-[#00f7ff]/5 px-6 py-4 text-center text-[10px] font-['Press_Start_2P'] uppercase tracking-widest text-[#00f7ff]/50 sm:w-auto"
          aria-disabled="true"
          title="The full free-roam Sanctuary world is coming soon."
        >
          ✦ Sanctuary World — Coming Soon ✦
        </div>
      </div>
        </>
      )}

      {/* Expedition sub-dialog — opened from the inline Quest Board. */}
      <div className="fixed inset-0 z-40 pointer-events-none">
        <ExpeditionDialog walletAddress={address} tokenId={companion.token_id} />
      </div>

      {switcherOpen && (
        <SanctuaryWindow
          title="SWITCH SKRUMPEY"
          subtitle="Choose who to spend time with"
          accent="#9966ff"
          onClose={() => setSwitcherOpen(false)}
          testId="companion-switcher"
        >
          {!ownedLoaded ? (
            <p className="py-6 text-center text-[10px] text-gray-400">Loading your Skrumpey…</p>
          ) : owned.length === 0 ? (
            <p className="py-6 text-center text-[10px] text-gray-400">
              No Skrumpey found in this wallet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {owned.map((o) => {
                const isActive = o.tokenId === companion.token_id;
                return (
                  <button
                    key={o.tokenId}
                    onClick={() => !isActive && doSwitch(o.tokenId)}
                    disabled={isActive || switching !== null}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition-colors disabled:opacity-60 ${
                      isActive
                        ? 'border-[#44ff88]/60 bg-[#44ff88]/10'
                        : 'border-[#2a2a4e] hover:bg-white/5 active:bg-white/10'
                    }`}
                  >
                    <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-[#2a2a4e] bg-[#0a0a15]">
                      {o.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={o.image}
                          alt=""
                          className="image-rendering-pixelated h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl">🐸</div>
                      )}
                      {o.isStar && <span className="absolute right-0 top-0 text-[10px]">⭐</span>}
                    </div>
                    <span className="w-full truncate text-[8px] text-gray-300">
                      {o.name || `#${o.tokenId}`}
                    </span>
                    {isActive ? (
                      <span className="text-[7px] text-[#44ff88] font-['Press_Start_2P']">ACTIVE</span>
                    ) : switching === o.tokenId ? (
                      <span className="text-[7px] text-[#bb88ff]">switching…</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </SanctuaryWindow>
      )}
    </div>
  );
}
