/**
 * POST /api/sanctuary/charms/buy
 *
 * Buy a functional charm (luck / resource-discount / STAR-boost). Wallet-
 * authenticated; spends STAR and adds charges to the wallet's charm stock.
 *
 * Body: { address, item_key }
 * Response:
 *   200 { success, item, balance, charges }
 *   400 validation · 401 auth · 402 insufficient STAR · 404 unknown charm · 429 rate limited
 * [SWO_V2_SANCTUARY_QUESTS_V2]
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buyCharm } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({
  address: ethAddress,
  item_key: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
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
    const { address, item_key } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }
    const rateLimited = applyRateLimit(address, 'charms/buy');
    if (rateLimited) return rateLimited;

    const result = buyCharm(address, item_key);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const code = (error as { code?: string }).code;
    const msg = error instanceof Error ? error.message : 'Failed to buy charm';
    if (code === 'CHARM_NOT_FOUND') return NextResponse.json({ success: false, error: 'Charm not found' }, { status: 404 });
    if (msg.includes('Insufficient STAR')) return NextResponse.json({ success: false, error: msg }, { status: 402 });
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
