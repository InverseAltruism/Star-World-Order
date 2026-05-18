// ChainGate — wraps a Cosmic Casino bet surface and blocks placement when the
// connected wallet is on a chain SWO does not support. Ported behaviour from
// BunnyBagz's network-guard, narrowed to Monad mainnet (143) and Monad testnet
// (10143).
//
// Anatomy:
//
//   ┌───────────────────────────────────────────────┐
//   │  Wrong chain detected — "Switch to Monad …"   │
//   │  [Switch to Monad testnet]  (CTA)             │
//   │  ─ wraps children in <fieldset disabled> ─    │
//   │  <bet panel here, every button is disabled>   │
//   └───────────────────────────────────────────────┘
//
// Acceptance for [SWO_CASINO_UI_CHAIN_GATE]:
//   (a) component exists at `components/casino/ChainGate.tsx`;
//   (b) Vitest covers passthrough (correct chain) and CTA (wrong chain);
//   (c) Playwright proves the click calls `wallet_switchEthereumChain` once
//       through wagmi's `useSwitchChain`.
//
// Testability: the component reads `useChainId` and `useSwitchChain` from
// wagmi by default. Tests can either `vi.mock('wagmi', …)` or pass the
// optional `chainId` / `switchChain` props directly — the prop overrides are
// the deterministic surface the unit tests prefer.

'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useChainId as wagmiUseChainId, useSwitchChain as wagmiUseSwitchChain } from 'wagmi';

export const MONAD_MAINNET_CHAIN_ID = 143;
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const SUPPORTED_CHAIN_IDS = [
  MONAD_MAINNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
] as const;

export type SupportedChainId =
  | typeof MONAD_MAINNET_CHAIN_ID
  | typeof MONAD_TESTNET_CHAIN_ID;

export interface ChainGateProps {
  /**
   * Children rendered in passthrough when the wallet is on a supported chain.
   * In the wrong-chain branch, they are wrapped in a `<fieldset disabled
   * aria-disabled="true">` so every interactive control inside reports
   * `disabled` (and screen readers announce it).
   */
  children: ReactNode;
  /**
   * Which Monad chain this surface targets. Defaults to mainnet (143). The
   * CTA label flips to "Switch to Monad testnet" when this is 10143.
   */
  expectedChainId?: SupportedChainId;
  /**
   * Override for unit tests. Falls back to `wagmi.useChainId()`.
   */
  chainId?: number;
  /**
   * Override for unit tests. Falls back to `wagmi.useSwitchChain().switchChain`.
   * Receives `{ chainId }` and is responsible for emitting
   * `wallet_switchEthereumChain` (wagmi's hook does this for us).
   */
  switchChain?: (args: { chainId: number }) => void;
  /** Stable prefix for `data-testid` (defaults to `chain-gate`). */
  testIdPrefix?: string;
}

function useResolvedChainId(override: number | undefined): number {
  // Hooks must run unconditionally; the override branch picks the value
  // *after* the hook fires. wagmi's `useChainId` is safe to call on the
  // server (returns the configured chain) and in happy-dom.
  const hookId = wagmiUseChainId();
  return override ?? hookId;
}

function useResolvedSwitchChain(
  override: ChainGateProps['switchChain'],
): (args: { chainId: number }) => void {
  const { switchChain } = wagmiUseSwitchChain();
  return override ?? switchChain;
}

export function ChainGate(props: ChainGateProps) {
  const {
    children,
    expectedChainId = MONAD_MAINNET_CHAIN_ID,
    chainId: chainIdOverride,
    switchChain: switchChainOverride,
    testIdPrefix = 'chain-gate',
  } = props;

  const chainId = useResolvedChainId(chainIdOverride);
  const switchChain = useResolvedSwitchChain(switchChainOverride);

  const onCorrectChain = (SUPPORTED_CHAIN_IDS as readonly number[]).includes(
    chainId,
  )
    ? chainId === expectedChainId
    : false;

  if (onCorrectChain) {
    return (
      <div data-testid={`${testIdPrefix}-passthrough`} data-chain-id={chainId}>
        {children}
      </div>
    );
  }

  const ctaLabel =
    expectedChainId === MONAD_TESTNET_CHAIN_ID
      ? 'Switch to Monad testnet'
      : 'Switch to Monad mainnet';

  function handleSwitch() {
    switchChain({ chainId: expectedChainId });
  }

  return (
    <div
      data-testid={`${testIdPrefix}-wrong-chain`}
      data-chain-id={chainId}
      data-expected-chain-id={expectedChainId}
      role="region"
      aria-label="Wrong network"
      style={containerStyle}
    >
      <p style={messageStyle} data-testid={`${testIdPrefix}-message`}>
        Wrong network detected — switch to continue.
      </p>
      <button
        type="button"
        onClick={handleSwitch}
        style={ctaStyle}
        data-testid={`${testIdPrefix}-cta`}
      >
        {ctaLabel}
      </button>
      <fieldset
        disabled
        aria-disabled="true"
        style={fieldsetStyle}
        data-testid={`${testIdPrefix}-disabled-children`}
      >
        {children}
      </fieldset>
    </div>
  );
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const messageStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.875rem',
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.7))',
};

const ctaStyle: CSSProperties = {
  padding: '0.75rem 1rem',
  borderRadius: 12,
  border: 'none',
  background: 'var(--swo-casino-brand-gold, #ffd700)',
  color: 'var(--swo-casino-brand-ink, #0a0a1a)',
  fontWeight: 700,
  fontSize: '1rem',
  cursor: 'pointer',
  minHeight: 44,
};

const fieldsetStyle: CSSProperties = {
  border: 'none',
  padding: 0,
  margin: 0,
  opacity: 0.45,
};
