// @vitest-environment happy-dom
//
// HiLoPanel — synchronous-render contract for /casino/constellation-climb.
//
// Acceptance for [SWO_CASINO_ALLOWLIST_UI_GATE_HILO]: the three primary
// lifecycle CTAs (openSession / step / cashOut) must all be gated by the
// same 4 allowlist states the Coinflip + Dice surfaces cover:
//
//   (i)   No allowlist (allowlistBlocked=false)              → CTAs active
//   (ii)  Disabled (allowlistBlocked=false)                  → CTAs active
//   (iii) Enabled + denied (allowlistBlocked=true)           → CTAs blocked
//   (iv)  Enabled + allowed (allowlistBlocked=false)         → CTAs active
//
// Cases (i), (ii), (iv) collapse into the same UI state from the panel's
// perspective — the `useAllowlistGate` hook owns the on-chain branching
// and `useAllowlistGate.test.tsx` exercises that branching. The panel
// only needs to react to the `allowlistBlocked` boolean prop.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  HiLoPanel,
  fmtMultiplier,
  type HiLoPanelProps,
} from '../HiLoPanel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DEPLOYED_ADDR = '0xAC023542A8168465EE4A1b3e8Ae0f58F36A6d84B' as const;
const WAD = 1_000_000_000_000_000_000n;

