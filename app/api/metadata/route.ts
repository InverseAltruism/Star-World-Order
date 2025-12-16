/**
 * Metadata API Route
 * 
 * GET /api/metadata?tokenId=3 - Get metadata for a specific token
 * GET /api/metadata?tokenIds=3,17,20 - Get metadata for multiple tokens
 * 
 * This endpoint serves NFT metadata from the database (primary) or IPFS (fallback).
 * Database is the preferred source as it doesn't require network requests.
 */

import { NextResponse } from 'next/server';
import { isStarSkrumpeyId, STAR_TRAIT_VARIANTS, StarTraitVariant, SKRUMPEY_IPFS_BASE } from '@/lib/starSkrumpey';
import { getStarSkrumpeyMetadata, getStarSkrumpeyMetadataBatch, StarSkrumpeyMetadata } from '@/lib/db';

/**
 * In-memory cache for IPFS fetched metadata (fallback when DB doesn't have the data)
 */
const ipfsCache: Map<number, TokenMetadata> = new Map();
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
 * Convert database metadata to API response format
 */
function dbMetadataToResponse(dbMeta: StarSkrumpeyMetadata): TokenMetadata {
  // Parse attributes from JSON if available
  let attributes: Array<{ trait_type: string; value: string }> = [];
  if (dbMeta.attributes_json) {
    try {
      attributes = JSON.parse(dbMeta.attributes_json);
    } catch (e) {
      // Reconstruct attributes from individual fields
      attributes = [
        dbMeta.aura && { trait_type: 'aura', value: dbMeta.aura },
        dbMeta.background && { trait_type: 'background', value: dbMeta.background },
        dbMeta.constellation && { trait_type: 'constellation', value: dbMeta.constellation },
        dbMeta.eyes && { trait_type: 'eyes', value: dbMeta.eyes },
        dbMeta.form && { trait_type: 'form', value: dbMeta.form },
        dbMeta.mood && { trait_type: 'mood', value: dbMeta.mood },
      ].filter(Boolean) as Array<{ trait_type: string; value: string }>;
    }
  }
  
  return {
    tokenId: dbMeta.token_id,
    name: dbMeta.name,
    image: dbMeta.image_url,
    constellation: dbMeta.constellation as StarTraitVariant | undefined,
    attributes,
    cachedAt: Date.now(), // DB data is always fresh
  };
}

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
 * Fetch metadata directly from IPFS (skips database check)
 * Used for batch fallback when we already know DB doesn't have the data
 */
async function fetchFromIPFSOnly(tokenId: number): Promise<TokenMetadata | null> {
  // Only process Star Skrumpeys
  if (!isStarSkrumpeyId(tokenId)) {
    return null;
  }
  
  // Check in-memory cache for IPFS data
  const cached = ipfsCache.get(tokenId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached;
  }
  
  // Fetch from IPFS
  try {
    const metadataUrl = `${METADATA_IPFS_BASE}/${tokenId}`;
    const response = await fetch(metadataUrl, {
      signal: AbortSignal.timeout(10000), // 10 second timeout
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch metadata for token ${tokenId}: ${response.status}`);
      const fallback: TokenMetadata = {
        tokenId,
        name: `Skrumpey #${tokenId}`,
        image: `${SKRUMPEY_IPFS_BASE}/${tokenId}.png`,
        constellation: undefined,
        attributes: [],
        cachedAt: Date.now(),
      };
      ipfsCache.set(tokenId, fallback);
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
    
    ipfsCache.set(tokenId, metadata);
    return metadata;
  } catch (error) {
    console.warn(`Error fetching metadata for token ${tokenId}:`, error);
    const fallback: TokenMetadata = {
      tokenId,
      name: `Skrumpey #${tokenId}`,
      image: `${SKRUMPEY_IPFS_BASE}/${tokenId}.png`,
      constellation: undefined,
      attributes: [],
      cachedAt: Date.now(),
    };
    ipfsCache.set(tokenId, fallback);
    return fallback;
  }
}

/**
 * Get metadata from database first, fall back to IPFS if not found
 */
async function getTokenMetadata(tokenId: number): Promise<TokenMetadata | null> {
  // Only process Star Skrumpeys
  if (!isStarSkrumpeyId(tokenId)) {
    return null;
  }
  
  // Try database first (most efficient)
  try {
    const dbMeta = getStarSkrumpeyMetadata(tokenId);
    if (dbMeta && dbMeta.constellation) {
      return dbMetadataToResponse(dbMeta);
    }
  } catch (error) {
    console.warn(`Database lookup failed for token ${tokenId}:`, error);
    // Continue to IPFS fallback
  }
  
  // Use IPFS-only function for fallback
  return fetchFromIPFSOnly(tokenId);
}

/**
 * Get metadata for multiple tokens - optimized batch lookup
 */
async function getTokenMetadataBatch(tokenIds: number[]): Promise<Record<number, TokenMetadata>> {
  const metadataMap: Record<number, TokenMetadata> = {};
  const missingFromDb: number[] = [];
  
  // Filter to only Star Skrumpeys
  const validIds = tokenIds.filter(id => isStarSkrumpeyId(id));
  
  // Try database batch lookup first
  try {
    const dbResults = getStarSkrumpeyMetadataBatch(validIds);
    
    for (const tokenId of validIds) {
      const dbMeta = dbResults.get(tokenId);
      if (dbMeta && dbMeta.constellation) {
        metadataMap[tokenId] = dbMetadataToResponse(dbMeta);
      } else {
        missingFromDb.push(tokenId);
      }
    }
  } catch (error) {
    console.warn('Database batch lookup failed:', error);
    missingFromDb.push(...validIds);
  }
  
  // Fetch missing from IPFS in parallel using IPFS-only function
  // (avoids redundant database checks since we already know these aren't in DB)
  if (missingFromDb.length > 0) {
    const ipfsResults = await Promise.all(
      missingFromDb.map(id => fetchFromIPFSOnly(id))
    );
    
    for (const meta of ipfsResults) {
      if (meta) {
        metadataMap[meta.tokenId] = meta;
      }
    }
  }
  
  return metadataMap;
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
    
    const metadata = await getTokenMetadata(tokenId);
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
    
    // Use optimized batch lookup
    const metadataMap = await getTokenMetadataBatch(limitedIds);
    
    return NextResponse.json({
      success: true,
      metadata: metadataMap,
      count: Object.keys(metadataMap).length,
    });
  }
  
  return NextResponse.json({ success: false, error: 'tokenId or tokenIds parameter required' }, { status: 400 });
}
