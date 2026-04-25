/**
 * POST /api/sanctuary/star/spend
 *
 * Spend STAR from a wallet's balance. Called by the Shop buy flow once the
 * shop validates the item. Wallet-authenticated so the holder must consent
 * to the deduction. Returns 402 (Payment Required) when balance < cost.
 *
 * Body: { address, amount, source }
 *   source: short tag like `shop:hat_acorn` for ledger / analytics.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { spendStar } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { ethAddress, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({
  address: ethAddress,
  amount: z.coerce.number().int().min(1).max(1_000_000),
  source: z.string().min(1).max(64),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(bodySchema, body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }

    const { address, amount, source } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const result = spendStar(address, amount, source);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to spend STAR';
    const status = msg.includes('Insufficient') ? 402 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
