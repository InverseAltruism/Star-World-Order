// Playwright spec — SWO Cosmic Casino /casino/coinflip place-bet → settles
// → Won/Lost flow.
//
// Acceptance (c) for SWO_CASINO_COINFLIP_UI:
//   • Page renders the heads/tails side picker, stake input, primary CTA.
//   • A mock wallet (window.__SWO_MOCK_WALLET__) places a bet → emits a
//     synthetic settle → the UI surfaces the Won or Lost banner.
//
// The casino-e2e workflow (`.github/workflows/casino-e2e.yml`) is the gate
// for this file. When `playwright.config.ts` lands and the wallet harness
// ships, this spec exercises both the page surface and the bet-settle path
// against a real rendering engine. Until then, it documents the contract.
//
// Wallet-mock contract (when `window.__SWO_MOCK_WALLET__` is present):
//   - `placeBet({side, stake})` resolves once the user-facing tx submits.
//   - `settle({won})` triggers a synthetic `BetSettled` log that flips the
//     surface to the Won/Lost banner via the page's coinflip-outcome-* testid.

import { expect, test } from '@playwright/test';

test.describe('Cosmic Flip — wallet-mock bet flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/casino/coinflip');
  });

  test('page exists and renders the bet shell', async ({ page }) => {
    await expect(page.getByTestId('coinflip-page')).toBeVisible();
    await expect(page.getByTestId('coinflip-side-selector')).toBeVisible();
    await expect(page.getByTestId('coinflip-side-heads')).toBeVisible();
    await expect(page.getByTestId('coinflip-side-tails')).toBeVisible();
    await expect(page.getByTestId('coinflip-stake-input')).toBeVisible();
    await expect(page.getByTestId('coinflip-primary-cta')).toBeVisible();
  });

  test('side picker toggles aria-pressed between heads and tails', async ({ page }) => {
    const heads = page.getByTestId('coinflip-side-heads');
    const tails = page.getByTestId('coinflip-side-tails');

    await expect(heads).toHaveAttribute('aria-pressed', 'true');
    await tails.click();
    await expect(tails).toHaveAttribute('aria-pressed', 'true');
    await expect(heads).toHaveAttribute('aria-pressed', 'false');
  });

  test('chain-gate banner surfaces when wallet reports chain ∉ {143, 10143}', async ({ page }) => {
    // Inject a wallet-mock that reports a wrong chain (e.g. mainnet Ethereum).
    await page.addInitScript(() => {
      (window as unknown as { __SWO_MOCK_WALLET__: unknown }).__SWO_MOCK_WALLET__ = {
        isConnected: true,
        chainId: 1,
      };
    });
    await page.reload();
    await expect(page.getByTestId('coinflip-chain-gate')).toBeVisible();
    await expect(page.getByTestId('coinflip-primary-cta')).toContainText(/Switch/i);
  });

  test('place-bet → settle (won) → Won banner appears', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __SWO_MOCK_WALLET__: unknown }).__SWO_MOCK_WALLET__ = {
        isConnected: true,
        chainId: 10143,
        address: '0x000000000000000000000000000000000000DEAD',
      };
    });
    await page.reload();

    await page.getByTestId('coinflip-side-heads').click();
    await page.getByTestId('coinflip-stake-input').fill('0.01');
    await page.getByTestId('coinflip-primary-cta').click();

    // The wallet-mock harness is expected to dispatch a settle event after
    // the writeContract promise resolves. Once the BetSettled subscription
    // fires, the page flips to the Won banner.
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('swo:coinflip-settle', { detail: { won: true } }),
      );
    });

    await expect(page.getByTestId('coinflip-outcome-won')).toBeVisible();
  });

  test('place-bet → settle (lost) → Lost banner appears', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __SWO_MOCK_WALLET__: unknown }).__SWO_MOCK_WALLET__ = {
        isConnected: true,
        chainId: 10143,
        address: '0x000000000000000000000000000000000000DEAD',
      };
    });
    await page.reload();

    await page.getByTestId('coinflip-side-tails').click();
    await page.getByTestId('coinflip-stake-input').fill('0.02');
    await page.getByTestId('coinflip-primary-cta').click();

    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('swo:coinflip-settle', { detail: { won: false } }),
      );
    });

    await expect(page.getByTestId('coinflip-outcome-lost')).toBeVisible();
  });
});
