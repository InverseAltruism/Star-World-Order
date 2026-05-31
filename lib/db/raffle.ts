/**
 * Raffle System Database Functions — db helpers. Extracted from the lib/db.ts god-file.
 * Handle via ./connection.
 */
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { getDatabase } from './connection';


export type RaffleStatus = 'active' | 'ended' | 'drawn' | 'cancelled';

export interface Raffle {
  id: string;
  name: string;
  description: string;
  prize_description: string;
  prize_image_url: string | null;
  status: RaffleStatus;
  created_by: string;
  start_time: string;
  end_time: string;
  winner_address: string | null;
  winner_drawn_at: string | null;
  winner_draw_seed: string | null;
  discord_bonus_enabled: number;
  require_x: number;
  require_discord: number;
  tweet_url: string | null;
  is_public: number; // 0 = Star only, 1 = All Skrumpey holders (Star gets x5, regular gets x1)
  created_at: string;
}

export interface RaffleEntry {
  id: number;
  raffle_id: string;
  wallet_address: string;
  tier: 'star_forged' | 'cosmic_warden' | 'star_lord' | 'cosmic_emperor' | 'skrumpey_holder';
  entries_count: number;
  discord_bonus: number;
  engagement_bonus: number;
  star_count: number;
  entered_at: string;
}

export interface RaffleEntryWithProfile extends RaffleEntry {
  display_name?: string;
}

/**
 * Holder tier thresholds
 * COSMIC EMPEROR: 10+ Star Skrumpeys = 4 entries
 * STAR LORD: 5-9 Star Skrumpeys = 3 entries
 * COSMIC WARDEN: 2-4 Star Skrumpeys = 2 entries
 * STAR FORGED: 1 Star Skrumpey = 1 entry
 */
export const HOLDER_TIERS = {
  cosmic_emperor: { minStars: 10, entries: 4, name: 'Cosmic Emperor' },
  star_lord: { minStars: 5, entries: 3, name: 'Star Lord' },
  cosmic_warden: { minStars: 2, entries: 2, name: 'Cosmic Warden' },
  star_forged: { minStars: 1, entries: 1, name: 'Star Forged' },
} as const;

export type HolderTier = keyof typeof HOLDER_TIERS;

/**
 * Calculate holder tier based on Star Skrumpey count
 */
export function calculateHolderTier(starCount: number): { tier: HolderTier; entries: number; name: string; minStars: number } | null {
  if (starCount >= 10) {
    return { tier: 'cosmic_emperor', ...HOLDER_TIERS.cosmic_emperor };
  }
  if (starCount >= 5) {
    return { tier: 'star_lord', ...HOLDER_TIERS.star_lord };
  }
  if (starCount >= 2) {
    return { tier: 'cosmic_warden', ...HOLDER_TIERS.cosmic_warden };
  }
  if (starCount >= 1) {
    return { tier: 'star_forged', ...HOLDER_TIERS.star_forged };
  }
  return null; // Not a holder
}

/**
 * Create a new raffle
 */
