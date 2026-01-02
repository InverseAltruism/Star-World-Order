/**
 * Profile API Route
 * 
 * GET /api/profile?address=0x... - Get user profile
 * POST /api/profile - Update user profile
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserProfile, updateUserProfile } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    
    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Address is required' },
        { status: 400 }
      );
    }
    
    const profile = getUserProfile(address);
    
    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('Failed to get user profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get profile' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, displayName, bio, avatarTokenId, displayedBadges, isDemoMode } = body;
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address is required' },
        { status: 400 }
      );
    }
    
    // Prevent profile updates in Demo Mode
    // Demo Mode is when a user enters a wallet address without actually connecting their wallet
    if (isDemoMode === true) {
      return NextResponse.json(
        { success: false, error: 'Profile updates are not allowed in Demo Mode. Please connect your wallet.' },
        { status: 403 }
      );
    }
    
    // Validate display name
    if (displayName && typeof displayName === 'string') {
      const trimmed = displayName.trim();
      if (trimmed.length < 3 || trimmed.length > 20) {
        return NextResponse.json(
          { success: false, error: 'Display name must be 3-20 characters' },
          { status: 400 }
        );
      }
      // Only allow alphanumeric, spaces, underscores, and hyphens
      if (!/^[a-zA-Z0-9 _-]+$/.test(trimmed)) {
        return NextResponse.json(
          { success: false, error: 'Display name can only contain letters, numbers, spaces, underscores, and hyphens' },
          { status: 400 }
        );
      }
    }
    
    // Validate bio
    if (bio && typeof bio === 'string' && bio.length > 200) {
      return NextResponse.json(
        { success: false, error: 'Bio must be 200 characters or less' },
        { status: 400 }
      );
    }
    
    // Validate avatar token ID
    if (avatarTokenId !== undefined && avatarTokenId !== null && typeof avatarTokenId !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Avatar token ID must be a number' },
        { status: 400 }
      );
    }
    
    // Validate displayed badges (max 3)
    if (displayedBadges && Array.isArray(displayedBadges)) {
      if (displayedBadges.length > 3) {
        return NextResponse.json(
          { success: false, error: 'Maximum 3 badges can be displayed' },
          { status: 400 }
        );
      }
    }
    
    const profile = updateUserProfile(walletAddress, {
      displayName: displayName?.trim(),
      bio: bio?.trim(),
      avatarTokenId: avatarTokenId,
      displayedBadges: displayedBadges || undefined,
    });
    
    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('Failed to update user profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
