/**
 * POST /api/sanctuary/shop/buy
 *
 * Purchase a cosmetic item from the Shop. Wallet-authenticated so the holder
 * must consent to the STAR deduction. Atomically:
 *   1. validates the item exists and the wallet meets `level_required`
 *   2. ensures the wallet doesn't already own the item
 *   3. deducts STAR via spendStar() (writes the ledger entry)
 *   4. inserts the inventory row
 *
 * Body: { address, item_key }
 *
 * Response:
 *   200 { success: true, item, balance, lifetime_earned, spent }
 *   400 validation
 *   401 wallet auth failed
 *   402 Insufficient STAR balance
 *   404 ITEM_NOT_FOUND
 *   409 ALREADY_OWNED
 *   422 LEVEL_TOO_LOW
 *   429 rate limited
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buyShopItem } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({
  address: ethAddress,
  item_key: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/),
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
    const { address, item_key } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const rateLimited = applyRateLimit(address, 'shop/buy');
    if (rateLimited) return rateLimited;

    const result = buyShopItem(address, item_key);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to buy shop item';
    if (msg === 'ITEM_NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Item not found' }, { status: 404 });
    }
    if (msg === 'ALREADY_OWNED') {
      return NextResponse.json({ success: false, error: 'Item already owned' }, { status: 409 });
    }
    if (msg.startsWith('LEVEL_TOO_LOW')) {
      return NextResponse.json({ success: false, error: 'Wallet level too low for this item' }, { status: 422 });
    }
    if (msg.includes('Insufficient')) {
      return NextResponse.json({ success: false, error: msg }, { status: 402 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
