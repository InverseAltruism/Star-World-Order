// ChainGate — wraps Casino bet UIs and forces the user onto a Monad chain
// before any bet button can fire. Carried forward from BunnyBagz' chain-
// gating pattern with a thin SWO surface that names the two supported
// Monad chains by their canonical IDs:
//
//   • Monad Mainnet → chainId 143
//   • Monad Testnet → chainId 10143
//
// Anatomy:
//   - When `wagmi.useChainId()` returns one of the supported chain IDs,
//     the gate is a pass-through: children render as-is.
//   - When the user is on a different chain (or no chain is reported),
//     children render with `pointer-events: none` and every descendant
//     button gets `disabled` + `aria-disabled="true"` applied so that
//     bet buttons cannot fire while we wait for the switch.
//   - A CTA banner reads "Switch to Monad mainnet" (or "…testnet" when
//     `NEXT_PUBLIC_MONAD_CHAIN_ID=10143`) and on click invokes
//     `window.ethereum.request({ method: 'wallet_switchEthereumChain' })`
//     with the target chain ID hex-encoded. We call the raw RPC method
//     by name so the Playwright spec can spy on it directly.
//
// Acceptance (SWO_CASINO_UI_CHAIN_GATE):
//   (a) Component exists at components/casino/ChainGate.tsx
//   (b) Vitest covers correct-chain (passthrough) + wrong-chain (CTA)
//   (c) Playwright spec confirms `wallet_switchEthereumChain` is called
//       exactly once per CTA click.

'use client';

import { useCallback, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useChainId } from 'wagmi';

export const MONAD_MAINNET_CHAIN_ID = 143;
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const SUPPORTED_MONAD_CHAIN_IDS: readonly number[] = [
  MONAD_MAINNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
];

export type ChainGateProps = {
  /** Bet UI to gate. Rendered as-is when the user is on a Monad chain. */
  children: ReactNode;
  /**
   * Target chain ID for the "Switch" CTA. Defaults to the value of
   * `NEXT_PUBLIC_MONAD_CHAIN_ID` (parsed at module load), falling back
   * to mainnet (143). Pass explicitly in tests to avoid env coupling.
   */
  targetChainId?: number;
  /**
   * Override the EIP-1193 request transport. Defaults to
   * `window.ethereum.request`. Tests inject a spy so we can prove the
   * raw RPC method name without spinning up a real wallet.
   */
  request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  /** Stable prefix for `data-testid`. Defaults to "swo-chain-gate". */
  testIdPrefix?: string;
};

function resolveDefaultTarget(): number {
  const raw = process.env.NEXT_PUBLIC_MONAD_CHAIN_ID;
  if (!raw) return MONAD_MAINNET_CHAIN_ID;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : MONAD_MAINNET_CHAIN_ID;
}

function chainLabel(chainId: number): string {
  if (chainId === MONAD_MAINNET_CHAIN_ID) return 'Monad mainnet';
  if (chainId === MONAD_TESTNET_CHAIN_ID) return 'Monad testnet';
  return `chain ${chainId}`;
}

function toHexChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

export function ChainGate(props: ChainGateProps) {
  const {
    children,
    targetChainId = resolveDefaultTarget(),
    request,
    testIdPrefix = 'swo-chain-gate',
  } = props;

  const currentChainId = useChainId();
  const isOnSupportedChain = useMemo(
    () => SUPPORTED_MONAD_CHAIN_IDS.includes(currentChainId),
    [currentChainId],
  );

  const handleSwitch = useCallback(() => {
    const transport =
      request ??
      ((typeof window !== 'undefined'
        ? (window as unknown as {
            ethereum?: {
              request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
            };
          }).ethereum?.request?.bind(
            (window as unknown as {
              ethereum?: {
                request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
              };
            }).ethereum,
          )
        : undefined));
    if (!transport) return;
    // Fire-and-forget — the wallet UI takes over from here. We swallow
    // rejections (user-cancel, unsupported, etc.) so an unhandled
    // promise rejection doesn't bubble into the React tree.
    void transport({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: toHexChainId(targetChainId) }],
    }).catch(() => {
      /* surfaced via the wallet UI; nothing to do here */
    });
  }, [request, targetChainId]);

  if (isOnSupportedChain) {
    return (
      <div data-testid={`${testIdPrefix}-passthrough`}>
        {children}
      </div>
    );
  }

  // Wrong chain — render the CTA above the bet UI and propagate
  // `disabled` + `aria-disabled` onto every descendant button so that
  // the visible-but-blocked surface still receives the correct ARIA
  // state for assistive tech. We can't reach into arbitrary children to
  // mutate props, so we lean on the disabled-children style + a
  // top-level form fieldset that disables every nested button.
  return (
    <section
      aria-label="Wrong network"
      data-testid={`${testIdPrefix}-wrong-chain`}
      style={wrapperStyle}
    >
      <div
        role="alert"
        data-testid={`${testIdPrefix}-banner`}
        style={bannerStyle}
      >
        <span style={bannerTextStyle}>
          Wrong network detected. Switch to {chainLabel(targetChainId)} to
          place bets.
        </span>
        <button
          type="button"
          data-testid={`${testIdPrefix}-switch-button`}
          onClick={handleSwitch}
          style={ctaStyle}
        >
          Switch to {chainLabel(targetChainId)}
        </button>
      </div>
      <fieldset
        disabled
        aria-disabled="true"
        data-testid={`${testIdPrefix}-disabled-children`}
        style={disabledFieldsetStyle}
      >
        {children}
      </fieldset>
    </section>
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
  border: '1px solid var(--swo-casino-warn-border, rgba(255,196,0,0.45))',
  background: 'var(--swo-casino-warn-bg, rgba(255,196,0,0.08))',
  color: 'var(--swo-casino-warn-fg, #ffdf80)',
};

const bannerTextStyle: CSSProperties = {
  fontSize: '0.85rem',
  lineHeight: 1.4,
};

const ctaStyle: CSSProperties = {
  // [SWO_CASINO_QA_MOBILE_TOUCH_TARGET_FLOOR] — keep parity with the
  // BetPanel primary CTA so the chain-switch button never dips below the
  // 44 px touch-target floor on mobile.
  minHeight: 44,
  padding: '0.6rem 1rem',
  borderRadius: 10,
  border: 'none',
  background: 'var(--swo-casino-brand-gold, #ffd700)',
  color: 'var(--swo-casino-brand-ink, #0a0a1a)',
  fontWeight: 700,
  fontSize: '0.9rem',
  cursor: 'pointer',
  alignSelf: 'flex-start',
};

const disabledFieldsetStyle: CSSProperties = {
  border: 'none',
  margin: 0,
  padding: 0,
  // Visually muted but still readable — gives users a preview of the bet
  // UI they'll get once they switch chains.
  opacity: 0.55,
  pointerEvents: 'none',
};
