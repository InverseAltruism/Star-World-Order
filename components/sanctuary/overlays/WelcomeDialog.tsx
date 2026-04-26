'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import EventBus from '@/components/sanctuary/EventBus';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';

interface NPCClickPayload {
  npcId: string;
  npcName: string;
  zone: string;
  dialogue: string;
  screenX: number;
  screenY: number;
}

interface PlayerState {
  wallet_address: string;
  intro_completed: number;
  first_visit_at: string;
  last_visit_at: string;
  total_visits: number;
}

const INTRO_PAGES: Array<{ title: string; body: string }> = [
  {
    title: 'Welcome to the Sanctuary',
    body: "I'm Spawn Fox, the keeper of this Town Square. The stars have been waiting for a traveler like you. Let me show you the essentials before you wander.",
  },
  {
    title: 'Moving around',
    body: 'Use WASD or the arrow keys to walk. You can also click anywhere on the map to path-find there. Hold direction keys for steady movement — your companion will follow.',
  },
  {
    title: 'Exploring rooms',
    body: 'Doorways glow when you step near them. Press [E] to enter a room — Observatory, Hot Springs, Training Grounds, and more each have their own keeper and quests.',
  },
  {
    title: 'Your companion',
    body: 'Click your Skrumpey companion at any time to open the radial menu — feed, pet, talk, send on activities, or review its journal and traits. Hotkeys: [J] journal, [T] traits.',
  },
  {
    title: 'Ready to begin',
    body: "Come back to me any time if you need a reminder. The Sanctuary is yours to explore — may the stars guide you.",
  },
];

const HELP_DIALOGUE = {
  title: 'Need a reminder?',
  body: 'WASD or click to move. [E] at doors to enter rooms. [J] journal, [T] traits. Click your companion for the radial menu. Safe travels.',
};

