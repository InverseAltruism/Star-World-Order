import { NextRequest, NextResponse } from 'next/server';
import { selectCompanion, getStarSkrumpeyMetadata } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { verifyTokenOwnership } from '@/lib/skrumpeyOwnership';
import { isStarSkrumpeyId } from '@/lib/starSkrumpey';

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

    const ownsToken = await verifyTokenOwnership(walletAddress, tokenId);
    if (!ownsToken) {
      return NextResponse.json(
        { success: false, error: 'You do not own this Skrumpey' },
        { status: 403 }
      );
    }

    const isStar = isStarSkrumpeyId(tokenId);
    const metadata = getStarSkrumpeyMetadata(tokenId);
    const companion = selectCompanion(walletAddress, tokenId);

    return NextResponse.json({
      success: true,
      companion,
      isStar,
      metadata: metadata ? {
        image: metadata.image_url,
        traits: metadata.attributes_json ? JSON.parse(metadata.attributes_json) : {},
        rarityRank: metadata.rarity_rank,
      } : null,
    });
  } catch (error) {
    console.error('Sanctuary companion select error:', error);
    return NextResponse.json({ success: false, error: 'Failed to select companion' }, { status: 500 });
  }
}
