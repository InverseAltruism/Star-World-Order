/**
 * Pure helper for `[SWO_V2_COMPANION_BOND_MILESTONE_CELEBRATE]`.
 *
 * Detects when a companion's `bond_score` crosses one of the milestone
 * thresholds [25, 50, 75, 100] in the upward direction between two
 * consecutive observations. Each crossed threshold is reported once per
 * companion — callers persist the highest-celebrated threshold (per token)
 * and pass it back in as `lastCelebrated` so a stat that wobbles around a
 * threshold cannot retrigger the same celebration.
 *
 * No DB / Phaser / React imports — kept trivially unit-testable so the
 * Companion screen, V2 CompanionMenu, and any future surface can share one
 * detector.
 */

export const BOND_MILESTONES: readonly number[] = [25, 50, 75, 100] as const;

export type BondMilestone = (typeof BOND_MILESTONES)[number];

/**
 * Returns the milestones that were crossed upward strictly between `prev`
 * and `next`, excluding any threshold ≤ `lastCelebrated`. Output is sorted
 * ascending and deduplicated.
 *
 * Rules:
 *  - prev = null/undefined (first observation): no crossings reported. We
 *    only celebrate observed transitions, never initial mount, even if the
 *    bond is already past a threshold.
 *  - next ≤ prev: no upward crossings, returns []. Downward movement never
 *    fires a celebration.
 *  - lastCelebrated guards against re-firing if the persisted history
 *    already covers a threshold (e.g. after a refresh, or after a small
 *    decay nudges the score back below 25 then back above).
 *  - Non-finite / NaN inputs collapse to safe behaviour (no crossings).
 */
export function crossedBondMilestones(
  prev: number | null | undefined,
  next: number | null | undefined,
  lastCelebrated: number | null | undefined = null,
): BondMilestone[] {
  const before = clampScore(prev);
  const after = clampScore(next);
  if (before === null || after === null) return [];
  if (after <= before) return [];
  const guard = typeof lastCelebrated === 'number' && Number.isFinite(lastCelebrated)
    ? lastCelebrated
    : -Infinity;
  return BOND_MILESTONES.filter(
    (m) => m > before && m <= after && m > guard,
  );
}

/** Convenience: highest milestone in a list (or null). */
export function highestMilestone(
  milestones: readonly BondMilestone[],
): BondMilestone | null {
  if (milestones.length === 0) return null;
  return milestones.reduce((a, b) => (b > a ? b : a));
}

/**
 * Player-facing celebration banner copy for a milestone.
 * `name` is the companion's display name (nickname or "Skrumpey #N").
 */
export function bondMilestoneBanner(
  milestone: BondMilestone,
  name: string,
): string {
  const safeName = name && name.trim().length > 0 ? name.trim() : 'your companion';
  switch (milestone) {
    case 25:
      return `\u{1F497} You and ${safeName} are growing closer.`;
    case 50:
      return `\u{1F497} Halfway bonded — ${safeName} truly trusts you now.`;
    case 75:
      return `\u{1F497} ${safeName} has chosen you as their person.`;
    case 100:
      return `\u{1F497} Devoted forever — ${safeName} loves you completely.`;
    default:
      return `\u{1F497} You and ${safeName} are growing closer.`;
  }
}

function clampScore(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

/**
 * Persisted "highest milestone already celebrated" guard, keyed by token id.
 * Lives in `localStorage` so a refresh / second surface (Companion screen +
 * V2 world menu) cannot re-fire the same banner. Browser-only — server
 * callers should pass `lastCelebrated` directly to `crossedBondMilestones`.
 */
export const BOND_MILESTONE_STORAGE_PREFIX = 'swo:sanctuary:bondMilestone:';

export function readLastCelebratedMilestone(tokenId: number): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(
      `${BOND_MILESTONE_STORAGE_PREFIX}${tokenId}`,
    );
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLastCelebratedMilestone(
  tokenId: number,
  milestone: number,
): void {
  if (typeof window === 'undefined') return;
  try {
    const current = readLastCelebratedMilestone(tokenId);
    // Never lower the watermark — only ratchet upward.
    if (current !== null && current >= milestone) return;
    window.localStorage.setItem(
      `${BOND_MILESTONE_STORAGE_PREFIX}${tokenId}`,
      String(milestone),
    );
  } catch {
    // localStorage may be unavailable (private mode); celebrations will
    // simply re-fire on a subsequent crossing — non-fatal.
  }
}
