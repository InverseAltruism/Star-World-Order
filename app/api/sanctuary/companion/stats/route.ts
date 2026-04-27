import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCompanionStatsSnapshot } from '@/lib/db';
import { ethAddress, tokenId, parseSearchParams, formatZodError } from '@/lib/sanctuary/validation';

const querySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
});

/**
 * GET /api/sanctuary/companion/stats?address=0x...&token_id=123
 *
 * V2.5 — returns the projected current vitality snapshot (decayed from the
 * last persisted `stats_updated_at`) plus the labelled needs[] for any stat
 * below NEED_THRESHOLD. Pure read — does not mutate the persisted snapshot;
 * `interactWithCompanion` is responsible for converging the values.
 */
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

    const snapshot = getCompanionStatsSnapshot(parsed.data.address, parsed.data.token_id);
    if (!snapshot) {
      return NextResponse.json(
        { success: false, error: 'No active companion found for this wallet/token' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, ...snapshot });
  } catch (error) {
    console.error('Sanctuary companion stats GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch stats' }, { status: 500 });
  }
}
