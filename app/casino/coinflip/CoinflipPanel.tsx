// CoinflipPanel — pure presentational shell for the /casino/coinflip
// page, ported from BunnyBagz `apps/web/src/app/play/coinflip/page.tsx`.
//
// CoinflipContent (the wagmi wrapper) owns all chain state and feeds
// this component via props. Keeping the panel side-effect-free lets the
// vitest suite assert the synchronous code path (acceptance (b) of
// SWO_CASINO_COINFLIP_UI) without spinning up a WagmiProvider.
//
// Surface contract:
//   • Heads/tails toggle calls `onSideChange`.
//   • <BetPanel> CTA fires `onPlaceBet` (proxied through `cta.onClick`).
//   • When `chainGate` is set, a banner overrides the bet UI and the
//     primary CTA becomes "Switch to <chainName>" — acceptance (d).
//   • `settledOutcome` ("won" | "lost") drives the live-region message
//     and the bold result line above the panel.
//
// The component intentionally stays Tailwind-free and uses inline styles
// so it matches the existing SWO casino primitives (BetPanel,
// TrustStrip, WalletSheet) and stays portable into the PROD mirror.

'use client';

import type { CSSProperties, ReactNode } from 'react';

import { BetPanel, type BetPanelCta } from '@/components/casino/BetPanel';
import { FairnessProof } from '@/components/casino/FairnessProof';

export type CoinflipSide = 'heads' | 'tails';
export type CoinflipOutcome = 'won' | 'lost' | null;

export interface CoinflipChainGate {
  /** Human-readable name of the required chain (e.g. "Monad Testnet"). */
  chainName: string;
  /** Switch-chain click handler. */
  onSwitch: () => void;
  /** Disable the switch CTA while wagmi is flipping chains. */
  switching: boolean;
}

export interface CoinflipPanelProps {
  /** Currently selected side ("heads" or "tails"). */
  side: CoinflipSide;
  /** Side toggle handler — clicking heads/tails fires this. */
  onSideChange: (next: CoinflipSide) => void;
  /** Current stake value (controlled). */
  stake: string;
  /** Stake setter wired to the BetPanel input. */
  onStakeChange: (next: string) => void;
  /** Last-submitted stake — feeds the "Bet last" chip. */
  lastStake?: string;
  /** Token unit shown next to the stake (MON / USDm). */
  stakeUnit?: string;
  /**
   * When non-null, the bet UI is replaced by a chain-gate banner.
   * Acceptance (d): fires when wagmi reports chainId ≠ 10143/143.
   */
  chainGate: CoinflipChainGate | null;
  /** Show the "Connect wallet" CTA instead of the bet CTA. */
  needsConnect: boolean;
  /** Connect-wallet click handler. Wired from RainbowKit / wagmi. */
  onConnect: () => void;
  /** Whether `placeBet` is currently in flight. */
  busy: boolean;
  /** Place-bet click handler. Fires the wagmi `placeBet` call. */
  onPlaceBet: () => void;
  /** Hard-disabled CTA (e.g. contract not deployed on this chain). */
  ctaDisabled?: boolean;
  /** When set, replaces the dynamic CTA label (e.g. for diagnostics). */
  ctaLabelOverride?: string;
  /**
   * Result side reported by the on-chain `BetSettled` event listener.
   * `null` before settlement; "heads" | "tails" after.
   */
  settledSide: CoinflipSide | null;
  /** Payout in MON (string, formatted). */
  settledPayout?: string | null;
  /** Optional error string surfaced under the CTA. */
  error?: string | null;
  /** Tx hash for the FairnessProof card. */
  txHash?: string | null;
  /** Server commit hash for the FairnessProof card. */
  serverCommit?: string | null;
  /** Client seed for the FairnessProof card. */
  clientSeed?: string | null;
  /** Slot for a TrustStrip or other live widget above the panel. */
  trustStrip?: ReactNode;
}

export const ALLOWED_CHAIN_IDS = [143, 10143] as const;
export const PAYOUT_MULTIPLIER = 1.98;

function outcomeFor(
  settledSide: CoinflipSide | null,
  pickedSide: CoinflipSide,
): CoinflipOutcome {
  if (settledSide == null) return null;
  return settledSide === pickedSide ? 'won' : 'lost';
}

function profitOnWin(stake: string, unit: string): string | undefined {
  const n = parseFloat(stake || '0');
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const profit = n * PAYOUT_MULTIPLIER - n;
  return `${parseFloat(profit.toFixed(6))} ${unit}`;
}

