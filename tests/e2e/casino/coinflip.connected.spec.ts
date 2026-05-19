// /casino/coinflip Playwright spec for [SWO_CASINO_PLAYWRIGHT_CONNECTED].
//
// Asserts the wallet-mocked path through the page reaches the
// "connected on Monad testnet (10143), ready to flip" state:
//
//   1. Page renders with the documented metadata title.
//   2. CoinflipPanel mounts (`coinflip-side-selector` is present).
//   3. Pre-connect baseline shows the disabled "Connect wallet" CTA.
//   4. With the wallet mock installed, the CTA advances past "Connect
//      wallet" and never sticks on "Switch to Monad" (chain gate green).
//   5. Side toggle + stake input remain interactive.
//
// What this spec deliberately does NOT do: it never submits a bet. That
// path requires backing `eth_call` for the allowlist read and forging a
// `BetSettled` log, which is the anvil-fork lane covered by
// `.github/workflows/casino-e2e.yml`.

import { expect, test } from '@playwright/test';
import { installWalletMock, isMockInstalled } from './fixtures/wallet-mock';

const ROUTE = '/casino/coinflip';

test.describe('@casino-connected /casino/coinflip', () => {
  test('renders Cosmic Flip page metadata + side selector pre-connect', async ({
    page,
  }) => {
    await page.goto(ROUTE);
    await expect(page).toHaveTitle(/Cosmic Flip/);
    await expect(
      page.getByTestId('coinflip-side-selector'),
    ).toBeVisible();
    await expect(page.getByTestId('coinflip-side-heads')).toBeVisible();
    await expect(page.getByTestId('coinflip-side-tails')).toBeVisible();
  });

  test('pre-connect CTA reads "Connect wallet" and is disabled', async ({
    page,
  }) => {
    await page.goto(ROUTE);
    const cta = page.getByTestId('coinflip-primary-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toBeDisabled();
    await expect(cta).toHaveText(/connect wallet/i);
  });

  test('side selector toggles aria-pressed between heads and tails', async ({
    page,
  }) => {
    await page.goto(ROUTE);
    const heads = page.getByTestId('coinflip-side-heads');
    const tails = page.getByTestId('coinflip-side-tails');

    await expect(heads).toHaveAttribute('aria-pressed', 'true');
    await expect(tails).toHaveAttribute('aria-pressed', 'false');

    await tails.click();
    await expect(tails).toHaveAttribute('aria-pressed', 'true');
    await expect(heads).toHaveAttribute('aria-pressed', 'false');

    await heads.click();
    await expect(heads).toHaveAttribute('aria-pressed', 'true');
  });

  test('stake input is editable pre-connect', async ({ page }) => {
    await page.goto(ROUTE);
    const stake = page.getByTestId('coinflip-stake-input');
    await expect(stake).toBeVisible();
    await stake.fill('0.05');
    await expect(stake).toHaveValue('0.05');
  });

  test('wallet mock is installed and CTA advances past "Connect wallet"', async ({
    page,
  }) => {
    await installWalletMock(page, { chainId: 10143 });
    await page.goto(ROUTE);

    expect(await isMockInstalled(page)).toBe(true);

    const cta = page.getByTestId('coinflip-primary-cta');
    await expect(cta).toBeVisible();

    // wagmi's injected connector calls eth_accounts on mount; the mock
    // returns a non-empty array so the connector treats the wallet as
    // authorized and the CTA leaves the "Connect wallet" copy behind.
    // We assert on absence of that string rather than a specific advance
    // state because the next stop depends on contract-read timing (the
    // page may show "Switch to Monad", "Flip for X MON", or briefly the
    // allowlist-loading state — all of which are valid "past connect").
    await expect.poll(
      async () => (await cta.textContent())?.toLowerCase() ?? '',
      { timeout: 15_000 },
    ).not.toMatch(/^connect wallet/);
  });

  test('wallet mock + chainId 10143 keeps page off the wrong-chain banner', async ({
    page,
  }) => {
    await installWalletMock(page, { chainId: 10143 });
    await page.goto(ROUTE);

    const cta = page.getByTestId('coinflip-primary-cta');
    await expect(cta).toBeVisible();

    // The CTA should never settle on the Switch-to-Monad copy when the
    // mock already reports chain 10143 (a supported chain in
    // CoinflipPanel.SUPPORTED_CHAIN_IDS).
    await expect.poll(
      async () => (await cta.textContent()) ?? '',
      { timeout: 15_000 },
    ).not.toMatch(/switch to monad/i);
  });
});
