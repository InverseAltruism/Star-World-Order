/**
 * Direct Messages API Route
 * 
 * GET /api/messages - Get conversations or specific conversation messages
 * POST /api/messages - Send a new message
 * PATCH /api/messages - Mark messages as read
 * DELETE /api/messages - Delete a message (sender only)
 * 
 * Query parameters for GET:
 * - address: User's wallet address
 * - type: 'conversations' (default) | 'conversation' | 'unread'
 * - otherAddress: (required for type='conversation') Get messages with this user
 * - limit: Number of messages to return (default 50)
 * - offset: Offset for pagination (default 0)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getConversations,
  getConversation,
  sendDirectMessage,
  markMessagesAsRead,
  markMessageAsRead,
  getUnreadMessageCount,
  deleteMessage,
  createNotification,
  getUserProfile,
  areFriends,
} from '@/lib/db';
import { logger } from '@/lib/logger';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { escapeHtml, isValidWalletAddress } from '@/lib/sanitize';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const type = searchParams.get('type') || 'conversations';
    const otherAddress = searchParams.get('otherAddress');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Address is required' },
        { status: 400 }
      );
    }

    switch (type) {
      case 'conversations': {
        const conversations = getConversations(address);
        const unreadTotal = getUnreadMessageCount(address);
        return NextResponse.json({
          success: true,
          conversations,
          unreadTotal,
        });
      }

      case 'conversation': {
        if (!otherAddress) {
          return NextResponse.json(
            { success: false, error: 'otherAddress is required for conversation' },
            { status: 400 }
          );
        }
        
        const messages = getConversation(address, otherAddress, limit, offset);
        
        // Mark messages as read when fetching conversation
        markMessagesAsRead(address, otherAddress);
        
        return NextResponse.json({
          success: true,
          messages,
          hasMore: messages.length === limit,
        });
      }

      case 'unread': {
        const count = getUnreadMessageCount(address);
        return NextResponse.json({
          success: true,
          unreadCount: count,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid type parameter' },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error('Messages API GET error:', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { senderAddress, recipientAddress, message } = body;

    if (!senderAddress || !recipientAddress || !message) {
      return NextResponse.json(
        { success: false, error: 'senderAddress, recipientAddress, and message are required' },
        { status: 400 }
      );
    }

    // Validate wallet address formats
    if (!isValidWalletAddress(senderAddress) || !isValidWalletAddress(recipientAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid wallet address format' },
        { status: 400 }
      );
    }

    // Verify wallet ownership
    const auth = await verifyWalletAccess(request, senderAddress);
    if (!auth.valid) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      );
    }

    // Validate message length
    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Message cannot be empty' },
        { status: 400 }
      );
    }

    if (trimmedMessage.length > 2000) {
      return NextResponse.json(
        { success: false, error: 'Message too long (max 2000 characters)' },
        { status: 400 }
      );
    }

    // Sanitize message content
    const sanitizedMessage = escapeHtml(trimmedMessage);

    // Check if users are friends (optional - can allow non-friend messaging)
    const friendsCheck = areFriends(senderAddress, recipientAddress);
    if (!friendsCheck) {
      // For now, allow messaging non-friends but could restrict in future
      logger.debug('Message sent to non-friend', { sender: senderAddress, recipient: recipientAddress });
    }

    const result = sendDirectMessage(senderAddress, recipientAddress, sanitizedMessage);
    
    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Failed to send message (user may be blocked)' },
        { status: 400 }
      );
    }

    // Create notification for the recipient
    const senderProfile = getUserProfile(senderAddress);
    const senderName = senderProfile?.display_name || `${senderAddress.slice(0, 6)}...${senderAddress.slice(-4)}`;
    
    // Truncate message for notification preview (already sanitized)
    const messagePreview = sanitizedMessage.length > 50 
      ? sanitizedMessage.substring(0, 50) + '...' 
      : sanitizedMessage;
    
    createNotification(recipientAddress, {
      type: 'social',
      title: `Message from ${escapeHtml(senderName)}`,
      message: messagePreview,
      link: `/profile?tab=messages&chat=${senderAddress}`,
      icon: '💬',
    });

    logger.info('Direct message sent', { 
      from: senderAddress.slice(0, 10), 
      to: recipientAddress.slice(0, 10),
      messageLength: trimmedMessage.length,
    });

    return NextResponse.json({
      success: true,
      message: result,
    });
  } catch (error) {
    logger.error('Messages API POST error:', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to send message' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, action, messageId, senderAddress } = body;

    if (!walletAddress || !action) {
      return NextResponse.json(
        { success: false, error: 'walletAddress and action are required' },
        { status: 400 }
      );
    }

    const auth = await verifyWalletAccess(request, walletAddress);
    if (!auth.valid) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      );
    }

    switch (action) {
      case 'markRead': {
        if (messageId) {
          markMessageAsRead(messageId);
        } else if (senderAddress) {
          markMessagesAsRead(walletAddress, senderAddress);
        } else {
          return NextResponse.json(
            { success: false, error: 'messageId or senderAddress is required' },
            { status: 400 }
          );
        }
        
        return NextResponse.json({
          success: true,
          message: 'Messages marked as read',
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error('Messages API PATCH error:', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to update messages' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get('id');
    const senderAddress = searchParams.get('senderAddress');

    if (!messageId || !senderAddress) {
      return NextResponse.json(
        { success: false, error: 'id and senderAddress are required' },
        { status: 400 }
      );
    }

    const auth = await verifyWalletAccess(request, senderAddress);
    if (!auth.valid) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: 401 }
      );
    }

    const success = deleteMessage(parseInt(messageId, 10), senderAddress);
    
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Message not found or not authorized to delete' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Message deleted',
    });
  } catch (error) {
    logger.error('Messages API DELETE error:', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to delete message' },
      { status: 500 }
    );
  }
}
