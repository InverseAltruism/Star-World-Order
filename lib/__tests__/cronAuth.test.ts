/**
 * Tests for the cron-auth bypass policy (SWO_SEC_H4_CRON_DEV_BYPASS).
 *
 * The original implementation gated the bypass on `NODE_ENV !== 'production'`,
 * which silently opened cron endpoints in any environment that did not set
 * `NODE_ENV`. The bypass is now behind an explicit `SANCTUARY_ALLOW_CRON_BYPASS=1`
 * flag. These tests pin the new contract:
 *
 *   - Default config (no flag, no NODE_ENV) → cron requests rejected.
 *   - NODE_ENV=development alone → no bypass (must set the flag explicitly).
 *   - SANCTUARY_ALLOW_CRON_BYPASS=1 → bypass, regardless of NODE_ENV.
 *   - Any other value of the flag (true, 0, empty, unrelated string) → no bypass.
 *   - When CRON_SECRET is set, only a matching Bearer token is accepted.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { validateCronSecret, isCronBypassAllowed } from '../cronAuth';

const ENV_KEYS = ['NODE_ENV', 'CRON_SECRET', 'SANCTUARY_ALLOW_CRON_BYPASS'] as const;

function withEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  // process.env.NODE_ENV is typed as read-only in @types/node, but at runtime
  // it is just a property on a plain object. Cast away the readonly view so
  // tests can pin it to the value they need without a separate vi.stubEnv.
  const env = process.env as Record<string, string | undefined>;
  for (const key of ENV_KEYS) {
    if (key in overrides) {
      const value = overrides[key];
      if (value === undefined) {
        delete env[key];
      } else {
        env[key] = value;
      }
    }
  }
}

function makeRequest(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader) headers.Authorization = authHeader;
  return new Request('https://example.com/api/cron/test', { headers });
}

describe('validateCronSecret — default config (no flag, no NODE_ENV)', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) original[key] = process.env[key];
    withEnv({
      NODE_ENV: undefined,
      CRON_SECRET: undefined,
      SANCTUARY_ALLOW_CRON_BYPASS: undefined,
    });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const env = process.env as Record<string, string | undefined>;
      if (original[key] === undefined) delete env[key];
      else env[key] = original[key];
    }
  });

  it('rejects requests when no flag is set and no secret is configured', () => {
    const result = validateCronSecret(makeRequest(), 'test-job');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Cron secret not configured');
  });

  it('rejects requests even when NODE_ENV=development (legacy bypass removed)', () => {
    withEnv({ NODE_ENV: 'development' });
    const result = validateCronSecret(makeRequest(), 'test-job');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Cron secret not configured');
  });

  it('rejects requests when NODE_ENV=test', () => {
    withEnv({ NODE_ENV: 'test' });
    const result = validateCronSecret(makeRequest(), 'test-job');
    expect(result.valid).toBe(false);
  });
});

describe('validateCronSecret — explicit bypass flag', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) original[key] = process.env[key];
    withEnv({
      NODE_ENV: undefined,
      CRON_SECRET: undefined,
      SANCTUARY_ALLOW_CRON_BYPASS: undefined,
    });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const env = process.env as Record<string, string | undefined>;
      if (original[key] === undefined) delete env[key];
      else env[key] = original[key];
    }
  });

  it('SANCTUARY_ALLOW_CRON_BYPASS=1 grants bypass regardless of NODE_ENV', () => {
    withEnv({ SANCTUARY_ALLOW_CRON_BYPASS: '1', NODE_ENV: 'production' });
    expect(isCronBypassAllowed()).toBe(true);
    const result = validateCronSecret(makeRequest(), 'test-job');
    expect(result.valid).toBe(true);
  });

  it('treats "true" as NOT a bypass — only the literal "1" counts', () => {
    withEnv({ SANCTUARY_ALLOW_CRON_BYPASS: 'true' });
    expect(isCronBypassAllowed()).toBe(false);
    const result = validateCronSecret(makeRequest(), 'test-job');
    expect(result.valid).toBe(false);
  });

  it('treats "0" as bypass disabled', () => {
    withEnv({ SANCTUARY_ALLOW_CRON_BYPASS: '0' });
    expect(isCronBypassAllowed()).toBe(false);
    const result = validateCronSecret(makeRequest(), 'test-job');
    expect(result.valid).toBe(false);
  });

  it('treats empty string as bypass disabled', () => {
    withEnv({ SANCTUARY_ALLOW_CRON_BYPASS: '' });
    expect(isCronBypassAllowed()).toBe(false);
  });

  it('treats unrelated values as bypass disabled', () => {
    withEnv({ SANCTUARY_ALLOW_CRON_BYPASS: 'yes' });
    expect(isCronBypassAllowed()).toBe(false);
  });
});

describe('validateCronSecret — token validation when CRON_SECRET is set', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) original[key] = process.env[key];
    withEnv({
      NODE_ENV: 'production',
      CRON_SECRET: 'super-secret-token',
      SANCTUARY_ALLOW_CRON_BYPASS: undefined,
    });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const env = process.env as Record<string, string | undefined>;
      if (original[key] === undefined) delete env[key];
      else env[key] = original[key];
    }
  });

  it('rejects request with no Authorization header', () => {
    const result = validateCronSecret(makeRequest(), 'test-job');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Missing Authorization header');
  });

  it('rejects request with an invalid token', () => {
    const result = validateCronSecret(makeRequest('Bearer wrong-token'), 'test-job');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid cron token');
  });

  it('accepts Bearer token matching CRON_SECRET', () => {
    const result = validateCronSecret(makeRequest('Bearer super-secret-token'), 'test-job');
    expect(result.valid).toBe(true);
  });

  it('accepts raw token (no Bearer prefix) matching CRON_SECRET', () => {
    const result = validateCronSecret(makeRequest('super-secret-token'), 'test-job');
    expect(result.valid).toBe(true);
  });
});
