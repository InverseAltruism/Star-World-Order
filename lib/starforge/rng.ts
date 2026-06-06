/**
 * Star Forge - Provably Fair RNG Implementation
 * 
 * Commit-Reveal Random Number Generation for 5x5 Grid Game
 * 
 * Security Model:
 * 1. Server generates secret seed and commits hash before client action
 * 2. Client provides their own seed (can use block hash or timestamp)
 * 3. Seeds are combined with nonce to generate deterministic grid
 * 4. Anyone can verify results using server seed reveal
 * 
 * Grid Representation:
 * - 25-bit number representing 5x5 grid
 * - Each bit = 1 (star ⭐) or 0 (empty ·)
 * - Bit index maps to grid position: row * 5 + col
 * - Example: bit 0 = (0,0), bit 12 = (2,2), bit 24 = (4,4)
 */

import { createHash } from 'crypto';

/**
 * Game commitment stored before client seed is known
 */
export interface GameCommitment {
  serverSeedHash: string;  // SHA256 hash of server seed
  nonce: number;            // Game sequence number for this session
  timestamp: number;        // Unix timestamp of commitment
}

/**
 * Complete game result with verification data
 */
export interface GameResult {
  grid: number;              // 25-bit number representing star positions
  serverSeed: string;        // Server's random seed (revealed after game)
  clientSeed: string;        // Client's seed (block hash, timestamp, etc.)
  nonce: number;             // Game sequence number
  pattern: string;           // Matched constellation pattern name
  multiplier: number;        // Payout multiplier
  timestamp: number;         // Game completion timestamp
}

/**
 * Generate a cryptographically secure random server seed
 * 64 hex characters (32 bytes of entropy)
 */
export function generateServerSeed(): string {
  // Use crypto.randomBytes for secure random generation
  const bytes = new Uint8Array(32);
  
  // In Node.js environment — deliberate runtime require: keeps this module
  // importable in the browser bundle, where a top-level `import 'crypto'` breaks.
  if (typeof require !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }
  
  // In browser environment (fallback, but should use server-side)
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  throw new Error('No secure random number generator available');
}

/**
 * Hash server seed for commitment
 * Uses SHA256 to create commitment hash
 */
export function hashServerSeed(seed: string): string {
  return createHash('sha256')
    .update(seed)
    .digest('hex');
}

/**
 * Generate 5x5 grid from seeds using deterministic hash chain
 * 
 * Algorithm:
 * 1. Combine serverSeed + clientSeed + nonce
 * 2. Hash to get 256 bits of entropy
 * 3. Take first 25 bits for grid positions
 * 4. Each bit determines if cell has a star (1) or is empty (0)
 * 
 * @param serverSeed - Server's secret seed (revealed after game)
 * @param clientSeed - Client's seed (public)
 * @param nonce - Game sequence number
 * @returns 25-bit number where each bit = 1 (star) or 0 (empty)
 */
export function generateGrid(
  serverSeed: string,
  clientSeed: string,
  nonce: number
): number {
  // Combine all inputs
  const combined = `${serverSeed}:${clientSeed}:${nonce}`;
  
  // Hash to get deterministic random bits
  const hash = createHash('sha256')
    .update(combined)
    .digest();
  
  // Take first 25 bits from hash
  // hash[0] = bits 0-7, hash[1] = bits 8-15, hash[2] = bits 16-23, hash[3] bit 0 = bit 24
  let grid = 0;
  
  // First 3 bytes give us 24 bits
  for (let i = 0; i < 3; i++) {
    grid |= (hash[i] << (i * 8));
  }
  
  // Last bit from 4th byte
  grid |= ((hash[3] & 0x01) << 24);
  
  // Mask to ensure only 25 bits are used
  grid &= 0x1FFFFFF;
  
  return grid;
}

/**
 * Verify that a game result is valid and matches the commitment
 * 
 * Checks:
 * 1. Server seed hash matches commitment
 * 2. Grid regenerates correctly from seeds
 * 3. Timestamp is reasonable
 */
export function verifyResult(
  result: GameResult,
  commitment: GameCommitment
): boolean {
  // Verify server seed hash matches commitment
  const computedHash = hashServerSeed(result.serverSeed);
  if (computedHash !== commitment.serverSeedHash) {
    return false;
  }
  
  // Verify nonce matches
  if (result.nonce !== commitment.nonce) {
    return false;
  }
  
  // Verify grid regenerates correctly
  const regeneratedGrid = generateGrid(
    result.serverSeed,
    result.clientSeed,
    result.nonce
  );
  
  if (regeneratedGrid !== result.grid) {
    return false;
  }
  
  // Verify timestamp is reasonable (within 1 hour of commitment)
  const timeDiff = Math.abs(result.timestamp - commitment.timestamp);
  if (timeDiff > 3600000) { // 1 hour in ms
    return false;
  }
  
  return true;
}

/**
 * Create a commitment for a new game
 * Server generates seed and commits hash before client plays
 */
export function createCommitment(nonce: number): {
  commitment: GameCommitment;
  serverSeed: string;
} {
  const serverSeed = generateServerSeed();
  const serverSeedHash = hashServerSeed(serverSeed);
  
  const commitment: GameCommitment = {
    serverSeedHash,
    nonce,
    timestamp: Date.now(),
  };
  
  return { commitment, serverSeed };
}

/**
 * Convert grid number to 5x5 boolean array for display
 * 
 * @param grid - 25-bit number representing grid
 * @returns 5x5 array where true = star, false = empty
 */
export function gridToArray(grid: number): boolean[][] {
  const array: boolean[][] = [];
  
  for (let row = 0; row < 5; row++) {
    array[row] = [];
    for (let col = 0; col < 5; col++) {
      const bitIndex = row * 5 + col;
      array[row][col] = ((grid >> bitIndex) & 1) === 1;
    }
  }
  
  return array;
}

/**
 * Convert 5x5 boolean array to grid number
 */
export function arrayToGrid(array: boolean[][]): number {
  let grid = 0;
  
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (array[row][col]) {
        const bitIndex = row * 5 + col;
        grid |= (1 << bitIndex);
      }
    }
  }
  
  return grid;
}

/**
 * Get grid cell state at specific position
 */
export function getGridCell(grid: number, row: number, col: number): boolean {
  const bitIndex = row * 5 + col;
  return ((grid >> bitIndex) & 1) === 1;
}

/**
 * Count total number of stars in grid
 */
export function countStars(grid: number): number {
  let count = 0;
  for (let i = 0; i < 25; i++) {
    if ((grid >> i) & 1) {
      count++;
    }
  }
  return count;
}
