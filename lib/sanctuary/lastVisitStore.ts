/**
 * Per-companion "you opened the screen at" marker for
 * `[SWO_V2_COMPANION_LOCAL_VISIT_MARKER]`.
 *
 * The cozy last-visited line on the Companion screen used to read off the
 * server-side `stats_updated_at` column. That timestamp only moves when the
 * player actually interacts (feed/pet/etc.), so opening the screen after a
 * quiet period without acting always showed a stale "X hours since you
 * visited" line. This module persists a per-token-id `localStorage` map of
 * page-open timestamps independent of any server state, so the line refreshes
 * on every page-open even when the player just lurks.
 *
 * Public surface:
 *   - readLastVisit(tokenId)         → ms-since-epoch of the last marker, or null
 *   - writeLastVisit(tokenId, nowMs) → records the marker for that token
 *   - freshestVisitIso(localMs, statsUpdatedAt) → whichever of the two is
 *     fresher, returned as an ISO string ready to feed `lastVisitedPhrase`.
 *
 * All functions accept an optional `storage` parameter so tests can pass an
 * in-memory shim instead of relying on a DOM environment. In production the
 * default storage resolves to `window.localStorage`, gracefully returning
 * null when called from SSR or when storage is denied (private mode, etc.).
 */

export const LAST_VISIT_STORAGE_KEY = 'swo:sanctuary:lastVisit';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readMap(storage: StorageLike): Record<string, number> {
  let raw: string | null;
  try {
    raw = storage.getItem(LAST_VISIT_STORAGE_KEY);
  } catch {
    return {};
  }
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Returns the recorded last-visit time (ms since epoch) for `tokenId`, or
 * null when no marker has been written, when storage is unavailable, or when
 * the persisted blob is corrupted.
 */
export function readLastVisit(
  tokenId: number,
  storage: StorageLike | null = defaultStorage(),
): number | null {
  if (!storage) return null;
  if (!Number.isFinite(tokenId)) return null;
  const map = readMap(storage);
  const value = map[String(tokenId)];
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/**
 * Records `nowMs` as the visit marker for `tokenId`. Other tokens already in
 * the map are preserved. No-op when storage is unavailable, when `nowMs` is
 * not a finite positive number, or when the underlying setItem throws (quota
 * exceeded, private mode, etc.) — never throws to the caller.
 */
export function writeLastVisit(
  tokenId: number,
  nowMs: number = Date.now(),
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  if (!Number.isFinite(tokenId)) return;
  if (!Number.isFinite(nowMs) || nowMs <= 0) return;
  const map = readMap(storage);
  map[String(tokenId)] = nowMs;
  try {
    storage.setItem(LAST_VISIT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // quota / unavailable — non-fatal; the line will simply fall back to
    // stats_updated_at on the next render.
  }
}

/**
 * Returns the fresher of the two visit signals as an ISO-8601 string suitable
 * for `lastVisitedPhrase`, or null when neither input yields a usable
 * timestamp. The local marker wins ties — it represents an actual page-open
 * and is what the player just observed.
 */
export function freshestVisitIso(
  localMs: number | null,
  statsUpdatedAt: string | null | undefined,
): string | null {
  const local =
    typeof localMs === 'number' && Number.isFinite(localMs) && localMs > 0
      ? localMs
      : null;
  const stats = parseSqlOrIsoMs(statsUpdatedAt);
  if (local === null && stats === null) return null;
  const winner = Math.max(local ?? -Infinity, stats ?? -Infinity);
  if (!Number.isFinite(winner) || winner <= 0) return null;
  return new Date(winner).toISOString();
}

function parseSqlOrIsoMs(s: string | null | undefined): number | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  // SQLite CURRENT_TIMESTAMP form ('YYYY-MM-DD HH:MM:SS') is stored as UTC
  // by db.ts — append 'Z' so it parses as UTC, not the runtime's local zone.
  let candidate = trimmed;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    candidate = trimmed.replace(' ', 'T') + 'Z';
  }
  const ms = Date.parse(candidate);
  return Number.isFinite(ms) ? ms : null;
}