export default function WelcomeDialog({
  walletAddress,
}: {
  walletAddress: string | undefined;
}) {
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<PlayerState | null>(null);
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const hasMarkedVisitRef = useRef(false);

  const loadState = useCallback(async (): Promise<PlayerState | null> => {
    if (!walletAddress) return null;
    try {
      const res = await fetch(
        `/api/sanctuary/player-state?address=${walletAddress}`
      );
      const data = await res.json();
      if (data.success) return data.state as PlayerState | null;
    } catch {
      // Non-critical
    }
    return null;
  }, [walletAddress]);

  useEffect(() => {
    if (!walletAddress || hasMarkedVisitRef.current) return;
    hasMarkedVisitRef.current = true;
    let cancelled = false;

    (async () => {
      const authHeader = await getWalletAuthHeader(walletAddress);
      if (!authHeader || cancelled) return;
      try {
        const res = await fetch('/api/sanctuary/player-state', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-wallet-auth': authHeader,
          },
          body: JSON.stringify({ address: walletAddress, action: 'visit' }),
        });
        const data = await res.json();
        if (!cancelled && data.success) {
          setState(data.state as PlayerState);
          if (data.state && !data.state.intro_completed) {
            setVisible(true);
            setPage(0);
          }
        }
      } catch {
        // Non-critical
      }
    })();

    return () => { cancelled = true; };
  }, [walletAddress]);

  const handleNPCClick = useCallback(
    async (payload: NPCClickPayload) => {
      if (payload.npcId !== 'spawn-fox') return;
      const latest = await loadState();
      if (latest) setState(latest);
      setPage(0);
      setVisible(true);
    },
    [loadState]
  );

  useEffect(() => {
    EventBus.on('npc-clicked', handleNPCClick);
    return () => {
      EventBus.off('npc-clicked', handleNPCClick);
    };
  }, [handleNPCClick]);

  const close = useCallback(() => {
    setVisible(false);
  }, []);

  const finishIntro = useCallback(async () => {
    if (!walletAddress) {
      close();
      return;
    }
    setSaving(true);
    try {
      const authHeader = await getWalletAuthHeader(walletAddress);
      if (!authHeader) {
        close();
        return;
      }
      const res = await fetch('/api/sanctuary/player-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-auth': authHeader,
        },
        body: JSON.stringify({ address: walletAddress, action: 'complete-intro' }),
      });
      const data = await res.json();
      if (data.success && data.state) {
        setState(data.state as PlayerState);
        EventBus.emit('intro-completed', { walletAddress });
      }
    } catch {
      // Non-critical; close anyway
    } finally {
      setSaving(false);
      close();
    }
  }, [walletAddress, close]);

  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        if (state?.intro_completed) close();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state?.intro_completed) close();
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKey);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [visible, close, state?.intro_completed]);

  if (!visible) return null;

  const introDone = !!state?.intro_completed;
  const currentPage = INTRO_PAGES[page] ?? INTRO_PAGES[0];
  const isLastPage = page >= INTRO_PAGES.length - 1;

  return (
    <div className="absolute inset-0 z-50 pointer-events-none">
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" aria-hidden />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          ref={panelRef}
          className="w-[min(440px,90vw)] pointer-events-auto
            bg-black/95 border border-[#ffd700]/40 rounded-lg shadow-[0_0_24px_rgba(255,215,0,0.25)]"
          role="dialog"
          aria-label="Spawn Fox welcome"
        >
          <div className="flex items-center justify-between border-b border-[#ffd700]/20 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden>🦊</span>
              <div>
                <h3 className="text-[#ffd700] font-['Press_Start_2P'] text-[10px]">
                  Spawn Fox
                </h3>
                <span className="text-gray-500 text-[7px]">Town Square</span>
              </div>
            </div>
            {introDone && (
              <button
                onClick={close}
                className="text-gray-500 hover:text-white text-sm transition-colors"
                aria-label="Close dialog"
              >
                ✕
              </button>
            )}
          </div>

          <div className="p-4 space-y-3 min-h-[120px]">
            {!introDone ? (
              <>
                <h4 className="text-[#00f7ff] font-['Press_Start_2P'] text-[9px]">
                  {currentPage.title}
                </h4>
                <p className="text-gray-200 text-[11px] leading-relaxed">
                  {currentPage.body}
                </p>
                <div className="flex items-center gap-1 pt-1">
                  {INTRO_PAGES.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-4 rounded-full transition-colors ${
                        i === page ? 'bg-[#ffd700]' : 'bg-[#ffd700]/20'
                      }`}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <h4 className="text-[#00f7ff] font-['Press_Start_2P'] text-[9px]">
                  {HELP_DIALOGUE.title}
                </h4>
                <p className="text-gray-200 text-[11px] leading-relaxed">
                  {HELP_DIALOGUE.body}
                </p>
              </>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-[#ffd700]/20 px-4 py-3">
            {!introDone ? (
              <>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 text-[8px] font-['Press_Start_2P'] text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  BACK
                </button>
                <span className="text-gray-600 text-[7px]">
                  {page + 1} / {INTRO_PAGES.length}
                </span>
                {isLastPage ? (
                  <button
                    onClick={finishIntro}
                    disabled={saving}
                    className="px-3 py-1.5 text-[8px] font-['Press_Start_2P'] text-[#ffd700] bg-[#ffd700]/10 border border-[#ffd700]/40 rounded hover:bg-[#ffd700]/20 disabled:opacity-40 transition-colors"
                  >
                    {saving ? '...' : 'BEGIN'}
                  </button>
                ) : (
                  <button
                    onClick={() => setPage((p) => Math.min(INTRO_PAGES.length - 1, p + 1))}
                    className="px-3 py-1.5 text-[8px] font-['Press_Start_2P'] text-[#ffd700] bg-[#ffd700]/10 border border-[#ffd700]/40 rounded hover:bg-[#ffd700]/20 transition-colors"
                  >
                    NEXT
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={close}
                className="ml-auto px-3 py-1.5 text-[8px] font-['Press_Start_2P'] text-[#ffd700] bg-[#ffd700]/10 border border-[#ffd700]/40 rounded hover:bg-[#ffd700]/20 transition-colors"
              >
                CLOSE
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
