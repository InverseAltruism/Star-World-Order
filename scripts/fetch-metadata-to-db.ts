#!/usr/bin/env node
/**
 * Fetch Star Skrumpey Metadata to Database Script
 * 
 * This script fetches metadata for all 333 Star Skrumpey NFTs from IPFS
 * and stores them in the SQLite database.
 * 
 * Usage:
 *   npx tsx scripts/fetch-metadata-to-db.ts
 * 
 * The script will:
 * 1. Use the hardcoded list of Star Skrumpey token IDs (333 total)
 * 2. Fetch metadata for each token from IPFS
 * 3. Extract all traits from the attributes
 * 4. Store in the star_skrumpey_metadata database table
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Star Skrumpey token IDs (333 total)
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
// IPFS image base URL
const IMAGE_IPFS_BASE = 'https://ipfs-proxy.magiceden.dev/ipfs/bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu';

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

interface ParsedMetadata {
  tokenId: number;
  name: string;
  description: string;
  imageUrl: string;
  constellation?: string;
  aura?: string;
  background?: string;
  eyes?: string;
  form?: string;
  mood?: string;
  attributes: Attribute[];
}

/**
 * Extract traits from metadata attributes
 */
function parseMetadata(tokenId: number, data: Metadata): ParsedMetadata {
  const attributes = data.attributes || [];
  const traitMap: Record<string, string> = {};
  
  for (const attr of attributes) {
    const traitType = (attr.trait_type || '').toLowerCase();
    const value = attr.value || '';
    traitMap[traitType] = value.toLowerCase();
  }
  
  // Convert IPFS image URL to proxy URL
  let imageUrl = data.image || `${IMAGE_IPFS_BASE}/${tokenId}.png`;
  if (imageUrl.startsWith('ipfs://')) {
    // Convert ipfs:// URL to proxy URL
    const cid = imageUrl.replace('ipfs://', '').split('/')[0];
    const filename = imageUrl.split('/').pop();
    imageUrl = `https://ipfs-proxy.magiceden.dev/ipfs/${cid}/${filename}`;
  }
  
  return {
    tokenId,
    name: data.name || `SKRUMP #${tokenId}`,
    description: data.description || '',
    imageUrl,
    constellation: traitMap['constellation'],
    aura: traitMap['aura'],
    background: traitMap['background'],
    eyes: traitMap['eyes'],
    form: traitMap['form'],
    mood: traitMap['mood'],
    attributes,
  };
}

/**
 * Fetch metadata for a single token with retry logic
 */
async function fetchTokenMetadata(tokenId: number, retries = 3): Promise<Metadata | null> {
  const url = `${METADATA_IPFS_BASE}/${tokenId}`;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
      
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
        console.warn(`  Retry ${attempt + 1}/${retries} for token #${tokenId}: ${message}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
      } else {
        console.error(`  Failed to fetch token #${tokenId} after ${retries} attempts: ${message}`);
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
  batchSize: number = 5,
  delayMs: number = 300
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
    
    // Progress update
    const processed = Math.min(i + batchSize, items.length);
    const percentage = Math.round((processed / items.length) * 100);
    console.log(`  Progress: ${processed}/${items.length} (${percentage}%)`);
    
    // Delay between batches
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

/**
 * Initialize database and create table if needed
 */
function initializeDatabase(dbPath: string): Database.Database {
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  
  // Create the table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS star_skrumpey_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT NOT NULL,
      constellation TEXT,
      aura TEXT,
      background TEXT,
      eyes TEXT,
      form TEXT,
      mood TEXT,
      attributes_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_star_skrumpey_metadata_token ON star_skrumpey_metadata(token_id);
    CREATE INDEX IF NOT EXISTS idx_star_skrumpey_metadata_constellation ON star_skrumpey_metadata(constellation);
  `);
  
  return db;
}

/**
 * Insert or update metadata in database
 */
function upsertMetadata(db: Database.Database, data: ParsedMetadata): void {
  const stmt = db.prepare(`
    INSERT INTO star_skrumpey_metadata (
      token_id, name, description, image_url, constellation,
      aura, background, eyes, form, mood, attributes_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(token_id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      image_url = excluded.image_url,
      constellation = excluded.constellation,
      aura = excluded.aura,
      background = excluded.background,
      eyes = excluded.eyes,
      form = excluded.form,
      mood = excluded.mood,
      attributes_json = excluded.attributes_json,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  stmt.run(
    data.tokenId,
    data.name,
    data.description || null,
    data.imageUrl,
    data.constellation || null,
    data.aura || null,
    data.background || null,
    data.eyes || null,
    data.form || null,
    data.mood || null,
    JSON.stringify(data.attributes)
  );
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Star Skrumpey Metadata Fetcher');
  console.log('='.repeat(60));
  console.log(`Total Star Skrumpeys to fetch: ${STAR_SKRUMPEY_IDS.length}`);
  console.log(`IPFS Metadata URL: ${METADATA_IPFS_BASE}`);
  console.log(`IPFS Image URL: ${IMAGE_IPFS_BASE}`);
  console.log('');
  
  // Initialize database
  const dbPath = path.join(process.cwd(), 'data', 'swo.db');
  console.log(`Database path: ${dbPath}`);
  const db = initializeDatabase(dbPath);
  console.log('Database initialized');
  console.log('');
  
  console.log('Fetching metadata from IPFS...');
  console.log('');
  
  let successCount = 0;
  let errorCount = 0;
  const constellationCounts: Record<string, number> = {};
  
  // Fetch and save metadata
  const results = await processBatch(
    Array.from(STAR_SKRUMPEY_IDS),
    async (tokenId: number) => {
      const rawMetadata = await fetchTokenMetadata(tokenId);
      if (rawMetadata) {
        const parsed = parseMetadata(tokenId, rawMetadata);
        upsertMetadata(db, parsed);
        
        // Track constellation distribution
        if (parsed.constellation) {
          constellationCounts[parsed.constellation] = (constellationCounts[parsed.constellation] || 0) + 1;
        }
        
        successCount++;
        return { tokenId, success: true, constellation: parsed.constellation };
      } else {
        errorCount++;
        return { tokenId, success: false, constellation: null };
      }
    },
    5, // batch size
    300 // delay between batches in ms
  );
  
  // Close database
  db.close();
  
  // Print results
  console.log('');
  console.log('='.repeat(60));
  console.log('Results');
  console.log('='.repeat(60));
  console.log(`Successfully fetched: ${successCount}`);
  console.log(`Failed to fetch: ${errorCount}`);
  console.log('');
  
  console.log('Constellation Distribution:');
  Object.entries(constellationCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([constellation, count]) => {
      console.log(`  ${constellation}: ${count}`);
    });
  
  console.log('');
  console.log('='.repeat(60));
  console.log('Done! Metadata saved to database.');
  console.log('='.repeat(60));
  
  // Print any failed tokens
  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    console.log('');
    console.log('Failed tokens:');
    failed.forEach(({ tokenId }) => {
      console.log(`  Token #${tokenId}`);
    });
  }
}

// Run the script
main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
