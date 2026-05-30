'use client';

import { forwardRef } from 'react';
import { cn } from './cn';

export type FeatureAccent =
  | 'sanctuary'
  | 'casino'
  | 'dao'
  | 'raffle'
  | 'forge'
  | 'hangout'
  | 'gallery'
  | 'none';

const ACCENT_VAR: Record<FeatureAccent, string | undefined> = {
  sanctuary: 'var(--color-feature-sanctuary)',
  casino: 'var(--color-feature-casino)',
  dao: 'var(--color-feature-dao)',
  raffle: 'var(--color-feature-raffle)',
  forge: 'var(--color-feature-forge)',
  hangout: 'var(--color-feature-hangout)',
  gallery: 'var(--color-feature-gallery)',
  none: undefined,
};

export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Feature accent drives the corner glyph + glow color (token-based, no inline hex). */
  accent?: FeatureAccent;
  /** Adds hover lift + glow (use for clickable cards). */
  interactive?: boolean;
}

/**
 * SWO V2 Panel — composes the proven `.pixel-card` chrome behind a typed API.
 * `accent` sets a per-feature glow via design tokens.
 */
export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { className, accent = 'none', interactive = false, style, children, ...props },
  ref
) {
  const accentColor = ACCENT_VAR[accent];
  return (
    <div
      ref={ref}
      className={cn(
        'pixel-card relative',
        interactive && 'group cursor-pointer hover-lift',
        className
      )}
      style={{
        ...(accentColor ? ({ ['--panel-accent' as string]: accentColor } as React.CSSProperties) : {}),
        ...style,
      }}
      {...props}
    >
      {accentColor && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-2 right-2 text-[10px] opacity-40 transition-opacity group-hover:opacity-80"
          style={{ color: accentColor }}
        >
          ◆
        </span>
      )}
      {children}
    </div>
  );
});