export function createRaffle(data: {
  id: string;
  name: string;
  description: string;
  prizeDescription: string;
  prizeImageUrl?: string;
  createdBy: string;
  startTime: Date;
  endTime: Date;
  discordBonusEnabled?: boolean;
  requireX?: boolean;
  requireDiscord?: boolean;
  tweetUrl?: string;
  isPublic?: boolean; // If true, all Skrumpey holders can enter (Star: x5, regular: x1)
}): Raffle {
  const db = getDatabase();
  
  // Create raffles table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS raffles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      prize_description TEXT NOT NULL,
      prize_image_url TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'drawn', 'cancelled')),
      created_by TEXT NOT NULL,
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      winner_address TEXT,
      winner_drawn_at DATETIME,
      winner_draw_seed TEXT,
      discord_bonus_enabled INTEGER NOT NULL DEFAULT 0,
      require_x INTEGER NOT NULL DEFAULT 0,
      require_discord INTEGER NOT NULL DEFAULT 0,
      tweet_url TEXT,
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Add new columns if they don't exist (migration)
  try {
    db.exec(`ALTER TABLE raffles ADD COLUMN require_x INTEGER NOT NULL DEFAULT 0`);
  } catch { /* Column may already exist */ }
  try {
    db.exec(`ALTER TABLE raffles ADD COLUMN require_discord INTEGER NOT NULL DEFAULT 0`);
  } catch { /* Column may already exist */ }
  try {
    db.exec(`ALTER TABLE raffles ADD COLUMN tweet_url TEXT`);
  } catch { /* Column may already exist */ }
  try {
    db.exec(`ALTER TABLE raffles ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0`);
  } catch { /* Column may already exist */ }
  
  // Create raffle entries table if it doesn't exist
  // Note: Added 'skrumpey_holder' tier for public raffles
  db.exec(`
    CREATE TABLE IF NOT EXISTS raffle_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raffle_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      tier TEXT NOT NULL CHECK (tier IN ('star_forged', 'cosmic_warden', 'star_lord', 'cosmic_emperor', 'skrumpey_holder')),
      entries_count INTEGER NOT NULL DEFAULT 1,
      discord_bonus INTEGER NOT NULL DEFAULT 0,
      engagement_bonus INTEGER NOT NULL DEFAULT 0,
      star_count INTEGER NOT NULL DEFAULT 1,
      entered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (raffle_id) REFERENCES raffles(id),
      UNIQUE(raffle_id, wallet_address)
    )
  `);
  
  // Add engagement_bonus column if it doesn't exist (migration)
  try {
    db.exec(`ALTER TABLE raffle_entries ADD COLUMN engagement_bonus INTEGER NOT NULL DEFAULT 0`);
  } catch { /* Column may already exist */ }
  
  // Migration: Update tier CHECK constraint to include 'skrumpey_holder' for public raffles
  // SQLite doesn't support modifying CHECK constraints, so we need to recreate the table
  try {
    // Check if we need to migrate by attempting to query for the constraint
    const tableInfo = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='raffle_entries'`).get() as { sql: string } | undefined;
    if (tableInfo && !tableInfo.sql.includes('skrumpey_holder')) {
      logger.info('Migrating raffle_entries table to support skrumpey_holder tier');
      
      // Create new table with updated constraint
      db.exec(`
        CREATE TABLE raffle_entries_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          raffle_id TEXT NOT NULL,
          wallet_address TEXT NOT NULL,
          tier TEXT NOT NULL CHECK (tier IN ('star_forged', 'cosmic_warden', 'star_lord', 'cosmic_emperor', 'skrumpey_holder')),
          entries_count INTEGER NOT NULL DEFAULT 1,
          discord_bonus INTEGER NOT NULL DEFAULT 0,
          engagement_bonus INTEGER NOT NULL DEFAULT 0,
          star_count INTEGER NOT NULL DEFAULT 1,
          entered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (raffle_id) REFERENCES raffles(id),
          UNIQUE(raffle_id, wallet_address)
        )
      `);
      
      // Copy existing data
      db.exec(`
        INSERT INTO raffle_entries_new (id, raffle_id, wallet_address, tier, entries_count, discord_bonus, engagement_bonus, star_count, entered_at)
        SELECT id, raffle_id, wallet_address, tier, entries_count, discord_bonus, engagement_bonus, star_count, entered_at
        FROM raffle_entries
      `);
      
      // Drop old table and rename new one
      db.exec(`DROP TABLE raffle_entries`);
      db.exec(`ALTER TABLE raffle_entries_new RENAME TO raffle_entries`);
      
      logger.info('Migration complete: raffle_entries table now supports skrumpey_holder tier');
    }
  } catch (migrationError) {
    logger.error('Migration error (raffle_entries tier constraint)', { error: String(migrationError) });
  }
  
  // Create raffle result view tracking (for one-time animation display)
  db.exec(`
    CREATE TABLE IF NOT EXISTS raffle_result_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raffle_id TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (raffle_id) REFERENCES raffles(id),
      UNIQUE(raffle_id, wallet_address)
    )
  `);
  
  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_raffles_status ON raffles(status, end_time);
    CREATE INDEX IF NOT EXISTS idx_raffle_entries_raffle ON raffle_entries(raffle_id);
    CREATE INDEX IF NOT EXISTS idx_raffle_entries_wallet ON raffle_entries(wallet_address);
    CREATE INDEX IF NOT EXISTS idx_raffle_result_views_raffle ON raffle_result_views(raffle_id, wallet_address);
  `);
  
  const stmt = db.prepare(`
    INSERT INTO raffles (id, name, description, prize_description, prize_image_url, created_by, start_time, end_time, discord_bonus_enabled, require_x, require_discord, tweet_url, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    data.id,
    data.name,
    data.description,
    data.prizeDescription,
    data.prizeImageUrl || null,
    data.createdBy.toLowerCase(),
    data.startTime.toISOString(),
    data.endTime.toISOString(),
    data.discordBonusEnabled ? 1 : 0,
    data.requireX ? 1 : 0,
    data.requireDiscord ? 1 : 0,
    data.tweetUrl || null,
    data.isPublic ? 1 : 0
  );
  
  return getRaffleById(data.id)!;
}

/**
 * Get raffle by ID
 */
export function getRaffleById(id: string): Raffle | null {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare('SELECT * FROM raffles WHERE id = ?');
    return stmt.get(id) as Raffle | null;
  } catch {
    // Table might not exist yet
    return null;
  }
}

/**
 * Get all raffles with optional status filter
 */
export function getRaffles(status?: RaffleStatus): Raffle[] {
  const db = getDatabase();
  
  try {
    if (status) {
      const stmt = db.prepare('SELECT * FROM raffles WHERE status = ? ORDER BY created_at DESC');
      return stmt.all(status) as Raffle[];
    }
    
    const stmt = db.prepare('SELECT * FROM raffles ORDER BY created_at DESC');
    return stmt.all() as Raffle[];
  } catch {
    // Table might not exist yet
    return [];
  }
}

/**
 * Get active raffles (started and not ended)
 */
export function getActiveRaffles(): Raffle[] {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT * FROM raffles 
      WHERE status = 'active' 
      AND datetime(start_time) <= datetime('now')
      AND datetime(end_time) > datetime('now')
      ORDER BY end_time ASC
    `);
    return stmt.all() as Raffle[];
  } catch {
    return [];
  }
}

