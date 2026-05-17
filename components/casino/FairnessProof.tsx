// FairnessProof — provably-fair verification card for the SWO Cosmic
// Casino. Ported from BunnyBagz `apps/web/src/components/VerifyBetCard.tsx`
// and slimmed down to a static surface that surfaces:
//
//   • The pre-bet server commit (keccak256 of the server seed)
//   • The submitted bet tx hash (links to the chain explorer)
//   • The post-settle revealed server seed + client seed
//   • A copy-paste verification recipe
//
// The card has no network side effects of its own — every value is
// supplied by the parent page (CoinflipContent), which already owns the
// commit/seed lifecycle. This keeps tests deterministic and matches the
// container/presentation split that BetPanel established.

'use client';

import type { CSSProperties, ReactNode } from 'react';

export interface FairnessProofProps {
  /** Stable prefix for `data-testid` (e.g. `coinflip`, `dice`). */
  testIdPrefix: string;
  /** keccak256(serverSeed) committed by the seed keeper before play. */
  serverCommit: `0x${string}` | null;
  /** Client seed mixed into the per-bet hash. */
  clientSeed?: `0x${string}` | null;
  /** Server seed revealed at settle. Falsy = bet not yet settled. */
  serverReveal?: `0x${string}` | null;
  /** Tx hash of the placeBet call. */
  txHash?: `0x${string}` | null;
  /** Optional explorer URL prefix (e.g. https://monadscan.com/tx/). */
  explorerTxUrl?: string;
  /** Optional CTA pointing at the verify route. */
  verifyHref?: string;
  /** Extra slot for child cards (e.g. links). */
  footer?: ReactNode;
}

function shortHex(value: string | null | undefined): string {
  if (!value) return '—';
  if (value.length <= 14) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

export function FairnessProof(props: FairnessProofProps) {
  const {
    testIdPrefix,
    serverCommit,
    clientSeed,
    serverReveal,
    txHash,
    explorerTxUrl,
    verifyHref = '/verify',
    footer,
  } = props;

  const settled = Boolean(serverReveal);

  return (
    <section
      style={cardStyle}
      aria-label="Provably-fair verification"
      data-testid={`${testIdPrefix}-fairness-proof`}
    >
      <header style={headerStyle}>
        <span style={badgeStyle} data-testid={`${testIdPrefix}-fairness-badge`}>
          {settled ? '✓ Verifiable' : '○ Awaiting reveal'}
        </span>
        <h3 style={titleStyle}>Provably fair</h3>
      </header>

      <dl style={rowsStyle}>
        <Row
          label="Server commit"
          value={shortHex(serverCommit)}
          testId={`${testIdPrefix}-server-commit`}
        />
        <Row
          label="Client seed"
          value={shortHex(clientSeed)}
          testId={`${testIdPrefix}-client-seed`}
        />
        <Row
          label="Server reveal"
          value={shortHex(serverReveal)}
          testId={`${testIdPrefix}-server-reveal`}
        />
        <Row
          label="Tx hash"
          value={
            txHash && explorerTxUrl ? (
              <a
                href={`${explorerTxUrl}${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
                data-testid={`${testIdPrefix}-tx-link`}
              >
                {shortHex(txHash)}
              </a>
            ) : (
              shortHex(txHash)
            )
          }
          testId={`${testIdPrefix}-tx-hash`}
        />
      </dl>

      <a
        href={verifyHref}
        style={verifyLinkStyle}
        data-testid={`${testIdPrefix}-verify-link`}
      >
        Verify any bet →
      </a>

      {footer}
    </section>
  );
}

function Row({
  label,
  value,
  testId,
}: {
  label: string;
  value: ReactNode;
  testId: string;
}) {
  return (
    <div style={rowStyle}>
      <dt style={rowLabelStyle}>{label}</dt>
      <dd style={rowValueStyle} className="swo-casino-tabular" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

const cardStyle: CSSProperties = {
  background: 'var(--swo-casino-surface, rgba(15,15,30,0.85))',
  border: '1px solid var(--swo-casino-border, rgba(255,255,255,0.16))',
  borderRadius: 12,
  padding: '0.85rem 1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.95rem',
  color: 'var(--swo-casino-fg-strong, #ffffff)',
};

const badgeStyle: CSSProperties = {
  fontSize: '0.75rem',
  padding: '0.15rem 0.5rem',
  borderRadius: 999,
  background: 'var(--swo-casino-elevated, rgba(255,255,255,0.06))',
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.7))',
};

const rowsStyle: CSSProperties = {
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '0.5rem',
  alignItems: 'baseline',
};

const rowLabelStyle: CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.6))',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: 0,
};

const rowValueStyle: CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--swo-casino-fg, #e8e8e8)',
  fontVariantNumeric: 'tabular-nums',
  margin: 0,
};

const linkStyle: CSSProperties = {
  color: 'var(--swo-casino-brand-gold, #ffd700)',
  textDecoration: 'none',
};

const verifyLinkStyle: CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--swo-casino-brand-gold, #ffd700)',
  textDecoration: 'none',
  alignSelf: 'flex-end',
};
