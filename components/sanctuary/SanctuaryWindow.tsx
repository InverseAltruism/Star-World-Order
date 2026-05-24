'use client';

// Shared shell for the Sanctuary interactable overlays (Quests, Shop, Traits,
// Journal, Expeditions). Hybrid by design:
//   • Desktop (≥ 640px): a draggable floating window — grab the header to move
//     it, so the panels stop feeling like they pop up at random spots.
//   • Mobile (< 640px): a full-width bottom-sheet that slides up — the standard
//     touch pattern, far easier than a centred box on a phone.
// Consistent header (title + close), a scrollable body, Esc-to-close and a
// tap-the-backdrop-to-close. Readable base type (overlays were 8px); content
// inherits a larger size unless it sets its own.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

function useIsDesktop(): boolean {
  // Default desktop; these overlays are client-only (ssr:false) so the effect
  // runs before paint matters.
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return desktop;
}

export interface SanctuaryWindowProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Accent hex for the header/border. Defaults to cyan. */
  accent?: string;
  testId?: string;
}

export default function SanctuaryWindow({
  title,
  onClose,
  children,
  accent = '#00f7ff',
  testId,
}: SanctuaryWindowProps) {
  const isDesktop = useIsDesktop();
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isDesktop) return; // no dragging the mobile sheet
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y };
    },
    [isDesktop, offset],
  );
  const onHeaderPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset({
      x: drag.current.baseX + (e.clientX - drag.current.startX),
      y: drag.current.baseY + (e.clientY - drag.current.startY),
    });
  }, []);
  const endDrag = useCallback(() => {
    drag.current = null;
  }, []);

  const header = (
    <div
      onPointerDown={onHeaderPointerDown}
      onPointerMove={onHeaderPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${
        isDesktop ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      style={{ borderColor: `${accent}55` }}
    >
      <h2
        className="text-[11px] tracking-wider font-['Press_Start_2P'] truncate"
        style={{ color: accent }}
      >
        {title}
      </h2>
      <button
        onClick={onClose}
        aria-label="Close"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-gray-300 hover:bg-white/10 active:bg-white/20"
      >
        <span className="text-lg leading-none" aria-hidden="true">✕</span>
      </button>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex pointer-events-auto"
      data-testid={testId}
      style={{ alignItems: isDesktop ? 'center' : 'flex-end', justifyContent: 'center' }}
    >
      {/* Backdrop */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
        tabIndex={-1}
      />

      {/* Panel — draggable window on desktop, bottom-sheet on mobile */}
      <div
        role="dialog"
        aria-label={title}
        className={`relative flex flex-col bg-[#0a0a15] text-sm shadow-[0_0_30px_rgba(0,0,0,0.6)] ${
          isDesktop
            ? 'w-[460px] max-w-[92vw] max-h-[80vh] rounded-lg border'
            : 'w-full max-h-[88vh] rounded-t-2xl border-t-2 sanctuary-sheet-in'
        }`}
        style={{
          borderColor: `${accent}55`,
          transform: isDesktop ? `translate(${offset.x}px, ${offset.y}px)` : undefined,
        }}
      >
        {header}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
      </div>
    </div>
  );
}
