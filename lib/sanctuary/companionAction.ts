// [SWO_V2_COMPANION_INTERACTABLES_POLISH]
// Pure helpers for companion action interactables. These are split out from
// the React component so the variant matrix (idle / pressed / disabled /
// sleeping / cooldown / selected) can be unit-tested in node without a DOM.

import {
  PREFERENCE_BOND_MULTIPLIER,
  NEED_BOOST_MULTIPLIER,
  type PreferenceLevel,
} from './preferences';

export type CompanionActionId = 'feed' | 'pet' | 'talk' | 'sleep' | 'play';

export type CompanionActionState =
  | 'idle'
  | 'hover'
  | 'pressed'
  | 'disabled'
  | 'sleeping'
  | 'cooldown'
  | 'selected';

export interface CompanionActionMeta {
  id: CompanionActionId;
  label: string;
  // Cozy-tone status hint surfaced via aria-label / title when the action
  // can't fire right now (used as the explanatory "Why can't I tap this?"
  // line). Never user-triggered as a primary affordance.
  blockedHint: string;
}

export const COMPANION_ACTIONS: readonly CompanionActionMeta[] = [
  { id: 'feed', label: 'Feed', blockedHint: 'sleeping — try again on wake' },
  { id: 'pet', label: 'Pet', blockedHint: 'sleeping — try again on wake' },
  { id: 'talk', label: 'Talk', blockedHint: 'sleeping — try again on wake' },
  { id: 'sleep', label: 'Sleep', blockedHint: 'already dreaming' },
  { id: 'play', label: 'Play', blockedHint: 'sleeping — try again on wake' },
];

export interface CompanionActionInput {
  action: CompanionActionId;
  /** The action currently being dispatched, or `null` when idle. */
  busy: CompanionActionId | null;
  /** True when companion has `is_sleeping === 1`. */
  isSleeping: boolean;
  /** Per-action cooldown remaining, in seconds. 0 / undefined → no cooldown. */
  cooldownSeconds?: number;
  /** True when the consumer wants this button rendered as the selected one. */
  isSelected?: boolean;
}

export interface CompanionActionResolved {
  state: CompanionActionState;
  disabled: boolean;
  ariaLabel: string;
  title: string;
  /** Short text shown in the corner badge slot, e.g. "12s" or "💤". `null` → no badge. */
  badge: string | null;
}

const ACTION_META = new Map<CompanionActionId, CompanionActionMeta>(
  COMPANION_ACTIONS.map((m) => [m.id, m]),
);

/**
 * Resolve the variant + a11y story for a single action button. Order of
 * precedence (highest wins):
 *
 *   1. `pressed`   — this button is the one currently dispatching
 *   2. `disabled`  — some OTHER action is currently dispatching
 *   3. `cooldown`  — this action has a positive cooldown
 *   4. `sleeping`  — companion is asleep and this action isn't `sleep`
 *   5. `selected`  — caller wants this button highlighted (purely cosmetic)
 *   6. `idle`      — default
 *
 * `hover` is reserved for CSS-only :hover and isn't returned here.
 */
export function resolveCompanionActionState(
  input: CompanionActionInput,
): CompanionActionResolved {
  const meta = ACTION_META.get(input.action);
  if (!meta) {
    throw new Error(`Unknown companion action: ${input.action}`);
  }
  const cooldown = Math.max(0, Math.floor(input.cooldownSeconds ?? 0));
  const isPressed = input.busy === input.action;
  const isOtherBusy = input.busy !== null && input.busy !== input.action;
  const sleepBlocks = input.isSleeping && input.action !== 'sleep';

  let state: CompanionActionState;
  let badge: string | null = null;
  let title = meta.label;

  if (isPressed) {
    state = 'pressed';
    title = `${meta.label} (working...)`;
  } else if (isOtherBusy) {
    state = 'disabled';
    title = `${meta.label} (${input.busy} in progress)`;
  } else if (cooldown > 0) {
    state = 'cooldown';
    badge = formatCooldownBadge(cooldown);
    title = `${meta.label} (ready in ${badge})`;
  } else if (sleepBlocks) {
    state = 'sleeping';
    badge = '\u{1F4A4}'; // 💤 — moon-Z, single status glyph (not a primary affordance)
    title = `${meta.label} — ${meta.blockedHint}`;
  } else if (input.isSelected) {
    state = 'selected';
  } else {
    state = 'idle';
  }

  const disabled =
    state === 'pressed' ||
    state === 'disabled' ||
    state === 'cooldown' ||
    state === 'sleeping';

  return {
    state,
    disabled,
    ariaLabel: title,
    title,
    badge,
  };
}

/**
 * Compose Tailwind-ish class fragments for a button variant. Kept as a
 * helper rather than inline ternaries so all six variants live in one
 * legible place. Returned string never includes layout/spacing classes —
 * those belong to the consuming component.
 */
export function companionActionVariantClasses(
  state: CompanionActionState,
): string {
  switch (state) {
    case 'pressed':
      return 'companion-action--pressed';
    case 'disabled':
      return 'companion-action--disabled';
    case 'cooldown':
      return 'companion-action--cooldown';
    case 'sleeping':
      return 'companion-action--sleeping';
    case 'selected':
      return 'companion-action--selected';
    case 'hover':
      return 'companion-action--hover';
    case 'idle':
    default:
      return 'companion-action--idle';
  }
}

/**
 * [SWO_V2_SANCTUARY_PREFERENCE_PROFILE]
 *
 * UI badge string for an action's revealed preference level. The journal
 * reveals the preference after N matched interactions; before that the UI
 * should pass `null` (or no preference at all) and this helper will hide the
 * badge. Empty string means "no badge" so callers can render it directly.
 */
export function companionActionPreferenceBadge(
  level: PreferenceLevel | null | undefined,
): string {
  switch (level) {
    case 'loved':
      return '\u{2665}\u{FE0F}'; // ♥️
    case 'liked':
      return '\u{1F44D}'; // 👍
    case 'neutral':
      return '';
    case 'disliked':
      return '\u{1F44E}'; // 👎
    case 'hated':
      return '\u{1F494}'; // 💔
    default:
      return '';
  }
}

/**
 * [SWO_V2_SANCTUARY_PREFERENCE_PROFILE]
 *
 * Compute the bond-delta preview the UI shows when hovering an action
 * tile. Combines the action's baseline bond gain with the preference and
 * need-state multipliers. Returns a number — formatting (sign, rounding) is
 * left to the consuming component.
 */
export function previewBondDelta(input: {
  baseline: number;
  preference: PreferenceLevel;
  needBoosted?: boolean;
}): number {
  const prefMult = PREFERENCE_BOND_MULTIPLIER[input.preference];
  const needMult = input.needBoosted ? NEED_BOOST_MULTIPLIER : 1;
  return input.baseline * prefMult * needMult;
}

/** Round a cooldown to a compact label like "12s" / "1m" / "1h". */
export function formatCooldownBadge(secondsRaw: number): string {
  const seconds = Math.max(0, Math.floor(secondsRaw));
  if (seconds <= 0) return '';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}
