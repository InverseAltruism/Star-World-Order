import { NextRequest, NextResponse } from 'next/server';
import { getCompanionTraits, getTraitDefinitions } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const tokenId = searchParams.get('token_id');
    const definitionsOnly = searchParams.get('definitions');

    if (definitionsOnly === 'true') {
      return NextResponse.json({ success: true, definitions: getTraitDefinitions() });
    }

    if (!address || !tokenId) {
      return NextResponse.json({ success: false, error: 'address and token_id required' }, { status: 400 });
    }

    const traits = getCompanionTraits(address, parseInt(tokenId, 10));
    const definitions = getTraitDefinitions();
    const defMap = new Map(definitions.map((d) => [d.name, d]));
    const enriched = traits.map((t) => {
      const def = defMap.get(t.trait_name);
      return { ...t, threshold: def?.threshold ?? 100, description: def?.description ?? '' };
    });
    return NextResponse.json({ success: true, traits: enriched });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to get traits' }, { status: 500 });
  }
}
