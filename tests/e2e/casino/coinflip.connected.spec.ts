// /casino/coinflip Playwright spec for [SWO_CASINO_PLAYWRIGHT_CONNECTED].
//
// Two layers of coverage:
//
//   1. Pre-connect baseline: page metadata, side selector, stake input,
//      "Connect wallet" disabled CTA. Catches dumb regressions in the
//      pure presentational shell without needing the wallet mock.
//
//   2. Wallet-mocked happy path: install EIP-1193 mock + HTTP JSON-RPC
//      interceptor, place a min-stake bet, inject a synthetic `BetSettled`
//      log into the next `useWatchContractEvent` poll, then assert the
//      surface flips into the Won banner (`coinflip-outcome-won`). The
//      Lost variant is exercised by `outcome=false` injected against the
//      same surface in a paired spec.

import { expect, test } from '@playwright/test';
import {
  installRpcRoute,
  installWalletMock,
  isMockInstalled,
  makeBetSettledLog,
} from './fixtures/wallet-mock';

const ROUTE = '/casino/coinflip';
const PLAYER: `0x${string}` = '0x1111111111111111111111111111111111111111';
const COSMIC_FLIP_ADDRESS: `0x${string}` =
  '0x064b8bfc03b23D2b525deD9d3969090347A21983';

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
    await installRpcRoute(page, { chainId: 10143 });
    await page.goto(ROUTE);

    expect(await isMockInstalled(page)).toBe(true);

    const cta = page.getByTestId('coinflip-primary-cta');
    await expect(cta).toBeVisible();

    // wagmi's injected connector calls eth_accounts on mount; the mock
    // returns a non-empty array so the connector treats the wallet as
    // authorized and the CTA leaves the "Connect wallet" copy behind.
    await expect.poll(
      async () => (await cta.textContent())?.toLowerCase() ?? '',
      { timeout: 15_000 },
    ).not.toMatch(/^connect wallet/);
  });

  test('wallet mock + chainId 10143 keeps page off the wrong-chain banner', async ({
    page,
  }) => {
    await installWalletMock(page, { chainId: 10143 });
    await installRpcRoute(page, { chainId: 10143 });
    await page.goto(ROUTE);

    const cta = page.getByTestId('coinflip-primary-cta');
    await expect(cta).toBeVisible();

    await expect.poll(
      async () => (await cta.textContent()) ?? '',
      { timeout: 15_000 },
    ).not.toMatch(/switch to monad/i);
  });

  // Acceptance (b) for [SWO_CASINO_PLAYWRIGHT_CONNECTED]: place a min-stake
  // bet, inject a synthetic BetSettled log into the RPC poll, and assert
  // the UI flips to Won. The deterministic tx hash from the wallet mock
  // drives the receipt; the queued log drives `useWatchContractEvent`'s
  // onLogs callback, which calls setOutcome('won').
  test('min-stake bet → injected BetSettled log → UI flips to Won', async ({
    page,
  }) => {
    await installWalletMock(page, { chainId: 10143 });
    const rpc = await installRpcRoute(page, { chainId: 10143 });
    await page.goto(ROUTE);

    const cta = page.getByTestId('coinflip-primary-cta');
    await expect(cta).toBeVisible();

    // Wait for the gate to clear so the CTA reads "Flip for ...".
    await expect.poll(
      async () => (await cta.textContent())?.toLowerCase() ?? '',
      { timeout: 15_000 },
    ).toMatch(/^flip for /);

    // Min-stake bet.
    await page.getByTestId('coinflip-stake-input').fill('0.001');
    await cta.click();

    // Receipt surfaces from the deterministic tx hash.
    await expect(page.getByTestId('coinflip-tx-receipt')).toBeVisible({
      timeout: 15_000,
    });

    // Inject the won log. The first time `useWatchContractEvent` polls
    // after this queue mutation, the log is served and the surface flips
    // to the Won banner.
    rpc.pushLog(
      makeBetSettledLog({
        contractAddress: COSMIC_FLIP_ADDRESS,
        player: PLAYER,
        betId: 1n,
        outcome: 0,
        won: true,
      }),
    );

    await expect(page.getByTestId('coinflip-outcome-won')).toBeVisible({
      timeout: 30_000,
    });
  });

  test('min-stake bet → injected losing BetSettled log → UI flips to Lost', async ({
    page,
  }) => {
    await installWalletMock(page, { chainId: 10143 });
    const rpc = await installRpcRoute(page, { chainId: 10143 });
    await page.goto(ROUTE);

    const cta = page.getByTestId('coinflip-primary-cta');
    await expect.poll(
      async () => (await cta.textContent())?.toLowerCase() ?? '',
      { timeout: 15_000 },
    ).toMatch(/^flip for /);

    await page.getByTestId('coinflip-stake-input').fill('0.001');
    await cta.click();
    await expect(page.getByTestId('coinflip-tx-receipt')).toBeVisible({
      timeout: 15_000,
    });

    rpc.pushLog(
      makeBetSettledLog({
        contractAddress: COSMIC_FLIP_ADDRESS,
        player: PLAYER,
        betId: 2n,
        outcome: 1,
        won: false,
      }),
    );

    await expect(page.getByTestId('coinflip-outcome-lost')).toBeVisible({
      timeout: 30_000,
    });
  });
});
