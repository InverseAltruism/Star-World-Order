/**
 * Cozy/tamagotchi-voice helpers for the dedicated Companion screen
 * (`[SWO_V2_COMPANION_COZY_POLISH]`).
 *
 * Three pure helpers, no DB / Phaser / React imports so they can be
 * unit-tested in isolation and reused by CompanionView, db.ts journal
 * messages, and any future cozy surface (mobile widget, push copy, etc.):
 *
 *   - greetingForMood(name, mood, isSleeping) → cozy one-liner the
 *     companion says back at you on screen-mount or mood-change.
 *   - lastVisitedPhrase(stats_updated_at, now) → soft, non-punishing
 *     time-since-last-tend phrase ("you just popped in" / "they missed
 *     you"). Always reassuring; never scolding.
 *   - journalLineForAction(action, mood, hour) → deterministic-but-varied
 *     journal entry line per action × time-of-day, so two consecutive
 *     feedings don't store the same flat string.
 */

export type CozyMood =
  | 'happy'
  | 'excited'
  | 'calm'
  | 'sleepy'
  | 'curious'
  | 'sleeping'
  | 'hungry'
  | 'lonely'
  | 'idle';

export type CozyAction = 'feed' | 'pet' | 'talk' | 'sleep' | 'play';

const GREETINGS_BY_MOOD: Readonly<Record<CozyMood, readonly string[]>> = Object.freeze({
  happy: [
    '{name} lights up when you walk in.',
    '{name} is having a wonderful day with you.',
    '{name} gives a tiny happy chirp.',
  ],
  excited: [
    '{name} can hardly sit still — they missed you!',
    '{name} bounces over to greet you.',
    '{name} radiates good vibes.',
  ],
  calm: [
    '{name} settles in close, content.',
    '{name} sighs softly — all is well.',
    '{name} watches the stars with you.',
  ],
  sleepy: [
    '{name} blinks slowly — eyes heavy.',
    '{name} curls up beside you.',
    "{name}'s yawn is contagious.",
  ],
  curious: [
    "{name}'s eyes light up — what shall we explore today?",
    '{name} tilts their head, listening.',
    '{name} sniffs the air, alert.',
  ],
  sleeping: [
    '{name} is dreaming. Tiny snores. ✨',
    'Shhh — {name} is fast asleep.',
    '{name} dreams of cosmic snacks.',
  ],
  hungry: [
    '{name} eyes you hopefully — could it be snack time?',
    "{name}'s tummy is rumbling a little.",
    '{name} sniffs around for treats.',
  ],
  lonely: [
    "{name} perks up — they've been waiting for you.",
    '{name} nuzzles your hand. Some company at last.',
    '{name} looks relieved to see you.',
  ],
  idle: [
    '{name} is here, just being.',
    '{name} hums a tiny tune.',
    '{name} flicks an ear in your direction.',
  ],
});

/**
 * Pick a cozy greeting line for the companion screen header. Deterministic
 * given (name, mood, dayKey) so it doesn't reshuffle on every re-render —
 * `dayKey` defaults to UTC day of year so the line refreshes once per day.
 */
export function greetingForMood(
  name: string,
  mood: CozyMood | string | null | undefined,
  isSleeping: boolean = false,
  dayKey: number = utcDayOfYear(new Date()),
): string {
  const effectiveMood: CozyMood = isSleeping
    ? 'sleeping'
    : isCozyMood(mood)
      ? mood
      : 'idle';
  const pool = GREETINGS_BY_MOOD[effectiveMood] ?? GREETINGS_BY_MOOD.idle;
  const line = pool[Math.abs(hashString(name) + dayKey) % pool.length];
  return (line ?? GREETINGS_BY_MOOD.idle[0]).replace(/\{name\}/g, name);
}

/**
 * Soft, non-punishing time-since-last-tend phrase. Returns null when the
 * input is missing or unparseable so the UI can simply not render the line.
 *
 * Tone bands (deliberately reassuring, never guilt-tripping):
 *   - <  1 min      → null  (just-tended, no message; the action feedback
 *                            already covers the moment)
 *   - <  5 min      → "you just popped in"
 *   - < 60 min      → "X minutes since you said hi"
 *   - <  6 h        → "X hours since you visited"
 *   - <  24 h       → "X hours since you visited"
 *   - 1–2 days      → "almost {N} days — they perk up to see you"
 *   - 2–7 days      → "{N} days — they missed you"
 *   - >= 7 days     → "a while — they're so happy you came back"
 *
 * Negative deltas (clock skew / future timestamps) collapse to null.
 */
