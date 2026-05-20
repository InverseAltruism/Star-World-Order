/**
 * GET /api/sanctuary/expeditions/list?address=0x..&token_id=123
 *
 * Returns the merged easy/medium/hard catalog, annotated with whether the
 * requester has an active run for each expedition (so the overlay can resume
 * instead of opening a fresh dialog).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listExpeditions } from '@/lib/db';
import { ethAddress, tokenId, parseSearchParams, formatZodError } from '@/lib/sanctuary/validation';

const querySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseSearchParams(querySchema, searchParams);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }
    const result = listExpeditions(parsed.data.address, parsed.data.token_id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to list expeditions';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
