// /region-not-supported — copy page rendered for blocked jurisdictions
// when `SWO_CASINO_GEO_MODE=enforce`.
//
// `middleware.ts` rewrites blocked traffic to this path so the URL bar
// stays meaningful even when the original request was for `/casino/dice`
// or `/casino/coinflip`. The headers set by the middleware
// (`x-swo-geo-blocked`, `x-swo-geo-country`) are forwarded straight
// through and read here to render a country-specific notice when
// available.

import { headers } from 'next/headers';

import { GeoBlockedNotice } from '@/components/casino/GeoBlockedNotice';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Region not supported | Star World Order',
};

export default async function RegionNotSupportedPage() {
  const h = await headers();
  const country = h.get('x-swo-geo-country');
  return <GeoBlockedNotice country={country} />;
}
