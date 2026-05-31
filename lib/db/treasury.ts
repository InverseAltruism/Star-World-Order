/**
 * Treasury NFT cache — db helpers.
 *
 * Per-wallet cache of treasury-held NFTs (populated from on-chain ownerOf
 * multicalls upstream) with a freshness/age check. Self-contained leaf domain;
 * gets its handle from ./connection. Extracted from the lib/db.ts god-file.
 */
import { getDatabase } from './connection';

export interface CachedNFT {
  id?: number;
  wallet_address: string;
  contract_address: string;
  token_id: string;
  name?: string;
  collection_name: string;
  image_url?: string;
  metadata_json?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Get cached NFTs for a wallet (returns null if cache expired)
 * 
 * @param walletAddress Wallet address to get cached NFTs for
 * @param maxAgeHours Maximum age of cache in hours (default: 24)
 * @returns Array of cached NFTs or null if cache is expired/empty
 */
export function getCachedTreasuryNFTs(
  walletAddress: string,
  maxAgeHours: number = 24
): CachedNFT[] | null {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Check if we have any cached data
  const count = db.prepare(`
    SELECT COUNT(*) as count 
    FROM treasury_nft_cache 
    WHERE wallet_address = ?
  `).get(normalizedAddress) as { count: number };
  
  if (count.count === 0) {
    return null; // No cache
  }
  
  // Check if cache is expired
  const ageCheck = db.prepare(`
    SELECT 
      MAX(updated_at) as latest_update,
      (julianday('now') - julianday(MAX(updated_at))) * 24 as age_hours
    FROM treasury_nft_cache 
    WHERE wallet_address = ?
  `).get(normalizedAddress) as { latest_update: string; age_hours: number };
  
  if (ageCheck.age_hours > maxAgeHours) {
    return null; // Cache expired
  }
  
  // Return cached data
  const cached = db.prepare(`
    SELECT * FROM treasury_nft_cache 
    WHERE wallet_address = ?
    ORDER BY collection_name, token_id
  `).all(normalizedAddress) as CachedNFT[];
  
  return cached;
}

/**
 * Save NFTs to cache (upsert)
 * 
 * @param walletAddress Wallet address
 * @param nfts Array of NFTs to cache
 */
export function cacheTreasuryNFTs(walletAddress: string, nfts: CachedNFT[]): void {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  // Start transaction for batch insert
  const insertStmt = db.prepare(`
    INSERT INTO treasury_nft_cache (
      wallet_address, contract_address, token_id, 
      name, collection_name, image_url, metadata_json, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(wallet_address, contract_address, token_id) 
    DO UPDATE SET 
      name = excluded.name,
      collection_name = excluded.collection_name,
      image_url = excluded.image_url,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  const insertMany = db.transaction((nftList: CachedNFT[]) => {
    for (const nft of nftList) {
      insertStmt.run(
        normalizedAddress,
        nft.contract_address.toLowerCase(),
        nft.token_id,
        nft.name || null,
        nft.collection_name,
        nft.image_url || null,
        nft.metadata_json || null
      );
    }
  });
  
  insertMany(nfts);
}

/**
 * Clear cache for a wallet (for manual refresh)
 * 
 * @param walletAddress Wallet address to clear cache for
 */
export function clearTreasuryNFTCache(walletAddress: string): void {
  const db = getDatabase();
  db.prepare(`
    DELETE FROM treasury_nft_cache 
    WHERE wallet_address = ?
  `).run(walletAddress.toLowerCase());
}

/**
 * Get cache age for a wallet in hours
 * 
 * @param walletAddress Wallet address
 * @returns Age in hours or null if no cache
 */
export function getTreasuryNFTCacheAge(walletAddress: string): number | null {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT (julianday('now') - julianday(MAX(updated_at))) * 24 as age_hours
    FROM treasury_nft_cache 
    WHERE wallet_address = ?
  `).get(walletAddress.toLowerCase()) as { age_hours: number | null };
  
  return result.age_hours;
}
