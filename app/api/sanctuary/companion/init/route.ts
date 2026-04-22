import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { selectCompanion } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { verifyTokenOwnership } from '@/lib/skrumpeyOwnership';
import { applyRateLimit } from '@/lib/sanctuary/rateLimit';
import { ethAddress, tokenId, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
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

    const { address, token_id: tid } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const rateLimited = applyRateLimit(address, 'companion/init');
    if (rateLimited) return rateLimited;

    const ownsToken = await verifyTokenOwnership(address, tid);
    if (!ownsToken) {
      return NextResponse.json(
        { success: false, error: 'You do not own this Skrumpey' },
        { status: 403 },
      );
    }

    const companion = selectCompanion(address, tid);

    return NextResponse.json({ success: true, companion });
  } catch (error) {
    console.error('Sanctuary companion init error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to initialize companion' },
      { status: 500 },
    );
  }
}
