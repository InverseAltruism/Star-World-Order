import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSanctuaryState } from '@/lib/db';
import { ethAddress, parseSearchParams, formatZodError } from '@/lib/sanctuary/validation';

const querySchema = z.object({
  address: ethAddress,
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseSearchParams(querySchema, searchParams);

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }

    const state = getSanctuaryState(parsed.data.address);
    return NextResponse.json({ success: true, ...state });
  } catch (error) {
    console.error('Sanctuary state GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch sanctuary state' }, { status: 500 });
  }
}
