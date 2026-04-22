import { NextRequest, NextResponse } from 'next/server';
import { getActiveCompanion, getJournalEntriesPaginated, getJournalStats } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ success: false, error: 'Address is required' }, { status: 400 });
    }

    const tokenIdParam = searchParams.get('token_id');
    let tokenId: number;

    if (tokenIdParam) {
      tokenId = parseInt(tokenIdParam, 10);
      if (isNaN(tokenId)) {
        return NextResponse.json({ success: false, error: 'Invalid token_id' }, { status: 400 });
      }
    } else {
      const active = getActiveCompanion(address);
      if (!active) {
        return NextResponse.json({ success: false, error: 'No active companion' }, { status: 404 });
      }
      tokenId = active.token_id;
    }

    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);
    const type = searchParams.get('type') ?? undefined;
    const before = searchParams.get('before') ?? undefined;
    const includeStats = searchParams.get('stats') === 'true';

    const result = getJournalEntriesPaginated(address, tokenId, { page, limit, type, before });

    const response: Record<string, unknown> = {
      success: true,
      ...result,
    };

    if (includeStats) {
      response.stats = getJournalStats(address, tokenId);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Sanctuary journal GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch journal' }, { status: 500 });
  }
}
