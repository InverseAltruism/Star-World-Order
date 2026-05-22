// Regulatory blocklist for `/casino/*` — single source of truth.
//
// Carried over verbatim from the BunnyBagz reference implementation
// (`packages/chain/src/geo.ts`). Strict / common-crypto-casino posture: we
// lean on the conservative side and match what mature crypto casinos
// (Stake-international, Roobet, BC.Game) block today.
//
// Counsel review gate: before flipping `SWO_CASINO_GEO_MODE=enforce` in
// production, the operator MUST file an inline review note (signed off by
// outside counsel) confirming this list is current. The env var defaults
// to `log` so a forgotten review never silently turns into a 403 for live
// users.
//
// Country codes are ISO 3166-1 alpha-2, uppercase. The set is exposed as
// `BLOCKED_COUNTRIES`; helpers `isBlockedCountry()` and `normalizeCountry()`
// keep callers from sprinkling `.toUpperCase()` everywhere.

export const BLOCKED_COUNTRIES: ReadonlySet<string> = new Set<string>([
  // --- Licensed / regulated jurisdictions we don't hold a licence in. ---
  'US', // United States — all states; US-resident wallets blocked at edge.
  'GB', // United Kingdom — Gambling Commission requires local licence.
  'FR', // France — ARJEL.
  'IT', // Italy — ADM monopoly.
  'ES', // Spain — DGOJ.
  'NL', // Netherlands — KSA.
  'SG', // Singapore — broad gambling prohibition for residents.
  'AU', // Australia — IGA.
  'IL', // Israel — broad online-gambling restrictions.
  // --- OFAC-sanctioned jurisdictions (review quarterly). ---
  'IR', // Iran.
  'KP', // North Korea.
  'SY', // Syria.
  'CU', // Cuba.
  'RU', // Russia.
]);

/**
 * Normalize a header-derived country code to the canonical uppercase form.
 * Returns `"UNKNOWN"` for missing / falsy input so callers never have to
 * special-case `null`/`undefined` before the membership check.
 */
export function normalizeCountry(country: string | null | undefined): string {
  if (!country) return 'UNKNOWN';
  return country.toUpperCase();
}

/**
 * Pure membership test against the blocklist. `"UNKNOWN"` is intentionally
 * allowed (not blocked) — geo headers are best-effort at the edge and we'd
 * rather log a false-negative than 403 a legit player whose CDN didn't tag
 * the request.
 */
export function isBlockedCountry(country: string | null | undefined): boolean {
  return BLOCKED_COUNTRIES.has(normalizeCountry(country));
}

export type GeoMode = 'log' | 'enforce';

/**
 * Resolve the active geo enforcement mode from env. Default is `log` so
 * production stays in soft-launch shape until counsel signs off and the
 * operator flips `SWO_CASINO_GEO_MODE=enforce`. Legacy `GEO_ENFORCE=1`
 * is honoured as a back-compat fallback.
 */
export function modeFromEnv(
  env: Record<string, string | undefined> = process.env,
): GeoMode {
  const explicit = env.SWO_CASINO_GEO_MODE?.toLowerCase();
  if (explicit === 'enforce') return 'enforce';
  if (explicit === 'log') return 'log';
  if (env.GEO_ENFORCE === '1') return 'enforce';
  return 'log';
}

/**
 * Read the caller's country from edge headers. Supports Vercel
 * (`x-vercel-ip-country`) and Cloudflare WAF (`cf-ipcountry`), so the
 * same module can sit behind either edge.
 */
export function countryFromHeaders(headers: Headers): string {
  return normalizeCountry(
    headers.get('x-vercel-ip-country') ??
      headers.get('cf-ipcountry') ??
      'UNKNOWN',
  );
}

interface BlockBody {
  regulatory_block: true;
  country: string;
  reason: 'country-on-blocklist';
  mode: 'enforce';
}

interface AllowBody {
  country: string;
  mode: GeoMode;
  allowed: true;
  wouldBlock: boolean;
  reason: 'country-on-blocklist' | null;
}

export type DecideResult =
  | { status: 403; body: BlockBody }
  | { status: 200; body: AllowBody };

export function decide(country: string, mode: GeoMode): DecideResult {
  const wouldBlock = isBlockedCountry(country);
  if (mode === 'enforce' && wouldBlock) {
    return {
      status: 403,
      body: {
        regulatory_block: true,
        country,
        reason: 'country-on-blocklist',
        mode: 'enforce',
      },
    };
  }
  return {
    status: 200,
    body: {
      country,
      mode,
      allowed: true,
      wouldBlock,
      reason: wouldBlock ? 'country-on-blocklist' : null,
    },
  };
}

/**
 * Edge-fn guard. Returns a `Response` if the caller should be blocked
 * (or if telemetry needs to short-circuit), else `null` so the inner
 * handler can run.
 *
 * Only emits a `Response` in `enforce` mode for blocked countries; in
 * `log` mode it always returns `null` so existing behaviour is preserved.
 */
export function geoGuard(req: Request): Response | null {
  const mode = modeFromEnv();
  if (mode !== 'enforce') return null;
  const country = countryFromHeaders(req.headers);
  if (!isBlockedCountry(country)) return null;
  const body: BlockBody = {
    regulatory_block: true,
    country,
    reason: 'country-on-blocklist',
    mode: 'enforce',
  };
  return Response.json(body, { status: 403 });
}

export const GEO_BLOCKED_HEADER = 'x-swo-geo-blocked';
export const GEO_COUNTRY_HEADER = 'x-swo-geo-country';
