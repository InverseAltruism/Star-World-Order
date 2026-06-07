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

// WIP surfaces hidden outside dev mode [SWO_WIP_PROD_GATE]. Sanctuary and
// the casino are not launched yet: routes are incomplete and the features
// don't fully work, so on prod they 404 (themed not-found page) and their
// nav/landing entries are hidden via the `dev: true` item flag. The
// sanctuary API is gated too — it lazily creates its schema in the prod DB
// on first hit, which we don't want until launch. `/api/casino/*` (health
// probe) stays reachable. Dev mode requires NEXT_PUBLIC_ENV_MODE=dev
// (set in DEV/.env.local); prod runs with =prod via the systemd unit.
const WIP_PREFIXES = ['/sanctuary', '/casino', '/api/sanctuary'];

function isDevEnv(): boolean {
  return process.env.NEXT_PUBLIC_ENV_MODE?.toLowerCase() === 'dev';
}

function isWipPath(pathname: string): boolean {
  return WIP_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

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
  const { pathname } = req.nextUrl;

  if (!isDevEnv() && isWipPath(pathname)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Not found' },
        { status: 404 },
      );
    }
    // Rewrite to a path that doesn't exist so app/not-found.tsx renders
    // with a real 404 status (mirrors the geo rewrite pattern below).
    const url = req.nextUrl.clone();
    url.pathname = '/__wip-hidden__';
    return NextResponse.rewrite(url, { status: 404 });
  }

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
  matcher: [
    '/casino/:path*',
    '/sanctuary/:path*',
    '/api/sanctuary/:path*',
  ],
};
