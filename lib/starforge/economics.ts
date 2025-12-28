/**
 * Star Forge - Economic Calculations
 * 
 * Handles entry fees, payouts, and treasury management
 * 
 * Tier System (MON price ~$0.022):
 * - Bronze: 45 MON entry → 450 MON max win ($1 → $10)
 * - Silver: 225 MON entry → 2,250 MON max win ($5 → $50)
 * - Gold: 450 MON entry → 4,500 MON max win ($10 → $100)
 * 
 * Fee Distribution:
 * - 88% → Prize Pool (regular wins)
 * - 5% → Jackpot Pool (Supernova only)
 * - 7% → Treasury (house edge)
 * - Star trait holders: 4% treasury instead (3% back to player RTP)
 */

import { parseEther } from 'viem';

/**
 * Tier configuration
 */
export interface TierConfig {
  name: string;
  entryFee: bigint;           // Entry fee in wei
  maxPayout: bigint;          // Maximum payout (10x entry)
  minTreasuryRequired: bigint; // Minimum treasury balance to enable tier
}

/**
 * Tier definitions
 * Entry fees and max payouts (10x)
 */
export const TIERS: Record<'bronze' | 'silver' | 'gold', TierConfig> = {
  bronze: {
    name: 'Bronze',
    entryFee: parseEther('45'),           // 45 MON
    maxPayout: parseEther('450'),         // 450 MON (10x)
    minTreasuryRequired: parseEther('4500'), // 4,500 MON (10x max payout)
  },
  silver: {
    name: 'Silver',
    entryFee: parseEther('225'),          // 225 MON
    maxPayout: parseEther('2250'),        // 2,250 MON (10x)
    minTreasuryRequired: parseEther('22500'), // 22,500 MON (10x max payout)
  },
  gold: {
    name: 'Gold',
    entryFee: parseEther('450'),          // 450 MON
    maxPayout: parseEther('4500'),        // 4,500 MON (10x)
    minTreasuryRequired: parseEther('45000'), // 45,000 MON (10x max payout)
  },
};

/**
 * Fee basis points (out of 10,000)
 * Standard: 88% prize, 5% jackpot, 7% treasury
 * Star holders: 88% prize, 5% jackpot, 4% treasury, 3% bonus to player
 */
export const FEE_BPS = {
  PRIZE_POOL: 8800,           // 88% to prize pool
  JACKPOT_POOL: 500,          // 5% to jackpot
  TREASURY_STANDARD: 700,     // 7% to treasury (standard)
  TREASURY_STAR: 400,         // 4% to treasury (Star holders)
  STAR_BONUS: 300,            // 3% bonus to Star holders
  BPS_DIVISOR: 10000,         // 100% = 10,000 BPS
};

/**
 * Fee split result
 */
export interface FeeSplit {
  prizePool: bigint;    // Amount allocated to prize pool
  jackpot: bigint;      // Amount allocated to jackpot pool
  treasury: bigint;     // Amount allocated to treasury
  playerBonus: bigint;  // Bonus returned to Star holder (0 for non-Star)
}

/**
 * Calculate fee split for an entry fee
 * 
 * Standard players:
 * - 88% → Prize pool
 * - 5% → Jackpot pool
 * - 7% → Treasury
 * 
 * Star holders:
 * - 88% → Prize pool
 * - 5% → Jackpot pool
 * - 4% → Treasury
 * - 3% → Player bonus (better RTP)
 * 
 * @param entryFee - Entry fee in wei
 * @param isStarHolder - Whether player holds Star Skrumpey
 * @returns Fee split breakdown
 */
export function calculateFeeSplit(
  entryFee: bigint,
  isStarHolder: boolean
): FeeSplit {
  const prizePool = (entryFee * BigInt(FEE_BPS.PRIZE_POOL)) / BigInt(FEE_BPS.BPS_DIVISOR);
  const jackpot = (entryFee * BigInt(FEE_BPS.JACKPOT_POOL)) / BigInt(FEE_BPS.BPS_DIVISOR);
  
  if (isStarHolder) {
    // Star holder: 4% treasury, 3% bonus to player
    const treasury = (entryFee * BigInt(FEE_BPS.TREASURY_STAR)) / BigInt(FEE_BPS.BPS_DIVISOR);
    const playerBonus = (entryFee * BigInt(FEE_BPS.STAR_BONUS)) / BigInt(FEE_BPS.BPS_DIVISOR);
    
    return {
      prizePool,
      jackpot,
      treasury,
      playerBonus,
    };
  } else {
    // Standard player: 7% treasury, 0% bonus
    const treasury = (entryFee * BigInt(FEE_BPS.TREASURY_STANDARD)) / BigInt(FEE_BPS.BPS_DIVISOR);
    
    return {
      prizePool,
      jackpot,
      treasury,
      playerBonus: BigInt(0),
    };
  }
}

