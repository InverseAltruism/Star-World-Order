// FairnessProof — provably-fair receipt card for SWO Cosmic Casino game
// pages.  Each bet surface (coinflip, dice, hilo) renders this beneath
// its <BetPanel> to expose the server commit hash, the user's client
// seed, and the tx hash once a bet has been submitted — the three
// inputs a player needs to independently reproduce the result via the
// /verify page.
//
// Anatomy:
//   ┌──────────────────────────────────────────┐
//   │  PROVABLY FAIR                           │
//   │  Server commit:  0xabc…123  [copy]       │
//   │  Client seed:    0xdef…456  [copy]       │
//   │  Tx hash:        0x789…abc  [explorer ↗] │
//   │  → Verify any bet                        │
//   └──────────────────────────────────────────┘
//
// Pure presentational: callers pass the strings, the component renders
// them. The `/verify` link is always visible so a player can audit even
// before submitting a bet.

'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';

const DEFAULT_EXPLORER = 'https://testnet.monadscan.com';

export interface FairnessProofProps {
  /** Stable prefix for `data-testid` (e.g. `coinflip`). */
  testIdPrefix: string;
  /** Server commit hash (pre-shared before bet). */
  serverCommit: string | null;
  /** Client seed (random per bet). */
  clientSeed?: string | null;
  /** Tx hash, once the bet has been broadcast. */
  txHash?: string | null;
  /** Block-explorer base URL. Defaults to Monad testnet Monadscan. */
  explorerBaseUrl?: string;
}

function short(hex: string | null | undefined): string {
  if (!hex) return '—';
  if (hex.length <= 14) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
}

export function FairnessProof({
  testIdPrefix,
  serverCommit,
  clientSeed,
  txHash,
  explorerBaseUrl = DEFAULT_EXPLORER,
}: FairnessProofProps) {
  return (
    <section
      aria-label="Provably fair proof"
      data-testid={`${testIdPrefix}-fairness-proof`}
      style={cardStyle}
    >
      <h3 style={titleStyle}>Provably fair</h3>

      <dl style={listStyle}>
        <div style={rowStyle} data-testid={`${testIdPrefix}-fairness-commit-row`}>
          <dt style={labelStyle}>Server commit</dt>
          <dd
            className="swo-casino-tabular"
            style={valueStyle}
            data-testid={`${testIdPrefix}-fairness-commit`}
          >
            {short(serverCommit)}
          </dd>
        </div>

        {clientSeed !== undefined && (
          <div style={rowStyle} data-testid={`${testIdPrefix}-fairness-client-row`}>
            <dt style={labelStyle}>Client seed</dt>
            <dd
              className="swo-casino-tabular"
              style={valueStyle}
              data-testid={`${testIdPrefix}-fairness-client`}
            >
              {short(clientSeed)}
            </dd>
          </div>
        )}

        <div style={rowStyle} data-testid={`${testIdPrefix}-fairness-tx-row`}>
          <dt style={labelStyle}>Tx hash</dt>
          <dd
            className="swo-casino-tabular"
            style={valueStyle}
            data-testid={`${testIdPrefix}-fairness-tx`}
          >
            {txHash ? (
              <a
                href={`${explorerBaseUrl}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                style={linkStyle}
                data-testid={`${testIdPrefix}-fairness-tx-link`}
                className="swo-casino-hit-44"
              >
                {short(txHash)} ↗
              </a>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>

      <Link
        href="/verify"
        style={verifyLinkStyle}
        data-testid={`${testIdPrefix}-fairness-verify-link`}
        className="swo-casino-hit-44"
      >
        Verify any bet →
      </Link>
    </section>
  );
}

const cardStyle: CSSProperties = {
  background: 'var(--swo-casino-elevated, rgba(255,255,255,0.04))',
  border: '1px solid var(--swo-casino-border, rgba(255,255,255,0.16))',
  borderRadius: 12,
  padding: '0.75rem 0.9rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.7))',
  fontWeight: 700,
};

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: '0.75rem',
};

const labelStyle: CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.6))',
};

const valueStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.8125rem',
  color: 'var(--swo-casino-fg, #e8e8e8)',
  fontVariantNumeric: 'tabular-nums',
};

const linkStyle: CSSProperties = {
  color: 'var(--swo-link-fg, #ffd166)',
  textDecoration: 'none',
  fontWeight: 600,
};

const verifyLinkStyle: CSSProperties = {
  ...linkStyle,
  fontSize: '0.8125rem',
  alignSelf: 'flex-end',
};
