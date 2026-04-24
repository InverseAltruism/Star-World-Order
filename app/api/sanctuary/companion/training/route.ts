import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  startCompanionTraining,
  listTrainingTypesForLevel,
  calculateCompanionLevel,
  getActiveCompanion,
  COMPANION_TRAINING_TYPES,
} from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, tokenId, parseBody, parseSearchParams, formatZodError } from '@/lib/sanctuary/validation';

const TRAINING_TYPE_NAMES = Object.keys(COMPANION_TRAINING_TYPES) as [string, ...string[]];

const bodySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
  training_type: z.enum(TRAINING_TYPE_NAMES),
});

const querySchema = z.object({
  address: ethAddress,
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
    const { address } = parsed.data;
    const companion = getActiveCompanion(address);
    const companionLevel = companion
      ? calculateCompanionLevel(companion.companion_xp ?? 0)
      : 1;
    const available = listTrainingTypesForLevel(companionLevel);
    const all = Object.values(COMPANION_TRAINING_TYPES).sort(
      (a, b) => a.minLevel - b.minLevel || a.xpReward - b.xpReward,
    );
    return NextResponse.json({
      success: true,
      companion_level: companionLevel,
      companion_xp: companion?.companion_xp ?? 0,
      available,
      all,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch training options';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

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

    const { address, token_id: tid, training_type } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const rateLimited = applyRateLimit(address, 'companion/training');
    if (rateLimited) return rateLimited;

    const result = startCompanionTraining(address, tid, training_type);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start training';
    const status = message.includes('No active companion') ? 404
      : message.includes('already on an activity') ? 409
      : message.includes('Invalid training type') ? 400
      : message.includes('requires companion level') ? 403
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
