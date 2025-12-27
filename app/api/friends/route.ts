/**
 * Friends API Route
 * 
 * GET /api/friends - Get friends list, pending requests, etc.
 * POST /api/friends - Send friend request, accept, decline, remove, or block
 * 
 * Query parameters for GET:
 * - address: User's wallet address
 * - type: 'all' | 'pending' | 'outgoing' | 'status'
 * - otherAddress: (required for type='status') Check friendship status with this address
 * 
 * Body for POST:
 * - walletAddress: User's wallet address
 * - targetAddress: Target user's wallet address
 * - action: 'send' | 'accept' | 'decline' | 'remove' | 'block'
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getFriends,
  getPendingFriendRequests,
  getOutgoingFriendRequests,
  getFriendshipStatus,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  blockUser,
  getPendingFriendRequestCount,
  createNotification,
  getUserProfile,
} from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const type = searchParams.get('type') || 'all';
    const otherAddress = searchParams.get('otherAddress');

    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Address is required' },
        { status: 400 }
      );
    }

    switch (type) {
      case 'all': {
        const friends = getFriends(address);
        const pendingCount = getPendingFriendRequestCount(address);
        return NextResponse.json({
          success: true,
          friends,
          pendingCount,
        });
      }

      case 'pending': {
        const pending = getPendingFriendRequests(address);
        return NextResponse.json({
          success: true,
          pending,
          count: pending.length,
        });
      }

      case 'outgoing': {
        const outgoing = getOutgoingFriendRequests(address);
        return NextResponse.json({
          success: true,
          outgoing,
          count: outgoing.length,
        });
      }

      case 'status': {
        if (!otherAddress) {
          return NextResponse.json(
            { success: false, error: 'otherAddress is required for status check' },
            { status: 400 }
          );
        }
        const status = getFriendshipStatus(address, otherAddress);
        return NextResponse.json({
          success: true,
          ...status,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid type parameter' },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error('Friends API GET error:', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch friends data' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, targetAddress, action } = body;

    if (!walletAddress || !targetAddress || !action) {
      return NextResponse.json(
        { success: false, error: 'walletAddress, targetAddress, and action are required' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'send': {
        const result = sendFriendRequest(walletAddress, targetAddress);
        if (!result) {
          return NextResponse.json(
            { success: false, error: 'Failed to send friend request (may already exist)' },
            { status: 400 }
          );
        }
        
        // Create notification for the target user
        const senderProfile = getUserProfile(walletAddress);
        const senderName = senderProfile?.display_name || `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        
        createNotification(targetAddress, {
          type: 'social',
          title: 'New Friend Request',
          message: `${senderName} wants to be your friend!`,
          link: '/profile?tab=settings',
          icon: '👋',
        });
        
        logger.info('Friend request sent', { from: walletAddress, to: targetAddress });
        return NextResponse.json({
          success: true,
          message: 'Friend request sent',
          friend: result,
        });
      }

      case 'accept': {
        const result = acceptFriendRequest(walletAddress, targetAddress);
        if (!result) {
          return NextResponse.json(
            { success: false, error: 'No pending friend request found' },
            { status: 404 }
          );
        }
        
        // Create notification for the requester
        const accepterProfile = getUserProfile(walletAddress);
        const accepterName = accepterProfile?.display_name || `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        
        createNotification(targetAddress, {
          type: 'social',
          title: 'Friend Request Accepted',
          message: `${accepterName} accepted your friend request!`,
          link: '/profile?tab=settings',
          icon: '🎉',
        });
        
        logger.info('Friend request accepted', { by: walletAddress, from: targetAddress });
        return NextResponse.json({
          success: true,
          message: 'Friend request accepted',
          friend: result,
        });
      }

      case 'decline': {
        const success = declineFriendRequest(walletAddress, targetAddress);
        if (!success) {
          return NextResponse.json(
            { success: false, error: 'No pending friend request found' },
            { status: 404 }
          );
        }
        
        logger.info('Friend request declined', { by: walletAddress, from: targetAddress });
        return NextResponse.json({
          success: true,
          message: 'Friend request declined',
        });
      }

      case 'remove': {
        const success = removeFriend(walletAddress, targetAddress);
        if (!success) {
          return NextResponse.json(
            { success: false, error: 'Not friends with this user' },
            { status: 404 }
          );
        }
        
        logger.info('Friend removed', { by: walletAddress, friend: targetAddress });
        return NextResponse.json({
          success: true,
          message: 'Friend removed',
        });
      }

      case 'block': {
        const result = blockUser(walletAddress, targetAddress);
        if (!result) {
          return NextResponse.json(
            { success: false, error: 'Failed to block user' },
            { status: 400 }
          );
        }
        
        logger.info('User blocked', { by: walletAddress, blocked: targetAddress });
        return NextResponse.json({
          success: true,
          message: 'User blocked',
          friend: result,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error('Friends API POST error:', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Failed to process friend request' },
      { status: 500 }
    );
  }
}
