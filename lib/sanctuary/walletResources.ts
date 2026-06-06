// [SWO_V2_SANCTUARY_ECONOMY_REDESIGN] — pure helpers for the shared per-wallet
// resource economy. See docs/SANCTUARY_ECONOMY_REDESIGN.md.
//
// Quick actions fill a shared hunger/happiness/energy pool (capped, slowly
// decaying), each gated by a per-action 24h use limit + a cooldown between
// uses. Quests/games spend the pool. Kept DOM-free so the gating + decay math
// is unit-tested in node; DB I/O lives in lib/db.ts.
import type { CompanionStatAction } from './companionStats';

export type ResourceKey = 'hunger' | 'happiness' | 'energy';
export const RESOURCE_MAX = 100;
export const RESOURCE_MIN = 0;

/** Which shared resource a quick action replenishes. Mirrors ACTION_TARGET_STAT. */
export const ACTION_RESOURCE: Readonly<Record<CompanionStatAction, ResourceKey>> = Object.freeze({
  feed: 'hunger',
  pet: 'happiness',
  talk: 'happiness',
  play: 'happiness',
  sleep: 'energy',
});

/** How much of the target resource each action restores (pre-clamp). */
export const ACTION_REPLENISH: Readonly<Record<CompanionStatAction, number>> = Object.freeze({
  feed: 25,
  pet: 15,
  talk: 15,
  play: 20,
  sleep: 30,
});

/** Per-action uses allowed inside a rolling 24h window. */
export const ACTION_DAILY_LIMIT: Readonly<Record<CompanionStatAction, number>> = Object.freeze({
  feed: 5,
  pet: 8,
  talk: 8,
  play: 6,
  sleep: 3,
});

/** Cooldown between uses of the same action, in ms. */
export const ACTION_COOLDOWN_MS: Readonly<Record<CompanionStatAction, number>> = Object.freeze({
  feed: 30_000,
  pet: 20_000,
  talk: 20_000,
  play: 30_000,
  sleep: 60_000,
});

export const USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Shared pool decay per hour, so care has a daily cadence. */
export const RESOURCE_DECAY_PER_HOUR: Readonly<Record<ResourceKey, number>> = Object.freeze({
  hunger: 4,
  happiness: 3,
  energy: 2,
});

export interface ResourceSnapshot {
  hunger: number;
  happiness: number;
  energy: number;
}

export interface ActionUsage {
  used_count: number;
  /** ISO timestamp the current 24h window started. */
  window_start: string | null;
  /** ISO timestamp the action was last performed. */
  last_used_at: string | null;
}

const clamp = (v: number) => Math.max(RESOURCE_MIN, Math.min(RESOURCE_MAX, v));
const hoursBetween = (fromIso: string | null, now: Date): number => {
  if (!fromIso) return 0;
  const then = new Date(fromIso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, (now.getTime() - then) / 3_600_000);
};

/** Apply time-based decay to the shared pool from `updatedAt` → `now`. */
export function decayResources(
  r: ResourceSnapshot,
  updatedAtIso: string | null,
  now: Date,
): ResourceSnapshot {
  const hrs = hoursBetween(updatedAtIso, now);
  if (hrs <= 0) return { ...r };
  return {
    hunger: clamp(r.hunger - RESOURCE_DECAY_PER_HOUR.hunger * hrs),
    happiness: clamp(r.happiness - RESOURCE_DECAY_PER_HOUR.happiness * hrs),
    energy: clamp(r.energy - RESOURCE_DECAY_PER_HOUR.energy * hrs),
  };
}

/** Apply a quick action's replenish to the (already-decayed) pool. */
export function replenish(r: ResourceSnapshot, action: CompanionStatAction): ResourceSnapshot {
  const key = ACTION_RESOURCE[action];
  return { ...r, [key]: clamp(r[key] + ACTION_REPLENISH[action]) };
}

/** True once the 24h usage window has elapsed and the counter should reset. */
function windowExpired(usage: ActionUsage | null, now: Date): boolean {
  if (!usage || !usage.window_start) return true;
  return now.getTime() - new Date(usage.window_start).getTime() >= USAGE_WINDOW_MS;
}

/** Uses left for this action in the current window (resets when the window elapses). */
export function usesRemaining(
  usage: ActionUsage | null,
  action: CompanionStatAction,
  now: Date,
): number {
  const limit = ACTION_DAILY_LIMIT[action];
  if (windowExpired(usage, now)) return limit;
  return Math.max(0, limit - (usage?.used_count ?? 0));
}

/** Cooldown remaining in ms before this action can be used again (0 = ready). */
export function cooldownRemainingMs(
  usage: ActionUsage | null,
  action: CompanionStatAction,
  now: Date,
): number {
  if (!usage?.last_used_at) return 0;
  const elapsed = now.getTime() - new Date(usage.last_used_at).getTime();
  return Math.max(0, ACTION_COOLDOWN_MS[action] - elapsed);
}

export interface ActionGate {
  ok: boolean;
  reason?: 'cooldown' | 'daily_limit';
  cooldownMs: number;
  usesLeft: number;
}

/** Can this action fire right now? Drives both the server guard and the UI. */
export function gateAction(
  usage: ActionUsage | null,
  action: CompanionStatAction,
  now: Date,
): ActionGate {
  const cooldownMs = cooldownRemainingMs(usage, action, now);
  const usesLeft = usesRemaining(usage, action, now);
  if (usesLeft <= 0) return { ok: false, reason: 'daily_limit', cooldownMs, usesLeft };
  if (cooldownMs > 0) return { ok: false, reason: 'cooldown', cooldownMs, usesLeft };
  return { ok: true, cooldownMs: 0, usesLeft };
}

/** Next usage row after a successful action (handles the rolling-window reset). */
export function advanceUsage(
  usage: ActionUsage | null,
  now: Date,
): { used_count: number; window_start: string; last_used_at: string } {
  const nowIso = now.toISOString();
  if (windowExpired(usage, now)) {
    return { used_count: 1, window_start: nowIso, last_used_at: nowIso };
  }
  return {
    used_count: (usage?.used_count ?? 0) + 1,
    window_start: usage!.window_start!,
    last_used_at: nowIso,
  };
}
