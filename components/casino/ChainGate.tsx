// ChainGate — Monad chain enforcement gate for the SWO Cosmic Casino.
//
// Acceptance contract for [SWO_CASINO_UI_CHAIN_GATE]:
//   (a) Component exists at `components/casino/ChainGate.tsx`.
//   (b) When `useChainId()` returns a chain ∉ {143, 10143}, render a
//       "Switch to Monad mainnet" (or "…testnet" when targeting 10143)
//       CTA that, when clicked, invokes
//       `window.ethereum.request({ method: 'wallet_switchEthereumChain',
//                                  params: [{ chainId: <target-hex> }] })`.
//   (c) While on the wrong chain, children are wrapped in a
//       `<fieldset disabled aria-disabled>` so every bet button /
//       stake input rendered inside the gate is natively disabled and
//       advertises the gated state to assistive tech.
//   (d) On the correct chain, the gate is a passthrough — it adds no
//       wrapper element beyond a React fragment.
//
// Production callers mount `<ChainGate>` around their bet panel. The
// gate reads the current chain from `wagmi.useChainId()` and triggers
// the wallet's switch-chain RPC. The component also accepts injectable
// `chainIdOverride` + `switchChain` props purely so the unit tests can
// exercise the gate without a `WagmiProvider` or a real wallet.

'use client';

import { useCallback, type CSSProperties, type ReactNode } from 'react';
import { useChainId } from 'wagmi';

export const MONAD_MAINNET_CHAIN_ID = 143;
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const SUPPORTED_CHAIN_IDS: readonly number[] = [
  MONAD_MAINNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
];

export type ChainGateProps = {
  /**
   * Chain the user should be on. Drives the CTA label
   * ("Switch to Monad mainnet" vs. "…testnet") and the `chainId`
   * argument passed to `wallet_switchEthereumChain`. Defaults to
   * mainnet (143).
   */
  targetChainId?: number;
  /**
   * Test hook: when set, replaces the default `useChainId()` read.
   * Production callers should leave this undefined.
   */
  chainIdOverride?: number;
  /**
   * Test hook: when set, replaces the default
   * `window.ethereum.request({ method: 'wallet_switchEthereumChain' })`
   * call. Receives the target chain id as a hex string
   * (e.g. `0x8f` for 143) so the spy can assert the wire format.
   */
  switchChain?: (chainIdHex: string) => Promise<unknown>;
  children?: ReactNode;
};

type EthereumLike = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

async function defaultSwitchChain(chainIdHex: string): Promise<unknown> {
  if (typeof window === 'undefined') return;
  const eth = (window as unknown as { ethereum?: EthereumLike }).ethereum;
  if (!eth || typeof eth.request !== 'function') return;
  return eth.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: chainIdHex }],
  });
}

export function ChainGate({
  targetChainId = MONAD_MAINNET_CHAIN_ID,
  chainIdOverride,
  switchChain,
  children,
}: ChainGateProps) {
  const wagmiChainId = useChainId();
  const effectiveChainId = chainIdOverride ?? wagmiChainId;
  const onSupportedChain = SUPPORTED_CHAIN_IDS.includes(effectiveChainId);

  const targetHex = `0x${targetChainId.toString(16)}`;
  const label =
    targetChainId === MONAD_TESTNET_CHAIN_ID
      ? 'Switch to Monad testnet'
      : 'Switch to Monad mainnet';

  const handleSwitch = useCallback(async () => {
    const fn = switchChain ?? defaultSwitchChain;
    try {
      await fn(targetHex);
    } catch {
      // Wallet user-cancelled the switch (EIP-1193 4001) or the chain
      // is not yet added (4902). Either way leave the gate up so the
      // user can retry; the parent can subscribe to `useChainId` to
      // detect a successful switch.
    }
  }, [switchChain, targetHex]);

  if (onSupportedChain) {
    return <>{children}</>;
  }

  return (
    <div
      data-testid="swo-chain-gate"
      data-state="wrong-chain"
      data-current-chain={String(effectiveChainId)}
      data-target-chain={String(targetChainId)}
      role="region"
      aria-label="Wrong network"
      style={wrapperStyle}
    >
      <div data-testid="swo-chain-gate-banner" style={bannerStyle}>
        <span style={bannerTextStyle}>
          Wrong network — bet controls are disabled.
        </span>
        <button
          type="button"
          onClick={handleSwitch}
          data-testid="swo-chain-gate-switch"
          className="swo-casino-hit-44"
          style={switchButtonStyle}
        >
          {label}
        </button>
      </div>
      <fieldset
        disabled
        aria-disabled="true"
        data-testid="swo-chain-gate-fieldset"
        style={fieldsetStyle}
      >
        {children}
      </fieldset>
    </div>
  );
}

const wrapperStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const bannerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  padding: '0.75rem 1rem',
  borderRadius: 12,
  background: 'var(--swo-casino-warning-bg, rgba(255, 209, 102, 0.12))',
  border:
    '1px solid var(--swo-casino-warning-border, rgba(255, 209, 102, 0.45))',
  color: 'var(--swo-casino-fg, #e8e8e8)',
};

const bannerTextStyle: CSSProperties = {
  fontSize: '0.875rem',
  fontWeight: 600,
};

const switchButtonStyle: CSSProperties = {
  minHeight: 44,
  padding: '0.65rem 1rem',
  borderRadius: 10,
  border: 'none',
  background: 'var(--swo-casino-brand-gold, #ffd700)',
  color: 'var(--swo-casino-brand-ink, #0a0a1a)',
  fontWeight: 700,
  fontSize: '0.95rem',
  cursor: 'pointer',
};

const fieldsetStyle: CSSProperties = {
  border: 'none',
  padding: 0,
  margin: 0,
  minInlineSize: 0,
};
