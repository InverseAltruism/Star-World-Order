/**
 * Star Skrumpey Static Constellation Data
 * 
 * ⚠️ WARNING: This static map is used as a FALLBACK only. The constellation data
 * in this file was generated as placeholder data and may not be accurate for all tokens.
 * 
 * For accurate constellation data:
 * - Components should fetch metadata from /api/metadata which reads from IPFS
 * - ProfileCard.tsx has been updated to prefer IPFS metadata over this static map
 * - Run scripts/fetch_constellations.ts to regenerate this file with correct data
 * 
 * IPFS Metadata Source:
 * - CID: bafybeibs4foulw6giemwwxwye2qtc3bd2lx34va6c3lpkjvsweevxudsjm
 * - URL Pattern: https://ipfs-proxy.magiceden.dev/ipfs/bafybeibs4foulw6giemwwxwye2qtc3bd2lx34va6c3lpkjvsweevxudsjm/{tokenId}
 * 
 * IPFS Image Source:
 * - CID: bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu
 * - URL Pattern: https://ipfs-proxy.magiceden.dev/ipfs/bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu/{tokenId}.png
 * 
 * Example Metadata JSON (Token #3189):
 * {
 *   "attributes": [
 *     { "value": "aroma", "trait_type": "aura" },
 *     { "value": "flora", "trait_type": "background" },
 *     { "value": "parallel", "trait_type": "constellation" },
 *     { "value": "dork", "trait_type": "eyes" },
 *     { "value": "super sayain", "trait_type": "form" },
 *     { "value": "drool", "trait_type": "mood" }
 *   ],
 *   "description": "A collection of 3,333 pixel art pfpNFTs capturing Monad's spirit. Created by melo.",
 *   "image": "ipfs://bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu/3189.png",
 *   "name": "SKRUMP #3189"
 * }
 * 
 * Constellation Distribution (333 total):
 * - aether: 52 NFTs
 * - spectra: 52 NFTs
 * - solveil: 46 NFTs
 * - nebulu: 44 NFTs
 * - chroma: 42 NFTs
 * - rose: 36 NFTs
 * - monflare: 27 NFTs
 * - auracore: 23 NFTs
 * - parallel: 10 NFTs
 * - prime: 1 NFT (the legendary 1/1)
 * 
 * To regenerate this data with correct IPFS values:
 * 1. Run: npx tsx scripts/fetch_constellations.ts
 * 2. Copy the generated output to replace the data below
 */

import { StarTraitVariant } from '../lib/starSkrumpey';

/**
 * Static mapping of Star Skrumpey token IDs to constellation type.
 * 
 * ⚠️ NOTE: This is FALLBACK data. The ProfileCard component now fetches
 * constellation data directly from IPFS via /api/metadata endpoint, which is
 * the source of truth. This static map is only used when IPFS fetch fails.
 * 
 * Format: { tokenId: constellation }
 * 
 * To regenerate with accurate data from IPFS:
 * Run: npx tsx scripts/fetch_constellations.ts
 */
