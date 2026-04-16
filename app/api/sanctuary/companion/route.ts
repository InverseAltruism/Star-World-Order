import { NextRequest, NextResponse } from 'next/server';
import { getActiveCompanion, getAllCompanions } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ success: false, error: 'Address is required' }, { status: 400 });
    }

    const all = searchParams.get('all') === 'true';

    if (all) {
      const companions = getAllCompanions(address);
      return NextResponse.json({ success: true, companions });
    }

    const companion = getActiveCompanion(address);
    return NextResponse.json({ success: true, companion });
  } catch (error) {
    console.error('Sanctuary companion GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch companion' }, { status: 500 });
  }
}
