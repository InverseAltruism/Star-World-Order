'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import EventBus from '@/components/sanctuary/EventBus';

const MAX_LENGTH = 100;

export default function ChatInput() {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !focused && inputRef.current) {
        e.preventDefault();
        inputRef.current.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [focused]);

  // Blur the input when the user clicks anywhere outside it (e.g. on the
  // game canvas) so WASD goes back to the player instead of typing here.
  useEffect(() => {
    if (!focused) return;
    const handleDown = (e: MouseEvent | TouchEvent) => {
      const el = inputRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      el.blur();
    };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('touchstart', handleDown);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('touchstart', handleDown);
    };
  }, [focused]);

  const send = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    EventBus.emit('send-chat', trimmed);
    setText('');
    inputRef.current?.blur();
  }, [text]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        send();
      }
      if (e.key === 'Escape') {
        inputRef.current?.blur();
      }
    },
    [send],
  );

  return (
    <div
      className="absolute bottom-2 left-2 right-2 z-20 flex gap-2 max-w-full"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={focused ? 'Type a message...' : 'Press Enter to chat'}
        maxLength={MAX_LENGTH}
        // 16 px font keeps iOS Safari from auto-zooming the viewport on focus,
        // which is the dominant mobile UX bug for chat inputs.
        style={{ fontSize: '16px' }}
        className={`
          flex-1 min-w-0 px-3 rounded
          min-h-[44px]
          bg-[#0a0a1a]/90 border text-white
          font-['Press_Start_2P'] placeholder:text-gray-500
          outline-none transition-all
          ${focused
            ? 'border-[#00f7ff]/60 shadow-[0_0_8px_rgba(0,247,255,0.2)]'
            : 'border-[#00f7ff]/20 opacity-60 hover:opacity-80'
          }
        `}
      />
      {focused && text.trim() && (
        <button
          onClick={send}
          // onMouseDown.preventDefault avoids stealing focus from the input
          // before the click registers — otherwise the input blurs and the
          // button vanishes mid-tap on touch devices.
          onMouseDown={(e) => e.preventDefault()}
          className="px-4 min-h-[44px] min-w-[44px] rounded bg-[#00f7ff]/20 border border-[#00f7ff]/40
                     text-[#00f7ff] text-xs font-['Press_Start_2P']
                     hover:bg-[#00f7ff]/30 active:bg-[#00f7ff]/40 transition-all
                     touch-manipulation select-none shrink-0"
        >
          Send
        </button>
      )}
    </div>
  );
}
