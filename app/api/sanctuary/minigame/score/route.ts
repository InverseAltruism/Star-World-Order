import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { submitMinigameScore, SANCTUARY_MINIGAMES } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, tokenId, parseBody, formatZodError } from '@/lib/sanctuary/validation';
import { verifyTokenOwnership } from '@/lib/skrumpeyOwnership';

const GAME_IDS = Object.keys(SANCTUARY_MINIGAMES) as [string, ...string[]];

const bodySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
  game_id: z.enum(GAME_IDS),
  score: z.number().int().min(0).max(99999),
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

    const { address, token_id: tid, game_id, score } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const rateLimited = applyRateLimit(address, 'minigame/score');
    if (rateLimited) return rateLimited;

    const owns = await verifyTokenOwnership(address, tid);
    if (!owns) {
      return NextResponse.json(
        { success: false, error: 'You do not own this Skrumpey.' },
        { status: 403 },
      );
    }

    const result = submitMinigameScore(address, tid, game_id, score);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record score';
    const status = message.includes('Invalid minigame') ? 400
      : message.includes('Invalid score') ? 400
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
