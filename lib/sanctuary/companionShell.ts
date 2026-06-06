/**
 * Pure helpers for `[SWO_V2_COMPANION_UI_SHELL_REDESIGN]`.
 *
 * The Companion screen is laid out as a tamagotchi-style shell with five
 * explicit zones — header/bond, viewport, needs, action dock, journal teaser.
 * These helpers encode the small bits of view-model logic that the JSX would
 * otherwise carry inline (button press states, bond progress segments,
 * desktop-vs-mobile zone ordering). Keeping them pure means the shell's
 * behaviour is unit-testable in vitest without a DOM.
 *
 * No DB / Phaser / React imports.
 */
import type { BondMilestone } from './bondMilestones';

export type ShellZone =
  | 'header'
  | 'viewport'
  | 'needs'
  | 'actions'
  | 'journal';

export const SHELL_ZONES: readonly ShellZone[] = [
  'header',
  'viewport',
  'needs',
  'actions',
  'journal',
] as const;

export type ShellLayout = 'desktop' | 'mobile';

/**
 * Breakpoint (px). Below this, the shell stacks vertically and the action
 * dock anchors to the bottom of the viewport rather than sitting beside it.
 * Matches Tailwind's `md:` breakpoint so the React grid classes stay in
 * lockstep with the helper.
 */
export const SHELL_MOBILE_BREAKPOINT_PX = 768;

export function shellLayoutFor(viewportWidthPx: number): ShellLayout {
  if (!Number.isFinite(viewportWidthPx) || viewportWidthPx <= 0) {
    return 'mobile';
  }
  return viewportWidthPx >= SHELL_MOBILE_BREAKPOINT_PX ? 'desktop' : 'mobile';
}

/**
 * Display order of the shell zones depends on the layout — on mobile we put
 * the action dock immediately under the viewport (thumbs-down-the-bottom
 * tamagotchi feel) and shove the needs panel between the viewport and the
 * journal teaser; on desktop the needs panel hangs alongside the viewport.
 */
export function zoneOrderFor(layout: ShellLayout): readonly ShellZone[] {
  if (layout === 'desktop') {
    return ['header', 'viewport', 'needs', 'actions', 'journal'];
  }
  return ['header', 'viewport', 'actions', 'needs', 'journal'];
}

export type ActionId = 'feed' | 'pet' | 'talk' | 'sleep' | 'play';

export type ActionVisualState =
  | 'idle'
  | 'hover'
  | 'pressed'
  | 'busy'
  | 'sleep-locked'
  | 'disabled';

export interface ActionStateInput {
  /** id of the button being styled */
  id: ActionId;
  /** id of the action currently in flight (or null if none) */
  interacting: ActionId | null;
  /** `companion.is_sleeping === 1` */
  isSleeping: boolean;
  /** wallet/companion not yet ready */
  unavailable?: boolean;
}

/**
 * Resolves the visual state of an action button. Hover/pressed transitions
 * are handled by CSS pseudo-classes — this only encodes the *logical* state
 * decisions (busy spinner, sleep-locked, fully disabled). The CSS class map
 * below picks the matching frame for each state.
 */
export function resolveActionState(input: ActionStateInput): ActionVisualState {
  const { id, interacting, isSleeping, unavailable } = input;
  if (unavailable) return 'disabled';
  if (interacting === id) return 'busy';
  if (interacting !== null) return 'disabled';
  if (isSleeping && id !== 'sleep') return 'sleep-locked';
  return 'idle';
}

/**
 * CSS class fragments for each visual state. The base `companion-action-btn`
 * class lives in `globals.css` and provides the shared shell border + inner
 * pixel highlight; these modifiers override colour and shadow to give clear
 * idle / hover / pressed / disabled visuals.
 */
export const ACTION_STATE_CLASS: Record<ActionVisualState, string> = {
  idle: 'companion-action-btn--idle',
  hover: 'companion-action-btn--hover',
  pressed: 'companion-action-btn--pressed',
  busy: 'companion-action-btn--busy',
  'sleep-locked': 'companion-action-btn--sleep-locked',
  disabled: 'companion-action-btn--disabled',
};

export function actionStateClass(state: ActionVisualState): string {
  return ACTION_STATE_CLASS[state] ?? ACTION_STATE_CLASS.idle;
}

/**
 * Bond progress is segmented at the milestone thresholds [25, 50, 75, 100].
 * Returns the percentage filled and which milestone segment the bond is
 * currently working toward — used to draw the four-tick progress bar in
 * the header zone.
 */
export interface BondProgress {
  /** clamped score 0–100 */
  score: number;
  /** filled width as %, 0–100 */
  pct: number;
  /** next milestone the bond is reaching toward, or null if maxed */
  nextMilestone: BondMilestone | null;
  /** highest milestone already crossed, or null below 25 */
  reachedMilestone: BondMilestone | null;
}

const MILESTONES: readonly BondMilestone[] = [25, 50, 75, 100];

export function bondProgress(score: number | null | undefined): BondProgress {
  const raw = typeof score === 'number' && Number.isFinite(score) ? score : 0;
  const clamped = Math.max(0, Math.min(100, raw));
  let nextMilestone: BondMilestone | null = null;
  let reachedMilestone: BondMilestone | null = null;
  for (const m of MILESTONES) {
    if (clamped >= m) reachedMilestone = m;
    else if (nextMilestone === null) nextMilestone = m;
  }
  return {
    score: clamped,
    pct: clamped,
    nextMilestone,
    reachedMilestone,
  };
}

/**
 * Friendly hint shown under the bond bar when the next milestone is in
 * sight (within 10 points). Returns null otherwise so the header stays
 * uncluttered.
 */
export function bondHint(progress: BondProgress, name: string): string | null {
  const safeName = name && name.trim().length > 0 ? name.trim() : 'them';
  if (progress.nextMilestone === null) {
    return progress.reachedMilestone === 100
      ? `Devoted bond with ${safeName}.`
      : null;
  }
  const gap = progress.nextMilestone - progress.score;
  if (gap > 10) return null;
  return `Almost at ${progress.nextMilestone} bond with ${safeName}.`;
}

/**
 * Acceptance text for whether a button should be exposed as `aria-disabled`
 * to assistive tech. We split this from the visual state so a keyboard user
 * is never trapped on a button whose press would no-op.
 */
export function actionAriaDisabled(state: ActionVisualState): boolean {
  return state === 'disabled' || state === 'sleep-locked' || state === 'busy';
}
