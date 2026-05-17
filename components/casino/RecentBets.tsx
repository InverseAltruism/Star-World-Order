// RecentBets — settled-bets list for the SWO Cosmic Casino wallet surface.
//
// Ported from BunnyBagz `apps/web/src/components/RecentBets.tsx`
// (BB ships it as `RecentBetsList.tsx`). The BB original threads its own
// fetcher against `/api/history/wallet`, listens for the
// `bunnybagz:bet-settled` CustomEvent, and renders rich
// stake → payout columns with explorer + verify links.
//
// SWO ships the surface ahead of the indexer: per the acceptance
// contract (SWO_CASINO_COMPONENT_RECENT_BETS), the component renders
// gracefully empty ("No recent bets yet", `data-state="empty"`) until
// the indexer lands, and renders one row per bet when the caller passes
// mock indexer data via the `bets` prop. The component does NOT fetch
// on its own — once the indexer is wired the caller will pass live
// rows into `bets` (or we'll wire fetching here in a follow-up).
//
// The `RecentBet` shape mirrors BB's `WalletBet` so the indexer wiring
// is a drop-in once it lands.

'use client';

import type { CSSProperties } from 'react';

export type RecentBetGame = 'coinflip' | 'dice' | 'hilo' | 'slots';

export interface RecentBet {
  game: RecentBetGame;
  betId: string;
  stakeWei: string;
  payoutWei: string | null;
  outcome: string;
  blockNumber?: string;
  txHash?: string | null;
}

export interface RecentBetsProps {
  /**
   * Settled rows from the indexer. When `undefined` or empty, the
   * component renders the empty-state copy. Defaults to `undefined`
   * (indexer not yet wired).
   */
  bets?: RecentBet[];
  /**
   * Per-bet currency symbol resolver. Defaults to "MON" — SWO Cosmic
   * Casino's native token on Monad. Override for USDm rows once the
   * indexer surfaces a `tokenSymbol` field.
   */
  symbolFor?: (bet: RecentBet) => string;
}

const ICON_FOR: Record<RecentBetGame, string> = {
  coinflip: '🪙',
  dice: '🎲',
  hilo: '🃏',
  slots: '🎰',
};

function gameLabel(game: RecentBetGame): string {
  if (game === 'hilo') return 'Hi-Lo';
  if (game === 'coinflip') return 'Coinflip';
  if (game === 'slots') return 'Slots';
  return 'Dice';
}

function shortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;
}

/**
 * Format a wei amount as a fixed-precision human string. 4 dp keeps
 * sub-MON stakes legible without overflowing the row. Trailing zeros
 * are trimmed so "0.0100" reads as "0.01"; "0" passes through.
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
  const whole = padded.slice(0, padded.length - decimals).replace(/^0+(?=\d)/, '');
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, '').slice(0, 4);
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

export function RecentBets({ bets, symbolFor }: RecentBetsProps = {}) {
  const symbol = symbolFor ?? (() => 'MON');
  const rows = bets ?? [];

  if (rows.length === 0) {
    return (
      <section
        data-testid="recent-bets"
        data-state="empty"
        aria-label="Recent bets"
        style={containerStyle}
      >
        <h3 style={headingStyle}>Recent bets</h3>
        <p
          role="status"
          aria-live="polite"
          data-testid="recent-bets-status"
          style={statusStyle}
        >
          No recent bets yet
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid="recent-bets"
      data-state="populated"
      aria-label="Recent bets"
      style={containerStyle}
    >
      <h3 style={headingStyle}>Recent bets</h3>
      <p
        role="status"
        aria-live="polite"
        data-testid="recent-bets-status"
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
              data-testid="recent-bet-row"
              data-game={bet.game}
              data-outcome={chipKind}
              style={rowStyle}
            >
              <span style={iconCellStyle} aria-hidden="true">
                {ICON_FOR[bet.game]}
              </span>
              <span style={gameCellStyle} data-testid="recent-bet-game">
                {gameLabel(bet.game)}
              </span>
              <span
                data-testid="recent-bet-outcome-chip"
                data-outcome={chipKind}
                style={chipStyleFor(chipKind)}
              >
                {chipKind}
              </span>
              <span data-testid="recent-bet-stake" style={amountCellStyle}>
                {formatWei(bet.stakeWei)} {sym}
              </span>
              <span aria-hidden="true" style={arrowCellStyle}>→</span>
              <span data-testid="recent-bet-payout" style={amountCellStyle}>
                {bet.payoutWei ? `${formatWei(bet.payoutWei)} ${sym}` : `0 ${sym}`}
              </span>
              <a
                href={`/verify/${encodeURIComponent(bet.betId)}`}
                data-testid="recent-bet-betid-link"
                style={linkStyle}
                aria-label={`Verify bet ${bet.betId}`}
              >
                #{bet.betId}
              </a>
              {bet.txHash ? (
                <span
                  data-testid="recent-bet-tx"
                  style={linkStyle}
                  aria-label={`Transaction ${bet.txHash}`}
                >
                  {shortHash(bet.txHash)}
                </span>
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
  color: 'var(--swo-casino-fg-muted, rgba(255,255,255,0.7))',
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
  background: 'var(--swo-casino-elevated, rgba(255,255,255,0.04))',
  border: '1px solid var(--swo-casino-border, rgba(255,255,255,0.16))',
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
  color: 'var(--swo-casino-link-fg, #ffd166)',
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
      background: 'var(--swo-casino-success-bg, #1f3a1f)',
      color: 'var(--swo-casino-success-fg, #6ee46e)',
    };
  }
  if (kind === 'lost') {
    return {
      ...chipBaseStyle,
      background: 'var(--swo-casino-danger-bg, #3a1f1f)',
      color: 'var(--swo-casino-danger-fg, #ff6e6e)',
    };
  }
  return {
    ...chipBaseStyle,
    background: 'var(--swo-casino-elevated, rgba(255,255,255,0.04))',
    color: 'var(--swo-casino-fg-muted, rgba(255,255,255,0.7))',
    border: '1px solid var(--swo-casino-border, rgba(255,255,255,0.16))',
  };
}
