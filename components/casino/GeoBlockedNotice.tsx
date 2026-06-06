// GeoBlockedNotice — placeholder rendered when the request carries the
// `x-swo-geo-blocked` header (set by `middleware.ts` for blocklisted
// countries while `SWO_CASINO_GEO_MODE=enforce`).
//
// UX rule: no game UI, no wallet modal, no CTA into a paid surface —
// just a polite "this region is not yet supported" copy block and a
// link back to the home page so the operator never has to 404 a
// legitimate visitor who happens to be in the wrong country.

import Link from 'next/link';

export const GEO_BLOCKED_FLAG_HEADER = 'x-swo-geo-blocked';

export interface GeoBlockedNoticeProps {
  /** ISO 3166-1 alpha-2 code surfaced by the edge — purely informational. */
  country?: string | null;
}

export function GeoBlockedNotice({ country }: GeoBlockedNoticeProps) {
  return (
    <main style={pageStyle} data-testid="geo-blocked-notice">
      <header style={headerStyle}>
        <h1 style={titleStyle}>This region isn&apos;t supported yet</h1>
        <p style={copyStyle}>
          The Cosmic Casino isn&apos;t available in your jurisdiction
          {country && country !== 'UNKNOWN' ? ` (${country})` : ''}.
          We&apos;re sorry for the inconvenience — keep an eye on the
          roadmap, and reach out if you&apos;d like to know when we
          expand coverage.
        </p>
        <p style={copyStyle}>
          Provably-fair verification of past bets is open to anyone: you
          can still inspect any settled bet at{' '}
          <Link href="/verify" style={linkStyle}>
            /verify
          </Link>
          .
        </p>
      </header>
      <nav style={navStyle} aria-label="Geo-blocked navigation">
        <Link href="/" style={linkStyle}>
          Back to home
        </Link>
      </nav>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: 'calc(100vh - 56px)',
  padding: '1.5rem 1.25rem 3rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.25rem',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  maxWidth: 560,
  margin: '0 auto',
  width: '100%',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.6rem',
  letterSpacing: '-0.01em',
  color: 'var(--swo-fg-strong, #f5f5f5)',
};

const copyStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--swo-fg-muted, #a3a3a3)',
  fontSize: '0.95rem',
  lineHeight: 1.5,
};

const linkStyle: React.CSSProperties = {
  color: 'var(--swo-link-fg, #7dd3fc)',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
};

const navStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.75rem',
  flexWrap: 'wrap',
};
