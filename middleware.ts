// Next.js middleware — guards `/casino/*` against blocked jurisdictions.
//
// Carried over from the BunnyBagz reference (`apps/web/src/middleware.ts`)
// with the matcher narrowed to the casino surface and the blocklist sourced
// from `@/lib/casino/geo`. Reads the same `SWO_CASINO_GEO_MODE` env var as
// the in-process geo helpers so production has a single switch. Compatible
// with both Vercel and Cloudflare WAF edges (geo lookup falls back to
// `cf-ipcountry`).
//
// Mode semantics:
//
//   * **log** (default): every request passes through unchanged. We attach
//     `x-swo-geo-blocked: 0|1` so downstream surfaces can read what the
//     enforcer *would* have done.
//   * **enforce** (env: `SWO_CASINO_GEO_MODE=enforce`): blocked-country
//     requests are rewritten to `/region-not-supported` so the page tree
//     renders the polite placeholder (no game UI, no wallet modal). The
//     status code stays 200 — surfacing a 403 here would break the
//     `<Link>` prefetcher and bake a Vercel error page in the user's
//     browser instead of our copy.

import { NextResponse, type NextRequest } from 'next/server';

import {
  GEO_BLOCKED_HEADER,
  GEO_COUNTRY_HEADER,
  isBlockedCountry,
  modeFromEnv,
  normalizeCountry,
} from '@/lib/casino/geo';

function countryFromRequest(req: NextRequest): string {
  const geoCountry = (req as unknown as { geo?: { country?: string } }).geo
    ?.country;
  return normalizeCountry(
    geoCountry ??
      req.headers.get('x-vercel-ip-country') ??
      req.headers.get('cf-ipcountry') ??
      'UNKNOWN',
  );
}

export function middleware(req: NextRequest) {
  const country = countryFromRequest(req);
  const blocked = isBlockedCountry(country);
  const mode = modeFromEnv();

  if (mode === 'enforce' && blocked) {
    const url = req.nextUrl.clone();
    url.pathname = '/region-not-supported';
    const res = NextResponse.rewrite(url);
    res.headers.set(GEO_BLOCKED_HEADER, '1');
    res.headers.set(GEO_COUNTRY_HEADER, country);
    return res;
  }

  const res = NextResponse.next();
  res.headers.set(GEO_BLOCKED_HEADER, blocked ? '1' : '0');
  res.headers.set(GEO_COUNTRY_HEADER, country);
  return res;
}

export const config = {
  matcher: ['/casino/:path*'],
};
