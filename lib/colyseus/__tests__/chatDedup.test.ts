import { describe, it, expect } from 'vitest';
import {
  ECHO_DEDUP_WINDOW_MS,
  findEchoIndex,
  LOCAL_ONLY_SESSION_ID,
  pruneExpiredEchoes,
  type PendingEcho,
} from '../chatDedup';

describe('chatDedup', () => {
  describe('pruneExpiredEchoes', () => {
    it('keeps entries within the dedup window', () => {
      const now = 10_000;
      const pending: PendingEcho[] = [
        { text: 'a', sessionId: 's1', timestamp: now - 500 },
        { text: 'b', sessionId: 's1', timestamp: now - 1999 },
      ];
      expect(pruneExpiredEchoes(pending, now)).toHaveLength(2);
    });

    it('drops entries older than the dedup window', () => {
      const now = 10_000;
      const pending: PendingEcho[] = [
        { text: 'old', sessionId: 's1', timestamp: now - 3000 },
        { text: 'fresh', sessionId: 's1', timestamp: now - 100 },
      ];
      const result = pruneExpiredEchoes(pending, now);
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('fresh');
    });

    it('treats exactly-window-old entries as expired', () => {
      const now = 10_000;
      const pending: PendingEcho[] = [
        { text: 'edge', sessionId: 's1', timestamp: now - ECHO_DEDUP_WINDOW_MS },
      ];
      expect(pruneExpiredEchoes(pending, now)).toHaveLength(0);
    });
  });

  describe('findEchoIndex', () => {
    const now = 10_000;
    const pending: PendingEcho[] = [
      { text: 'hello', sessionId: 'sessA', timestamp: now - 100 },
      { text: 'world', sessionId: 'sessA', timestamp: now - 200 },
    ];

    it('finds matching text + sessionId within window', () => {
      const idx = findEchoIndex(
        pending,
        { text: 'hello', sessionId: 'sessA' },
        now,
      );
      expect(idx).toBe(0);
    });

    it('returns -1 when text differs', () => {
      const idx = findEchoIndex(
        pending,
        { text: 'unsent', sessionId: 'sessA' },
        now,
      );
      expect(idx).toBe(-1);
    });

    it('returns -1 when sessionId differs', () => {
      const idx = findEchoIndex(
        pending,
        { text: 'hello', sessionId: 'sessB' },
        now,
      );
      expect(idx).toBe(-1);
    });

    it('returns -1 when match is outside the window', () => {
      const stale: PendingEcho[] = [
        { text: 'hello', sessionId: 'sessA', timestamp: now - 5000 },
      ];
      const idx = findEchoIndex(stale, { text: 'hello', sessionId: 'sessA' }, now);
      expect(idx).toBe(-1);
    });
  });

  describe('local echo simulation', () => {
    // Simulates the useMultiplayer flow: local echo recorded on send,
    // then the server roundtrips its own copy back; the second emission
    // must be deduplicated within the dedup window.
    it('deduplicates server echo that matches recent local send', () => {
      const sendTime = 10_000;
      const pending: PendingEcho[] = [];

      pending.push({ text: 'gm', sessionId: 'sessA', timestamp: sendTime });

      const arriveTime = sendTime + 250;
      const idx = findEchoIndex(
        pending,
        { text: 'gm', sessionId: 'sessA' },
        arriveTime,
      );
      expect(idx).toBe(0);

      pending.splice(idx, 1);
      expect(pending).toHaveLength(0);
    });

    it('does not deduplicate server echo arriving after the window', () => {
      const sendTime = 10_000;
      const pending: PendingEcho[] = [
        { text: 'gm', sessionId: 'sessA', timestamp: sendTime },
      ];

      const arriveTime = sendTime + ECHO_DEDUP_WINDOW_MS + 1;
      const idx = findEchoIndex(
        pending,
        { text: 'gm', sessionId: 'sessA' },
        arriveTime,
      );
      expect(idx).toBe(-1);
    });

    it('still allows local echo when no room is connected (uses local sessionId)', () => {
      // When disconnected, the hook tags echoes with LOCAL_ONLY_SESSION_ID.
      // No server echo will ever arrive with that sessionId, so dedup never
      // matches and the local bubble persists for its full lifetime.
      const now = 10_000;
      const pending: PendingEcho[] = [
        { text: 'hi', sessionId: LOCAL_ONLY_SESSION_ID, timestamp: now },
      ];

      const idx = findEchoIndex(
        pending,
        { text: 'hi', sessionId: 'realServerSessionId' },
        now + 100,
      );
      expect(idx).toBe(-1);
    });
  });
});
