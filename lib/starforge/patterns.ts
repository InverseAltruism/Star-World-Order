/**
 * Star Forge - Constellation Pattern Matching
 * 
 * Detects constellation patterns in 5x5 grids for payout calculation
 * 
 * Grid Coordinate System:
 * (0,0) (0,1) (0,2) (0,3) (0,4)
 * (1,0) (1,1) (1,2) (1,3) (1,4)
 * (2,0) (2,1) (2,2) (2,3) (2,4)
 * (3,0) (3,1) (3,2) (3,3) (3,4)
 * (4,0) (4,1) (4,2) (4,3) (4,4)
 * 
 * Bit Index = row * 5 + col
 */

import { getGridCell, countStars } from './rng';

/**
 * Constellation pattern types with multipliers
 */
export enum ConstellationPattern {
  SUPERNOVA = 'supernova',    // All 25 stars - JACKPOT
  GALAXY = 'galaxy',          // 20+ stars - 10x
  BIG_DIPPER = 'big_dipper',  // 7-star ladle - 7x
  ORION = 'orion',            // Diagonal + belt - 5x
  CASSIOPEIA = 'cassiopeia',  // W-shape - 5x
  CRUX = 'crux',              // Cross/plus - 3x
  LINE = 'line',              // 5 in row/col/diag - 2x
  BINARY = 'binary',          // 2+ adjacent - 1.3x
  VOID = 'void',              // No pattern - 0x
}

/**
 * Pattern multiplier mapping
 */
export const PATTERN_MULTIPLIERS: Record<ConstellationPattern, number> = {
  [ConstellationPattern.SUPERNOVA]: -1,  // Special: JACKPOT
  [ConstellationPattern.GALAXY]: 10,
  [ConstellationPattern.BIG_DIPPER]: 7,
  [ConstellationPattern.ORION]: 5,
  [ConstellationPattern.CASSIOPEIA]: 5,
  [ConstellationPattern.CRUX]: 3,
  [ConstellationPattern.LINE]: 2,
  [ConstellationPattern.BINARY]: 1.3,
  [ConstellationPattern.VOID]: 0,
};

/**
 * Pattern definitions as cell coordinates
 * Each pattern is an array of [row, col] positions
 */

// Big Dipper: Classic ladle shape
//   ·  ·  *  ·  ·
//   ·  ·  ·  *  ·
//   ·  *  ·  ·  ·
//   *  ·  ·  ·  ·
//   ·  ·  *  *  *
const BIG_DIPPER_PATTERNS = [
  // Original orientation
  [[0, 2], [1, 3], [2, 1], [3, 0], [4, 2], [4, 3], [4, 4]],
  // Flipped horizontally
  [[0, 2], [1, 1], [2, 3], [3, 4], [4, 0], [4, 1], [4, 2]],
  // Rotated 90 degrees (handle up)
  [[0, 3], [1, 2], [2, 4], [3, 4], [4, 0], [4, 1], [4, 2]],
  // Rotated 180 degrees
  [[0, 0], [0, 1], [0, 2], [1, 4], [2, 3], [3, 1], [4, 2]],
];

// Orion: Diagonal with belt (5-7 stars)
//   *  ·  ·  ·  ·
//   ·  *  ·  ·  ·
//   ·  *  *  *  ·
//   ·  ·  ·  *  ·
//   ·  ·  ·  ·  *
const ORION_PATTERNS = [
  // Diagonal with belt in middle
  [[0, 0], [1, 1], [2, 1], [2, 2], [2, 3], [3, 3], [4, 4]],
  // Reversed diagonal with belt
  [[0, 4], [1, 3], [2, 1], [2, 2], [2, 3], [3, 1], [4, 0]],
  // Vertical with horizontal belt
  [[0, 2], [1, 2], [2, 1], [2, 2], [2, 3], [3, 2], [4, 2]],
];

// Cassiopeia: W-shape (5 stars minimum)
//   *  ·  ·  ·  *
//   ·  *  ·  *  ·
//   ·  ·  *  ·  ·
//   ·  ·  ·  ·  ·
//   ·  ·  ·  ·  ·
const CASSIOPEIA_PATTERNS = [
  // W-shape
  [[0, 0], [1, 1], [2, 2], [1, 3], [0, 4]],
  // M-shape (upside down W)
  [[2, 2], [1, 1], [0, 0], [1, 3], [2, 4]],
  // Sideways W
  [[0, 0], [1, 1], [2, 2], [3, 1], [4, 0]],
  [[0, 4], [1, 3], [2, 2], [3, 3], [4, 4]],
];

