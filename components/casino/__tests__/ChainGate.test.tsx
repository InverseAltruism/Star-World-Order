// @vitest-environment happy-dom
//
// ChainGate — proves the SWO_CASINO_UI_CHAIN_GATE acceptance contract:
//
//   (a) Component renders under components/casino/.
//   (b1) Correct-chain pass-through — when `useChainId()` returns 143 or
//        10143, ChainGate renders its children untouched and exposes no
//        switch CTA.
//   (b2) Wrong-chain CTA — when `useChainId()` returns any other ID,
//        ChainGate renders the "Switch to Monad …" CTA and propagates
//        `disabled` + `aria-disabled` onto every descendant button via
//        the wrapping fieldset.
//   (c) Switch CTA invokes the EIP-1193 `wallet_switchEthereumChain`
//       method with the correct hex-encoded chain ID.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Mock wagmi.useChainId so we can swap chain IDs per-test without
// touching a real wagmi provider.
let mockedChainId = 143;
vi.mock('wagmi', () => ({
  useChainId: () => mockedChainId,
}));

import {
  ChainGate,
  MONAD_MAINNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
  SUPPORTED_MONAD_CHAIN_IDS,
} from '../ChainGate';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockedChainId = MONAD_MAINNET_CHAIN_ID;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function renderGate(
  overrides: {
    chainId?: number;
    targetChainId?: number;
    request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  } = {},
) {
  mockedChainId = overrides.chainId ?? MONAD_MAINNET_CHAIN_ID;
  act(() => {
    root.render(
      <ChainGate
        targetChainId={overrides.targetChainId}
        request={overrides.request}
      >
        <button type="button" data-testid="child-bet-btn">
          Bet 0.01 MON
        </button>
      </ChainGate>,
    );
  });
}

