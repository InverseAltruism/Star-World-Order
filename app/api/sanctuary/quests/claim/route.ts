import { NextRequest, NextResponse } from 'next/server';
import { claimSanctuaryQuestReward } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, token_id, quest_id } = body;

    if (!address || token_id === undefined || quest_id === undefined) {
      return NextResponse.json({ success: false, error: 'address, token_id, and quest_id required' }, { status: 400 });
    }

    const result = claimSanctuaryQuestReward(address, token_id, quest_id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to claim reward';
    const status = msg.includes('not found') ? 404 : msg.includes('not completed') || msg.includes('already claimed') ? 409 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
