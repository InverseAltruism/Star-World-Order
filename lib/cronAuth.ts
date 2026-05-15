import { logger } from './logger';

export interface CronAuthResult {
  valid: boolean;
  error?: string;
}

/**
 * Returns true when the explicit cron-bypass escape hatch is set.
 *
 * This must NEVER be set in production. The flag is `SANCTUARY_ALLOW_CRON_BYPASS=1`
 * (the literal string `1`); any other value — including `true`, `0`, empty, or
 * unset — is treated as "bypass disabled". Tying the bypass to NODE_ENV was
 * brittle because some deployment environments leave NODE_ENV unset, which
 * accidentally opened the cron endpoints. Requiring an explicit flag makes the
 * bypass impossible to enable by accident.
 */
export function isCronBypassAllowed(): boolean {
  return process.env.SANCTUARY_ALLOW_CRON_BYPASS === '1';
}

/**
 * Validates cron requests.
 *
 * Policy:
 * - Bypass only when SANCTUARY_ALLOW_CRON_BYPASS=1 is explicitly set
 *   (intended for local development; do NOT set in production).
 * - Otherwise: requires CRON_SECRET and a matching Authorization header.
 */
export function validateCronSecret(request: Request, jobName: string): CronAuthResult {
  if (isCronBypassAllowed()) {
    logger.warn(`${jobName}: cron auth bypassed via SANCTUARY_ALLOW_CRON_BYPASS=1`);
    return { valid: true };
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error(`${jobName}: CRON_SECRET is not configured`);
    return { valid: false, error: 'Cron secret not configured' };
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header' };
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : authHeader;

  if (token !== cronSecret) {
    return { valid: false, error: 'Invalid cron token' };
  }

  return { valid: true };
}

