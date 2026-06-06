/**
 * POST /api/sanctuary/expeditions/abandon
 *
 * Abandon an active expedition run. Idempotent on already-ended rows.
 * The STAR cost paid at start is NOT refunded — abandoning is a choice
 * the player makes about a run they paid into.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { abandonExpeditionRun } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, tokenId, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
  row_id: z.coerce.number().int().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(bodySchema, body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { address, token_id: tid, row_id } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const rateLimited = applyRateLimit(address, 'expeditions/abandon');
    if (rateLimited) return rateLimited;

    const result = abandonExpeditionRun(address, tid, row_id);
    return NextResponse.json({ success: true, run: result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to abandon expedition';
    const status =
      msg === 'NOT_FOUND' || msg === 'EXPEDITION_NOT_FOUND' ? 404 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
