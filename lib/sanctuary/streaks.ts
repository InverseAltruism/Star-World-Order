/**
 * [SWO_V2_SANCTUARY_STREAKS] — compassionate streak counter (PR5 of 7).
 *
 * Pure helpers for a "show up, but life happens" daily visit streak:
 *
 *   1. **Same-day revisit.** No change — opening the Sanctuary twice on the
 *      same UTC day keeps the streak as it was. We track visits, not opens.
 *   2. **Next-day visit.** Streak increments by 1. If the previous visit
 *      paused the streak (one missed day), the pause clears.
 *   3. **One missed day → pause.** When the gap is exactly two UTC days,
 *      the streak is paused (kept at its current value, `paused_since_at`
 *      stamps the missed day). Visiting the next day after a pause resumes
 *      and increments the streak.
 *   4. **Two consecutive missed days → reset.** A gap of ≥ 3 UTC days resets
 *      `current_streak` to 1 (today counts as the new day-1) and clears the
 *      pause.
 *
 * Milestones at 7 / 14 / 30 days fire once per crossing — they unlock a
 * journal entry, never a stat lift. The caller persists the highest reported
 * milestone (`lastMilestoneReported`) and passes it back to guard against
 * double-fire across surfaces / refresh.
 *
 * No DB / Phaser / React imports — keeps the module trivially unit-testable
 * and reusable by route handlers, the HUD chip, and any future surface.
 */
import { parseSqlDateMs } from './companionStats';

/** Milestones (days) that unlock identity-shaped journal entries. */
export const STREAK_MILESTONES: readonly number[] = [7, 14, 30] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

/** Day-gap thresholds. Numbers are UTC-day deltas, not hours. */
export const STREAK_PAUSE_GAP_DAYS = 2;
export const STREAK_RESET_GAP_DAYS = 3;

export const STREAK_JOURNAL_TAG = 'streak_milestone';

export interface StreakRow {
  current_streak: number;
  longest_streak: number;
  last_visit_at: string | null;
  paused_since_at: string | null;
}

export type StreakStatus = 'fresh' | 'active' | 'paused';

export interface StreakOutcome {
  next: StreakRow;
  /** Status after this visit, for the HUD chip and journal copy. */
  status: StreakStatus;
  /** Day-delta vs the prior visit (0 = same day, null = first visit). */
  gapDays: number | null;
  /** Whether `current_streak` increased on this tick. */
  incremented: boolean;
  /** Whether the streak was reset to 1 by a long gap. */
  reset: boolean;
  /** Milestones newly crossed by this visit (sorted ascending, deduped). */
  milestonesCrossed: StreakMilestone[];
}

/**
 * Number of whole UTC days between two SQLite-style timestamps. Uses UTC
 * midnight as the day boundary so timezone drift cannot artificially churn
 * the streak. Returns null on unparseable input so the caller can degrade
 * gracefully (treating the row as a first visit).
 */
export function utcDayDelta(
  fromSql: string | null,
  to: Date,
): number | null {
  if (!fromSql) return null;
  const ms = parseSqlDateMs(fromSql);
  if (ms === null) return null;
  const fromDay = Math.floor(ms / 86_400_000);
  const toDay = Math.floor(to.getTime() / 86_400_000);
  return toDay - fromDay;
}

/**
 * Apply a "visit recorded at `now`" event to the row. Pure — no DB / no
 * side effects. The caller decides whether to persist `outcome.next` and
 * whether to write `outcome.milestonesCrossed` into the journal.
 */
