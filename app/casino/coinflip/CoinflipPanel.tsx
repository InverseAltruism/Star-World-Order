// CoinflipPanel — pure presentational shell for /casino/coinflip.
//
// Splits cleanly from `CoinflipContent` so vitest can exercise the synchronous
// code paths (render, side toggle, CTA dispatch, chain-gate copy, Won/Lost
// banner) without booting a WagmiProvider or `<TestClient />`. Every wagmi-
// derived value the surface needs flows in via props.

'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { Address, Hex } from 'viem';

import { BetPanel, type BetPanelCta } from '@/components/casino/BetPanel';
import { FairnessProof } from '@/components/casino/FairnessProof';
import { TrustStrip } from '@/components/casino/TrustStrip';

export type Side = 'heads' | 'tails';
export type Outcome = 'won' | 'lost' | null;

export const MONAD_MAINNET_CHAIN_ID = 143;
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const SUPPORTED_CHAIN_IDS: ReadonlyArray<number> = [
  MONAD_MAINNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
];

export const PAYOUT_MULTIPLIER = 1.98;

export interface CoinflipPanelProps {
  /** Current side pick. */
  side: Side;
  onSideChange: (next: Side) => void;
  /** Stake input (controlled, MON). */
  stake: string;
  onStakeChange: (next: string) => void;
  /** Last submitted stake — feeds BetPanel's "Bet last" chip. */
  lastStake?: string;
  /** Wallet connection status. */
  isConnected: boolean;
  /** Active chain id wagmi reports (undefined pre-connect). */
  activeChainId: number | undefined;
  /** Network-switch CTA. */
  onSwitchChain: () => void;
  switching: boolean;
  /** Deployed CosmicFlip address for the active chain. */
  cosmicFlipAddress: Address | undefined;
  /** "Confirm in wallet" state from wagmi. */
  signing: boolean;
  /** Latest tx hash from wagmi.useWriteContract.data. */
  txHash: Hex | null;
  /** Bet-flow error surfaces. */
  betError: string | null;
  writeError: Error | null;
  /** placeBet handler — pure callback from the container. */
  onPlaceBet: () => void;
  /** Settled outcome state. */
  outcome: Outcome;
  /** Revealed server seed (post-settle). Drives FairnessProof. */
  serverReveal: Hex | null;
  /** Optional client salt fed into FairnessProof's outcome derivation. */
  clientSeed: Hex | null;
  /** Optional override for the CTA (e.g. RainbowKit's connect modal). */
  ctaOverride?: ReactNode;
}

export function profitOnWin(stake: string, unit = 'MON'): string | undefined {
  const n = parseFloat(stake || '0');
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const profit = n * PAYOUT_MULTIPLIER - n;
  const trimmed = parseFloat(profit.toFixed(6)).toString();
  return `${trimmed} ${unit}`;
}

