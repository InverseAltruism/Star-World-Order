'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import EventBus from '@/components/sanctuary/EventBus';
import { worldToScreen, cameraState } from '@/game/systems/CameraState';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';

const MAX_LENGTH = 500;
const PANEL_WIDTH = 240;
const PANEL_OFFSET_Y = -110;
const HISTORY_LIMIT = 6;
const TYPING_MIN_MS = 800;
const TYPING_MAX_MS = 4000;
const TYPING_WPM = 45;

type Role = 'user' | 'companion';

interface ChatLine {
  id: number;
  role: Role;
  text: string;
}

interface DailyLimit {
  used: number;
  limit: number;
  remaining: number;
}

interface ChatApiMeta {
  mode?: string;
  dailyLimit?: DailyLimit;
}

interface ChatApiResponse {
  success: boolean;
  error?: string;
  userMessage?: { id: number; content: string };
  companionReply?: { id: number; content: string };
  meta?: ChatApiMeta;
}

let lineIdCounter = 0;

function computeTypingDelay(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length || 1;
  const ms = (words / TYPING_WPM) * 60_000;
  return Math.min(TYPING_MAX_MS, Math.max(TYPING_MIN_MS, ms));
}

export default function CompanionChatOverlay({
  walletAddress,
  tokenId,
}: {
  walletAddress: string | undefined;
  tokenId: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState<DailyLimit | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const openChat = useCallback(() => {
    if (!walletAddress || tokenId === null) return;
    setOpen(true);
    setError(null);
  }, [walletAddress, tokenId]);

  // Hotkey C and Talk action open the overlay
  useEffect(() => {
    const onTalk = () => openChat();
    EventBus.on('companion-chat-open', onTalk);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        close();
        return;
      }
      if (open) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        openChat();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      EventBus.off('companion-chat-open', onTalk);
      window.removeEventListener('keydown', onKey);
    };
  }, [openChat, close, open]);

  // Auto-focus input when opened
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Click outside closes
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, close]);

  // Scroll history to bottom on new lines
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, typing]);

  // Position the panel above the companion sprite
  useEffect(() => {
    if (!open) return;
    const tick = () => {
      const el = panelRef.current;
      if (el) {
        const screen = worldToScreen(cameraState.companionX, cameraState.companionY);
        el.style.left = `${screen.x}px`;
        el.style.top = `${screen.y + PANEL_OFFSET_Y}px`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [open]);

  // Cleanup typing timer on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  const appendLine = useCallback((role: Role, text: string) => {
    setLines((prev) => {
      const next = [...prev, { id: ++lineIdCounter, role, text }];
      return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
    });
  }, []);

  const send = useCallback(async () => {
    if (sending || typing) return;
    const message = draft.trim();
    if (!message) return;
    if (!walletAddress || tokenId === null) return;

    setSending(true);
    setError(null);
    appendLine('user', message);
    setDraft('');

    try {
      const authHeader = await getWalletAuthHeader(walletAddress);
      if (!authHeader) {
        setError('Wallet auth required');
        setSending(false);
        return;
      }

      const res = await fetch('/api/sanctuary/companion/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-auth': authHeader,
        },
        body: JSON.stringify({ address: walletAddress, token_id: tokenId, message }),
      });

      const data: ChatApiResponse = await res.json();
      setSending(false);

      if (!res.ok || !data.success) {
        setError(data.error || 'Companion is quiet right now…');
        return;
      }

      if (data.meta?.dailyLimit) setDailyLimit(data.meta.dailyLimit);

      const replyText = data.companionReply?.content?.trim() || '…';
      const delay = computeTypingDelay(replyText);
      setTyping(true);

      typingTimerRef.current = setTimeout(() => {
        setTyping(false);
        appendLine('companion', replyText);
        EventBus.emit('companion-bubble', { text: replyText });
      }, delay);
    } catch (err) {
      setSending(false);
      setError(err instanceof Error ? err.message : 'Failed to send');
    }
  }, [draft, walletAddress, tokenId, sending, typing, appendLine]);

  const onInputKey = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        void send();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    },
    [send, close],
  );

  if (!open) return null;

  const remainingLabel = dailyLimit
    ? `${dailyLimit.remaining}/${dailyLimit.limit}`
    : null;

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      <div
        ref={panelRef}
        className="absolute pointer-events-auto -translate-x-1/2"
        style={{
          width: PANEL_WIDTH,
          willChange: 'left, top',
        }}
      >
        <div
          className="relative rounded-lg bg-[#0a0a1a]/95 border border-[#9966ff]/50
                     shadow-[0_0_12px_rgba(153,102,255,0.4)] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#9966ff]/20 bg-[#1a0033]/60">
            <span className="text-[7px] font-['Press_Start_2P'] text-[#9966ff] uppercase tracking-wider">
              💬 Talk
            </span>
            <div className="flex items-center gap-2">
              {remainingLabel && (
                <span
                  className="text-[6px] font-['Press_Start_2P'] text-[#ffd700]"
                  title="Daily LLM chat remaining"
                >
                  {remainingLabel}
                </span>
              )}
              <button
                onClick={close}
                aria-label="Close chat"
                className="text-[8px] text-gray-400 hover:text-white leading-none"
              >
                ✕
              </button>
            </div>
          </div>

          {/* History */}
          <div
            ref={scrollRef}
            className="max-h-32 overflow-y-auto px-2 py-1.5 space-y-1.5"
          >
            {lines.length === 0 && !typing && (
              <div className="text-[6px] text-gray-500 font-['Press_Start_2P'] text-center py-1">
                Say hello to your companion…
              </div>
            )}
            {lines.map((line) => (
              <div
                key={line.id}
                className={`flex ${line.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-1.5 py-1 rounded text-[6px] leading-relaxed font-['Press_Start_2P'] break-words ${
                    line.role === 'user'
                      ? 'bg-[#00f7ff]/15 border border-[#00f7ff]/30 text-white'
                      : 'bg-[#9966ff]/15 border border-[#9966ff]/30 text-[#e8d8ff]'
                  }`}
                >
                  {line.text}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div
                  className="px-2 py-1 rounded bg-[#9966ff]/15 border border-[#9966ff]/30 inline-flex items-center gap-1"
                  aria-label="Companion is typing"
                >
                  <span className="sanctuary-typing-dot" />
                  <span className="sanctuary-typing-dot" />
                  <span className="sanctuary-typing-dot" />
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="px-2 py-1 text-[6px] font-['Press_Start_2P'] text-[#ff6677] border-t border-[#ff6677]/20 bg-[#330011]/40">
              {error}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-1 px-2 py-1.5 border-t border-[#9966ff]/20 bg-[#0a0015]/60">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={onInputKey}
              placeholder={typing ? 'Companion is typing…' : 'Press Enter to send'}
              maxLength={MAX_LENGTH}
              disabled={sending || typing}
              className="flex-1 px-1.5 py-1 rounded bg-[#0a0a1a]/80 border border-[#9966ff]/30
                         text-[7px] text-white font-['Press_Start_2P'] placeholder:text-gray-500
                         outline-none focus:border-[#9966ff]/70 disabled:opacity-50"
            />
            <button
              onClick={() => void send()}
              disabled={!draft.trim() || sending || typing}
              className="px-2 py-1 rounded bg-[#9966ff]/20 border border-[#9966ff]/40
                         text-[#9966ff] text-[7px] font-['Press_Start_2P']
                         hover:bg-[#9966ff]/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </div>

        {/* Tail pointing down toward companion */}
        <div
          className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-0 h-0
                     border-l-[5px] border-l-transparent
                     border-r-[5px] border-r-transparent
                     border-t-[5px] border-t-[#9966ff]/50"
        />
      </div>
    </div>
  );
}
