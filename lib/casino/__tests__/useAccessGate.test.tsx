// @vitest-environment happy-dom
//
// useAccessGate — acceptance contract for [SWO_CASINO_TESTNET_OPEN_ACCESS]
// (PROJECT:SWO, P0). The decision matrix:
//
//   chainId        holder snapshot              expected reason / allowed
//   ─────────────  ───────────────────────────  ─────────────────────────
//   10143          (irrelevant — never read)    testnet-open      / true
//   143            { isLoading: true }          mainnet-loading   / false
//   143            disconnected                 mainnet-disconnected / false
//   143            connected, !hasAccess        mainnet-no-holder / false
//   143            connected, hasAccess         mainnet-holder    / true
//   1, 137, undef  (irrelevant)                 wrong-chain       / false
//
// The hook reads `DAOAccessContext` via `useContext` (NOT the throwing
// `useDAOAccess` wrapper) so testnet pages can bypass the gate without
// mounting `DAOAccessProvider`. Tests inject the holder snapshot via the
// `holderOverride` prop so we don't need to stand up the full provider
// surface.

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  useAccessGate,
  MONAD_MAINNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
  type AccessGateState,
  type HolderSnapshot,
} from '../useAccessGate';

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const sink: { value: AccessGateState | null } = { value: null };

function Probe(props: {
  chainId: number;
  holderOverride?: HolderSnapshot;
}) {
  const state = useAccessGate(props);
  useEffect(() => {
    sink.value = state;
  }, [state]);
  return null;
}

function render(node: React.ReactElement) {
  act(() => {
    root.render(node);
  });
}

beforeEach(() => {
  sink.value = null;
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

describe('useAccessGate — Monad testnet bypass (10143)', () => {
  it('returns { allowed: true, reason: "testnet-open" } on chain 10143', () => {
    render(<Probe chainId={MONAD_TESTNET_CHAIN_ID} />);
    expect(sink.value?.allowed).toBe(true);
    expect(sink.value?.reason).toBe('testnet-open');
    expect(sink.value?.copy).toMatch(/testnet/i);
  });

  it('bypass ignores the holder snapshot entirely on testnet', () => {
    // Even an explicit "no holder, disconnected" holder snapshot must
    // NOT down-rank the testnet bypass — that is the whole point of
    // [SWO_CASINO_TESTNET_OPEN_ACCESS]: QA can play without a wallet
    // that holds a Star Skrumpey.
    render(
      <Probe
        chainId={MONAD_TESTNET_CHAIN_ID}
        holderOverride={{
          hasAccess: false,
          isLoading: false,
          isConnected: false,
        }}
      />,
    );
    expect(sink.value?.allowed).toBe(true);
    expect(sink.value?.reason).toBe('testnet-open');
  });

  it('bypass works without a DAOAccessProvider mounted', () => {
    // `<Probe>` is mounted directly into the body, NOT wrapped in
    // `<DAOAccessProvider>`. The hook must still resolve cleanly for
    // testnet — i.e. `useContext(DAOAccessContext)` returning undefined
    // is fine on the testnet branch (the holder snapshot is never
    // consulted there).
    render(<Probe chainId={MONAD_TESTNET_CHAIN_ID} />);
    expect(sink.value?.allowed).toBe(true);
    expect(sink.value?.reason).toBe('testnet-open');
  });
});

describe('useAccessGate — Monad mainnet enforcement (143)', () => {
  it('gates on holder check: connected + hasAccess → allowed', () => {
    render(
      <Probe
        chainId={MONAD_MAINNET_CHAIN_ID}
        holderOverride={{
          hasAccess: true,
          isLoading: false,
          isConnected: true,
        }}
      />,
    );
    expect(sink.value?.allowed).toBe(true);
    expect(sink.value?.reason).toBe('mainnet-holder');
  });

  it('gates on holder check: connected, !hasAccess → blocked (no-holder)', () => {
    render(
      <Probe
        chainId={MONAD_MAINNET_CHAIN_ID}
        holderOverride={{
          hasAccess: false,
          isLoading: false,
          isConnected: true,
        }}
      />,
    );
    expect(sink.value?.allowed).toBe(false);
    expect(sink.value?.reason).toBe('mainnet-no-holder');
    expect(sink.value?.copy).toMatch(/Star Skrumpey/);
  });

  it('disconnected → blocked with mainnet-disconnected reason', () => {
    render(
      <Probe
        chainId={MONAD_MAINNET_CHAIN_ID}
        holderOverride={{
          hasAccess: false,
          isLoading: false,
          isConnected: false,
        }}
      />,
    );
    expect(sink.value?.allowed).toBe(false);
    expect(sink.value?.reason).toBe('mainnet-disconnected');
    expect(sink.value?.copy).toMatch(/Connect a wallet/i);
  });

  it('isLoading → blocked with mainnet-loading reason', () => {
    render(
      <Probe
        chainId={MONAD_MAINNET_CHAIN_ID}
        holderOverride={{
          hasAccess: false,
          isLoading: true,
          isConnected: true,
        }}
      />,
    );
    expect(sink.value?.allowed).toBe(false);
    expect(sink.value?.reason).toBe('mainnet-loading');
  });

  it('mainnet without provider AND without override → loading (safe)', () => {
    // No DAOAccessProvider mounted, no holderOverride passed. The hook
    // should default to a "loading" state rather than locking the user
    // out — this is the right behaviour for the mount-transition window
    // before the provider has wired up.
    render(<Probe chainId={MONAD_MAINNET_CHAIN_ID} />);
    expect(sink.value?.allowed).toBe(false);
    expect(sink.value?.reason).toBe('mainnet-loading');
  });
});

describe('useAccessGate — wrong chain (anything outside {143, 10143})', () => {
  it('Ethereum mainnet (1) → blocked with wrong-chain + explanatory copy', () => {
    render(<Probe chainId={1} />);
    expect(sink.value?.allowed).toBe(false);
    expect(sink.value?.reason).toBe('wrong-chain');
    expect(sink.value?.copy).toMatch(/Monad mainnet/);
  });

  it('Polygon (137) → wrong-chain', () => {
    render(<Probe chainId={137} />);
    expect(sink.value?.allowed).toBe(false);
    expect(sink.value?.reason).toBe('wrong-chain');
  });

  it('unknown chain id (0) → wrong-chain', () => {
    render(<Probe chainId={0} />);
    expect(sink.value?.allowed).toBe(false);
    expect(sink.value?.reason).toBe('wrong-chain');
  });

  it('wrong chain does NOT consult holder snapshot', () => {
    // Even a fully-valid holder snapshot must NOT flip the gate to
    // allowed on the wrong chain — the user has to pick the right
    // network first.
    render(
      <Probe
        chainId={1}
        holderOverride={{
          hasAccess: true,
          isLoading: false,
          isConnected: true,
        }}
      />,
    );
    expect(sink.value?.allowed).toBe(false);
    expect(sink.value?.reason).toBe('wrong-chain');
  });
});
