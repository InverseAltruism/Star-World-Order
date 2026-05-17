// @vitest-environment happy-dom
//
// FairnessProof — proves the proof-card surface contract:
//   (a) component renders with no proof yet (—) and exposes the
//       verify-any-bet link so players can audit before betting
//   (b) when fed a server commit / client seed / tx hash, each value is
//       truncated and surfaced via stable data-testids
//   (c) tx hash, when present, becomes an <a> linking to the explorer

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { FairnessProof } from '../FairnessProof';

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

describe('<FairnessProof>', () => {
  it('(a) renders empty proof and shows the verify-any-bet link', () => {
    act(() => {
      root.render(<FairnessProof testIdPrefix="t" serverCommit={null} />);
    });
    expect(
      container.querySelector('[data-testid="t-fairness-proof"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="t-fairness-commit"]')!
        .textContent,
    ).toBe('—');
    expect(
      container.querySelector('[data-testid="t-fairness-tx"]')!.textContent,
    ).toBe('—');
    expect(
      container.querySelector('[data-testid="t-fairness-verify-link"]'),
    ).not.toBeNull();
  });

  it('(b) truncates commit / client seed values', () => {
    act(() => {
      root.render(
        <FairnessProof
          testIdPrefix="t"
          serverCommit="0xabcdef0011223344556677889900112233445566778899aabbccddeeff001122"
          clientSeed="0x99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa"
        />,
      );
    });
    const commit = container.querySelector(
      '[data-testid="t-fairness-commit"]',
    )!.textContent!;
    expect(commit.startsWith('0xabcdef')).toBe(true);
    expect(commit).toContain('…');
    expect(commit.length).toBeLessThan(20);

    expect(
      container.querySelector('[data-testid="t-fairness-client"]'),
    ).not.toBeNull();
  });

  it('(c) tx hash becomes an explorer link when present', () => {
    act(() => {
      root.render(
        <FairnessProof
          testIdPrefix="t"
          serverCommit={null}
          txHash="0x1111222233334444555566667777888899990000aaaabbbbccccddddeeee0011"
          explorerBaseUrl="https://example.test"
        />,
      );
    });
    const link = container.querySelector(
      '[data-testid="t-fairness-tx-link"]',
    ) as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link!.tagName).toBe('A');
    expect(link!.getAttribute('href')).toBe(
      'https://example.test/tx/0x1111222233334444555566667777888899990000aaaabbbbccccddddeeee0011',
    );
  });
});
