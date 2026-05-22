// Playwright config for [SWO_CASINO_PLAYWRIGHT_CONNECTED].
//
// Pairs with `.github/workflows/casino-e2e.yml`, which currently no-ops
// when no `playwright.config.*` is present. Landing this file activates the
// CI gate for the casino UI surfaces.
//
// Scope: the `casino-connected` project covers wallet-mocked flows for
// /casino/coinflip, /casino/dice, and /casino/constellation-climb.
//
// Wallet mock: `tests/e2e/casino/fixtures/wallet-mock.ts` injects an
// EIP-1193 provider via `page.addInitScript` and announces it through
// EIP-6963 so wagmi's `injected()` connector picks it up before hydration.
// The mock pins `game.allowlist()` to the zero address so
// `useAllowlistGate` short-circuits to `passthrough` and the bet CTA is
// clickable; spec-level bet flows can then click through to the
// `eth_sendTransaction` mock and assert `*-tx-receipt` renders.

import { defineConfig, devices } from '@playwright/test';

const NEXT_PORT = process.env.NEXT_PORT ?? '3000';
// PLAYWRIGHT_BASE_URL is what `.github/workflows/casino-e2e.yml` sets;
// E2E_BASE_URL is the local-dev override. Either one short-circuits the
// `webServer` boot so you can point the suite at an already-running dev
// server.
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.E2E_BASE_URL ??
  `http://localhost:${NEXT_PORT}`;
const MONAD_TESTNET_CHAIN_ID =
  process.env.MONAD_CHAIN_ID ?? process.env.NEXT_PUBLIC_MONAD_CHAIN_ID ?? '10143';
const USE_EXTERNAL_SERVER = Boolean(
  process.env.PLAYWRIGHT_BASE_URL ?? process.env.E2E_BASE_URL,
);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'casino-connected',
      testMatch: /casino\/.*\.connected\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  webServer: USE_EXTERNAL_SERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_MONAD_CHAIN_ID: MONAD_TESTNET_CHAIN_ID,
          NODE_ENV: 'development',
          // Deterministic non-zero commits so the {Coinflip,Dice,HiLo}
          // Content components advance past the "Server commit not
          // configured" early-return inside `placeBet`/`openSession`. The
          // value is opaque to the page — it's only required to be a
          // 32-byte hex string other than the zero hash.
          NEXT_PUBLIC_COSMIC_FLIP_COMMIT:
            process.env.NEXT_PUBLIC_COSMIC_FLIP_COMMIT ??
            '0x' + 'a1'.repeat(32),
          NEXT_PUBLIC_GRAVITY_DICE_COMMIT:
            process.env.NEXT_PUBLIC_GRAVITY_DICE_COMMIT ??
            '0x' + 'b2'.repeat(32),
          NEXT_PUBLIC_CONSTELLATION_CLIMB_COMMIT:
            process.env.NEXT_PUBLIC_CONSTELLATION_CLIMB_COMMIT ??
            '0x' + 'c3'.repeat(32),
        },
      },
});
