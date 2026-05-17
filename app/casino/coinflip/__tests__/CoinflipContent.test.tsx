// @vitest-environment happy-dom
//
// CoinflipContent — acceptance coverage for SWO_CASINO_COINFLIP_UI:
//
//   (a) Page exists & renders (smoke).
//   (b) CTAs wire to props:
//         • side selector toggles aria-pressed
//         • stake input updates value
//         • Flip CTA calls writeContract({functionName:'placeBet',...})
//   (c) Chain gate fires when wagmi reports chain ≠ 10143/143.
//
// We mock `wagmi` at the module level so the component renders without a
// WagmiProvider tree. The casino addresses module is mocked so the page
// always sees a deployed CosmicFlip address (independent of the
// committed deployment JSON).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const mockHooks = {
  useAccount: vi.fn(),
  useChainId: vi.fn(),
  useSwitchChain: vi.fn(),
  useWriteContract: vi.fn(),
  useWatchContractEvent: vi.fn(),
};

vi.mock('wagmi', () => ({
  useAccount: () => mockHooks.useAccount(),
  useChainId: () => mockHooks.useChainId(),
  useSwitchChain: () => mockHooks.useSwitchChain(),
  useWriteContract: () => mockHooks.useWriteContract(),
  useWatchContractEvent: (args: unknown) => mockHooks.useWatchContractEvent(args),
}));

const FAKE_COSMIC_FLIP_ADDR = '0x000000000000000000000000000000000000beef' as const;

