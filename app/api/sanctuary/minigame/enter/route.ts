/**
 * POST /api/sanctuary/minigame/enter
 *
 * Pay the resource entry cost for a minigame (games tire the companion). Wallet-
 * authenticated. Returns the updated pool; the client launches the game on success.
 *
 * Body: { address }
 * Response:
 *   200 { success, resources } · 400 validation · 401 auth
 *   422 INSUFFICIENT_RESOURCES · 429 rate limited
 * [SWO_V2_SANCTUARY_ECONOMY_REDESIGN]
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { spendWalletResources, MINIGAME_ENTRY_COST } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({ address: ethAddress });

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
    const { address } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }
    const rateLimited = applyRateLimit(address, 'minigame/enter');
    if (rateLimited) return rateLimited;

    const resources = spendWalletResources(address, MINIGAME_ENTRY_COST);
    return NextResponse.json({ success: true, resources });
  } catch (error) {
    const code = (error as { code?: string }).code;
    const msg = error instanceof Error ? error.message : 'Failed to enter minigame';
    if (code === 'INSUFFICIENT_RESOURCES') {
      return NextResponse.json(
        { success: false, error: 'Your Skrumpey is too tired — rest to restore energy first.', code },
        { status: 422 },
      );
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
