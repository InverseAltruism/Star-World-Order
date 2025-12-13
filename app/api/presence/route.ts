/**
 * Presence API Route
 * 
 * GET /api/presence - Get online users
 * POST /api/presence - Update user presence
 * DELETE /api/presence - Remove user presence
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getOnlineUsers, 
  updateOnlinePresence, 
  removeOnlinePresence 
} from '@/lib/db';

export async function GET() {
  try {
    const users = getOnlineUsers();
    
    return NextResponse.json({
      success: true,
      users,
      count: users.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to get online users:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get online users' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, displayName, nftTokenId, starVariant, status, lastMessage } = body;
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address required' },
        { status: 400 }
      );
    }
    
    // Validate status
    const validStatuses = ['online', 'away', 'busy'];
    const validStatus = validStatuses.includes(status) ? status : 'online';
    
    const presence = updateOnlinePresence(walletAddress, {
      displayName,
      nftTokenId,
      starVariant,
      status: validStatus,
      lastMessage: lastMessage?.slice(0, 200), // Limit last message length
    });
    
    return NextResponse.json({
      success: true,
      presence,
    });
  } catch (error) {
    console.error('Failed to update presence:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update presence' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress } = body;
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address required' },
        { status: 400 }
      );
    }
    
    removeOnlinePresence(walletAddress);
    
    return NextResponse.json({
      success: true,
      message: 'Presence removed',
    });
  } catch (error) {
    console.error('Failed to remove presence:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove presence' },
      { status: 500 }
    );
  }
}
