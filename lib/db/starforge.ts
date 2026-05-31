/**
 * Star Forge Database Functions — db helpers. Extracted from the lib/db.ts god-file.
 * Handle via ./connection.
 */
import { getDatabase } from './connection';


export interface StarForgeGame {
  id: string;
  player_address: string;
  tier: 'bronze' | 'silver' | 'gold';
  entry_fee: string;
  server_seed_hash: string;
  server_seed: string | null;
  client_seed: string | null;
  nonce: number;
  grid: number | null;
  pattern: string | null;
  multiplier: number | null;
  payout: string | null;
  is_star_holder: number;
  status: 'pending' | 'completed' | 'verified';
  created_at: string;
  completed_at: string | null;
  tx_hash: string | null;
}

export interface StarForgeJackpot {
  id: number;
  tier: 'bronze' | 'silver' | 'gold';
  pool_amount: string;
  last_won_at: string | null;
  last_winner: string | null;
  total_contributions: string;
  total_payouts: string;
  win_count: number;
}

export interface StarForgeTreasury {
  id: number;
  tier: 'bronze' | 'silver' | 'gold';
  balance: string;
  total_games: number;
  total_wagered: string;
  total_paid_out: string;
  house_profit: string;
}

/**
 * Create a new Star Forge game
 */
export function createStarForgeGame(data: {
  id: string;
  player_address: string;
  tier: 'bronze' | 'silver' | 'gold';
  entry_fee: string;
  server_seed_hash: string;
  nonce: number;
  is_star_holder: boolean;
}): StarForgeGame {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    INSERT INTO starforge_games (
      id, player_address, tier, entry_fee, server_seed_hash, 
      nonce, is_star_holder, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `);
  
  stmt.run(
    data.id,
    data.player_address.toLowerCase(),
    data.tier,
    data.entry_fee,
    data.server_seed_hash,
    data.nonce,
    data.is_star_holder ? 1 : 0
  );
  
  return getStarForgeGame(data.id)!;
}

/**
 * Get a Star Forge game by ID
 */
export function getStarForgeGame(id: string): StarForgeGame | null {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT * FROM starforge_games WHERE id = ?
  `);
  
  return stmt.get(id) as StarForgeGame | null;
}

/**
 * Complete a Star Forge game with results
 */
export function completeStarForgeGame(data: {
  id: string;
  server_seed: string;
  client_seed: string;
  grid: number;
  pattern: string;
  multiplier: number;
  payout: string;
  tx_hash?: string;
}): StarForgeGame | null {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    UPDATE starforge_games
    SET 
      server_seed = ?,
      client_seed = ?,
      grid = ?,
      pattern = ?,
      multiplier = ?,
      payout = ?,
      status = 'completed',
      completed_at = CURRENT_TIMESTAMP,
      tx_hash = ?
    WHERE id = ?
  `);
  
  stmt.run(
    data.server_seed,
    data.client_seed,
    data.grid,
    data.pattern,
    data.multiplier,
    data.payout,
    data.tx_hash || null,
    data.id
  );
  
  return getStarForgeGame(data.id);
}

/**
 * Get recent games for a player
 */
export function getPlayerStarForgeGames(
  playerAddress: string,
  limit: number = 20
): StarForgeGame[] {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT * FROM starforge_games
    WHERE player_address = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  
  return stmt.all(playerAddress.toLowerCase(), limit) as StarForgeGame[];
}

/**
 * Get recent games across all players
 */
export function getRecentStarForgeGames(limit: number = 50): StarForgeGame[] {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT * FROM starforge_games
    WHERE status = 'completed'
    ORDER BY completed_at DESC
    LIMIT ?
  `);
  
  return stmt.all(limit) as StarForgeGame[];
}

/**
 * Get jackpot pool for a tier
 */