describe('<ChainGate> (acceptance: SWO_CASINO_UI_CHAIN_GATE)', () => {
  it('(a) exports the supported Monad chain IDs', () => {
    expect(SUPPORTED_MONAD_CHAIN_IDS).toEqual([143, 10143]);
    expect(MONAD_MAINNET_CHAIN_ID).toBe(143);
    expect(MONAD_TESTNET_CHAIN_ID).toBe(10143);
  });

  // (b1) Correct-chain pass-through. Both Monad chain IDs render the
  // children untouched and never expose the wrong-chain CTA. We assert
  // both the pass-through wrapper presence and the absence of the CTA
  // section so a future regression that always wraps in the fieldset
  // would trip this test.
  it('(b1) renders children as-is when on Monad mainnet (143)', () => {
    renderGate({ chainId: MONAD_MAINNET_CHAIN_ID });
    expect(
      container.querySelector('[data-testid="swo-chain-gate-passthrough"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="swo-chain-gate-wrong-chain"]'),
    ).toBeNull();
    const childBtn = container.querySelector(
      '[data-testid="child-bet-btn"]',
    ) as HTMLButtonElement | null;
    expect(childBtn).not.toBeNull();
    // Children must not be force-disabled in the pass-through state.
    expect(childBtn!.disabled).toBe(false);
    expect(childBtn!.getAttribute('aria-disabled')).toBeNull();
  });

  it('(b1) renders children as-is when on Monad testnet (10143)', () => {
    renderGate({ chainId: MONAD_TESTNET_CHAIN_ID });
    expect(
      container.querySelector('[data-testid="swo-chain-gate-passthrough"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="swo-chain-gate-wrong-chain"]'),
    ).toBeNull();
  });

  // (b2) Wrong-chain CTA. Any chain ID outside {143, 10143} renders the
  // "Switch to Monad …" CTA. The CTA label is driven by `targetChainId`
  // so "testnet" and "mainnet" copies both work without an env flip.
  it('(b2) renders the "Switch to Monad mainnet" CTA on wrong chain (target=mainnet)', () => {
    renderGate({ chainId: 1, targetChainId: MONAD_MAINNET_CHAIN_ID });
    const wrong = container.querySelector(
      '[data-testid="swo-chain-gate-wrong-chain"]',
    );
    expect(wrong).not.toBeNull();
    const cta = container.querySelector(
      '[data-testid="swo-chain-gate-switch-button"]',
    ) as HTMLButtonElement | null;
    expect(cta).not.toBeNull();
    expect(cta!.textContent).toBe('Switch to Monad mainnet');
  });

  it('(b2) renders the "Switch to Monad testnet" CTA on wrong chain (target=testnet)', () => {
    renderGate({ chainId: 1, targetChainId: MONAD_TESTNET_CHAIN_ID });
    const cta = container.querySelector(
      '[data-testid="swo-chain-gate-switch-button"]',
    ) as HTMLButtonElement | null;
    expect(cta).not.toBeNull();
    expect(cta!.textContent).toBe('Switch to Monad testnet');
  });

  // The wrapping fieldset disables every descendant button — that's the
  // browser-native semantics behind `<fieldset disabled>`, which both
  // sets `disabled` on form controls AND surfaces them as
  // `aria-disabled` via the form-control disabled state. We assert the
  // visible artefact (the child bet button reports disabled=true) so a
  // future regression that drops the fieldset wrap trips immediately.
  it('(b2) blocks bet buttons via disabled + aria-disabled on the wrapping fieldset', () => {
    renderGate({ chainId: 1, targetChainId: MONAD_MAINNET_CHAIN_ID });
    const fieldset = container.querySelector(
      '[data-testid="swo-chain-gate-disabled-children"]',
    ) as HTMLFieldSetElement | null;
    expect(fieldset).not.toBeNull();
    expect(fieldset!.disabled).toBe(true);
    expect(fieldset!.getAttribute('aria-disabled')).toBe('true');

    const childBtn = container.querySelector(
      '[data-testid="child-bet-btn"]',
    ) as HTMLButtonElement | null;
    expect(childBtn).not.toBeNull();
    // The child bet button is nested inside the disabled fieldset.
    // happy-dom doesn't fully model the form-owner disabled propagation
    // (real browsers report `button:disabled` true under a disabled
    // fieldset ancestor); we assert the structural contract — there is
    // a disabled fieldset ancestor — which is the visible artefact a
    // future regression that drops the fieldset wrap would break. The
    // Playwright spec (tests/e2e/casino/chain-gate.spec.ts) re-asserts
    // the same shape under a real browser engine.
    expect(childBtn!.closest('fieldset[disabled]')).toBe(fieldset);
  });

  // (c) The switch CTA fires `wallet_switchEthereumChain` exactly once
  // per click with the hex-encoded target chain ID. We inject the
  // request transport via the `request` prop so the assertion does not
  // depend on a window.ethereum shim.
  it('(c) clicking Switch fires wallet_switchEthereumChain with the hex chain ID', () => {
    const request = vi.fn().mockResolvedValue(null);
    renderGate({
      chainId: 1,
      targetChainId: MONAD_TESTNET_CHAIN_ID,
      request,
    });
    const cta = container.querySelector(
      '[data-testid="swo-chain-gate-switch-button"]',
    ) as HTMLButtonElement;
    act(() => {
      cta.click();
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      method: 'wallet_switchEthereumChain',
      // 10143 -> 0x279f (testnet)
      params: [{ chainId: '0x279f' }],
    });
  });

  it('(c) hex-encodes mainnet chain ID 143 as 0x8f', () => {
    const request = vi.fn().mockResolvedValue(null);
    renderGate({
      chainId: 1,
      targetChainId: MONAD_MAINNET_CHAIN_ID,
      request,
    });
    const cta = container.querySelector(
      '[data-testid="swo-chain-gate-switch-button"]',
    ) as HTMLButtonElement;
    act(() => {
      cta.click();
    });
    expect(request).toHaveBeenCalledWith({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x8f' }],
    });
  });
});
