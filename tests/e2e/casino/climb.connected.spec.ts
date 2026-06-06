// /casino/constellation-climb Playwright spec.
//
// Coverage:
//   - Pre-connect baseline: page metadata + "Connect wallet" CTA.
//   - Wallet-mocked passthrough allowlist: openSession CTA reachable.
//   - Wallet-mocked happy path: place a min-stake openSession, inject a
//     synthetic `SessionCashedOut` log via the HTTP JSON-RPC interceptor,
//     assert the UI flips to `hilo-status-cashedOut`.
//   - Wallet-mocked loss path: inject a `StepPlayed` log with `won=false`
//     and assert `hilo-status-lost` appears.

import { expect, test } from '@playwright/test';
import {
  installRpcRoute,
  installWalletMock,
  makeSessionCashedOutLog,
  makeStepPlayedLostLog,
} from './fixtures/wallet-mock';

const ROUTE = '/casino/constellation-climb';
const PLAYER: `0x${string}` = '0x1111111111111111111111111111111111111111';
const CONSTELLATION_CLIMB_ADDRESS: `0x${string}` =
  '0xd9B9b6c37ad4f3D5b07ae76dE261c5C865600d6e';

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

  test('wallet-mocked player on passthrough allowlist sees Open session CTA', async ({
    page,
  }) => {
    await installWalletMock(page, { chainId: 10143 });
    await installRpcRoute(page, { chainId: 10143 });
    await page.goto(ROUTE);

    const cta = page.getByTestId('hilo-primary-cta');
    await expect(cta).toBeVisible();

    await expect.poll(
      async () => (await cta.textContent())?.toLowerCase() ?? '',
      { timeout: 15_000 },
    ).not.toMatch(/^connect wallet/);

    const text = (await cta.textContent()) ?? '';
    expect(text).not.toMatch(/switch to monad/i);
    expect(text).not.toMatch(/^connect wallet/i);
    expect(text).not.toMatch(/allowlist required/i);
  });

  // Acceptance (b) for [SWO_CASINO_PLAYWRIGHT_CONNECTED]: place a min-stake
  // openSession, inject a synthetic `SessionCashedOut` log, assert the
  // session status banner reads `cashedOut`. The wallet mock supplies the
  // deterministic tx hash for the openSession write; the queued log
  // drives `useWatchContractEvent`'s onLogs callback in HiLoContent, which
  // calls setSessionStatus('cashedOut').
  test('min-stake openSession → injected SessionCashedOut → UI flips to cashedOut', async ({
    page,
  }) => {
    await installWalletMock(page, { chainId: 10143 });
    const rpc = await installRpcRoute(page, { chainId: 10143 });
    await page.goto(ROUTE);

    const cta = page.getByTestId('hilo-primary-cta');
    await expect.poll(
      async () => (await cta.textContent())?.toLowerCase() ?? '',
      { timeout: 15_000 },
    ).toMatch(/^open session for /);

    await page.getByTestId('hilo-stake-input').fill('0.001');
    await cta.click();
    await expect(page.getByTestId('hilo-tx-receipt')).toBeVisible({
      timeout: 15_000,
    });

    rpc.pushLog(
      makeSessionCashedOutLog({
        contractAddress: CONSTELLATION_CLIMB_ADDRESS,
        player: PLAYER,
        sessionId: 1n,
      }),
    );

    await expect(page.getByTestId('hilo-status-cashedOut')).toBeVisible({
      timeout: 30_000,
    });
  });

  test('open session → injected losing StepPlayed → UI flips to lost', async ({
    page,
  }) => {
    await installWalletMock(page, { chainId: 10143 });
    const rpc = await installRpcRoute(page, { chainId: 10143 });
    await page.goto(ROUTE);

    const cta = page.getByTestId('hilo-primary-cta');
    await expect.poll(
      async () => (await cta.textContent())?.toLowerCase() ?? '',
      { timeout: 15_000 },
    ).toMatch(/^open session for /);

    await page.getByTestId('hilo-stake-input').fill('0.001');
    await cta.click();
    await expect(page.getByTestId('hilo-tx-receipt')).toBeVisible({
      timeout: 15_000,
    });

    rpc.pushLog(
      makeStepPlayedLostLog({
        contractAddress: CONSTELLATION_CLIMB_ADDRESS,
        player: PLAYER,
        sessionId: 2n,
      }),
    );

    await expect(page.getByTestId('hilo-status-lost')).toBeVisible({
      timeout: 30_000,
    });
  });
});
