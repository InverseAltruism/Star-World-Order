// /casino/constellation-climb Playwright spec — stubbed pending
// [SWO_CASINO_HILO_UI] (D10).
//
// Why stub now: the F3 acceptance for [SWO_CASINO_PLAYWRIGHT_CONNECTED]
// names all three bet surfaces (coinflip, dice, climb). Coinflip and dice
// ship in this PR; Constellation Climb only has the contract layer and
// is still missing `app/casino/constellation-climb/page.tsx`. Landing the
// `test.skip` stub keeps the test surface honest:
//
//   - `npx playwright test` reports a skipped block tagged with the
//     blocking task, so reviewers see what's missing without grepping
//     the queue.
//   - Once HiLo UI lands, the only change needed is replacing the
//     `test.skip` body with real assertions (`hilo-open-cta`,
//     `hilo-step-cta`, `hilo-cashout-cta`).

import { test } from '@playwright/test';

test.describe('@casino-connected /casino/constellation-climb', () => {
  test.skip(
    'connected HiLo flow (open → step → cashOut) — blocked on [SWO_CASINO_HILO_UI]',
    async () => {
      // Intentionally empty. See file header for unblock plan.
    },
  );
});
