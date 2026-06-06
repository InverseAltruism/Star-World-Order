/**
 * POST /api/sanctuary/expeditions/start
 *
 * Begins a new expedition run for (address, token_id, expedition_id).
 * Deducts the seed-declared STAR cost atomically — insufficient balance
 * returns 402 and no run is created. Returns the new row + reducer state
 * primed on the start step.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { startExpeditionRun } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, tokenId, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
  expedition_id: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(bodySchema, body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { address, token_id: tid, expedition_id } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const rateLimited = applyRateLimit(address, 'expeditions/start');
    if (rateLimited) return rateLimited;

    const result = startExpeditionRun(address, tid, expedition_id);
    return NextResponse.json({ success: true, run: result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to start expedition';
    const status =
      msg === 'EXPEDITION_NOT_FOUND'
        ? 404
        : msg === 'ALREADY_ACTIVE'
          ? 409
          : msg.includes('Insufficient')
            ? 402
            : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
