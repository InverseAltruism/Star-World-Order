// WalletSheet — modal-on-mobile / slide-over wallet surface for SWO Cosmic Casino.
//
// Keyboard / focus contracts:
//
//   • Esc closes the sheet (handler bound on `document` in the keydown
//     phase so the press is observed even when focus is on the overlay
//     backdrop button — a sibling of <aside>).
//   • Tab / Shift+Tab cycle inside the dialog and never escape it.
//   • On open, focus moves to the first focusable descendant; on close,
//     focus returns to the opener element (the trigger button that
//     opened the sheet) so keyboard users land where they started.
//   • Close button + identity rows carry the `swo-casino-hit-44` class
//     so every interactive child clears the 44px mobile touch-target
//     floor.
//
// The sheet exposes a `children` slot so consumers can wire in their own
// wagmi balances, theme toggles, and recent-bet lists. A simple default
// body renders identity rows when `children` is omitted.

'use client';

import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  "[tabindex]:not([tabindex='-1'])",
].join(',');

export type WalletIdentityRow = {
  label: string;
  value: string;
  testId?: string;
};

export type WalletSheetProps = {
  open: boolean;
  onClose: () => void;
  /**
   * Optional address (short or full). When provided and `children` is
   * omitted, the default body renders an "Address" identity row.
   */
  address?: string;
  /**
   * Extra identity rows for the default body (e.g. balance, USDm, …).
   * Each row gets the `swo-casino-hit-44` class so the 44px mobile
   * touch-target floor is met.
   */
  identityRows?: WalletIdentityRow[];
  /**
   * Override body. When provided, replaces the default identity-row
   * rendering entirely. Consumers should still add `swo-casino-hit-44`
   * to interactive children so the touch-target contract holds.
   */
  children?: ReactNode;
};

function shortAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletSheet({
  open,
  onClose,
  address,
  identityRows,
  children,
}: WalletSheetProps) {
  const asideRef = useRef<HTMLElement | null>(null);
  // Captured at open time so Esc-close can return focus to wherever
  // the user was before the sheet stole it. Without this, the page's
  // active element is the wallet trigger only by coincidence; with
  // it, focus returns deterministically.
  const openerRef = useRef<HTMLElement | null>(null);

  // Capture the opener on the open→true edge. We use an effect rather
  // than the click handler so the contract holds for callers that flip
  // `open` programmatically too.
  useEffect(() => {
    if (!open) return;
    if (typeof document === 'undefined') return;
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body) {
      openerRef.current = active;
    }
  }, [open]);

  // Esc-to-close + Tab focus trap. See header comment for why the
  // listener is bound on `document` rather than `aside`.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const aside = asideRef.current;
      if (!aside) return;
      const focusables = Array.from(
        aside.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (el) =>
          !el.hasAttribute('disabled') &&
          el.getAttribute('aria-hidden') !== 'true',
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !aside.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // On open, move focus to the first focusable descendant so the Tab
  // trap above starts inside the dialog (deep-QA D2).
  useEffect(() => {
    if (!open) return;
    const aside = asideRef.current;
    if (!aside) return;
    const first = aside.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    const id =
      typeof window !== 'undefined'
        ? window.requestAnimationFrame(() => first?.focus())
        : 0;
    return () => {
      if (typeof window !== 'undefined') window.cancelAnimationFrame(id);
    };
  }, [open]);

  // On close, return focus to the opener. Effect runs on the
  // open→false transition; opener was captured on the open→true edge.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    const opener = openerRef.current;
    if (opener && typeof opener.focus === 'function') {
      opener.focus();
    }
    openerRef.current = null;
  }, [open]);

  const onBackdropClick = useCallback(() => onClose(), [onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Wallet"
      data-testid="wallet-sheet"
      style={overlayStyle}
    >
      <button
        type="button"
        aria-label="Close wallet overlay"
        data-testid="wallet-sheet-overlay"
        onClick={onBackdropClick}
        style={overlayBackdropStyle}
      />
      <aside
        ref={asideRef}
        data-testid="wallet-sheet-aside"
        style={sheetStyle}
      >
        <header style={sheetHeaderStyle}>
          <h2 style={sheetTitleStyle}>Wallet</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close wallet"
            data-testid="wallet-close"
            className="swo-casino-hit-44"
            style={closeButtonStyle}
          >
            ×
          </button>
        </header>
        {children ?? (
          <WalletSheetDefaultBody address={address} identityRows={identityRows} />
        )}
      </aside>
    </div>
  );
}

function WalletSheetDefaultBody({
  address,
  identityRows,
}: {
  address?: string;
  identityRows?: WalletIdentityRow[];
}) {
  const rows: WalletIdentityRow[] = [
    {
      label: 'Address',
      value: address ? shortAddress(address) : 'Not connected',
      testId: 'wallet-address',
    },
    ...(identityRows ?? []),
  ];
  return (
    <dl style={fieldListStyle} data-testid="wallet-identity-list">
      {rows.map((row) => (
        <div
          key={row.label}
          // Identity rows clear the 44-px floor too — per the QA contract
          // and the task's acceptance (c).
          className="swo-casino-hit-44"
          style={fieldRowStyle}
          data-testid={row.testId ?? `wallet-row-${row.label.toLowerCase()}`}
        >
          <dt style={fieldLabelStyle}>{row.label}</dt>
          <dd style={fieldValueStyle}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  display: 'flex',
  justifyContent: 'flex-end',
};

const overlayBackdropStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'var(--swo-casino-overlay-backdrop, rgba(0,0,0,0.6))',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
};

const sheetStyle: CSSProperties = {
  position: 'relative',
  width: 'min(420px, 100vw)',
  height: '100%',
  background: 'var(--swo-casino-surface, #0f0f1e)',
  color: 'var(--swo-casino-fg, #e8e8e8)',
  padding: '1rem 1.25rem',
  boxShadow: '-12px 0 32px rgba(0,0,0,0.45)',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  overflowY: 'auto',
  borderLeft: '1px solid var(--swo-casino-border, rgba(255,255,255,0.16))',
};

const sheetHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const sheetTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: '1.1rem',
  letterSpacing: '-0.01em',
};

const closeButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  fontSize: '1.5rem',
  lineHeight: 1,
  cursor: 'pointer',
  minWidth: 44,
  minHeight: 44,
};

const fieldListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
};

const fieldRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  minHeight: 44,
  justifyContent: 'center',
};

const fieldLabelStyle: CSSProperties = {
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  opacity: 0.7,
};

const fieldValueStyle: CSSProperties = {
  margin: 0,
  fontSize: '1rem',
  fontVariantNumeric: 'tabular-nums',
};
