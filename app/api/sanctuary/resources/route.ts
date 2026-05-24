import { NextRequest, NextResponse } from 'next/server';
import { getWalletResources } from '@/lib/db';
import { ethAddress } from '@/lib/sanctuary/validation';

// GET /api/sanctuary/resources?address=0x... — the shared per-wallet resource
// pool (decayed to now) + per-action gates (uses left + cooldown) for the UI.
// Read-only, so no wallet signature required (mirrors the companion GET).
export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get('address');
    const parsed = ethAddress.safeParse(address);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'address is required' },
        { status: 400 },
      );
    }
    const state = getWalletResources(parsed.data);
    return NextResponse.json({ success: true, ...state });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load resources';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
