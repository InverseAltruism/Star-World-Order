/**
 * Chat API Route
 * 
 * GET /api/chat - Get recent chat messages
 * POST /api/chat - Send a new chat message
 */

import { NextRequest, NextResponse } from 'next/server';
import { addChatMessage, getChatMessages, getChatMessagesSince, getDatabase } from '@/lib/db';
import { isStarSkrumpeyId } from '@/lib/starSkrumpey';

// Import members API cache directly (shared in-memory cache)
// Access the same cache that /api/members uses
import { holderCache } from '../members/route';

/**
 * Get Star holders from members cache
 * Uses the same cache as /api/members - no RPC calls, instant lookup
 */
function getStarHoldersFromCache(): Map<string, boolean> {
  const holderMap = new Map<string, boolean>();
  
  // Check if members cache exists and is valid
  if (holderCache && holderCache.data) {
    for (const member of holderCache.data) {
      holderMap.set(member.address.toLowerCase(), true);
    }
  }
  
  return holderMap;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const since = searchParams.get('since');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    
    const messages = since 
      ? getChatMessagesSince(since)
      : getChatMessages(Math.min(limit, 200)); // Cap at 200 messages
    
    // Get unique sender addresses for efficient lookup
    const senderAddresses = [...new Set(
      messages
        .map((msg: any) => msg.sender_address?.toLowerCase())
        .filter((addr): addr is string => !!addr)
    )];
    
    if (senderAddresses.length === 0) {
      // No messages or no valid addresses
      return NextResponse.json({
        success: true,
        messages: messages.map((msg: any) => ({ ...msg, isStarHolder: false })),
        timestamp: new Date().toISOString(),
      });
    }
    
    // Efficient database lookup: Check both online_presence AND user_profiles
    // This covers: currently online users (presence) + users who set Star avatar (profiles)
    // No RPC calls needed - all data is in the database!
    const db = getDatabase();
    const placeholders = senderAddresses.map(() => '?').join(',');
    
    // Query online_presence for currently online users
    const presenceStmt = db.prepare(`
      SELECT wallet_address, star_variant, nft_token_id
      FROM online_presence
      WHERE wallet_address IN (${placeholders})
    `);
    const presenceData = presenceStmt.all(...senderAddresses) as Array<{
      wallet_address: string;
      star_variant: string | null;
      nft_token_id: number | null;
    }>;
    
    // Query user_profiles for avatar token IDs
    const profileStmt = db.prepare(`
      SELECT wallet_address, avatar_url
      FROM user_profiles
      WHERE wallet_address IN (${placeholders}) AND avatar_url IS NOT NULL
    `);
    const profileData = profileStmt.all(...senderAddresses) as Array<{
      wallet_address: string;
      avatar_url: string | null;
    }>;
    
    // Get Star holders from members cache (all Star holders, works for chat history too!)
    // This uses the same in-memory cache as /api/members - instant, no RPC calls
    const starHoldersCache = getStarHoldersFromCache();
    
    // Build Star holder map from multiple sources (in order of preference)
    const starHolderMap = new Map<string, boolean>();
    
    // 1. Check members cache first (most comprehensive - covers all Star holders)
    for (const address of senderAddresses) {
      if (starHoldersCache.has(address)) {
        starHolderMap.set(address, true);
      }
    }
    
    // 2. Check online_presence data (for currently online users - may have more recent data)
    for (const presence of presenceData) {
      const address = presence.wallet_address?.toLowerCase();
      if (!address) continue;
      
      const isStarHolder = !!(
        presence.star_variant || // Has star_variant set
        (presence.nft_token_id && isStarSkrumpeyId(presence.nft_token_id)) // Or nft_token_id is a Star Skrumpey
      );
      if (isStarHolder) {
        starHolderMap.set(address, true);
      }
    }
    
    // 3. Check user_profiles data (avatar_url as token ID - for users who set Star avatar)
    for (const profile of profileData) {
      const address = profile.wallet_address?.toLowerCase();
      if (!address) continue;
      
      // Skip if already determined to be Star holder
      if (starHolderMap.get(address)) continue;
      
      // Check if avatar_url is a Star Skrumpey token ID
      const avatarTokenId = profile.avatar_url ? parseInt(profile.avatar_url, 10) : null;
      if (avatarTokenId && !isNaN(avatarTokenId) && isStarSkrumpeyId(avatarTokenId)) {
        starHolderMap.set(address, true);
      }
    }
    
    // Add isStarHolder flag to each message (default to false if not found)
    const messagesWithStarStatus = messages.map((msg: any) => ({
      ...msg,
      isStarHolder: starHolderMap.get(msg.sender_address?.toLowerCase() || '') || false,
    }));
    
    return NextResponse.json({
      success: true,
      messages: messagesWithStarStatus,
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
    const { senderAddress, message, messageType } = body;
    
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
    
    // Try to get display name from user profile
    const { getUserProfile } = await import('@/lib/db');
    const profile = getUserProfile(senderAddress);
    const displayName = profile?.display_name || undefined;
    
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
