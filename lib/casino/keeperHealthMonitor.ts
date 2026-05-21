/**
 * Casino keeper health monitor — pure decision logic.
 *
 * Polls `/api/casino/health` on a schedule (see
 * `.github/workflows/casino-keeper-health.yml` and
 * `scripts/casino/keeperHealthMonitor.ts`) and decides whether to fire a
 * Telegram alert based on consecutive offline observations.
 *
 * The wire side (HTTP fetch, state-file I/O, Telegram POST, log append) lives
 * in the script; everything in this module is deterministic and unit-tested.
 *
 * Why ≥2 consecutive: a single failed poll is just as likely to be a
 * transient network blip as a real outage. Requiring two consecutive
 * confirmations means the alert fires within ~10 min (2 × 5-min interval)
 * — fast enough to be actionable, slow enough to suppress false positives.
 */

export const OFFLINE_THRESHOLD = 2;

export interface KeeperHealthState {
  consecutiveOffline: number;
  /**
   * True once an offline alert has been fired for the current outage and
   * before a heal alert has been sent. Prevents repeat-alerting on every
   * cron tick while the keeper stays down.
   */
  alertedOffline: boolean;
  lastCheckTimestamp?: number;
  lastStatus?: 'online' | 'offline';
}

export type HealthAction = 'none' | 'alert_offline' | 'alert_healed';

export interface HealthCheckOutcome {
  newState: KeeperHealthState;
  action: HealthAction;
  message: string;
}

export function initialState(): KeeperHealthState {
  return { consecutiveOffline: 0, alertedOffline: false };
}

/**
 * Decide what to do given the previous state and the current observation.
 *
 * - First N-1 offline observations: count up, no alert.
 * - Reaching the threshold for the first time in an outage: fire offline alert.
 * - Subsequent offline observations during the same outage: no alert (already fired).
 * - Online after we had alerted: fire heal alert and reset.
 * - Online without prior alert: silently reset the counter.
 */
export function evaluateHealthCheck(
  prevState: KeeperHealthState | undefined,
  isOnline: boolean,
  now: number,
): HealthCheckOutcome {
  const prev = prevState ?? initialState();

  if (!isOnline) {
    const consecutiveOffline = prev.consecutiveOffline + 1;
    const shouldAlertNow =
      consecutiveOffline >= OFFLINE_THRESHOLD && !prev.alertedOffline;
    return {
      newState: {
        consecutiveOffline,
        alertedOffline: prev.alertedOffline || shouldAlertNow,
        lastCheckTimestamp: now,
        lastStatus: 'offline',
      },
      action: shouldAlertNow ? 'alert_offline' : 'none',
      message: shouldAlertNow
        ? `Casino keeper offline for ${consecutiveOffline} consecutive checks (threshold ${OFFLINE_THRESHOLD})`
        : `keeper offline (${consecutiveOffline}/${OFFLINE_THRESHOLD})`,
    };
  }

  const shouldHeal = prev.alertedOffline;
  return {
    newState: {
      consecutiveOffline: 0,
      alertedOffline: false,
      lastCheckTimestamp: now,
      lastStatus: 'online',
    },
    action: shouldHeal ? 'alert_healed' : 'none',
    message: shouldHeal
      ? 'Casino keeper restored to online'
      : 'keeper online',
  };
}

/**
 * Coerce the raw `/api/casino/health` JSON body into the boolean we care about.
 *
 * Treats anything other than a literal `true` as offline — including
 * `undefined`, `null`, malformed payloads, or `keeperOnline: false`. Network
 * errors are handled in the caller (they should also resolve to `false`).
 */
export function parseKeeperOnline(payload: unknown): boolean {
  if (payload && typeof payload === 'object' && 'keeperOnline' in payload) {
    return (payload as { keeperOnline: unknown }).keeperOnline === true;
  }
  return false;
}