export function CoinflipPanel(props: CoinflipPanelProps) {
  const {
    side,
    onSideChange,
    stake,
    onStakeChange,
    lastStake,
    isConnected,
    activeChainId,
    onSwitchChain,
    switching,
    cosmicFlipAddress,
    signing,
    txHash,
    betError,
    writeError,
    onPlaceBet,
    outcome,
    serverReveal,
    clientSeed,
    ctaOverride,
  } = props;

  // Chain-gate keys off `isConnected`: pre-connect the activeChainId is
  // undefined or stale, so we explicitly require connection before tripping
  // the wrong-chain CTA.
  const onSupportedChain =
    typeof activeChainId === 'number' && SUPPORTED_CHAIN_IDS.includes(activeChainId);
  const onWrongChain = isConnected && !onSupportedChain;

  const canFlip =
    isConnected && !onWrongChain && Boolean(cosmicFlipAddress) && !signing;

  let cta: BetPanelCta;
  if (!isConnected) {
    cta = { label: 'Connect wallet', onClick: () => {}, disabled: true };
  } else if (onWrongChain) {
    cta = {
      label: switching ? 'Switching network…' : 'Switch to Monad',
      onClick: onSwitchChain,
      disabled: switching,
    };
  } else if (!cosmicFlipAddress) {
    cta = {
      label: 'Cosmic Flip not deployed yet',
      onClick: () => {},
      disabled: true,
    };
  } else if (signing) {
    cta = { label: 'Confirm in wallet…', onClick: () => {}, disabled: true };
  } else {
    cta = {
      label: `Flip for ${stake} MON`,
      onClick: onPlaceBet,
      disabled: false,
    };
  }

  const liveMessage = (() => {
    if (outcome === 'won') return `You won ${stake} MON on ${side}.`;
    if (outcome === 'lost') return `You lost ${stake} MON on ${side}.`;
    return '';
  })();

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

  const extras = (
    <>
      {betError ? (
        <p style={errorStyle} data-testid="coinflip-bet-error">
          {betError}
        </p>
      ) : null}
      {writeError ? (
        <p style={errorStyle} data-testid="coinflip-write-error">
          {writeError.message}
        </p>
      ) : null}
      {txHash ? (
        <p style={txStyle} data-testid="coinflip-tx-receipt">
          Tx submitted: <code>{txHash.slice(0, 14)}…</code>
        </p>
      ) : null}
      {outcome ? (
        <p
          style={outcome === 'won' ? wonStyle : lostStyle}
          data-testid={`coinflip-outcome-${outcome}`}
        >
          {outcome === 'won' ? 'Won' : 'Lost'} — {side} settled
        </p>
      ) : null}
    </>
  );

  return (
    <div style={pageStyle} data-testid="coinflip-page">
      <header style={headerStyle}>
        <h1 style={titleStyle}>Cosmic Flip</h1>
        <span style={chainHintStyle} data-testid="coinflip-chain-hint">
          {activeChainId === MONAD_TESTNET_CHAIN_ID ? 'Monad Testnet' : 'Monad'} · 1.98×
        </span>
      </header>

      {onWrongChain ? (
        <div style={chainGateStyle} data-testid="coinflip-chain-gate">
          Wrong network — Switch to Monad (143/10143) to place bets.
        </div>
      ) : null}

      <TrustStrip
        initialData={{
          houseLiquidityEth: 0,
          edgeRealisedPct: 0,
          lastBetSecondsAgo: null,
          generatedAt: new Date(0).toISOString(),
        }}
        fetcher={async () => ({
          houseLiquidityEth: 0,
          edgeRealisedPct: 0,
          lastBetSecondsAgo: null,
          generatedAt: new Date(0).toISOString(),
        })}
      />

      <BetPanel
        testIdPrefix="coinflip"
        ariaLabel="Coinflip controls"
        multiplier="1.98×"
        sideSelector={sideSelector}
        stakeUnit="MON"
        stake={stake}
        onStakeChange={onStakeChange}
        lastStake={lastStake}
        chipMax="0.1"
        profitOnWin={profitOnWin(stake)}
        liveMessage={liveMessage}
        cta={cta}
        ctaOverride={ctaOverride}
        onPanelEnter={canFlip ? onPlaceBet : undefined}
        extras={extras}
      />

      {serverReveal ? (
        <FairnessProof
          reveal={serverReveal}
          salt={clientSeed ?? undefined}
          game="coinflip"
        />
      ) : null}
    </div>
  );
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  color: 'var(--swo-casino-fg, #e8e8e8)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '1.5rem',
  color: 'var(--swo-casino-brand-gold, #ffd700)',
};

const chainHintStyle: CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.6))',
  fontVariantNumeric: 'tabular-nums',
};

const chainGateStyle: CSSProperties = {
  padding: '0.6rem 0.8rem',
  borderRadius: 10,
  border: '1px solid rgba(255,107,107,0.4)',
  background: 'rgba(255,107,107,0.1)',
  color: 'var(--swo-casino-danger-fg, #ff6b6b)',
  fontSize: '0.85rem',
};

const sideRowStyle: CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
};

const sideStyle: CSSProperties = {
  flex: 1,
  minHeight: 44,
  padding: '0.85rem 1rem',
  borderRadius: 12,
  border: '1px solid var(--swo-casino-border, rgba(255,255,255,0.16))',
  background: 'var(--swo-casino-elevated, rgba(255,255,255,0.06))',
  color: 'var(--swo-casino-fg, #e8e8e8)',
  fontWeight: 600,
  textTransform: 'capitalize',
  cursor: 'pointer',
};

const sideSelectedStyle: CSSProperties = {
  ...sideStyle,
  border: '2px solid var(--swo-casino-brand-gold, #ffd700)',
  background: 'var(--swo-casino-brand-gold, #ffd700)',
  color: 'var(--swo-casino-brand-ink, #0a0a1a)',
};

const errorStyle: CSSProperties = {
  margin: 0,
  color: 'var(--swo-casino-danger-fg, #ff6b6b)',
  fontSize: '0.8rem',
};

const txStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.75rem',
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.6))',
};

const wonStyle: CSSProperties = {
  margin: 0,
  padding: '0.5rem 0.75rem',
  borderRadius: 10,
  fontSize: '0.95rem',
  fontWeight: 700,
  color: 'var(--swo-casino-brand-ink, #0a0a1a)',
  background: 'var(--swo-casino-brand-gold, #ffd700)',
};

const lostStyle: CSSProperties = {
  margin: 0,
  padding: '0.5rem 0.75rem',
  borderRadius: 10,
  fontSize: '0.95rem',
  fontWeight: 700,
  color: 'var(--swo-casino-fg-strong, #ffffff)',
  background: 'rgba(255,107,107,0.18)',
  border: '1px solid rgba(255,107,107,0.4)',
};