/**
 * Get upcoming raffles (not yet started)
 */
export function getUpcomingRaffles(): Raffle[] {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT * FROM raffles 
      WHERE status = 'active' 
      AND datetime(start_time) > datetime('now')
      ORDER BY start_time ASC
    `);
    return stmt.all() as Raffle[];
  } catch {
    return [];
  }
}

/**
 * Get past raffles (ended or drawn)
 */
export function getPastRaffles(limit: number = 10): Raffle[] {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT * FROM raffles 
      WHERE status IN ('ended', 'drawn', 'cancelled')
      OR (status = 'active' AND datetime(end_time) <= datetime('now'))
      ORDER BY end_time DESC
      LIMIT ?
    `);
    return stmt.all(limit) as Raffle[];
  } catch {
    return [];
  }
}

/**
 * Get raffles that need to be auto-drawn (active but ended, not yet drawn)
 */
export function getRafflesNeedingDraw(): Raffle[] {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT * FROM raffles 
      WHERE status = 'active' 
      AND datetime(end_time) <= datetime('now')
      AND winner_address IS NULL
      ORDER BY end_time ASC
    `);
    return stmt.all() as Raffle[];
  } catch {
    return [];
  }
}

/**
 * Enter a raffle
 * 
 * For standard raffles: Only Star Skrumpey holders can enter, entries based on Star count tier
 * For public raffles: All Skrumpey holders can enter
 *   - Each regular Skrumpey = 1 entry
 *   - Star holders = 5 base + tier bonus (flat, not per star)
 *   - Total = regularSkrumpeys + (isStarHolder ? 5 + tierBonus : 0)
 */
export function enterRaffle(data: {
  raffleId: string;
  walletAddress: string;
  starCount: number;
  totalSkrumpeyBalance?: number; // Total Skrumpeys from Magic Eden (includes Stars)
  discordBonus?: boolean;
  engagementBonus?: boolean;
}): RaffleEntry | null {
  const db = getDatabase();
  const normalizedAddress = data.walletAddress.toLowerCase();
  
  // Check if raffle exists and is active
  const raffle = getRaffleById(data.raffleId);
  if (!raffle || raffle.status !== 'active') {
    return null;
  }
  
  // Check if raffle hasn't ended
  if (new Date(raffle.end_time) <= new Date()) {
    return null;
  }
  
  let tier: string;
  let baseEntries: number;
  
  // For public raffles, calculate entries based on holdings
  if (raffle.is_public === 1) {
    // Calculate regular Skrumpeys (total - stars)
    const totalBalance = data.totalSkrumpeyBalance ?? data.starCount;
    const regularSkrumpeys = Math.max(0, totalBalance - data.starCount);
    
    if (data.starCount > 0) {
      // Star holder: regularSkrumpeys × 1 + (5 base + tier bonus)
      const tierInfo = calculateHolderTier(data.starCount);
      if (!tierInfo) {
        return null; // Should not happen if starCount > 0
      }
      tier = tierInfo.tier;
      // Each regular Skrumpey = 1 entry, Star holder bonus = 5 + tier
      baseEntries = regularSkrumpeys + 5 + tierInfo.entries;
    } else {
      // Regular Skrumpey holder: each Skrumpey = 1 entry
      tier = 'skrumpey_holder';
      baseEntries = regularSkrumpeys > 0 ? regularSkrumpeys : 1; // At least 1 if they got here
    }
  } else {
    // Standard raffle - only Star holders can enter
    const tierInfo = calculateHolderTier(data.starCount);
    if (!tierInfo) {
      return null; // Not a Star holder
    }
    tier = tierInfo.tier;
    baseEntries = tierInfo.entries;
  }
  
  // Calculate total entries (base + engagement bonus for Like & RT)
  let totalEntries = baseEntries;
  // Discord bonus is deprecated, but keep for backwards compatibility
  const discordBonus = data.discordBonus && raffle.discord_bonus_enabled ? 1 : 0;
  // Engagement bonus: +1 for liking & retweeting the tweet (if tweet_url is set)
  const engagementBonus = data.engagementBonus && raffle.tweet_url ? 1 : 0;
  
  if (discordBonus) {
    totalEntries += 1;
  }
  if (engagementBonus) {
    totalEntries += 1;
  }
  
  try {
    const stmt = db.prepare(`
      INSERT INTO raffle_entries (raffle_id, wallet_address, tier, entries_count, discord_bonus, engagement_bonus, star_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(raffle_id, wallet_address) DO UPDATE SET
        tier = excluded.tier,
        entries_count = excluded.entries_count,
        discord_bonus = excluded.discord_bonus,
        engagement_bonus = excluded.engagement_bonus,
        star_count = excluded.star_count
    `);
    
    stmt.run(
      data.raffleId,
      normalizedAddress,
      tier,
      totalEntries,
      discordBonus,
      engagementBonus,
      data.starCount
    );
    
    return getRaffleEntry(data.raffleId, normalizedAddress);
  } catch (error) {
    logger.error('Error entering raffle', { error: String(error) });
    return null;
  }
}

/**
 * Get a user's entry for a specific raffle
 */
export function getRaffleEntry(raffleId: string, walletAddress: string): RaffleEntry | null {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT * FROM raffle_entries 
      WHERE raffle_id = ? AND wallet_address = ?
    `);
    return stmt.get(raffleId, walletAddress.toLowerCase()) as RaffleEntry | null;
  } catch {
    return null;
  }
}

