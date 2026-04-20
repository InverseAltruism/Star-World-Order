import { NextRequest, NextResponse } from 'next/server';
import { interactWithCompanion } from '@/lib/db';
import { isStarSkrumpeyId } from '@/lib/starSkrumpey';

const VALID_ACTIONS = ['feed', 'pet', 'talk'] as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, token_id, action } = body;

    if (!address || token_id === undefined || !action) {
      return NextResponse.json(
        { success: false, error: 'address, token_id, and action are required' },
        { status: 400 }
      );
    }

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { success: false, error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 }
      );
    }

    const isStar = isStarSkrumpeyId(token_id);
    const result = interactWithCompanion(address, token_id, action, { isStar });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to interact';
    const status = message.includes('No active companion') ? 404
      : message.includes('Daily interaction limit') ? 429
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
