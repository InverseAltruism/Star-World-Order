// TrustStrip — live trust band for the SWO Cosmic Casino.
//
// Anatomy:
//   🛡 House liquidity: 1.42 MON · Edge realised: 1.04% · Last bet: 12s ago
//   · [Verify] [Audit] [Bug bounty]
//
// The strip polls `/api/trust` every 4s and re-fetches on window focus so
// the numbers stay live without a manual refresh. The three numeric
// segments collapse on phone-class viewports (handled by the
// `.swo-trust-strip-numbers` / `.swo-trust-strip-sep` collapse rule in
// globals.css) while the Verify / Audit / Bug-bounty link trio stays
// visible on every viewport so the trust surface never disappears.
//
// Two QA fixes baked in:
//
//   (1) [SWO_CASINO_QA_TRUST_STRIP_MOBILE_HIT_TARGET_FIX] — formerly the
//       strip pinned itself to `height: 28` on every viewport, which
//       clipped each link's 44-px tap target to a 13-px bounding box on
//       phones. The 28-px constraint now lives behind
//       `@media (min-width: 600px)` in globals.css; mobile flows at
//       intrinsic height so the `.swo-casino-hit-44` link wrappers can
//       grow to the UX_PLAN §7 floor of 44 px.
//
//   (2) [SWO_CASINO_QA_TRUST_STRIP_LEGIBILITY] — every text glyph in
//       the strip renders at `fontSize: 0.8rem` (= 12.8 px on a 16-px
//       root), clearing the 12-px legibility floor enforced by the
//       SWO Casino QA audits.

'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

export interface TrustPayload {
  houseLiquidityEth: number;
  edgeRealisedPct: number;
  lastBetSecondsAgo: number | null;
  generatedAt: string;
}

export interface TrustStripProps {
  /** Override the fetcher in tests so we never hit the network. */
  fetcher?: () => Promise<TrustPayload>;
  /** Poll interval in ms — defaults to 4000. */
  pollIntervalMs?: number;
  /** Pre-seed data so SSR / tests can skip the loading state. */
  initialData?: TrustPayload;
}

const DEFAULT_POLL_MS = 4000;

async function defaultFetcher(): Promise<TrustPayload> {
  const resp = await fetch('/api/trust', { cache: 'no-store' });
  if (!resp.ok) {
    throw new Error(`/api/trust → ${resp.status}`);
  }
  return (await resp.json()) as TrustPayload;
}