/**
 * Get all entries for a raffle
 */
export function getRaffleEntries(raffleId: string): RaffleEntryWithProfile[] {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT e.*, p.display_name
      FROM raffle_entries e
      LEFT JOIN user_profiles p ON e.wallet_address = p.wallet_address
      WHERE e.raffle_id = ?
      ORDER BY e.entered_at ASC
    `);
    return stmt.all(raffleId) as RaffleEntryWithProfile[];
  } catch {
    return [];
  }
}

/**
 * Get total entry count for a raffle (weighted by entries_count)
 */
export function getRaffleTotalEntries(raffleId: string): { participants: number; totalTickets: number } {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as participants,
        SUM(entries_count) as totalTickets
      FROM raffle_entries 
      WHERE raffle_id = ?
    `);
    const result = stmt.get(raffleId) as { participants: number; totalTickets: number };
    return {
      participants: result.participants || 0,
      totalTickets: result.totalTickets || 0,
    };
  } catch {
    return { participants: 0, totalTickets: 0 };
  }
}

/**
 * Draw a winner for a raffle using combined entropy.
 *
 * Entropy sources:
 *  1. crypto.randomBytes(32) — server-side CSPRNG (unpredictable)
 *  2. SHA-256 of all entry wallet addresses + counts (tamper-evident)
 *  3. Raffle ID + timestamp (context binding)
 *  4. Optional block hash (additional public entropy when available)
 *
 * The seed string is stored in the database for auditability.
 * Because the server secret bytes are included, no external party
 * can predict or pre-compute the outcome.
 */
