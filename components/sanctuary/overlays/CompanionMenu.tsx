'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import EventBus from '@/components/sanctuary/EventBus';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';

type InteractAction = 'pet' | 'feed' | 'talk';

interface MenuPosition {
  x: number;
  y: number;
}

interface FloatingText {
  id: number;
  text: string;
  color: string;
  x: number;
  y: number;
}

interface ReactionEffect {
  type: InteractAction;
  x: number;
  y: number;
}

const ACTIONS: { action: InteractAction; icon: string; label: string; angle: number }[] = [
  { action: 'pet', icon: '🐾', label: 'Pet', angle: -90 },
  { action: 'feed', icon: '🍎', label: 'Feed', angle: -210 },
  { action: 'talk', icon: '💬', label: 'Talk', angle: -330 },
];

const RADIAL_DISTANCE = 56;

let floatingId = 0;

export default function CompanionMenu({
  walletAddress,
  tokenId,
  onInteracted,
}: {
  walletAddress: string | undefined;
  tokenId: number | null;
  onInteracted?: () => void;
}) {
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const [interacting, setInteracting] = useState<InteractAction | null>(null);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [reaction, setReaction] = useState<ReactionEffect | null>(null);
  const [visible, setVisible] = useState(false);
  const [busyOnQuest, setBusyOnQuest] = useState(false);
  const [busyNotice, setBusyNotice] = useState<MenuPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const openMenu = useCallback((payload: { screenX: number; screenY: number }) => {
    if (busyOnQuest) {
      setBusyNotice({ x: payload.screenX, y: payload.screenY });
      setTimeout(() => setBusyNotice(null), 1600);
      return;
    }
    setMenuPos({ x: payload.screenX, y: payload.screenY });
    setVisible(true);
  }, [busyOnQuest]);

  useEffect(() => {
    const onAway = (data: { away: boolean }) => {
      setBusyOnQuest(!!data?.away);
    };
    EventBus.on('companion-away', onAway);
    return () => {
      EventBus.off('companion-away', onAway);
    };
  }, []);

  const closeMenu = useCallback(() => {
    setVisible(false);
    setTimeout(() => setMenuPos(null), 200);
  }, []);

  useEffect(() => {
    EventBus.on('companion-clicked', openMenu);
    return () => {
      EventBus.off('companion-clicked', openMenu);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!visible) return;

    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [visible, closeMenu]);

  const addFloatingText = useCallback((text: string, color: string, x: number, y: number) => {
    const id = ++floatingId;
    setFloatingTexts((prev) => [...prev, { id, text, color, x, y }]);
    setTimeout(() => {
      setFloatingTexts((prev) => prev.filter((ft) => ft.id !== id));
    }, 1200);
  }, []);

  const triggerReaction = useCallback((action: InteractAction, x: number, y: number) => {
    setReaction({ type: action, x, y });
    setTimeout(() => setReaction(null), 800);
  }, []);

  const handleAction = useCallback(async (action: InteractAction) => {
    if (!walletAddress || tokenId === null || interacting) return;

    setInteracting(action);
    const pos = menuPos!;

    try {
      const walletAuthHeader = await getWalletAuthHeader(walletAddress);
      if (!walletAuthHeader) {
        setInteracting(null);
        return;
      }

      const res = await fetch('/api/sanctuary/companion/interact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-auth': walletAuthHeader,
        },
        body: JSON.stringify({ walletAddress, token_id: tokenId, action }),
      });

      const data = await res.json();

      if (data.success) {
        triggerReaction(action, pos.x, pos.y);

        const companion = data.companion;
        if (companion) {
          addFloatingText(`+${(companion.bond_gained ?? 2).toFixed(0)} Bond`, '#ff66aa', pos.x - 20, pos.y - 40);
          addFloatingText(`+${companion.xp_gained ?? 5} XP`, '#ffd700', pos.x + 20, pos.y - 55);
        } else {
          addFloatingText('+2 Bond', '#ff66aa', pos.x - 20, pos.y - 40);
          addFloatingText('+5 XP', '#ffd700', pos.x + 20, pos.y - 55);
        }

        EventBus.emit('companion-interacted', { action, companion: data.companion });
        onInteracted?.();

        if (data.companion?.mood) {
          EventBus.emit('companion-mood', data.companion.mood);
        }
      }
    } catch {
      // Silently fail — in-world interaction shouldn't block gameplay
    } finally {
      setInteracting(null);
      closeMenu();
    }
  }, [walletAddress, tokenId, interacting, menuPos, triggerReaction, addFloatingText, closeMenu, onInteracted]);

  if (busyNotice && !menuPos) {
    return (
      <div className="absolute inset-0 z-30 pointer-events-none">
        <div
          className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 bg-black/90 border border-[#9966ff]/60 rounded px-2 py-1 animate-pulse"
          style={{ left: busyNotice.x, top: busyNotice.y - 36 }}
        >
          <span className="text-[7px] text-[#9966ff] font-['Press_Start_2P'] uppercase tracking-wider">
            💤 On Quest
          </span>
        </div>
      </div>
    );
  }

  if (!menuPos) return null;

  return (
    <div ref={containerRef} className="absolute inset-0 z-30 pointer-events-none">
      {/* Radial menu */}
      <div
        className={`absolute pointer-events-auto transition-all duration-200 ${
          visible ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
        }`}
        style={{ left: menuPos.x, top: menuPos.y, transform: 'translate(-50%, -50%)' }}
      >
        {/* Center indicator */}
        <div className="absolute w-3 h-3 rounded-full bg-[#ffd700]/40 border border-[#ffd700]/60 -translate-x-1/2 -translate-y-1/2" />

        {/* Action buttons */}
        {ACTIONS.map(({ action, icon, label, angle }) => {
          const rad = (angle * Math.PI) / 180;
          const bx = Math.cos(rad) * RADIAL_DISTANCE;
          const by = Math.sin(rad) * RADIAL_DISTANCE;
          const isActive = interacting === action;

          return (
            <button
              key={action}
              onClick={() => handleAction(action)}
              disabled={interacting !== null}
              className={`
                absolute w-12 h-12 -translate-x-1/2 -translate-y-1/2 rounded-full
                flex flex-col items-center justify-center
                bg-black/90 border-2 transition-all duration-150
                ${isActive
                  ? 'border-[#ffd700] shadow-[0_0_12px_rgba(255,215,0,0.5)] scale-110'
                  : 'border-[#00f7ff]/50 hover:border-[#ffd700] hover:shadow-[0_0_8px_rgba(255,215,0,0.3)] hover:scale-110'
                }
                disabled:opacity-40 disabled:cursor-not-allowed
              `}
              style={{ left: bx, top: by }}
            >
              <span className="text-base leading-none">{isActive ? '⏳' : icon}</span>
              <span className="text-[6px] text-gray-400 mt-0.5 font-['Press_Start_2P']">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Reaction effects */}
      {reaction && (
        <div
          className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2"
          style={{ left: reaction.x, top: reaction.y }}
        >
          {reaction.type === 'pet' && (
            <div className="companion-reaction-sparkle">
              {['✨', '⭐', '💛', '✨'].map((s, i) => (
                <span
                  key={i}
                  className="absolute text-sm animate-ping"
                  style={{
                    left: `${Math.cos((i * Math.PI) / 2) * 20}px`,
                    top: `${Math.sin((i * Math.PI) / 2) * 20}px`,
                    animationDelay: `${i * 100}ms`,
                    animationDuration: '600ms',
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          {reaction.type === 'feed' && (
            <div className="companion-reaction-bounce">
              <span className="text-2xl inline-block animate-bounce">🍎</span>
            </div>
          )}
          {reaction.type === 'talk' && (
            <div className="companion-reaction-bubble">
              <div className="bg-white/90 rounded-full px-2 py-1 text-sm border border-[#00f7ff]/40 shadow-[0_0_8px_rgba(0,247,255,0.3)] animate-pulse">
                💬
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating text */}
      {floatingTexts.map((ft) => (
        <span
          key={ft.id}
          className="absolute text-xs font-['Press_Start_2P'] pointer-events-none companion-floating-text"
          style={{
            left: ft.x,
            top: ft.y,
            color: ft.color,
            textShadow: `0 0 6px ${ft.color}`,
          }}
        >
          {ft.text}
        </span>
      ))}
    </div>
  );
}
