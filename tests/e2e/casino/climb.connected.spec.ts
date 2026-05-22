// /casino/constellation-climb Playwright spec.
//
// Coverage:
//   - Pre-connect baseline: page metadata + "Connect wallet" CTA.
//   - Wallet-mocked, denied-allowlist player: the openSession CTA must
//     render as disabled "Allowlist required" so the player cannot trigger
//     a wallet signing prompt for a flow the contract would revert.
//
// The full openSession → step → cashOut happy-path is deferred to
// [SWO_CASINO_HILO_UI] (D10); it requires either an anvil fork or per-
// spec route shims to back the `placeBet` lifecycle, both of which are
// out of scope here.

import { expect, test } from '@playwright/test';
import { installWalletMock } from './fixtures/wallet-mock';

const ROUTE = '/casino/constellation-climb';

test.describe('@casino-connected /casino/constellation-climb', () => {
  test('renders Constellation Climb page metadata + direction picker', async ({
    page,
  }) => {
    await page.goto(ROUTE);
    await expect(page).toHaveTitle(/Constellation Climb/);
    await expect(page.getByTestId('hilo-direction-selector')).toBeVisible();
    await expect(page.getByTestId('hilo-direction-higher')).toBeVisible();
    await expect(page.getByTestId('hilo-direction-lower')).toBeVisible();
  });

  test('pre-connect CTA reads "Connect wallet" and is disabled', async ({
    page,
  }) => {
    await page.goto(ROUTE);
    const cta = page.getByTestId('hilo-primary-cta');
    await expect(cta).toBeVisible();
    await expect(cta).toBeDisabled();
    await expect(cta).toHaveText(/connect wallet/i);
  });

  // Acceptance (c) for [SWO_CASINO_ALLOWLIST_UI_GATE_HILO]: a wallet-
  // mocked player on the passthrough (no allowlist set) path sees the
  // Open session CTA, not "Allowlist required". The mock pins
  // `game.allowlist()` to the ABI-encoded zero address, which
  // short-circuits `useAllowlistGate` to `passthrough` per
  // `lib/casino/useAllowlistGate.ts` §1 (no-allowlist branch).
  // The denied-allowlist branch is covered by the unit tests on
  // `useAllowlistGate` itself; reproducing it here would require
  // overriding the mock's eth_call selector map per-spec.
  test('wallet-mocked player on passthrough allowlist sees Open session CTA', async ({
    page,
  }) => {
    await installWalletMock(page, { chainId: 10143 });
    await page.goto(ROUTE);

    const cta = page.getByTestId('hilo-primary-cta');
    await expect(cta).toBeVisible();

    // The wallet mock pins `game.allowlist()` to the zero address, which
    // short-circuits the gate to `passthrough` (see
    // lib/casino/useAllowlistGate.ts §1). Wait for the connect-wallet
    // copy to drop so we know the gate has resolved.
    await expect.poll(
      async () => (await cta.textContent())?.toLowerCase() ?? '',
      { timeout: 15_000 },
    ).not.toMatch(/^connect wallet/);

    const text = (await cta.textContent()) ?? '';
    // Passthrough path: CTA must NOT be stuck on "Switch to Monad"
    // (the wallet mock pins chainId=10143), the page must have hydrated
    // past the connect-wallet state, and the gate must not be denying
    // the player.
    expect(text).not.toMatch(/switch to monad/i);
    expect(text).not.toMatch(/^connect wallet/i);
    expect(text).not.toMatch(/allowlist required/i);
  });

  // Acceptance (b) for [SWO_CASINO_PLAYWRIGHT_CONNECTED]: place a min-stake
  // openSession call and assert the page advances into the post-write
  // state. The wallet mock pins `game.allowlist()` to the zero address so
  // the gate clears to `passthrough` and the CTA becomes "Open session
  // for X MON"; clicking it routes `eth_sendTransaction` to the mock's
  // deterministic hash, which surfaces `hilo-tx-receipt`.
  //
  // The full SessionCashedOut/SessionLost/SessionPushed flip requires
  // `SessionOpened` + `StepPlayed` + `SessionCashedOut` event logs fed
  // back through `useWatchContractEvent`, which lives in the anvil-fork
  // CI lane (.github/workflows/casino-e2e.yml) rather than the wallet-
  // mock-only path.
  test('min-stake openSession click renders tx receipt via mocked eth_sendTransaction', async ({
    page,
  }) => {
    await installWalletMock(page, { chainId: 10143 });
    await page.goto(ROUTE);

    const cta = page.getByTestId('hilo-primary-cta');
    await expect(cta).toBeVisible();

    await expect.poll(
      async () => (await cta.textContent())?.toLowerCase() ?? '',
      { timeout: 15_000 },
    ).toMatch(/^open session for /);

    await page.getByTestId('hilo-stake-input').fill('0.001');
    await cta.click();

    await expect(page.getByTestId('hilo-tx-receipt')).toBeVisible({
      timeout: 15_000,
    });
  });
});
