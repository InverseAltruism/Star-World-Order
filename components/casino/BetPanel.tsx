// BetPanel — shared bet-panel primitive for SWO Cosmic Casino.
//
// Lives in the SWO repo under `components/casino/`. Each Casino game page
// (slots, dice, hilo, coinflip) consumes this primitive instead of
// open-coding ~150 lines of inline panel styles + chrome.
//
// Two QA fixes baked in:
//   (1) Mobile touch-target floor: stake input + token-toggle wrapper
//       both get `min-height: 44px` (class `swo-casino-hit-44`).
//   (2) CTA dwell ≥ 600ms: clicking the primary CTA flips an internal
//       `signingOverlay` flag for 600ms regardless of how fast the
//       caller's wagmi promise resolves so users see the
//       "Confirm in wallet…" label long enough to read it on a fast
//       network where writeContract resolves before the next paint.
//
// Dealer art: a Star Skrumpey companion sprite renders above the
// multiplier badge as the casino mascot. Default points at
// `/casino/skrumpey-dealer-idle.png` (reused from sanctuary IP).
// Callers can swap the sprite per game by passing `dealerArtSrc`.

'use client';

import { useCallback, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';

import { StakeChip, type StakeChipKind } from './StakeChip';

export type BetPanelCta = {
  label: string;
  onClick: () => void;
  disabled: boolean;
};

export type BetPanelProps = {
  /** Stable prefix for `data-testid` (e.g. `slots`, `dice`, `hilo`). */
  testIdPrefix: string;
  /** ARIA label on the surrounding section. Defaults to "Bet controls". */
  ariaLabel?: string;
  /** Hero-sized multiplier badge (e.g. "1.98×", "2.20×"). */
  multiplier: string;
  /** Game-specific picker. */
  sideSelector?: ReactNode;
  /** Token unit shown next to the stake (`MON` | `USDm`). */
  stakeUnit: string;
  /** Current stake input value (controlled). */
  stake: string;
  /** Stake setter wired to the input + chip cluster. */
  onStakeChange: (next: string) => void;
  /** Stake input bounds. */
  minStake?: string;
  maxStake?: string;
  stakeStep?: string;
  /** Last submitted stake — feeds the "Bet last" chip. */
  lastStake?: string;
  /** Cap used by the MAX chip. */
  chipMax?: string;
  /** Show the chip cluster. Defaults to true. */
  showChips?: boolean;
  /** Profit-on-win row (e.g. "0.0198 MON"). Falsy hides the row. */
  profitOnWin?: string;
  /** Optional token toggle (already styled). */
  tokenToggle?: ReactNode;
  /** Aria-live status string, rendered visually-hidden. */
  liveMessage?: string;
  /** Primary CTA spec. */
  cta: BetPanelCta;
  /** Override the primary CTA renderer (e.g. RainbowKit's ConnectButton). */
  ctaOverride?: ReactNode;
  /** Optional Enter-key handler so non-button focus (stake input) fires placeBet. */
  onPanelEnter?: () => void;
  /** Trailing chrome (errors, tx hashes, refund buttons). */
  extras?: ReactNode;
  /** Dwell window for the post-click "Confirm in wallet…" overlay. */
  signingDwellMs?: number;
  /**
   * Override the Star Skrumpey dealer sprite. Defaults to
   * `/casino/skrumpey-dealer-idle.png`. Pass `null` to suppress the art.
   */
  dealerArtSrc?: string | null;
  /** Accessible label for the dealer sprite. */
  dealerArtAlt?: string;
};

const SIGNING_LABEL = 'Confirm in wallet…';
export const DEFAULT_SIGNING_DWELL_MS = 600;
export const DEFAULT_DEALER_ART_SRC = '/casino/skrumpey-dealer-idle.png';

export function BetPanel(props: BetPanelProps) {
  const {
    testIdPrefix,
    ariaLabel = 'Bet controls',
    multiplier,
    sideSelector,
    stakeUnit,
    stake,
    onStakeChange,
    minStake = '0.001',
    maxStake = '0.1',
    stakeStep = '0.001',
    lastStake,
    chipMax,
    showChips = true,
    profitOnWin,
    tokenToggle,
    liveMessage,
    cta,
    ctaOverride,
    onPanelEnter,
    extras,
    signingDwellMs = DEFAULT_SIGNING_DWELL_MS,
    dealerArtSrc = DEFAULT_DEALER_ART_SRC,
    dealerArtAlt = 'Star Skrumpey dealer',
  } = props;

  // [SWO_CASINO_QA_CTA_DWELL]: flip the overlay synchronously on click so
  // the "Confirm in wallet…" label is always visible for at least
  // signingDwellMs, regardless of how fast the caller's writeContract
  // promise resolves.
  const [signingOverlay, setSigningOverlay] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCtaClick = useCallback(() => {
    setSigningOverlay(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSigningOverlay(false);
      timerRef.current = null;
    }, signingDwellMs);
    cta.onClick();
  }, [cta, signingDwellMs]);

  function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement | null;
    if (target && target.tagName === 'BUTTON') return;
    if (cta.disabled || signingOverlay || !onPanelEnter) return;
    e.preventDefault();
    onPanelEnter();
  }

  const chipKinds: StakeChipKind[] = ['halve', 'double', 'max', 'last'];

  const effectiveLabel = signingOverlay ? SIGNING_LABEL : cta.label;
  const effectiveDisabled = signingOverlay || cta.disabled;

  return (
    <section
      style={panelStyle}
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      data-testid={`${testIdPrefix}-bet-panel`}
    >
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid={`${testIdPrefix}-live-region`}
        style={liveRegionStyle}
      >
        {liveMessage ?? ''}
      </div>

      {dealerArtSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dealerArtSrc}
          alt={dealerArtAlt}
          width={64}
          height={64}
          style={dealerArtStyle}
          data-testid={`${testIdPrefix}-dealer-art`}
        />
      ) : null}

      <div
        style={multiplierBadgeStyle}
        data-testid={`${testIdPrefix}-multiplier-badge`}
        className="swo-casino-tabular"
      >
        {multiplier}
      </div>

      {sideSelector}

      <label style={stakeLabelStyle}>
        <span style={stakeLabelTextStyle}>Stake ({stakeUnit})</span>
        <input
          type="number"
          inputMode="decimal"
          step={stakeStep}
          min={minStake}
          max={maxStake}
          value={stake}
          onChange={(e) => onStakeChange(e.target.value)}
          className="swo-casino-tabular swo-casino-hit-44"
          style={stakeInputStyle}
          data-testid={`${testIdPrefix}-stake-input`}
        />
      </label>

      {showChips && (
        <div
          style={chipRowStyle}
          data-testid={`${testIdPrefix}-stake-chips`}
        >
          {chipKinds.map((kind) => (
            <StakeChip
              key={kind}
              kind={kind}
              current={stake}
              max={chipMax}
              last={lastStake}
              onApply={onStakeChange}
              testId={`${testIdPrefix}-chip-${kind}`}
            />
          ))}
        </div>
      )}

      {profitOnWin && (
        <div
          style={profitRowStyle}
          data-testid={`${testIdPrefix}-profit-on-win`}
        >
          <span style={profitLabelStyle}>Profit on Win</span>
          <span className="swo-casino-tabular" style={profitValueStyle}>
            {profitOnWin}
          </span>
        </div>
      )}

      {tokenToggle && (
        <div
          className="swo-casino-hit-44"
          style={tokenToggleWrapperStyle}
          data-testid={`${testIdPrefix}-token-toggle-wrapper`}
        >
          {tokenToggle}
        </div>
      )}

      {ctaOverride ? (
        ctaOverride
      ) : (
        <button
          type="button"
          onClick={handleCtaClick}
          disabled={effectiveDisabled}
          style={effectiveDisabled ? primaryCtaDisabledStyle : primaryCtaStyle}
          data-testid={`${testIdPrefix}-primary-cta`}
        >
          {effectiveLabel}
        </button>
      )}

      {extras}
    </section>
  );
}

