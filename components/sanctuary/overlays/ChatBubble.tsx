'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import EventBus from '@/components/sanctuary/EventBus';
import { worldToScreen, cameraState } from '@/game/systems/CameraState';
import type { RemotePlayer } from '@/lib/colyseus/types';

const BUBBLE_LIFETIME = 8000;
const FADE_DURATION = 1000;
const BUBBLE_OFFSET_Y = -20;
const COMPANION_BUBBLE_LIFETIME = 6000;
const COMPANION_BUBBLE_OFFSET_Y = -28;
const COMPANION_SESSION_ID = '__companion__';

interface ActiveBubble {
  id: number;
  sessionId: string;
  displayName: string;
  text: string;
  createdAt: number;
  variant?: 'companion';
}

let bubbleIdCounter = 0;

export default function ChatBubble() {
  const [bubbles, setBubbles] = useState<ActiveBubble[]>([]);
  const playerPositions = useRef(new Map<string, { x: number; y: number }>());
  const localSessionId = useRef<string | null>(null);
  const rafRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const bubbleRefs = useRef(new Map<number, HTMLDivElement>());

  const addBubble = useCallback(
    (msg: { sessionId: string; displayName: string; text: string; isLocal: boolean }) => {
      if (msg.isLocal) localSessionId.current = msg.sessionId;
      const bubble: ActiveBubble = {
        id: ++bubbleIdCounter,
        sessionId: msg.sessionId,
        displayName: msg.displayName,
        text: msg.text,
        createdAt: Date.now(),
      };
      setBubbles((prev) => {
        const existing = prev.filter((b) => b.sessionId !== msg.sessionId);
        return [...existing, bubble];
      });
    },
    [],
  );

  const addCompanionBubble = useCallback((msg: { text: string }) => {
    if (!msg?.text) return;
    const bubble: ActiveBubble = {
      id: ++bubbleIdCounter,
      sessionId: COMPANION_SESSION_ID,
      displayName: 'Companion',
      text: msg.text,
      createdAt: Date.now(),
      variant: 'companion',
    };
    setBubbles((prev) => {
      const existing = prev.filter((b) => b.sessionId !== COMPANION_SESSION_ID);
      return [...existing, bubble];
    });
  }, []);

  useEffect(() => {
    const handlePlayerAdd = (p: RemotePlayer) => {
      playerPositions.current.set(p.sessionId, { x: p.x, y: p.y });
    };
    const handlePlayerUpdate = (p: RemotePlayer) => {
      playerPositions.current.set(p.sessionId, { x: p.x, y: p.y });
    };
    const handlePlayerRemove = (sessionId: string) => {
      playerPositions.current.delete(sessionId);
      setBubbles((prev) => prev.filter((b) => b.sessionId !== sessionId));
    };

    EventBus.on('chat-message', addBubble);
    EventBus.on('companion-bubble', addCompanionBubble);
    EventBus.on('remote-player-add', handlePlayerAdd);
    EventBus.on('remote-player-update', handlePlayerUpdate);
    EventBus.on('remote-player-remove', handlePlayerRemove);

    return () => {
      EventBus.off('chat-message', addBubble);
      EventBus.off('companion-bubble', addCompanionBubble);
      EventBus.off('remote-player-add', handlePlayerAdd);
      EventBus.off('remote-player-update', handlePlayerUpdate);
      EventBus.off('remote-player-remove', handlePlayerRemove);
    };
  }, [addBubble, addCompanionBubble]);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();

      setBubbles((prev) => {
        const alive = prev.filter((b) => {
          const lifetime = b.variant === 'companion' ? COMPANION_BUBBLE_LIFETIME : BUBBLE_LIFETIME;
          return now - b.createdAt < lifetime;
        });
        if (alive.length !== prev.length) return alive;
        return prev;
      });

      for (const [id, el] of bubbleRefs.current) {
        const bubble = bubbles.find((b) => b.id === id);
        if (!bubble || !el) continue;

        let worldX: number;
        let worldY: number;
        const offsetY = bubble.variant === 'companion' ? COMPANION_BUBBLE_OFFSET_Y : BUBBLE_OFFSET_Y;

        if (bubble.variant === 'companion') {
          worldX = cameraState.companionX;
          worldY = cameraState.companionY;
        } else if (bubble.sessionId === localSessionId.current) {
          worldX = cameraState.localPlayerX;
          worldY = cameraState.localPlayerY;
        } else {
          const pos = playerPositions.current.get(bubble.sessionId);
          if (!pos) continue;
          worldX = pos.x;
          worldY = pos.y;
        }

        const screen = worldToScreen(worldX, worldY + offsetY);
        el.style.left = `${screen.x}px`;
        el.style.top = `${screen.y}px`;

        const lifetime = bubble.variant === 'companion' ? COMPANION_BUBBLE_LIFETIME : BUBBLE_LIFETIME;
        const age = now - bubble.createdAt;
        const fadeStart = lifetime - FADE_DURATION;
        if (age > fadeStart) {
          el.style.opacity = String(1 - (age - fadeStart) / FADE_DURATION);
        } else {
          el.style.opacity = '1';
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [bubbles]);

  const setBubbleRef = useCallback((id: number, el: HTMLDivElement | null) => {
    if (el) {
      bubbleRefs.current.set(id, el);
    } else {
      bubbleRefs.current.delete(id);
    }
  }, []);

  if (bubbles.length === 0) return null;

  return (
    <div ref={containerRef} className="absolute inset-0 z-25 pointer-events-none overflow-hidden">
      {bubbles.map((bubble) => {
        const isCompanion = bubble.variant === 'companion';
        return (
          <div
            key={bubble.id}
            ref={(el) => setBubbleRef(bubble.id, el)}
            className="absolute -translate-x-1/2 -translate-y-full"
            style={{ willChange: 'left, top, opacity' }}
          >
            <div className="relative max-w-[200px]">
              <div
                className={`px-2 py-1.5 rounded-lg bg-[#0a0a1a]/95 border ${
                  isCompanion
                    ? 'border-[#9966ff]/40 shadow-[0_0_8px_rgba(153,102,255,0.25)]'
                    : 'border-[#00f7ff]/20 shadow-[0_0_6px_rgba(0,247,255,0.1)]'
                }`}
              >
                <div
                  className={`text-[5px] font-['Press_Start_2P'] mb-0.5 truncate ${
                    isCompanion ? 'text-[#9966ff]/80' : 'text-[#00f7ff]/70'
                  }`}
                >
                  {bubble.displayName}
                </div>
                <div
                  className={`text-[6px] font-['Press_Start_2P'] break-words leading-relaxed ${
                    isCompanion ? 'text-[#e8d8ff]' : 'text-white'
                  }`}
                >
                  {bubble.text}
                </div>
              </div>
              <div
                className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-0 h-0
                            border-l-[4px] border-l-transparent
                            border-r-[4px] border-r-transparent
                            border-t-[4px] border-t-[#0a0a1a]/95"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
