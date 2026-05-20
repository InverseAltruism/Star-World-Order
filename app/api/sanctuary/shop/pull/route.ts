/**
 * POST /api/sanctuary/shop/pull
 *
 * Cosmetic gacha pull (V2 §3.3 / §3.4). Wallet-authenticated. Every pull
 * yields exactly one cosmetic — the floor is guaranteed by
 * {@link pickGachaItem}. Rare-tier roll fires at the configured
 * {@link GACHA_RARE_CHANCE} (~2%, no premium pity).
 *
 * Body: { address }
 *
 * Response:
 *   200 { success: true, item, isRare, fellBackToOtherTier, balance, ... }
 *   400 validation
 *   401 wallet auth failed
 *   402 Insufficient STAR balance
 *   404 GACHA_POOL_EMPTY (wallet owns every cosmetic in the catalog)
 *   429 rate limited
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { gachaPullForWallet } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({
  address: ethAddress,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(bodySchema, body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 },
      );
    }
    const { address } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const rateLimited = applyRateLimit(address, 'shop/pull');
    if (rateLimited) return rateLimited;

    const result = gachaPullForWallet(address);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to pull from shop';
    if (msg === 'GACHA_POOL_EMPTY' || msg === 'GACHA_NO_ELIGIBLE_ITEMS') {
      return NextResponse.json(
        { success: false, error: 'No cosmetics left to pull — you own them all!' },
        { status: 404 },
      );
    }
    if (msg.includes('Insufficient')) {
      return NextResponse.json({ success: false, error: msg }, { status: 402 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
