import { NextRequest, NextResponse } from 'next/server';
import { getSanctuaryState } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ success: false, error: 'Address is required' }, { status: 400 });
    }

    const state = getSanctuaryState(address);
    return NextResponse.json({ success: true, ...state });
  } catch (error) {
    console.error('Sanctuary state GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch sanctuary state' }, { status: 500 });
  }
}
