/**
 * POST /api/sanctuary/quests-v2/start
 *
 * Start a STAR-only quest run. Wallet-authenticated (the wager stakes real STAR).
 * Gates on resources, pays the (charm-discounted) resource cost, stakes STAR for
 * wagers, freezes the roll, and consumes one charm charge. The outcome is sealed
 * at start and revealed on claim after the duration elapses.
 *
 * Body: { address, token_id, quest_key, tier?, stake?, charm_key? }
 * Response:
 *   200 { success, run, resources }
 *   400 validation · 401 auth · 402 insufficient STAR
 *   409 already active · 422 insufficient resources / bad tier · 429 rate limited
 * [SWO_V2_SANCTUARY_QUESTS_V2]
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { startSanctuaryQuestV2 } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, tokenId, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
  quest_key: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  tier: z.enum(['safe', 'risky', 'reckless']).optional(),
  stake: z.number().int().min(0).max(100000).optional(),
  charm_key: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/).optional(),
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
    const { address, token_id, quest_key, tier, stake, charm_key } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }
    const rateLimited = applyRateLimit(address, 'quests-v2/start');
    if (rateLimited) return rateLimited;

    const result = startSanctuaryQuestV2(address, token_id, quest_key, {
      tier, stake, charmKey: charm_key ?? null,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const code = (error as { code?: string }).code;
    const msg = error instanceof Error ? error.message : 'Failed to start quest';
    if (code === 'QUEST_NOT_FOUND') return NextResponse.json({ success: false, error: 'Quest not found' }, { status: 404 });
    if (code === 'QUEST_ALREADY_ACTIVE') return NextResponse.json({ success: false, error: 'That quest is already in progress' }, { status: 409 });
    if (code === 'TIER_REQUIRED') return NextResponse.json({ success: false, error: 'Pick a difficulty tier for this wager' }, { status: 422 });
    if (code === 'BAD_STAKE') return NextResponse.json({ success: false, error: 'Pick one of the fixed stake amounts (5 / 15 / 30 STAR)' }, { status: 422 });
    if (code === 'INSUFFICIENT_RESOURCES') return NextResponse.json({ success: false, error: msg, code }, { status: 422 });
    if (msg.includes('Insufficient STAR')) return NextResponse.json({ success: false, error: msg }, { status: 402 });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
