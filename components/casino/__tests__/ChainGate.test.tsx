// @vitest-environment happy-dom
//
// ChainGate — acceptance contract for [SWO_CASINO_UI_CHAIN_GATE]:
//   (a) component exists and renders
//   (b) passthrough: when wagmi.useChainId() is in {10143, 143} and matches
//       the expected chain, children render unchanged with no CTA
//   (b) wrong-chain: when wagmi.useChainId() is not the expected chain, the
//       CTA renders ("Switch to Monad testnet" / "Switch to Monad mainnet")
//       and children are wrapped in a `<fieldset disabled aria-disabled>` so
//       every bet button inside reports `disabled` (the BB blocking contract)
//   (extra) clicking the CTA forwards to wagmi.useSwitchChain().switchChain
//       with the expected chainId — the Playwright spec proves this
//       triggers `wallet_switchEthereumChain` at the wallet boundary.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// wagmi's runtime hooks require a WagmiConfig provider — mock the module so
// ChainGate's default `useChainId` / `useSwitchChain` lookups become
// deterministic in unit tests. Individual tests reset the implementations
// with `mockReturnValue` / `mockImplementation`.
vi.mock('wagmi', () => ({
  useChainId: vi.fn(),
  useSwitchChain: vi.fn(),
}));

import { useChainId, useSwitchChain } from 'wagmi';
import {
  ChainGate,
  MONAD_MAINNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
} from '../ChainGate';

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockedUseChainId = vi.mocked(useChainId);
const mockedUseSwitchChain = vi.mocked(useSwitchChain);

let container: HTMLDivElement;
let root: Root;
let switchChain: ReturnType<typeof vi.fn>;

beforeEach(() => {
  switchChain = vi.fn();
  mockedUseChainId.mockReturnValue(MONAD_MAINNET_CHAIN_ID);
  mockedUseSwitchChain.mockReturnValue({
    switchChain,
  } as unknown as ReturnType<typeof useSwitchChain>);

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.clearAllMocks();
});

function renderGate(
  chainId: number,
  expectedChainId: 143 | 10143 = MONAD_MAINNET_CHAIN_ID,
) {
  mockedUseChainId.mockReturnValue(chainId);
  act(() => {
    root.render(
      <ChainGate expectedChainId={expectedChainId}>
        <button type="button" data-testid="child-bet-btn">
          Place Bet
        </button>
      </ChainGate>,
    );
  });
}

describe('<ChainGate> (acceptance: SWO_CASINO_UI_CHAIN_GATE)', () => {
  it('(a) component exists and renders', () => {
    renderGate(MONAD_MAINNET_CHAIN_ID);
    const passthrough = container.querySelector(
      '[data-testid="chain-gate-passthrough"]',
    );
    expect(passthrough).not.toBeNull();
  });

  it('(b) passthrough — chainId 143 with expected 143 renders children, no CTA', () => {
    renderGate(MONAD_MAINNET_CHAIN_ID, MONAD_MAINNET_CHAIN_ID);

    const childBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="child-bet-btn"]',
    );
    expect(childBtn).not.toBeNull();
    expect(childBtn!.disabled).toBe(false);

    expect(
      container.querySelector('[data-testid="chain-gate-cta"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="chain-gate-disabled-children"]'),
    ).toBeNull();
  });

  it('(b) passthrough — chainId 10143 with expected 10143 renders children, no CTA', () => {
    renderGate(MONAD_TESTNET_CHAIN_ID, MONAD_TESTNET_CHAIN_ID);

    expect(
      container.querySelector('[data-testid="child-bet-btn"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="chain-gate-cta"]'),
    ).toBeNull();
  });

  it('(b) wrong-chain — renders the CTA and disables child bet buttons', () => {
    // chainId 1 (Ethereum mainnet) is neither 143 nor 10143.
    renderGate(1, MONAD_MAINNET_CHAIN_ID);

    const cta = container.querySelector<HTMLButtonElement>(
      '[data-testid="chain-gate-cta"]',
    );
    expect(cta).not.toBeNull();
    expect(cta!.textContent).toBe('Switch to Monad mainnet');

    const wrapper = container.querySelector(
      '[data-testid="chain-gate-disabled-children"]',
    );
    expect(wrapper).not.toBeNull();
    expect(wrapper!.tagName).toBe('FIELDSET');
    expect(wrapper!.getAttribute('aria-disabled')).toBe('true');
    expect((wrapper as HTMLFieldSetElement).disabled).toBe(true);
    // The `disabled` attribute is present on the markup so any browser will
    // propagate it to descendant form controls (the BB "block bet buttons"
    // contract). happy-dom does not simulate that propagation, so the
    // attribute on the fieldset is the surface we assert here.
    expect(wrapper!.hasAttribute('disabled')).toBe(true);

    const childBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="child-bet-btn"]',
    );
    expect(childBtn).not.toBeNull();
    // Make sure the child is rendered *inside* the disabled fieldset, so
    // browser-level `:disabled` matching will catch it even though
    // happy-dom can't simulate the cascade.
    expect(wrapper!.contains(childBtn)).toBe(true);
  });

  it('(b) wrong-chain — testnet target flips the CTA label', () => {
    // chainId 143 (mainnet) when surface expects 10143 (testnet) → wrong chain.
    renderGate(MONAD_MAINNET_CHAIN_ID, MONAD_TESTNET_CHAIN_ID);

    const cta = container.querySelector<HTMLButtonElement>(
      '[data-testid="chain-gate-cta"]',
    );
    expect(cta).not.toBeNull();
    expect(cta!.textContent).toBe('Switch to Monad testnet');
  });

  it('clicking the CTA calls useSwitchChain().switchChain with the expected chainId', () => {
    renderGate(1, MONAD_TESTNET_CHAIN_ID);

    const cta = container.querySelector<HTMLButtonElement>(
      '[data-testid="chain-gate-cta"]',
    );
    expect(cta).not.toBeNull();

    act(() => {
      cta!.click();
    });

    expect(switchChain).toHaveBeenCalledTimes(1);
    expect(switchChain).toHaveBeenCalledWith({
      chainId: MONAD_TESTNET_CHAIN_ID,
    });
  });

  it('honours the `switchChain` prop override (bypasses wagmi entirely)', () => {
    mockedUseChainId.mockReturnValue(1);
    const customSwitch = vi.fn();
    act(() => {
      root.render(
        <ChainGate
          expectedChainId={MONAD_MAINNET_CHAIN_ID}
          switchChain={customSwitch}
        >
          <button type="button">Place Bet</button>
        </ChainGate>,
      );
    });

    const cta = container.querySelector<HTMLButtonElement>(
      '[data-testid="chain-gate-cta"]',
    );
    act(() => {
      cta!.click();
    });
    expect(customSwitch).toHaveBeenCalledWith({
      chainId: MONAD_MAINNET_CHAIN_ID,
    });
    expect(switchChain).not.toHaveBeenCalled();
  });
});
