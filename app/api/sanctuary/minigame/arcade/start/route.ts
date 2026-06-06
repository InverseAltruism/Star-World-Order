/**
 * POST /api/sanctuary/minigame/arcade/start
 *
 * Open an arcade minigame wager: pay the resource entry cost + stake STAR.
 * Wallet-authenticated. Body: { address, game_id, stake }  (stake ∈ 5/15/30)
 * Response: 200 { success, resources, balance, stake, game_id }
 *           400 validation · 401 auth · 402 insufficient STAR
 *           422 INSUFFICIENT_RESOURCES / BAD_STAKE · 429 rate limited
 * [SWO_V2_SANCTUARY_QUESTS_V2]
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { startArcadeRun } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({
  address: ethAddress,
  game_id: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/),
  stake: z.number().int().min(1).max(1000),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(bodySchema, body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { address, game_id, stake } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    const rateLimited = applyRateLimit(address, 'minigame/arcade-start');
    if (rateLimited) return rateLimited;

    const result = startArcadeRun(address, game_id, stake);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const code = (error as { code?: string }).code;
    const msg = error instanceof Error ? error.message : 'Failed to start game';
    if (code === 'BAD_STAKE') return NextResponse.json({ success: false, error: 'Pick a stake of 5, 15, or 30 STAR' }, { status: 422 });
    if (code === 'INSUFFICIENT_RESOURCES') {
      return NextResponse.json({ success: false, error: 'Your Skrumpey is too tired — rest to restore energy first.', code }, { status: 422 });
    }
    if (msg.includes('Insufficient STAR')) return NextResponse.json({ success: false, error: msg }, { status: 402 });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
