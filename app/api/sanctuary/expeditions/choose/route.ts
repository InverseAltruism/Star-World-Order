/**
 * POST /api/sanctuary/expeditions/choose
 *
 * Apply a choice to the current step of an active run. On a terminal step
 * the run is finalized in the same transaction: STAR/bond/trait are granted
 * according to the outcome scale ({@link EXPEDITION_OUTCOME_REWARD_SCALE}).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { chooseExpeditionStep } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, tokenId, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
  row_id: z.coerce.number().int().min(1),
  choice_id: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(bodySchema, body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { address, token_id: tid, row_id, choice_id } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const rateLimited = applyRateLimit(address, 'expeditions/choose');
    if (rateLimited) return rateLimited;

    const result = chooseExpeditionStep(address, tid, row_id, choice_id);
    return NextResponse.json({ success: true, run: result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to apply choice';
    const status =
      msg === 'NOT_FOUND' || msg === 'EXPEDITION_NOT_FOUND'
        ? 404
        : msg === 'NOT_ACTIVE'
          ? 409
          : msg.startsWith('expedition') // reducer programmer errors
            ? 400
            : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