/**
 * Calculate payout for a game result
 * 
 * Payout = (Prize Pool allocation) * Multiplier + Player Bonus
 * 
 * For Supernova (multiplier = -1), returns jackpot flag
 * For other patterns, returns standard payout
 * 
 * @param entryFee - Entry fee in wei
 * @param multiplier - Pattern multiplier (-1 for jackpot)
 * @param isStarHolder - Whether player holds Star Skrumpey
 * @returns Payout amount in wei, or -1n for jackpot
 */
export function calculatePayout(
  entryFee: bigint,
  multiplier: number,
  isStarHolder: boolean
): bigint {
  // Special case: Supernova (jackpot)
  if (multiplier === -1) {
    return BigInt(-1); // Indicates jackpot win
  }
  
  // No win
  if (multiplier === 0) {
    return BigInt(0);
  }
  
  const feeSplit = calculateFeeSplit(entryFee, isStarHolder);
  
  // Calculate base payout from prize pool
  const multiplierBigInt = BigInt(Math.floor(multiplier * 100)); // Convert to basis points
  const basePayout = (feeSplit.prizePool * multiplierBigInt) / BigInt(100);
  
  // Add player bonus for Star holders
  const totalPayout = basePayout + feeSplit.playerBonus;
  
  return totalPayout;
}

/**
 * Check if a tier is available based on treasury balance
 * 
 * Safety mechanism: Tier requires 10x max payout in treasury
 * This ensures house can always cover maximum win
 * 
 * @param tier - Tier name
 * @param treasuryBalance - Current treasury balance in wei
 * @returns Whether tier is available
 */
export function isTierAvailable(
  tier: 'bronze' | 'silver' | 'gold',
  treasuryBalance: bigint
): boolean {
  const config = TIERS[tier];
  return treasuryBalance >= config.minTreasuryRequired;
}

/**
 * Get available tiers based on treasury balance
 * 
 * @param treasuryBalance - Current treasury balance in wei
 * @returns Array of available tier names
 */
export function getAvailableTiers(
  treasuryBalance: bigint
): Array<'bronze' | 'silver' | 'gold'> {
  const tiers: Array<'bronze' | 'silver' | 'gold'> = [];
  
  if (isTierAvailable('bronze', treasuryBalance)) {
    tiers.push('bronze');
  }
  if (isTierAvailable('silver', treasuryBalance)) {
    tiers.push('silver');
  }
  if (isTierAvailable('gold', treasuryBalance)) {
    tiers.push('gold');
  }
  
  return tiers;
}

/**
 * Format MON amount for display
 * 
 * @param amount - Amount in wei
 * @param decimals - Number of decimal places (default 2)
 * @returns Formatted string with MON symbol
 */
export function formatMON(amount: bigint, decimals: number = 2): string {
  const mon = Number(amount) / 1e18;
  return `${mon.toFixed(decimals)} MON`;
}

/**
 * Calculate expected RTP (Return to Player) percentage
 * 
 * Standard RTP: 88% (prize pool)
 * Star holder RTP: 91% (prize pool + 3% bonus)
 * 
 * @param isStarHolder - Whether player holds Star Skrumpey
 * @returns RTP percentage (0-100)
 */
export function calculateRTP(isStarHolder: boolean): number {
  if (isStarHolder) {
    return (FEE_BPS.PRIZE_POOL + FEE_BPS.STAR_BONUS) / 100; // 91%
  } else {
    return FEE_BPS.PRIZE_POOL / 100; // 88%
  }
}

/**
 * Calculate house edge percentage
 * 
 * Standard house edge: 7% (treasury)
 * Star holder house edge: 4% (treasury, 3% given back as bonus)
 * 
 * @param isStarHolder - Whether player holds Star Skrumpey
 * @returns House edge percentage (0-100)
 */
export function calculateHouseEdge(isStarHolder: boolean): number {
  if (isStarHolder) {
    return FEE_BPS.TREASURY_STAR / 100; // 4%
  } else {
    return FEE_BPS.TREASURY_STANDARD / 100; // 7%
  }
}

/**
 * Initial treasury requirements for game launch
 */
export const INITIAL_TREASURY_REQUIREMENTS = {
  bronze: parseEther('5000'),      // 5,000 MON for Bronze pool
  silver: parseEther('15000'),     // 15,000 MON for Silver pool
  jackpotSeed: parseEther('1000'), // 1,000 MON jackpot seed
  reserve: parseEther('1700'),     // 1,700 MON reserve
  total: parseEther('22700'),      // 22,700 MON total (~$500)
};

/**
 * Recommended minimum jackpot pool sizes
 */
export const JACKPOT_MINIMUMS = {
  bronze: parseEther('100'),   // 100 MON (~$2.20)
  silver: parseEther('500'),   // 500 MON (~$11)
  gold: parseEther('1000'),    // 1,000 MON (~$22)
};
