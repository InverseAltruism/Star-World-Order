/**
 * GET /api/sanctuary/shop/items?category=hat&address=0x...
 *
 * Public catalog read. Returns the cosmetic items available in the Shop,
 * sorted by price. When `address` is provided, each item includes an `owned`
 * flag so the client can disable already-purchased items.
 *
 * Query:
 *   category? — 'hat' | 'accessory' | 'background' | 'animation'
 *   address?  — wallet address to enrich items with ownership info
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listShopItems, type CosmeticCategory } from '@/lib/db';
import { ethAddress, parseSearchParams, formatZodError } from '@/lib/sanctuary/validation';

const querySchema = z.object({
  category: z.enum(['hat', 'accessory', 'background', 'animation']).optional(),
  address: ethAddress.optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseSearchParams(querySchema, searchParams);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 },
      );
    }
    const { category, address } = parsed.data;
    const items = listShopItems({
      category: category as CosmeticCategory | undefined,
      walletAddress: address,
    });
    return NextResponse.json({ success: true, items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to list shop items';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
