import { NextRequest, NextResponse } from 'next/server';
import { getSanctuaryQuestsWithProgress, getSanctuaryQuests } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const tokenId = searchParams.get('token_id');
    const season = searchParams.get('season') ?? 'spring-2026';

    if (!address || !tokenId) {
      const quests = getSanctuaryQuests(season);
      return NextResponse.json({ success: true, quests, progress: null });
    }

    const quests = getSanctuaryQuestsWithProgress(address, parseInt(tokenId, 10), season);
    return NextResponse.json({ success: true, quests });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to get quests' }, { status: 500 });
  }
}
