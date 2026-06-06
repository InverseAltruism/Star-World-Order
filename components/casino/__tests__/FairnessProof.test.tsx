// @vitest-environment happy-dom
//
// FairnessProof — acceptance contract for [SWO_CASINO_COMPONENT_FAIRNESS_PROOF]:
//   (a) component exists & renders the receipt section
//   (b) the rendered triple (commit / reveal / outcome) matches whatever
//       `lib/casino/verify.ts` derives from the same inputs — i.e. the UI is
//       not allowed to drift away from the verifier.
//   (c) copy-to-clipboard fires the injected writer with the raw value.
//   (d) when `expectedCommit` is supplied the component flags match /
//       mismatch so the parent can surface tampered bets.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { FairnessProof } from '../FairnessProof';
import {
  computeCommit,
  computeOutcome,
  deriveTriple,
} from '../../../lib/casino/verify';

// React 19's act(...) checks for this flag and warns otherwise.
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const REVEAL =
  '0x0000000000000000000000000000000000000000000000000000000000000001';
const SALT = 's';

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

function render(props: Partial<React.ComponentProps<typeof FairnessProof>> = {}) {
  const copy = props.copy ?? (() => Promise.resolve());
  act(() => {
    root.render(
      <FairnessProof
        reveal={REVEAL}
        salt={SALT}
        game="coinflip"
        copy={copy}
        {...props}
      />,
    );
  });
}

function textOf(testId: string): string {
  const el = container.querySelector(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`missing element: ${testId}`);
  return el.textContent ?? '';
}

function dataValueOf(testId: string): string {
  const el = container.querySelector(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`missing element: ${testId}`);
  return el.getAttribute('data-value') ?? '';
}

describe('FairnessProof — component contract', () => {
  it('renders the receipt section with a heading', () => {
    render();
    const section = container.querySelector(
      '[data-testid="swo-fairness-proof"]',
    );
    expect(section).toBeTruthy();
    expect(section?.getAttribute('aria-label')).toBe('Provably fair receipt');
    expect(textOf('swo-fairness-proof')).toContain('Provably fair receipt');
  });

  it('renders the same triple that verify.ts derives (the contract)', () => {
    render();
    const triple = deriveTriple({ reveal: REVEAL, salt: SALT, game: 'coinflip' });

    expect(dataValueOf('swo-fairness-commit-value')).toBe(triple.commit);
    expect(dataValueOf('swo-fairness-reveal-value')).toBe(triple.reveal);
    expect(dataValueOf('swo-fairness-outcome-value')).toBe(triple.outcome);
    // The outcome row is plain text, so its rendered label equals the value.
    expect(textOf('swo-fairness-outcome-value')).toBe(triple.outcome);
  });

  it('honours the game prop — dice outcome is 1..6', () => {
    render({ game: 'dice' });
    const outcome = dataValueOf('swo-fairness-outcome-value');
    expect(outcome).toBe(
      computeOutcome({ reveal: REVEAL, salt: SALT, game: 'dice' }),
    );
    expect(['1', '2', '3', '4', '5', '6']).toContain(outcome);
  });

  it('copy-to-clipboard fires the injected writer with the raw triple value', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    render({ copy });

    const commitBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="swo-fairness-commit-copy"]',
    );
    const revealBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="swo-fairness-reveal-copy"]',
    );
    const outcomeBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="swo-fairness-outcome-copy"]',
    );
    expect(commitBtn).toBeTruthy();
    expect(revealBtn).toBeTruthy();
    expect(outcomeBtn).toBeTruthy();

    await act(async () => {
      commitBtn!.click();
      revealBtn!.click();
      outcomeBtn!.click();
      // flush microtasks from the click handlers
      await Promise.resolve();
    });

    const triple = deriveTriple({ reveal: REVEAL, salt: SALT, game: 'coinflip' });
    expect(copy).toHaveBeenCalledTimes(3);
    expect(copy).toHaveBeenNthCalledWith(1, triple.commit);
    expect(copy).toHaveBeenNthCalledWith(2, triple.reveal);
    expect(copy).toHaveBeenNthCalledWith(3, triple.outcome);
  });

  it('flags expectedCommit match', () => {
    const expectedCommit = computeCommit(REVEAL);
    render({ expectedCommit });
    const section = container.querySelector(
      '[data-testid="swo-fairness-proof"]',
    );
    expect(section?.getAttribute('data-match')).toBe('ok');
    const matchEl = container.querySelector(
      '[data-testid="swo-fairness-match"]',
    );
    expect(matchEl?.getAttribute('data-match')).toBe('ok');
    expect(matchEl?.textContent ?? '').toMatch(/Commit matches/);
  });

  it('flags expectedCommit mismatch', () => {
    // Any well-formed commit other than computeCommit(REVEAL).
    const bogus =
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    render({ expectedCommit: bogus });
    const section = container.querySelector(
      '[data-testid="swo-fairness-proof"]',
    );
    expect(section?.getAttribute('data-match')).toBe('mismatch');
    const matchEl = container.querySelector(
      '[data-testid="swo-fairness-match"]',
    );
    expect(matchEl?.getAttribute('data-match')).toBe('mismatch');
    expect(matchEl?.textContent ?? '').toMatch(/mismatch/);
  });

  it('omits the match badge when no expectedCommit is supplied', () => {
    render();
    const section = container.querySelector(
      '[data-testid="swo-fairness-proof"]',
    );
    expect(section?.getAttribute('data-match')).toBe('unchecked');
    expect(
      container.querySelector('[data-testid="swo-fairness-match"]'),
    ).toBeNull();
  });
});
