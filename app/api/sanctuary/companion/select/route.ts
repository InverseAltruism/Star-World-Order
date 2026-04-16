import { NextRequest, NextResponse } from 'next/server';
import { selectCompanion } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { checkStarOwnershipBatched } from '@/lib/starSkrumpey';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, tokenId } = body;

    if (!walletAddress || tokenId == null) {
      return NextResponse.json(
        { success: false, error: 'walletAddress and tokenId are required' },
        { status: 400 }
      );
    }

    const auth = await verifyWalletAccess(request, walletAddress);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const ownedTokens = await checkStarOwnershipBatched(walletAddress);
    const ownsToken = ownedTokens.some(t => t.tokenId === tokenId);
    if (!ownsToken) {
      return NextResponse.json(
        { success: false, error: 'You do not own this Star Skrumpey' },
        { status: 403 }
      );
    }

    const companion = selectCompanion(walletAddress, tokenId);
    return NextResponse.json({ success: true, companion });
  } catch (error) {
    console.error('Sanctuary companion select error:', error);
    return NextResponse.json({ success: false, error: 'Failed to select companion' }, { status: 500 });
  }
}
