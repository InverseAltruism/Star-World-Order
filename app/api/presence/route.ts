/**
 * Presence API Route
 * 
 * GET /api/presence - Get online users
 * POST /api/presence - Update user presence
 * DELETE /api/presence - Remove user presence
 */

import { NextResponse } from 'next/server';
import { route } from '@/lib/api/route';
import {
  getOnlineUsers,
  updateOnlinePresence,
  removeOnlinePresence
} from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';

export const GET = route({ error: 'Failed to get online users' }, async () => {
  const users = getOnlineUsers();
  
  return NextResponse.json({
    success: true,
    users,
    count: users.length,
    timestamp: new Date().toISOString(),
  });
});

export const POST = route({ error: 'Failed to update presence' }, async (request) => {
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
});

export const DELETE = route({ error: 'Failed to remove presence' }, async (request) => {
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
});
