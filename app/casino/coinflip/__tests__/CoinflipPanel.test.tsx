// @vitest-environment happy-dom
//
// CoinflipPanel — synchronous-render acceptance for
// SWO_CASINO_COINFLIP_UI(b): the panel exists and its CTAs wire to the
// props the wagmi wrapper supplies. Tests stay free of wagmi so the
// suite can run under vitest's casino project without a WagmiProvider.
//
// Covers:
//   (a) renders the page surface (header, side selector, bet panel,
//       fairness proof card)
//   (b) heads/tails buttons call `onSideChange` with the side they show
//   (c) primary CTA fires `onPlaceBet` when the user is connected on
//       the right chain and not busy
//   (d) `chainGate` prop replaces the bet CTA with a "Switch to X" CTA
//       that calls `onSwitch` — proves the chain-gate fires for
//       chainId ≠ 10143/143 (acceptance (d))
//   (e) `settledSide` drives the Won / Lost banner based on which side
//       the player picked

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { CoinflipPanel, type CoinflipPanelProps } from '../CoinflipPanel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function renderPanel(overrides: Partial<CoinflipPanelProps> = {}) {
  const baseProps: CoinflipPanelProps = {
    side: 'heads',
    onSideChange: vi.fn(),
    stake: '0.01',
    onStakeChange: vi.fn(),
    chainGate: null,
    needsConnect: false,
    onConnect: vi.fn(),
    busy: false,
    onPlaceBet: vi.fn(),
    settledSide: null,
  };
  const props: CoinflipPanelProps = { ...baseProps, ...overrides };
  act(() => {
    root.render(<CoinflipPanel {...props} />);
  });
  return props;
}

describe('<CoinflipPanel> (SWO_CASINO_COINFLIP_UI acceptance b/d/e)', () => {
  it('(a) renders the page surface', () => {
    renderPanel();
    expect(container.querySelector('[data-testid="coinflip-page"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="coinflip-bet-panel"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="coinflip-side-selector"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="coinflip-fairness-proof"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="coinflip-multiplier"]')!
        .textContent,
    ).toContain('1.98×');
  });

  it('(b) heads/tails buttons fire onSideChange', () => {
    const onSideChange = vi.fn();
    renderPanel({ side: 'heads', onSideChange });
    const tails = container.querySelector(
      '[data-testid="coinflip-side-tails"]',
    ) as HTMLButtonElement;
    expect(tails.getAttribute('aria-pressed')).toBe('false');
    act(() => {
      tails.click();
    });
    expect(onSideChange).toHaveBeenCalledWith('tails');
  });

  it('(b) selected side has aria-pressed=true', () => {
    renderPanel({ side: 'tails' });
    const tails = container.querySelector(
      '[data-testid="coinflip-side-tails"]',
    ) as HTMLButtonElement;
    const heads = container.querySelector(
      '[data-testid="coinflip-side-heads"]',
    ) as HTMLButtonElement;
    expect(tails.getAttribute('aria-pressed')).toBe('true');
    expect(heads.getAttribute('aria-pressed')).toBe('false');
  });

  it('(c) primary CTA shows "Flip for <stake> MON" and fires onPlaceBet', () => {
    const onPlaceBet = vi.fn();
    renderPanel({ stake: '0.05', onPlaceBet });
    const cta = container.querySelector(
      '[data-testid="coinflip-primary-cta"]',
    ) as HTMLButtonElement;
    expect(cta.textContent).toBe('Flip for 0.05 MON');
    expect(cta.disabled).toBe(false);
    act(() => {
      cta.click();
    });
    expect(onPlaceBet).toHaveBeenCalledTimes(1);
  });

  it('(c) CTA shows "Connect wallet" and fires onConnect when needsConnect', () => {
    const onConnect = vi.fn();
    renderPanel({ needsConnect: true, onConnect });
    const cta = container.querySelector(
      '[data-testid="coinflip-primary-cta"]',
    ) as HTMLButtonElement;
    expect(cta.textContent).toBe('Connect wallet');
    act(() => {
      cta.click();
    });
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('(d) chainGate renders the banner and replaces the CTA with Switch', () => {
    const onSwitch = vi.fn();
    renderPanel({
      chainGate: {
        chainName: 'Monad Testnet',
        onSwitch,
        switching: false,
      },
    });
    const banner = container.querySelector('[data-testid="coinflip-chain-gate"]');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain('Monad Testnet');
    const cta = container.querySelector(
      '[data-testid="coinflip-primary-cta"]',
    ) as HTMLButtonElement;
    expect(cta.textContent).toBe('Switch to Monad Testnet');
    act(() => {
      cta.click();
    });
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  it('(d) chainGate switching=true disables the switch CTA', () => {
    renderPanel({
      chainGate: {
        chainName: 'Monad Testnet',
        onSwitch: vi.fn(),
        switching: true,
      },
    });
    const cta = container.querySelector(
      '[data-testid="coinflip-primary-cta"]',
    ) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(cta.textContent).toBe('Switching network…');
  });

  it('(e) settledSide matching pick → Won banner with payout', () => {
    renderPanel({
      side: 'heads',
      settledSide: 'heads',
      settledPayout: '0.0198',
    });
    const won = container.querySelector('[data-testid="coinflip-outcome-won"]');
    expect(won).not.toBeNull();
    expect(won!.textContent).toContain('Won');
    expect(won!.textContent).toContain('0.0198 MON');
  });

  it('(e) settledSide mismatching pick → Lost banner', () => {
    renderPanel({ side: 'heads', settledSide: 'tails' });
    const lost = container.querySelector(
      '[data-testid="coinflip-outcome-lost"]',
    );
    expect(lost).not.toBeNull();
    expect(lost!.textContent).toContain('Lost');
    // Won banner must NOT render.
    expect(
      container.querySelector('[data-testid="coinflip-outcome-won"]'),
    ).toBeNull();
  });

  it('(e) before settlement, neither Won nor Lost banner renders', () => {
    renderPanel({ settledSide: null });
    expect(
      container.querySelector('[data-testid="coinflip-outcome-won"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="coinflip-outcome-lost"]'),
    ).toBeNull();
  });

  it('busy=true replaces the CTA label with "Confirm in wallet…"', () => {
    renderPanel({ busy: true });
    const cta = container.querySelector(
      '[data-testid="coinflip-primary-cta"]',
    ) as HTMLButtonElement;
    expect(cta.textContent).toBe('Confirm in wallet…');
    expect(cta.disabled).toBe(true);
  });

  it('error string renders into the BetPanel extras slot', () => {
    renderPanel({ error: 'Could not claim a fresh server commit.' });
    const err = container.querySelector('[data-testid="coinflip-error"]');
    expect(err).not.toBeNull();
    expect(err!.textContent).toContain('Could not claim');
  });
});
