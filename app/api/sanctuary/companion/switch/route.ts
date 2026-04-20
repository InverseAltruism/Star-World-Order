import { NextRequest, NextResponse } from 'next/server';
import { switchCompanion } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { fetchUserSkrumpeys, hasStarSkrumpey } from '@/lib/starSkrumpey';

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

    const ownedTokens = await fetchUserSkrumpeys(walletAddress);
    const ownsToken = ownedTokens.some(t => t.tokenId === tokenId);
    if (!ownsToken) {
      return NextResponse.json(
        { success: false, error: 'You do not own this Skrumpey' },
        { status: 403 }
      );
    }

    const isStar = hasStarSkrumpey(ownedTokens);
    const companion = switchCompanion(walletAddress, tokenId);
    return NextResponse.json({ success: true, companion, isStar });
  } catch (error) {
    console.error('Sanctuary companion switch error:', error);
    return NextResponse.json({ success: false, error: 'Failed to switch companion' }, { status: 500 });
  }
}
