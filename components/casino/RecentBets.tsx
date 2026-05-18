// RecentBets — settled-bets list for the SWO Cosmic Casino wallet sheet,
// ported from BunnyBagz `apps/web/src/components/RecentBetsList.tsx`.
//
// Until the SWO indexer lands the component is a graceful empty surface:
// callers that do not pass a `bets` prop see the "No recent bets yet"
// pill with `data-state="empty"` so the wallet sheet never appears
// broken while the data layer is still in flight. Once the indexer
// arrives a parent can thread the rows in directly — the row markup is
// already in place and exercised by the test suite.
//
// Wire contract (parent-fed for now):
//   - Accepts a `bets` array of cross-game settled bets.
//   - Each row links the `betId` to `/verify/[betId]` and the optional
//     `txHash` to the MegaETH Blockscout explorer.
//   - `symbolFor` lets callers override the currency label per bet
//     (defaults to "MON", SWO's native gas token on Monad — vs BB's ETH).

'use client';

import type { CSSProperties } from 'react';

const EMPTY_COPY = 'No recent bets yet';
const DEFAULT_EXPLORER = 'https://explorer.monad-testnet.category.xyz';

export type WalletGame = 'coinflip' | 'dice' | 'hilo';

export interface WalletBet {
  game: WalletGame;
  betId: string;
  stakeWei: string;
  payoutWei: string | null;
  outcome: string;
  blockNumber: string;
  txHash: string | null;
}

export interface RecentBetsProps {
  /** Settled-bet rows. Undefined or empty renders the empty-state pill. */
  bets?: WalletBet[];
  /** Block-explorer base URL for txHash links. Defaults to Monad testnet. */
  explorerBaseUrl?: string;
  /**
   * Currency-symbol resolver per bet — defaults to "MON" (SWO's native
   * gas token). Override in tests that mix MON/USDm denominated rows.
   */
  symbolFor?: (bet: WalletBet) => 'MON' | 'USDm';
}

const ICON_FOR: Record<WalletGame, string> = {
  coinflip: '🪙',
  dice: '🎲',
  hilo: '🃏',
};

function gameLabel(game: WalletGame): string {
  return game === 'hilo' ? 'Hi-Lo' : game === 'coinflip' ? 'Coinflip' : 'Dice';
}

function shortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;
}

/**
 * Format a wei amount as a fixed-precision human string.
 *
 * 4 dp keeps sub-MON stakes legible without overflowing the row. Trailing
 * zeros are trimmed so "0.0100" reads as "0.01"; "0" passes through.
 */
export function formatWei(wei: string, decimals = 18): string {
  if (!wei || wei === '0') return '0';
  let s = wei;
  let neg = false;
  if (s.startsWith('-')) {
    neg = true;
    s = s.slice(1);
  }
  const padded = s.padStart(decimals + 1, '0');
  const whole = padded
    .slice(0, padded.length - decimals)
    .replace(/^0+(?=\d)/, '');
  const frac = padded
    .slice(padded.length - decimals)
    .replace(/0+$/, '')
    .slice(0, 4);
  const result = frac.length > 0 ? `${whole}.${frac}` : whole;
  return neg ? `-${result}` : result;
}

export function outcomeChipKind(
  outcome: string,
  payoutWei: string | null,
): 'won' | 'lost' | 'refunded' | 'pushed' {
  if (outcome === 'won' || outcome === 'cashed') return 'won';
  if (outcome === 'refunded') return 'refunded';
  if (outcome === 'pushed') return 'pushed';
  if (payoutWei && payoutWei !== '0') return 'won';
  return 'lost';
}

function explorerTxUrl(base: string, txHash: string): string {
  const trimmed = base.replace(/\/+$/, '');
  return `${trimmed}/tx/${txHash}`;
}

