import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { completeActivityV15 } from '@/lib/db';
import { isStarSkrumpeyId } from '@/lib/starSkrumpey';
import { ethAddress, tokenId, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(bodySchema, body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 },
      );
    }

    const { address, token_id: tid } = parsed.data;

    const isStar = isStarSkrumpeyId(tid);
    const result = completeActivityV15(address, tid, { isStar });
    if (!result) {
      return NextResponse.json(
        { success: false, error: 'No activity to complete (still in progress or none active)' },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to complete activity';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
