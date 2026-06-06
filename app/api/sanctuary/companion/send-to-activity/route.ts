import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendToActivity } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, tokenId, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const TIMED_QUEST_DURATIONS = [5, 15, 60, 240, 480] as const;

const bodySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
  location_id: z.coerce.number().int().min(1, 'location_id is required'),
  duration_minutes: z
    .coerce.number().int()
    .refine((n) => (TIMED_QUEST_DURATIONS as readonly number[]).includes(n), {
      message: 'duration_minutes must be one of 5, 15, 60, 240, 480',
    })
    .optional(),
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

    const { address, token_id: tid, location_id, duration_minutes } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const rateLimited = applyRateLimit(address, 'companion/send-to-activity');
    if (rateLimited) return rateLimited;

    const result = sendToActivity(address, tid, location_id, { durationMinutes: duration_minutes });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send to activity';
    const status = message.includes('No active companion') ? 404
      : message.includes('already on an activity') ? 409
      : message.includes('Invalid quest duration') ? 400
      : message.includes('not found') ? 404
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
