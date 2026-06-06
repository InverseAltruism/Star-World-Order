// /casino/dice Playwright spec for [SWO_CASINO_PLAYWRIGHT_CONNECTED].
//
// Mirrors `coinflip.connected.spec.ts` over the Gravity Dice surface:
// pre-connect baseline, rollUnder slider interaction, stake input, and
// the wallet-mocked happy path that places a min-stake bet, injects a
// synthetic `BetSettled` log via the HTTP JSON-RPC interceptor, and
// asserts the UI flips to Won / Lost.

import { expect, test } from '@playwright/test';
import {
  installRpcRoute,
  installWalletMock,
  makeBetSettledLog,
} from './fixtures/wallet-mock';

const ROUTE = '/casino/dice';
const PLAYER: `0x${string}` = '0x1111111111111111111111111111111111111111';
const GRAVITY_DICE_ADDRESS: `0x${string}` =
  '0xAC023542A8168465EE4A1b3e8Ae0f58F36A6d84B';

test.describe('@casino-connected /casino/dice', () => {
  test('renders Gravity Dice page metadata + rollUnder slider', async ({
    page,
  }) => {
    await page.goto(ROUTE);
    await expect(page).toHaveTitle(/Gravity Dice/);
    await expect(page.getByTestId('dice-rollunder-slider')).toBeVisible();
    await expect(page.getByTestId('dice-rollunder-value')).toBeVisible();
    await expect(page.getByTestId('dice-winprob')).toBeVisible();
    await expect(page.getByTestId('dice-multiplier-preview')).toBeVisible();
  });

  test('pre-connect CTA reads "Connect wallet" and is disabled', async ({
    page,
  }) => {
    await page.goto(ROUTE);
    const cta = page.getByTestId('dice-primary-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toBeDisabled();
    await expect(cta).toHaveText(/connect wallet/i);
  });

  test('rollUnder slider clamps inside the [2..98] band', async ({ page }) => {
    await page.goto(ROUTE);
    const slider = page.getByTestId('dice-rollunder-slider');
    await expect(slider).toHaveAttribute('min', '2');
    await expect(slider).toHaveAttribute('max', '98');

    await slider.fill('50');
    await expect(page.getByTestId('dice-rollunder-value')).toHaveText('50');

    await slider.fill('98');
    await expect(page.getByTestId('dice-rollunder-value')).toHaveText('98');
  });

  test('stake input is editable pre-connect', async ({ page }) => {
    await page.goto(ROUTE);
    const stake = page.getByTestId('dice-stake-input');
    await expect(stake).toBeVisible();
    await stake.fill('0.02');
    await expect(stake).toHaveValue('0.02');
  });

  test('wallet mock advances CTA past "Connect wallet" on chain 10143', async ({
    page,
  }) => {
    await installWalletMock(page, { chainId: 10143 });
    await installRpcRoute(page, { chainId: 10143 });
    await page.goto(ROUTE);

    const cta = page.getByTestId('dice-primary-cta');
    await expect(cta).toBeVisible();

    await expect.poll(
      async () => (await cta.textContent())?.toLowerCase() ?? '',
      { timeout: 15_000 },
    ).not.toMatch(/^connect wallet/);

    await expect.poll(
      async () => (await cta.textContent()) ?? '',
      { timeout: 15_000 },
    ).not.toMatch(/switch to monad/i);
  });

  // Acceptance (b) for [SWO_CASINO_PLAYWRIGHT_CONNECTED]: place a min-stake
  // bet, inject a winning `BetSettled` log, and assert the UI flips to Won.
  test('min-stake bet → injected BetSettled log → UI flips to Won', async ({
    page,
  }) => {
    await installWalletMock(page, { chainId: 10143 });
    const rpc = await installRpcRoute(page, { chainId: 10143 });
    await page.goto(ROUTE);

    const cta = page.getByTestId('dice-primary-cta');
    await expect.poll(
      async () => (await cta.textContent())?.toLowerCase() ?? '',
      { timeout: 15_000 },
    ).toMatch(/^roll for /);

    await page.getByTestId('dice-stake-input').fill('0.001');
    await cta.click();

    await expect(page.getByTestId('dice-tx-receipt')).toBeVisible({
      timeout: 15_000,
    });

    rpc.pushLog(
      makeBetSettledLog({
        contractAddress: GRAVITY_DICE_ADDRESS,
        player: PLAYER,
        betId: 1n,
        outcome: 17, // roll value — < rollUnder=50 default → won
        won: true,
      }),
    );

    await expect(page.getByTestId('dice-outcome-won')).toBeVisible({
      timeout: 30_000,
    });
  });

  test('min-stake bet → injected losing BetSettled log → UI flips to Lost', async ({
    page,
  }) => {
    await installWalletMock(page, { chainId: 10143 });
    const rpc = await installRpcRoute(page, { chainId: 10143 });
    await page.goto(ROUTE);

    const cta = page.getByTestId('dice-primary-cta');
    await expect.poll(
      async () => (await cta.textContent())?.toLowerCase() ?? '',
      { timeout: 15_000 },
    ).toMatch(/^roll for /);

    await page.getByTestId('dice-stake-input').fill('0.001');
    await cta.click();
    await expect(page.getByTestId('dice-tx-receipt')).toBeVisible({
      timeout: 15_000,
    });

    rpc.pushLog(
      makeBetSettledLog({
        contractAddress: GRAVITY_DICE_ADDRESS,
        player: PLAYER,
        betId: 2n,
        outcome: 80, // roll value above rollUnder=50 default
        won: false,
      }),
    );

    await expect(page.getByTestId('dice-outcome-lost')).toBeVisible({
      timeout: 30_000,
    });
  });
});