// Crux (Southern Cross): Plus/cross pattern (5 stars minimum)
//   ·  ·  *  ·  ·
//   ·  ·  *  ·  ·
//   *  *  *  *  *
//   ·  ·  *  ·  ·
//   ·  ·  *  ·  ·
const CRUX_PATTERNS = [
  // Perfect cross
  [[0, 2], [1, 2], [2, 0], [2, 1], [2, 2], [2, 3], [2, 4], [3, 2], [4, 2]],
  // Smaller cross (5 stars)
  [[1, 2], [2, 1], [2, 2], [2, 3], [3, 2]],
  // Off-center cross
  [[0, 1], [1, 1], [2, 0], [2, 1], [2, 2], [3, 1]],
];

/**
 * Check if grid matches a specific pattern
 * Pattern must have all specified stars present
 */
function matchesPattern(grid: number, pattern: number[][]): boolean {
  for (const [row, col] of pattern) {
    if (!getGridCell(grid, row, col)) {
      return false;
    }
  }
  return true;
}

/**
 * Check if grid has a complete line (5 stars)
 * Checks rows, columns, and diagonals
 */
export function hasLine(grid: number): boolean {
  // Check rows
  for (let row = 0; row < 5; row++) {
    let count = 0;
    for (let col = 0; col < 5; col++) {
      if (getGridCell(grid, row, col)) count++;
    }
    if (count === 5) return true;
  }
  
  // Check columns
  for (let col = 0; col < 5; col++) {
    let count = 0;
    for (let row = 0; row < 5; row++) {
      if (getGridCell(grid, row, col)) count++;
    }
    if (count === 5) return true;
  }
  
  // Check main diagonal (top-left to bottom-right)
  let diag1Count = 0;
  for (let i = 0; i < 5; i++) {
    if (getGridCell(grid, i, i)) diag1Count++;
  }
  if (diag1Count === 5) return true;
  
  // Check anti-diagonal (top-right to bottom-left)
  let diag2Count = 0;
  for (let i = 0; i < 5; i++) {
    if (getGridCell(grid, i, 4 - i)) diag2Count++;
  }
  if (diag2Count === 5) return true;
  
  return false;
}

/**
 * Check if grid has at least 2 adjacent stars (horizontally or vertically)
 */