const panelStyle: CSSProperties = {
  background: 'var(--swo-casino-surface, rgba(15,15,30,0.85))',
  border: '1px solid var(--swo-casino-border, rgba(255,255,255,0.16))',
  borderRadius: 16,
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  marginTop: 'auto',
  position: 'relative',
};

const multiplierBadgeStyle: CSSProperties = {
  alignSelf: 'flex-start',
  background: 'var(--swo-casino-brand-gold, #ffd700)',
  color: 'var(--swo-casino-brand-ink, #0a0a1a)',
  padding: '0.35rem 0.75rem',
  borderRadius: 999,
  fontWeight: 800,
  fontSize: '1.05rem',
  letterSpacing: '0.02em',
  fontVariantNumeric: 'tabular-nums',
};

const stakeLabelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
};

const stakeLabelTextStyle: CSSProperties = {
  // QA floor: visible label/text must stay ≥ 12px. 0.75rem = 12px on
  // default root, so we pin to 0.75rem as the smallest token used here.
  fontSize: '0.75rem',
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.6))',
};

const dealerArtStyle: CSSProperties = {
  alignSelf: 'flex-start',
  width: 64,
  height: 64,
  imageRendering: 'pixelated',
  marginBottom: '-0.25rem',
};

const stakeInputStyle: CSSProperties = {
  // [SWO_CASINO_QA_MOBILE_TOUCH_TARGET_FLOOR].
  minHeight: 44,
  padding: '0.75rem',
  borderRadius: 10,
  border: '1px solid var(--swo-casino-border, rgba(255,255,255,0.16))',
  background: 'var(--swo-casino-bg, #0a0a1a)',
  color: 'var(--swo-casino-fg, #e8e8e8)',
  fontSize: '1rem',
  fontVariantNumeric: 'tabular-nums',
};

const chipRowStyle: CSSProperties = {
  display: 'flex',
  gap: '0.4rem',
};

const profitRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  padding: '0.5rem 0.75rem',
  borderRadius: 10,
  background: 'var(--swo-casino-elevated, rgba(255,255,255,0.06))',
  border: '1px solid var(--swo-casino-border, rgba(255,255,255,0.16))',
};

const profitLabelStyle: CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.6))',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 600,
};

const profitValueStyle: CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: 'var(--swo-casino-fg-strong, #ffffff)',
};

const tokenToggleWrapperStyle: CSSProperties = {
  // [SWO_CASINO_QA_MOBILE_TOUCH_TARGET_FLOOR].
  minHeight: 44,
  display: 'flex',
  alignItems: 'stretch',
};

const primaryCtaStyle: CSSProperties = {
  padding: '1rem',
  borderRadius: 12,
  border: 'none',
  background: 'var(--swo-casino-brand-gold, #ffd700)',
  color: 'var(--swo-casino-brand-ink, #0a0a1a)',
  fontWeight: 700,
  fontSize: '1.05rem',
  cursor: 'pointer',
  minHeight: 64,
  fontVariantNumeric: 'tabular-nums',
};

const primaryCtaDisabledStyle: CSSProperties = {
  ...primaryCtaStyle,
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.6))',
  border: '1px solid var(--swo-casino-border, rgba(255,255,255,0.16))',
  cursor: 'not-allowed',
};

const liveRegionStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};
