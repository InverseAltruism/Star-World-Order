# Star Variant Metadata Fetching

## Overview

The Star World Order application now fetches **actual constellation variant data** from the Skrumpey NFT contract on Monad blockchain, replacing the previous deterministic (fake) mapping.

## How It Works

### 1. Metadata Structure

Each Skrumpey NFT has metadata stored on-chain as a base64-encoded JSON in the `tokenURI`. Example metadata structure:

```json
{
  "name": "Skrumpey #3",
  "description": "A cosmic Skrumpey",
  "image": "ipfs://...",
  "attributes": [
    {
      "trait_type": "Background",
      "value": "Space"
    },
    {
      "trait_type": "Constellation",
      "value": "aether"
    },
    {
      "trait_type": "Body",
      "value": "Green"
    }
  ]
}
```

### 2. Fetching Process

The `starVariantCache.ts` module handles metadata fetching:

1. **Contract Call**: Calls `tokenURI(tokenId)` on the Skrumpey contract
2. **Parse Data**: Decodes base64-encoded JSON metadata
3. **Extract Trait**: Finds the "Constellation" attribute value
4. **Cache Result**: Stores in memory to avoid repeated RPC calls
5. **Fallback**: Uses deterministic mapping if fetching fails

### 3. Batch Fetching

For efficiency, the Members API uses **batch fetching**:

```typescript
// Fetch variants for all tokens in one multicall
const variantMap = await batchFetchStarVariants(allTokenIds, true);

// Use the fetched data
const variant = variantMap.get(tokenId);
```

This makes only **1 RPC call** to fetch metadata for all Star Skrumpeys, avoiding rate limiting.

## Constellation Variants

The 10 known star constellation variants are:

- **aether** - Ethereal cosmic energy
- **spectra** - Spectral light patterns  
- **solveil** - Solar essence
- **nebulu** - Nebula-infused
- **chroma** - Chromatic brilliance
- **rose** - Rose-tinted stardust
- **monflare** - Monad flare energy
- **auracore** - Core aura manifestation
- **parallel** - Parallel dimension aligned
- **prime** - Prime constellation

## API Endpoints

### Get Members with Real Variants

```
GET /api/members
```

Returns all Star Skrumpey holders with their actual constellation variants fetched from blockchain metadata.

Response:
```json
{
  "success": true,
  "members": [
    {
      "address": "0x...",
      "tokenIds": [3, 17, 20],
      "starVariants": ["aether", "spectra"],
      "count": 3,
      "level": 6,
      "displayName": "CosmicFrog"
    }
  ],
  "totalMembers": 120,
  "totalStarSkrumpeys": 343,
  "cached": false
}
```

### Get Cache Statistics

```
GET /api/members/cache-stats
```

Returns statistics about the metadata cache:

```json
{
  "success": true,
  "cache": {
    "cachedVariants": 150,
    "totalAttempts": 200,
    "cacheHitRate": "75.0%",
    "sampleCachedTokens": [3, 17, 20, 23, ...]
  }
}
```

## Code Usage

### Fetch Single Token Variant

```typescript
import { getStarVariantWithMetadata } from '@/lib/starVariantCache';

// Fetch with fallback
const variant = await getStarVariantWithMetadata(3, true);
console.log(variant); // "aether" (real data from blockchain)

// Fetch without fallback (returns undefined if fetch fails)
const variant2 = await getStarVariantWithMetadata(3, false);
```

### Batch Fetch Multiple Variants

```typescript
import { batchFetchStarVariants } from '@/lib/starVariantCache';

// Fetch variants for multiple tokens at once
const tokenIds = [3, 17, 20, 23, 38];
const variantMap = await batchFetchStarVariants(tokenIds, true);

// Use the results
for (const [tokenId, variant] of variantMap.entries()) {
  console.log(`Token ${tokenId}: ${variant}`);
}
```

### Legacy Deterministic Function

The old `getStarVariantForTokenId()` function is deprecated but kept for backward compatibility:

```typescript
import { getStarVariantForTokenId } from '@/lib/starSkrumpey';

// DEPRECATED: Returns fake deterministic variant
const fakeVariant = getStarVariantForTokenId(3);
// This always returns the same value for token 3, but it's NOT real data
```

## Caching Strategy

### In-Memory Cache

- **Storage**: Map<tokenId, variant>
- **Persistence**: Cleared on server restart
- **TTL**: No expiration (variants don't change)
- **Size**: ~343 entries maximum (one per Star Skrumpey)

### Future Improvements

For production at scale, consider:

1. **Redis Cache** - Persistent cache across server restarts
2. **Database Storage** - Store fetched variants in SQLite/Postgres
3. **Pre-fetch Script** - Populate cache on deployment
4. **CDN Caching** - Cache API responses at edge

## Performance

### Before (Deterministic Mapping)
- ✅ O(1) instant lookup
- ❌ Fake data, not from blockchain
- ❌ No RPC calls needed

### After (Real Metadata Fetching)
- ✅ Real constellation data from blockchain
- ✅ Batch fetching (1 multicall for all tokens)
- ✅ In-memory caching (subsequent lookups are instant)
- ⚠️ Initial fetch requires RPC call

### Optimization

The implementation uses several techniques to avoid rate limiting:

1. **Multicall Batching** - All tokenURI calls in one RPC request
2. **Resilient RPC Client** - Automatic fallback to alternate endpoints
3. **Retry Logic** - Exponential backoff for transient errors
4. **Caching** - Results stored in memory
5. **Fallback** - Uses deterministic mapping if all fetching fails

## Troubleshooting

### No Variants Showing

If variants don't appear:

1. Check RPC endpoint is accessible
2. Verify contract address is correct
3. Check cache stats: `GET /api/members/cache-stats`
4. Review server logs for fetch errors

### Slow Initial Load

First load fetches metadata from blockchain:

- **Expected**: 2-5 seconds for batch fetch
- **Cached**: Instant on subsequent loads
- **Tip**: Pre-warm cache on deployment

### Rate Limiting

If experiencing rate limits:

1. Implementation already uses batch fetching
2. Check RPC endpoint limits
3. Consider using fallback endpoints
4. Implement persistent cache (Redis/DB)

## Testing

### Manual Testing

1. Start dev server: `npm run dev`
2. Visit: `http://localhost:3000/members`
3. Check cache stats: `http://localhost:3000/api/members/cache-stats`
4. Verify variants display correctly

### Network Issues

In development environments without network access:

- Fallback to deterministic mapping is automatic
- No errors thrown, graceful degradation
- Cache stats will show `cachedCount: 0`

## Migration Notes

### From Deterministic to Real Data

When deploying this update:

1. **No Breaking Changes** - API response format unchanged
2. **Backward Compatible** - Falls back to old method if fetching fails
3. **Data Accuracy** - Variants may change from previous fake data to real data
4. **Performance** - First load slower, subsequent loads faster

### User Impact

Users will see:

- ✅ Correct constellation variants (may differ from before)
- ✅ More accurate member profiles
- ✅ Real blockchain data instead of fake calculations
- ⚠️ Possible brief delay on first page load (1-5s)

## References

- **Module**: `lib/starVariantCache.ts`
- **API Route**: `app/api/members/route.ts`
- **Contract**: `0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0` (Monad Mainnet)
- **Chain**: Monad (Chain ID: 143)
