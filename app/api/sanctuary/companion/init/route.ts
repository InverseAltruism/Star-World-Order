import { NextRequest, NextResponse } from 'next/server';
import { selectCompanion } from '@/lib/db';
import { verifyTokenOwnership } from '@/lib/skrumpeyOwnership';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, token_id } = body;

    if (!address || token_id == null) {
      return NextResponse.json(
        { success: false, error: 'address and token_id are required' },
        { status: 400 }
      );
    }

    const ownsToken = await verifyTokenOwnership(address, token_id);
    if (!ownsToken) {
      return NextResponse.json(
        { success: false, error: 'You do not own this Skrumpey' },
        { status: 403 }
      );
    }

    const companion = selectCompanion(address, token_id);

    return NextResponse.json({ success: true, companion });
  } catch (error) {
    console.error('Sanctuary companion init error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to initialize companion' },
      { status: 500 }
    );
  }
}