export function hasAdjacent(grid: number): boolean {
  // Check horizontal adjacency
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 4; col++) {
      if (getGridCell(grid, row, col) && getGridCell(grid, row, col + 1)) {
        return true;
      }
    }
  }
  
  // Check vertical adjacency
  for (let col = 0; col < 5; col++) {
    for (let row = 0; row < 4; row++) {
      if (getGridCell(grid, row, col) && getGridCell(grid, row + 1, col)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Check if grid matches Big Dipper pattern
 */
function isBigDipper(grid: number): boolean {
  for (const pattern of BIG_DIPPER_PATTERNS) {
    if (matchesPattern(grid, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if grid matches Orion pattern
 */
function isOrion(grid: number): boolean {
  for (const pattern of ORION_PATTERNS) {
    if (matchesPattern(grid, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if grid matches Cassiopeia pattern
 */
function isCassiopeia(grid: number): boolean {
  for (const pattern of CASSIOPEIA_PATTERNS) {
    if (matchesPattern(grid, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if grid matches Crux pattern
 */
function isCrux(grid: number): boolean {
  for (const pattern of CRUX_PATTERNS) {
    // Crux needs at least 5 stars in cross formation
    if (matchesPattern(grid, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Find the best matching pattern for a grid
 * Returns pattern name and multiplier
 * 
 * Pattern Priority (highest to lowest):
 * 1. Supernova (all 25 stars)
 * 2. Galaxy (20+ stars)
 * 3. Big Dipper (7-star ladle)
 * 4. Orion/Cassiopeia (5+ stars)
 * 5. Crux (cross pattern)
 * 6. Line (5 in a row)
 * 7. Binary (2+ adjacent)
 * 8. Void (no pattern)
 */
export function findBestPattern(grid: number): {
  pattern: ConstellationPattern;
  multiplier: number;
  starCount: number;
} {
  const starCount = countStars(grid);
  
  // Supernova: All 25 stars (JACKPOT)
  if (starCount === 25) {
    return {
      pattern: ConstellationPattern.SUPERNOVA,
      multiplier: PATTERN_MULTIPLIERS[ConstellationPattern.SUPERNOVA],
      starCount,
    };
  }
  
  // Galaxy: 20+ stars (10x)
  if (starCount >= 20) {
    return {
      pattern: ConstellationPattern.GALAXY,
      multiplier: PATTERN_MULTIPLIERS[ConstellationPattern.GALAXY],
      starCount,
    };
  }
  
  // Big Dipper: Specific 7-star ladle pattern (7x)
  if (isBigDipper(grid)) {
    return {
      pattern: ConstellationPattern.BIG_DIPPER,
      multiplier: PATTERN_MULTIPLIERS[ConstellationPattern.BIG_DIPPER],
      starCount,
    };
  }
  
  // Orion: Diagonal with belt pattern (5x)
  if (isOrion(grid)) {
    return {
      pattern: ConstellationPattern.ORION,
      multiplier: PATTERN_MULTIPLIERS[ConstellationPattern.ORION],
      starCount,
    };
  }
  
  // Cassiopeia: W-shaped pattern (5x)
  if (isCassiopeia(grid)) {
    return {
      pattern: ConstellationPattern.CASSIOPEIA,
      multiplier: PATTERN_MULTIPLIERS[ConstellationPattern.CASSIOPEIA],
      starCount,
    };
  }
  
  // Crux: Cross/plus pattern (3x)
  if (isCrux(grid)) {
    return {
      pattern: ConstellationPattern.CRUX,
      multiplier: PATTERN_MULTIPLIERS[ConstellationPattern.CRUX],
      starCount,
    };
  }
  
  // Line: 5 stars in a row/column/diagonal (2x)
  if (hasLine(grid)) {
    return {
      pattern: ConstellationPattern.LINE,
      multiplier: PATTERN_MULTIPLIERS[ConstellationPattern.LINE],
      starCount,
    };
  }
  
  // Binary: 2+ adjacent stars (1.3x)
  if (hasAdjacent(grid)) {
    return {
      pattern: ConstellationPattern.BINARY,
      multiplier: PATTERN_MULTIPLIERS[ConstellationPattern.BINARY],
      starCount,
    };
  }
  
  // Void: No pattern matched (0x)
  return {
    pattern: ConstellationPattern.VOID,
    multiplier: PATTERN_MULTIPLIERS[ConstellationPattern.VOID],
    starCount,
  };
}

/**
 * Get pattern description for display
 */
export function getPatternDescription(pattern: ConstellationPattern): string {
  const descriptions: Record<ConstellationPattern, string> = {
    [ConstellationPattern.SUPERNOVA]: 'All 25 cells filled - JACKPOT!',
    [ConstellationPattern.GALAXY]: '20+ stars filled - Massive win!',
    [ConstellationPattern.BIG_DIPPER]: '7-star ladle pattern - Classic constellation!',
    [ConstellationPattern.ORION]: 'Diagonal with belt - The Hunter!',
    [ConstellationPattern.CASSIOPEIA]: 'W-shaped pattern - The Queen!',
    [ConstellationPattern.CRUX]: 'Cross pattern - Southern Cross!',
    [ConstellationPattern.LINE]: '5 stars in a row/column/diagonal',
    [ConstellationPattern.BINARY]: '2+ adjacent stars - Small cluster',
    [ConstellationPattern.VOID]: 'No pattern detected - Try again',
  };
  
  return descriptions[pattern];
}

/**
 * Get pattern emoji for display
 */
export function getPatternEmoji(pattern: ConstellationPattern): string {
  const emojis: Record<ConstellationPattern, string> = {
    [ConstellationPattern.SUPERNOVA]: '💥',
    [ConstellationPattern.GALAXY]: '🌌',
    [ConstellationPattern.BIG_DIPPER]: '✨',
    [ConstellationPattern.ORION]: '🏹',
    [ConstellationPattern.CASSIOPEIA]: '👑',
    [ConstellationPattern.CRUX]: '✝️',
    [ConstellationPattern.LINE]: '➖',
    [ConstellationPattern.BINARY]: '⭐',
    [ConstellationPattern.VOID]: '🌑',
  };
  
  return emojis[pattern];
}
