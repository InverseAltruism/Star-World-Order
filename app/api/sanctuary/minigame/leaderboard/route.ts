import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getMinigameLeaderboard,
  getMinigamePersonalBest,
  SANCTUARY_MINIGAMES,
  getMinigameDef,
} from '@/lib/db';
import { ethAddress, tokenId, parseSearchParams, formatZodError } from '@/lib/sanctuary/validation';

const GAME_IDS = Object.keys(SANCTUARY_MINIGAMES) as [string, ...string[]];

const querySchema = z.object({
  game_id: z.enum(GAME_IDS),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  address: ethAddress.optional(),
  token_id: tokenId.optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseSearchParams(querySchema, searchParams);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 },
      );
    }

    const { game_id, limit, address, token_id: tid } = parsed.data;
    const def = getMinigameDef(game_id);
    if (!def) {
      return NextResponse.json(
        { success: false, error: 'Unknown minigame' },
        { status: 404 },
      );
    }

    const leaderboard = getMinigameLeaderboard(game_id, limit);

    let personalBest = null;
    if (address && tid !== undefined) {
      personalBest = getMinigamePersonalBest(address, tid, game_id);
    }

    return NextResponse.json({
      success: true,
      game: def,
      leaderboard,
      personal_best: personalBest,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch leaderboard';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
