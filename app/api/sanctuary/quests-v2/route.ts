/**
 * GET /api/sanctuary/quests-v2?address=0x..&token_id=123
 *
 * One read for the Quests v2 panel: the STAR-only quest catalog, the wallet's
 * active runs (with ready flags), the shared resource pool, charm stock, the
 * charm catalog, and the STAR balance. Read-only, no auth.
 * [SWO_V2_SANCTUARY_QUESTS_V2]
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSanctuaryQuestsV2 } from '@/lib/db';
import { ethAddress, tokenId } from '@/lib/sanctuary/validation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const addr = ethAddress.safeParse(searchParams.get('address'));
    const tid = tokenId.safeParse(Number(searchParams.get('token_id')));
    if (!addr.success || !tid.success) {
      return NextResponse.json(
        { success: false, error: 'address and token_id are required' },
        { status: 400 },
      );
    }
    const view = getSanctuaryQuestsV2(addr.data, tid.data);
    return NextResponse.json({ success: true, ...view });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to load quests';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
