// Playwright spec — [SWO_V2_SANCTUARY_STAR_ECONOMY_SINKS] PR6 acceptance:
//
//   • Playwright drives 5 pulls, every pull yields a cosmetic
//   • The rare-badge (gacha-rare-badge) renders only on the pull that lands a
//     rare/legendary item — never on common/uncommon pulls.
//
// Runs against the isolated harness at `app/__e2e__/sanctuary-shop` so we
// don't have to boot the full Sanctuary V2 Phaser scene + wallet stack. The
// spec mocks every `/api/sanctuary/*` endpoint the dialog hits, including the
// `/api/sanctuary/shop/pull` POST that this PR exercises end-to-end.

import { expect, test, type Route } from '@playwright/test';

const TEST_WALLET = '0x1111111111111111111111111111111111111111';
const HARNESS_URL = '/__e2e__/sanctuary-shop';

// Mirrors the seed catalog in `lib/sanctuary/__tests__/gacha.test.ts`. Two
// rarities of each so we can exercise both the common path and the rare slot.
const PULL_ITEMS = [
  {
    id: 1,
    item_key: 'hat_acorn_cap',
    name: 'Acorn Cap',
    category: 'hat' as const,
    rarity: 'common' as const,
    star_cost: 10,
    level_required: 1,
    description: 'A humble cap.',
    asset_key: 'hat_acorn_cap',
  },
  {
    id: 2,
    item_key: 'hat_witch_hat',
    name: 'Witch Hat',
    category: 'hat' as const,
    rarity: 'uncommon' as const,
    star_cost: 20,
    level_required: 1,
    description: 'Pointy and arcane.',
    asset_key: 'hat_witch_hat',
  },
  {
    id: 3,
    item_key: 'hat_gold_crown',
    name: 'Gold Crown',
    category: 'hat' as const,
    rarity: 'rare' as const,
    star_cost: 35,
    level_required: 1,
    description: 'A regal find.',
    asset_key: 'hat_gold_crown',
  },
  {
    id: 4,
    item_key: 'acc_star_pendant',
    name: 'Star Pendant',
    category: 'accessory' as const,
    rarity: 'common' as const,
    star_cost: 10,
    level_required: 1,
    description: 'A glowing pendant.',
    asset_key: 'acc_star_pendant',
  },
  {
    id: 5,
    item_key: 'acc_eclipse_pendant',
    name: 'Eclipse Pendant',
    category: 'accessory' as const,
    rarity: 'legendary' as const,
    star_cost: 50,
    level_required: 1,
    description: 'A legendary heirloom.',
    asset_key: 'acc_eclipse_pendant',
  },
];

// Pre-seed the wallet auth cache so getWalletAuthHeader() short-circuits to
// the cached header and never tries to call window.ethereum.request. The
// header format mirrors `lib/clientWalletAuth.ts`: addr:issuedAt:expiresAt:sig.
async function seedWalletAuth(page: import('@playwright/test').Page) {
  await page.addInitScript(({ wallet }) => {
    const now = Date.now();
    const expiresAt = now + 5 * 60 * 1000;
    const fakeSig =
      '0x' +
      'ab'.repeat(32) +
      'cd'.repeat(32) +
      '1b'; // 65-byte placeholder; the harness doesn't verify it client-side.
    const header = `${wallet}:${now}:${expiresAt}:${fakeSig}`;
    const entry = { [wallet]: { header, expiresAt } };
    try {
      window.sessionStorage.setItem('swo_wallet_auth_v1', JSON.stringify(entry));
    } catch {
      /* sessionStorage unavailable; the spec will still cover the read flow */
    }
  }, { wallet: TEST_WALLET.toLowerCase() });
}

interface PullScript {
  /** Pre-built sequence of pull responses, one per click. */
  items: Array<typeof PULL_ITEMS[number]>;
  /** Index aligned with `items` — true → response sets isRare=true. */
  rareAt: ReadonlySet<number>;
  /** Starting STAR balance shown to the user. */
  startingBalance: number;
}

