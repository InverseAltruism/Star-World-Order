// @vitest-environment happy-dom
//
// ChainGate — acceptance contract for [SWO_CASINO_UI_CHAIN_GATE]:
//   (a) component exists & renders
//   (b) on a supported Monad chain (143 or 10143) the gate is a
//       passthrough — children render with no wrapper and bet buttons
//       stay enabled
//   (c) on an unsupported chain the gate renders the "Switch to Monad
//       mainnet" CTA (or "…testnet" when targetChainId=10143), wraps
//       children in a disabled fieldset (aria-disabled="true"), and
//       native-disables any nested <button> elements
//   (d) clicking the CTA invokes the injected `switchChain` exactly
//       once with the target chain id as a hex string
//
// The component reads the current chain from `wagmi.useChainId()`. Tests
// stub the hook via `vi.mock('wagmi')` so the component can be exercised
// without a `WagmiProvider`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('wagmi', () => ({
  useChainId: vi.fn<() => number>(() => 1),
}));

import { useChainId } from 'wagmi';
import {
  ChainGate,
  MONAD_MAINNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
} from '../ChainGate';

// React 19's act(...) checks for this flag and warns otherwise.
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockedUseChainId = useChainId as unknown as ReturnType<typeof vi.fn>;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockedUseChainId.mockReset();
  mockedUseChainId.mockReturnValue(1);
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

function renderGate(node: React.ReactElement) {
  act(() => {
    root.render(node);
  });
}

function findGate(): HTMLElement | null {
  return container.querySelector('[data-testid="swo-chain-gate"]');
}

function findSwitchButton(): HTMLButtonElement | null {
  return container.querySelector('[data-testid="swo-chain-gate-switch"]');
}

