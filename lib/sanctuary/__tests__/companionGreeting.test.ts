// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  greetingForMood,
  journalLineForAction,
  lastVisitedPhrase,
  preferenceClueLine,
  timeOfDayPrefix,
  type CozyAction,
  type CozyMood,
} from '../companionGreeting';
import { PREFERENCE_CLUE_REVEAL_N, preferenceClueRevealed } from '../preferences';

describe('greetingForMood', () => {
  it('substitutes the companion name into the line', () => {
    const out = greetingForMood('Pico', 'happy', false, 0);
    expect(out).toContain('Pico');
    expect(out).not.toContain('{name}');
  });

  it('returns a sleeping line when isSleeping=true regardless of mood', () => {
    const out = greetingForMood('Pico', 'happy', true, 0);
    expect(out.toLowerCase()).toMatch(/dream|asleep|snore/);
  });

  it('falls back to idle pool when mood is unknown', () => {
    const out = greetingForMood('Pico', 'unknown-mood', false, 0);
    expect(out).toBe(greetingForMood('Pico', 'idle', false, 0));
  });

  it('falls back to idle pool when mood is null', () => {
    const out = greetingForMood('Pico', null, false, 0);
    expect(out).toBe(greetingForMood('Pico', 'idle', false, 0));
  });

  it('is deterministic given the same inputs', () => {
    expect(greetingForMood('Pico', 'happy', false, 0)).toBe(
      greetingForMood('Pico', 'happy', false, 0),
    );
  });

  it('cycles across days for the same companion+mood', () => {
    const seen = new Set<string>();
    for (let day = 0; day < 30; day++) {
      seen.add(greetingForMood('Pico', 'happy', false, day));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('covers every CozyMood without throwing or returning empty', () => {
    const moods: CozyMood[] = [
      'happy', 'excited', 'calm', 'sleepy', 'curious',
      'sleeping', 'hungry', 'lonely', 'idle',
    ];
    for (const mood of moods) {
      const out = greetingForMood('Pico', mood, false, 0);
      expect(out.length).toBeGreaterThan(0);
      expect(out).toContain('Pico');
    }
  });
});

describe('lastVisitedPhrase', () => {
  const now = new Date('2026-05-01T12:00:00Z');

  it('returns null for missing input', () => {
    expect(lastVisitedPhrase(null, now)).toBeNull();
    expect(lastVisitedPhrase(undefined, now)).toBeNull();
    expect(lastVisitedPhrase('', now)).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(lastVisitedPhrase('not a date', now)).toBeNull();
  });

  it('returns null for clock-skew (future timestamps)', () => {
    expect(
      lastVisitedPhrase('2026-05-01 12:05:00', now),
    ).toBeNull();
  });

  it('returns null for very recent activity (<1 min) — action feedback covers it', () => {
    expect(
      lastVisitedPhrase('2026-05-01 11:59:30', now),
    ).toBeNull();
  });

  it('reads the SQLite YYYY-MM-DD HH:MM:SS form as UTC', () => {
    // 2 minutes ago in UTC.
    const phrase = lastVisitedPhrase('2026-05-01 11:58:00', now);
    expect(phrase).toBe('You just popped in.');
  });

  it('reads ISO-8601 timestamps too', () => {
    const phrase = lastVisitedPhrase('2026-05-01T11:00:00.000Z', now);
    expect(phrase).toBe('1 hour since you visited.');
  });

  it('uses minutes phrasing under an hour', () => {
    const phrase = lastVisitedPhrase('2026-05-01 11:30:00', now);
    expect(phrase).toBe('30 minutes since you said hi.');
  });

  it('uses singular hour at the boundary', () => {
    const phrase = lastVisitedPhrase('2026-05-01 11:00:00', now);
    expect(phrase).toBe('1 hour since you visited.');
  });

  it('uses plural hours past the boundary', () => {
    const phrase = lastVisitedPhrase('2026-05-01 09:00:00', now);
    expect(phrase).toBe('3 hours since you visited.');
  });

  it('uses "almost a day" between 24h and 48h', () => {
    const phrase = lastVisitedPhrase('2026-04-30 09:00:00', now);
    expect(phrase).toMatch(/almost a day/i);
  });

  it('uses "{N} days — they missed you" between 2 and 7 days', () => {
    const phrase = lastVisitedPhrase('2026-04-28 09:00:00', now);
    expect(phrase).toMatch(/3 days/);
    expect(phrase).toMatch(/missed you/i);
  });

  it('uses the welcome-back phrasing past 7 days', () => {
    const phrase = lastVisitedPhrase('2026-04-20 09:00:00', now);
    expect(phrase).toMatch(/while/i);
    expect(phrase).toMatch(/came back/i);
  });

  it('never scolds — none of the phrases use guilt-trip language', () => {
    const samples = [
      lastVisitedPhrase('2026-04-30 09:00:00', now),
      lastVisitedPhrase('2026-04-28 09:00:00', now),
      lastVisitedPhrase('2026-04-20 09:00:00', now),
    ];
    for (const s of samples) {
      expect(s).not.toMatch(/abandon|forgot|neglect|left/i);
    }
  });
});

describe('timeOfDayPrefix', () => {
  it('returns the morning line for 5–11 (band: morning)', () => {
    expect(timeOfDayPrefix(5)).toBe('Good morning.');
    expect(timeOfDayPrefix(8)).toBe('Good morning.');
    expect(timeOfDayPrefix(11)).toBe('Good morning.');
  });

  it('returns the afternoon line for 12–16 (band: afternoon)', () => {
    expect(timeOfDayPrefix(12)).toBe('Good afternoon.');
    expect(timeOfDayPrefix(14)).toBe('Good afternoon.');
    expect(timeOfDayPrefix(16)).toBe('Good afternoon.');
  });

  it('returns the evening line for 17–21 (band: evening)', () => {
    expect(timeOfDayPrefix(17)).toBe('Evening, friend.');
    expect(timeOfDayPrefix(19)).toBe('Evening, friend.');
    expect(timeOfDayPrefix(21)).toBe('Evening, friend.');
  });

  it('returns the late-night line for 22–04 (band: late-night), wrapping past midnight', () => {
    expect(timeOfDayPrefix(22)).toBe('Up late?');
    expect(timeOfDayPrefix(23)).toBe('Up late?');
    expect(timeOfDayPrefix(0)).toBe('Up late?');
    expect(timeOfDayPrefix(2)).toBe('Up late?');
    expect(timeOfDayPrefix(4)).toBe('Up late?');
  });

  it('normalizes out-of-range or non-finite hours instead of throwing', () => {
    expect(() => timeOfDayPrefix(-7)).not.toThrow();
    expect(() => timeOfDayPrefix(99)).not.toThrow();
    // -7 wraps to 17 → evening
    expect(timeOfDayPrefix(-7)).toBe('Evening, friend.');
    // 99 wraps to 3 → late-night
    expect(timeOfDayPrefix(99)).toBe('Up late?');
    // NaN coerces to 0 → late-night
    expect(timeOfDayPrefix(Number.NaN)).toBe('Up late?');
  });

  it('never returns the empty string for any hour 0–23', () => {
    for (let h = 0; h < 24; h++) {
      const line = timeOfDayPrefix(h);
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it('partitions every hour 0–23 into one of the four band lines', () => {
    const allowed = new Set([
      'Good morning.',
      'Good afternoon.',
      'Evening, friend.',
      'Up late?',
    ]);
    for (let h = 0; h < 24; h++) {
      expect(allowed.has(timeOfDayPrefix(h))).toBe(true);
    }
  });
});

describe('journalLineForAction', () => {
  it('returns a non-empty string for every supported action', () => {
    const actions: CozyAction[] = ['feed', 'pet', 'talk', 'play', 'sleep'];
    for (const action of actions) {
      const line = journalLineForAction(action, '', 12);
      expect(line.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic given the same inputs', () => {
    expect(journalLineForAction('feed', 'happy', 12)).toBe(
      journalLineForAction('feed', 'happy', 12),
    );
  });

  it('rotates lines across the 6 hour-of-day buckets', () => {
    const seen = new Set<string>();
    for (let h = 0; h < 24; h++) {
      seen.add(journalLineForAction('feed', '', h));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('different moods at the same hour can pick different lines', () => {
    const lines = new Set<string>();
    for (const mood of ['happy', 'hungry', 'lonely', 'sleepy', 'idle']) {
      lines.add(journalLineForAction('pet', mood, 12));
    }
    // We don't require *all* differ (5 picks from a 5-line pool can collide),
    // but at least two of the five must be distinct.
    expect(lines.size).toBeGreaterThan(1);
  });

  it('treats negative or out-of-range hours safely (no throw)', () => {
    expect(() => journalLineForAction('pet', '', -7)).not.toThrow();
    expect(() => journalLineForAction('pet', '', 99)).not.toThrow();
    const line = journalLineForAction('pet', '', -7);
    expect(line.length).toBeGreaterThan(0);
  });
});

describe('preferenceClueLine — journal reveal copy', () => {
  it('returns null for neutral / null / undefined preference', () => {
    expect(preferenceClueLine('Pico', 'feed', 'neutral')).toBeNull();
    expect(preferenceClueLine('Pico', 'feed', null)).toBeNull();
    expect(preferenceClueLine('Pico', 'feed', undefined)).toBeNull();
  });

  it('writes the companion name into every revealed clue', () => {
    for (const action of ['feed', 'pet', 'talk', 'play', 'sleep'] as CozyAction[]) {
      for (const level of ['loved', 'liked', 'disliked', 'hated'] as const) {
        const line = preferenceClueLine('Pico', action, level);
        expect(line).not.toBeNull();
        expect(line!).toContain('Pico');
      }
    }
  });

  it('hated clue reads negatively (acceptance c surface)', () => {
    const line = preferenceClueLine('Pico', 'feed', 'hated');
    expect(line).toMatch(/flinch|something else|don't|doesn't|not into/i);
  });

  it('loved clue reads positively', () => {
    const line = preferenceClueLine('Pico', 'feed', 'loved');
    expect(line).toMatch(/glow|favorite|love|positively/i);
  });

  it('integrates with preferenceClueRevealed gating (acceptance d)', () => {
    // N-1 interactions: gate says "do not surface"; UI should pass null.
    expect(preferenceClueRevealed(PREFERENCE_CLUE_REVEAL_N - 1)).toBe(false);
    // N interactions: gate opens; clue renders.
    expect(preferenceClueRevealed(PREFERENCE_CLUE_REVEAL_N)).toBe(true);
    const revealedLine = preferenceClueLine('Pico', 'pet', 'loved');
    expect(revealedLine).not.toBeNull();
  });
});
