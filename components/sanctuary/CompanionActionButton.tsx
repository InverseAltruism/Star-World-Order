// [SWO_V2_COMPANION_INTERACTABLES_POLISH]
// Shared interactable for the companion surface. One component renders
// every variant (idle / hover / pressed / disabled / sleeping / cooldown /
// selected) so the variant story lives in one place rather than scattered
// across each call site.

'use client';

import type { CSSProperties, ReactNode } from 'react';
import {
  resolveCompanionActionState,
  companionActionVariantClasses,
  type CompanionActionId,
} from '@/lib/sanctuary/companionAction';
import { CompanionActionIcon } from './CompanionActionIcon';

export interface CompanionActionButtonProps {
  action: CompanionActionId;
  label: string;
  busy: CompanionActionId | null;
  isSleeping: boolean;
  cooldownSeconds?: number;
  isSelected?: boolean;
  onActivate: (action: CompanionActionId) => void;
  /** Override the default pixel-art icon. Used by tests / future asset swaps. */
  iconSlot?: ReactNode;
  /** Override the default cooldown / sleeping badge. */
  badgeSlot?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Small "what this gives" hint under the label, e.g. "+25 hunger". */
  effectHint?: ReactNode;
}

export default function CompanionActionButton({
  action,
  label,
  busy,
  isSleeping,
  cooldownSeconds,
  isSelected,
  onActivate,
  iconSlot,
  badgeSlot,
  effectHint,
  className = '',
  style,
}: CompanionActionButtonProps) {
  const resolved = resolveCompanionActionState({
    action,
    busy,
    isSleeping,
    cooldownSeconds,
    isSelected,
  });

  const variantClass = companionActionVariantClasses(resolved.state);
  const working = resolved.state === 'pressed';

  return (
    <button
      type="button"
      onClick={() => onActivate(action)}
      disabled={resolved.disabled}
      aria-label={resolved.ariaLabel}
      title={resolved.title}
      data-state={resolved.state}
      data-action={action}
      className={`companion-action-button chrome-button ${variantClass} ${className}`}
      style={style}
    >
      <span className="companion-action-button__icon" aria-hidden="true">
        {iconSlot ?? (
          <CompanionActionIcon
            action={action}
            working={working}
            size={24}
          />
        )}
      </span>
      <span className="companion-action-button__label font-['Press_Start_2P']">
        {label}
      </span>
      {effectHint ? (
        <span className="companion-action-button__effect font-['Press_Start_2P']" aria-hidden="true">
          {effectHint}
        </span>
      ) : null}
      {(badgeSlot ?? resolved.badge) ? (
        <span
          className="companion-action-button__badge font-['Press_Start_2P']"
          aria-hidden="true"
        >
          {badgeSlot ?? resolved.badge}
        </span>
      ) : null}
    </button>
  );
}
