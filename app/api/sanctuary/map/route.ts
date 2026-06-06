import { NextResponse } from 'next/server';
import { getSanctuaryMapLocations, getCompanionsAtLocations } from '@/lib/db';

export async function GET() {
  try {
    const locations = getSanctuaryMapLocations();
    const companionsAtLocations = getCompanionsAtLocations();
    return NextResponse.json({ success: true, locations, companionsAtLocations });
  } catch (error) {
    console.error('Sanctuary map GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch map' }, { status: 500 });
  }
}
