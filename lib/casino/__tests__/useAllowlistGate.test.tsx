// @vitest-environment happy-dom
//
// useAllowlistGate — acceptance contract for [SWO_CASINO_ALLOWLIST_UI_GATE]:
//
//   (i)   No allowlist (game.allowlist() == 0x0)         → passthrough
//   (ii)  Allowlist set but disabled (enabled == false)   → passthrough
//   (iii) Allowlist enabled + denied (isAllowed == false) → blocked
//   (iv)  Allowlist enabled + allowed (isAllowed == true) → passthrough
//
// We stub `wagmi.useReadContract` so each test can script the per-call
// return value by `functionName`. This keeps the test independent of any
// QueryClientProvider plumbing and matches the existing wagmi-stubbing
// pattern in `components/casino/__tests__/CasinoAccessGate.test.tsx`.

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

type ReadContractCall = {
  address?: `0x${string}`;
  functionName?: string;
  args?: readonly unknown[];
  query?: { enabled?: boolean };
};

type Scripted = {
  data?: unknown;
  isLoading?: boolean;
};

const scriptedByFn: Record<string, Scripted> = {};

vi.mock('wagmi', () => ({
  useReadContract: vi.fn((opts: ReadContractCall) => {
    const fn = opts.functionName ?? '';
    const queryEnabled = opts.query?.enabled !== false;
    const scripted: Scripted = scriptedByFn[fn] ?? {};
    if (!queryEnabled) {
      // Mirror wagmi's behaviour: disabled queries don't fetch and
      // `data` stays undefined while `isLoading` is false.
      return {
        data: undefined,
        isLoading: false,
        isError: false,
      } as const;
    }
    return {
      data: scripted.data,
      isLoading: scripted.isLoading ?? false,
      isError: false,
    } as const;
  }),
}));

import {
  useAllowlistGate,
  ZERO_ADDRESS,
  type AllowlistGateState,
} from '../useAllowlistGate';

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const GAME = '0x064b8bfc03b23D2b525deD9d3969090347A21983' as const;
const ALLOWLIST = '0x1111111111111111111111111111111111111111' as const;
const PLAYER = '0x2222222222222222222222222222222222222222' as const;

let container: HTMLDivElement;
let root: Root;
const sink: { value: AllowlistGateState | null } = { value: null };

function Probe(props: {
  gameAddress?: `0x${string}`;
  player?: `0x${string}`;
  chainId?: number;
  enabled?: boolean;
}) {
  const state = useAllowlistGate(props);
  // Mutating an external ref inside an effect is allowed under
  // react-hooks/globals — the assignment lives off the render path.
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

function script(map: Record<string, Scripted>) {
  for (const k of Object.keys(scriptedByFn)) delete scriptedByFn[k];
  Object.assign(scriptedByFn, map);
}

beforeEach(() => {
  sink.value = null;
  for (const k of Object.keys(scriptedByFn)) delete scriptedByFn[k];
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

describe('useAllowlistGate — (i) no allowlist → passthrough', () => {
  it('returns passthrough when game.allowlist() == ZERO_ADDRESS', () => {
    script({
      allowlist: { data: ZERO_ADDRESS },
    });
    render(<Probe gameAddress={GAME} player={PLAYER} chainId={10143} />);
    expect(sink.value?.status).toBe('passthrough');
    expect(sink.value?.reason).toBe('no-allowlist');
    expect(sink.value?.allowlistAddress).toBeNull();
  });

  it('testnet posture: deployment with allowlist=0x0 → always passthrough', () => {
    // Mirrors `contracts/casino/deployments/10143.json` — `allowlist`
    // field is zero, so the on-chain `game.allowlist()` returns 0x0
    // regardless of the deployment JSON's `allowlistEnabled` flag.
    script({
      allowlist: { data: ZERO_ADDRESS },
      // These should NOT be consulted, but if they were they'd say
      // "blocked" — proving the short-circuit holds.
      allowlistEnabled: { data: true },
      isAllowed: { data: false },
    });
    render(<Probe gameAddress={GAME} player={PLAYER} chainId={10143} />);
    expect(sink.value?.status).toBe('passthrough');
    expect(sink.value?.reason).toBe('no-allowlist');
  });
});

describe('useAllowlistGate — (ii) allowlist disabled → passthrough', () => {
  it('returns passthrough when allowlist.allowlistEnabled() == false', () => {
    script({
      allowlist: { data: ALLOWLIST },
      allowlistEnabled: { data: false },
      // isAllowed would block, but enabled=false must short-circuit.
      isAllowed: { data: false },
    });
    render(<Probe gameAddress={GAME} player={PLAYER} chainId={143} />);
    expect(sink.value?.status).toBe('passthrough');
    expect(sink.value?.reason).toBe('disabled');
    expect(sink.value?.allowlistAddress?.toLowerCase()).toBe(
      ALLOWLIST.toLowerCase(),
    );
  });
});

describe('useAllowlistGate — (iii) enabled + denied → blocked', () => {
  it('returns blocked when allowlist enabled and player not on list', () => {
    script({
      allowlist: { data: ALLOWLIST },
      allowlistEnabled: { data: true },
      isAllowed: { data: false },
    });
    render(<Probe gameAddress={GAME} player={PLAYER} chainId={143} />);
    expect(sink.value?.status).toBe('blocked');
    expect(sink.value?.reason).toBe('denied');
    expect(sink.value?.allowlistAddress?.toLowerCase()).toBe(
      ALLOWLIST.toLowerCase(),
    );
  });
});

describe('useAllowlistGate — (iv) enabled + allowed → passthrough', () => {
  it('returns passthrough when allowlist enabled and player allowed', () => {
    script({
      allowlist: { data: ALLOWLIST },
      allowlistEnabled: { data: true },
      isAllowed: { data: true },
    });
    render(<Probe gameAddress={GAME} player={PLAYER} chainId={143} />);
    expect(sink.value?.status).toBe('passthrough');
    expect(sink.value?.reason).toBe('allowed');
    expect(sink.value?.allowlistAddress?.toLowerCase()).toBe(
      ALLOWLIST.toLowerCase(),
    );
  });
});

describe('useAllowlistGate — loading + disabled-hook semantics', () => {
  it('returns loading while game.allowlist() is unresolved', () => {
    script({
      allowlist: { isLoading: true, data: undefined },
    });
    render(<Probe gameAddress={GAME} player={PLAYER} chainId={143} />);
    expect(sink.value?.status).toBe('loading');
  });

  it('returns passthrough when the hook is explicitly disabled', () => {
    // No scripted reads — `enabled:false` must short-circuit BEFORE any
    // chain read happens.
    render(
      <Probe
        gameAddress={GAME}
        player={PLAYER}
        chainId={143}
        enabled={false}
      />,
    );
    expect(sink.value?.status).toBe('passthrough');
    expect(sink.value?.reason).toBe('no-allowlist');
  });

  it('returns loading when the game address is undefined', () => {
    render(<Probe player={PLAYER} chainId={143} />);
    expect(sink.value?.status).toBe('loading');
  });
});