vi.mock('@/lib/casino/addresses', () => ({
  getCasinoAddresses: (chainId: number) => {
    if (chainId !== 10143 && chainId !== 143) return null;
    return {
      chainId,
      bankroll: '0x0000000000000000000000000000000000000001',
      allowlist: '0x0000000000000000000000000000000000000002',
      allowlistEnabled: false,
      cosmicFlip: FAKE_COSMIC_FLIP_ADDR,
      gravityDice: '0x0000000000000000000000000000000000000003',
      constellationClimb: '0x0000000000000000000000000000000000000004',
      deployer: '0x0000000000000000000000000000000000000005',
      maxDrawdown24hWei: 0n,
    };
  },
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function disconnected() {
  mockHooks.useAccount.mockReturnValue({ address: undefined, isConnected: false });
  mockHooks.useChainId.mockReturnValue(0);
  mockHooks.useSwitchChain.mockReturnValue({ switchChain: vi.fn(), isPending: false });
  mockHooks.useWriteContract.mockReturnValue({
    writeContract: vi.fn(),
    data: undefined,
    isPending: false,
    error: null,
  });
  mockHooks.useWatchContractEvent.mockReturnValue(undefined);
}

function connected(chainId: number, overrides: { writeContract?: () => void } = {}) {
  mockHooks.useAccount.mockReturnValue({
    address: '0x000000000000000000000000000000000000c0de',
    isConnected: true,
  });
  mockHooks.useChainId.mockReturnValue(chainId);
  mockHooks.useSwitchChain.mockReturnValue({ switchChain: vi.fn(), isPending: false });
  mockHooks.useWriteContract.mockReturnValue({
    writeContract: overrides.writeContract ?? vi.fn(),
    data: undefined,
    isPending: false,
    error: null,
  });
  mockHooks.useWatchContractEvent.mockReturnValue(undefined);
}

async function renderContent() {
  // Import after mocks so the page picks up the stubbed wagmi/addresses.
  const { default: CoinflipContent } = await import('../CoinflipContent');
  await act(async () => {
    root.render(<CoinflipContent />);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  disconnected();
  vi.stubEnv('NEXT_PUBLIC_COSMIC_FLIP_COMMIT', '0x' + 'ab'.repeat(32));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          houseLiquidityEth: 0,
          edgeRealisedPct: 0,
          lastBetSecondsAgo: null,
          generatedAt: new Date().toISOString(),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ),
  );
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('<CoinflipContent> (SWO_CASINO_COINFLIP_UI)', () => {
  it('(a) renders the page surface and the multiplier badge', async () => {
    await renderContent();
    expect(container.querySelector('[data-testid="coinflip-page"]')).not.toBeNull();
    const badge = container.querySelector(
      '[data-testid="coinflip-multiplier-badge"]',
    );
    expect(badge?.textContent).toBe('1.98×');
  });

  it('(b1) side selector toggles aria-pressed between heads and tails', async () => {
    await renderContent();
    const heads = container.querySelector(
      '[data-testid="coinflip-side-heads"]',
    ) as HTMLButtonElement;
    const tails = container.querySelector(
      '[data-testid="coinflip-side-tails"]',
    ) as HTMLButtonElement;
    expect(heads.getAttribute('aria-pressed')).toBe('true');
    expect(tails.getAttribute('aria-pressed')).toBe('false');

    act(() => {
      tails.click();
    });

    expect(tails.getAttribute('aria-pressed')).toBe('true');
    expect(heads.getAttribute('aria-pressed')).toBe('false');
  });

  it('(b2) stake input is controlled and updates on change', async () => {
    await renderContent();
    const stakeInput = container.querySelector(
      '[data-testid="coinflip-stake-input"]',
    ) as HTMLInputElement;
    expect(stakeInput.value).toBe('0.01');

    act(() => {
      stakeInput.value = '0.05';
      stakeInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(stakeInput.value).toBe('0.05');
  });

  it('(b3) primary CTA wires the Flip click to writeContract(placeBet)', async () => {
    const writeContract = vi.fn();
    connected(10143, { writeContract });
    await renderContent();

    const cta = container.querySelector(
      '[data-testid="coinflip-primary-cta"]',
    ) as HTMLButtonElement;
    expect(cta).not.toBeNull();
    expect(cta.textContent).toMatch(/flip for 0\.01 mon/i);

    act(() => {
      cta.click();
    });

    expect(writeContract).toHaveBeenCalledTimes(1);
    const callArgs = writeContract.mock.calls[0][0];
    expect(callArgs.functionName).toBe('placeBet');
    expect(callArgs.address).toBe(FAKE_COSMIC_FLIP_ADDR);
    // args: [sideEnum, clientSeed, serverCommit]
    expect(callArgs.args.length).toBe(3);
    expect(callArgs.args[0]).toBe(0); // heads default → 0
    expect(callArgs.args[2]).toBe('0x' + 'ab'.repeat(32));
  });

  it('(c) chain gate fires when wagmi reports chain not in {10143, 143}', async () => {
    const switchChain = vi.fn();
    mockHooks.useAccount.mockReturnValue({
      address: '0x000000000000000000000000000000000000c0de',
      isConnected: true,
    });
    mockHooks.useChainId.mockReturnValue(1); // Ethereum mainnet
    mockHooks.useSwitchChain.mockReturnValue({ switchChain, isPending: false });
    mockHooks.useWriteContract.mockReturnValue({
      writeContract: vi.fn(),
      data: undefined,
      isPending: false,
      error: null,
    });
    mockHooks.useWatchContractEvent.mockReturnValue(undefined);

    await renderContent();

    const cta = container.querySelector(
      '[data-testid="coinflip-primary-cta"]',
    ) as HTMLButtonElement;
    expect(cta.textContent).toMatch(/switch to monad/i);

    act(() => {
      cta.click();
    });
    expect(switchChain).toHaveBeenCalledTimes(1);
    expect(switchChain.mock.calls[0][0]).toEqual({ chainId: 143 });
  });

  it('(c2) supported chain 10143 surfaces the Flip CTA, not the chain gate', async () => {
    connected(10143);
    await renderContent();
    const cta = container.querySelector(
      '[data-testid="coinflip-primary-cta"]',
    ) as HTMLButtonElement;
    expect(cta.textContent).not.toMatch(/switch to/i);
    expect(cta.textContent).toMatch(/flip/i);
  });

  it('renders the FairnessProof card under the bet panel', async () => {
    await renderContent();
    const card = container.querySelector(
      '[data-testid="coinflip-fairness-proof"]',
    );
    expect(card).not.toBeNull();
    const verifyLink = container.querySelector(
      '[data-testid="coinflip-verify-link"]',
    ) as HTMLAnchorElement;
    expect(verifyLink.getAttribute('href')).toBe('/verify');
  });
});