export function getStarForgeJackpot(tier: 'bronze' | 'silver' | 'gold'): StarForgeJackpot | null {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT * FROM starforge_jackpots WHERE tier = ?
  `);
  
  return stmt.get(tier) as StarForgeJackpot | null;
}

/**
 * Get all jackpot pools
 */
export function getAllStarForgeJackpots(): StarForgeJackpot[] {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT * FROM starforge_jackpots ORDER BY tier
  `);
  
  return stmt.all() as StarForgeJackpot[];
}

/**
 * Add to jackpot pool
 */
export function addToStarForgeJackpot(
  tier: 'bronze' | 'silver' | 'gold',
  amount: string
): void {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    UPDATE starforge_jackpots
    SET 
      pool_amount = (CAST(pool_amount AS REAL) + CAST(? AS REAL)),
      total_contributions = (CAST(total_contributions AS REAL) + CAST(? AS REAL))
    WHERE tier = ?
  `);
  
  stmt.run(amount, amount, tier);
}

/**
 * Award jackpot to winner
 */
export function awardStarForgeJackpot(
  tier: 'bronze' | 'silver' | 'gold',
  winner: string,
  amount: string
): void {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    UPDATE starforge_jackpots
    SET 
      pool_amount = '0',
      last_won_at = CURRENT_TIMESTAMP,
      last_winner = ?,
      total_payouts = (CAST(total_payouts AS REAL) + CAST(? AS REAL)),
      win_count = win_count + 1
    WHERE tier = ?
  `);
  
  stmt.run(winner.toLowerCase(), amount, tier);
}

/**
 * Get treasury stats for a tier
 */
export function getStarForgeTreasury(tier: 'bronze' | 'silver' | 'gold'): StarForgeTreasury | null {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT * FROM starforge_treasury WHERE tier = ?
  `);
  
  return stmt.get(tier) as StarForgeTreasury | null;
}

/**
 * Get all treasury stats
 */
export function getAllStarForgeTreasury(): StarForgeTreasury[] {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT * FROM starforge_treasury ORDER BY tier
  `);
  
  return stmt.all() as StarForgeTreasury[];
}

/**
 * Update treasury stats after a game
 */
export function updateStarForgeTreasury(
  tier: 'bronze' | 'silver' | 'gold',
  wagered: string,
  payout: string,
  houseProfit: string
): void {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    UPDATE starforge_treasury
    SET 
      total_games = total_games + 1,
      total_wagered = (CAST(total_wagered AS REAL) + CAST(? AS REAL)),
      total_paid_out = (CAST(total_paid_out AS REAL) + CAST(? AS REAL)),
      house_profit = (CAST(house_profit AS REAL) + CAST(? AS REAL))
    WHERE tier = ?
  `);
  
  stmt.run(wagered, payout, houseProfit, tier);
}

/**
 * Get Star Forge statistics
 */
export function getStarForgeStats() {
  const db = getDatabase();
  
  // Total games played
  const totalGames = db.prepare(`
    SELECT COUNT(*) as count FROM starforge_games WHERE status = 'completed'
  `).get() as { count: number };
  
  // Total wagered across all tiers
  const totalWagered = db.prepare(`
    SELECT SUM(CAST(total_wagered AS REAL)) as total FROM starforge_treasury
  `).get() as { total: number };
  
  // Total paid out
  const totalPaidOut = db.prepare(`
    SELECT SUM(CAST(total_paid_out AS REAL)) as total FROM starforge_treasury
  `).get() as { total: number };
  
  // House profit
  const houseProfit = db.prepare(`
    SELECT SUM(CAST(house_profit AS REAL)) as total FROM starforge_treasury
  `).get() as { total: number };
  
  // Jackpot pools
  const jackpots = getAllStarForgeJackpots();
  
  return {
    totalGames: totalGames.count,
    totalWagered: totalWagered.total?.toString() || '0',
    totalPaidOut: totalPaidOut.total?.toString() || '0',
    houseProfit: houseProfit.total?.toString() || '0',
    jackpots,
  };
}
