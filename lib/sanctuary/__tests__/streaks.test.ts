import { describe, it, expect } from 'vitest';
import {
  applyVisit,
  crossedMilestones,
  highestStreakMilestone,
  streakChipLabel,
  streakMilestoneJournal,
  utcDayDelta,
  STREAK_MILESTONES,
  STREAK_PAUSE_GAP_DAYS,
  STREAK_RESET_GAP_DAYS,
  type StreakRow,
} from '../streaks';

// Anchor mid-day in UTC so day-boundary maths are unambiguous.
const D0 = new Date('2026-05-01T12:00:00Z');

function plusDays(base: Date, n: number): Date {
  return new Date(base.getTime() + n * 86_400_000);
}

function toSql(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function row(overrides: Partial<StreakRow> = {}): StreakRow {
  return {
    current_streak: 0,
    longest_streak: 0,
    last_visit_at: null,
    paused_since_at: null,
    ...overrides,
  };
}

describe('utcDayDelta', () => {
  it('returns 0 for same UTC day', () => {
    expect(utcDayDelta(toSql(D0), new Date('2026-05-01T23:59:00Z'))).toBe(0);
  });

  it('returns 1 for next day', () => {
    expect(utcDayDelta(toSql(D0), plusDays(D0, 1))).toBe(1);
  });

  it('returns 2 for one missed day', () => {
    expect(utcDayDelta(toSql(D0), plusDays(D0, 2))).toBe(2);
  });

  it('returns null for null input', () => {
    expect(utcDayDelta(null, D0)).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(utcDayDelta('not-a-date', D0)).toBeNull();
  });
});

describe('applyVisit — first visit bootstraps streak at 1', () => {
  it('initialises current_streak=1 from a null row', () => {
    const out = applyVisit(null, D0);
    expect(out.next.current_streak).toBe(1);
    expect(out.next.longest_streak).toBe(1);
    expect(out.next.paused_since_at).toBeNull();
    expect(out.status).toBe('active');
    expect(out.gapDays).toBeNull();
    expect(out.incremented).toBe(true);
    expect(out.reset).toBe(false);
    expect(out.milestonesCrossed).toEqual([]);
  });

  it('initialises from a row where last_visit_at is null', () => {
    const out = applyVisit(row(), D0);
    expect(out.next.current_streak).toBe(1);
  });
});

describe('applyVisit — same-day revisit is a no-op for the streak', () => {
  it('keeps current_streak unchanged across multiple opens in one UTC day', () => {
    const prev: StreakRow = row({
      current_streak: 5,
      longest_streak: 5,
      last_visit_at: toSql(D0),
    });
    const later = new Date('2026-05-01T22:00:00Z');
    const out = applyVisit(prev, later);
    expect(out.next.current_streak).toBe(5);
    expect(out.incremented).toBe(false);
    expect(out.gapDays).toBe(0);
    expect(out.milestonesCrossed).toEqual([]);
  });
});

describe('applyVisit — Acceptance #1: 1 missed day pauses the streak', () => {
  it('does NOT increment, does NOT reset — sets paused_since_at', () => {
    const prev: StreakRow = row({
      current_streak: 6,
      longest_streak: 6,
      last_visit_at: toSql(D0),
    });
    // Visit on D+2 (i.e. one missed UTC day in between).
    const visit = plusDays(D0, STREAK_PAUSE_GAP_DAYS);
    const out = applyVisit(prev, visit);
    expect(out.gapDays).toBe(2);
    expect(out.status).toBe('paused');
    expect(out.next.current_streak).toBe(6); // unchanged
    expect(out.next.longest_streak).toBe(6); // unchanged
    expect(out.next.paused_since_at).not.toBeNull();
    expect(out.incremented).toBe(false);
    expect(out.reset).toBe(false);
    expect(out.milestonesCrossed).toEqual([]);
  });

  it('resumes (increments) on the next consecutive day after a pause', () => {
    const prev: StreakRow = row({
      current_streak: 6,
      longest_streak: 6,
      last_visit_at: toSql(plusDays(D0, 2)),
      paused_since_at: toSql(plusDays(D0, 1)),
    });
    const visit = plusDays(D0, 3);
    const out = applyVisit(prev, visit);
    expect(out.next.current_streak).toBe(7);
    expect(out.next.longest_streak).toBe(7);
    expect(out.next.paused_since_at).toBeNull();
    expect(out.status).toBe('active');
    expect(out.incremented).toBe(true);
  });
});

describe('applyVisit — Acceptance #2: 2 consecutive misses reset the streak', () => {
  it('resets current_streak to 1 when the gap is ≥ 3 UTC days', () => {
    const prev: StreakRow = row({
      current_streak: 12,
      longest_streak: 12,
      last_visit_at: toSql(D0),
    });
    const visit = plusDays(D0, STREAK_RESET_GAP_DAYS);
    const out = applyVisit(prev, visit);
    expect(out.gapDays).toBe(3);
    expect(out.reset).toBe(true);
    expect(out.next.current_streak).toBe(1);
    expect(out.next.longest_streak).toBe(12); // retained — identity is preserved
    expect(out.next.paused_since_at).toBeNull();
    expect(out.status).toBe('active');
  });

  it('resets on much-longer absences (e.g. 14-day gap)', () => {
    const prev: StreakRow = row({
      current_streak: 30,
      longest_streak: 30,
      last_visit_at: toSql(D0),
    });
    const out = applyVisit(prev, plusDays(D0, 14));
    expect(out.reset).toBe(true);
    expect(out.next.current_streak).toBe(1);
    expect(out.next.longest_streak).toBe(30);
  });

  it('reports no milestones on reset beyond the new day-1 cross-of-0', () => {
    const prev: StreakRow = row({
      current_streak: 30,
      longest_streak: 30,
      last_visit_at: toSql(D0),
    });
    const out = applyVisit(prev, plusDays(D0, 5));
    expect(out.milestonesCrossed).toEqual([]); // 1 is not a milestone
  });
});

describe('applyVisit — Acceptance #3: milestones fire once', () => {
  it('reports the 7-day milestone exactly when current_streak crosses to 7', () => {
    const prev: StreakRow = row({
      current_streak: 6,
      longest_streak: 6,
      last_visit_at: toSql(D0),
    });
    const out = applyVisit(prev, plusDays(D0, 1));
    expect(out.next.current_streak).toBe(7);
    expect(out.milestonesCrossed).toEqual([7]);
  });

  it('reports the 14-day milestone exactly when current_streak crosses to 14', () => {
    const prev: StreakRow = row({
      current_streak: 13,
      longest_streak: 13,
      last_visit_at: toSql(D0),
    });
    const out = applyVisit(prev, plusDays(D0, 1));
    expect(out.milestonesCrossed).toEqual([14]);
  });

  it('reports the 30-day milestone exactly when current_streak crosses to 30', () => {
    const prev: StreakRow = row({
      current_streak: 29,
      longest_streak: 29,
      last_visit_at: toSql(D0),
    });
    const out = applyVisit(prev, plusDays(D0, 1));
    expect(out.milestonesCrossed).toEqual([30]);
  });

  it('does NOT re-fire a milestone already in lastMilestoneReported', () => {
    // Simulate: streak is 7, milestone 7 already journaled. Next day → streak 8.
    const prev: StreakRow = row({
      current_streak: 7,
      longest_streak: 7,
      last_visit_at: toSql(D0),
    });
    const out = applyVisit(prev, plusDays(D0, 1), { lastMilestoneReported: 7 });
    expect(out.next.current_streak).toBe(8);
    expect(out.milestonesCrossed).toEqual([]);
  });

  it('does NOT re-fire if streak wobbles down then back through a milestone', () => {
    // Streak hit 7, then was paused, then resumed and crossed 7 again on the
    // way up. The guard prevents a second journal entry.
    const prev: StreakRow = row({
      current_streak: 6,
      longest_streak: 7,
      last_visit_at: toSql(D0),
    });
    const out = applyVisit(prev, plusDays(D0, 1), { lastMilestoneReported: 7 });
    expect(out.next.current_streak).toBe(7);
    expect(out.milestonesCrossed).toEqual([]);
  });

  it('reports all crossed milestones in a single jump (sorted ascending)', () => {
    // Edge case: degenerate caller jumps streak from 6 → 14 in one apply.
    // crossedMilestones is the source of truth.
    expect(crossedMilestones(6, 14, null)).toEqual([7, 14]);
  });
});

describe('highestStreakMilestone', () => {
  it('returns the largest milestone in the list', () => {
    expect(highestStreakMilestone([7, 14])).toBe(14);
    expect(highestStreakMilestone([7])).toBe(7);
  });

  it('returns null for empty input', () => {
    expect(highestStreakMilestone([])).toBeNull();
  });
});

describe('streakChipLabel', () => {
  it('renders pluralised day counts', () => {
    expect(streakChipLabel(1, 'active')).toContain('1 day');
    expect(streakChipLabel(7, 'active')).toContain('7 days');
  });

  it('shows paused state explicitly', () => {
    expect(streakChipLabel(6, 'paused')).toContain('paused');
  });

  it('shows a start hint when streak is 0', () => {
    expect(streakChipLabel(0, 'active')).toMatch(/start/i);
  });
});

describe('streakMilestoneJournal', () => {
  it('returns identity-shaped copy that mentions the companion name', () => {
    const entry = streakMilestoneJournal(7, 'Lumi');
    expect(entry).toContain('Lumi');
    expect(entry.length).toBeGreaterThan(0);
  });

  it('uses different copy at each milestone', () => {
    const e7 = streakMilestoneJournal(7, 'Lumi');
    const e14 = streakMilestoneJournal(14, 'Lumi');
    const e30 = streakMilestoneJournal(30, 'Lumi');
    expect(new Set([e7, e14, e30]).size).toBe(3);
  });

  it('falls back gracefully on blank names', () => {
    expect(streakMilestoneJournal(7, '   ').length).toBeGreaterThan(0);
  });
});

describe('STREAK_MILESTONES constant', () => {
  it('matches the V2 plan: 7 / 14 / 30', () => {
    expect([...STREAK_MILESTONES]).toEqual([7, 14, 30]);
  });
});

// ---------------------------------------------------------------------------
// Integration-level scenario — Playwright stand-in for the 9-day timeline.
// Simulates the player visiting on days 1-7, missing day 8, returning day 9.
// Asserts: streak still active on day 9, 7-day milestone journal fired once.
// ---------------------------------------------------------------------------
describe('[E2E shape] 9-day timeline with one missed day', () => {
  it('keeps the streak active on day 9 and journals the 7-day milestone once', () => {
    const day1 = new Date('2026-05-01T10:00:00Z');
    const days = (n: number) => plusDays(day1, n - 1);

    let state: StreakRow = row();
    let lastMilestoneReported: number | null = null;
    const journal: number[] = [];

    function tick(now: Date) {
      const out = applyVisit(state, now, { lastMilestoneReported });
      state = out.next;
      for (const m of out.milestonesCrossed) {
        journal.push(m);
        if (lastMilestoneReported === null || m > lastMilestoneReported) {
          lastMilestoneReported = m;
        }
      }
      return out;
    }

    // Days 1-7: consecutive visits → streak hits 7 on day 7.
    for (let d = 1; d <= 7; d++) {
      tick(days(d));
    }
    expect(state.current_streak).toBe(7);
    expect(state.longest_streak).toBe(7);
    expect(state.paused_since_at).toBeNull();
    expect(journal).toEqual([7]); // milestone fired once on day 7

    // Day 8: skipped (no tick).

    // Day 9: returns. Gap = 2 → streak pauses at 7.
    const out9 = tick(days(9));
    expect(out9.gapDays).toBe(2);
    expect(out9.status).toBe('paused');
    expect(state.current_streak).toBe(7); // still alive — identity preserved
    expect(state.paused_since_at).not.toBeNull();

    // Journal not re-fired by the pause day.
    expect(journal).toEqual([7]);

    // Sanity: Day 10 resumes → streak goes to 8.
    const out10 = tick(days(10));
    expect(out10.status).toBe('active');
    expect(state.current_streak).toBe(8);
    expect(journal).toEqual([7]); // still single-fire
  });

  it('a 2-missed-day gap (days 8-9 skipped, return day 10) resets to 1', () => {
    const day1 = new Date('2026-05-01T10:00:00Z');
    const days = (n: number) => plusDays(day1, n - 1);

    let state: StreakRow = row();
    let lastMilestoneReported: number | null = null;
    const journal: number[] = [];

    function tick(now: Date) {
      const out = applyVisit(state, now, { lastMilestoneReported });
      state = out.next;
      for (const m of out.milestonesCrossed) {
        journal.push(m);
        if (lastMilestoneReported === null || m > lastMilestoneReported) {
          lastMilestoneReported = m;
        }
      }
      return out;
    }

    for (let d = 1; d <= 7; d++) tick(days(d));
    expect(state.current_streak).toBe(7);

    // Skip days 8 AND 9. Return day 10 → gap = 3 → reset.
    const out10 = tick(days(10));
    expect(out10.reset).toBe(true);
    expect(out10.gapDays).toBe(3);
    expect(state.current_streak).toBe(1);
    expect(state.longest_streak).toBe(7); // identity preserved
    expect(journal).toEqual([7]); // still only the original milestone
  });
});
