import { NextRequest, NextResponse } from 'next/server';
import { completeActivity } from '@/lib/db';

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

    const result = completeActivity(address, token_id);
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
