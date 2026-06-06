import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { interactWithCompanionV15 } from '@/lib/db';
import { isStarSkrumpeyId } from '@/lib/starSkrumpey';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, tokenId, interactAction, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({
  walletAddress: ethAddress.optional(),
  address: ethAddress.optional(),
  token_id: tokenId,
  action: interactAction,
}).refine((d) => d.walletAddress || d.address, {
  message: 'walletAddress or address is required',
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

    const { walletAddress, address: legacyAddress, token_id: tid, action } = parsed.data;
    const resolvedAddress = (walletAddress || legacyAddress)!;

    const auth = await verifyWalletAccess(request, resolvedAddress);
    if (!auth.valid) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 },
      );
    }

    const rateLimited = applyRateLimit(resolvedAddress, 'companion/interact');
    if (rateLimited) return rateLimited;

    const isStar = isStarSkrumpeyId(tid);
    const result = interactWithCompanionV15(resolvedAddress, tid, action, { isStar });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to interact';
    const name = error instanceof Error ? error.name : '';
    const status = message.includes('No active companion') ? 404
      : message.includes('Daily interaction limit') ? 429
      : name === 'SleepingCompanionError' || message.includes('Companion is sleeping') ? 409
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