export function RecentBets({
  bets,
  explorerBaseUrl = DEFAULT_EXPLORER,
  symbolFor,
}: RecentBetsProps = {}) {
  const rows = bets ?? [];
  const symbol = symbolFor ?? (() => 'MON' as const);

  if (rows.length === 0) {
    return (
      <section
        data-testid="swo-recent-bets"
        data-state="empty"
        aria-label="Recent bets"
        style={containerStyle}
      >
        <h3 style={headingStyle}>Recent bets</h3>
        <p
          role="status"
          aria-live="polite"
          data-testid="swo-recent-bets-status"
          style={statusStyle}
        >
          {EMPTY_COPY}
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid="swo-recent-bets"
      data-state="populated"
      aria-label="Recent bets"
      style={containerStyle}
    >
      <h3 style={headingStyle}>Recent bets</h3>
      <p
        role="status"
        aria-live="polite"
        data-testid="swo-recent-bets-status"
        style={visuallyHiddenStyle}
      >
        Loaded {rows.length} recent {rows.length === 1 ? 'bet' : 'bets'}
      </p>
      <ol role="list" style={listStyle}>
        {rows.map((bet) => {
          const sym = symbol(bet);
          const chipKind = outcomeChipKind(bet.outcome, bet.payoutWei);
          return (
            <li
              key={`${bet.game}:${bet.betId}`}
              data-testid="swo-recent-bet-row"
              data-game={bet.game}
              data-outcome={chipKind}
              style={rowStyle}
            >
              <span style={iconCellStyle} aria-hidden="true">
                {ICON_FOR[bet.game]}
              </span>
              <span style={gameCellStyle} data-testid="swo-recent-bet-game">
                {gameLabel(bet.game)}
              </span>
              <span
                data-testid="swo-recent-bet-outcome-chip"
                data-outcome={chipKind}
                style={chipStyleFor(chipKind)}
              >
                {chipKind}
              </span>
              <span data-testid="swo-recent-bet-stake" style={amountCellStyle}>
                {formatWei(bet.stakeWei)} {sym}
              </span>
              <span aria-hidden="true" style={arrowCellStyle}>
                →
              </span>
              <span
                data-testid="swo-recent-bet-payout"
                style={amountCellStyle}
              >
                {bet.payoutWei
                  ? `${formatWei(bet.payoutWei)} ${sym}`
                  : `0 ${sym}`}
              </span>
              <a
                href={`/verify/${encodeURIComponent(bet.betId)}`}
                data-testid="swo-recent-bet-betid-link"
                style={linkStyle}
                aria-label={`Verify bet ${bet.betId}`}
              >
                #{bet.betId}
              </a>
              {bet.txHash ? (
                <a
                  href={explorerTxUrl(explorerBaseUrl, bet.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="swo-recent-bet-tx-link"
                  style={linkStyle}
                  aria-label={`View transaction ${bet.txHash} on the block explorer`}
                >
                  {shortHash(bet.txHash)}
                </a>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  fontVariantNumeric: 'tabular-nums',
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  opacity: 0.7,
};

const statusStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  color: 'var(--swo-fg-subtle, rgba(255,255,255,0.72))',
  fontStyle: 'italic',
};

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto auto auto 1fr auto 1fr auto auto',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.5rem 0.6rem',
  background: 'var(--swo-elevated, rgba(255,255,255,0.04))',
  border: '1px solid var(--swo-border, rgba(255,255,255,0.12))',
  borderRadius: 10,
  fontSize: '0.85rem',
  fontVariantNumeric: 'tabular-nums',
};

const iconCellStyle: CSSProperties = {
  fontSize: '1rem',
  lineHeight: 1,
};

const gameCellStyle: CSSProperties = {
  fontWeight: 600,
};

const amountCellStyle: CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'right',
  minWidth: 0,
  whiteSpace: 'nowrap',
};

const arrowCellStyle: CSSProperties = {
  opacity: 0.5,
};

const linkStyle: CSSProperties = {
  color: 'var(--swo-link-fg, #ffd166)',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  fontSize: '0.8rem',
};

const visuallyHiddenStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

const chipBaseStyle: CSSProperties = {
  padding: '0.05rem 0.35rem',
  borderRadius: 999,
  fontSize: '0.875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

function chipStyleFor(
  kind: 'won' | 'lost' | 'refunded' | 'pushed',
): CSSProperties {
  if (kind === 'won') {
    return {
      ...chipBaseStyle,
      background: 'var(--swo-success-bg, #1f3a1f)',
      color: 'var(--swo-success-fg, #6ee46e)',
    };
  }
  if (kind === 'lost') {
    return {
      ...chipBaseStyle,
      background: 'var(--swo-danger-bg, #3a1f1f)',
      color: 'var(--swo-danger-fg, #ff6e6e)',
    };
  }
  return {
    ...chipBaseStyle,
    background: 'var(--swo-elevated, rgba(255,255,255,0.04))',
    color: 'var(--swo-fg-subtle, rgba(255,255,255,0.72))',
    border: '1px solid var(--swo-border, rgba(255,255,255,0.12))',
  };
}
