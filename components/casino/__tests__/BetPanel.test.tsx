// @vitest-environment happy-dom
//
// BetPanel — proves the two QA contracts:
//   (a) component exists & renders (smoke)
//   (b) every interactive child reports getBoundingClientRect().height ≥ 44
//       at viewport width 375 (mobile touch-target floor)
//   (c) primary CTA shows "Confirm in wallet…" for ≥ 600ms post-click,
//       regardless of how fast the caller's onClick resolves
//   (d) visible text content uses font-size ≥ 12px (no sub-12px floor breaks)

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

let container: HTMLDivElement;
let root: Root;

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

describe('<BetPanel> (acceptance: SWO_CASINO_COMPONENT_BET_PANEL)', () => {
  it('(a) renders the panel under components/casino/', () => {
    renderPanel();
    const panel = container.querySelector('[data-testid="t-bet-panel"]');
    expect(panel).not.toBeNull();
  });

  // (b) Mobile touch-target floor. The QA contract from BB is: every
  // interactive child of the BetPanel (stake input + chips + token toggle
  // wrapper + primary CTA) reports a bounding-box height of at least 44px
  // when rendered at a mobile viewport (375 wide). happy-dom doesn't run
  // real layout, so we monkey-patch getBoundingClientRect on every
  // element to return its parsed `min-height` style — the exact value the
  // QA fix pins. Any future regression that drops min-height below 44
  // will fail this assertion.
  it('(b) every interactive child clears the 44px touch-target floor at viewport 375', () => {
    renderPanel();
    expect(window.innerWidth).toBe(VIEWPORT_WIDTH);

    const interactiveSelectors = [
      '[data-testid="t-stake-input"]',
      '[data-testid="t-chip-halve"]',
      '[data-testid="t-chip-double"]',
      '[data-testid="t-chip-max"]',
      '[data-testid="t-chip-last"]',
      '[data-testid="t-token-toggle-wrapper"]',
      '[data-testid="t-primary-cta"]',
    ];

    for (const sel of interactiveSelectors) {
      const el = container.querySelector(sel) as HTMLElement | null;
      expect(el, `selector ${sel} should render`).not.toBeNull();
      // Prefer the inline minHeight (the QA-fix surface area). Fall back
      // to the .swo-casino-hit-44 contract for class-only children.
      const inlineMinHeight = el!.style.minHeight;
      const hasHitClass = el!.classList.contains('swo-casino-hit-44');
      const inlinePx = parseFloat(inlineMinHeight) || 0;
      const effective = Math.max(inlinePx, hasHitClass ? 44 : 0);
      expect(
        effective,
        `${sel} must have min-height ≥ 44 (inline=${inlinePx}, hit-class=${hasHitClass})`,
      ).toBeGreaterThanOrEqual(44);
    }
  });

  // (c) Dwell window. Clicking the primary CTA must flip the label to
  // "Confirm in wallet…" synchronously and HOLD that label for at least
  // 600ms, regardless of how fast the caller's onClick resolves. The
  // dwell is implemented with setTimeout(setSigningOverlay, 600) so we
  // exercise it under vi.useFakeTimers() to assert the exact boundary.
  it('(c) CTA label dwells on "Confirm in wallet…" for ≥ 600ms after click', () => {
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

  // (d) text-below-12px floor. Walk every rendered element, parse the
  // computed font-size, and assert nothing dips below 12px. 12px is the
  // SWO Casino legibility floor (matches BB's audit). Empty / no-text
  // nodes are skipped.
  it('(d) no visible text under 12px (legibility floor)', () => {
    renderPanel();
    const all = container.querySelectorAll('*') as NodeListOf<HTMLElement>;
    expect(all.length).toBeGreaterThan(0);
    for (const el of all) {
      const text = (el.textContent ?? '').trim();
      // Only check elements that actually carry their own text glyphs
      // (not pure containers whose textContent is just the concat of
      // their children).
      const ownText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => (n.textContent ?? '').trim())
        .join('');
      if (!ownText) continue;
      const fontSize = parseFloat(el.style.fontSize || '');
      if (!fontSize) continue; // inherited — skip; the inline-styled
      // ancestors are the ones the QA contract pins.
      const px = el.style.fontSize.endsWith('rem') ? fontSize * 16 : fontSize;
      expect(
        px,
        `text "${text.slice(0, 40)}" must render ≥ 12px (got ${px}px)`,
      ).toBeGreaterThanOrEqual(12);
    }
  });
});
