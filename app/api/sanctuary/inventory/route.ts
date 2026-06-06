/**
 * GET /api/sanctuary/inventory?address=0x...
 *
 * Returns the wallet's owned cosmetic items, joined with the catalog metadata.
 * Public read — ownership is already implied by on-chain wallet identity.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getCompanionInventory,
  getShopItem,
  type SanctuaryCosmeticItem,
  type SanctuaryInventoryEntry,
} from '@/lib/db';
import { ethAddress, parseSearchParams, formatZodError } from '@/lib/sanctuary/validation';

const querySchema = z.object({
  address: ethAddress,
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
    const { address } = parsed.data;
    const entries = getCompanionInventory(address);
    type EnrichedItem = SanctuaryCosmeticItem & {
      source: SanctuaryInventoryEntry['source'];
      acquired_at: string;
    };
    const items: EnrichedItem[] = [];
    for (const e of entries) {
      const meta = getShopItem(e.item_key);
      if (meta) items.push({ ...meta, source: e.source, acquired_at: e.acquired_at });
    }
    return NextResponse.json({ success: true, items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to read inventory';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
