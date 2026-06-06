/**
 * POST /api/sanctuary/quests-v2/claim
 *
 * Claim a finished run: reveals the sealed wager outcome (or pays the earn
 * reward) and credits STAR. Wallet-authenticated.
 *
 * Body: { address, token_id, run_id }
 * Response:
 *   200 { success, outcome, starDelta, balance, ... }
 *   400 validation · 401 auth · 404 run not found
 *   409 already claimed / not ready · 429 rate limited
 * [SWO_V2_SANCTUARY_QUESTS_V2]
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { claimSanctuaryQuestV2 } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, tokenId, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
  run_id: z.number().int().positive(),
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
    const { address, token_id, run_id } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }
    const rateLimited = applyRateLimit(address, 'quests-v2/claim');
    if (rateLimited) return rateLimited;

    const result = claimSanctuaryQuestV2(address, token_id, run_id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const code = (error as { code?: string }).code;
    const msg = error instanceof Error ? error.message : 'Failed to claim quest';
    if (code === 'RUN_NOT_FOUND') return NextResponse.json({ success: false, error: 'Quest run not found' }, { status: 404 });
    if (code === 'ALREADY_CLAIMED') return NextResponse.json({ success: false, error: 'Already claimed' }, { status: 409 });
    if (code === 'NOT_READY') return NextResponse.json({ success: false, error: 'Quest is still in progress' }, { status: 409 });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
