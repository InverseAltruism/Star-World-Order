// DicePanel — pure presentational shell for /casino/dice.
//
// Mirrors the Panel/Content/page split used by the coinflip surface so vitest
// can exercise the synchronous code paths (render, rollUnder slider,
// stake input, primary CTA, chain-gate, Won/Lost banner, FairnessProof reveal)
// without booting a WagmiProvider. Every wagmi-derived value flows in via
// props.
//
// Acceptance for [SWO_CASINO_DICE_UI]:
//   - rollUnder slider clamped to [2..98]
//   - quoted payout computed client-side via `(stake * 99) / (rollUnder - 1)`
//   - same shape as the coinflip page with rollUnder slider semantics in
//     place of the heads/tails picker

'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { Address, Hex } from 'viem';

import { BetPanel, type BetPanelCta } from '@/components/casino/BetPanel';
import { FairnessProof } from '@/components/casino/FairnessProof';
import { TrustStrip } from '@/components/casino/TrustStrip';

export type Outcome = 'won' | 'lost' | null;

export const MIN_ROLL_UNDER = 2;
export const MAX_ROLL_UNDER = 98;
export const PAYOUT_NUM = 99;

export const MONAD_MAINNET_CHAIN_ID = 143;
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const SUPPORTED_CHAIN_IDS: ReadonlyArray<number> = [
  MONAD_MAINNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
];