export const STAR_CONSTELLATION_MAP: Record<number, StarTraitVariant> = {
  // ============================================================
  // CONSTELLATION DATA
  // Note: This may be placeholder data. For accurate constellations,
  // rely on /api/metadata which fetches directly from IPFS.
  // ============================================================
  3: 'aether',
  17: 'spectra',
  20: 'aether',
  23: 'aether',
  38: 'aether',
  40: 'aether',
  60: 'aether',
  84: 'aether',
  96: 'aether',
  106: 'aether',
  108: 'aether',
  118: 'spectra',
  120: 'spectra',
  141: 'spectra',
  149: 'spectra',
  164: 'spectra',
  180: 'spectra',
  191: 'spectra',
  204: 'spectra',
  206: 'spectra',
  211: 'spectra',
  226: 'solveil',
  258: 'solveil',
  270: 'solveil',
  271: 'solveil',
  274: 'solveil',
  294: 'solveil',
  332: 'solveil',
  338: 'solveil',
  339: 'solveil',
  341: 'solveil',
  346: 'solveil',
  357: 'nebulu',
  362: 'nebulu',
  368: 'nebulu',
  406: 'nebulu',
  421: 'nebulu',
  431: 'nebulu',
  439: 'nebulu',
  442: 'nebulu',
  456: 'nebulu',
  461: 'nebulu',
  511: 'nebulu',
  533: 'chroma',
  547: 'chroma',
  558: 'chroma',
  562: 'chroma',
  563: 'chroma',
  567: 'chroma',
  588: 'chroma',
  594: 'chroma',
  596: 'chroma',
  627: 'chroma',
  629: 'rose',
  643: 'rose',
  650: 'rose',
  652: 'rose',
  659: 'rose',
  672: 'rose',
  675: 'rose',
  680: 'rose',
  693: 'rose',
  701: 'rose',
  704: 'monflare',
  705: 'monflare',
  709: 'monflare',
  710: 'monflare',
  714: 'monflare',
  717: 'monflare',
  726: 'monflare',
  753: 'auracore',
  759: 'auracore',
  760: 'auracore',
  762: 'auracore',
  775: 'auracore',
  794: 'parallel',
  800: 'aether',
  803: 'aether',
  804: 'aether',
  806: 'aether',
  807: 'aether',
  829: 'aether',
  841: 'aether',
  845: 'aether',
  850: 'aether',
  854: 'aether',
  857: 'aether',
  870: 'spectra',
  877: 'spectra',
  880: 'spectra',
  888: 'spectra',
  890: 'spectra',
  893: 'spectra',
  905: 'spectra',
  909: 'spectra',
  918: 'spectra',
  933: 'spectra',
  950: 'spectra',
  951: 'solveil',
  960: 'solveil',
  962: 'solveil',
  984: 'solveil',
  988: 'solveil',
  1003: 'solveil',
  1015: 'solveil',
  1022: 'solveil',
  1043: 'solveil',
  1048: 'solveil',
  1049: 'solveil',
  1052: 'nebulu',
  1059: 'nebulu',
  1075: 'nebulu',
  1096: 'nebulu',
  1101: 'nebulu',
  1103: 'nebulu',
  1108: 'nebulu',
  1118: 'nebulu',
  1132: 'nebulu',
  1139: 'nebulu',
  1142: 'nebulu',
  1152: 'chroma',
  1163: 'chroma',
  1197: 'chroma',
  1202: 'chroma',
  1210: 'chroma',
  1222: 'chroma',
  1228: 'chroma',
  1235: 'chroma',
  1250: 'chroma',
  1284: 'chroma',
  1287: 'rose',
  1310: 'rose',
  1342: 'rose',
  1358: 'rose',
  1362: 'rose',
  1369: 'rose',
  1370: 'rose',
  1374: 'rose',
  1377: 'rose',
  1407: 'monflare',
  1417: 'monflare',
  1419: 'monflare',
  1429: 'monflare',
  1459: 'monflare',
  1461: 'monflare',
  1475: 'monflare',
  1487: 'auracore',
  1495: 'auracore',
  1507: 'auracore',
  1516: 'auracore',
  1517: 'auracore',
  1522: 'parallel',
  1537: 'aether',
  1540: 'aether',
  1547: 'aether',
  1548: 'aether',
  1557: 'aether',
  1564: 'aether',
  1578: 'aether',
  1594: 'aether',
  1601: 'aether',
  1603: 'aether',
  1604: 'aether',
  1612: 'spectra',
  1617: 'spectra',
  1634: 'spectra',
  1636: 'spectra',
  1651: 'spectra',
  1655: 'spectra',
  1672: 'spectra',
  1681: 'spectra',
  1700: 'spectra',
  1702: 'spectra',
  1716: 'spectra',
  1756: 'solveil',
  1766: 'solveil',
  1782: 'solveil',
  1791: 'solveil',
  1795: 'solveil',
  1799: 'solveil',
  1804: 'solveil',
  1807: 'solveil',
  1814: 'solveil',
  1824: 'solveil',
  1830: 'solveil',
  1841: 'nebulu',
  1864: 'nebulu',
  1868: 'nebulu',
  1874: 'nebulu',
  1917: 'nebulu',
  1931: 'nebulu',
  1942: 'nebulu',
  1947: 'nebulu',
  1968: 'nebulu',
  1978: 'nebulu',
  1987: 'nebulu',
  1988: 'chroma',
  1993: 'chroma',
  2010: 'chroma',
  2041: 'chroma',
  2043: 'chroma',
  2058: 'chroma',
  2064: 'chroma',
  2081: 'chroma',
  2084: 'chroma',
  2093: 'chroma',
  2128: 'rose',
  2131: 'rose',
  2137: 'rose',
  2146: 'rose',
  2165: 'rose',
  2183: 'rose',
  2185: 'rose',
  2198: 'rose',
  2201: 'monflare',
  2207: 'monflare',
  2210: 'monflare',
  2239: 'monflare',
  2240: 'monflare',
  2242: 'monflare',
  2258: 'auracore',
  2260: 'auracore',
  2276: 'auracore',
  2278: 'auracore',
  2281: 'auracore',
  2289: 'parallel',
  2294: 'aether',
  2295: 'aether',
  2317: 'aether',
  2325: 'aether',
  2346: 'aether',
  2356: 'aether',
  2397: 'aether',
  2402: 'aether',
  2421: 'aether',
  2446: 'aether',
  2454: 'aether',
  2460: 'spectra',
  2464: 'spectra',
  2466: 'spectra',
  2470: 'spectra',
  2480: 'spectra',
  2489: 'spectra',
  2497: 'spectra',
  2526: 'spectra',
  2528: 'spectra',
  2536: 'spectra',
  2537: 'spectra',
  2548: 'solveil',
  2558: 'solveil',
  2563: 'solveil',
  2574: 'solveil',
  2585: 'solveil',
  2596: 'solveil',
  2597: 'solveil',
  2599: 'solveil',
  2610: 'solveil',
  2614: 'solveil',
  2620: 'nebulu',
  2634: 'nebulu',
  2635: 'nebulu',
  2645: 'nebulu',
  2660: 'nebulu',
  2667: 'nebulu',
  2682: 'nebulu',
  2689: 'nebulu',
  2694: 'nebulu',
  2722: 'nebulu',
  2729: 'chroma',
  2730: 'chroma',
  2754: 'chroma',
  2756: 'chroma',
  2763: 'chroma',
  2781: 'chroma',
  2785: 'chroma',
  2789: 'chroma',
  2825: 'chroma',
  2835: 'chroma',
  2842: 'rose',
  2844: 'rose',
  2858: 'rose',
  2862: 'rose',
  2867: 'rose',
  2876: 'rose',
  2891: 'rose',
  2901: 'monflare',
  2935: 'monflare',
  2958: 'monflare',
  2970: 'monflare',
  2985: 'auracore',
  2987: 'auracore',
  2992: 'auracore',
  2999: 'auracore',
  3022: 'auracore',
  3035: 'parallel',
  3056: 'parallel',
  3073: 'parallel',
  3083: 'parallel',
  3096: 'parallel',
  3101: 'parallel',
  3117: 'aether',
  3134: 'aether',
  3144: 'aether',
  3146: 'aether',
  3159: 'spectra',
  3166: 'spectra',
  3169: 'spectra',
  3176: 'solveil',
  3189: 'parallel', // Example from user: Token 3189 has "parallel" constellation
  3199: 'nebulu',
  3205: 'chroma',
  3206: 'rose',
  3211: 'monflare',
  3219: 'auracore',
  3221: 'prime', // The legendary 1/1 Prime Star Skrumpey
  3222: 'spectra',
  3227: 'solveil',
  3258: 'nebulu',
  3263: 'chroma',
  3266: 'rose',
  3267: 'monflare',
  3268: 'auracore',
  3271: 'spectra',
  3279: 'solveil',
  3284: 'nebulu',
  3288: 'chroma',
  3294: 'rose',
  3295: 'monflare',
  3298: 'auracore',
  3311: 'spectra',
  3319: 'nebulu',
  3329: 'chroma',
  3332: 'rose',
};

/**
 * Get the constellation for a Star Skrumpey token ID from the static mapping.
 * This is the authoritative source - use this instead of getStarVariantForTokenId.
 */
export function getConstellationForToken(tokenId: number): StarTraitVariant | undefined {
  return STAR_CONSTELLATION_MAP[tokenId];
}

/**
 * Get all token IDs for a specific constellation type.
 */
export function getTokensForConstellation(constellation: StarTraitVariant): number[] {
  return Object.entries(STAR_CONSTELLATION_MAP)
    .filter(([, c]) => c === constellation)
    .map(([id]) => parseInt(id, 10))
    .sort((a, b) => a - b);
}

/**
 * Get constellation counts from the static data.
 * This should match CONSTELLATION_RARITY in starSkrumpey.ts
 */
export function getConstellationCounts(): Record<StarTraitVariant, number> {
  const counts = {} as Record<StarTraitVariant, number>;
  
  for (const constellation of Object.values(STAR_CONSTELLATION_MAP)) {
    counts[constellation] = (counts[constellation] || 0) + 1;
  }
  
  return counts;
}
