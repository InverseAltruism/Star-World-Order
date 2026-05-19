// @vitest-environment happy-dom
//
// DicePanel — synchronous-render contract for /casino/dice.
// Exercises the parts of the surface that don't need wagmi:
//   - renders without throwing
//   - rollUnder slider clamps to [2..98] and forwards via onRollUnderChange
//   - stake input forwards to onStakeChange
//   - quoted payout / multiplier / win-prob preview tracks rollUnder
//   - primary CTA dispatches onPlaceBet when enabled
//   - chain-gate banner + "Switch to Monad" CTA fire when chainId ∉ {143,10143}
//   - Won/Lost banner derives from outcome prop
//   - FairnessProof appears once serverReveal is non-null

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  DicePanel,
  multiplierFor,
  winProbabilityFor,
  quotedPayout,
  profitOnWin,
  clampRollUnder,
  MIN_ROLL_UNDER,
  MAX_ROLL_UNDER,
  type DicePanelProps,
} from '../DicePanel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DEPLOYED_ADDR = '0xAC023542A8168465EE4A1b3e8Ae0f58F36A6d84B' as const;

function baseProps(
  overrides: Partial<DicePanelProps> = {},
): DicePanelProps {
  return {
    rollUnder: 50,
    onRollUnderChange: vi.fn(),
    stake: '0.01',
    onStakeChange: vi.fn(),
    lastStake: undefined,
    isConnected: true,
    activeChainId: 10143,
    onSwitchChain: vi.fn(),
    switching: false,
    gravityDiceAddress: DEPLOYED_ADDR,
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

function render(props: Partial<DicePanelProps> = {}) {
  act(() => {
    root.render(<DicePanel {...baseProps(props)} />);
  });
}

function get(testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

describe('DicePanel — pure helpers', () => {
  it('multiplierFor returns 99 / (rollUnder - 1) inside the slider range', () => {
    expect(multiplierFor(50)).toBeCloseTo(99 / 49, 6);
    expect(multiplierFor(2)).toBeCloseTo(99, 6);
    expect(multiplierFor(98)).toBeCloseTo(99 / 97, 6);
  });

  it('multiplierFor returns 0 outside the slider range', () => {
    expect(multiplierFor(1)).toBe(0);
    expect(multiplierFor(99)).toBe(0);
    expect(multiplierFor(0)).toBe(0);
  });

  it('winProbabilityFor returns (rollUnder - 1) / 100', () => {
    expect(winProbabilityFor(50)).toBeCloseTo(0.49, 6);
    expect(winProbabilityFor(2)).toBeCloseTo(0.01, 6);
    expect(winProbabilityFor(98)).toBeCloseTo(0.97, 6);
  });

  it('quotedPayout computes (stake * 99) / (rollUnder - 1)', () => {
    expect(quotedPayout('0.01', 50)).toBeCloseTo((0.01 * 99) / 49, 8);
    expect(quotedPayout('1', 2)).toBeCloseTo(99, 6);
    expect(quotedPayout('0.5', 98)).toBeCloseTo((0.5 * 99) / 97, 8);
  });

  it('quotedPayout returns undefined for invalid input', () => {
    expect(quotedPayout('', 50)).toBeUndefined();
    expect(quotedPayout('0', 50)).toBeUndefined();
    expect(quotedPayout('-1', 50)).toBeUndefined();
    expect(quotedPayout('abc', 50)).toBeUndefined();
    expect(quotedPayout('0.01', 1)).toBeUndefined();
    expect(quotedPayout('0.01', 99)).toBeUndefined();
  });

  it('profitOnWin returns payout - stake with unit suffix', () => {
    const out = profitOnWin('0.01', 50);
    expect(out).toBeDefined();
    expect(out!.endsWith(' MON')).toBe(true);
    const value = parseFloat(out!.split(' ')[0]);
    expect(value).toBeCloseTo((0.01 * 99) / 49 - 0.01, 6);
  });

  it('clampRollUnder pins values into [2..98]', () => {
    expect(clampRollUnder(0)).toBe(MIN_ROLL_UNDER);
    expect(clampRollUnder(99)).toBe(MAX_ROLL_UNDER);
    expect(clampRollUnder(50.7)).toBe(51);
    expect(clampRollUnder(NaN)).toBe(MIN_ROLL_UNDER);
  });
});

describe('DicePanel — synchronous render contract', () => {
  it('renders the page shell with the multiplier and chain hint', () => {
    render();
    expect(get('dice-page')).not.toBeNull();
    expect(get('dice-side-selector')).not.toBeNull();
    expect(get('dice-bet-panel')).not.toBeNull();
    // Chain hint shows the multiplier for rollUnder=50.
    expect(get('dice-chain-hint')?.textContent).toMatch(/Monad/);
    expect(get('dice-chain-hint')?.textContent).toMatch(/×/);
  });

  it('renders the rollUnder slider with clamped bounds', () => {
    render({ rollUnder: 50 });
    const slider = get('dice-rollunder-slider') as HTMLInputElement;
    expect(slider).not.toBeNull();
    expect(slider.min).toBe(String(MIN_ROLL_UNDER));
    expect(slider.max).toBe(String(MAX_ROLL_UNDER));
    expect(slider.value).toBe('50');
  });

  it('rollUnder slider forwards values via onRollUnderChange', () => {
    const onRollUnderChange = vi.fn();
    render({ onRollUnderChange });
    const slider = get('dice-rollunder-slider') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    act(() => {
      setter?.call(slider, '75');
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onRollUnderChange).toHaveBeenCalledWith(75);
  });

  it('preview block reflects the current rollUnder value, win chance, multiplier', () => {
    render({ rollUnder: 50 });
    expect(get('dice-rollunder-value')?.textContent).toBe('50');
    expect(get('dice-winprob')?.textContent).toBe('49.00%');
    // multiplier preview matches multiplierFor(50)
    const txt = get('dice-multiplier-preview')?.textContent ?? '';
    const numeric = parseFloat(txt.replace('×', ''));
    expect(numeric).toBeCloseTo(99 / 49, 4);
  });

  it('preview block updates when rollUnder prop changes', () => {
    render({ rollUnder: 50 });
    expect(get('dice-winprob')?.textContent).toBe('49.00%');
    act(() => {
      root.render(<DicePanel {...baseProps({ rollUnder: 2 })} />);
    });
    expect(get('dice-rollunder-value')?.textContent).toBe('2');
    expect(get('dice-winprob')?.textContent).toBe('1.00%');
  });

  it('stake input forwards typed values to onStakeChange', () => {
    const onStakeChange = vi.fn();
    render({ onStakeChange });
    const input = get('dice-stake-input') as HTMLInputElement;
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

  it('profit-on-win row renders the client-quoted payout - stake', () => {
    render({ stake: '0.01', rollUnder: 50 });
    const row = get('dice-profit-on-win');
    expect(row).not.toBeNull();
    // Pull the numeric from the row body.
    const value = row?.textContent?.match(/([0-9.]+)\s+MON/)?.[1];
    expect(value).toBeDefined();
    expect(parseFloat(value!)).toBeCloseTo((0.01 * 99) / 49 - 0.01, 4);
  });

  it('primary CTA dispatches onPlaceBet when enabled', () => {
    vi.useFakeTimers();
    const onPlaceBet = vi.fn();
    render({ onPlaceBet });
    const cta = get('dice-primary-cta') as HTMLButtonElement;
    expect(cta.textContent).toMatch(/Roll for 0\.01 MON/);
    expect(cta.disabled).toBe(false);
    act(() => {
      cta.click();
    });
    expect(onPlaceBet).toHaveBeenCalledTimes(1);
  });

  it('chain-gate fires when chainId is outside {143, 10143}', () => {
    const onSwitchChain = vi.fn();
    render({ activeChainId: 1, onSwitchChain });
    const gate = get('dice-chain-gate');
    expect(gate).not.toBeNull();
    expect(gate?.textContent).toMatch(/Switch to Monad/);
    const cta = get('dice-primary-cta') as HTMLButtonElement;
    expect(cta.textContent).toMatch(/Switch to Monad/);
    act(() => {
      cta.click();
    });
    expect(onSwitchChain).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire the chain-gate before the wallet connects', () => {
    render({ isConnected: false, activeChainId: 1 });
    expect(get('dice-chain-gate')).toBeNull();
  });

  it('accepts both 143 (mainnet) and 10143 (testnet) as supported chains', () => {
    render({ activeChainId: 143 });
    expect(get('dice-chain-gate')).toBeNull();
    expect(
      (get('dice-primary-cta') as HTMLButtonElement).textContent,
    ).toMatch(/Roll for/);

    act(() => {
      root.render(<DicePanel {...baseProps({ activeChainId: 10143 })} />);
    });
    expect(get('dice-chain-gate')).toBeNull();
  });

  it('disables CTA + warns when the contract is undeployed for the active chain', () => {
    render({ gravityDiceAddress: undefined });
    const cta = get('dice-primary-cta') as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(cta.textContent).toMatch(/not deployed/i);
  });

  it('shows the "Confirm in wallet…" CTA while signing', () => {
    render({ signing: true });
    const cta = get('dice-primary-cta') as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(cta.textContent).toMatch(/Confirm in wallet/);
  });

  it('disables CTA with "Allowlist required" label when allowlistBlocked', () => {
    const onPlaceBet = vi.fn();
    render({ allowlistBlocked: true, onPlaceBet });
    const cta = get('dice-primary-cta') as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(cta.textContent).toMatch(/Allowlist required/);
    act(() => {
      cta.click();
    });
    expect(onPlaceBet).not.toHaveBeenCalled();
  });

  it('renders the Won banner when outcome is "won"', () => {
    render({ outcome: 'won', stake: '0.05', rollUnder: 50 });
    const won = get('dice-outcome-won');
    expect(won).not.toBeNull();
    expect(won?.textContent).toMatch(/Won/);
    expect(get('dice-outcome-lost')).toBeNull();
  });

  it('renders the Lost banner when outcome is "lost"', () => {
    render({ outcome: 'lost', stake: '0.05', rollUnder: 50 });
    const lost = get('dice-outcome-lost');
    expect(lost).not.toBeNull();
    expect(lost?.textContent).toMatch(/Lost/);
    expect(get('dice-outcome-won')).toBeNull();
  });

  it('surfaces bet + write errors verbatim', () => {
    render({
      betError: 'oops',
      writeError: new Error('chain barf'),
    });
    expect(get('dice-bet-error')?.textContent).toMatch(/oops/);
    expect(get('dice-write-error')?.textContent).toMatch(/chain barf/);
  });

  it('shows the tx-submitted receipt when txHash is present', () => {
    const txHash =
      '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789' as const;
    render({ txHash });
    const receipt = get('dice-tx-receipt');
    expect(receipt).not.toBeNull();
    expect(receipt?.textContent).toMatch(/Tx submitted/);
  });

  it('renders FairnessProof only once serverReveal is populated', () => {
    render({});
    expect(container.querySelector('[data-testid="swo-fairness-proof"]')).toBeNull();
    act(() => {
      root.render(
        <DicePanel
          {...baseProps({
            serverReveal:
              '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
            outcome: 'won',
          })}
        />,
      );
    });
    const proof = container.querySelector('[data-testid="swo-fairness-proof"]');
    expect(proof).not.toBeNull();
    expect(proof?.getAttribute('data-game')).toBe('dice');
  });
});
