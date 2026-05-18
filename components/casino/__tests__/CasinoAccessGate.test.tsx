// @vitest-environment happy-dom
//
// CasinoAccessGate — acceptance contract for
// [SWO_CASINO_TESTNET_OPEN_ACCESS] (PROJECT:SWO, P1, depends D11):
//
//   (i)   On Monad TESTNET (chainId 10143), the Skrumpey ownership gate
//         must be BYPASSED so QA can exercise casino flows without
//         holding a Star Skrumpey NFT.
//   (ii)  On Monad MAINNET (chainId 143), the Skrumpey ownership gate
//         must be ENFORCED — production rules apply unchanged.
//   (iii) On any OTHER chain (e.g. Ethereum mainnet 1), the wrong-chain
//         CTA from <ChainGate> must render INSTEAD of <AccessGate>. The
//         user sees the "Switch to Monad ..." prompt first, not the
//         Skrumpey lock screen.
//
// We stub out the underlying `wagmi` hook so the tests don't need a
// WagmiProvider, and we stub `@/components/AccessGate` to a sentinel so
// we can assert presence/absence without standing up DAOAccessProvider /
// DemoModeProvider / useDAOAccess plumbing.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('wagmi', () => ({
  useChainId: vi.fn<() => number>(() => 1),
}));

vi.mock('@/components/AccessGate', () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="swo-access-gate">{children}</div>
  ),
}));

import { useChainId } from 'wagmi';
import CasinoAccessGate from '../CasinoAccessGate';
import {
  MONAD_MAINNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
} from '../ChainGate';

// React 19's act(...) checks for this flag and warns otherwise.
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockedUseChainId = useChainId as unknown as ReturnType<typeof vi.fn>;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockedUseChainId.mockReset();
  mockedUseChainId.mockReturnValue(1);
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

function render(node: React.ReactElement) {
  act(() => {
    root.render(node);
  });
}

function findAccessGate(): HTMLElement | null {
  return container.querySelector('[data-testid="swo-access-gate"]');
}

function findChainGate(): HTMLElement | null {
  return container.querySelector('[data-testid="swo-chain-gate"]');
}

function findProtectedChild(): HTMLElement | null {
  return container.querySelector('[data-testid="protected-child"]');
}

describe('CasinoAccessGate — Monad testnet bypass (10143)', () => {
  it('renders children WITHOUT AccessGate on testnet', () => {
    mockedUseChainId.mockReturnValue(MONAD_TESTNET_CHAIN_ID);
    render(
      <CasinoAccessGate>
        <span data-testid="protected-child">SECRET</span>
      </CasinoAccessGate>,
    );
    // AccessGate must NOT mount — that is the whole point of the
    // testnet bypass.
    expect(findAccessGate()).toBeNull();
    // ChainGate must NOT mount either — testnet is a supported chain.
    expect(findChainGate()).toBeNull();
    // Children render directly.
    const child = findProtectedChild();
    expect(child).toBeTruthy();
    expect(child?.textContent).toBe('SECRET');
  });

  it('bypass works regardless of `title` / `message` props', () => {
    mockedUseChainId.mockReturnValue(MONAD_TESTNET_CHAIN_ID);
    render(
      <CasinoAccessGate title="ZZZ" message="ZZZ">
        <span data-testid="protected-child">SECRET</span>
      </CasinoAccessGate>,
    );
    expect(findAccessGate()).toBeNull();
    expect(findProtectedChild()).toBeTruthy();
  });

  it('chainIdOverride=10143 forces the testnet bypass branch', () => {
    mockedUseChainId.mockReturnValue(1);
    render(
      <CasinoAccessGate chainIdOverride={MONAD_TESTNET_CHAIN_ID}>
        <span data-testid="protected-child">SECRET</span>
      </CasinoAccessGate>,
    );
    expect(findAccessGate()).toBeNull();
    expect(findChainGate()).toBeNull();
    expect(findProtectedChild()).toBeTruthy();
  });
});

describe('CasinoAccessGate — Monad mainnet enforced (143)', () => {
  it('mounts AccessGate on mainnet so the Skrumpey check applies', () => {
    mockedUseChainId.mockReturnValue(MONAD_MAINNET_CHAIN_ID);
    render(
      <CasinoAccessGate
        title="CASINO ACCESS RESTRICTED"
        message="Only Star Skrumpey holders may enter the Cosmic Casino."
      >
        <span data-testid="protected-child">SECRET</span>
      </CasinoAccessGate>,
    );
    // AccessGate is the enforcement layer — must mount on mainnet.
    expect(findAccessGate()).toBeTruthy();
    // ChainGate must NOT mount — we are on the correct chain.
    expect(findChainGate()).toBeNull();
    // Children live INSIDE the AccessGate (so AccessGate decides
    // whether to actually render them).
    const child = findProtectedChild();
    expect(child).toBeTruthy();
    expect(findAccessGate()?.contains(child)).toBe(true);
  });

  it('chainIdOverride=143 forces the mainnet enforcement branch', () => {
    mockedUseChainId.mockReturnValue(1);
    render(
      <CasinoAccessGate chainIdOverride={MONAD_MAINNET_CHAIN_ID}>
        <span data-testid="protected-child">SECRET</span>
      </CasinoAccessGate>,
    );
    expect(findAccessGate()).toBeTruthy();
    expect(findChainGate()).toBeNull();
  });
});

describe('CasinoAccessGate — wrong chain shows ChainGate, NOT AccessGate', () => {
  it('renders ChainGate on Ethereum mainnet (chainId 1)', () => {
    mockedUseChainId.mockReturnValue(1);
    render(
      <CasinoAccessGate>
        <button type="button" data-testid="protected-child">
          Bet
        </button>
      </CasinoAccessGate>,
    );
    // CRITICAL: AccessGate must NOT mount on wrong-chain. The wrong-
    // network CTA wins priority over the Skrumpey prompt.
    expect(findAccessGate()).toBeNull();
    // ChainGate must mount and surface the "Switch to Monad ..." CTA.
    const gate = findChainGate();
    expect(gate).toBeTruthy();
    expect(gate?.getAttribute('role')).toBe('region');
    expect(gate?.getAttribute('aria-label')).toBe('Wrong network');
    expect(gate?.getAttribute('data-current-chain')).toBe('1');
    const switchBtn = container.querySelector(
      '[data-testid="swo-chain-gate-switch"]',
    );
    expect(switchBtn?.textContent).toBe('Switch to Monad mainnet');
  });

  it('renders ChainGate on Polygon mainnet (chainId 137), not AccessGate', () => {
    mockedUseChainId.mockReturnValue(137);
    render(
      <CasinoAccessGate>
        <span data-testid="protected-child">SECRET</span>
      </CasinoAccessGate>,
    );
    expect(findAccessGate()).toBeNull();
    const gate = findChainGate();
    expect(gate).toBeTruthy();
    expect(gate?.getAttribute('data-current-chain')).toBe('137');
  });

  it('chainIdOverride beats useChainId() (testability)', () => {
    // Wagmi says we are on mainnet, but the override pins us off-chain.
    mockedUseChainId.mockReturnValue(MONAD_MAINNET_CHAIN_ID);
    render(
      <CasinoAccessGate chainIdOverride={1}>
        <span data-testid="protected-child">SECRET</span>
      </CasinoAccessGate>,
    );
    expect(findAccessGate()).toBeNull();
    expect(findChainGate()).toBeTruthy();
  });
});
