/**
 * POST /api/sanctuary/minigame/arcade/settle
 *
 * Settle an arcade wager by score. The stake is read from the server-side
 * session (not the client) so it can't be inflated. Wallet-authenticated.
 * Body: { address, token_id, game_id, score }
 * Response: 200 { success, payout, net, won, stake, score, balance }
 *           400 validation · 401 auth · 409 NO_SESSION · 429 rate limited
 * [SWO_V2_SANCTUARY_QUESTS_V2]
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { settleArcadeRun } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, tokenId, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
  game_id: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/),
  score: z.number().int().min(0).max(1_000_000),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(bodySchema, body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { address, token_id, game_id, score } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    const rateLimited = applyRateLimit(address, 'minigame/arcade-settle');
    if (rateLimited) return rateLimited;

    const result = settleArcadeRun(address, token_id, game_id, score);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const code = (error as { code?: string }).code;
    const msg = error instanceof Error ? error.message : 'Failed to settle game';
    if (code === 'NO_SESSION') return NextResponse.json({ success: false, error: 'No open game to settle' }, { status: 409 });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
