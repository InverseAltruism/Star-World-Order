import { NextRequest, NextResponse } from 'next/server';
import { interactWithCompanion } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';

const VALID_ACTIONS = ['feed', 'pet', 'talk'] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, address: legacyAddress, token_id, action } = body;
    const resolvedAddress = walletAddress || legacyAddress;

    if (!resolvedAddress || token_id === undefined || !action) {
      return NextResponse.json(
        { success: false, error: 'walletAddress, token_id, and action are required' },
        { status: 400 }
      );
    }

    const auth = await verifyWalletAccess(request, resolvedAddress);
    if (!auth.valid) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      );
    }

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { success: false, error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 }
      );
    }

    const result = interactWithCompanion(resolvedAddress, token_id, action);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to interact';
    const status = message.includes('No active companion') ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
