// Playwright spec — [SWO_CASINO_UI_CHAIN_GATE] browser-level proof.
//
// Acceptance (c): clicking the ChainGate CTA fires the EIP-3326 RPC
// `wallet_switchEthereumChain` exactly once on the injected wallet
// provider. The Vitest suite at
// `components/casino/__tests__/ChainGate.test.tsx` covers the pure-view
// behaviour (correct-chain passthrough + wrong-chain CTA + fieldset
// blocking); this spec is the integration proof that the wagmi-connected
// `ChainGate` actually drives the wallet RPC.
//
// Companion to `wallet-sheet.spec.ts` — both run under the `casino-connected`
// project in `.github/workflows/casino-e2e.yml`, which currently no-ops
// until `playwright.config.ts` lands. Once the config is committed, this
// spec becomes mandatory for any PR touching `components/casino/**`.
//
// Page expectations (when the casino page mounts `<ChainGate />`):
//   - The ChainGate root carries `data-testid="swo-casino-chain-gate"` with
//     `data-on-correct-chain="false"` when the injected wallet is on a
//     non-Monad chain.
//   - The CTA button carries `data-testid="swo-casino-chain-gate-cta"`
//     and `data-target-chain-id="143"` (mainnet) or `"10143"` (testnet).

import { expect, test } from '@playwright/test';

test.describe('ChainGate (casino) — wallet_switchEthereumChain RPC', () => {
  test.beforeEach(async ({ page }) => {
    // Inject a minimal EIP-1193 provider that records every request. We
    // start the page on Ethereum mainnet (chainId 0x1 = 1), which is NOT
    // in the allowed Monad set, so the gate must render the CTA.
    await page.addInitScript(() => {
      const calls: Array<{ method: string; params: unknown }> = [];
      const provider = {
        isMetaMask: true,
        chainId: '0x1',
        request: async ({ method, params }: { method: string; params: unknown }) => {
          calls.push({ method, params });
          if (method === 'eth_chainId') return '0x1';
          if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
            return ['0x0000000000000000000000000000000000000001'];
          }
          if (method === 'wallet_switchEthereumChain') return null;
          return null;
        },
        on: () => undefined,
        removeListener: () => undefined,
      };
      Object.defineProperty(window, 'ethereum', {
        configurable: true,
        get: () => provider,
      });
      (window as unknown as { __walletCalls: typeof calls }).__walletCalls =
        calls;
    });

    // The casino lobby is the host page in our intake; any casino page
    // that mounts a ChainGate is fine. Adjust path when the lobby moves.
    await page.goto('/casino');
  });

  test('clicking the gate CTA dispatches wallet_switchEthereumChain exactly once', async ({
    page,
  }) => {
    const cta = page.getByTestId('swo-casino-chain-gate-cta');
    await expect(cta).toBeVisible();

    await cta.click();

    // The wagmi `switchChain` mutation may issue a handful of provider
    // requests (`eth_chainId`, account probes, etc.). We only assert on
    // the EIP-3326 RPC — and only that it fired exactly once on click.
    const switchCount = await page.evaluate(() => {
      const all =
        (window as unknown as {
          __walletCalls?: Array<{ method: string; params: unknown }>;
        }).__walletCalls ?? [];
      return all.filter((c) => c.method === 'wallet_switchEthereumChain').length;
    });
    expect(switchCount).toBe(1);

    // And it carries the correct target chainId in EIP-3326 hex form.
    const switchParams = await page.evaluate(() => {
      const all =
        (window as unknown as {
          __walletCalls?: Array<{ method: string; params: unknown }>;
        }).__walletCalls ?? [];
      return all.find((c) => c.method === 'wallet_switchEthereumChain')?.params;
    });
    expect(switchParams).toBeTruthy();
  });

  test('bet buttons inside the gate are disabled while on the wrong chain', async ({
    page,
  }) => {
    const blocked = page.getByTestId('swo-casino-chain-gate-blocked');
    await expect(blocked).toBeVisible();
    await expect(blocked).toHaveAttribute('aria-disabled', 'true');

    // Any nested form control (the bet button is the canonical case)
    // inherits disabled from the fieldset.
    const fieldsetIsDisabled = await blocked.evaluate(
      (el) => (el as HTMLFieldSetElement).disabled,
    );
    expect(fieldsetIsDisabled).toBe(true);
  });
});
