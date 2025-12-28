/**
 * Star Forge - Main Library Exports
 * 
 * Provably fair 5x5 constellation grid game
 */

// RNG exports
export {
  generateServerSeed,
  hashServerSeed,
  generateGrid,
  verifyResult,
  createCommitment,
  gridToArray,
  arrayToGrid,
  getGridCell,
  countStars,
  type GameCommitment,
  type GameResult,
} from './rng';

// Pattern exports
export {
  ConstellationPattern,
  PATTERN_MULTIPLIERS,
  findBestPattern,
  hasLine,
  hasAdjacent,
  getPatternDescription,
  getPatternEmoji,
} from './patterns';

// Economics exports
export {
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
  type TierConfig,
  type FeeSplit,
} from './economics';
