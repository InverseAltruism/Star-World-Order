/**
 * Coverage for the casino geo blocklist + `geoGuard()`. Ported from the
 * BunnyBagz `apps/api/geo/index.test.ts` reference with the env-var
 * prefix swapped to `SWO_CASINO_GEO_MODE` and the runner adapted to
 * vitest (the SWO casino project uses vitest, not node:test).
 *
 *   * `SWO_CASINO_GEO_MODE=enforce` → blocked countries get HTTP 403
 *     with `{regulatory_block: true, country, reason, mode}` from
 *     `decide()`.
 *   * mode unset (default `log`) → blocked country still gets 200 +
 *     telemetry, so production stays in soft-launch until counsel signs
 *     off on the blocklist.
 *   * `SWO_CASINO_GEO_MODE=log` (explicit) → same as unset.
 *   * Allowed-country callers always pass through (200 + telemetry).
 *   * Missing country header → resolves to "UNKNOWN" → not blocked.
 *   * `geoGuard()` returns the 403 Response in enforce mode for blocked
 *     callers; `null` in log mode (no behaviour change until enforcement
 *     is flipped on).
 *   * Cloudflare WAF (`cf-ipcountry`) is honoured equally with Vercel
 *     (`x-vercel-ip-country`) — same module sits behind either edge.
 *   * Legacy `GEO_ENFORCE=1` still flips to enforce (back-compat).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BLOCKED_COUNTRIES,
  blockedCountryList,
  casinoWafExpression,
  casinoWafRule,
  countryFromHeaders,
  decide,
  geoGuard,
  isBlockedCountry,
  modeFromEnv,
  normalizeCountry,
  WAF_CASINO_PATH_PREFIX,
} from '../geo';

function makeRequest(
  country: string,
  header: 'x-vercel-ip-country' | 'cf-ipcountry' = 'x-vercel-ip-country',
): Request {
  return new Request('https://swo.example/casino/dice', {
    headers: { [header]: country },
  });
}

const TOUCHED_ENV = ['SWO_CASINO_GEO_MODE', 'GEO_ENFORCE'] as const;

describe('geo blocklist', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of TOUCHED_ENV) saved[k] = process.env[k];
    for (const k of TOUCHED_ENV) delete process.env[k];
  });

  afterEach(() => {
    for (const k of TOUCHED_ENV) {
      const v = saved[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  describe('BLOCKED_COUNTRIES set', () => {
    it('includes the OFAC-sanctioned jurisdictions', () => {
      for (const cc of ['IR', 'KP', 'SY', 'CU', 'RU']) {
        expect(BLOCKED_COUNTRIES.has(cc)).toBe(true);
      }
    });

    it('includes the 9 licensed jurisdictions on the blocklist', () => {
      for (const cc of [
        'US',
        'GB',
        'FR',
        'IT',
        'ES',
        'NL',
        'SG',
        'AU',
        'IL',
      ]) {
        expect(BLOCKED_COUNTRIES.has(cc)).toBe(true);
      }
    });

    it('does not block neutral jurisdictions', () => {
      for (const cc of ['DE', 'JP', 'BR', 'CA', 'CH']) {
        expect(BLOCKED_COUNTRIES.has(cc)).toBe(false);
      }
    });

    it('totals 14 entries (9 licensed + 5 OFAC)', () => {
      expect(BLOCKED_COUNTRIES.size).toBe(14);
    });
  });

  describe('normalizeCountry()', () => {
    it('uppercases the input', () => {
      expect(normalizeCountry('us')).toBe('US');
      expect(normalizeCountry('kp')).toBe('KP');
    });

    it('returns UNKNOWN for missing input', () => {
      expect(normalizeCountry(null)).toBe('UNKNOWN');
      expect(normalizeCountry(undefined)).toBe('UNKNOWN');
      expect(normalizeCountry('')).toBe('UNKNOWN');
    });
  });

  describe('isBlockedCountry()', () => {
    it('matches case-insensitively', () => {
      expect(isBlockedCountry('us')).toBe(true);
      expect(isBlockedCountry('Us')).toBe(true);
      expect(isBlockedCountry('US')).toBe(true);
    });

    it('treats UNKNOWN as allowed (best-effort headers)', () => {
      expect(isBlockedCountry(null)).toBe(false);
      expect(isBlockedCountry(undefined)).toBe(false);
      expect(isBlockedCountry('UNKNOWN')).toBe(false);
    });
  });

  describe('modeFromEnv()', () => {
    it('defaults to log when unset', () => {
      expect(modeFromEnv({})).toBe('log');
    });

    it('honours SWO_CASINO_GEO_MODE=enforce', () => {
      expect(modeFromEnv({ SWO_CASINO_GEO_MODE: 'enforce' })).toBe('enforce');
      expect(modeFromEnv({ SWO_CASINO_GEO_MODE: 'ENFORCE' })).toBe('enforce');
    });

    it('honours SWO_CASINO_GEO_MODE=log explicitly', () => {
      expect(modeFromEnv({ SWO_CASINO_GEO_MODE: 'log' })).toBe('log');
    });

    it('honours legacy GEO_ENFORCE=1 fallback', () => {
      expect(modeFromEnv({ GEO_ENFORCE: '1' })).toBe('enforce');
    });

    it('SWO_CASINO_GEO_MODE wins over GEO_ENFORCE', () => {
      expect(
        modeFromEnv({ SWO_CASINO_GEO_MODE: 'log', GEO_ENFORCE: '1' }),
      ).toBe('log');
    });
  });

  describe('countryFromHeaders()', () => {
    it('reads x-vercel-ip-country (Vercel edge)', () => {
      const h = new Headers({ 'x-vercel-ip-country': 'de' });
      expect(countryFromHeaders(h)).toBe('DE');
    });

    it('reads cf-ipcountry (Cloudflare WAF)', () => {
      const h = new Headers({ 'cf-ipcountry': 'jp' });
      expect(countryFromHeaders(h)).toBe('JP');
    });

    it('prefers Vercel header when both are present', () => {
      const h = new Headers({
        'x-vercel-ip-country': 'de',
        'cf-ipcountry': 'us',
      });
      expect(countryFromHeaders(h)).toBe('DE');
    });

    it('falls back to UNKNOWN when neither header is set', () => {
      expect(countryFromHeaders(new Headers())).toBe('UNKNOWN');
    });
  });

  describe('decide()', () => {
    it('log mode always returns 200 + wouldBlock telemetry', () => {
      const blocked = decide('US', 'log');
      expect(blocked.status).toBe(200);
      expect(blocked.body).toEqual({
        country: 'US',
        mode: 'log',
        allowed: true,
        wouldBlock: true,
        reason: 'country-on-blocklist',
      });

      const allowed = decide('DE', 'log');
      expect(allowed.status).toBe(200);
      expect(allowed.body).toEqual({
        country: 'DE',
        mode: 'log',
        allowed: true,
        wouldBlock: false,
        reason: null,
      });
    });

    it('enforce mode returns 403 + regulatory_block JSON for blocked countries', () => {
      const blocked = decide('KP', 'enforce');
      expect(blocked.status).toBe(403);
      expect(blocked.body).toEqual({
        regulatory_block: true,
        country: 'KP',
        reason: 'country-on-blocklist',
        mode: 'enforce',
      });
    });

    it('enforce mode preserves the 200 telemetry shape for non-blocked countries', () => {
      const allowed = decide('DE', 'enforce');
      expect(allowed.status).toBe(200);
      expect(allowed.body).toEqual({
        country: 'DE',
        mode: 'enforce',
        allowed: true,
        wouldBlock: false,
        reason: null,
      });
    });
  });

  describe('geoGuard()', () => {
    it('log mode returns null for both blocked and allowed callers', () => {
      process.env.SWO_CASINO_GEO_MODE = 'log';
      expect(geoGuard(makeRequest('US'))).toBeNull();
      expect(geoGuard(makeRequest('DE'))).toBeNull();
      expect(geoGuard(new Request('https://swo.example/casino'))).toBeNull();
    });

    it('enforce mode short-circuits with 403 for blocked countries only', async () => {
      process.env.SWO_CASINO_GEO_MODE = 'enforce';
      const blocked = geoGuard(makeRequest('KP'));
      expect(blocked).not.toBeNull();
      expect(blocked!.status).toBe(403);
      const body = await blocked!.json();
      expect(body).toEqual({
        regulatory_block: true,
        country: 'KP',
        reason: 'country-on-blocklist',
        mode: 'enforce',
      });

      // Allowed country (and unknown country) → null so handler runs.
      expect(geoGuard(makeRequest('DE'))).toBeNull();
      expect(geoGuard(new Request('https://swo.example/casino'))).toBeNull();
    });

    it('enforce mode honours Cloudflare WAF cf-ipcountry header', async () => {
      process.env.SWO_CASINO_GEO_MODE = 'enforce';
      const blocked = geoGuard(makeRequest('RU', 'cf-ipcountry'));
      expect(blocked).not.toBeNull();
      expect(blocked!.status).toBe(403);
      const body = await blocked!.json();
      expect(body.country).toBe('RU');
    });

    it('legacy GEO_ENFORCE=1 still flips to enforce', () => {
      process.env.GEO_ENFORCE = '1';
      const blocked = geoGuard(makeRequest('US'));
      expect(blocked).not.toBeNull();
      expect(blocked!.status).toBe(403);
    });
  });

  describe('Cloudflare WAF rule (edge layer)', () => {
    it('blockedCountryList() returns every blocked country, sorted + deduped', () => {
      const list = blockedCountryList();
      // Same membership as the source-of-truth set (no drift).
      expect(new Set(list)).toEqual(BLOCKED_COUNTRIES);
      // Sorted ascending for deterministic WAF output.
      expect(list).toEqual([...list].sort());
      // No duplicates.
      expect(list.length).toBe(new Set(list).size);
      expect(list.length).toBe(BLOCKED_COUNTRIES.size);
    });

    it('casinoWafExpression() includes every blocked country code', () => {
      const expr = casinoWafExpression();
      for (const cc of BLOCKED_COUNTRIES) {
        expect(expr).toContain(`"${cc}"`);
      }
    });

    it('casinoWafExpression() scopes to the /casino path prefix only', () => {
      const expr = casinoWafExpression();
      expect(WAF_CASINO_PATH_PREFIX).toBe('/casino');
      expect(expr).toContain(
        `http.request.uri.path matches "^${WAF_CASINO_PATH_PREFIX}(/|$)"`,
      );
      expect(expr).toContain('ip.geoip.country in {');
      expect(expr).toContain(') and (');
    });

    it('casinoWafExpression() does not list neutral jurisdictions', () => {
      const expr = casinoWafExpression();
      for (const cc of ['DE', 'JP', 'BR', 'CA', 'CH']) {
        expect(expr).not.toContain(`"${cc}"`);
      }
    });

    it('casinoWafRule() is a blocking rule mirroring the expression', () => {
      const rule = casinoWafRule();
      expect(rule.action).toBe('block');
      expect(rule.expression).toBe(casinoWafExpression());
      expect(rule.description).toMatch(/OFAC/);
    });
  });
});
