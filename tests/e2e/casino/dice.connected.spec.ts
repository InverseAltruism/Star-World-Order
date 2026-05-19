// /casino/dice Playwright spec for [SWO_CASINO_PLAYWRIGHT_CONNECTED].
//
// Mirrors `coinflip.connected.spec.ts` over the Gravity Dice surface:
// pre-connect baseline, rollUnder slider interaction, stake input, and a
// wallet-mocked path that asserts the CTA advances past "Connect wallet"
// without sticking on the wrong-chain banner.

import { expect, test } from '@playwright/test';
import { installWalletMock } from './fixtures/wallet-mock';

const ROUTE = '/casino/dice';

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

    // The slider is a controlled input. Set via `fill` (Playwright maps
    // this to a value change event the React onChange handler picks up).
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
});