/** Plain-English "12s ago", "3m ago", "2h ago", "1d ago". */
export function formatTimeAgo(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 0) return '0s ago';
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function TrustStrip({
  fetcher = defaultFetcher,
  pollIntervalMs = DEFAULT_POLL_MS,
  initialData,
}: TrustStripProps = {}) {
  const [data, setData] = useState<TrustPayload | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  // Latest fetcher in a ref so the polling effect doesn't tear down on
  // every render the parent triggers. Updated via effect (not at render
  // time) to satisfy react-hooks/refs.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await fetcherRef.current();
        if (cancelled) return;
        setData(next);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    if (!initialData) {
      void tick();
    }
    const id = setInterval(tick, pollIntervalMs);
    const onFocus = () => {
      void tick();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
    }
    return () => {
      cancelled = true;
      clearInterval(id);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
      }
    };
  }, [pollIntervalMs, initialData]);

  const loading = data === null && error === null;
  const liquidity = data
    ? `${data.houseLiquidityEth.toFixed(2)} MON`
    : loading
      ? '…'
      : '—';
  const edge = data
    ? `${data.edgeRealisedPct.toFixed(2)}%`
    : loading
      ? '…'
      : '—';
  const lastBet = data
    ? formatTimeAgo(data.lastBetSecondsAgo)
    : loading
      ? '…'
      : '—';

  return (
    <div
      data-testid="swo-trust-strip"
      data-loading={loading ? 'true' : 'false'}
      data-error={error ? 'true' : 'false'}
      role="region"
      aria-label="Trust and safety"
      aria-live="polite"
      className="swo-trust-strip"
      style={stripStyle}
    >
      <span style={shieldStyle} aria-hidden="true">
        🛡
      </span>
      <span
        data-testid="swo-trust-strip-liquidity"
        className="swo-trust-strip-numbers"
        style={numberStyle}
      >
        <span style={labelStyle}>House liquidity:</span>{' '}
        <strong style={valueStyle}>{liquidity}</strong>
      </span>
      <span
        aria-hidden="true"
        className="swo-trust-strip-sep"
        style={separatorStyle}
      >
        ·
      </span>
      <span
        data-testid="swo-trust-strip-edge"
        className="swo-trust-strip-numbers"
        style={numberStyle}
      >
        <span style={labelStyle}>Edge realised:</span>{' '}
        <strong style={valueStyle}>{edge}</strong>
      </span>
      <span
        aria-hidden="true"
        className="swo-trust-strip-sep"
        style={separatorStyle}
      >
        ·
      </span>
      <span
        data-testid="swo-trust-strip-last-bet"
        className="swo-trust-strip-numbers"
        style={numberStyle}
      >
        <span style={labelStyle}>Last bet:</span>{' '}
        <strong style={valueStyle}>{lastBet}</strong>
      </span>
      <span aria-hidden="true" style={separatorStyle}>
        ·
      </span>
      <Link
        href="/verify"
        data-testid="swo-trust-strip-verify-link"
        className="swo-casino-hit-44"
        style={linkStyle}
      >
        Verify
      </Link>
      <Link
        href="/audit"
        data-testid="swo-trust-strip-audit-link"
        className="swo-casino-hit-44"
        style={linkStyle}
      >
        Audit
      </Link>
      <Link
        href="/bounty"
        data-testid="swo-trust-strip-bounty-link"
        className="swo-casino-hit-44"
        style={linkStyle}
      >
        Bug bounty
      </Link>
    </div>
  );
}

// stripStyle — note the deliberate ABSENCE of `height: 28`. The 28-px
// strip height now lives behind `@media (min-width: 600px)` in
// globals.css under the `.swo-trust-strip` selector so the mobile
// touch-target fix from [SWO_CASINO_QA_TRUST_STRIP_MOBILE_HIT_TARGET_FIX]
// can let the 44-px link wrappers grow the strip on phones.
const stripStyle: CSSProperties = {
  position: 'sticky',
  top: 56,
  zIndex: 9,
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'nowrap',
  overflowX: 'auto',
  gap: '0.4rem',
  padding: '0 0.75rem',
  fontSize: '0.8rem',
  lineHeight: 1,
  color: 'var(--swo-fg-subtle, rgba(255,255,255,0.72))',
  borderBottom: '1px solid var(--swo-border, rgba(255,255,255,0.12))',
  background:
    'var(--swo-trust-strip-bg, color-mix(in oklab, rgba(15,15,30,0.85) 80%, transparent))',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  whiteSpace: 'nowrap',
};

const shieldStyle: CSSProperties = {
  fontSize: '0.85rem',
};

const numberStyle: CSSProperties = {
  gap: '0.2rem',
  alignItems: 'baseline',
};

const labelStyle: CSSProperties = {
  color: 'var(--swo-fg-subtle, rgba(255,255,255,0.72))',
};

const valueStyle: CSSProperties = {
  color: 'var(--swo-fg, #fff)',
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
};

const separatorStyle: CSSProperties = {
  color: 'var(--swo-fg-subtle, rgba(255,255,255,0.72))',
  opacity: 0.6,
};

const linkStyle: CSSProperties = {
  color: 'var(--swo-link-fg, #ffd166)',
  textDecoration: 'none',
  fontWeight: 600,
  paddingInline: '0.25rem',
};
