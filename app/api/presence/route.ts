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
import { verifyWalletAccess } from '@/lib/walletAuth';

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
    const { walletAddress, displayName, nftTokenId, starVariant, status, lastMessage, _method } = body;
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address required' },
        { status: 400 }
      );
    }

    // Verify the caller controls walletAddress (prevents presence spoofing/removal).
    const auth = await verifyWalletAccess(request, walletAddress);
    if (!auth.valid) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Handle DELETE via POST (for sendBeacon compatibility)
    if (_method === 'DELETE') {
      removeOnlinePresence(walletAddress);
      return NextResponse.json({
        success: true,
        message: 'Presence removed',
      });
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

    const auth = await verifyWalletAccess(request, walletAddress);
    if (!auth.valid) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
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
