import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getActiveCompanion, getAllCompanions } from '@/lib/db';
import { ethAddress, parseSearchParams, formatZodError } from '@/lib/sanctuary/validation';

const querySchema = z.object({
  address: ethAddress,
  all: z.enum(['true', 'false']).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseSearchParams(querySchema, searchParams);

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }

    const { address, all } = parsed.data;

    if (all === 'true') {
      const companions = getAllCompanions(address);
      return NextResponse.json({ success: true, companions });
    }

    const companion = getActiveCompanion(address);
    return NextResponse.json({ success: true, companion });
  } catch (error) {
    console.error('Sanctuary companion GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch companion' }, { status: 500 });
  }
}
