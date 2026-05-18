// @vitest-environment happy-dom
//
// CoinflipPanel — synchronous-render contract for /casino/coinflip.
// Exercises the parts of the surface that don't need wagmi:
//   - renders without throwing (acceptance (a) + (b))
//   - side selector toggles via onSideChange
//   - stake input forwards to onStakeChange
//   - primary CTA dispatches onPlaceBet when enabled
//   - chain-gate banner + "Switch to Monad" CTA fire when chainId ∉ {143,10143}
//     (acceptance (d))
//   - Won/Lost banner derives from outcome prop
//   - FairnessProof appears once serverReveal is non-null

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { CoinflipPanel, type CoinflipPanelProps } from '../CoinflipPanel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DEPLOYED_ADDR = '0x064b8bfc03b23D2b525deD9d3969090347A21983' as const;

function baseProps(
  overrides: Partial<CoinflipPanelProps> = {},
): CoinflipPanelProps {
  return {
    side: 'heads',
    onSideChange: vi.fn(),
    stake: '0.01',
    onStakeChange: vi.fn(),
    lastStake: undefined,
    isConnected: true,
    activeChainId: 10143,
    onSwitchChain: vi.fn(),
    switching: false,
    cosmicFlipAddress: DEPLOYED_ADDR,
    signing: false,
    txHash: null,
    betError: null,
    writeError: null,
    onPlaceBet: vi.fn(),
    outcome: null,
    serverReveal: null,
    clientSeed: null,
    ...overrides,
  };
}

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
  vi.useRealTimers();
});

function render(props: Partial<CoinflipPanelProps> = {}) {
  act(() => {
    root.render(<CoinflipPanel {...baseProps(props)} />);
  });
}

function get(testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

describe('CoinflipPanel — synchronous contract', () => {
  it('renders the page shell with the multiplier and chain hint', () => {
    render();
    expect(get('coinflip-page')).not.toBeNull();
    expect(get('coinflip-side-selector')).not.toBeNull();
    expect(get('coinflip-chain-hint')?.textContent).toMatch(/1\.98×/);
    expect(get('coinflip-bet-panel')).not.toBeNull();
  });

  it('side selector toggles via onSideChange', () => {
    const onSideChange = vi.fn();
    render({ onSideChange });
    const tails = get('coinflip-side-tails') as HTMLButtonElement;
    act(() => {
      tails.click();
    });
    expect(onSideChange).toHaveBeenCalledWith('tails');
  });

  it('stake input forwards typed values to onStakeChange', () => {
    const onStakeChange = vi.fn();
    render({ onStakeChange });
    const input = get('coinflip-stake-input') as HTMLInputElement;
    // React's synthetic onChange listens on the native `input` event, but
    // happy-dom only fires React's wrapper when we set the value via the
    // descriptor and dispatch — set the prototype setter so the React
    // reconciler picks it up.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    act(() => {
      setter?.call(input, '0.05');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onStakeChange).toHaveBeenCalledWith('0.05');
  });

  it('primary CTA dispatches onPlaceBet when enabled', () => {
    vi.useFakeTimers();
    const onPlaceBet = vi.fn();
    render({ onPlaceBet });
    const cta = get('coinflip-primary-cta') as HTMLButtonElement;
    expect(cta.textContent).toMatch(/Flip for 0\.01 MON/);
    expect(cta.disabled).toBe(false);
    act(() => {
      cta.click();
    });
    expect(onPlaceBet).toHaveBeenCalledTimes(1);
  });

  it('chain-gate fires when chainId is outside {143, 10143}', () => {
    const onSwitchChain = vi.fn();
    render({ activeChainId: 1, onSwitchChain });
    const gate = get('coinflip-chain-gate');
    expect(gate).not.toBeNull();
    expect(gate?.textContent).toMatch(/Switch to Monad/);
    const cta = get('coinflip-primary-cta') as HTMLButtonElement;
    expect(cta.textContent).toMatch(/Switch to Monad/);
    act(() => {
      cta.click();
    });
    expect(onSwitchChain).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire the chain-gate before the wallet connects', () => {
    render({ isConnected: false, activeChainId: 1 });
    expect(get('coinflip-chain-gate')).toBeNull();
  });

  it('accepts both 143 (mainnet) and 10143 (testnet) as supported chains', () => {
    render({ activeChainId: 143 });
    expect(get('coinflip-chain-gate')).toBeNull();
    expect(
      (get('coinflip-primary-cta') as HTMLButtonElement).textContent,
    ).toMatch(/Flip for/);

    act(() => {
      root.render(<CoinflipPanel {...baseProps({ activeChainId: 10143 })} />);
    });
    expect(get('coinflip-chain-gate')).toBeNull();
  });

  it('disables CTA + warns when the contract is undeployed for the active chain', () => {
    render({ cosmicFlipAddress: undefined });
    const cta = get('coinflip-primary-cta') as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(cta.textContent).toMatch(/not deployed/i);
  });

  it('shows the "Confirm in wallet…" CTA while signing', () => {
    render({ signing: true });
    const cta = get('coinflip-primary-cta') as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(cta.textContent).toMatch(/Confirm in wallet/);
  });

  it('renders the Won banner when outcome is "won"', () => {
    render({ outcome: 'won', stake: '0.05', side: 'heads' });
    const won = get('coinflip-outcome-won');
    expect(won).not.toBeNull();
    expect(won?.textContent).toMatch(/Won/);
    expect(get('coinflip-outcome-lost')).toBeNull();
  });

  it('renders the Lost banner when outcome is "lost"', () => {
    render({ outcome: 'lost', stake: '0.05', side: 'tails' });
    const lost = get('coinflip-outcome-lost');
    expect(lost).not.toBeNull();
    expect(lost?.textContent).toMatch(/Lost/);
    expect(get('coinflip-outcome-won')).toBeNull();
  });

  it('surfaces bet + write errors verbatim', () => {
    render({
      betError: 'oops',
      writeError: new Error('chain barf'),
    });
    expect(get('coinflip-bet-error')?.textContent).toMatch(/oops/);
    expect(get('coinflip-write-error')?.textContent).toMatch(/chain barf/);
  });

  it('shows the tx-submitted receipt when txHash is present', () => {
    const txHash =
      '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789' as const;
    render({ txHash });
    const receipt = get('coinflip-tx-receipt');
    expect(receipt).not.toBeNull();
    expect(receipt?.textContent).toMatch(/Tx submitted/);
  });

  it('renders FairnessProof only once serverReveal is populated', () => {
    render({});
    expect(container.querySelector('[data-testid="swo-fairness-proof"]')).toBeNull();
    act(() => {
      root.render(
        <CoinflipPanel
          {...baseProps({
            serverReveal:
              '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
            outcome: 'won',
          })}
        />,
      );
    });
    expect(container.querySelector('[data-testid="swo-fairness-proof"]')).not.toBeNull();
  });
});
