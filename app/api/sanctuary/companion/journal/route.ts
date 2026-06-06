import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveCompanion, getJournalEntriesPaginated, getJournalStats } from '@/lib/db';
import { ethAddress, tokenId, paginationPage, paginationLimit, parseSearchParams, formatZodError } from '@/lib/sanctuary/validation';

const querySchema = z.object({
  address: ethAddress,
  token_id: tokenId.optional(),
  page: paginationPage,
  limit: paginationLimit(100, 20),
  type: z.string().optional(),
  before: z.string().optional(),
  stats: z.enum(['true', 'false']).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseSearchParams(querySchema, searchParams);

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }

    const { address, token_id: tid, page, limit, type, before, stats } = parsed.data;
    let resolvedTokenId: number;

    if (tid !== undefined) {
      resolvedTokenId = tid;
    } else {
      const active = getActiveCompanion(address);
      if (!active) {
        return NextResponse.json({ success: false, error: 'No active companion' }, { status: 404 });
      }
      resolvedTokenId = active.token_id;
    }

    const result = getJournalEntriesPaginated(address, resolvedTokenId, { page, limit, type, before });

    const response: Record<string, unknown> = {
      success: true,
      ...result,
    };

    if (stats === 'true') {
      response.stats = getJournalStats(address, resolvedTokenId);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Sanctuary journal GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch journal' }, { status: 500 });
  }
}
