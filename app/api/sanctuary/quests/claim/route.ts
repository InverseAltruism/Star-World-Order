import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { claimSanctuaryQuestReward } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, tokenId, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
  quest_id: z.coerce.number().int().min(1, 'quest_id is required'),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(bodySchema, body);

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }

    const { address, token_id: tid, quest_id } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const rateLimited = applyRateLimit(address, 'quests/claim');
    if (rateLimited) return rateLimited;

    const result = claimSanctuaryQuestReward(address, tid, quest_id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to claim reward';
    const status = msg.includes('not found') ? 404 : msg.includes('not completed') || msg.includes('already claimed') ? 409 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