function baseProps(overrides: Partial<HiLoPanelProps> = {}): HiLoPanelProps {
  return {
    stake: '0.01',
    onStakeChange: vi.fn(),
    direction: 'higher',
    onDirectionChange: vi.fn(),
    lastStake: undefined,
    isConnected: true,
    activeChainId: 10143,
    onSwitchChain: vi.fn(),
    switching: false,
    constellationClimbAddress: DEPLOYED_ADDR,
    sessionStatus: 'idle',
    currentCard: null,
    multiplierWad: WAD,
    signing: false,
    txHash: null,
    betError: null,
    writeError: null,
    onOpenSession: vi.fn(),
    onStep: vi.fn(),
    onCashOut: vi.fn(),
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

function render(props: Partial<HiLoPanelProps> = {}) {
  act(() => {
    root.render(<HiLoPanel {...baseProps(props)} />);
  });
}

function get(testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

describe('HiLoPanel — pure helpers', () => {
  it('fmtMultiplier formats WAD-scaled values', () => {
    expect(fmtMultiplier(WAD)).toBe('1×');
    expect(fmtMultiplier(WAD * 2n)).toBe('2×');
    // 1.99e18 → "1.99×"
    expect(fmtMultiplier(1_990_000_000_000_000_000n)).toBe('1.99×');
  });
});

describe('HiLoPanel — synchronous render contract', () => {
  it('renders the page shell with the multiplier and chain hint', () => {
    render();
    expect(get('hilo-page')).not.toBeNull();
    expect(get('hilo-direction-selector')).not.toBeNull();
    expect(get('hilo-bet-panel')).not.toBeNull();
    expect(get('hilo-chain-hint')?.textContent).toMatch(/Monad/);
    expect(get('hilo-chain-hint')?.textContent).toMatch(/×/);
  });

  it('current-card row shows em-dash when no session is open', () => {
    render({ sessionStatus: 'idle', currentCard: null });
    expect(get('hilo-current-card')?.textContent).toBe('—');
  });

  it('current-card row shows the card value once a session is open', () => {
    render({ sessionStatus: 'open', currentCard: 7 });
    expect(get('hilo-current-card')?.textContent).toBe('7');
  });

  it('direction toggle forwards via onDirectionChange', () => {
    const onDirectionChange = vi.fn();
    render({ onDirectionChange });
    const lower = get('hilo-direction-lower') as HTMLButtonElement;
    expect(lower).not.toBeNull();
    act(() => {
      lower.click();
    });
    expect(onDirectionChange).toHaveBeenCalledWith('lower');
  });

  it('chain-gate fires when chainId is outside {143, 10143}', () => {
    const onSwitchChain = vi.fn();
    render({ activeChainId: 1, onSwitchChain });
    expect(get('hilo-chain-gate')).not.toBeNull();
    const cta = get('hilo-primary-cta') as HTMLButtonElement;
    expect(cta.textContent).toMatch(/Switch to Monad/);
    act(() => {
      cta.click();
    });
    expect(onSwitchChain).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire the chain-gate before the wallet connects', () => {
    render({ isConnected: false, activeChainId: 1 });
    expect(get('hilo-chain-gate')).toBeNull();
  });

  it('accepts both 143 (mainnet) and 10143 (testnet) as supported chains', () => {
    render({ activeChainId: 143 });
    expect(get('hilo-chain-gate')).toBeNull();
    act(() => {
      root.render(<HiLoPanel {...baseProps({ activeChainId: 10143 })} />);
    });
    expect(get('hilo-chain-gate')).toBeNull();
  });

  it('disables CTA + warns when the contract is undeployed for the active chain', () => {
    render({ constellationClimbAddress: undefined });
    const cta = get('hilo-primary-cta') as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(cta.textContent).toMatch(/not deployed/i);
  });

  it('shows the "Confirm in wallet…" CTA while signing', () => {
    render({ signing: true });
    const cta = get('hilo-primary-cta') as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(cta.textContent).toMatch(/Confirm in wallet/);
  });

  it('primary CTA in idle state dispatches onOpenSession when clicked', () => {
    vi.useFakeTimers();
    const onOpenSession = vi.fn();
    render({ sessionStatus: 'idle', onOpenSession });
    const cta = get('hilo-primary-cta') as HTMLButtonElement;
    expect(cta.textContent).toMatch(/Open session for 0\.01 MON/);
    expect(cta.disabled).toBe(false);
    act(() => {
      cta.click();
    });
    expect(onOpenSession).toHaveBeenCalledTimes(1);
  });

  it('primary CTA in open state dispatches onStep when clicked', () => {
    vi.useFakeTimers();
    const onStep = vi.fn();
    render({ sessionStatus: 'open', currentCard: 7, onStep });
    const cta = get('hilo-primary-cta') as HTMLButtonElement;
    expect(cta.textContent).toMatch(/Step Higher/);
    expect(cta.disabled).toBe(false);
    act(() => {
      cta.click();
    });
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it('cashOut button appears in open state and dispatches onCashOut', () => {
    const onCashOut = vi.fn();
    render({ sessionStatus: 'open', currentCard: 7, onCashOut });
    const cashOut = get('hilo-cashout-cta') as HTMLButtonElement;
    expect(cashOut).not.toBeNull();
    expect(cashOut.disabled).toBe(false);
    act(() => {
      cashOut.click();
    });
    expect(onCashOut).toHaveBeenCalledTimes(1);
  });

  it('cashOut button is hidden when no session is open', () => {
    render({ sessionStatus: 'idle' });
    expect(get('hilo-cashout-cta')).toBeNull();
  });
});

// The 4-case allowlist contract from `useAllowlistGate.test.tsx` collapses
// in the panel to the boolean `allowlistBlocked` prop. Cases (i)/(ii)/(iv)
// share the same UI surface; case (iii) is the blocked variant.
describe('HiLoPanel — allowlist gate states', () => {
  // (i) No allowlist set → gate is `passthrough` → allowlistBlocked=false
  it('(i) no allowlist set: openSession CTA is active', () => {
    const onOpenSession = vi.fn();
    render({ allowlistBlocked: false, sessionStatus: 'idle', onOpenSession });
    const cta = get('hilo-primary-cta') as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
    expect(cta.textContent).toMatch(/Open session/);
    act(() => {
      cta.click();
    });
    expect(onOpenSession).toHaveBeenCalledTimes(1);
  });

  // (ii) Allowlist disabled → gate is `passthrough` → allowlistBlocked=false
  it('(ii) allowlist disabled: step + cashOut CTAs active in open session', () => {
    const onStep = vi.fn();
    const onCashOut = vi.fn();
    render({
      allowlistBlocked: false,
      sessionStatus: 'open',
      currentCard: 5,
      onStep,
      onCashOut,
    });
    const stepCta = get('hilo-primary-cta') as HTMLButtonElement;
    const cashOutCta = get('hilo-cashout-cta') as HTMLButtonElement;
    expect(stepCta.disabled).toBe(false);
    expect(cashOutCta.disabled).toBe(false);
    expect(stepCta.textContent).toMatch(/Step/);
    expect(cashOutCta.textContent).toMatch(/Cash out/);
  });

  // (iii) Allowlist enabled + denied → gate is `blocked` → allowlistBlocked=true
  it('(iii) enabled + denied: openSession CTA is disabled with "Allowlist required"', () => {
    const onOpenSession = vi.fn();
    render({
      allowlistBlocked: true,
      sessionStatus: 'idle',
      onOpenSession,
    });
    const cta = get('hilo-primary-cta') as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(cta.textContent).toMatch(/Allowlist required/);
    act(() => {
      cta.click();
    });
    expect(onOpenSession).not.toHaveBeenCalled();
  });

  it('(iii) enabled + denied: step CTA is disabled with "Allowlist required" mid-session', () => {
    const onStep = vi.fn();
    render({
      allowlistBlocked: true,
      sessionStatus: 'open',
      currentCard: 7,
      onStep,
    });
    const cta = get('hilo-primary-cta') as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(cta.textContent).toMatch(/Allowlist required/);
    act(() => {
      cta.click();
    });
    expect(onStep).not.toHaveBeenCalled();
  });

  it('(iii) enabled + denied: cashOut CTA is disabled with "Allowlist required" mid-session', () => {
    const onCashOut = vi.fn();
    render({
      allowlistBlocked: true,
      sessionStatus: 'open',
      currentCard: 7,
      onCashOut,
    });
    const cashOut = get('hilo-cashout-cta') as HTMLButtonElement;
    expect(cashOut).not.toBeNull();
    expect(cashOut.disabled).toBe(true);
    expect(cashOut.textContent).toMatch(/Allowlist required/);
    act(() => {
      cashOut.click();
    });
    expect(onCashOut).not.toHaveBeenCalled();
  });

  // (iv) Allowlist enabled + allowed → gate is `passthrough` → allowlistBlocked=false
  it('(iv) enabled + allowed: all three lifecycle CTAs active', () => {
    const onOpenSession = vi.fn();
    const onStep = vi.fn();
    const onCashOut = vi.fn();

    // idle → openSession path
    render({
      allowlistBlocked: false,
      sessionStatus: 'idle',
      onOpenSession,
      onStep,
      onCashOut,
    });
    const openCta = get('hilo-primary-cta') as HTMLButtonElement;
    expect(openCta.disabled).toBe(false);
    expect(openCta.textContent).toMatch(/Open session/);

    // open → step / cashOut path
    act(() => {
      root.render(
        <HiLoPanel
          {...baseProps({
            allowlistBlocked: false,
            sessionStatus: 'open',
            currentCard: 9,
            onOpenSession,
            onStep,
            onCashOut,
          })}
        />,
      );
    });
    const stepCta = get('hilo-primary-cta') as HTMLButtonElement;
    const cashOutCta = get('hilo-cashout-cta') as HTMLButtonElement;
    expect(stepCta.disabled).toBe(false);
    expect(cashOutCta.disabled).toBe(false);
  });
});

describe('HiLoPanel — error + tx surfacing', () => {
  it('surfaces bet + write errors verbatim', () => {
    render({
      betError: 'oops',
      writeError: new Error('chain barf'),
    });
    expect(get('hilo-bet-error')?.textContent).toMatch(/oops/);
    expect(get('hilo-write-error')?.textContent).toMatch(/chain barf/);
  });

  it('shows the tx-submitted receipt when txHash is present', () => {
    const txHash =
      '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789' as const;
    render({ txHash });
    const receipt = get('hilo-tx-receipt');
    expect(receipt).not.toBeNull();
    expect(receipt?.textContent).toMatch(/Tx submitted/);
  });

  it('renders the session-status banner once the lifecycle ends', () => {
    render({ sessionStatus: 'cashedOut' });
    expect(get('hilo-status-cashedOut')).not.toBeNull();
    act(() => {
      root.render(
        <HiLoPanel {...baseProps({ sessionStatus: 'lost' })} />,
      );
    });
    expect(get('hilo-status-lost')).not.toBeNull();
  });
});
