import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { chatWithCompanion, getCompanionChatHistory } from '@/lib/db';
import { ethAddress, tokenId, paginationLimit, parseSearchParams, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const getSchema = z.object({
  address: ethAddress,
  token_id: tokenId,
  limit: paginationLimit(100, 50),
});

const postSchema = z.object({
  address: ethAddress,
  token_id: tokenId,
  message: z.string().min(1, 'Message cannot be empty').transform((s) => s.trim().slice(0, 500)),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseSearchParams(getSchema, searchParams);

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }

    const { address, token_id: tid, limit } = parsed.data;
    const messages = getCompanionChatHistory(address, tid, limit);
    return NextResponse.json({ success: true, messages: messages.reverse() });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to get chat' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(postSchema, body);

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }

    const { address, token_id: tid, message } = parsed.data;

    if (!message) {
      return NextResponse.json({ success: false, error: 'Message cannot be empty' }, { status: 400 });
    }

    const result = chatWithCompanion(address, tid, message);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to chat';
    const status = msg.includes('No active companion') ? 404 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