// Install the API route stubs. Returns a tracker so specs can assert how many
// times the pull endpoint was hit.
async function installApiStubs(
  page: import('@playwright/test').Page,
  script: PullScript,
) {
  let pullCount = 0;
  let balance = script.startingBalance;

  await page.route('**/api/sanctuary/companion**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        companion: {
          token_id: 1,
          wallet_address: TEST_WALLET,
          equipped_cosmetics: '{}',
          level: 10,
        },
      }),
    }),
  );

  await page.route('**/api/sanctuary/star/balance**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, balance, lifetime_earned: balance }),
    }),
  );

  await page.route('**/api/sanctuary/shop/items**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: PULL_ITEMS }),
    }),
  );

  await page.route('**/api/sanctuary/inventory**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, items: [] }),
    }),
  );

  await page.route('**/api/sanctuary/shop/pull', (route: Route) => {
    const idx = pullCount;
    pullCount += 1;
    if (idx >= script.items.length) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'script exhausted' }),
      });
    }
    const item = script.items[idx];
    const isRare = script.rareAt.has(idx);
    // Honour the same debit math the production handler applies (30 STAR/pull).
    balance = Math.max(0, balance - 30);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        item,
        isRare,
        fellBackToOtherTier: false,
        balance,
      }),
    });
  });

  return { getPullCount: () => pullCount };
}

test.describe('Cosmetic gacha pull — Sanctuary V2 §3.3/§3.4', () => {
  test.beforeEach(async ({ page }) => {
    await seedWalletAuth(page);
  });

  test('5 consecutive pulls each yield a cosmetic; rare-badge fires only on rare slots', async ({
    page,
  }) => {
    const script: PullScript = {
      items: [
        PULL_ITEMS[0], // common
        PULL_ITEMS[1], // uncommon
        PULL_ITEMS[2], // rare ← rare-badge expected
        PULL_ITEMS[3], // common
        PULL_ITEMS[4], // legendary ← rare-badge expected
      ],
      // 0-indexed pull positions where isRare should be true.
      rareAt: new Set([2, 4]),
      startingBalance: 500,
    };
    const tracker = await installApiStubs(page, script);

    await page.goto(HARNESS_URL);
    await expect(page.getByTestId('shop-pull-harness')).toBeVisible();
    await expect(page.getByTestId('gacha-pull-strip')).toBeVisible();

    const pullBtn = page.getByTestId('gacha-pull-button');
    const rareBadge = page.getByTestId('gacha-rare-badge');

    // Pull 1 — common. Badge must be absent.
    await pullBtn.click();
    await expect(page.getByText('Last: Acorn Cap')).toBeVisible();
    await expect(rareBadge).toHaveCount(0);

    // Pull 2 — uncommon. Still no rare badge.
    await pullBtn.click();
    await expect(page.getByText('Last: Witch Hat')).toBeVisible();
    await expect(rareBadge).toHaveCount(0);

    // Pull 3 — rare. Badge fires.
    await pullBtn.click();
    await expect(page.getByText('Last: Gold Crown')).toBeVisible();
    await expect(rareBadge).toBeVisible();

    // Pull 4 — common again. Badge clears.
    await pullBtn.click();
    await expect(page.getByText('Last: Star Pendant')).toBeVisible();
    await expect(rareBadge).toHaveCount(0);

    // Pull 5 — legendary. Badge re-fires.
    await pullBtn.click();
    await expect(page.getByText('Last: Eclipse Pendant')).toBeVisible();
    await expect(rareBadge).toBeVisible();

    expect(tracker.getPullCount()).toBe(5);
  });

  test('every pull yields a named cosmetic — no empty/null floor breach across 5 commons', async ({
    page,
  }) => {
    const script: PullScript = {
      items: [PULL_ITEMS[0], PULL_ITEMS[3], PULL_ITEMS[0], PULL_ITEMS[3], PULL_ITEMS[0]],
      rareAt: new Set<number>(),
      startingBalance: 500,
    };
    await installApiStubs(page, script);

    await page.goto(HARNESS_URL);
    await expect(page.getByTestId('gacha-pull-strip')).toBeVisible();

    const pullBtn = page.getByTestId('gacha-pull-button');
    for (let i = 0; i < 5; i++) {
      await pullBtn.click();
      // The "Last: <name>" line is the UI's commitment that the pull yielded
      // a real cosmetic, not an empty / null floor. We re-check it after every
      // click so a regression where one slot returns null becomes visible.
      await expect(page.locator('[data-testid="gacha-pull-strip"]')).toContainText(
        /Last:\s+\S+/,
      );
    }
    // The floor contract: rare badge must NEVER appear when no rare slot was
    // scripted — guards against accidental "always rare" UI bugs.
    await expect(page.getByTestId('gacha-rare-badge')).toHaveCount(0);
  });
});
