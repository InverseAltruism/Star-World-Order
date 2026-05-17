// Playwright spec — SWO Cosmic Casino coinflip wallet-mock flow.
//
// Acceptance (c) for SWO_CASINO_COINFLIP_UI: a wallet-mock spec places a
// bet → settles → UI shows `Won` / `Lost`. The spec gates on a mock
// wallet harness exposed by the dev server. Until the harness lands,
// the workflow (`.github/workflows/casino-e2e.yml`) skips because no
// `playwright.config.ts` is committed, so this spec ships as the
// contract description the harness must satisfy.
//
// Companion to `app/casino/coinflip/__tests__/CoinflipPanel.test.tsx`
// (unit-level proof of the same UI surface).
//
// Expectations on the live page (`/casino/coinflip`):
//   - The page renders with `data-testid="coinflip-page"`.
//   - When disconnected, the primary CTA shows "Connect wallet".
//   - When connected to a non-Monad chain, the chain-gate banner
//     surfaces with `data-testid="coinflip-chain-gate"`.
//   - When connected to Monad, heads/tails toggle works and the
//     primary CTA shows "Flip for <stake> MON".
//   - After the mock wallet settles a bet on the user's side, the
//     `coinflip-outcome-won` banner appears (and `-lost` on a miss).
//
// The wallet-mock harness is expected to expose:
//   • window.__SWO_MOCK_WALLET__.connect()
//   • window.__SWO_MOCK_WALLET__.switchChain(chainId)
//   • window.__SWO_MOCK_WALLET__.settleCoinflip({ side, payoutEth })
// These hooks are the SWO mirror of BB's e2e wallet bridge. The Playwright
// runner threads them in via page.evaluate() so the page never needs to
// know it's running against a mock.

import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __SWO_MOCK_WALLET__?: {
      connect: () => void;
      switchChain: (chainId: number) => void;
      settleCoinflip: (args: { side: 'heads' | 'tails'; payoutEth?: string }) => void;
    };
  }
}

test.describe('Coinflip (casino) wallet-mock flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/casino/coinflip');
  });

  test('renders the coinflip page surface', async ({ page }) => {
    await expect(page.getByTestId('coinflip-page')).toBeVisible();
    await expect(page.getByTestId('coinflip-bet-panel')).toBeVisible();
    await expect(page.getByTestId('coinflip-side-selector')).toBeVisible();
    await expect(page.getByTestId('coinflip-fairness-proof')).toBeVisible();
  });

  test('disconnected user sees the Connect wallet CTA', async ({ page }) => {
    const cta = page.getByTestId('coinflip-primary-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toHaveText('Connect wallet');
  });

  test('heads/tails toggle updates aria-pressed', async ({ page }) => {
    const heads = page.getByTestId('coinflip-side-heads');
    const tails = page.getByTestId('coinflip-side-tails');
    await expect(heads).toHaveAttribute('aria-pressed', 'true');
    await expect(tails).toHaveAttribute('aria-pressed', 'false');
    await tails.click();
    await expect(tails).toHaveAttribute('aria-pressed', 'true');
    await expect(heads).toHaveAttribute('aria-pressed', 'false');
  });

  test('chain-gate surfaces for non-Monad chains', async ({ page }) => {
    // Drive the mock wallet to connect on a non-Monad chain (e.g. 1)
    // — the chain-gate banner must appear with the Monad chain name.
    await page.evaluate(() => {
      window.__SWO_MOCK_WALLET__?.connect();
      window.__SWO_MOCK_WALLET__?.switchChain(1);
    });
    await expect(page.getByTestId('coinflip-chain-gate')).toBeVisible();
    await expect(page.getByTestId('coinflip-primary-cta')).toContainText(
      /Switch to/,
    );
  });

  test('place bet → mock settles win → Won banner shows', async ({ page }) => {
    // Connect on Monad, pick heads, place bet, mock the settle event
    // for heads → the Won banner with payout must render.
    await page.evaluate(() => {
      window.__SWO_MOCK_WALLET__?.connect();
      window.__SWO_MOCK_WALLET__?.switchChain(10143);
    });

    const heads = page.getByTestId('coinflip-side-heads');
    await heads.click();

    const cta = page.getByTestId('coinflip-primary-cta');
    await expect(cta).toContainText(/Flip for/);
    await cta.click();

    // Drive the mock wallet's BetSettled callback for the same side.
    await page.evaluate(() => {
      window.__SWO_MOCK_WALLET__?.settleCoinflip({
        side: 'heads',
        payoutEth: '0.0198',
      });
    });

    await expect(page.getByTestId('coinflip-outcome-won')).toBeVisible();
    await expect(page.getByTestId('coinflip-outcome-won')).toContainText(
      /Won/,
    );
  });

  test('place bet → mock settles loss → Lost banner shows', async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.__SWO_MOCK_WALLET__?.connect();
      window.__SWO_MOCK_WALLET__?.switchChain(10143);
    });

    await page.getByTestId('coinflip-side-heads').click();
    await page.getByTestId('coinflip-primary-cta').click();

    // Settle on tails — the user picked heads, so this is a loss.
    await page.evaluate(() => {
      window.__SWO_MOCK_WALLET__?.settleCoinflip({ side: 'tails' });
    });

    await expect(page.getByTestId('coinflip-outcome-lost')).toBeVisible();
    await expect(page.getByTestId('coinflip-outcome-lost')).toContainText(
      /Lost/,
    );
    await expect(page.getByTestId('coinflip-outcome-won')).toHaveCount(0);
  });
});
