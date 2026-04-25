/**
 * GET /api/sanctuary/star/balance?wallet=0x...
 *
 * Returns the wallet's current STAR balance and lifetime earned. Public read
 * — anyone can query any wallet's balance (it's already on a public ledger).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getStarBalance } from '@/lib/db';
import { ethAddress, parseSearchParams, formatZodError } from '@/lib/sanctuary/validation';

const querySchema = z.object({
  wallet: ethAddress,
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseSearchParams(querySchema, searchParams);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }
    const { wallet } = parsed.data;
    const row = getStarBalance(wallet);
    return NextResponse.json({
      success: true,
      wallet: row.wallet_address,
      balance: row.balance,
      lifetime_earned: row.lifetime_earned,
      updated_at: row.updated_at,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to get STAR balance';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
