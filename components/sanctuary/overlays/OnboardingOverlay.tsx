'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import EventBus from '@/components/sanctuary/EventBus';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';

type OnboardingStep =
  | 'select-companion'
  | 'enter-room'
  | 'interact-npc'
  | 'open-quest-board'
  | 'try-minigame'
  | 'done';

interface PlayerState {
  wallet_address: string;
  intro_completed: number;
  total_visits: number;
  onboarding_step: OnboardingStep | null;
  onboarding_skipped: number;
}

interface NPCClickPayload {
  npcId: string;
  npcName: string;
  zone: string;
  dialogue: string;
  screenX: number;
  screenY: number;
}

interface StepConfig {
  step: OnboardingStep;
  title: string;
  body: string;
  hint: string;
}

const STEP_ORDER: OnboardingStep[] = [
  'select-companion',
  'enter-room',
  'interact-npc',
  'open-quest-board',
  'try-minigame',
  'done',
];

const STEP_INDEX = new Map<OnboardingStep, number>(STEP_ORDER.map((s, i) => [s, i]));

const STEPS: Record<Exclude<OnboardingStep, 'done'>, StepConfig> = {
  'select-companion': {
    step: 'select-companion',
    title: 'Choose your companion',
    body: 'Pick a Skrumpey to walk with you. Open the companion menu and select one — they will follow you everywhere.',
    hint: 'Companion selection',
  },
  'enter-room': {
    step: 'enter-room',
    title: 'Step into a room',
    body: 'Doorways glow gold. Walk to one and press [E] to enter — Observatory, Hot Springs, and more all have keepers waiting.',
    hint: 'Walk to a glowing doorway',
  },
  'interact-npc': {
    step: 'interact-npc',
    title: 'Meet a keeper',
    body: 'Inside any room, click on an NPC to talk. They have stories, quests, and minigames ready for you.',
    hint: 'Click any NPC inside the room',
  },
  'open-quest-board': {
    step: 'open-quest-board',
    title: 'Open the quest board',
    body: 'Press [Q] or click the Quest Tracker to see every active quest. Daily errands, weekly adventures — all in one place.',
    hint: 'Press [Q] for quests',
  },
  'try-minigame': {
    step: 'try-minigame',
    title: 'Play your first minigame',
    body: 'Talk to an arcade keeper and launch a minigame. Star Catch, Memory Match, Forge Hammer — your high score earns STAR.',
    hint: 'Launch any minigame',
  },
};

