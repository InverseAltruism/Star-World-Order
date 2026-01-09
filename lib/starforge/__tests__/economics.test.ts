/**
 * Star Forge Economics Tests
 * 
 * Critical tests for fee calculations, payouts, and RTP.
 * These ensure the casino math is correct and solvent.
 * 
 * Key invariants:
 * - Fee splits must total 100%
 * - Star holders get better RTP (91% vs 88%)
 * - Payouts must never exceed treasury safety limits
 */

import { describe, it, expect } from 'vitest';
import { parseEther, formatEther } from 'viem';
import {
  TIERS,
  FEE_BPS,
  calculateFeeSplit,
  calculatePayout,
  isTierAvailable,
  getAvailableTiers,
  formatMON,
  calculateRTP,
  calculateHouseEdge,
  INITIAL_TREASURY_REQUIREMENTS,
  JACKPOT_MINIMUMS,
} from '../economics';

describe('Tier Configuration', () => {
  it('should have correct Bronze tier config', () => {
    expect(TIERS.bronze.name).toBe('Bronze');
    expect(TIERS.bronze.entryFee).toBe(parseEther('45'));
    expect(TIERS.bronze.maxPayout).toBe(parseEther('450'));
    expect(TIERS.bronze.minTreasuryRequired).toBe(parseEther('4500'));
  });

  it('should have correct Silver tier config', () => {
    expect(TIERS.silver.name).toBe('Silver');
    expect(TIERS.silver.entryFee).toBe(parseEther('225'));
    expect(TIERS.silver.maxPayout).toBe(parseEther('2250'));
    expect(TIERS.silver.minTreasuryRequired).toBe(parseEther('22500'));
  });

  it('should have correct Gold tier config', () => {
    expect(TIERS.gold.name).toBe('Gold');
    expect(TIERS.gold.entryFee).toBe(parseEther('450'));
    expect(TIERS.gold.maxPayout).toBe(parseEther('4500'));
    expect(TIERS.gold.minTreasuryRequired).toBe(parseEther('45000'));
  });

  it('should have max payout = 10x entry fee for all tiers', () => {
    for (const [, config] of Object.entries(TIERS)) {
      expect(config.maxPayout).toBe(config.entryFee * BigInt(10));
    }
  });

  it('should have min treasury = 10x max payout for all tiers', () => {
    for (const [, config] of Object.entries(TIERS)) {
      expect(config.minTreasuryRequired).toBe(config.maxPayout * BigInt(10));
    }
  });
});

describe('Fee BPS Configuration', () => {
  it('should have correct fee percentages', () => {
    expect(FEE_BPS.PRIZE_POOL).toBe(8800);      // 88%
    expect(FEE_BPS.JACKPOT_POOL).toBe(500);     // 5%
    expect(FEE_BPS.TREASURY_STANDARD).toBe(700); // 7%
    expect(FEE_BPS.TREASURY_STAR).toBe(400);     // 4%
    expect(FEE_BPS.STAR_BONUS).toBe(300);        // 3%
    expect(FEE_BPS.BPS_DIVISOR).toBe(10000);     // 100%
  });

  it('should have fees totaling 100% for standard players', () => {
    const total = FEE_BPS.PRIZE_POOL + FEE_BPS.JACKPOT_POOL + FEE_BPS.TREASURY_STANDARD;
    expect(total).toBe(10000); // 88% + 5% + 7% = 100%
  });

  it('should have fees totaling 100% for Star holders', () => {
    const total = FEE_BPS.PRIZE_POOL + FEE_BPS.JACKPOT_POOL + FEE_BPS.TREASURY_STAR + FEE_BPS.STAR_BONUS;
    expect(total).toBe(10000); // 88% + 5% + 4% + 3% = 100%
  });
});

describe('Fee Split Calculation - Standard Players', () => {
  const entryFee = parseEther('100'); // 100 MON for easy math

  it('should calculate correct fee split for standard player', () => {
    const split = calculateFeeSplit(entryFee, false);
    
    // 88% to prize pool = 88 MON
    expect(split.prizePool).toBe(parseEther('88'));
    
    // 5% to jackpot = 5 MON
    expect(split.jackpot).toBe(parseEther('5'));
    
    // 7% to treasury = 7 MON
    expect(split.treasury).toBe(parseEther('7'));
    
    // 0% bonus for standard
    expect(split.playerBonus).toBe(BigInt(0));
  });

  it('should have fee split totaling entry fee', () => {
    const split = calculateFeeSplit(entryFee, false);
    const total = split.prizePool + split.jackpot + split.treasury + split.playerBonus;
    expect(total).toBe(entryFee);
  });
});

