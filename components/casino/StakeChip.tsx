// StakeChip — small primitive consumed by <BetPanel>'s chip cluster.
//
// Each chip applies a transform to the current numeric stake and emits the
// result. Canonical actions:
//
//   ½        — halve the current stake
//   2×       — double the current stake
//   MAX      — set stake to a configured cap (`max` prop)
//   bet last — restore the most recent submitted stake
//
// Math is centralized in `applyChip()` so the same logic powers tests, the
// keyboard-driven path, and the visible buttons. Returns the input string
// unchanged when the operation is undefined.

import type { CSSProperties } from 'react';

export type StakeChipKind = 'halve' | 'double' | 'max' | 'last';

const CHIP_LABEL: Record<StakeChipKind, string> = {
  halve: '½',
  double: '2×',
  max: 'MAX',
  last: 'Bet last',
};

const PRECISION = 6;

function trim(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  return parseFloat(n.toFixed(PRECISION)).toString();
}

export function applyChip(
  kind: StakeChipKind,
  current: string,
  opts: { max?: string; last?: string } = {},
): string {
  const cur = parseFloat(current || '0');
  switch (kind) {
    case 'halve':
      if (!Number.isFinite(cur) || cur <= 0) return current;
      return trim(cur / 2);
    case 'double':
      if (!Number.isFinite(cur) || cur <= 0) return current;
      return trim(cur * 2);
    case 'max':
      if (!opts.max) return current;
      return opts.max;
    case 'last':
      if (!opts.last) return current;
      return opts.last;
    default:
      return current;
  }
}

export type StakeChipProps = {
  kind: StakeChipKind;
  onApply: (next: string) => void;
  current: string;
  max?: string;
  last?: string;
  disabled?: boolean;
  testId?: string;
};

export function StakeChip(props: StakeChipProps) {
  const { kind, onApply, current, max, last, disabled, testId } = props;
  const dead =
    disabled ||
    (kind === 'max' && !max) ||
    (kind === 'last' && !last) ||
    ((kind === 'halve' || kind === 'double') &&
      (!current || parseFloat(current) <= 0));
  return (
    <button
      type="button"
      onClick={() => onApply(applyChip(kind, current, { max, last }))}
      disabled={dead}
      data-testid={testId}
      aria-label={`Stake ${CHIP_LABEL[kind]}`}
      style={dead ? chipDisabledStyle : chipStyle}
      className="swo-casino-tabular swo-casino-hit-44"
    >
      {CHIP_LABEL[kind]}
    </button>
  );
}

const chipStyle: CSSProperties = {
  flex: 1,
  // [SWO_CASINO_QA_MOBILE_TOUCH_TARGET_FLOOR]: 44px clears the mobile floor.
  minHeight: 44,
  padding: '0.4rem 0.5rem',
  borderRadius: 8,
  border: '1px solid var(--swo-casino-border, rgba(255,255,255,0.16))',
  background: 'var(--swo-casino-elevated, rgba(255,255,255,0.06))',
  color: 'var(--swo-casino-fg, #e8e8e8)',
  fontWeight: 600,
  fontSize: '0.85rem',
  cursor: 'pointer',
  fontVariantNumeric: 'tabular-nums',
};

const chipDisabledStyle: CSSProperties = {
  ...chipStyle,
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.6))',
  cursor: 'not-allowed',
  opacity: 0.55,
};
