import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { selectCompanion, getStarSkrumpeyMetadata } from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { verifyTokenOwnership } from '@/lib/skrumpeyOwnership';
import { isStarSkrumpeyId } from '@/lib/starSkrumpey';
import { ethAddress, tokenId, parseBody, formatZodError } from '@/lib/sanctuary/validation';

const bodySchema = z.object({
  walletAddress: ethAddress,
  tokenId: tokenId,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = parseBody(bodySchema, body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: formatZodError(parsed.error) },
        { status: 400 },
      );
    }

    const { walletAddress, tokenId: tid } = parsed.data;

    const auth = await verifyWalletAccess(request, walletAddress);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    const ownsToken = await verifyTokenOwnership(walletAddress, tid);
    if (!ownsToken) {
      return NextResponse.json(
        { success: false, error: 'You do not own this Skrumpey' },
        { status: 403 },
      );
    }

    const isStar = isStarSkrumpeyId(tid);
    const metadata = getStarSkrumpeyMetadata(tid);
    const companion = selectCompanion(walletAddress, tid);

    let traits: Record<string, string> = {};
    if (metadata?.attributes_json) {
      try { traits = JSON.parse(metadata.attributes_json); } catch { /* malformed — skip */ }
    }

    return NextResponse.json({
      success: true,
      companion,
      isStar,
      metadata: metadata ? {
        image: metadata.image_url,
        traits,
        rarityRank: metadata.rarity_rank,
      } : null,
    });
  } catch (error) {
    console.error('Sanctuary companion select error:', error);
    return NextResponse.json({ success: false, error: 'Failed to select companion' }, { status: 500 });
  }
}