export function CoinflipPanel(props: CoinflipPanelProps) {
  const {
    side,
    onSideChange,
    stake,
    onStakeChange,
    lastStake,
    stakeUnit = 'MON',
    chainGate,
    needsConnect,
    onConnect,
    busy,
    onPlaceBet,
    ctaDisabled = false,
    ctaLabelOverride,
    settledSide,
    settledPayout,
    error,
    txHash,
    serverCommit,
    clientSeed,
    trustStrip,
  } = props;

  const outcome = outcomeFor(settledSide, side);

  // Live-region message (acceptance (c) for screen readers and tests).
  let liveMessage = '';
  if (outcome === 'won') {
    const payout = settledPayout ?? '';
    liveMessage = payout
      ? `You won ${payout} ${stakeUnit} on ${side}.`
      : `You won on ${side}.`;
  } else if (outcome === 'lost') {
    liveMessage = `You lost ${stake} ${stakeUnit} on ${side}. The coin landed ${settledSide}.`;
  }

  let cta: BetPanelCta;
  if (chainGate) {
    cta = {
      label: chainGate.switching
        ? 'Switching network…'
        : `Switch to ${chainGate.chainName}`,
      onClick: chainGate.onSwitch,
      disabled: chainGate.switching,
    };
  } else if (needsConnect) {
    cta = {
      label: 'Connect wallet',
      onClick: onConnect,
      disabled: false,
    };
  } else if (busy) {
    cta = {
      label: 'Confirm in wallet…',
      onClick: () => {},
      disabled: true,
    };
  } else {
    cta = {
      label: ctaLabelOverride ?? `Flip for ${stake} ${stakeUnit}`,
      onClick: onPlaceBet,
      disabled: ctaDisabled,
    };
  }

  const sideSelector = (
    <div style={sideRowStyle} data-testid="coinflip-side-selector">
      {(['heads', 'tails'] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSideChange(s)}
          aria-pressed={side === s}
          className="swo-casino-hit-44"
          style={side === s ? sideSelectedStyle : sideStyle}
          data-testid={`coinflip-side-${s}`}
        >
          {s}
        </button>
      ))}
    </div>
  );

  return (
    <main style={pageStyle} data-testid="coinflip-page">
      <header style={headerStyle}>
        <h1 style={titleStyle}>Coinflip</h1>
        <span style={chainHintStyle} data-testid="coinflip-multiplier">
          Cosmic Casino · 1.98×
        </span>
      </header>

      {trustStrip}

      {chainGate && (
        <div
          role="alert"
          data-testid="coinflip-chain-gate"
          style={chainGateBannerStyle}
        >
          <p style={chainGateTitleStyle}>Wrong network</p>
          <p style={chainGateBodyStyle}>
            Coinflip runs on {chainGate.chainName}. Switch chains to place a
            bet.
          </p>
        </div>
      )}

      {outcome && (
        <div
          style={outcome === 'won' ? wonBannerStyle : lostBannerStyle}
          data-testid={`coinflip-outcome-${outcome}`}
        >
          {outcome === 'won' ? 'Won' : 'Lost'}
          {outcome === 'won' && settledPayout
            ? ` · +${settledPayout} ${stakeUnit}`
            : ''}
        </div>
      )}

      <BetPanel
        testIdPrefix="coinflip"
        ariaLabel="Coinflip controls"
        multiplier="1.98×"
        sideSelector={sideSelector}
        stakeUnit={stakeUnit}
        stake={stake}
        onStakeChange={onStakeChange}
        lastStake={lastStake}
        chipMax="0.1"
        profitOnWin={profitOnWin(stake, stakeUnit)}
        liveMessage={liveMessage}
        cta={cta}
        onPanelEnter={
          !chainGate && !needsConnect && !busy && !ctaDisabled
            ? onPlaceBet
            : undefined
        }
        extras={
          error ? (
            <p style={errorStyle} data-testid="coinflip-error">
              {error}
            </p>
          ) : undefined
        }
      />

      <FairnessProof
        testIdPrefix="coinflip"
        serverCommit={serverCommit ?? null}
        clientSeed={clientSeed ?? undefined}
        txHash={txHash ?? null}
      />
    </main>
  );
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  width: '100%',
  maxWidth: 480,
  margin: '0 auto',
  padding: '1rem 1rem 2rem',
  color: 'var(--swo-casino-fg, #e8e8e8)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: 'var(--swo-casino-fg-strong, #fff)',
  fontSize: '1.5rem',
};

const chainHintStyle: CSSProperties = {
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.6))',
  fontSize: '0.8125rem',
  fontVariantNumeric: 'tabular-nums',
};

const sideRowStyle: CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
};

const sideStyle: CSSProperties = {
  flex: 1,
  padding: '0.875rem',
  borderRadius: 12,
  border: '1px solid var(--swo-casino-border, rgba(255,255,255,0.16))',
  background: 'var(--swo-casino-elevated, rgba(255,255,255,0.06))',
  color: 'var(--swo-casino-fg, #e8e8e8)',
  fontWeight: 600,
  textTransform: 'capitalize',
  cursor: 'pointer',
  minHeight: 44,
  fontSize: '1rem',
};

const sideSelectedStyle: CSSProperties = {
  ...sideStyle,
  border: '2px solid var(--swo-casino-brand-gold, #ffd700)',
  background: 'var(--swo-casino-brand-gold, #ffd700)',
  color: 'var(--swo-casino-brand-ink, #0a0a1a)',
};

const chainGateBannerStyle: CSSProperties = {
  borderRadius: 12,
  border: '1px solid var(--swo-casino-danger-border, rgba(255,68,102,0.45))',
  background: 'var(--swo-casino-danger-bg, rgba(255,68,102,0.12))',
  padding: '0.75rem 0.9rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
};

const chainGateTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.875rem',
  fontWeight: 700,
  color: 'var(--swo-casino-danger-fg, #ff6680)',
};

const chainGateBodyStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.8125rem',
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.7))',
};

const wonBannerStyle: CSSProperties = {
  borderRadius: 12,
  border: '1px solid var(--swo-casino-win-border, rgba(68,255,136,0.5))',
  background: 'var(--swo-casino-win-bg, rgba(68,255,136,0.12))',
  color: 'var(--swo-casino-win-fg, #44ff88)',
  padding: '0.6rem 0.9rem',
  fontSize: '1rem',
  fontWeight: 700,
  letterSpacing: '0.05em',
};

const lostBannerStyle: CSSProperties = {
  ...wonBannerStyle,
  borderColor: 'var(--swo-casino-loss-border, rgba(153,102,255,0.45))',
  background: 'var(--swo-casino-loss-bg, rgba(153,102,255,0.12))',
  color: 'var(--swo-casino-loss-fg, #b894ff)',
};

const errorStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.8125rem',
  color: 'var(--swo-casino-danger-fg, #ff6680)',
};
