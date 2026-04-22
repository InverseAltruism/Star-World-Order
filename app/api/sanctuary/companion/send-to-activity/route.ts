import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendToActivity } from '@/lib/db';
import { ethAddress, tokenId, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
  location_id: z.coerce.number().int().min(1, 'location_id is required'),
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

    const { address, token_id: tid, location_id } = parsed.data;
    const result = sendToActivity(address, tid, location_id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send to activity';
    const status = message.includes('No active companion') ? 404
      : message.includes('already on an activity') ? 409
      : message.includes('not found') ? 404
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
