import { NextRequest, NextResponse } from 'next/server';
import { completeActivity } from '@/lib/db';
import { isStarSkrumpeyId } from '@/lib/starSkrumpey';
import { verifyWalletAccess } from '@/lib/walletAuth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, token_id } = body;

    if (!address || token_id === undefined) {
      return NextResponse.json(
        { success: false, error: 'address and token_id are required' },
        { status: 400 }
      );
    }

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const isStar = isStarSkrumpeyId(token_id);
    const result = completeActivity(address, token_id, { isStar });
    if (!result) {
      return NextResponse.json(
        { success: false, error: 'No activity to complete (still in progress or none active)' },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to complete activity';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
