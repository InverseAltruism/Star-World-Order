import { describe, it, expect } from 'vitest';
import {
  ACTION_RESOURCE,
  ACTION_REPLENISH,
  ACTION_DAILY_LIMIT,
  RESOURCE_MAX,
  USAGE_WINDOW_MS,
  decayResources,
  replenish,
  usesRemaining,
  cooldownRemainingMs,
  gateAction,
  advanceUsage,
  type ActionUsage,
} from '../walletResources';

const NOW = new Date('2026-05-24T12:00:00Z');
const iso = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('walletResources', () => {
  it('maps actions to the resource they fill', () => {
    expect(ACTION_RESOURCE.feed).toBe('hunger');
    expect(ACTION_RESOURCE.play).toBe('happiness');
    expect(ACTION_RESOURCE.sleep).toBe('energy');
  });

  it('replenish adds the action amount and clamps to max', () => {
    const r = { hunger: 50, happiness: 50, energy: 50 };
    expect(replenish(r, 'feed').hunger).toBe(50 + ACTION_REPLENISH.feed);
    expect(replenish({ ...r, hunger: 95 }, 'feed').hunger).toBe(RESOURCE_MAX);
  });

  it('decays over time and clamps at 0', () => {
    const r = { hunger: 100, happiness: 100, energy: 100 };
    const after10h = decayResources(r, iso(10 * 3_600_000), NOW);
    expect(after10h.hunger).toBeLessThan(100);
    expect(after10h.hunger).toBeGreaterThanOrEqual(0);
    // Far in the past floors at 0, never negative.
    expect(decayResources(r, iso(1000 * 3_600_000), NOW).hunger).toBe(0);
    // No decay when updated just now.
    expect(decayResources(r, NOW.toISOString(), NOW).hunger).toBe(100);
  });

  it('usesRemaining is full with no usage and resets after the 24h window', () => {
    expect(usesRemaining(null, 'feed', NOW)).toBe(ACTION_DAILY_LIMIT.feed);
    const fresh: ActionUsage = { used_count: ACTION_DAILY_LIMIT.feed, window_start: iso(1000), last_used_at: iso(1000) };
    expect(usesRemaining(fresh, 'feed', NOW)).toBe(0);
    const expired: ActionUsage = { used_count: ACTION_DAILY_LIMIT.feed, window_start: iso(USAGE_WINDOW_MS + 1000), last_used_at: iso(USAGE_WINDOW_MS + 1000) };
    expect(usesRemaining(expired, 'feed', NOW)).toBe(ACTION_DAILY_LIMIT.feed);
  });

  it('cooldownRemainingMs counts down from the last use', () => {
    expect(cooldownRemainingMs(null, 'feed', NOW)).toBe(0);
    const recent: ActionUsage = { used_count: 1, window_start: iso(5000), last_used_at: iso(5000) };
    expect(cooldownRemainingMs(recent, 'feed', NOW)).toBeGreaterThan(0);
  });

  it('gateAction blocks on cooldown and on daily limit, allows when fresh', () => {
    expect(gateAction(null, 'feed', NOW).ok).toBe(true);

    const recent: ActionUsage = { used_count: 1, window_start: iso(5000), last_used_at: iso(5000) };
    expect(gateAction(recent, 'feed', NOW)).toMatchObject({ ok: false, reason: 'cooldown' });

    const maxed: ActionUsage = { used_count: ACTION_DAILY_LIMIT.feed, window_start: iso(60_000), last_used_at: iso(60_000) };
    expect(gateAction(maxed, 'feed', NOW)).toMatchObject({ ok: false, reason: 'daily_limit' });
  });

  it('advanceUsage increments within window and resets after it', () => {
    const within: ActionUsage = { used_count: 2, window_start: iso(60_000), last_used_at: iso(60_000) };
    const next = advanceUsage(within, NOW);
    expect(next.used_count).toBe(3);
    expect(next.window_start).toBe(within.window_start);

    const expired: ActionUsage = { used_count: 4, window_start: iso(USAGE_WINDOW_MS + 1), last_used_at: iso(USAGE_WINDOW_MS + 1) };
    const reset = advanceUsage(expired, NOW);
    expect(reset.used_count).toBe(1);
    expect(reset.window_start).toBe(NOW.toISOString());
  });
});
