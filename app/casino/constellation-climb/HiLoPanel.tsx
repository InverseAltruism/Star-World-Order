// HiLoPanel — pure presentational shell for /casino/constellation-climb.
//
// Mirrors the Panel/Content/page split used by coinflip + dice so vitest can
// exercise the synchronous code paths (render, three primary CTAs:
// openSession / step / cashOut, chain-gate, allowlist gate) without booting
// a WagmiProvider. Every wagmi-derived value flows in via props.
//
// Scope: this is the minimum UI surface needed to land the allowlist gate
// integration for [SWO_CASINO_ALLOWLIST_UI_GATE_HILO]. The full HiLo session
// chrome (card art, direction picker, multiplier ladder, refund expiry
// banner) ships under [SWO_CASINO_HILO_UI].

'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { Address, Hex } from 'viem';

import { BetPanel, type BetPanelCta } from '@/components/casino/BetPanel';

export type Direction = 'higher' | 'lower';
export type SessionStatus =
  | 'idle' // no active session — show openSession CTA
  | 'open' // session live — show step / cashOut CTAs
  | 'cashedOut'
  | 'lost'
  | 'pushed'
  | 'refunded';

export const MONAD_MAINNET_CHAIN_ID = 143;
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const SUPPORTED_CHAIN_IDS: ReadonlyArray<number> = [
  MONAD_MAINNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
];

/** WAD-scaled multiplier → human-readable "1.99×". */
export function fmtMultiplier(wad: bigint): string {
  // 1e18 == 1.0×. Use floating-point for display only.
  const n = Number(wad) / 1e18;
  if (!Number.isFinite(n)) return '1×';
  return `${parseFloat(n.toFixed(4)).toString()}×`;
}

export interface HiLoPanelProps {
  /** Stake input (controlled, MON). */
  stake: string;
  onStakeChange: (next: string) => void;
  /** Direction pick for the next step. */
  direction: Direction;
  onDirectionChange: (next: Direction) => void;
  /** Last submitted stake — feeds BetPanel's "Bet last" chip. */
  lastStake?: string;
  /** Wallet connection status. */
  isConnected: boolean;
  /** Active chain id wagmi reports (undefined pre-connect). */
  activeChainId: number | undefined;
  /** Network-switch CTA. */
  onSwitchChain: () => void;
  switching: boolean;
  /** Deployed ConstellationClimb address for the active chain. */
  constellationClimbAddress: Address | undefined;
  /** Session lifecycle. */
  sessionStatus: SessionStatus;
  /** Current card showing on the table (1..13). */
  currentCard: number | null;
  /** Cumulative WAD-scaled multiplier (1e18 == 1.0×). */
  multiplierWad: bigint;
  /** "Confirm in wallet" state from wagmi. */
  signing: boolean;
  /** Latest tx hash from wagmi.useWriteContract.data. */
  txHash: Hex | null;
  /** Errors. */
  betError: string | null;
  writeError: Error | null;
  /**
   * Allowlist gate decision lifted from the container. When `true`, ALL
   * three primary CTAs (openSession / step / cashOut) render as disabled
   * "Allowlist required" so the user cannot trigger a wallet signing
   * prompt for a flow the contract would revert.
   * See lib/casino/useAllowlistGate.ts.
   */
  allowlistBlocked?: boolean;
  /** Callbacks for each lifecycle CTA. */
  onOpenSession: () => void;
  onStep: () => void;
  onCashOut: () => void;
  /** Optional override for the CTA (e.g. RainbowKit's connect modal). */
  ctaOverride?: ReactNode;
}