describe('Fee Split Calculation - Star Holders', () => {
  const entryFee = parseEther('100'); // 100 MON

  it('should calculate correct fee split for Star holder', () => {
    const split = calculateFeeSplit(entryFee, true);
    
    // 88% to prize pool = 88 MON
    expect(split.prizePool).toBe(parseEther('88'));
    
    // 5% to jackpot = 5 MON
    expect(split.jackpot).toBe(parseEther('5'));
    
    // 4% to treasury = 4 MON (reduced from 7%)
    expect(split.treasury).toBe(parseEther('4'));
    
    // 3% bonus to player = 3 MON
    expect(split.playerBonus).toBe(parseEther('3'));
  });

  it('should have fee split totaling entry fee', () => {
    const split = calculateFeeSplit(entryFee, true);
    const total = split.prizePool + split.jackpot + split.treasury + split.playerBonus;
    expect(total).toBe(entryFee);
  });

  it('should give Star holders 3% more than standard players', () => {
    const standardSplit = calculateFeeSplit(entryFee, false);
    const starSplit = calculateFeeSplit(entryFee, true);
    
    // Treasury difference = 3% (7% - 4%)
    expect(standardSplit.treasury - starSplit.treasury).toBe(parseEther('3'));
    
    // That 3% goes to player bonus
    expect(starSplit.playerBonus).toBe(parseEther('3'));
  });
});

describe('Payout Calculation', () => {
  const entryFee = parseEther('100'); // 100 MON

  it('should return 0 for multiplier 0 (Void pattern)', () => {
    expect(calculatePayout(entryFee, 0, false)).toBe(BigInt(0));
    expect(calculatePayout(entryFee, 0, true)).toBe(BigInt(0));
  });

  it('should return -1 for jackpot (multiplier -1)', () => {
    expect(calculatePayout(entryFee, -1, false)).toBe(BigInt(-1));
    expect(calculatePayout(entryFee, -1, true)).toBe(BigInt(-1));
  });

  it('should calculate correct payout for 2x multiplier (Line)', () => {
    // Standard: 88 MON prize pool * 2 = 176 MON
    const standardPayout = calculatePayout(entryFee, 2, false);
    expect(standardPayout).toBe(parseEther('176'));
    
    // Star: 88 MON * 2 + 3 MON bonus = 179 MON
    const starPayout = calculatePayout(entryFee, 2, true);
    expect(starPayout).toBe(parseEther('179'));
  });

  it('should calculate correct payout for 10x multiplier (Galaxy)', () => {
    // Standard: 88 MON prize pool * 10 = 880 MON
    const standardPayout = calculatePayout(entryFee, 10, false);
    expect(standardPayout).toBe(parseEther('880'));
    
    // Star: 88 MON * 10 + 3 MON bonus = 883 MON
    const starPayout = calculatePayout(entryFee, 10, true);
    expect(starPayout).toBe(parseEther('883'));
  });

  it('should calculate correct payout for 1.3x multiplier (Binary)', () => {
    // Standard: 88 MON * 1.3 = 114.4 MON
    const standardPayout = calculatePayout(entryFee, 1.3, false);
    // BigInt math: 88 * 130 / 100 = 114.4 (but integer division)
    expect(standardPayout).toBe(parseEther('114.4'));
    
    // Star: 114.4 + 3 = 117.4 MON
    const starPayout = calculatePayout(entryFee, 1.3, true);
    expect(starPayout).toBe(parseEther('117.4'));
  });

  it('Star holders should always get higher payout', () => {
    const multipliers = [1.3, 2, 3, 5, 7, 10];
    
    for (const mult of multipliers) {
      const standardPayout = calculatePayout(entryFee, mult, false);
      const starPayout = calculatePayout(entryFee, mult, true);
      expect(starPayout).toBeGreaterThan(standardPayout);
    }
  });
});

describe('Tier Availability', () => {
  it('should make Bronze available with sufficient treasury', () => {
    expect(isTierAvailable('bronze', parseEther('4500'))).toBe(true);
    expect(isTierAvailable('bronze', parseEther('5000'))).toBe(true);
  });

  it('should make Bronze unavailable with insufficient treasury', () => {
    expect(isTierAvailable('bronze', parseEther('4499'))).toBe(false);
    expect(isTierAvailable('bronze', parseEther('0'))).toBe(false);
  });

  it('should make Silver available with sufficient treasury', () => {
    expect(isTierAvailable('silver', parseEther('22500'))).toBe(true);
    expect(isTierAvailable('silver', parseEther('30000'))).toBe(true);
  });

  it('should make Gold available with sufficient treasury', () => {
    expect(isTierAvailable('gold', parseEther('45000'))).toBe(true);
    expect(isTierAvailable('gold', parseEther('100000'))).toBe(true);
  });

  it('should return correct available tiers', () => {
    // No treasury
    expect(getAvailableTiers(BigInt(0))).toEqual([]);
    
    // Bronze only
    expect(getAvailableTiers(parseEther('5000'))).toEqual(['bronze']);
    
    // Bronze + Silver
    expect(getAvailableTiers(parseEther('25000'))).toEqual(['bronze', 'silver']);
    
    // All tiers
    expect(getAvailableTiers(parseEther('50000'))).toEqual(['bronze', 'silver', 'gold']);
  });
});

