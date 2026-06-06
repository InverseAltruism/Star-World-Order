// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';

import {
  LAST_VISIT_STORAGE_KEY,
  freshestVisitIso,
  readLastVisit,
  writeLastVisit,
  type StorageLike,
} from '../lastVisitStore';

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  // Test-only helpers — not part of StorageLike.
  raw(key: string): string | null {
    return this.getItem(key);
  }

  preset(key: string, value: string): void {
    this.map.set(key, value);
  }

  size(): number {
    return this.map.size;
  }
}

class ThrowingStorage implements StorageLike {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getItem(_key: string): string | null {
    throw new Error('storage denied');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setItem(_key: string, _value: string): void {
    throw new Error('quota exceeded');
  }
}

describe('lastVisitStore — readLastVisit / writeLastVisit', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('returns null when no marker has been written', () => {
    expect(readLastVisit(1, storage)).toBeNull();
    expect(readLastVisit(42, storage)).toBeNull();
  });

  it('round-trips a written marker for a single token', () => {
    writeLastVisit(7, 1_700_000_000_000, storage);
    expect(readLastVisit(7, storage)).toBe(1_700_000_000_000);
  });

  it('keeps multiple token ids independent in the same map', () => {
    writeLastVisit(1, 1_000_000_000, storage);
    writeLastVisit(2, 2_000_000_000, storage);
    writeLastVisit(3, 3_000_000_000, storage);
    expect(readLastVisit(1, storage)).toBe(1_000_000_000);
    expect(readLastVisit(2, storage)).toBe(2_000_000_000);
    expect(readLastVisit(3, storage)).toBe(3_000_000_000);
    // All three live under the same key; storage doesn't fragment.
    expect(storage.size()).toBe(1);
  });

  it('overwrites the existing marker for the same token without dropping siblings', () => {
    writeLastVisit(1, 1_000, storage);
    writeLastVisit(2, 2_000, storage);
    writeLastVisit(1, 9_999, storage);
    expect(readLastVisit(1, storage)).toBe(9_999);
    expect(readLastVisit(2, storage)).toBe(2_000);
  });

  it('returns null on corrupted JSON instead of throwing', () => {
    storage.preset(LAST_VISIT_STORAGE_KEY, '{not json');
    expect(readLastVisit(1, storage)).toBeNull();
    // A subsequent write recovers the slot cleanly.
    writeLastVisit(1, 5_000, storage);
    expect(readLastVisit(1, storage)).toBe(5_000);
  });

  it('returns null when stored value for a token is the wrong shape', () => {
    storage.preset(
      LAST_VISIT_STORAGE_KEY,
      JSON.stringify({ '1': 'not-a-number', '2': null, '3': -5, '4': 12345 }),
    );
    expect(readLastVisit(1, storage)).toBeNull();
    expect(readLastVisit(2, storage)).toBeNull();
    expect(readLastVisit(3, storage)).toBeNull();
    expect(readLastVisit(4, storage)).toBe(12345);
  });

  it('treats a null storage (SSR / unavailable) as a graceful no-op', () => {
    expect(readLastVisit(1, null)).toBeNull();
    expect(() => writeLastVisit(1, Date.now(), null)).not.toThrow();
  });

  it('swallows storage exceptions and never throws to the caller', () => {
    const throwing = new ThrowingStorage();
    expect(() => readLastVisit(1, throwing)).not.toThrow();
    expect(readLastVisit(1, throwing)).toBeNull();
    expect(() => writeLastVisit(1, Date.now(), throwing)).not.toThrow();
  });

  it('rejects non-finite or non-positive timestamps without writing', () => {
    writeLastVisit(1, Number.NaN, storage);
    writeLastVisit(1, Number.POSITIVE_INFINITY, storage);
    writeLastVisit(1, 0, storage);
    writeLastVisit(1, -1, storage);
    expect(readLastVisit(1, storage)).toBeNull();
    // Sanity: a real value still works after the bad ones were ignored.
    writeLastVisit(1, 42_000, storage);
    expect(readLastVisit(1, storage)).toBe(42_000);
  });
});

describe('lastVisitStore — freshestVisitIso', () => {
  it('returns null when both inputs are missing', () => {
    expect(freshestVisitIso(null, null)).toBeNull();
    expect(freshestVisitIso(null, undefined)).toBeNull();
    expect(freshestVisitIso(null, '')).toBeNull();
  });

  it('returns the local marker when stats_updated_at is absent', () => {
    const ms = Date.UTC(2026, 4, 1, 12, 0, 0);
    expect(freshestVisitIso(ms, null)).toBe(new Date(ms).toISOString());
  });

  it('returns the stats timestamp when no local marker exists', () => {
    const iso = freshestVisitIso(null, '2026-05-01 12:00:00');
    expect(iso).toBe('2026-05-01T12:00:00.000Z');
  });

  it('prefers the local marker when it is fresher than stats_updated_at', () => {
    const localMs = Date.UTC(2026, 4, 1, 12, 5, 0);
    const out = freshestVisitIso(localMs, '2026-05-01 12:00:00');
    expect(out).toBe(new Date(localMs).toISOString());
  });

  it('prefers stats_updated_at when it is fresher than the local marker', () => {
    const localMs = Date.UTC(2026, 4, 1, 11, 55, 0);
    const out = freshestVisitIso(localMs, '2026-05-01 12:00:00');
    expect(out).toBe('2026-05-01T12:00:00.000Z');
  });

  it('parses ISO-8601 stats timestamps as well as the SQLite form', () => {
    const out = freshestVisitIso(null, '2026-05-01T12:00:00.000Z');
    expect(out).toBe('2026-05-01T12:00:00.000Z');
  });

  it('ignores unparseable stats input and falls back to the local marker', () => {
    const localMs = Date.UTC(2026, 4, 1, 9, 0, 0);
    expect(freshestVisitIso(localMs, 'not a date')).toBe(
      new Date(localMs).toISOString(),
    );
  });

  it('ignores non-finite local marker and uses the stats timestamp', () => {
    expect(freshestVisitIso(Number.NaN, '2026-05-01 12:00:00')).toBe(
      '2026-05-01T12:00:00.000Z',
    );
    expect(freshestVisitIso(-1, '2026-05-01 12:00:00')).toBe(
      '2026-05-01T12:00:00.000Z',
    );
  });
});
