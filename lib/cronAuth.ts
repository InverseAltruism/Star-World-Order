import { timingSafeEqual } from 'node:crypto';
import { logger } from './logger';

export interface CronAuthResult {
  valid: boolean;
  error?: string;
}

function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Still do a constant-time compare against a same-length buffer so the
    // length mismatch alone doesn't leak via timing.
    timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Validates cron requests. Every environment (including development) must
 * present a valid CRON_SECRET — bypassing auth in dev previously allowed
 * unauthenticated calls to any deployment that happened to have
 * NODE_ENV=development set.
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

  if (!safeEqualStrings(token, cronSecret)) {
    return { valid: false, error: 'Invalid cron token' };
  }

  return { valid: true };
}

