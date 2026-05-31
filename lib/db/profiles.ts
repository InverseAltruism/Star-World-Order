/**
 * USER PROFILES — db helpers. Extracted from the lib/db.ts god-file.
 * Handle via ./connection.
 */
import { getDatabase } from './connection';


export interface UserProfile {
  id: number;
  wallet_address: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  displayed_badges: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get or create user profile
 */
export function getUserProfile(walletAddress: string): UserProfile | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM user_profiles WHERE wallet_address = ?');
  return stmt.get(walletAddress.toLowerCase()) as UserProfile | null;
}

/**
 * Get multiple user profiles by wallet addresses (batch lookup)
 */
export function getUserProfilesBatch(walletAddresses: string[]): Map<string, UserProfile> {
  if (walletAddresses.length === 0) return new Map();
  
  const db = getDatabase();
  const normalizedAddresses = walletAddresses.map(a => a.toLowerCase());
  
  // Use parameterized query with IN clause
  const placeholders = normalizedAddresses.map(() => '?').join(',');
  const stmt = db.prepare(`SELECT * FROM user_profiles WHERE wallet_address IN (${placeholders})`);
  const profiles = stmt.all(...normalizedAddresses) as UserProfile[];
  
  // Convert to map for O(1) lookup
  const profileMap = new Map<string, UserProfile>();
  for (const profile of profiles) {
    profileMap.set(profile.wallet_address.toLowerCase(), profile);
  }
  
  return profileMap;
}

/**
 * Update or create user profile
 */
export function updateUserProfile(
  walletAddress: string,
  data: {
    displayName?: string;
    bio?: string;
    avatarTokenId?: number | null;
    displayedBadges?: string[];
  }
): UserProfile {
  const db = getDatabase();
  
  // Convert displayedBadges array to JSON string for storage
  const badgesJson = data.displayedBadges ? JSON.stringify(data.displayedBadges) : null;
  
  // Store avatar token ID as string in avatar_url field
  const avatarValue = data.avatarTokenId !== undefined 
    ? (data.avatarTokenId !== null ? String(data.avatarTokenId) : null) 
    : undefined;
  
  const updateStmt = db.prepare(`
    INSERT INTO user_profiles (wallet_address, display_name, bio, avatar_url, displayed_badges)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(wallet_address) DO UPDATE SET
      display_name = COALESCE(?, display_name),
      bio = COALESCE(?, bio),
      avatar_url = COALESCE(?, avatar_url),
      displayed_badges = COALESCE(?, displayed_badges),
      updated_at = CURRENT_TIMESTAMP
  `);
  
  updateStmt.run(
    walletAddress.toLowerCase(),
    data.displayName || null,
    data.bio || null,
    avatarValue !== undefined ? avatarValue : null,
    badgesJson,
    data.displayName || null,
    data.bio || null,
    avatarValue !== undefined ? avatarValue : null,
    badgesJson
  );
  
  const getStmt = db.prepare('SELECT * FROM user_profiles WHERE wallet_address = ?');
  return getStmt.get(walletAddress.toLowerCase()) as UserProfile;
}