describe('RTP (Return to Player)', () => {
  it('should calculate 88% RTP for standard players', () => {
    expect(calculateRTP(false)).toBe(88);
  });

  it('should calculate 91% RTP for Star holders', () => {
    expect(calculateRTP(true)).toBe(91);
  });

  it('Star holders should have 3% better RTP', () => {
    expect(calculateRTP(true) - calculateRTP(false)).toBe(3);
  });
});

describe('House Edge', () => {
  it('should calculate 7% house edge for standard players', () => {
    expect(calculateHouseEdge(false)).toBe(7);
  });

  it('should calculate 4% house edge for Star holders', () => {
    expect(calculateHouseEdge(true)).toBe(4);
  });

  it('Star holders should have 3% lower house edge', () => {
    expect(calculateHouseEdge(false) - calculateHouseEdge(true)).toBe(3);
  });

  it('RTP + house edge should equal expected values', () => {
    // Standard: 88% RTP + 7% house + 5% jackpot = 100%
    // Note: RTP doesn't include jackpot allocation
    expect(calculateRTP(false) + calculateHouseEdge(false) + 5).toBe(100);
    
    // Star: 91% RTP + 4% house + 5% jackpot = 100%
    expect(calculateRTP(true) + calculateHouseEdge(true) + 5).toBe(100);
  });
});

describe('Format MON', () => {
  it('should format whole numbers correctly', () => {
    expect(formatMON(parseEther('100'))).toBe('100.00 MON');
    expect(formatMON(parseEther('45'))).toBe('45.00 MON');
  });

  it('should format decimals correctly', () => {
    expect(formatMON(parseEther('100.5'))).toBe('100.50 MON');
    expect(formatMON(parseEther('123.456'), 3)).toBe('123.456 MON');
  });

  it('should format large numbers correctly', () => {
    expect(formatMON(parseEther('1000000'))).toBe('1000000.00 MON');
  });

  it('should format zero correctly', () => {
    expect(formatMON(BigInt(0))).toBe('0.00 MON');
  });
});

describe('Treasury Requirements', () => {
  it('should have correct initial treasury requirements', () => {
    expect(INITIAL_TREASURY_REQUIREMENTS.bronze).toBe(parseEther('5000'));
    expect(INITIAL_TREASURY_REQUIREMENTS.silver).toBe(parseEther('15000'));
    expect(INITIAL_TREASURY_REQUIREMENTS.jackpotSeed).toBe(parseEther('1000'));
    expect(INITIAL_TREASURY_REQUIREMENTS.reserve).toBe(parseEther('1700'));
    expect(INITIAL_TREASURY_REQUIREMENTS.total).toBe(parseEther('22700'));
  });

  it('should have initial requirements sum to total', () => {
    const sum = 
      INITIAL_TREASURY_REQUIREMENTS.bronze +
      INITIAL_TREASURY_REQUIREMENTS.silver +
      INITIAL_TREASURY_REQUIREMENTS.jackpotSeed +
      INITIAL_TREASURY_REQUIREMENTS.reserve;
    expect(sum).toBe(INITIAL_TREASURY_REQUIREMENTS.total);
  });
});

describe('Jackpot Minimums', () => {
  it('should have progressive jackpot minimums', () => {
    expect(JACKPOT_MINIMUMS.bronze).toBe(parseEther('100'));
    expect(JACKPOT_MINIMUMS.silver).toBe(parseEther('500'));
    expect(JACKPOT_MINIMUMS.gold).toBe(parseEther('1000'));
    
    // Gold > Silver > Bronze
    expect(JACKPOT_MINIMUMS.gold).toBeGreaterThan(JACKPOT_MINIMUMS.silver);
    expect(JACKPOT_MINIMUMS.silver).toBeGreaterThan(JACKPOT_MINIMUMS.bronze);
  });
});

describe('Edge Cases & Solvency', () => {
  it('should handle very small entry fees', () => {
    const smallFee = parseEther('0.001');
    const split = calculateFeeSplit(smallFee, false);
    
    // Should not overflow or error
    expect(split.prizePool).toBeGreaterThanOrEqual(BigInt(0));
    expect(split.treasury).toBeGreaterThanOrEqual(BigInt(0));
  });

  it('should handle very large entry fees', () => {
    const largeFee = parseEther('1000000');
    const split = calculateFeeSplit(largeFee, false);
    
    // Should still total to entry fee
    const total = split.prizePool + split.jackpot + split.treasury + split.playerBonus;
    expect(total).toBe(largeFee);
  });

  it('should ensure house never pays out more than max payout', () => {
    // Max multiplier is 10x
    // With Bronze (45 MON entry), max payout = 450 MON
    const bronzeEntry = TIERS.bronze.entryFee;
    const maxPayout = calculatePayout(bronzeEntry, 10, true); // Star holder gets most
    
    // This should be less than or equal to max payout config
    // Actually, payout is from prize pool (88%) * 10 + bonus (3%)
    // = 39.6 + 1.35 = 40.95 MON, not 450 MON
    // The maxPayout in tier config is the jackpot amount, not regular wins
    expect(maxPayout).toBeLessThan(TIERS.bronze.maxPayout);
  });
});
