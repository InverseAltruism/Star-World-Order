/**
 * Chat API Route
 * 
 * GET /api/chat - Get recent chat messages
 * POST /api/chat - Send a new chat message
 */

import { NextRequest, NextResponse } from 'next/server';
import { addChatMessage, getChatMessages, getChatMessagesSince } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const since = searchParams.get('since');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    
    const messages = since 
      ? getChatMessagesSince(since)
      : getChatMessages(Math.min(limit, 200)); // Cap at 200 messages
    
    return NextResponse.json({
      success: true,
      messages,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to get chat messages:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get messages' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { senderAddress, message, messageType, displayName } = body;
    
    if (!senderAddress || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Validate message type
    const validTypes = ['chat', 'system', 'emote'];
    const type = validTypes.includes(messageType) ? messageType : 'chat';
    
    // Limit message length
    const trimmedMessage = message.slice(0, 500);
    
    const newMessage = addChatMessage(
      senderAddress,
      trimmedMessage,
      type,
      displayName
    );
    
    return NextResponse.json({
      success: true,
      message: newMessage,
    });
  } catch (error) {
    console.error('Failed to send chat message:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
