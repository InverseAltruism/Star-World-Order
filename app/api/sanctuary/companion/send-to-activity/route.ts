import { NextRequest, NextResponse } from 'next/server';
import { sendToActivity } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, token_id, location_id } = body;

    if (!address || token_id === undefined || !location_id) {
      return NextResponse.json(
        { success: false, error: 'address, token_id, and location_id are required' },
        { status: 400 }
      );
    }

    const auth = await verifyWalletAccess(request, address);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const result = sendToActivity(address, token_id, location_id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send to activity';
    const status = message.includes('No active companion') ? 404
      : message.includes('already on an activity') ? 409
      : message.includes('not found') ? 404
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
