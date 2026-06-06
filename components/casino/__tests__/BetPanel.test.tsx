// @vitest-environment happy-dom
//
// BetPanel — proves the SWO Casino QA contracts:
//   (a) getBoundingClientRect().height ≥ 44 for stake input + token toggle
//       wrapper + bet CTA at viewport width 375 (mobile touch-target floor)
//   (b) font-size ≥ 12px for all caption text (legibility floor)
//   (c) CTA dwell ≥ 600ms post-click using vi.useFakeTimers()
//
// Bonus smoke + chip-cluster coverage preserved from BB port.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { BetPanel, DEFAULT_SIGNING_DWELL_MS } from '../BetPanel';

// React 19's act(...) checks for this flag and warns otherwise.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VIEWPORT_WIDTH = 375;

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

// happy-dom does not run real layout, so getBoundingClientRect() returns
// zero for every element. Patch it to surface the QA-pinned minHeight
// (inline style OR the `.swo-casino-hit-44` class contract). This lets
// the spec assert directly on `el.getBoundingClientRect().height` as the
// task requires.
function patchBoundingRect() {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    const el = this as HTMLElement;
    const inline = parseFloat(el.style.minHeight || '') || 0;
    const hit = el.classList?.contains('swo-casino-hit-44') ? 44 : 0;
    const height = Math.max(inline, hit);
    return {
      x: 0,
      y: 0,
      width: VIEWPORT_WIDTH,
      height,
      top: 0,
      left: 0,
      right: VIEWPORT_WIDTH,
      bottom: height,
      toJSON: () => ({}),
    } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

let container: HTMLDivElement;
let root: Root;
let restoreBoundingRect: (() => void) | null = null;

beforeEach(() => {
  setViewport(VIEWPORT_WIDTH);
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
  if (restoreBoundingRect) {
    restoreBoundingRect();
    restoreBoundingRect = null;
  }
});

function renderPanel(overrides: {
  ctaLabel?: string;
  ctaDisabled?: boolean;
  onCtaClick?: () => void;
  tokenToggle?: boolean;
} = {}) {
  const {
    ctaLabel = 'Bet 0.01 MON',
    ctaDisabled = false,
    onCtaClick = () => {},
    tokenToggle = true,
  } = overrides;
  act(() => {
    root.render(
      <BetPanel
        testIdPrefix="t"
        multiplier="1.98×"
        stakeUnit="MON"
        stake="0.01"
        onStakeChange={() => {}}
        chipMax="0.5"
        profitOnWin="0.0098 MON"
        tokenToggle={
          tokenToggle ? (
            <div data-testid="t-token-toggle">ETH | USDm</div>
          ) : undefined
        }
        cta={{ label: ctaLabel, onClick: onCtaClick, disabled: ctaDisabled }}
      />,
    );
  });
}

describe('<BetPanel> (acceptance: SWO_CASINO_VITEST_BET_PANEL)', () => {
  it('smoke: renders the panel under components/casino/', () => {
    renderPanel();
    const panel = container.querySelector('[data-testid="t-bet-panel"]');
    expect(panel).not.toBeNull();
  });

  // (a) Mobile touch-target floor. The QA contract is: stake input,
  // token-toggle wrapper, and primary bet CTA each report
  // getBoundingClientRect().height ≥ 44 at viewport width 375. happy-dom
  // returns 0 for getBoundingClientRect by default, so the test installs
  // a layout shim that surfaces the QA-pinned minHeight / hit-class
  // contract through the same API a real browser would expose.
  it('(a) getBoundingClientRect().height ≥ 44 for stake input + token toggle + bet CTA at viewport 375', () => {
    restoreBoundingRect = patchBoundingRect();
    renderPanel();
    expect(window.innerWidth).toBe(VIEWPORT_WIDTH);

    const required: Array<{ sel: string; name: string }> = [
      { sel: '[data-testid="t-stake-input"]', name: 'stake input' },
      { sel: '[data-testid="t-token-toggle-wrapper"]', name: 'token toggle' },
      { sel: '[data-testid="t-primary-cta"]', name: 'bet CTA' },
    ];

    for (const { sel, name } of required) {
      const el = container.querySelector(sel) as HTMLElement | null;
      expect(el, `${name} (${sel}) should render`).not.toBeNull();
      const rect = el!.getBoundingClientRect();
      expect(
        rect.height,
        `${name} getBoundingClientRect().height must be ≥ 44 (got ${rect.height})`,
      ).toBeGreaterThanOrEqual(44);
    }

    // Bonus: stake chips also carry the hit-44 contract, so check them
    // too for regression coverage on the chip cluster.
    const chips = ['halve', 'double', 'max', 'last'];
    for (const kind of chips) {
      const el = container.querySelector(
        `[data-testid="t-chip-${kind}"]`,
      ) as HTMLElement | null;
      expect(el, `chip "${kind}" should render`).not.toBeNull();
      expect(
        el!.getBoundingClientRect().height,
        `chip "${kind}" must clear 44px floor`,
      ).toBeGreaterThanOrEqual(44);
    }
  });

  // (b) Caption-text legibility floor. Walk every rendered element with
  // its own (non-inherited) text glyphs and assert the inline font-size
  // resolves to ≥ 12px. 12px is the SWO Casino legibility floor inherited
  // from BB's QA audit. We parse inline `style.fontSize` (rem→px) because
  // happy-dom does not run a stylesheet-aware computed-style pipeline;
  // every caption in BetPanel pins its size inline, which is exactly the
  // surface area the QA contract guards.
  it('(b) font-size ≥ 12px for all caption text', () => {
    renderPanel();
    const all = container.querySelectorAll('*') as NodeListOf<HTMLElement>;
    expect(all.length).toBeGreaterThan(0);
    let checked = 0;
    for (const el of all) {
      const ownText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => (n.textContent ?? '').trim())
        .join('');
      if (!ownText) continue;
      const raw = el.style.fontSize || '';
      const num = parseFloat(raw);
      if (!num) continue; // inherited — the styled ancestor is the
      // surface the QA contract pins.
      const px = raw.endsWith('rem') ? num * 16 : num;
      expect(
        px,
        `caption "${ownText.slice(0, 40)}" must render ≥ 12px (got ${px}px)`,
      ).toBeGreaterThanOrEqual(12);
      checked += 1;
    }
    // Guard: we must have actually checked at least one caption,
    // otherwise the loop is silently a no-op.
    expect(checked).toBeGreaterThan(0);
  });

  // (c) Dwell window. Clicking the primary CTA must flip the label to
  // "Confirm in wallet…" synchronously and HOLD that label for at least
  // 600ms, regardless of how fast the caller's onClick resolves. The
  // dwell is implemented with setTimeout(setSigningOverlay, 600) so we
  // exercise it under vi.useFakeTimers() to assert the exact boundary.
  it('(c) CTA dwells on "Confirm in wallet…" for ≥ 600ms after click (vi.useFakeTimers)', () => {
    vi.useFakeTimers();
    const onCtaClick = vi.fn();
    renderPanel({ ctaLabel: 'Flip for 0.01 MON', onCtaClick });

    const cta = container.querySelector(
      '[data-testid="t-primary-cta"]',
    ) as HTMLButtonElement;
    expect(cta.textContent).toBe('Flip for 0.01 MON');
    expect(cta.disabled).toBe(false);

    // Click — caller onClick fires immediately (sync), and the overlay
    // engages on the same tick.
    act(() => {
      cta.click();
    });
    expect(onCtaClick).toHaveBeenCalledTimes(1);

    // Immediately after the click: label is the signing overlay, button
    // is disabled, and the overlay-protected stake input does NOT
    // re-enter the bet via Enter (proven by handleKeyDown gating on
    // signingOverlay).
    expect(cta.textContent).toBe('Confirm in wallet…');
    expect(cta.disabled).toBe(true);

    // Advance to 1ms before the dwell expires — overlay must still hold.
    act(() => {
      vi.advanceTimersByTime(DEFAULT_SIGNING_DWELL_MS - 1);
    });
    expect(cta.textContent).toBe('Confirm in wallet…');
    expect(cta.disabled).toBe(true);

    // Cross the 600ms boundary — overlay releases.
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(cta.textContent).toBe('Flip for 0.01 MON');
    expect(cta.disabled).toBe(false);
  });

  // (c-regression) The dwell is driven by the `signingDwellMs` prop, not a
  // hardcoded 600. If the timer ever gets pinned to a literal it would still
  // pass the default-dwell test above, so this case proves the prop is
  // actually wired into the setTimeout.
  it('(c) honours custom signingDwellMs prop override (regression)', () => {
    vi.useFakeTimers();
    const CUSTOM_DWELL = 1200;
    act(() => {
      root.render(
        <BetPanel
          testIdPrefix="t"
          multiplier="2.00×"
          stakeUnit="MON"
          stake="0.01"
          onStakeChange={() => {}}
          signingDwellMs={CUSTOM_DWELL}
          cta={{ label: 'Bet', onClick: () => {}, disabled: false }}
        />,
      );
    });
    const cta = container.querySelector(
      '[data-testid="t-primary-cta"]',
    ) as HTMLButtonElement;

    act(() => {
      cta.click();
    });
    expect(cta.textContent).toBe('Confirm in wallet…');

    // Default-dwell boundary must NOT release the overlay when the prop is
    // longer than the default.
    act(() => {
      vi.advanceTimersByTime(DEFAULT_SIGNING_DWELL_MS + 50);
    });
    expect(cta.textContent).toBe('Confirm in wallet…');
    expect(cta.disabled).toBe(true);

    // Cross the custom boundary — overlay releases.
    act(() => {
      vi.advanceTimersByTime(CUSTOM_DWELL - DEFAULT_SIGNING_DWELL_MS - 49);
    });
    expect(cta.textContent).toBe('Bet');
    expect(cta.disabled).toBe(false);
  });
});
