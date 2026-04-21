import { logger } from './logger';

export interface CronAuthResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates cron requests.
 *
 * Policy:
 * - Development: allow without token.
 * - Production: requires CRON_SECRET and matching Authorization header.
 */
export function validateCronSecret(request: Request, jobName: string): CronAuthResult {
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

