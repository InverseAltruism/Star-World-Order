#!/usr/bin/env node
/**
 * Fetch Constellations Script
 * 
 * This script fetches the actual constellation data for all 333 Star Skrumpey NFTs
 * from IPFS metadata and generates the correct STAR_CONSTELLATION_MAP.
 * 
 * Usage:
 *   npx ts-node scripts/fetch_constellations.ts
 *   
 * Or with Node directly (requires tsx):
 *   npx tsx scripts/fetch_constellations.ts
 * 
 * The script will:
 * 1. Read the list of Star Skrumpey token IDs from lib/starSkrumpey.ts
 * 2. Fetch metadata for each token from IPFS
 * 3. Extract the constellation trait from the attributes
 * 4. Output a TypeScript map that can be pasted into data/starConstellationData.ts
 */

const STAR_SKRUMPEY_IDS: readonly number[] = [
  3, 17, 20, 23, 38, 40, 60, 84, 96, 106, 108, 118, 120, 141, 149, 164, 180, 191, 204, 206,
  211, 226, 258, 270, 271, 274, 294, 332, 338, 339, 341, 346, 357, 362, 368, 406, 421, 431,
  439, 442, 456, 461, 511, 533, 547, 558, 562, 563, 567, 588, 594, 596, 627, 629, 643, 650,
  652, 659, 672, 675, 680, 693, 701, 704, 705, 709, 710, 714, 717, 726, 753, 759, 760, 762,
  775, 794, 800, 803, 804, 806, 807, 829, 841, 845, 850, 854, 857, 870, 877, 880, 888, 890,
  893, 905, 909, 918, 933, 950, 951, 960, 962, 984, 988, 1003, 1015, 1022, 1043, 1048, 1049,
  1052, 1059, 1075, 1096, 1101, 1103, 1108, 1118, 1132, 1139, 1142, 1152, 1163, 1197, 1202,
  1210, 1222, 1228, 1235, 1250, 1284, 1287, 1310, 1342, 1358, 1362, 1369, 1370, 1374, 1377,
  1407, 1417, 1419, 1429, 1459, 1461, 1475, 1487, 1495, 1507, 1516, 1517, 1522, 1537, 1540,
  1547, 1548, 1557, 1564, 1578, 1594, 1601, 1603, 1604, 1612, 1617, 1634, 1636, 1651, 1655,
  1672, 1681, 1700, 1702, 1716, 1756, 1766, 1782, 1791, 1795, 1799, 1804, 1807, 1814, 1824,
  1830, 1841, 1864, 1868, 1874, 1917, 1931, 1942, 1947, 1968, 1978, 1987, 1988, 1993, 2010,
  2041, 2043, 2058, 2064, 2081, 2084, 2093, 2128, 2131, 2137, 2146, 2165, 2183, 2185, 2198,
  2201, 2207, 2210, 2239, 2240, 2242, 2258, 2260, 2276, 2278, 2281, 2289, 2294, 2295, 2317,
  2325, 2346, 2356, 2397, 2402, 2421, 2446, 2454, 2460, 2464, 2466, 2470, 2480, 2489, 2497,
  2526, 2528, 2536, 2537, 2548, 2558, 2563, 2574, 2585, 2596, 2597, 2599, 2610, 2614, 2620,
  2634, 2635, 2645, 2660, 2667, 2682, 2689, 2694, 2722, 2729, 2730, 2754, 2756, 2763, 2781,
  2785, 2789, 2825, 2835, 2842, 2844, 2858, 2862, 2867, 2876, 2891, 2901, 2935, 2958, 2970,
  2985, 2987, 2992, 2999, 3022, 3035, 3056, 3073, 3083, 3096, 3101, 3117, 3134, 3144, 3146,
  3159, 3166, 3169, 3176, 3189, 3199, 3205, 3206, 3211, 3219, 3221, 3222, 3227, 3258, 3263,
  3266, 3267, 3268, 3271, 3279, 3284, 3288, 3294, 3295, 3298, 3311, 3319, 3329, 3332,
] as const;

// IPFS metadata base URL
const METADATA_IPFS_BASE = 'https://ipfs-proxy.magiceden.dev/ipfs/bafybeibs4foulw6giemwwxwye2qtc3bd2lx34va6c3lpkjvsweevxudsjm';

// Valid constellation types
const VALID_CONSTELLATIONS = [
  'aether',
  'spectra',
  'solveil',
  'nebulu',
  'chroma',
  'rose',
  'monflare',
  'auracore',
  'parallel',
  'prime',
] as const;

type Constellation = typeof VALID_CONSTELLATIONS[number];

interface Attribute {
  trait_type: string;
  value: string;
}

interface Metadata {
  name?: string;
  description?: string;
  image?: string;
  attributes?: Attribute[];
}

