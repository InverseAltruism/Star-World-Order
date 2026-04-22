import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { filterMetadataByTraits, getMetadataTraitDistribution } from '@/lib/db';
import { nftTraitsAction, paginationLimit, parseSearchParams, formatZodError } from '@/lib/sanctuary/validation';

const distributionSchema = z.object({
  action: z.literal('distribution'),
  trait_type: z.string().optional(),
});

const filterSchema = z.object({
  action: z.literal('filter'),
  limit: paginationLimit(200, 50),
  offset: z.coerce.number().int().min(0).default(0),
});

const querySchema = z.object({
  action: nftTraitsAction.default('distribution'),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const actionParsed = parseSearchParams(querySchema, searchParams);

    if (!actionParsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(actionParsed.error) }, { status: 400 });
    }

    const { action } = actionParsed.data;

    if (action === 'distribution') {
      const distParsed = parseSearchParams(distributionSchema, searchParams);
      if (!distParsed.success) {
        return NextResponse.json({ success: false, error: formatZodError(distParsed.error) }, { status: 400 });
      }

      const { trait_type: traitType } = distParsed.data;

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

    const filterParsed = parseSearchParams(filterSchema, searchParams);
    if (!filterParsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(filterParsed.error) }, { status: 400 });
    }

    const { limit, offset } = filterParsed.data;
    const filters: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (['action', 'limit', 'offset'].includes(key)) continue;
      filters[key] = value;
    }

    const results = filterMetadataByTraits(filters, limit, offset);
    return NextResponse.json({
      success: true,
      count: results.length,
      tokens: results.map(m => {
        let traits: Record<string, string> = {};
        if (m.attributes_json) {
          try { traits = JSON.parse(m.attributes_json); } catch { /* malformed — skip */ }
        }
        return {
          tokenId: m.token_id,
          name: m.name,
          image: m.image_url,
          traits,
          rarityRank: m.rarity_rank,
          rarityScore: m.rarity_score,
        };
      }),
    });
  } catch (error) {
    console.error('NFT traits API error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process request' }, { status: 500 });
  }
}
