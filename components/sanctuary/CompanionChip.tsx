// [SWO_V2_COMPANION_INTERACTABLES_POLISH]
// One outline-and-highlight language for the small text affordances on the
// companion surface (level pill, training pill, bond pill, mood pill).
// Centralises the cozy 1px border + warm-tinted background so individual
// call sites can't drift into ad-hoc styling.

import type { ReactNode } from 'react';

export type CompanionChipTone = 'neutral' | 'gold' | 'pink' | 'cyan' | 'purple' | 'warm';

const TONE_CLASS: Record<CompanionChipTone, string> = {
  neutral: 'companion-chip--neutral',
  gold: 'companion-chip--gold',
  pink: 'companion-chip--pink',
  cyan: 'companion-chip--cyan',
  purple: 'companion-chip--purple',
  warm: 'companion-chip--warm',
};

export interface CompanionChipProps {
  tone?: CompanionChipTone;
  icon?: ReactNode;
  children: ReactNode;
  /** Renders an extra-small hit-target pill for inline use. */
  compact?: boolean;
  className?: string;
}

export default function CompanionChip({
  tone = 'neutral',
  icon,
  children,
  compact = false,
  className = '',
}: CompanionChipProps) {
  return (
    <span
      className={`companion-chip ${TONE_CLASS[tone]} ${
        compact ? 'companion-chip--compact' : ''
      } font-['Press_Start_2P'] ${className}`}
    >
      {icon ? (
        <span className="companion-chip__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="companion-chip__label">{children}</span>
    </span>
  );
}
