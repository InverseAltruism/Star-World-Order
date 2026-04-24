import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPlayerState, upsertPlayerVisit, markIntroCompleted } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { ethAddress, parseSearchParams, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const querySchema = z.object({
  address: ethAddress,
});

const bodySchema = z.object({
  address: ethAddress,
  action: z.enum(['visit', 'complete-intro']),
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

    const state = getPlayerState(parsed.data.address);
    return NextResponse.json({ success: true, state });
  } catch (error) {
    console.error('Sanctuary player-state GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch player state' },
      { status: 500 },
    );
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

    const { address, action } = parsed.data;

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const state = action === 'complete-intro'
      ? markIntroCompleted(address)
      : upsertPlayerVisit(address);

    return NextResponse.json({ success: true, state });
  } catch (error) {
    console.error('Sanctuary player-state POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update player state' },
      { status: 500 },
    );
  }
}
