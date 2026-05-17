// Playwright spec — SWO Cosmic Casino WalletSheet keyboard contract.
//
// Acceptance (b) for SWO_CASINO_COMPONENT_WALLET_SHEET:
//   • Tab cycles within the sheet (last → first; Shift+Tab first → last)
//   • Esc closes the sheet and returns focus to the opener button
//   • Close button + identity rows carry `swo-casino-hit-44`
//
// Companion to `components/casino/__tests__/WalletSheet.test.tsx`, which
// runs the same contract under happy-dom in unit tests. This file is the
// browser-level proof so the casino-e2e workflow (`.github/workflows/
// casino-e2e.yml`) can gate the focus-trap behaviour against a real
// rendering engine once `playwright.config.ts` lands (the workflow
// currently skips when no config is present).
//
// Expectations on the live page (`/casino/wallet` or similar host):
//   - A button with `data-testid="wallet-trigger"` opens the sheet.
//   - The sheet exposes `data-testid="wallet-sheet"`,
//     `data-testid="wallet-close"`, and identity-row `data-testid`s
//     (`wallet-address`, `wallet-balance`, …).

import { expect, test } from '@playwright/test';

test.describe('WalletSheet (casino) keyboard contract', () => {
  test.beforeEach(async ({ page }) => {
    // Page that mounts the WalletSheet via a `wallet-trigger` button.
    // Adjust path when the SWO casino lobby exposes the sheet at a
    // different route.
    await page.goto('/casino');
  });

  test('Tab cycles within the sheet and never escapes', async ({ page }) => {
    const trigger = page.getByTestId('wallet-trigger');
    await trigger.focus();
    await trigger.press('Enter');

    const sheet = page.getByTestId('wallet-sheet');
    await expect(sheet).toBeVisible();

    const close = page.getByTestId('wallet-close');
    await close.focus();
    // Tab from the close button (last focusable inside <aside>) should
    // wrap back to the first focusable, not escape into the page.
    await page.keyboard.press('Tab');
    const stillInsideAfterTab = await sheet.evaluate(
      (el) => el.contains(document.activeElement),
    );
    expect(stillInsideAfterTab).toBe(true);

    // Shift+Tab from the first focusable should land back on the last.
    await page.keyboard.press('Shift+Tab');
    const stillInsideAfterShiftTab = await sheet.evaluate(
      (el) => el.contains(document.activeElement),
    );
    expect(stillInsideAfterShiftTab).toBe(true);
  });

  test('Esc closes the sheet and returns focus to the opener', async ({ page }) => {
    const trigger = page.getByTestId('wallet-trigger');
    await trigger.focus();
    await trigger.press('Enter');

    await expect(page.getByTestId('wallet-sheet')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('wallet-sheet')).toHaveCount(0);
    const triggerIsFocused = await trigger.evaluate(
      (el) => document.activeElement === el,
    );
    expect(triggerIsFocused).toBe(true);
  });

  test('close button and identity rows carry swo-casino-hit-44', async ({ page }) => {
    const trigger = page.getByTestId('wallet-trigger');
    await trigger.focus();
    await trigger.press('Enter');

    await expect(page.getByTestId('wallet-sheet')).toBeVisible();

    for (const id of ['wallet-close', 'wallet-address']) {
      await expect(page.getByTestId(id)).toHaveClass(/swo-casino-hit-44/);
    }
  });
});
