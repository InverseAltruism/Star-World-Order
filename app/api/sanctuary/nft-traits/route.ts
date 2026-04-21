import { NextRequest, NextResponse } from 'next/server';
import { filterMetadataByTraits, getMetadataTraitDistribution } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') ?? 'distribution';

    if (action === 'distribution') {
      const traitType = searchParams.get('trait_type');
      if (!traitType) {
        const traitTypes = [
          'background', 'eyes', 'form', 'mood', 'hat', 'gaze',
          'relic', 'pet', 'fit', 'attitude', 'scene', 'extra',
          'submerged', 'constellation', 'aura',
        ];
        const distributions: Record<string, Record<string, number>> = {};
        for (const tt of traitTypes) {
          const dist = getMetadataTraitDistribution(tt);
          if (Object.keys(dist).length > 0) distributions[tt] = dist;
        }
        return NextResponse.json({ success: true, distributions });
      }
      const dist = getMetadataTraitDistribution(traitType);
      return NextResponse.json({ success: true, trait_type: traitType, distribution: dist });
    }

    if (action === 'filter') {
      const filters: Record<string, string> = {};
      for (const [key, value] of searchParams.entries()) {
        if (['action', 'limit', 'offset'].includes(key)) continue;
        filters[key] = value;
      }
      const limit = parseInt(searchParams.get('limit') ?? '50', 10);
      const offset = parseInt(searchParams.get('offset') ?? '0', 10);
      const results = filterMetadataByTraits(filters, Math.min(limit, 200), offset);
      return NextResponse.json({
        success: true,
        count: results.length,
        tokens: results.map(m => ({
          tokenId: m.token_id,
          name: m.name,
          image: m.image_url,
          traits: m.attributes_json ? JSON.parse(m.attributes_json) : {},
          rarityRank: m.rarity_rank,
          rarityScore: m.rarity_score,
        })),
      });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('NFT traits API error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process request' }, { status: 500 });
  }
}
