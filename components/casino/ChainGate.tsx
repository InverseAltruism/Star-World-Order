// ChainGate — wagmi chain-aware gate for SWO Cosmic Casino bet flows.
//
// Acceptance contract for [SWO_CASINO_UI_CHAIN_GATE]:
//   (a) component exists
//   (b) when `useChainId()` ∈ {10143, 143} (Monad testnet/mainnet) the gate
//       passes children through untouched
//   (c) when `useChainId()` ∉ the allowed set, the gate:
//         - renders a "Switch to Monad <testnet|mainnet>" CTA that calls
//           the wagmi `switchChain` (which in turn invokes the EIP-3326
//           `wallet_switchEthereumChain` RPC on the injected provider)
//         - wraps children in a `<fieldset disabled aria-disabled="true">`
//           so any nested bet buttons (`<button type="submit">` or any
//           form control) inherit the disabled state without callers
//           needing to plumb a flag through every bet-panel prop.
//
// Splitting into a pure `ChainGateView` and a connected `ChainGate` mirrors
// the BB pattern (and our own CoinflipPanel/CoinflipContent split). The
// pure view is what the Vitest suite drives — no `vi.mock('wagmi')`
// gymnastics required. The connected wrapper is what casino pages mount.

'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useChainId, useSwitchChain } from 'wagmi';

import { monad } from '../../lib/wagmi';

export const MONAD_MAINNET_CHAIN_ID = 143;
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const ALLOWED_MONAD_CHAIN_IDS: readonly number[] = [
  MONAD_TESTNET_CHAIN_ID,
  MONAD_MAINNET_CHAIN_ID,
];

export type ChainGateViewProps = {
  /** Current chainId as reported by `wagmi.useChainId()`. */
  chainId: number | undefined;
  /** Chain to switch to when the CTA is clicked. Defaults to mainnet. */
  targetChainId?: number;
  /** Invoked when the user clicks the switch CTA. */
  onSwitch: (target: number) => void;
  /** Bet panel (or any subtree) gated behind a correct-chain check. */
  children: ReactNode;
  /** Stable testid prefix (defaults to `swo-casino-chain-gate`). */
  testId?: string;
  /** Override allowed chains for tests / non-Monad deployments. */
  allowedChainIds?: readonly number[];
};

export function ChainGateView(props: ChainGateViewProps) {
  const {
    chainId,
    targetChainId = MONAD_MAINNET_CHAIN_ID,
    onSwitch,
    children,
    testId = 'swo-casino-chain-gate',
    allowedChainIds = ALLOWED_MONAD_CHAIN_IDS,
  } = props;

  const onCorrectChain =
    typeof chainId === 'number' && allowedChainIds.includes(chainId);

  if (onCorrectChain) {
    return (
      <div
        data-testid={testId}
        data-on-correct-chain="true"
        data-chain-id={String(chainId)}
      >
        {children}
      </div>
    );
  }

  const label =
    targetChainId === MONAD_TESTNET_CHAIN_ID
      ? 'Switch to Monad testnet'
      : 'Switch to Monad mainnet';

  return (
    <div
      data-testid={testId}
      data-on-correct-chain="false"
      data-chain-id={chainId === undefined ? '' : String(chainId)}
      style={wrapperStyle}
    >
      <button
        type="button"
        onClick={() => onSwitch(targetChainId)}
        data-testid={`${testId}-cta`}
        data-target-chain-id={String(targetChainId)}
        style={ctaStyle}
        className="swo-casino-hit-44"
      >
        {label}
      </button>
      <fieldset
        disabled
        aria-disabled="true"
        data-testid={`${testId}-blocked`}
        style={fieldsetStyle}
      >
        {children}
      </fieldset>
    </div>
  );
}

export type ChainGateProps = {
  children: ReactNode;
  /** Override the chain we ask the wallet to switch to. */
  targetChainId?: number;
  testId?: string;
  allowedChainIds?: readonly number[];
};

// Connected wrapper: wires the pure view to wagmi's `useChainId` +
// `useSwitchChain`. `switchChain` calls EIP-3326 `wallet_switchEthereumChain`
// under the hood for injected providers — the Playwright spec at
// `tests/e2e/casino/chain-gate.spec.ts` proves the RPC fires.
export function ChainGate(props: ChainGateProps) {
  const {
    children,
    targetChainId = monad.id,
    testId,
    allowedChainIds,
  } = props;
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  return (
    <ChainGateView
      chainId={chainId}
      targetChainId={targetChainId}
      onSwitch={(target) => switchChain({ chainId: target })}
      testId={testId}
      allowedChainIds={allowedChainIds}
    >
      {children}
    </ChainGateView>
  );
}

const wrapperStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const ctaStyle: CSSProperties = {
  padding: '1rem',
  borderRadius: 12,
  border: 'none',
  background: 'var(--swo-casino-brand-gold, #ffd700)',
  color: 'var(--swo-casino-brand-ink, #0a0a1a)',
  fontWeight: 700,
  fontSize: '1.05rem',
  cursor: 'pointer',
  minHeight: 44,
};

const fieldsetStyle: CSSProperties = {
  border: 0,
  padding: 0,
  margin: 0,
  opacity: 0.5,
  pointerEvents: 'none',
};