/**
 * Extract constellation from metadata attributes
 */
function extractConstellation(attributes: Attribute[] | undefined): Constellation | null {
  if (!attributes || !Array.isArray(attributes)) return null;
  
  for (const attr of attributes) {
    const traitType = (attr.trait_type || '').toLowerCase();
    const value = (attr.value || '').toLowerCase();
    
    // Match the 'constellation' trait type
    if (traitType === 'constellation') {
      // Find matching constellation
      for (const constellation of VALID_CONSTELLATIONS) {
        if (value === constellation || value.includes(constellation)) {
          return constellation;
        }
      }
      // Return the value as-is if not found in list (for debugging)
      console.warn(`Unknown constellation value: "${attr.value}" for trait_type: "${attr.trait_type}"`);
    }
  }
  
  return null;
}

/**
 * Fetch metadata for a single token with retry logic
 */
async function fetchTokenMetadata(tokenId: number, retries = 3): Promise<Metadata | null> {
  const url = `${METADATA_IPFS_BASE}/${tokenId}`;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (attempt < retries - 1) {
        console.warn(`Retry ${attempt + 1}/${retries} for token #${tokenId}: ${message}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
      } else {
        console.error(`Failed to fetch token #${tokenId} after ${retries} attempts: ${message}`);
        return null;
      }
    }
  }
  
  return null;
}

/**
 * Process tokens in batches to avoid overwhelming the server
 */
async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 10,
  delayMs: number = 500
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
    
    // Progress update
    console.log(`Processed ${Math.min(i + batchSize, items.length)}/${items.length} tokens...`);
    
    // Delay between batches
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

/**
 * Main function to fetch all constellations and generate the map
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Star Skrumpey Constellation Fetcher');
  console.log('='.repeat(60));
  console.log(`Fetching metadata for ${STAR_SKRUMPEY_IDS.length} Star Skrumpey NFTs...`);
  console.log(`IPFS Base URL: ${METADATA_IPFS_BASE}`);
  console.log('');
  
  const constellationMap: Record<number, Constellation> = {};
  const errors: { tokenId: number; error: string }[] = [];
  const missingConstellation: number[] = [];
  
  // Fetch all metadata
  const results = await processBatch(
    Array.from(STAR_SKRUMPEY_IDS),
    async (tokenId: number) => {
      const metadata = await fetchTokenMetadata(tokenId);
      return { tokenId, metadata };
    },
    10, // batch size
    500 // delay between batches in ms
  );
  
  // Process results
  for (const { tokenId, metadata } of results) {
    if (!metadata) {
      errors.push({ tokenId, error: 'Failed to fetch metadata' });
      continue;
    }
    
    const constellation = extractConstellation(metadata.attributes);
    
    if (constellation) {
      constellationMap[tokenId] = constellation;
    } else {
      missingConstellation.push(tokenId);
    }
  }
  
  // Generate output
  console.log('');
  console.log('='.repeat(60));
  console.log('Results');
  console.log('='.repeat(60));
  console.log(`Successfully fetched: ${Object.keys(constellationMap).length}`);
  console.log(`Failed to fetch: ${errors.length}`);
  console.log(`Missing constellation: ${missingConstellation.length}`);
  
  if (errors.length > 0) {
    console.log('\nFetch errors:');
    errors.forEach(({ tokenId, error }) => {
      console.log(`  Token #${tokenId}: ${error}`);
    });
  }
  
  if (missingConstellation.length > 0) {
    console.log('\nTokens without constellation trait:');
    console.log(`  ${missingConstellation.join(', ')}`);
  }
  
  // Count distribution
  const distribution: Record<string, number> = {};
  for (const constellation of Object.values(constellationMap)) {
    distribution[constellation] = (distribution[constellation] || 0) + 1;
  }
  
  console.log('\nConstellation distribution:');
  Object.entries(distribution)
    .sort(([, a], [, b]) => b - a)
    .forEach(([constellation, count]) => {
      console.log(`  ${constellation}: ${count}`);
    });
  
  // Generate TypeScript map
  console.log('\n' + '='.repeat(60));
  console.log('Generated STAR_CONSTELLATION_MAP');
  console.log('='.repeat(60));
  console.log('Copy the following into data/starConstellationData.ts:\n');
  
  console.log('export const STAR_CONSTELLATION_MAP: Record<number, StarTraitVariant> = {');
  
  // Sort by token ID and output
  const sortedEntries = Object.entries(constellationMap)
    .map(([id, constellation]) => ({ id: parseInt(id), constellation }))
    .sort((a, b) => a.id - b.id);
  
  for (const { id, constellation } of sortedEntries) {
    console.log(`  ${id}: '${constellation}',`);
  }
  
  console.log('};');
  console.log('');
}

// Run the script
main().catch(console.error);