describe('ChainGate — passthrough on supported chains', () => {
  it('renders children unwrapped on Monad mainnet (143)', () => {
    mockedUseChainId.mockReturnValue(MONAD_MAINNET_CHAIN_ID);
    renderGate(
      <ChainGate>
        <button type="button" data-testid="bet-cta">
          Bet 0.01 MON
        </button>
      </ChainGate>,
    );
    expect(findGate()).toBeNull();
    const bet = container.querySelector(
      '[data-testid="bet-cta"]',
    ) as HTMLButtonElement;
    expect(bet).toBeTruthy();
    expect(bet.disabled).toBe(false);
  });

  it('renders children unwrapped on Monad testnet (10143)', () => {
    mockedUseChainId.mockReturnValue(MONAD_TESTNET_CHAIN_ID);
    renderGate(
      <ChainGate>
        <button type="button" data-testid="bet-cta">
          Bet 0.01 MON
        </button>
      </ChainGate>,
    );
    expect(findGate()).toBeNull();
    expect(
      (container.querySelector('[data-testid="bet-cta"]') as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('chainIdOverride beats the useChainId() read (testability)', () => {
    mockedUseChainId.mockReturnValue(1);
    renderGate(
      <ChainGate chainIdOverride={MONAD_MAINNET_CHAIN_ID}>
        <button type="button" data-testid="bet-cta">
          Bet
        </button>
      </ChainGate>,
    );
    expect(findGate()).toBeNull();
  });
});

describe('ChainGate — wrong-chain CTA + disabled fieldset', () => {
  it('renders the gate region with role+aria-label when off-chain', () => {
    mockedUseChainId.mockReturnValue(1);
    renderGate(
      <ChainGate>
        <button type="button" data-testid="bet-cta">
          Bet
        </button>
      </ChainGate>,
    );
    const gate = findGate();
    expect(gate).toBeTruthy();
    expect(gate?.getAttribute('role')).toBe('region');
    expect(gate?.getAttribute('aria-label')).toBe('Wrong network');
    expect(gate?.getAttribute('data-state')).toBe('wrong-chain');
    expect(gate?.getAttribute('data-current-chain')).toBe('1');
  });

  it('defaults the CTA label to "Switch to Monad mainnet"', () => {
    mockedUseChainId.mockReturnValue(1);
    renderGate(
      <ChainGate>
        <span />
      </ChainGate>,
    );
    expect(findSwitchButton()?.textContent).toBe('Switch to Monad mainnet');
  });

  it('labels the CTA "Switch to Monad testnet" when targetChainId=10143', () => {
    mockedUseChainId.mockReturnValue(1);
    renderGate(
      <ChainGate targetChainId={MONAD_TESTNET_CHAIN_ID}>
        <span />
      </ChainGate>,
    );
    expect(findSwitchButton()?.textContent).toBe('Switch to Monad testnet');
  });

  it('blocks bet controls via fieldset[disabled][aria-disabled] wrap', () => {
    mockedUseChainId.mockReturnValue(1);
    renderGate(
      <ChainGate>
        <button type="button" data-testid="bet-cta">
          Bet
        </button>
        <input type="number" data-testid="stake-input" defaultValue="0.01" />
      </ChainGate>,
    );
    const fieldset = container.querySelector(
      '[data-testid="swo-chain-gate-fieldset"]',
    ) as HTMLFieldSetElement;
    expect(fieldset).toBeTruthy();
    // The contract: the wrapping fieldset carries BOTH the native
    // `disabled` attribute (which the HTML spec uses to cascade the
    // form-disabled state to every nested form control) and the
    // `aria-disabled="true"` attribute that advertises the gated state
    // to assistive tech.
    expect(fieldset.hasAttribute('disabled')).toBe(true);
    expect(fieldset.getAttribute('aria-disabled')).toBe('true');
    // The bet controls are still part of the DOM (so the user can see
    // what is being gated) but they live inside the disabled fieldset.
    const bet = container.querySelector('[data-testid="bet-cta"]');
    expect(bet).toBeTruthy();
    expect(fieldset.contains(bet)).toBe(true);
    const stake = container.querySelector('[data-testid="stake-input"]');
    expect(stake).toBeTruthy();
    expect(fieldset.contains(stake)).toBe(true);
  });

  it('invokes switchChain exactly once with the target chain hex on click', async () => {
    mockedUseChainId.mockReturnValue(1);
    const switchChain = vi
      .fn<(chainIdHex: string) => Promise<unknown>>()
      .mockResolvedValue(undefined);
    renderGate(
      <ChainGate switchChain={switchChain}>
        <span />
      </ChainGate>,
    );
    const btn = findSwitchButton();
    expect(btn).toBeTruthy();
    await act(async () => {
      btn?.click();
    });
    expect(switchChain).toHaveBeenCalledTimes(1);
    expect(switchChain).toHaveBeenCalledWith(
      `0x${MONAD_MAINNET_CHAIN_ID.toString(16)}`,
    );
  });

  it('passes the testnet hex when targetChainId=10143', async () => {
    mockedUseChainId.mockReturnValue(1);
    const switchChain = vi
      .fn<(chainIdHex: string) => Promise<unknown>>()
      .mockResolvedValue(undefined);
    renderGate(
      <ChainGate
        targetChainId={MONAD_TESTNET_CHAIN_ID}
        switchChain={switchChain}
      >
        <span />
      </ChainGate>,
    );
    await act(async () => {
      findSwitchButton()?.click();
    });
    expect(switchChain).toHaveBeenCalledWith(
      `0x${MONAD_TESTNET_CHAIN_ID.toString(16)}`,
    );
  });

  it('swallows switchChain rejections (user-cancelled) without throwing', async () => {
    mockedUseChainId.mockReturnValue(1);
    const switchChain = vi
      .fn<(chainIdHex: string) => Promise<unknown>>()
      .mockRejectedValue(
        Object.assign(new Error('User rejected the request.'), {
          code: 4001,
        }),
      );
    renderGate(
      <ChainGate switchChain={switchChain}>
        <span />
      </ChainGate>,
    );
    await act(async () => {
      findSwitchButton()?.click();
      // Let the rejected promise settle inside handleSwitch.
      await Promise.resolve();
    });
    expect(switchChain).toHaveBeenCalledTimes(1);
    // Gate remains up so the user can retry.
    expect(findGate()).toBeTruthy();
  });
});