export function HiLoPanel(props: HiLoPanelProps) {
  const {
    stake,
    onStakeChange,
    direction,
    onDirectionChange,
    lastStake,
    isConnected,
    activeChainId,
    onSwitchChain,
    switching,
    constellationClimbAddress,
    sessionStatus,
    currentCard,
    multiplierWad,
    signing,
    txHash,
    betError,
    writeError,
    allowlistBlocked,
    onOpenSession,
    onStep,
    onCashOut,
    ctaOverride,
  } = props;

  const onSupportedChain =
    typeof activeChainId === 'number' && SUPPORTED_CHAIN_IDS.includes(activeChainId);
  const onWrongChain = isConnected && !onSupportedChain;

  const multLabel = fmtMultiplier(multiplierWad);
  const sessionOpen = sessionStatus === 'open';

  // The Hi-Lo flow has three primary CTAs, each gated by the same chain +
  // allowlist preconditions but with different lifecycle prerequisites.
  function buildPrimaryCta(): BetPanelCta {
    if (!isConnected) {
      return { label: 'Connect wallet', onClick: () => {}, disabled: true };
    }
    if (onWrongChain) {
      return {
        label: switching ? 'Switching network…' : 'Switch to Monad',
        onClick: onSwitchChain,
        disabled: switching,
      };
    }
    if (!constellationClimbAddress) {
      return {
        label: 'Constellation Climb not deployed yet',
        onClick: () => {},
        disabled: true,
      };
    }
    if (signing) {
      return { label: 'Confirm in wallet…', onClick: () => {}, disabled: true };
    }
    if (allowlistBlocked) {
      return {
        label: 'Allowlist required',
        onClick: () => {},
        disabled: true,
      };
    }
    if (sessionOpen) {
      // Primary CTA in open state is "Step" — cashOut renders as a
      // secondary button below.
      return {
        label: `Step ${direction === 'higher' ? 'Higher' : 'Lower'}`,
        onClick: onStep,
        disabled: false,
      };
    }
    return {
      label: `Open session for ${stake} MON`,
      onClick: onOpenSession,
      disabled: false,
    };
  }

  const cta = buildPrimaryCta();

  const cashOutDisabled =
    !sessionOpen ||
    signing ||
    onWrongChain ||
    !isConnected ||
    !constellationClimbAddress ||
    Boolean(allowlistBlocked);

  const cashOutLabel = allowlistBlocked
    ? 'Allowlist required'
    : `Cash out ${multLabel}`;

  const liveMessage = (() => {
    if (sessionStatus === 'cashedOut') return `Cashed out at ${multLabel}.`;
    if (sessionStatus === 'lost') return `Lost — session ended.`;
    if (sessionStatus === 'pushed') return `Push — stake returned.`;
    if (sessionStatus === 'refunded') return `Refunded — stake returned.`;
    if (sessionOpen && currentCard !== null) {
      return `Current card ${currentCard}. Next step betting ${direction}.`;
    }
    return '';
  })();

  const sideSelector = (
    <div style={directionSectionStyle} data-testid="hilo-direction-selector">
      <span style={directionLabelStyle}>Bet next card is</span>
      <div style={directionButtonRowStyle}>
        <button
          type="button"
          onClick={() => onDirectionChange('higher')}
          aria-pressed={direction === 'higher'}
          className="swo-casino-hit-44"
          data-testid="hilo-direction-higher"
          style={{
            ...directionButtonStyle,
            ...(direction === 'higher' ? directionButtonActiveStyle : null),
          }}
          disabled={sessionStatus !== 'open' && sessionStatus !== 'idle'}
        >
          ↑ Higher
        </button>
        <button
          type="button"
          onClick={() => onDirectionChange('lower')}
          aria-pressed={direction === 'lower'}
          className="swo-casino-hit-44"
          data-testid="hilo-direction-lower"
          style={{
            ...directionButtonStyle,
            ...(direction === 'lower' ? directionButtonActiveStyle : null),
          }}
          disabled={sessionStatus !== 'open' && sessionStatus !== 'idle'}
        >
          ↓ Lower
        </button>
      </div>
    </div>
  );

  const extras = (
    <>
      {sessionOpen ? (
        <button
          type="button"
          onClick={onCashOut}
          disabled={cashOutDisabled}
          className="swo-casino-hit-44"
          data-testid="hilo-cashout-cta"
          style={cashOutButtonStyle}
        >
          {cashOutLabel}
        </button>
      ) : null}
      {betError ? (
        <p style={errorStyle} data-testid="hilo-bet-error">
          {betError}
        </p>
      ) : null}
      {writeError ? (
        <p style={errorStyle} data-testid="hilo-write-error">
          {writeError.message}
        </p>
      ) : null}
      {txHash ? (
        <p style={txStyle} data-testid="hilo-tx-receipt">
          Tx submitted: <code>{txHash.slice(0, 14)}…</code>
        </p>
      ) : null}
      {sessionStatus !== 'idle' && sessionStatus !== 'open' ? (
        <p style={statusStyle} data-testid={`hilo-status-${sessionStatus}`}>
          Session {sessionStatus}
        </p>
      ) : null}
    </>
  );

  return (
    <div style={pageStyle} data-testid="hilo-page">
      <header style={headerStyle}>
        <h1 style={titleStyle}>Constellation Climb</h1>
        <span style={chainHintStyle} data-testid="hilo-chain-hint">
          {activeChainId === MONAD_TESTNET_CHAIN_ID ? 'Monad Testnet' : 'Monad'}{' '}
          · {multLabel}
        </span>
      </header>

      {onWrongChain ? (
        <div style={chainGateStyle} data-testid="hilo-chain-gate">
          Wrong network — Switch to Monad (143/10143) to play.
        </div>
      ) : null}

      <div style={cardRowStyle} data-testid="hilo-card-row">
        <span style={cardLabelStyle}>Current card</span>
        <span
          className="swo-casino-tabular"
          style={cardValueStyle}
          data-testid="hilo-current-card"
        >
          {currentCard === null ? '—' : currentCard}
        </span>
      </div>

      <BetPanel
        testIdPrefix="hilo"
        ariaLabel="Hi-Lo controls"
        multiplier={multLabel}
        sideSelector={sideSelector}
        stakeUnit="MON"
        stake={stake}
        onStakeChange={onStakeChange}
        lastStake={lastStake}
        chipMax="0.1"
        liveMessage={liveMessage}
        cta={cta}
        ctaOverride={ctaOverride}
        extras={extras}
      />
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

const cardRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.65rem 0.8rem',
  borderRadius: 12,
  background: 'var(--swo-casino-elevated, rgba(255,255,255,0.06))',
  border: '1px solid var(--swo-casino-border, rgba(255,255,255,0.16))',
};

const cardLabelStyle: CSSProperties = {
  fontSize: '0.8125rem',
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.6))',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const cardValueStyle: CSSProperties = {
  fontSize: '1.5rem',
  fontWeight: 700,
  color: 'var(--swo-casino-fg-strong, #ffffff)',
};

const directionSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
};

const directionLabelStyle: CSSProperties = {
  fontSize: '0.8125rem',
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.6))',
};

const directionButtonRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '0.5rem',
};

const directionButtonStyle: CSSProperties = {
  minHeight: 44,
  border: '1px solid var(--swo-casino-border, rgba(255,255,255,0.16))',
  borderRadius: 10,
  background: 'transparent',
  color: 'var(--swo-casino-fg, #e8e8e8)',
  fontWeight: 600,
  cursor: 'pointer',
};

const directionButtonActiveStyle: CSSProperties = {
  background: 'var(--swo-casino-brand-gold, #ffd700)',
  color: '#0a0a0a',
  borderColor: 'var(--swo-casino-brand-gold, #ffd700)',
};

const cashOutButtonStyle: CSSProperties = {
  width: '100%',
  minHeight: 44,
  borderRadius: 10,
  border: '1px solid var(--swo-casino-border, rgba(255,255,255,0.16))',
  background: 'var(--swo-casino-elevated, rgba(255,255,255,0.08))',
  color: 'var(--swo-casino-fg-strong, #ffffff)',
  fontWeight: 600,
  cursor: 'pointer',
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

const statusStyle: CSSProperties = {
  margin: 0,
  padding: '0.5rem 0.75rem',
  borderRadius: 8,
  background: 'var(--swo-casino-elevated, rgba(255,255,255,0.06))',
  color: 'var(--swo-casino-fg-strong, #ffffff)',
  fontWeight: 600,
};
