import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCompanionTraits, getTraitDefinitions } from '@/lib/db';
import { ethAddress, tokenId, parseSearchParams, formatZodError } from '@/lib/sanctuary/validation';

const querySchema = z.object({
  address: ethAddress,
  token_id: tokenId,
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const definitionsOnly = searchParams.get('definitions');

    if (definitionsOnly === 'true') {
      return NextResponse.json({ success: true, definitions: getTraitDefinitions() });
    }

    const parsed = parseSearchParams(querySchema, searchParams);

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: formatZodError(parsed.error) }, { status: 400 });
    }

    const { address, token_id: tid } = parsed.data;
    const traits = getCompanionTraits(address, tid);
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
