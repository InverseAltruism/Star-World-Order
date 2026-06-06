/**
 * GET /api/sanctuary/charms?address=0x..
 *
 * The functional-charm catalog + the wallet's owned charges + STAR balance.
 * Read-only, no auth. Powers the Shop's Charms tab. [SWO_V2_SANCTUARY_QUESTS_V2]
 */
import { NextRequest, NextResponse } from 'next/server';
import { listCharmItems, getCharmStock, getStarBalance } from '@/lib/db';
import { ethAddress } from '@/lib/sanctuary/validation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const addr = ethAddress.safeParse(searchParams.get('address'));
    const catalog = listCharmItems();
    if (!addr.success) {
      return NextResponse.json({ success: true, catalog, owned: {}, starBalance: 0 });
    }
    return NextResponse.json({
      success: true,
      catalog,
      owned: getCharmStock(addr.data),
      starBalance: getStarBalance(addr.data).balance,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to load charms';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
