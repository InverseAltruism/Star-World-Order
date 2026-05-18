// Playwright spec — SWO Cosmic Casino ChainGate browser contract.
//
// Acceptance (c) for [SWO_CASINO_UI_CHAIN_GATE]:
//   • When the wallet reports an unsupported chain (anything outside
//     Monad mainnet 143 / testnet 10143), the gate renders the
//     "Switch to Monad …" CTA and bet buttons stay disabled.
//   • Clicking the CTA fires `wallet_switchEthereumChain` exactly once
//     with the target chain id (hex-encoded) as its `chainId` param.
//
// Companion to `components/casino/__tests__/ChainGate.test.tsx`, which
// runs the same contract under happy-dom in unit tests. This file is
// the browser-level proof so the casino-e2e workflow
// (`.github/workflows/casino-e2e.yml`) can gate the wallet-switch
// behaviour against a real rendering engine once `playwright.config.ts`
// lands (the workflow currently skips when no config is present).
//
// Expectations on the live page (`/casino` or any page that mounts
// the gate):
//   - `<ChainGate>` is mounted around the bet panel.
//   - The CTA exposes `data-testid="swo-chain-gate-switch"`.
//   - The wallet-switch is dispatched via the EIP-1193 provider
//     installed at `window.ethereum` (the gate calls
//     `window.ethereum.request({ method: 'wallet_switchEthereumChain',
//                                 params: [{ chainId: <hex> }] })`).
//
// The spec stubs `window.ethereum` via `page.addInitScript` so we don't
// need a real wallet extension to exercise the contract.

import { expect, test } from '@playwright/test';

const ETH_MAINNET_HEX = '0x1';
const MONAD_MAINNET_HEX = '0x8f'; // 143

declare global {
  interface Window {
    __chainGateCalls?: Array<{ method: string; params?: unknown[] }>;
  }
}

test.describe('ChainGate (casino) wallet-switch contract', () => {
  test.beforeEach(async ({ page }) => {
    // Stub the EIP-1193 provider. The gate reads the chain via
    // `wagmi.useChainId()`, which under the hood asks the provider for
    // `eth_chainId`. We pin it to Ethereum mainnet so the gate renders
    // the "wrong chain" surface, and record every `request` call so
    // we can assert exactly-once switch dispatch.
    await page.addInitScript(({ wrongChainHex }) => {
      const calls: Array<{ method: string; params?: unknown[] }> = [];
      window.__chainGateCalls = calls;
      const ethereum = {
        isMetaMask: true,
        chainId: wrongChainHex,
        async request(args: { method: string; params?: unknown[] }) {
          calls.push({ method: args.method, params: args.params });
          switch (args.method) {
            case 'eth_chainId':
              return wrongChainHex;
            case 'wallet_switchEthereumChain':
              return null;
            case 'eth_accounts':
            case 'eth_requestAccounts':
              return [];
            default:
              return null;
          }
        },
        on() {
          /* noop */
        },
        removeListener() {
          /* noop */
        },
      };
      Object.defineProperty(window, 'ethereum', {
        configurable: true,
        value: ethereum,
      });
    }, { wrongChainHex: ETH_MAINNET_HEX });
  });

  test('renders the Switch to Monad CTA when on the wrong chain', async ({
    page,
  }) => {
    await page.goto('/casino');
    const cta = page.getByTestId('swo-chain-gate-switch');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveText(/Switch to Monad (mainnet|testnet)/);
  });

  test('clicking the CTA dispatches wallet_switchEthereumChain exactly once', async ({
    page,
  }) => {
    await page.goto('/casino');
    const cta = page.getByTestId('swo-chain-gate-switch');
    await expect(cta).toBeVisible();

    await cta.click();

    const switchCalls = await page.evaluate(
      () =>
        (window.__chainGateCalls ?? []).filter(
          (c) => c.method === 'wallet_switchEthereumChain',
        ),
    );
    expect(switchCalls).toHaveLength(1);

    // The params shape is `[{ chainId: '0x<hex>' }]` per EIP-3326.
    const param = (switchCalls[0]?.params?.[0] ?? {}) as { chainId?: string };
    expect(param.chainId).toMatch(/^0x[0-9a-f]+$/i);
    // The target must be one of Monad mainnet (0x8f / 143) or testnet
    // (0x279f / 10143). The default gate config targets mainnet.
    expect([MONAD_MAINNET_HEX, '0x279f']).toContain(
      (param.chainId ?? '').toLowerCase(),
    );
  });

  test('bet buttons inside the gate are disabled while on the wrong chain', async ({
    page,
  }) => {
    await page.goto('/casino');
    const fieldset = page.getByTestId('swo-chain-gate-fieldset');
    await expect(fieldset).toBeVisible();
    await expect(fieldset).toHaveAttribute('aria-disabled', 'true');
    // Native `disabled` attribute on the fieldset cascades to every
    // nested form control per the HTML form-disabled spec.
    const hasDisabled = await fieldset.evaluate(
      (el) => (el as HTMLFieldSetElement).hasAttribute('disabled'),
    );
    expect(hasDisabled).toBe(true);
  });
});
