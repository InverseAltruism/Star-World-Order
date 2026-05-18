// @vitest-environment happy-dom
//
// ChainGate — acceptance contract for [SWO_CASINO_UI_CHAIN_GATE]:
//   (a) component exists & renders
//   (b) when current chainId ∈ {10143, 143} the gate is a pure pass-through
//       (children render, no CTA, no disabled fieldset)
//   (c) when current chainId ∉ allowed set the gate renders a
//       "Switch to Monad <testnet|mainnet>" CTA and wraps children in a
//       fieldset[disabled][aria-disabled="true"] so nested bet buttons
//       inherit the disabled state
//   (d) clicking the CTA invokes onSwitch with the target chainId — this
//       is what the wagmi-connected `ChainGate` wires to `switchChain`,
//       which dispatches `wallet_switchEthereumChain` for injected wallets
//
// We drive the pure `ChainGateView` here so the suite does not need to
// mock `wagmi`. The Playwright spec at
// `tests/e2e/casino/chain-gate.spec.ts` is the browser-level proof that
// the `wallet_switchEthereumChain` RPC actually fires once on click.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  ALLOWED_MONAD_CHAIN_IDS,
  ChainGateView,
  MONAD_MAINNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
} from '../ChainGate';

// React 19's act(...) checks for this flag and warns otherwise.
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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

function render(
  props: Partial<React.ComponentProps<typeof ChainGateView>> = {},
) {
  const onSwitch = props.onSwitch ?? vi.fn();
  act(() => {
    root.render(
      <ChainGateView
        chainId={MONAD_MAINNET_CHAIN_ID}
        onSwitch={onSwitch}
        {...props}
      >
        {props.children ?? (
          <button type="button" data-testid="child-bet-button">
            Place bet
          </button>
        )}
      </ChainGateView>,
    );
  });
}

function q<T extends Element = Element>(testId: string): T | null {
  return container.querySelector<T>(`[data-testid="${testId}"]`);
}

describe('ChainGateView — sentinels', () => {
  it('exposes the allowed Monad chain ids', () => {
    expect(MONAD_MAINNET_CHAIN_ID).toBe(143);
    expect(MONAD_TESTNET_CHAIN_ID).toBe(10143);
    expect(new Set(ALLOWED_MONAD_CHAIN_IDS)).toEqual(new Set([143, 10143]));
  });
});

describe('ChainGateView — correct-chain passthrough', () => {
  it('renders children without a CTA on Monad mainnet (143)', () => {
    render({ chainId: MONAD_MAINNET_CHAIN_ID });

    const gate = q('swo-casino-chain-gate');
    expect(gate).toBeTruthy();
    expect(gate?.getAttribute('data-on-correct-chain')).toBe('true');

    expect(q('child-bet-button')).toBeTruthy();
    expect(q('swo-casino-chain-gate-cta')).toBeNull();
    expect(q('swo-casino-chain-gate-blocked')).toBeNull();
  });

  it('renders children without a CTA on Monad testnet (10143)', () => {
    render({ chainId: MONAD_TESTNET_CHAIN_ID });

    const gate = q('swo-casino-chain-gate');
    expect(gate?.getAttribute('data-on-correct-chain')).toBe('true');
    expect(gate?.getAttribute('data-chain-id')).toBe('10143');
    expect(q('swo-casino-chain-gate-cta')).toBeNull();
  });
});

describe('ChainGateView — wrong-chain CTA', () => {
  it('renders "Switch to Monad mainnet" when target is mainnet', () => {
    render({ chainId: 1, targetChainId: MONAD_MAINNET_CHAIN_ID });

    const gate = q('swo-casino-chain-gate');
    expect(gate?.getAttribute('data-on-correct-chain')).toBe('false');

    const cta = q<HTMLButtonElement>('swo-casino-chain-gate-cta');
    expect(cta).toBeTruthy();
    expect(cta?.textContent).toContain('Switch to Monad mainnet');
    expect(cta?.getAttribute('data-target-chain-id')).toBe('143');
  });

  it('renders "Switch to Monad testnet" when target is testnet', () => {
    render({ chainId: 1, targetChainId: MONAD_TESTNET_CHAIN_ID });

    const cta = q<HTMLButtonElement>('swo-casino-chain-gate-cta');
    expect(cta?.textContent).toContain('Switch to Monad testnet');
    expect(cta?.getAttribute('data-target-chain-id')).toBe('10143');
  });

  it('wraps children in fieldset[disabled][aria-disabled=true] so bet buttons inherit disabled', () => {
    render({ chainId: 1 });

    const blocked = q<HTMLFieldSetElement>('swo-casino-chain-gate-blocked');
    expect(blocked).toBeTruthy();
    expect(blocked?.tagName).toBe('FIELDSET');
    expect(blocked?.hasAttribute('disabled')).toBe(true);
    expect(blocked?.getAttribute('aria-disabled')).toBe('true');

    // The bet button still renders inside the fieldset — its disabled
    // state is inherited from the parent fieldset[disabled] at the
    // platform level (HTML5: a disabled fieldset blocks its descendants
    // from receiving events and from form submission). happy-dom does not
    // mirror that inheritance into the .disabled IDL property, so we
    // assert structural containment here and verify the live browser
    // behaviour in `tests/e2e/casino/chain-gate.spec.ts`.
    const child = q<HTMLButtonElement>('child-bet-button');
    expect(child).toBeTruthy();
    expect(blocked?.contains(child!)).toBe(true);
  });

  it('treats an undefined chainId (wallet not connected) as wrong-chain', () => {
    render({ chainId: undefined });

    const gate = q('swo-casino-chain-gate');
    expect(gate?.getAttribute('data-on-correct-chain')).toBe('false');
    expect(q('swo-casino-chain-gate-cta')).toBeTruthy();
    expect(q('swo-casino-chain-gate-blocked')).toBeTruthy();
  });
});

describe('ChainGateView — onSwitch dispatch', () => {
  it('invokes onSwitch exactly once with the targetChainId on CTA click', () => {
    const onSwitch = vi.fn();
    render({
      chainId: 1,
      targetChainId: MONAD_TESTNET_CHAIN_ID,
      onSwitch,
    });

    const cta = q<HTMLButtonElement>('swo-casino-chain-gate-cta');
    expect(cta).toBeTruthy();

    act(() => {
      cta!.click();
    });

    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(onSwitch).toHaveBeenCalledWith(MONAD_TESTNET_CHAIN_ID);
  });

  it('does not invoke onSwitch when on the correct chain (CTA is not rendered)', () => {
    const onSwitch = vi.fn();
    render({ chainId: MONAD_MAINNET_CHAIN_ID, onSwitch });

    expect(q('swo-casino-chain-gate-cta')).toBeNull();
    expect(onSwitch).not.toHaveBeenCalled();
  });
});
