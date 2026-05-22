// Playwright config for [SWO_CASINO_PLAYWRIGHT_CONNECTED] +
// [SWO_CASINO_PLAYWRIGHT_VISUAL_BASELINE].
//
// Pairs with `.github/workflows/casino-e2e.yml`, which currently no-ops
// when no `playwright.config.*` is present. Landing this file activates the
// CI gate for the casino UI surfaces.
//
// Projects:
//   • casino-connected — wallet-mocked behavioural flows for /casino/coinflip
//     and /casino/dice. The Constellation Climb (HiLo) spec is a `test.skip`
//     stub pending [SWO_CASINO_HILO_UI].
//   • casino-visual    — pixel-baseline snapshots for all 3 game pages at
//     375×812 (mobile) and 1280×800 (desktop), each captured in dark and
//     light color schemes. Baselines live under `e2e/casino/__snapshots__/`
//     (redirected via `snapshotPathTemplate`). Diff threshold is 0.5%
//     (`maxDiffPixelRatio: 0.005`) — enough to absorb anti-aliasing jitter
//     between Chromium minor versions without hiding real regressions.
//
// Wallet mock: `tests/e2e/casino/fixtures/wallet-mock.ts` injects an
// EIP-1193 provider via `page.addInitScript` and announces it through
// EIP-6963 so wagmi's `injected()` connector picks it up before hydration.

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

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  // The `casino-visual` project writes baselines to `e2e/casino/__snapshots__/`
  // (acceptance criterion for [SWO_CASINO_PLAYWRIGHT_VISUAL_BASELINE])
  // instead of the default `<spec>-snapshots/` sibling directory. `{arg}` is
  // the screenshot name passed to `toHaveScreenshot('<name>.png', ...)`; we
  // do NOT include `{-projectName}` because every visual snapshot already
  // encodes its viewport+scheme in the screenshot name itself.
  snapshotPathTemplate: 'e2e/casino/__snapshots__/{arg}{ext}',

  // 0.5% pixel-ratio budget keeps anti-aliasing noise from flaking the suite
  // while still catching layout/colour regressions. Tuned to the acceptance
  // criterion for [SWO_CASINO_PLAYWRIGHT_VISUAL_BASELINE].
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.005,
      animations: 'disabled',
      caret: 'hide',
    },
  },

  projects: [
    {
      name: 'casino-connected',
      testMatch: /casino\/.*\.connected\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'casino-visual',
      testMatch: /casino\/visual\.spec\.ts/,
      use: {
        // Viewport + colorScheme are overridden per-test via `test.use(...)`
        // inside the spec — the project-level defaults below are just
        // sensible fallbacks for `--ui` / `--headed` ad-hoc runs.
        ...devices['Desktop Chrome'],
        colorScheme: 'dark',
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
        },
      },
});
