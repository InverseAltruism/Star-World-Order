import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSanctuaryQuestsWithProgress, getSanctuaryQuests } from '@/lib/db';
import { ethAddress, tokenId, parseSearchParams, formatZodError } from '@/lib/sanctuary/validation';

const querySchema = z.object({
  address: ethAddress.optional(),
  token_id: tokenId.optional(),
  season: z.string().default('spring-2026'),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseSearchParams(querySchema, searchParams);

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }

    const { address, token_id: tid, season } = parsed.data;

    if (!address || tid === undefined) {
      const quests = getSanctuaryQuests(season);
      return NextResponse.json({ success: true, quests, progress: null });
    }

    const quests = getSanctuaryQuestsWithProgress(address, tid, season);
    return NextResponse.json({ success: true, quests });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to get quests' }, { status: 500 });
  }
}
