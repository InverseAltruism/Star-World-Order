// @vitest-environment happy-dom
//
// WalletSheet — proves the focus-trap + Esc-returns-focus + hit-target
// contracts carried forward from BunnyBagz (lesson D2 in
// `bb_keyboard_nav_audit_2026-05-09.md` and the
// WALLETSHEET_ESCAPE_AND_FOCUS_TRAP refinement).
//
//   (a) Component exists & renders
//   (b1) Tab cycles forward inside the sheet (last → first)
//   (b2) Shift+Tab cycles backward (first → last)
//   (b3) Esc closes the sheet and returns focus to the opener
//   (c) Close button + identity rows carry `swo-casino-hit-44`

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { WalletSheet } from '../WalletSheet';

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
});

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="wallet-trigger"
        onClick={() => setOpen(true)}
      >
        Open wallet
      </button>
      <WalletSheet
        open={open}
        onClose={() => setOpen(false)}
        address="0x1234567890abcdef1234567890abcdef12345678"
        identityRows={[
          { label: 'Balance', value: '1.234 MON', testId: 'wallet-balance' },
          { label: 'USDm', value: '42.00 USDm', testId: 'wallet-usdm' },
        ]}
      />
    </>
  );
}

function press(target: HTMLElement, key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

function openSheet(): HTMLButtonElement {
  const trigger = container.querySelector(
    '[data-testid="wallet-trigger"]',
  ) as HTMLButtonElement;
  trigger.focus();
  act(() => {
    trigger.click();
  });
  return trigger;
}

describe('<WalletSheet> (acceptance: SWO_CASINO_COMPONENT_WALLET_SHEET)', () => {
  it('(a) component renders inside components/casino/', () => {
    act(() => {
      root.render(<Harness />);
    });
    openSheet();
    const sheet = container.querySelector('[data-testid="wallet-sheet"]');
    expect(sheet).not.toBeNull();
    expect(sheet?.getAttribute('role')).toBe('dialog');
    expect(sheet?.getAttribute('aria-modal')).toBe('true');
  });

  // (b1) Forward Tab cycling — when focus is on the last focusable
  // descendant of <aside>, Tab loops back to the first.
  it('(b1) Tab from the last focusable element cycles back to the first', () => {
    act(() => {
      root.render(<Harness />);
    });
    openSheet();
    const aside = container.querySelector(
      '[data-testid="wallet-sheet-aside"]',
    ) as HTMLElement;
    const focusables = Array.from(
      aside.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    );
    expect(focusables.length).toBeGreaterThan(0);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    expect(document.activeElement).toBe(last);

    const event = press(last, 'Tab');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  // (b2) Backward Tab cycling.
  it('(b2) Shift+Tab from the first focusable element cycles to the last', () => {
    act(() => {
      root.render(<Harness />);
    });
    openSheet();
    const aside = container.querySelector(
      '[data-testid="wallet-sheet-aside"]',
    ) as HTMLElement;
    const focusables = Array.from(
      aside.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    first.focus();
    expect(document.activeElement).toBe(first);

    const event = press(first, 'Tab', true);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  // (b3) Esc closes the sheet and returns focus to the trigger.
  it('(b3) Esc closes the sheet and returns focus to the opener', () => {
    act(() => {
      root.render(<Harness />);
    });
    const trigger = openSheet();
    expect(container.querySelector('[data-testid="wallet-sheet"]')).not.toBeNull();

    act(() => {
      press(document.body, 'Escape');
    });

    expect(container.querySelector('[data-testid="wallet-sheet"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  // (c) Hit-target contract — the close button and every identity row
  // carry the `swo-casino-hit-44` class (which `globals.css` maps to
  // `min-height: 44px`).
  it('(c) close button + identity rows carry swo-casino-hit-44', () => {
    act(() => {
      root.render(<Harness />);
    });
    openSheet();
    const close = container.querySelector(
      '[data-testid="wallet-close"]',
    ) as HTMLElement;
    expect(close).not.toBeNull();
    expect(close.classList.contains('swo-casino-hit-44')).toBe(true);

    const addressRow = container.querySelector(
      '[data-testid="wallet-address"]',
    ) as HTMLElement;
    const balanceRow = container.querySelector(
      '[data-testid="wallet-balance"]',
    ) as HTMLElement;
    const usdmRow = container.querySelector(
      '[data-testid="wallet-usdm"]',
    ) as HTMLElement;
    for (const row of [addressRow, balanceRow, usdmRow]) {
      expect(row).not.toBeNull();
      expect(row.classList.contains('swo-casino-hit-44')).toBe(true);
    }
  });
});
