// FairnessProof — commit/reveal/outcome receipt for the SWO Cosmic Casino.
//
// Anatomy:
//   [Star Skrumpey dealer sprite] Provably fair receipt
//   Commit   0xabc…123 [copy]
//   Reveal   0xdef…456 [copy]
//   Outcome  heads     [copy]
//
// The component never trusts its caller blindly: given a (reveal, salt, game)
// tuple it re-derives the triple via `lib/casino/verify.ts` so the rendered
// commit/outcome are always the verifier's own opinion. The optional
// `expectedCommit` prop lets the parent flag commit-reveal mismatch (e.g.
// when the on-chain commit disagrees with the revealed seed) without the
// component itself needing chain access.
//
// Acceptance for [SWO_CASINO_COMPONENT_FAIRNESS_PROOF]:
//   (a) component exists;
//   (b) Vitest verifies it renders the same triple `verify.ts` derives.

'use client';

import { useMemo, useState, type CSSProperties } from 'react';

import {
  computeCommit,
  computeOutcome,
  deriveTriple,
  verifyCommit,
  type CasinoGame,
  type FairnessTriple,
} from '../../lib/casino/verify';

export interface FairnessProofProps {
  /** Revealed seed (0x-prefixed hex). The component re-hashes this. */
  reveal: string;
  /** Optional client salt fed into the outcome derivation. */
  salt?: string;
  /** Which game's outcome mapping to use. Defaults to 'coinflip'. */
  game?: CasinoGame;
  /**
   * Optional commit published before the bet. When supplied, the component
   * adds a verification badge: ✓ matches if `sha256(reveal) === expectedCommit`,
   * else ✗ mismatch. Useful for on-chain commits read by the parent.
   */
  expectedCommit?: string;
  /**
   * Injectable clipboard writer for tests; defaults to navigator.clipboard.
   * Receives the raw text and should resolve when the copy completes.
   */
  copy?: (text: string) => Promise<void>;
  /**
   * Override the Star Skrumpey dealer sprite shown in the heading row.
   * Defaults to `/casino/skrumpey-dealer-happy.png`. Pass `null` to suppress.
   */
  dealerArtSrc?: string | null;
}

export const DEFAULT_FAIRNESS_DEALER_ART_SRC =
  '/casino/skrumpey-dealer-happy.png';

const COPY_RESET_MS = 1500;

function defaultCopy(text: string): Promise<void> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.resolve();
}

/** Short-form for the display value: keep the hex copyable but readable. */
function shortHex(hex: string): string {
  if (!hex.startsWith('0x') || hex.length <= 14) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
}

export function FairnessProof({
  reveal,
  salt,
  game = 'coinflip',
  expectedCommit,
  copy = defaultCopy,
  dealerArtSrc = DEFAULT_FAIRNESS_DEALER_ART_SRC,
}: FairnessProofProps) {
  const triple: FairnessTriple = useMemo(
    () => deriveTriple({ reveal, salt, game }),
    [reveal, salt, game],
  );

  const matchesExpected = useMemo(() => {
    if (!expectedCommit) return null;
    return verifyCommit(reveal, expectedCommit);
  }, [reveal, expectedCommit]);

  return (
    <section
      data-testid="swo-fairness-proof"
      data-game={game}
      data-match={
        matchesExpected === null
          ? 'unchecked'
          : matchesExpected
            ? 'ok'
            : 'mismatch'
      }
      aria-label="Provably fair receipt"
      style={containerStyle}
    >
      <div style={headingRowStyle}>
        {dealerArtSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dealerArtSrc}
            alt="Star Skrumpey fair-play dealer"
            width={28}
            height={28}
            style={dealerArtStyle}
            data-testid="swo-fairness-dealer-art"
          />
        ) : null}
        <h3 style={headingStyle}>Provably fair receipt</h3>
      </div>

      {matchesExpected !== null ? (
        <p
          data-testid="swo-fairness-match"
          data-match={matchesExpected ? 'ok' : 'mismatch'}
          style={matchStyle(matchesExpected)}
        >
          {matchesExpected
            ? '✓ Commit matches reveal'
            : '✗ Commit mismatch — do not trust this bet'}
        </p>
      ) : null}

      <Row
        label="Commit"
        value={triple.commit}
        testId="swo-fairness-commit"
        copy={copy}
      />
      <Row
        label="Reveal"
        value={triple.reveal}
        testId="swo-fairness-reveal"
        copy={copy}
      />
      <Row
        label="Outcome"
        value={triple.outcome}
        testId="swo-fairness-outcome"
        copy={copy}
        mono={false}
      />
    </section>
  );
}

interface RowProps {
  label: string;
  value: string;
  testId: string;
  copy: (text: string) => Promise<void>;
  mono?: boolean;
}

function Row({ label, value, testId, copy, mono = true }: RowProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await copy(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div data-testid={testId} style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span
        data-testid={`${testId}-value`}
        data-value={value}
        title={value}
        style={mono ? valueMonoStyle : valueStyle}
      >
        {mono ? shortHex(value) : value}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        data-testid={`${testId}-copy`}
        aria-label={`Copy ${label.toLowerCase()}`}
        style={copyButtonStyle}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

// Re-export the verify helpers so callers can import either side from one
// place (mirrors how RecentBets re-exports `formatWei` for ergonomic tests).
export {
  computeCommit,
  computeOutcome,
  deriveTriple,
  verifyCommit,
} from '../../lib/casino/verify';
export type { CasinoGame, FairnessTriple } from '../../lib/casino/verify';

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
  padding: '0.6rem 0.75rem',
  background: 'var(--swo-elevated, rgba(255,255,255,0.04))',
  border: '1px solid var(--swo-border, rgba(255,255,255,0.12))',
  borderRadius: 10,
  fontVariantNumeric: 'tabular-nums',
};

const headingRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
};

const dealerArtStyle: CSSProperties = {
  width: 28,
  height: 28,
  imageRendering: 'pixelated',
  flexShrink: 0,
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  opacity: 0.7,
};

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto',
  alignItems: 'center',
  gap: '0.6rem',
  minHeight: 32,
  fontSize: '0.85rem',
};

const labelStyle: CSSProperties = {
  fontWeight: 600,
  opacity: 0.8,
  minWidth: '4.5rem',
};

const valueStyle: CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const valueMonoStyle: CSSProperties = {
  ...valueStyle,
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
};

const copyButtonStyle: CSSProperties = {
  appearance: 'none',
  cursor: 'pointer',
  padding: '0.35rem 0.6rem',
  minHeight: 32,
  borderRadius: 8,
  border: '1px solid var(--swo-border, rgba(255,255,255,0.18))',
  background: 'transparent',
  color: 'var(--swo-link-fg, #ffd166)',
  fontSize: '0.8rem',
  fontWeight: 600,
};

function matchStyle(ok: boolean): CSSProperties {
  return {
    margin: 0,
    padding: '0.25rem 0.5rem',
    borderRadius: 6,
    fontSize: '0.8rem',
    fontWeight: 600,
    color: ok
      ? 'var(--swo-success-fg, #6ee46e)'
      : 'var(--swo-danger-fg, #ff6e6e)',
    background: ok
      ? 'var(--swo-success-bg, #1f3a1f)'
      : 'var(--swo-danger-bg, #3a1f1f)',
  };
}
