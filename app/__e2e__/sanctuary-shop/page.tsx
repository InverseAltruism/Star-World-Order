'use client';

/**
 * E2E test harness for [SWO_V2_SANCTUARY_STAR_ECONOMY_SINKS] PR6.
 *
 * Renders just the {@link ShopDialog} in isolation so Playwright can drive the
 * gacha-pull flow without booting the full Sanctuary V2 Phaser scene + wallet
 * stack. Companion props are seeded statically; the spec is responsible for
 * stubbing the `/api/sanctuary/*` endpoints (and for pre-seeding the wallet
 * auth-header cache so `getWalletAuthHeader` short-circuits without prompting
 * an EIP-1193 signature).
 *
 * This route is intentionally **not** linked from any nav. It exists only for
 * the `sanctuary-connected` Playwright project — the equivalent of the casino
 * harness in `tests/e2e/casino/coinflip.connected.spec.ts`, but for the
 * cosmetic shop.
 */
import { useEffect } from 'react';
import ShopDialog from '@/components/sanctuary/overlays/ShopDialog';
import EventBus from '@/components/sanctuary/EventBus';

const TEST_WALLET = '0x1111111111111111111111111111111111111111';
const TEST_TOKEN_ID = 1;

export default function SanctuaryShopE2EHarness() {
  useEffect(() => {
    // Auto-open the dialog so the spec doesn't have to simulate an NPC click.
    EventBus.emit('shop-overlay-open');
  }, []);

  return (
    <div
      data-testid="shop-pull-harness"
      style={{
        position: 'relative',
        minHeight: '100vh',
        background: '#0a0a15',
      }}
    >
      <ShopDialog walletAddress={TEST_WALLET} tokenId={TEST_TOKEN_ID} />
    </div>
  );
}
