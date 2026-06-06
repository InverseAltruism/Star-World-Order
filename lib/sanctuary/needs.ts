/**
 * Pure helper for V2.4 companion vitality need alerts
 * (`[SWO_V2_COMPANION_NEED_ALERTS]`).
 *
 * Identifies which vitality stats (`hunger`, `happiness`, `energy`) have
 * dropped below the soft-alert threshold so the HUD can render a single
 * non-blocking alert badge. Also exposes downward-crossing detection so the
 * caller can ensure each per-stat alert fires at most once per cross
 * (i.e. does not re-fire while the stat stays low).
 *
 * No DB / Phaser / React imports — keeps the helper trivially unit-testable
 * and reusable from CompanionHUD and any future need-driven UI.
 */

export const NEED_ALERT_THRESHOLD = 30;

export type NeedKey = 'hunger' | 'happiness' | 'energy';

/** Subset of the companion vitality snapshot needed to derive alerts. */
export interface NeedStats {
  hunger: number | null | undefined;
  happiness: number | null | undefined;
  energy: number | null | undefined;
}

const NEED_KEYS: readonly NeedKey[] = ['hunger', 'happiness', 'energy'] as const;

const NEED_LABEL: Readonly<Record<NeedKey, string>> = Object.freeze({
  hunger: 'Hungry',
  happiness: 'Lonely',
  energy: 'Sleepy',
});

/** Action hint shown in the tooltip — matches CompanionMenu radial actions. */
const NEED_HINT: Readonly<Record<NeedKey, string>> = Object.freeze({
  hunger: 'feed',
  happiness: 'talk',
  energy: 'rest',
});

const NEED_ICON: Readonly<Record<NeedKey, string>> = Object.freeze({
  hunger: '\u{1F37D}\u{FE0F}',
  happiness: '\u{1F4AC}',
  energy: '\u{1F4A4}',
});

function isLow(value: number | null | undefined, threshold: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value < threshold;
}

/**
 * Returns the stats currently below the soft-alert threshold, in canonical
 * order (`hunger`, `happiness`, `energy`). Null/undefined stats (legacy
 * companions without V2.4 vitality data) are skipped.
 */
export function lowStats(
  stats: NeedStats,
  threshold: number = NEED_ALERT_THRESHOLD,
): NeedKey[] {
  const out: NeedKey[] = [];
  for (const key of NEED_KEYS) {
    if (isLow(stats[key], threshold)) out.push(key);
  }
  return out;
}

/**
 * Returns the stats that have newly crossed below the threshold this update
 * (were ≥threshold previously, now <threshold). Use to enforce the
 * "fires at most once per stat per cross" contract — once a stat is low and
 * acknowledged, it should not refire until it crosses back up and down.
 *
 * `prev = null` represents the very first observation, in which case no
 * crossings are reported (we never alert on initial mount even if the stat
 * is already low — only on observed transitions).
 */
export function newlyCrossed(
  prev: NeedStats | null | undefined,
  next: NeedStats,
  threshold: number = NEED_ALERT_THRESHOLD,
): NeedKey[] {
  if (!prev) return [];
  const wasLow = new Set(lowStats(prev, threshold));
  return lowStats(next, threshold).filter((k) => !wasLow.has(k));
}

/** Tooltip text describing every currently-low stat with action hints. */
export function describeNeeds(
  stats: NeedStats,
  threshold: number = NEED_ALERT_THRESHOLD,
): string {
  const low = lowStats(stats, threshold);
  if (low.length === 0) return '';
  return low.map((k) => `${NEED_LABEL[k]} — ${NEED_HINT[k]}`).join(' · ');
}

/**
 * Pick a single icon for the alert badge. When exactly one stat is low we
 * surface its specific glyph; with multiple low stats we collapse to the
 * generic warning glyph so the HUD remains a single icon.
 */
export function alertIcon(low: readonly NeedKey[]): string {
  if (low.length === 0) return '';
  if (low.length === 1) return NEED_ICON[low[0]];
  return '\u{26A0}\u{FE0F}';
}

export const NEED_ALERT_INTERNALS = Object.freeze({
  NEED_KEYS,
  NEED_LABEL,
  NEED_HINT,
  NEED_ICON,
});
