/**
 * Skrumpey Access API Route
 * 
 * GET /api/skrumpey-access?address=0x... - Check if wallet owns any Skrumpey NFT
 * 
 * This endpoint checks Skrumpey ownership server-side (avoids CORS issues with Magic Eden API)
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkSkrumpeyOwnership } from '@/lib/starSkrumpey';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    
    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Missing address parameter' },
        { status: 400 }
      );
    }
    
    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { success: false, error: 'Invalid address format' },
        { status: 400 }
      );
    }
    
    // Check Skrumpey ownership (uses Magic Eden API server-side, then RPC fallback)
    const result = await checkSkrumpeyOwnership(address);
    
    return NextResponse.json({
      success: true,
      hasAccess: result.hasSkrumpey,
      balance: result.balance,
      address: address.toLowerCase(),
    });
  } catch (error) {
    console.error('Failed to check Skrumpey access:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check Skrumpey ownership' },
      { status: 500 }
    );
  }
}