export interface DicePanelProps {
  /** Current rollUnder slider value (clamped to [2..98]). */
  rollUnder: number;
  onRollUnderChange: (next: number) => void;
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
  /** Deployed GravityDice address for the active chain. */
  gravityDiceAddress: Address | undefined;
  /** "Confirm in wallet" state from wagmi. */
  signing: boolean;
  /** Latest tx hash from wagmi.useWriteContract.data. */
  txHash: Hex | null;
  /** Bet-flow error surfaces. */
  betError: string | null;
  writeError: Error | null;
  /**
   * Allowlist gate decision lifted from the container. When `true`, the
   * primary CTA renders as disabled "Allowlist required" so the user
   * cannot trigger a wallet signing prompt for a bet the contract would
   * revert. See lib/casino/useAllowlistGate.ts.
   */
  allowlistBlocked?: boolean;
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

/** Multiplier = 99 / (rollUnder - 1), clamped to 0 outside the slider range. */
export function multiplierFor(rollUnder: number): number {
  if (rollUnder < MIN_ROLL_UNDER || rollUnder > MAX_ROLL_UNDER) return 0;
  return PAYOUT_NUM / (rollUnder - 1);
}

/** Win probability = (rollUnder - 1) / 100. */
export function winProbabilityFor(rollUnder: number): number {
  if (rollUnder < MIN_ROLL_UNDER || rollUnder > MAX_ROLL_UNDER) return 0;
  return (rollUnder - 1) / 100;
}

/**
 * Quoted payout in MON (or whatever unit) computed client-side via
 * `(stake * 99) / (rollUnder - 1)`. Returns `undefined` for an invalid stake
 * so callers can hide the row.
 */
export function quotedPayout(stake: string, rollUnder: number): number | undefined {
  const n = parseFloat(stake || '0');
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (rollUnder < MIN_ROLL_UNDER || rollUnder > MAX_ROLL_UNDER) return undefined;
  return (n * PAYOUT_NUM) / (rollUnder - 1);
}

/** Profit-on-win row — payout − stake. */
export function profitOnWin(
  stake: string,
  rollUnder: number,
  unit = 'MON',
): string | undefined {
  const payout = quotedPayout(stake, rollUnder);
  if (payout === undefined) return undefined;
  const n = parseFloat(stake || '0');
  const profit = payout - n;
  return `${parseFloat(profit.toFixed(6)).toString()} ${unit}`;
}

function fmtMultiplier(m: number): string {
  return `${parseFloat(m.toFixed(4)).toString()}×`;
}

function fmtPercent(p: number): string {
  return `${(p * 100).toFixed(2)}%`;
}

export function clampRollUnder(value: number): number {
  if (!Number.isFinite(value)) return MIN_ROLL_UNDER;
  if (value < MIN_ROLL_UNDER) return MIN_ROLL_UNDER;
  if (value > MAX_ROLL_UNDER) return MAX_ROLL_UNDER;
  return Math.round(value);
}

export function DicePanel(props: DicePanelProps) {
  const {
    rollUnder,
    onRollUnderChange,
    stake,
    onStakeChange,
    lastStake,
    isConnected,
    activeChainId,
    onSwitchChain,
    switching,
    gravityDiceAddress,
    signing,
    txHash,
    betError,
    writeError,
    allowlistBlocked,
    onPlaceBet,
    outcome,
    serverReveal,
    clientSeed,
    ctaOverride,
  } = props;

  const onSupportedChain =
    typeof activeChainId === 'number' && SUPPORTED_CHAIN_IDS.includes(activeChainId);
  const onWrongChain = isConnected && !onSupportedChain;

  const mult = multiplierFor(rollUnder);
  const winProb = winProbabilityFor(rollUnder);
  const multLabel = fmtMultiplier(mult);

  const canRoll =
    isConnected &&
    !onWrongChain &&
    Boolean(gravityDiceAddress) &&
    !signing &&
    !allowlistBlocked;

  let cta: BetPanelCta;
  if (!isConnected) {
    cta = { label: 'Connect wallet', onClick: () => {}, disabled: true };
  } else if (onWrongChain) {
    cta = {
      label: switching ? 'Switching network…' : 'Switch to Monad',
      onClick: onSwitchChain,
      disabled: switching,
    };
  } else if (!gravityDiceAddress) {
    cta = {
      label: 'Gravity Dice not deployed yet',
      onClick: () => {},
      disabled: true,
    };
  } else if (signing) {
    cta = { label: 'Confirm in wallet…', onClick: () => {}, disabled: true };
  } else if (allowlistBlocked) {
    cta = {
      label: 'Allowlist required',
      onClick: () => {},
      disabled: true,
    };
  } else {
    cta = {
      label: `Roll for ${stake} MON`,
      onClick: onPlaceBet,
      disabled: false,
    };
  }

  const liveMessage = (() => {
    if (outcome === 'won') {
      return `You won, rolled under ${rollUnder} for ${stake} MON.`;
    }
    if (outcome === 'lost') {
      return `You lost, did not roll under ${rollUnder}. Stake ${stake} MON.`;
    }
    return '';
  })();

  const sideSelector = (
    <div style={sliderSectionStyle} data-testid="dice-side-selector">
      <label style={sliderLabelStyle}>
        <span style={sliderLabelTextStyle}>Roll under (2–98)</span>
        <input
          type="range"
          min={MIN_ROLL_UNDER}
          max={MAX_ROLL_UNDER}
          step={1}
          value={rollUnder}
          onChange={(e) =>
            onRollUnderChange(clampRollUnder(Number(e.target.value)))
          }
          aria-valuemin={MIN_ROLL_UNDER}
          aria-valuemax={MAX_ROLL_UNDER}
          aria-valuenow={rollUnder}
          aria-valuetext={`Roll under ${rollUnder}, win chance ${fmtPercent(
            winProb,
          )}, multiplier ${multLabel}`}
          className="swo-casino-hit-44"
          style={sliderInputStyle}
          data-testid="dice-rollunder-slider"
        />
      </label>

      <div style={previewStyle} data-testid="dice-preview">
        <div>
          <span style={previewLabelStyle}>Roll under</span>
          <span
            className="swo-casino-tabular"
            style={previewValueStyle}
            data-testid="dice-rollunder-value"
          >
            {rollUnder}
          </span>
        </div>
        <div>
          <span style={previewLabelStyle}>Win chance</span>
          <span
            className="swo-casino-tabular"
            style={previewValueStyle}
            data-testid="dice-winprob"
          >
            {fmtPercent(winProb)}
          </span>
        </div>
        <div>
          <span style={previewLabelStyle}>Multiplier</span>
          <span
            className="swo-casino-tabular"
            style={previewValueStyle}
            data-testid="dice-multiplier-preview"
          >
            {multLabel}
          </span>
        </div>
      </div>
    </div>
  );

  const extras = (
    <>
      {betError ? (
        <p style={errorStyle} data-testid="dice-bet-error">
          {betError}
        </p>
      ) : null}
      {writeError ? (
        <p style={errorStyle} data-testid="dice-write-error">
          {writeError.message}
        </p>
      ) : null}
      {txHash ? (
        <p style={txStyle} data-testid="dice-tx-receipt">
          Tx submitted: <code>{txHash.slice(0, 14)}…</code>
        </p>
      ) : null}
      {outcome ? (
        <p
          style={outcome === 'won' ? wonStyle : lostStyle}
          data-testid={`dice-outcome-${outcome}`}
        >
          {outcome === 'won' ? 'Won' : 'Lost'} — rolled under {rollUnder}
        </p>
      ) : null}
    </>
  );

  return (
    <div style={pageStyle} data-testid="dice-page">
      <header style={headerStyle}>
        <h1 style={titleStyle}>Gravity Dice</h1>
        <span style={chainHintStyle} data-testid="dice-chain-hint">
          {activeChainId === MONAD_TESTNET_CHAIN_ID ? 'Monad Testnet' : 'Monad'}{' '}
          · {multLabel}
        </span>
      </header>

      {onWrongChain ? (
        <div style={chainGateStyle} data-testid="dice-chain-gate">
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
        testIdPrefix="dice"
        ariaLabel="Dice controls"
        multiplier={multLabel}
        sideSelector={sideSelector}
        stakeUnit="MON"
        stake={stake}
        onStakeChange={onStakeChange}
        lastStake={lastStake}
        chipMax="0.1"
        profitOnWin={profitOnWin(stake, rollUnder)}
        liveMessage={liveMessage}
        cta={cta}
        ctaOverride={ctaOverride}
        onPanelEnter={canRoll ? onPlaceBet : undefined}
        extras={extras}
      />

      {serverReveal ? (
        <FairnessProof
          reveal={serverReveal}
          salt={clientSeed ?? undefined}
          game="dice"
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

const sliderSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.6rem',
};

const sliderLabelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
};

const sliderLabelTextStyle: CSSProperties = {
  fontSize: '0.8125rem',
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.6))',
};

const sliderInputStyle: CSSProperties = {
  width: '100%',
  minHeight: 44,
  accentColor: 'var(--swo-casino-brand-gold, #ffd700)',
};

const previewStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '0.5rem',
  background: 'var(--swo-casino-elevated, rgba(255,255,255,0.06))',
  border: '1px solid var(--swo-casino-border, rgba(255,255,255,0.16))',
  borderRadius: 12,
  padding: '0.65rem',
};

const previewLabelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.6))',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 4,
};

const previewValueStyle: CSSProperties = {
  display: 'block',
  fontSize: '1.1rem',
  fontWeight: 600,
  color: 'var(--swo-casino-fg-strong, #ffffff)',
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
  borderRadius: 8,
  background: 'var(--swo-casino-success-bg, rgba(110,228,110,0.12))',
  color: 'var(--swo-casino-success-fg, #6ee46e)',
  fontWeight: 600,
};

const lostStyle: CSSProperties = {
  margin: 0,
  padding: '0.5rem 0.75rem',
  borderRadius: 8,
  background: 'var(--swo-casino-danger-bg, rgba(255,107,107,0.12))',
  color: 'var(--swo-casino-danger-fg, #ff6b6b)',
  fontWeight: 600,
};
