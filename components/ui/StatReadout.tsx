'use client';

import { forwardRef } from 'react';
import { cn } from './cn';

const ACCENT: Record<string, string> = {
  gold: 'var(--color-gold)',
  cyan: 'var(--color-cyan)',
  purple: 'var(--color-purple)',
  green: 'var(--color-green)',
  magenta: 'var(--color-magenta)',
  fg: 'var(--color-fg)',
};

export interface StatReadoutProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  /** Accent color token for the value (default gold). */
  accent?: keyof typeof ACCENT;
  /** Small unit/suffix shown after the value (e.g. "STAR", "MON"). */
  unit?: string;
}

/**
 * SWO V2 StatReadout — numeric HUD figure in Departure Mono (--font-hud) for
 * clean tabular alignment. Label is uppercase pixel-ui, value is mono.
 */
export const StatReadout = forwardRef<HTMLDivElement, StatReadoutProps>(function StatReadout(
  { className, label, value, accent = 'gold', unit, ...props },
  ref
) {
  const color = ACCENT[accent] ?? ACCENT.gold;
  return (
    <div
      ref={ref}
      className={cn('flex flex-col items-center gap-1 text-center', className)}
      {...props}
    >
      <span
        className="text-[8px] uppercase tracking-widest text-fg-dim"
        style={{ fontFamily: 'var(--font-ui)' }}
      >
        {label}
      </span>
      <span
        className="text-xl leading-none tabular-nums"
        style={{ fontFamily: 'var(--font-hud)', color, textShadow: `0 0 12px ${color}55` }}
      >
        {value}
        {unit && <span className="ml-1 text-[10px] text-fg-muted">{unit}</span>}
      </span>
    </div>
  );
});
