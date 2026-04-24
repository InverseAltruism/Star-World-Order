export interface PendingEcho {
  text: string;
  sessionId: string;
  timestamp: number;
}

export const ECHO_DEDUP_WINDOW_MS = 2000;
export const LOCAL_ONLY_SESSION_ID = 'local';

export function pruneExpiredEchoes(
  pending: PendingEcho[],
  now: number,
  windowMs: number = ECHO_DEDUP_WINDOW_MS,
): PendingEcho[] {
  return pending.filter((e) => now - e.timestamp < windowMs);
}

export function findEchoIndex(
  pending: PendingEcho[],
  msg: { text: string; sessionId: string },
  now: number,
  windowMs: number = ECHO_DEDUP_WINDOW_MS,
): number {
  return pending.findIndex(
    (e) =>
      e.text === msg.text &&
      e.sessionId === msg.sessionId &&
      now - e.timestamp < windowMs,
  );
}
