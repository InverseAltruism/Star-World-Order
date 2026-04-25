/**
 * POST /api/sanctuary/inventory/equip
 *
 * Equip a cosmetic from the wallet's inventory onto a specific companion. The
 * cosmetic's category determines the slot it occupies in the companion's
 * `equipped_cosmetics` JSON. Pass `item_key: null` to unequip (and a `slot`
 * indicating which slot to clear).
 *
 * Body: { address, token_id, item_key (string | null), slot? }
 *
 * Response:
 *   200 { success: true, token_id, equipped_cosmetics }
 *   400 validation
 *   401 wallet auth failed
 *   404 COMPANION_NOT_FOUND | ITEM_NOT_FOUND
 *   409 ALREADY_EQUIPPED
 *   422 LEVEL_TOO_LOW | NOT_OWNED
 *   429 rate limited
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { equipCosmetic, type CosmeticCategory } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, tokenId, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const slotEnum = z.enum(['hat', 'accessory', 'background', 'animation']);

const bodySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
  item_key: z.union([
    z.string().min(1).max(64).regex(/^[a-z0-9_]+$/),
    z.null(),
  ]),
  slot: slotEnum.optional(),
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
    const { address, token_id, item_key, slot } = parsed.data;

    if (item_key === null && !slot) {
      return NextResponse.json(
        { success: false, error: 'slot is required when unequipping (item_key=null)' },
        { status: 400 },
      );
    }

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const rateLimited = applyRateLimit(address, 'inventory/equip');
    if (rateLimited) return rateLimited;

    const result = equipCosmetic(
      address,
      token_id,
      item_key,
      slot as CosmeticCategory | undefined,
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to equip cosmetic';
    if (msg === 'COMPANION_NOT_FOUND' || msg === 'ITEM_NOT_FOUND') {
      return NextResponse.json({ success: false, error: msg }, { status: 404 });
    }
    if (msg === 'ALREADY_EQUIPPED') {
      return NextResponse.json({ success: false, error: 'Item already equipped' }, { status: 409 });
    }
    if (msg === 'NOT_OWNED') {
      return NextResponse.json({ success: false, error: 'You do not own this item' }, { status: 422 });
    }
    if (msg.startsWith('LEVEL_TOO_LOW')) {
      return NextResponse.json({ success: false, error: 'Wallet level too low for this item' }, { status: 422 });
    }
    if (msg === 'SLOT_REQUIRED') {
      return NextResponse.json({ success: false, error: 'slot is required when unequipping' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
