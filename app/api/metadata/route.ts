/**
 * Metadata API Route
 * 
 * GET /api/metadata?tokenId=3 - Get metadata for a specific token
 * GET /api/metadata?tokenIds=3,17,20 - Get metadata for multiple tokens
 * 
 * This endpoint fetches and caches NFT metadata from IPFS
 */

import { NextResponse } from 'next/server';
import { isStarSkrumpeyId, STAR_TRAIT_VARIANTS, StarTraitVariant, SKRUMPEY_IPFS_BASE } from '@/lib/starSkrumpey';

/**
 * In-memory cache for metadata (persists across requests but not server restarts)
 * 
 * NOTE: This is suitable for development and low-traffic production environments.
 * For high-scale production with serverless deployments, consider using:
 * - Redis or another distributed cache
 * - Database caching (SQLite already available in this project)
 * - Edge caching via CDN
 * 
 * The 24-hour TTL ensures metadata is refreshed periodically while reducing
 * IPFS gateway load.
 */
const metadataCache: Map<number, TokenMetadata> = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface TokenMetadata {
  tokenId: number;
  name: string;
  image: string;
  constellation?: StarTraitVariant;
  attributes: Array<{ trait_type: string; value: string }>;
  cachedAt: number;
}

// IPFS metadata base URL - CID for Skrumpey metadata JSON files
// Source: https://ipfs-proxy.magiceden.dev/ipfs/bafybeibs4foulw6giemwwxwye2qtc3bd2lx34va6c3lpkjvsweevxudsjm/{tokenId}
const METADATA_IPFS_BASE = 'https://ipfs-proxy.magiceden.dev/ipfs/bafybeibs4foulw6giemwwxwye2qtc3bd2lx34va6c3lpkjvsweevxudsjm';

/**
 * Extract constellation from metadata attributes
 */
function extractConstellation(attributes: Array<{ trait_type: string; value: string }>): StarTraitVariant | undefined {
  if (!attributes || !Array.isArray(attributes)) return undefined;
  
  // Only look for the explicit constellation trait_type
  // This prevents false positives from other traits that might contain constellation-like words
  for (const attr of attributes) {
    const traitType = (attr.trait_type || '').toLowerCase();
    const value = (attr.value || '').toLowerCase();
    
    // Only match the explicit 'constellation' trait type
    if (traitType === 'constellation') {
      // Check if value matches any known constellation
      for (const variant of STAR_TRAIT_VARIANTS) {
        if (value === variant || value.includes(variant)) {
          return variant;
        }
      }
    }
  }
  
  return undefined;
}

/**
 * Fetch metadata from IPFS for a single token
 */
async function fetchTokenMetadata(tokenId: number): Promise<TokenMetadata | null> {
  // Check cache first
  const cached = metadataCache.get(tokenId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached;
  }
  
  // Only fetch for Star Skrumpeys
  if (!isStarSkrumpeyId(tokenId)) {
    return null;
  }
  
  try {
    // Try fetching metadata JSON
    const metadataUrl = `${METADATA_IPFS_BASE}/${tokenId}`;
    const response = await fetch(metadataUrl, {
      signal: AbortSignal.timeout(10000), // 10 second timeout
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch metadata for token ${tokenId}: ${response.status}`);
      // Return basic info without constellation
      const fallback: TokenMetadata = {
        tokenId,
        name: `Skrumpey #${tokenId}`,
        image: `${SKRUMPEY_IPFS_BASE}/${tokenId}.png`,
        constellation: undefined,
        attributes: [],
        cachedAt: Date.now(),
      };
      metadataCache.set(tokenId, fallback);
      return fallback;
    }
    
    const data = await response.json();
    
    const metadata: TokenMetadata = {
      tokenId,
      name: data.name || `Skrumpey #${tokenId}`,
      image: data.image || `${SKRUMPEY_IPFS_BASE}/${tokenId}.png`,
      constellation: extractConstellation(data.attributes || []),
      attributes: data.attributes || [],
      cachedAt: Date.now(),
    };
    
    // Cache the result
    metadataCache.set(tokenId, metadata);
    return metadata;
  } catch (error) {
    console.warn(`Error fetching metadata for token ${tokenId}:`, error);
    // Return basic info on error
    const fallback: TokenMetadata = {
      tokenId,
      name: `Skrumpey #${tokenId}`,
      image: `${SKRUMPEY_IPFS_BASE}/${tokenId}.png`,
      constellation: undefined,
      attributes: [],
      cachedAt: Date.now(),
    };
    metadataCache.set(tokenId, fallback);
    return fallback;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tokenIdParam = searchParams.get('tokenId');
  const tokenIdsParam = searchParams.get('tokenIds');
  
  // Single token request
  if (tokenIdParam) {
    const tokenId = parseInt(tokenIdParam, 10);
    if (isNaN(tokenId)) {
      return NextResponse.json({ success: false, error: 'Invalid tokenId' }, { status: 400 });
    }
    
    const metadata = await fetchTokenMetadata(tokenId);
    if (!metadata) {
      return NextResponse.json({ success: false, error: 'Token not found or not a Star Skrumpey' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, metadata });
  }
  
  // Multiple tokens request
  if (tokenIdsParam) {
    const tokenIds = tokenIdsParam.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
    
    if (tokenIds.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid tokenIds provided' }, { status: 400 });
    }
    
    // Limit to 50 tokens at a time to prevent abuse
    const limitedIds = tokenIds.slice(0, 50);
    
    // Fetch all in parallel
    const results = await Promise.all(limitedIds.map(id => fetchTokenMetadata(id)));
    const metadataMap: Record<number, TokenMetadata> = {};
    
    for (const meta of results) {
      if (meta) {
        metadataMap[meta.tokenId] = meta;
      }
    }
    
    return NextResponse.json({
      success: true,
      metadata: metadataMap,
      count: Object.keys(metadataMap).length,
    });
  }
  
  return NextResponse.json({ success: false, error: 'tokenId or tokenIds parameter required' }, { status: 400 });
}