export function lastVisitedPhrase(
  statsUpdatedAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!statsUpdatedAt) return null;
  const t = parseSqlOrIsoMs(statsUpdatedAt);
  if (t === null) return null;
  const elapsedMs = now.getTime() - t;
  if (!(elapsedMs > 0)) return null;

  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) return null;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 5) return 'You just popped in.';
  if (minutes < 60) return `${minutes} minutes since you said hi.`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1
      ? '1 hour since you visited.'
      : `${hours} hours since you visited.`;
  }

  const days = Math.floor(hours / 24);
  if (days < 2) return 'Almost a day — they perk up to see you.';
  if (days < 7) return `${days} days — they missed you.`;
  return "It's been a while — they're so happy you came back.";
}

/**
 * Variety pool for journal entries written on each interaction. Picks a
 * line deterministically from (action, hour-of-day-bucket, mood) so the
 * same action at the same hour with the same mood always picks the same
 * line, but the next interaction (different mood or hour bucket) picks a
 * different one — avoids the previous flat single-line repetition.
 *
 * Keep lines short and warm — they appear in the last-3 journal panel
 * directly below the sprite, where tone matters more than detail.
 */
const ACTION_VARIANTS: Readonly<Record<CozyAction, readonly string[]>> = Object.freeze({
  feed: [
    'Enjoyed a tasty cosmic treat. Bond strengthened!',
    'Devoured a stardust snack with glee.',
    'Munched a moon-fruit slowly, savoring.',
    'Crunched a nebula cracker. Crumbs everywhere.',
    'Sipped warm comet broth and sighed.',
  ],
  pet: [
    'Received gentle pats. Feeling cozy and loved.',
    'Leaned into your hand and purred softly.',
    'Closed their eyes for a long, gentle scritch.',
    'Did the tiny happy wiggle when you reached down.',
    'Pressed their head into your palm. Pure trust.',
  ],
  talk: [
    'Had a heartfelt conversation with their owner.',
    'Listened intently as you shared the day.',
    'Chirped back in their own little language.',
    'Tilted their head at every word, fascinated.',
    'Settled in close to hear what you had to say.',
  ],
  play: [
    'Burned off some cosmic zoomies. Feels alive!',
    'Chased a dust mote across the sanctuary.',
    'Bounced in delight, a blur of joy.',
    'Wrestled with a star-thread until tired and grinning.',
    'Spun in circles, then collapsed laughing.',
  ],
  sleep: [
    'Curled up for a cosmic nap. Energy slowly returning.',
    'Tucked into a starlit doze. Tiny snores.',
    'Yawned wide, then drifted off on a moonbeam.',
    'Settled into the cozy nest, eyes closing.',
    'Dreaming of nebula meadows.',
  ],
});

/**
 * Pick a journal-line variant for an interaction. Deterministic given
 * (action, hourBucket, moodSeed) — same inputs always pick the same line,
 * but realistic input drift (hour ticks, mood changes) keeps the pool
 * rotating naturally across a session.
 *
 * `moodSeed` is any short string ("happy", "hungry", or "" if unknown);
 * we hash it to perturb the index so different moods at the same hour
 * still pick different lines. Pass an empty string when no mood is known
 * — the function still rotates by hour-of-day bucket.
 */
export function journalLineForAction(
  action: CozyAction,
  moodSeed: string = '',
  hour: number = new Date().getHours(),
): string {
  const pool = ACTION_VARIANTS[action] ?? [];
  if (pool.length === 0) return '';
  const hourBucket = Math.floor((((hour % 24) + 24) % 24) / 4);
  const idx = Math.abs(hashString(moodSeed) + hourBucket) % pool.length;
  return pool[idx] ?? pool[0];
}

// ---------------------------------------------------------------------------
// internal helpers (no exports below this line are part of the public API)
// ---------------------------------------------------------------------------

const COZY_MOODS: readonly CozyMood[] = [
  'happy', 'excited', 'calm', 'sleepy', 'curious',
  'sleeping', 'hungry', 'lonely', 'idle',
];

function isCozyMood(value: unknown): value is CozyMood {
  return typeof value === 'string' && (COZY_MOODS as readonly string[]).includes(value);
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

function utcDayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

/**
 * Parse the SQLite `YYYY-MM-DD HH:MM:SS` snapshot timestamps used elsewhere
 * in db.ts (treated as UTC) or any ISO-8601 string. Returns ms-since-epoch
 * or null when the value is unparseable. Never throws.
 */
function parseSqlOrIsoMs(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  // SQLite CURRENT_TIMESTAMP form: 'YYYY-MM-DD HH:MM:SS' — append 'Z' so
  // it parses as UTC rather than the runtime's local zone.
  let candidate = trimmed;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    candidate = trimmed.replace(' ', 'T') + 'Z';
  }
  const ms = Date.parse(candidate);
  return Number.isFinite(ms) ? ms : null;
}
