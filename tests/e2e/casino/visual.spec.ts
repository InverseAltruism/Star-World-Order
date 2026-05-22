// Visual baseline spec for [SWO_CASINO_PLAYWRIGHT_VISUAL_BASELINE].
//
// Captures pixel baselines for all 3 Cosmic Casino game pages
// (/casino/coinflip, /casino/dice, /casino/constellation-climb) across the
// product cross-product:
//   • viewports: 375×812 (mobile) and 1280×800 (desktop)
//   • colour schemes: dark and light
//
// That is 3 pages × 2 viewports × 2 schemes = 12 baselines. They land
// under `e2e/casino/__snapshots__/` (see `snapshotPathTemplate` in
// `playwright.config.ts`) so the suite stays portable across spec moves.
//
// Diff threshold: `maxDiffPixelRatio: 0.005` (0.5%) — set centrally via
// `expect.toHaveScreenshot` defaults in the root config. This absorbs
// anti-aliasing wobble between Chromium minor versions without hiding
// real layout/colour regressions.
//
// Bootstrapping baselines:
//   1. Boot a dev server: `npm run dev`
//   2. Generate baselines: `npx playwright test --project casino-visual --update-snapshots`
//   3. Inspect the resulting PNGs under `e2e/casino/__snapshots__/`
//   4. Commit them
//
// Pre-connect surface only: we intentionally do NOT install the wallet
// mock here. A pre-connect baseline keeps the screenshots deterministic
// (no account-string, no balance, no wallet-derived widgets) and matches
// what a first-time visitor sees on a cold page load.

import { expect, test, type Page } from '@playwright/test';

// `components/LoadingScreen.tsx` renders a full-screen "INSERT THE CARTRIDGE"
// intro animation on first visit per session. It self-dismisses after ~8s,
// but obscures the casino UI for long enough that screenshots of /casino/*
// taken under fullPage all collapse to the same intro frame. The component
// short-circuits when `sessionStorage["swo-loading-seen"]` is truthy — we
// set it BEFORE any script on the page runs so React never paints the
// overlay in the first place.
const SUPPRESS_LOADING_SCREEN_SCRIPT = `
  try {
    window.sessionStorage.setItem('swo-loading-seen', '1');
  } catch (_) {
    /* sessionStorage may be unavailable; the overlay just stays visible */
  }
`;

interface PageSpec {
  /** Slug used in snapshot filenames; keep stable. */
  slug: string;
  path: string;
  /** Sentinel testid that must be visible before we screenshot. */
  ready: string;
}

const PAGES: readonly PageSpec[] = [
  { slug: 'coinflip', path: '/casino/coinflip', ready: 'coinflip-page' },
  { slug: 'dice', path: '/casino/dice', ready: 'dice-page' },
  {
    slug: 'constellation-climb',
    path: '/casino/constellation-climb',
    ready: 'hilo-page',
  },
] as const;

interface ViewportSpec {
  slug: string;
  width: number;
  height: number;
}

const VIEWPORTS: readonly ViewportSpec[] = [
  { slug: 'mobile', width: 375, height: 812 },
  { slug: 'desktop', width: 1280, height: 800 },
] as const;

const SCHEMES = ['dark', 'light'] as const;
type Scheme = (typeof SCHEMES)[number];

// Wait for the page to be visually stable: route's sentinel mounted, web
// fonts resolved, and one rAF cycle elapsed so React's hydration paint
// has flushed. Without this, the very first run can flake on whatever
// frame `goto` happens to settle on.
async function waitForVisualStability(page: Page, readyTestId: string) {
  await expect(page.getByTestId(readyTestId)).toBeVisible();
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

for (const viewport of VIEWPORTS) {
  for (const scheme of SCHEMES as readonly Scheme[]) {
    test.describe(`@casino-visual ${viewport.slug} ${scheme}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: scheme,
      });

      for (const pageSpec of PAGES) {
        test(`${pageSpec.slug}`, async ({ page }) => {
          await page.addInitScript(SUPPRESS_LOADING_SCREEN_SCRIPT);
          await page.goto(pageSpec.path);
          await waitForVisualStability(page, pageSpec.ready);

          // `fullPage: true` captures the whole route below the fold —
          // important for mobile, where the side picker / sliders / CTA
          // stack vertically and a viewport-only shot would crop them.
          await expect(page).toHaveScreenshot(
            `${pageSpec.slug}-${viewport.slug}-${scheme}.png`,
            { fullPage: true },
          );
        });
      }
    });
  }
}