export function drawRaffleWinner(raffleId: string, blockHash?: string): {
  success: boolean;
  winner?: RaffleEntry;
  seed?: string;
  error?: string;
} {
  const db = getDatabase();

  const raffle = getRaffleById(raffleId);
  if (!raffle) {
    return { success: false, error: 'Raffle not found' };
  }

  if (raffle.winner_address) {
    return { success: false, error: 'Winner already drawn' };
  }

  const entries = getRaffleEntries(raffleId);
  if (entries.length === 0) {
    return { success: false, error: 'No entries in raffle' };
  }

  // Create weighted entry pool
  const entryPool: RaffleEntry[] = [];
  for (const entry of entries) {
    for (let i = 0; i < entry.entries_count; i++) {
      entryPool.push(entry);
    }
  }

  // --- Combined entropy seed ---
  // 1. Server-side CSPRNG — unpredictable, not derivable from public data
  const serverSecret = crypto.randomBytes(32).toString('hex');

  // 2. Entry-data hash — commits to the exact participant set
  const entryDataString = entries
    .map(e => `${e.wallet_address}:${e.entries_count}`)
    .sort()
    .join('|');
  const entryHash = crypto.createHash('sha256').update(entryDataString).digest('hex');

  // 3. Context binding
  const timestamp = Date.now().toString();

  // 4. Optional block hash (public chain entropy when available)
  const chainEntropy = blockHash || 'no-block';

  const seedString = `${serverSecret}-${entryHash}-${raffleId}-${timestamp}-${chainEntropy}-${entries.length}`;

  // Use cryptographically secure hash for verifiable randomness
  const hashBuffer = crypto.createHash('sha256').update(seedString).digest();
  // Read first 4 bytes as unsigned 32-bit integer for winner index
  const hashNumber = hashBuffer.readUInt32BE(0);

  // Select winner using the hash
  const winnerIndex = hashNumber % entryPool.length;
  const winner = entryPool[winnerIndex];

  // Update raffle with winner
  db.prepare(`
    UPDATE raffles
    SET
      status = 'drawn',
      winner_address = ?,
      winner_drawn_at = CURRENT_TIMESTAMP,
      winner_draw_seed = ?
    WHERE id = ?
  `).run(winner.wallet_address, seedString, raffleId);

  return {
    success: true,
    winner,
    seed: seedString,
  };
}

/**
 * End a raffle manually (without drawing winner)
 */