export function applyVisit(
  prev: StreakRow | null,
  now: Date,
  guard: { lastMilestoneReported?: number | null } = {},
): StreakOutcome {
  const lastReported = clampGuard(guard.lastMilestoneReported);
  const nowSql = toSqlUtc(now);

  // First-ever visit: streak = 1, no milestones reported, gap is null.
  if (!prev || prev.last_visit_at === null) {
    const next: StreakRow = {
      current_streak: 1,
      longest_streak: Math.max(1, prev?.longest_streak ?? 0),
      last_visit_at: nowSql,
      paused_since_at: null,
    };
    return {
      next,
      status: 'active',
      gapDays: null,
      incremented: true,
      reset: false,
      milestonesCrossed: crossedMilestones(0, 1, lastReported),
    };
  }

  const gap = utcDayDelta(prev.last_visit_at, now);

  // Unparseable timestamp — degrade by treating this visit as same-day so
  // we never accidentally reset on bad data.
  if (gap === null) {
    return {
      next: { ...prev, last_visit_at: nowSql },
      status: prev.paused_since_at ? 'paused' : 'active',
      gapDays: null,
      incremented: false,
      reset: false,
      milestonesCrossed: [],
    };
  }

  // Same UTC day — no change to streak or pause state. We still bump
  // last_visit_at so subsequent ticks compare against the latest visit.
  if (gap <= 0) {
    return {
      next: { ...prev, last_visit_at: nowSql },
      status: prev.paused_since_at ? 'paused' : 'active',
      gapDays: gap,
      incremented: false,
      reset: false,
      milestonesCrossed: [],
    };
  }

  // Next-day visit — increment streak, clear any pause, ratchet longest.
  if (gap === 1) {
    const beforeStreak = prev.current_streak;
    const afterStreak = beforeStreak + 1;
    const next: StreakRow = {
      current_streak: afterStreak,
      longest_streak: Math.max(prev.longest_streak, afterStreak),
      last_visit_at: nowSql,
      paused_since_at: null,
    };
    return {
      next,
      status: 'active',
      gapDays: gap,
      incremented: true,
      reset: false,
      milestonesCrossed: crossedMilestones(beforeStreak, afterStreak, lastReported),
    };
  }

  // Exactly one missed UTC day — pause (don't increment, don't reset).
  // Stamp `paused_since_at` with the missed day so the HUD can show how
  // long the streak has been paused. We keep `current_streak` unchanged.
  if (gap === STREAK_PAUSE_GAP_DAYS) {
    const pausedSince = prev.paused_since_at ?? toSqlUtc(addDays(now, -1));
    const next: StreakRow = {
      ...prev,
      last_visit_at: nowSql,
      paused_since_at: pausedSince,
    };
    return {
      next,
      status: 'paused',
      gapDays: gap,
      incremented: false,
      reset: false,
      milestonesCrossed: [],
    };
  }

  // Two or more missed UTC days — reset to 1, clear pause. Today is the
  // new day-1 of a fresh streak. longest_streak is retained.
  const next: StreakRow = {
    current_streak: 1,
    longest_streak: Math.max(prev.longest_streak, 1),
    last_visit_at: nowSql,
    paused_since_at: null,
  };
  return {
    next,
    status: 'active',
    gapDays: gap,
    incremented: true,
    reset: true,
    milestonesCrossed: crossedMilestones(0, 1, lastReported),
  };
}

/**
 * Milestones crossed strictly between `before` and `after`, guarded against
 * already-reported ones via `lastReported`. Always ascending + deduped.
 */
export function crossedMilestones(
  before: number,
  after: number,
  lastReported: number | null,
): StreakMilestone[] {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return [];
  if (after <= before) return [];
  const guard = lastReported === null ? -Infinity : lastReported;
  return STREAK_MILESTONES.filter((m) => m > before && m <= after && m > guard);
}

/** Highest milestone in a list (or null). */
export function highestStreakMilestone(
  milestones: readonly StreakMilestone[],
): StreakMilestone | null {
  if (milestones.length === 0) return null;
  return milestones.reduce((a, b) => (b > a ? b : a));
}

/** Player-facing journal copy for a streak milestone. Identity over power. */
export function streakMilestoneJournal(milestone: StreakMilestone, name: string): string {
  const safe = name && name.trim().length > 0 ? name.trim() : 'we';
  switch (milestone) {
    case 7:
      return `One full week together. ${safe} settled into a rhythm — I think they were waiting for me.`;
    case 14:
      return `Two weeks in. ${safe} greets me before I even sit down. This is who we are now.`;
    case 30:
      return `Thirty days. The sanctuary feels like our place. ${safe} is no longer "the new one".`;
    default:
      return `${safe} and I keep showing up for each other.`;
  }
}

/** HUD chip label — concise, glanceable. */
export function streakChipLabel(streak: number, status: StreakStatus): string {
  if (status === 'paused') return `🔥 ${streak} · paused`;
  if (streak <= 0) return '✨ start a streak';
  return `🔥 ${streak} day${streak === 1 ? '' : 's'}`;
}

function clampGuard(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function toSqlUtc(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