export default function OnboardingOverlay({
  walletAddress,
  tokenId,
}: {
  walletAddress: string | undefined;
  tokenId: number | null;
}) {
  const [state, setState] = useState<PlayerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const loadedForRef = useRef<string | null>(null);
  const completedStepsRef = useRef<Set<OnboardingStep>>(new Set());

  const loadState = useCallback(async () => {
    if (!walletAddress) return null;
    try {
      const res = await fetch(`/api/sanctuary/player-state?address=${walletAddress}`);
      const data = await res.json();
      if (data.success) {
        setState(data.state as PlayerState | null);
        return data.state as PlayerState | null;
      }
    } catch {
      // Non-critical
    }
    return null;
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress) return;
    if (loadedForRef.current === walletAddress) return;
    loadedForRef.current = walletAddress;
    loadState();
  }, [walletAddress, loadState]);

  const persistStep = useCallback(
    async (next: OnboardingStep) => {
      if (!walletAddress) return;
      setBusy(true);
      try {
        const authHeader = await getWalletAuthHeader(walletAddress);
        if (!authHeader) return;
        const res = await fetch('/api/sanctuary/player-state', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-wallet-auth': authHeader,
          },
          body: JSON.stringify({
            address: walletAddress,
            action: 'set-onboarding-step',
            step: next,
          }),
        });
        const data = await res.json();
        if (data.success && data.state) setState(data.state as PlayerState);
      } catch {
        // Non-critical
      } finally {
        setBusy(false);
      }
    },
    [walletAddress],
  );

  // When the Spawn Fox intro completes for the first time, kick off the
  // tutorial by writing the first onboarding step. Existing players who
  // never had an onboarding_step recorded keep onboarding_step=null and
  // never see the overlay.
  useEffect(() => {
    const handleIntroComplete = async () => {
      const latest = await loadState();
      if (!latest) return;
      if (latest.onboarding_skipped) return;
      if (latest.onboarding_step) return;
      await persistStep('select-companion');
    };
    EventBus.on('intro-completed', handleIntroComplete);
    return () => {
      EventBus.off('intro-completed', handleIntroComplete);
    };
  }, [loadState, persistStep]);

  const advance = useCallback(
    (fromStep: OnboardingStep) => {
      if (completedStepsRef.current.has(fromStep)) return;
      completedStepsRef.current.add(fromStep);
      const idx = STEP_INDEX.get(fromStep);
      if (idx === undefined) return;
      const next = STEP_ORDER[idx + 1] ?? 'done';
      persistStep(next);
    },
    [persistStep],
  );

  const currentStep: OnboardingStep | null = (() => {
    if (!state) return null;
    if (state.onboarding_skipped) return 'done';
    if (!state.intro_completed) return null;
    return state.onboarding_step ?? 'select-companion';
  })();

  // Auto-detect completion of step 1 when companion exists.
  useEffect(() => {
    if (currentStep === 'select-companion' && tokenId !== null) {
      advance('select-companion');
    }
  }, [currentStep, tokenId, advance]);

  // Listen for engine events that satisfy steps.
  useEffect(() => {
    if (!currentStep || currentStep === 'done') return;

    const handleRoomEntered = () => {
      if (currentStep === 'enter-room') advance('enter-room');
    };
    const handleNPCClick = (payload: NPCClickPayload) => {
      if (currentStep !== 'interact-npc') return;
      // Spawn Fox is the intro NPC; require talking to a different NPC to count.
      if (payload.npcId === 'spawn-fox') return;
      advance('interact-npc');
    };
    const handleQuestBoard = () => {
      if (currentStep === 'open-quest-board') advance('open-quest-board');
    };
    const handleMinigameLaunch = () => {
      if (currentStep === 'try-minigame') advance('try-minigame');
    };

    EventBus.on('room-entered', handleRoomEntered);
    EventBus.on('door-entered', handleRoomEntered);
    EventBus.on('npc-clicked', handleNPCClick);
    EventBus.on('quest-board-open', handleQuestBoard);
    EventBus.on('minigame-launch', handleMinigameLaunch);
    EventBus.on('minigame-complete', handleMinigameLaunch);
    return () => {
      EventBus.off('room-entered', handleRoomEntered);
      EventBus.off('door-entered', handleRoomEntered);
      EventBus.off('npc-clicked', handleNPCClick);
      EventBus.off('quest-board-open', handleQuestBoard);
      EventBus.off('minigame-launch', handleMinigameLaunch);
      EventBus.off('minigame-complete', handleMinigameLaunch);
    };
  }, [currentStep, advance]);

  const handleSkip = useCallback(async () => {
    if (!walletAddress) return;
    setBusy(true);
    try {
      const authHeader = await getWalletAuthHeader(walletAddress);
      if (!authHeader) return;
      const res = await fetch('/api/sanctuary/player-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-auth': authHeader,
        },
        body: JSON.stringify({ address: walletAddress, action: 'skip-onboarding' }),
      });
      const data = await res.json();
      if (data.success && data.state) setState(data.state as PlayerState);
    } catch {
      // Non-critical
    } finally {
      setBusy(false);
    }
  }, [walletAddress]);

  if (!currentStep || currentStep === 'done') return null;
  if (!walletAddress) return null;

  const config = STEPS[currentStep as Exclude<OnboardingStep, 'done'>];
  const totalSteps = STEP_ORDER.length - 1; // exclude 'done'
  const stepIdx = (STEP_INDEX.get(currentStep) ?? 0) + 1;

  return (
    <div className="absolute inset-0 z-40 pointer-events-none">
      <div className="absolute bottom-4 left-4 pointer-events-auto max-w-[min(360px,90vw)]">
        {collapsed ? (
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center gap-2 px-3 py-2 bg-black/90 border border-[#ffd700]/40 rounded-lg shadow-[0_0_16px_rgba(255,215,0,0.2)] hover:border-[#ffd700]/70 transition-colors"
            aria-label="Expand onboarding guide"
          >
            <span className="text-base" aria-hidden>🦊</span>
            <span className="text-[#ffd700] font-['Press_Start_2P'] text-[8px]">
              Step {stepIdx}/{totalSteps}
            </span>
          </button>
        ) : (
          <div
            className="bg-black/95 border border-[#ffd700]/40 rounded-lg shadow-[0_0_20px_rgba(255,215,0,0.25)]"
            role="dialog"
            aria-label="Onboarding guide"
          >
            <div className="flex items-center justify-between border-b border-[#ffd700]/20 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-base" aria-hidden>🦊</span>
                <div>
                  <h3 className="text-[#ffd700] font-['Press_Start_2P'] text-[8px]">
                    Spawn Fox
                  </h3>
                  <span className="text-gray-500 text-[6px]">
                    Step {stepIdx} of {totalSteps} · {config.hint}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setCollapsed(true)}
                className="text-gray-500 hover:text-white text-xs transition-colors"
                aria-label="Collapse onboarding guide"
              >
                _
              </button>
            </div>

            <div className="px-3 py-3 space-y-2">
              <h4 className="text-[#00f7ff] font-['Press_Start_2P'] text-[9px]">
                {config.title}
              </h4>
              <p className="text-gray-200 text-[10px] leading-relaxed">
                {config.body}
              </p>
              <div className="flex items-center gap-1 pt-1">
                {STEP_ORDER.slice(0, totalSteps).map((s, i) => (
                  <span
                    key={s}
                    className={`h-1.5 w-3 rounded-full transition-colors ${
                      i < stepIdx ? 'bg-[#ffd700]' : 'bg-[#ffd700]/20'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#ffd700]/20 px-3 py-2">
              <button
                onClick={handleSkip}
                disabled={busy}
                className="px-2 py-1 text-[7px] font-['Press_Start_2P'] text-gray-500 hover:text-gray-300 disabled:opacity-30 transition-colors"
              >
                SKIP TUTORIAL
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