export function endRaffle(raffleId: string): boolean {
  const db = getDatabase();
  
  try {
    db.prepare(`
      UPDATE raffles SET status = 'ended' WHERE id = ?
    `).run(raffleId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cancel a raffle
 */
export function cancelRaffle(raffleId: string): boolean {
  const db = getDatabase();
  
  try {
    db.prepare(`
      UPDATE raffles SET status = 'cancelled' WHERE id = ?
    `).run(raffleId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if user has viewed raffle result (for one-time animation)
 */
export function hasViewedRaffleResult(raffleId: string, walletAddress: string): boolean {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT 1 FROM raffle_result_views 
      WHERE raffle_id = ? AND wallet_address = ?
    `);
    return !!stmt.get(raffleId, walletAddress.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Mark raffle result as viewed
 */
export function markRaffleResultViewed(raffleId: string, walletAddress: string): void {
  const db = getDatabase();
  
  try {
    db.prepare(`
      INSERT OR IGNORE INTO raffle_result_views (raffle_id, wallet_address)
      VALUES (?, ?)
    `).run(raffleId, walletAddress.toLowerCase());
  } catch (error) {
    logger.error('Error marking raffle result as viewed', { error: String(error) });
  }
}

/**
 * Get all raffles a user has entered (for Raffle History)
 */
export function getUserRaffleEntries(walletAddress: string): Array<RaffleEntry & { 
  raffle: Raffle;
  won: boolean;
}> {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT e.*, 
             r.id as raffle_id, r.name as raffle_name, r.description as raffle_description,
             r.status as raffle_status, r.prize_description, r.prize_image_url,
             r.start_time, r.end_time, r.winner_address, r.winner_drawn_at, r.winner_draw_seed,
             r.discord_bonus_enabled, r.require_x, r.require_discord, r.tweet_url, r.created_at
      FROM raffle_entries e
      JOIN raffles r ON e.raffle_id = r.id
      WHERE e.wallet_address = ?
      ORDER BY e.entered_at DESC
    `);
    
    const results = stmt.all(walletAddress.toLowerCase()) as Array<RaffleEntry & { 
      raffle_name: string; 
      raffle_description: string;
      raffle_status: string;
      prize_description: string;
      prize_image_url: string | null;
      start_time: string;
      end_time: string;
      winner_address: string | null;
      winner_drawn_at: string | null;
      winner_draw_seed: string | null;
      discord_bonus_enabled: number;
      require_x: number;
      require_discord: number;
      tweet_url: string | null;
      created_at: string;
    }>;
    
    const normalizedAddress = walletAddress.toLowerCase();
    
    return results.map(row => ({
      ...row,
      won: row.winner_address?.toLowerCase() === normalizedAddress,
      raffle: {
        id: row.raffle_id,
        name: row.raffle_name,
        description: row.raffle_description,
        status: row.raffle_status as RaffleStatus,
        prize_description: row.prize_description,
        prize_image_url: row.prize_image_url,
        start_time: row.start_time,
        end_time: row.end_time,
        winner_address: row.winner_address,
        winner_drawn_at: row.winner_drawn_at,
        winner_draw_seed: row.winner_draw_seed,
        discord_bonus_enabled: row.discord_bonus_enabled,
        require_x: row.require_x || 0,
        require_discord: row.require_discord || 0,
        tweet_url: row.tweet_url,
        created_at: row.created_at,
        created_by: '', // Not needed for history display
      } as Raffle,
    }));
  } catch {
    return [];
  }
}

/**
 * Check if a user has connected specific social accounts
 */
export function checkSocialConnections(walletAddress: string): {
  hasDiscord: boolean;
  hasX: boolean;
  discord?: { username: string; platform_user_id: string };
  x?: { username: string; platform_user_id: string };
} {
  const db = getDatabase();
  const normalizedAddress = walletAddress.toLowerCase();
  
  try {
    const stmt = db.prepare(`
      SELECT platform, username, platform_user_id
      FROM social_connections
      WHERE wallet_address = ?
    `);
    
    const connections = stmt.all(normalizedAddress) as Array<{
      platform: string;
      username: string;
      platform_user_id: string;
    }>;
    
    const discord = connections.find(c => c.platform === 'discord');
    const x = connections.find(c => c.platform === 'x');
    
    return {
      hasDiscord: !!discord,
      hasX: !!x,
      discord: discord ? { username: discord.username, platform_user_id: discord.platform_user_id } : undefined,
      x: x ? { username: x.username, platform_user_id: x.platform_user_id } : undefined,
    };
  } catch {
    return { hasDiscord: false, hasX: false };
  }
}

/**
 * Get raffle entries for CSV export (admin function)
 */
export function getRaffleEntriesForExport(raffleId: string): Array<{
  wallet_address: string;
  display_name: string | null;
  tier: string;
  entries_count: number;
  star_count: number;
  engagement_bonus: number;
  discord_bonus: number;
  entered_at: string;
  discord_username: string | null;
  x_username: string | null;
}> {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT 
        e.wallet_address,
        p.display_name,
        e.tier,
        e.entries_count,
        e.star_count,
        e.engagement_bonus,
        e.discord_bonus,
        e.entered_at,
        sd.username as discord_username,
        sx.username as x_username
      FROM raffle_entries e
      LEFT JOIN user_profiles p ON e.wallet_address = p.wallet_address
      LEFT JOIN social_connections sd ON e.wallet_address = sd.wallet_address AND sd.platform = 'discord'
      LEFT JOIN social_connections sx ON e.wallet_address = sx.wallet_address AND sx.platform = 'x'
      WHERE e.raffle_id = ?
      ORDER BY e.entered_at ASC
    `);
    
    return stmt.all(raffleId) as Array<{
      wallet_address: string;
      display_name: string | null;
      tier: string;
      entries_count: number;
      star_count: number;
      engagement_bonus: number;
      discord_bonus: number;
      entered_at: string;
      discord_username: string | null;
      x_username: string | null;
    }>;
  } catch {
    return [];
  }
}
