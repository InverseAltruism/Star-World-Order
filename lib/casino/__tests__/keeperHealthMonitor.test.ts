import { describe, it, expect } from 'vitest';
import {
  OFFLINE_THRESHOLD,
  evaluateHealthCheck,
  initialState,
  parseKeeperOnline,
} from '../keeperHealthMonitor';

const NOW = 1_700_000_000_000;

describe('evaluateHealthCheck', () => {
  it('counts the first offline observation without alerting', () => {
    const out = evaluateHealthCheck(initialState(), false, NOW);
    expect(out.action).toBe('none');
    expect(out.newState.consecutiveOffline).toBe(1);
    expect(out.newState.alertedOffline).toBe(false);
    expect(out.newState.lastStatus).toBe('offline');
  });

  it('fires the offline alert on the second consecutive offline check', () => {
    const after1 = evaluateHealthCheck(initialState(), false, NOW);
    const after2 = evaluateHealthCheck(after1.newState, false, NOW + 1);
    expect(after2.action).toBe('alert_offline');
    expect(after2.newState.consecutiveOffline).toBe(OFFLINE_THRESHOLD);
    expect(after2.newState.alertedOffline).toBe(true);
  });

  it('does not re-alert on subsequent offline checks during the same outage', () => {
    let state = initialState();
    state = evaluateHealthCheck(state, false, NOW).newState;
    const breach = evaluateHealthCheck(state, false, NOW + 1);
    expect(breach.action).toBe('alert_offline');
    const tick3 = evaluateHealthCheck(breach.newState, false, NOW + 2);
    expect(tick3.action).toBe('none');
    expect(tick3.newState.consecutiveOffline).toBe(3);
    expect(tick3.newState.alertedOffline).toBe(true);
  });

  it('fires the heal alert when keeper returns to online after an offline alert', () => {
    let state = initialState();
    state = evaluateHealthCheck(state, false, NOW).newState;
    state = evaluateHealthCheck(state, false, NOW + 1).newState; // alerted
    const heal = evaluateHealthCheck(state, true, NOW + 2);
    expect(heal.action).toBe('alert_healed');
    expect(heal.newState.consecutiveOffline).toBe(0);
    expect(heal.newState.alertedOffline).toBe(false);
    expect(heal.newState.lastStatus).toBe('online');
  });

  it('does not fire a heal alert if no offline alert was sent', () => {
    // One offline tick (under threshold), then back online — silent recovery.
    const state = evaluateHealthCheck(initialState(), false, NOW).newState;
    const heal = evaluateHealthCheck(state, true, NOW + 1);
    expect(heal.action).toBe('none');
    expect(heal.newState.consecutiveOffline).toBe(0);
    expect(heal.newState.alertedOffline).toBe(false);
  });

  it('resets the counter when a single online observation occurs mid-outage', () => {
    // Real-world flap: one offline tick, then online, then offline twice in a row.
    // The flap should reset the counter so the alert needs two NEW offline observations.
    let state = initialState();
    state = evaluateHealthCheck(state, false, NOW).newState;
    state = evaluateHealthCheck(state, true, NOW + 1).newState; // reset
    expect(state.consecutiveOffline).toBe(0);
    const tick3 = evaluateHealthCheck(state, false, NOW + 2);
    expect(tick3.action).toBe('none');
    const tick4 = evaluateHealthCheck(tick3.newState, false, NOW + 3);
    expect(tick4.action).toBe('alert_offline');
  });

  it('treats an undefined previous state as a fresh start', () => {
    const out = evaluateHealthCheck(undefined, true, NOW);
    expect(out.action).toBe('none');
    expect(out.newState.consecutiveOffline).toBe(0);
    expect(out.newState.lastStatus).toBe('online');
  });
});

describe('parseKeeperOnline', () => {
  it('returns true only for { keeperOnline: true }', () => {
    expect(parseKeeperOnline({ keeperOnline: true })).toBe(true);
  });

  it('returns false for explicit keeperOnline: false', () => {
    expect(parseKeeperOnline({ keeperOnline: false })).toBe(false);
  });

  it('returns false for missing field, null, or non-object payloads', () => {
    expect(parseKeeperOnline({})).toBe(false);
    expect(parseKeeperOnline(null)).toBe(false);
    expect(parseKeeperOnline(undefined)).toBe(false);
    expect(parseKeeperOnline('online')).toBe(false);
    expect(parseKeeperOnline(42)).toBe(false);
  });

  it('returns false for truthy-but-not-true keeperOnline values (strict equality)', () => {
    expect(parseKeeperOnline({ keeperOnline: 1 })).toBe(false);
    expect(parseKeeperOnline({ keeperOnline: 'true' })).toBe(false);
  });
});
