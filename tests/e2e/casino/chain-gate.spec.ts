// Playwright spec — SWO Cosmic Casino ChainGate.
//
// Acceptance (c) for SWO_CASINO_UI_CHAIN_GATE:
//   • Clicking the "Switch to Monad …" CTA invokes
//     `window.ethereum.request({ method: 'wallet_switchEthereumChain' })`
//     exactly once with the hex-encoded target chain ID.
//
// Companion to `components/casino/__tests__/ChainGate.test.tsx`, which
// runs the same contract under happy-dom in unit tests. This file is
// the browser-level proof that the cosmic-casino lobby (or any other
// host route that mounts ChainGate) wires the CTA to the EIP-1193 RPC
// method by name. The `casino-e2e.yml` workflow gates on this spec
// once `playwright.config.ts` lands; until then the workflow no-ops
// (see the pre-flight step in `.github/workflows/casino-e2e.yml`).
//
// Test fixture contract:
//   - A page that mounts a ChainGate in the wrong-chain state and
//     exposes the switch CTA at `data-testid="swo-chain-gate-switch-button"`.
//   - We inject a stubbed `window.ethereum.request` via addInitScript
//     before navigation so the very first render in wrong-chain state
//     can still observe the call when the user clicks the CTA.

import { expect, test } from '@playwright/test';

test.describe('ChainGate (casino) wallet_switchEthereumChain contract', () => {
  test.beforeEach(async ({ page }) => {
    // Install a synthetic EIP-1193 provider that records every RPC
    // call. We expose it on window so the test can read it back via
    // page.evaluate. The provider also reports a non-Monad chain ID
    // so the ChainGate renders its wrong-chain branch on mount.
    await page.addInitScript(() => {
      type Call = { method: string; params?: unknown[] };
      const calls: Call[] = [];
      const ethereum = {
        isMetaMask: true,
        // ChainGate inspects wagmi.useChainId(), not eth_chainId directly.
        // We still respond to eth_chainId so any code path that does
        // call into the provider gets a sensible answer.
        request: async ({ method, params }: Call) => {
          calls.push({ method, params });
          if (method === 'eth_chainId') return '0x1';
          if (method === 'eth_accounts') return [];
          return null;
        },
        on: () => {},
        removeListener: () => {},
      };
      (window as unknown as { ethereum: typeof ethereum }).ethereum = ethereum;
      (window as unknown as { __ethereumCalls: Call[] }).__ethereumCalls = calls;
    });

    // Casino lobby is the host where the chain gate is most likely to
    // mount in production. The page must render ChainGate in a
    // wrong-chain state — wagmi inside the casino host derives its
    // chain ID from `window.ethereum`, which we pinned to 0x1 above.
    await page.goto('/casino');
  });

  test('clicking Switch fires wallet_switchEthereumChain exactly once', async ({
    page,
  }) => {
    const cta = page.getByTestId('swo-chain-gate-switch-button');
    await expect(cta).toBeVisible();

    await cta.click();

    // Read the recorded RPC calls and assert exactly one
    // wallet_switchEthereumChain invocation with a hex chain ID.
    const switchCalls = await page.evaluate(() => {
      const all = (
        window as unknown as { __ethereumCalls?: { method: string; params?: unknown[] }[] }
      ).__ethereumCalls ?? [];
      return all.filter((c) => c.method === 'wallet_switchEthereumChain');
    });

    expect(switchCalls).toHaveLength(1);
    expect(switchCalls[0].method).toBe('wallet_switchEthereumChain');
    // The CTA encodes the target chain ID as a 0x-prefixed lowercase
    // hex string. Mainnet (143) → 0x8f, testnet (10143) → 0x279f.
    const params = switchCalls[0].params as [{ chainId: string }];
    expect(params).toHaveLength(1);
    expect(params[0].chainId).toMatch(/^0x(8f|279f)$/);
  });

  test('bet buttons inside the gate are disabled until the user switches', async ({
    page,
  }) => {
    // Sanity: any descendant <button> inside the gate's fieldset must
    // report disabled=true. This pins the "block bet buttons via
    // disabled + aria-disabled" half of the acceptance contract at the
    // browser level, complementing the unit test that proves the same
    // shape under happy-dom.
    const fieldset = page.getByTestId('swo-chain-gate-disabled-children');
    await expect(fieldset).toBeVisible();
    const ariaDisabled = await fieldset.getAttribute('aria-disabled');
    expect(ariaDisabled).toBe('true');

    const bettingButtons = fieldset.locator('button');
    const count = await bettingButtons.count();
    for (let i = 0; i < count; i += 1) {
      const btn = bettingButtons.nth(i);
      await expect(btn).toBeDisabled();
    }
  });
});
