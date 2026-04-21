import { NextRequest, NextResponse } from 'next/server';
import { getMetadataForTokenIds } from '@/lib/db';
import { checkSkrumpeyOwnership, checkStarOwnershipBatched, isStarSkrumpeyId } from '@/lib/starSkrumpey';
import { getOwnedTokenIds } from '@/lib/skrumpeyOwnership';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const traitFilter = searchParams.get('trait_type');
    const traitValue = searchParams.get('trait_value');

    if (!address) {
      return NextResponse.json({ success: false, error: 'address is required' }, { status: 400 });
    }

    const { hasSkrumpey, balance } = await checkSkrumpeyOwnership(address);
    if (!hasSkrumpey) {
      return NextResponse.json({ success: true, owned: [], balance: 0, isStar: false });
    }

    const starTokens = await checkStarOwnershipBatched(address);
    const starIds = new Set(starTokens.map(t => t.tokenId));

    // For small balances, we can check all 3333 tokens efficiently via multicall.
    // For large balances this is still fast since multicall batches.
    const allTokenIds = Array.from({ length: 3333 }, (_, i) => i + 1);
    const ownedIds = await getOwnedTokenIds(address, allTokenIds);

    let metadataList = getMetadataForTokenIds(ownedIds);

    if (traitFilter && traitValue) {
      const tType = traitFilter.toLowerCase();
      const tVal = traitValue.toLowerCase();
      metadataList = metadataList.filter(m => {
        if (!m.attributes_json) return false;
        let traits: Record<string, string>;
        try {
          traits = JSON.parse(m.attributes_json) as Record<string, string>;
        } catch {
          return false;
        }
        const val = traits[tType];
        return val !== undefined && val.toLowerCase() === tVal;
      });
    }

    const owned = metadataList.map(m => {
      let traits: Record<string, string> = {};
      if (m.attributes_json) {
        try { traits = JSON.parse(m.attributes_json); } catch { /* malformed — skip */ }
      }
      return {
        tokenId: m.token_id,
        name: m.name,
        image: m.image_url,
        isStar: starIds.has(m.token_id) || isStarSkrumpeyId(m.token_id),
        constellation: m.constellation,
        traits,
        rarityRank: m.rarity_rank,
        rarityScore: m.rarity_score,
      };
    });

    return NextResponse.json({
      success: true,
      owned,
      balance,
      isStar: starIds.size > 0,
      starCount: starIds.size,
    });
  } catch (error) {
    console.error('List owned Skrumpeys error:', error);
    return NextResponse.json({ success: false, error: 'Failed to list owned tokens' }, { status: 500 });
  }
}
