'use client';

// Shared popup shell for the Sanctuary interactable panels. Deliberately simple
// and predictable (no dragging): a centred card on desktop, a full-width
// bottom-sheet on mobile — always in the same place, so panels stop feeling
// like they appear at random. Consistent header (title + close), scrollable
// body, Esc-to-close and tap-the-backdrop-to-close, readable base type.
import { useEffect, type ReactNode } from 'react';

export interface SanctuaryWindowProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Short one-line subtitle under the title (optional). */
  subtitle?: string;
  /** Accent hex for the header/border. Defaults to cyan. */
  accent?: string;
  testId?: string;
}

export default function SanctuaryWindow({
  title,
  onClose,
  children,
  subtitle,
  accent = '#00f7ff',
  testId,
}: SanctuaryWindowProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center pointer-events-auto sm:items-center"
      data-testid={testId}
    >
      {/* Backdrop */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/65"
        tabIndex={-1}
      />

      {/* Panel — bottom-sheet on mobile, centred card on desktop */}
      <div
        role="dialog"
        aria-label={title}
        className="sanctuary-sheet-in relative flex max-h-[88vh] w-full flex-col rounded-t-2xl border-t-2 bg-[#0a0a15] shadow-[0_0_30px_rgba(0,0,0,0.65)] sm:max-h-[82vh] sm:w-[460px] sm:max-w-[92vw] sm:rounded-2xl sm:border-2"
        style={{ borderColor: `${accent}66` }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: `${accent}40` }}
        >
          <div className="min-w-0">
            <h2
              className="truncate text-[11px] tracking-wider font-['Press_Start_2P']"
              style={{ color: accent }}
            >
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 truncate text-[10px] text-gray-400">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-gray-300 hover:bg-white/10 active:bg-white/20"
          >
            <span className="text-lg leading-none" aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 text-sm">{children}</div>
      </div>
    </div>
  );
}
