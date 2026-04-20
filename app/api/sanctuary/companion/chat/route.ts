import { NextRequest, NextResponse } from 'next/server';
import { chatWithCompanion, getCompanionChatHistory } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const tokenId = searchParams.get('token_id');
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);

    if (!address || !tokenId) {
      return NextResponse.json({ success: false, error: 'address and token_id required' }, { status: 400 });
    }

    const messages = getCompanionChatHistory(address, parseInt(tokenId, 10), Math.min(limit, 100));
    return NextResponse.json({ success: true, messages: messages.reverse() });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to get chat' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, token_id, message } = body;

    if (!address || token_id === undefined || !message) {
      return NextResponse.json({ success: false, error: 'address, token_id, and message required' }, { status: 400 });
    }

    const trimmed = String(message).trim().slice(0, 500);
    if (!trimmed) {
      return NextResponse.json({ success: false, error: 'Message cannot be empty' }, { status: 400 });
    }

    const result = chatWithCompanion(address, token_id, trimmed);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to chat';
    const status = msg.includes('No active companion') ? 404 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
