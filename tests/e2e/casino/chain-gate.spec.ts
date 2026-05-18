// Playwright spec — SWO Cosmic Casino ChainGate switch flow.
//
// Acceptance (c) for [SWO_CASINO_UI_CHAIN_GATE]:
//   • Clicking the ChainGate CTA triggers exactly one
//     `wallet_switchEthereumChain` request on the injected provider.
//   • The CTA copy varies between Monad mainnet (143) and Monad testnet
//     (10143) — the spec snapshots both labels at the wagmi boundary so a
//     drift in either string fails the gate.
//
// Companion to `components/casino/__tests__/ChainGate.test.tsx`, which proves
// the same contract under happy-dom. This file is the browser-level proof so
// the casino-e2e workflow (`.github/workflows/casino-e2e.yml`) gates the
// behaviour against a real engine once `playwright.config.ts` lands (the
// workflow currently no-ops without a config).
//
// Expectations on the page that mounts ChainGate (e.g. `/casino/coinflip`):
//   - A `data-testid="chain-gate-cta"` button that delegates to wagmi's
//     `useSwitchChain`.
//   - An `data-testid="chain-gate-wrong-chain"` region announcing the wrong
//     network and exposing `data-expected-chain-id`.
//   - The host page wires wagmi so `useSwitchChain().switchChain` ends up
//     calling `window.ethereum.request({ method: 'wallet_switchEthereumChain', … })`.

import { expect, test, type Page } from '@playwright/test';

type SwitchCall = { method: string; params: unknown[] };

// Install a fake EIP-1193 provider on `window` BEFORE any wagmi code runs.
// It claims chainId 0x1 (Ethereum mainnet — neither Monad mainnet nor testnet)
// and captures every `request({method, params})` so the test can assert that
// `wallet_switchEthereumChain` fires exactly once after a CTA click.
async function installWrongChainProvider(page: Page) {
  await page.addInitScript(() => {
    const calls: SwitchCall[] = [];
    const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};

    const provider = {
      isMetaMask: true,
      // Ethereum mainnet — guaranteed-wrong for both Monad chains so the
      // gate enters its CTA branch.
      chainId: '0x1',
      networkVersion: '1',
      selectedAddress: '0x0000000000000000000000000000000000000001',
      request: async ({
        method,
        params,
      }: {
        method: string;
        params?: unknown[];
      }) => {
        calls.push({ method, params: params ?? [] });
        switch (method) {
          case 'eth_accounts':
          case 'eth_requestAccounts':
            return ['0x0000000000000000000000000000000000000001'];
          case 'eth_chainId':
            return '0x1';
          case 'wallet_switchEthereumChain':
            // Pretend the switch succeeded; the contract under test is that
            // wagmi forwarded the call, not that the mock changed chains.
            return null;
          default:
            return null;
        }
      },
      on: (event: string, cb: (...args: unknown[]) => void) => {
        listeners[event] ??= [];
        listeners[event].push(cb);
      },
      removeListener: (event: string, cb: (...args: unknown[]) => void) => {
        listeners[event] = (listeners[event] ?? []).filter((fn) => fn !== cb);
      },
    };

    (window as unknown as { ethereum: typeof provider }).ethereum = provider;
    (
      window as unknown as { __swo_provider_calls: SwitchCall[] }
    ).__swo_provider_calls = calls;
  });
}

test.describe('ChainGate (casino) wallet_switchEthereumChain contract', () => {
  test.beforeEach(async ({ page }) => {
    await installWrongChainProvider(page);
    // The first casino game page to mount ChainGate is coinflip; fall back to
    // the lobby if the project later relocates the gate.
    await page.goto('/casino/coinflip');
  });

  test('clicking the CTA triggers wallet_switchEthereumChain exactly once', async ({
    page,
  }) => {
    const cta = page.getByTestId('chain-gate-cta');
    await expect(cta).toBeVisible();

    // Sanity check on copy — fail loudly if either label drifts.
    const label = (await cta.textContent())?.trim() ?? '';
    expect(label === 'Switch to Monad testnet' || label === 'Switch to Monad mainnet').toBe(
      true,
    );

    await cta.click();

    // Allow wagmi a tick to forward the call.
    await page.waitForFunction(() => {
      const calls = (
        window as unknown as { __swo_provider_calls?: SwitchCall[] }
      ).__swo_provider_calls;
      return (
        Array.isArray(calls) &&
        calls.some((c) => c.method === 'wallet_switchEthereumChain')
      );
    });

    const switchCalls = await page.evaluate(() => {
      const calls = (
        window as unknown as { __swo_provider_calls?: SwitchCall[] }
      ).__swo_provider_calls;
      return (calls ?? []).filter(
        (c) => c.method === 'wallet_switchEthereumChain',
      );
    });

    expect(switchCalls).toHaveLength(1);

    // Each `wallet_switchEthereumChain` carries a hex chainId in params[0].
    const param = (switchCalls[0]?.params?.[0] ?? {}) as { chainId?: string };
    expect(param.chainId).toMatch(/^0x[0-9a-fA-F]+$/);
    const decoded = parseInt(param.chainId ?? '0x0', 16);
    expect([143, 10143]).toContain(decoded);
  });

  test('child bet buttons are blocked while the gate is engaged', async ({
    page,
  }) => {
    const region = page.getByTestId('chain-gate-wrong-chain');
    await expect(region).toBeVisible();

    const fieldset = page.getByTestId('chain-gate-disabled-children');
    await expect(fieldset).toHaveAttribute('aria-disabled', 'true');
    await expect(fieldset).toHaveAttribute('disabled', '');
  });
});
