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
    const { walletAddress, displayName, bio, avatarUrl } = body;
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address is required' },
        { status: 400 }
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
    
    const profile = updateUserProfile(walletAddress, {
      displayName: displayName?.trim(),
      bio: bio?.trim(),
      avatarUrl,
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
