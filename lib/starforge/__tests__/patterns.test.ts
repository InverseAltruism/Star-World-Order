/**
 * Star Forge Pattern Detection Tests
 * 
 * Critical tests for constellation pattern matching logic.
 * These tests ensure payouts are calculated correctly based on grid patterns.
 * 
 * A bug here = players get wrong payouts = financial loss or exploit.
 */

import { describe, it, expect } from 'vitest';
import {
  ConstellationPattern,
  PATTERN_MULTIPLIERS,
  findBestPattern,
  hasLine,
  hasAdjacent,
} from '../patterns';
import { countStars, gridToArray, arrayToGrid } from '../rng';

// Helper to create grid from visual representation
// '*' = star, '.' = empty
function createGrid(visual: string[]): number {
  const array: boolean[][] = visual.map(row => 
    row.split('').map(c => c === '*')
  );
  return arrayToGrid(array);
}

describe('Pattern Multipliers', () => {
  it('should have correct multipliers defined', () => {
    expect(PATTERN_MULTIPLIERS[ConstellationPattern.SUPERNOVA]).toBe(-1); // Jackpot
    expect(PATTERN_MULTIPLIERS[ConstellationPattern.GALAXY]).toBe(10);
    expect(PATTERN_MULTIPLIERS[ConstellationPattern.BIG_DIPPER]).toBe(7);
    expect(PATTERN_MULTIPLIERS[ConstellationPattern.ORION]).toBe(5);
    expect(PATTERN_MULTIPLIERS[ConstellationPattern.CASSIOPEIA]).toBe(5);
    expect(PATTERN_MULTIPLIERS[ConstellationPattern.CRUX]).toBe(3);
    expect(PATTERN_MULTIPLIERS[ConstellationPattern.LINE]).toBe(2);
    expect(PATTERN_MULTIPLIERS[ConstellationPattern.BINARY]).toBe(1.3);
    expect(PATTERN_MULTIPLIERS[ConstellationPattern.VOID]).toBe(0);
  });
});

describe('Supernova Detection (Jackpot)', () => {
  it('should detect Supernova when all 25 cells are filled', () => {
    const grid = createGrid([
      '*****',
      '*****',
      '*****',
      '*****',
      '*****',
    ]);
    
    const result = findBestPattern(grid);
    expect(result.pattern).toBe(ConstellationPattern.SUPERNOVA);
    expect(result.multiplier).toBe(-1); // Jackpot indicator
    expect(result.starCount).toBe(25);
  });

  it('should NOT detect Supernova with 24 stars', () => {
    const grid = createGrid([
      '*****',
      '*****',
      '*****',
      '*****',
      '****.',
    ]);
    
    const result = findBestPattern(grid);
    expect(result.pattern).not.toBe(ConstellationPattern.SUPERNOVA);
  });
});

describe('Galaxy Detection (20+ stars)', () => {
  it('should detect Galaxy with exactly 20 stars', () => {
    const grid = createGrid([
      '*****',
      '*****',
      '*****',
      '*****',
      '.....',
    ]);
    
    const result = findBestPattern(grid);
    expect(result.pattern).toBe(ConstellationPattern.GALAXY);
    expect(result.multiplier).toBe(10);
    expect(result.starCount).toBe(20);
  });

  it('should detect Galaxy with 24 stars', () => {
    const grid = createGrid([
      '*****',
      '*****',
      '*****',
      '*****',
      '****.',
    ]);
    
    const result = findBestPattern(grid);
    expect(result.pattern).toBe(ConstellationPattern.GALAXY);
    expect(result.multiplier).toBe(10);
    expect(result.starCount).toBe(24);
  });

  it('should NOT detect Galaxy with 19 stars', () => {
    const grid = createGrid([
      '*****',
      '*****',
      '*****',
      '****.',
      '.....',
    ]);
    
    const result = findBestPattern(grid);
    expect(result.pattern).not.toBe(ConstellationPattern.GALAXY);
    expect(result.starCount).toBe(19);
  });
});

describe('Line Detection (5 in a row/column/diagonal)', () => {
  it('should detect horizontal line (row 0)', () => {
    const grid = createGrid([
      '*****',
      '.....',
      '.....',
      '.....',
      '.....',
    ]);
    
    expect(hasLine(grid)).toBe(true);
    const result = findBestPattern(grid);
    expect(result.pattern).toBe(ConstellationPattern.LINE);
    expect(result.multiplier).toBe(2);
  });

  it('should detect horizontal line (row 4)', () => {
    const grid = createGrid([
      '.....',
      '.....',
      '.....',
      '.....',
      '*****',
    ]);
    
    expect(hasLine(grid)).toBe(true);
    const result = findBestPattern(grid);
    expect(result.pattern).toBe(ConstellationPattern.LINE);
  });

  it('should detect vertical line (column 0)', () => {
    const grid = createGrid([
      '*....',
      '*....',
      '*....',
      '*....',
      '*....',
    ]);
    
    expect(hasLine(grid)).toBe(true);
    const result = findBestPattern(grid);
    expect(result.pattern).toBe(ConstellationPattern.LINE);
  });

  it('should detect vertical line (column 4)', () => {
    const grid = createGrid([
      '....*',
      '....*',
      '....*',
      '....*',
      '....*',
    ]);
    
    expect(hasLine(grid)).toBe(true);
    const result = findBestPattern(grid);
    expect(result.pattern).toBe(ConstellationPattern.LINE);
  });

  it('should detect main diagonal (top-left to bottom-right)', () => {
    const grid = createGrid([
      '*....',
      '.*...',
      '..*..', 
      '...*.',
      '....*',
    ]);
    
    expect(hasLine(grid)).toBe(true);
    const result = findBestPattern(grid);
    expect(result.pattern).toBe(ConstellationPattern.LINE);
  });

  it('should detect anti-diagonal (top-right to bottom-left)', () => {
    const grid = createGrid([
      '....*',
      '...*.',
      '..*..', 
      '.*...',
      '*....',
    ]);
    
    expect(hasLine(grid)).toBe(true);
    const result = findBestPattern(grid);
    expect(result.pattern).toBe(ConstellationPattern.LINE);
  });

  it('should NOT detect line with only 4 stars', () => {
    const grid = createGrid([
      '****.',
      '.....',
      '.....',
      '.....',
      '.....',
    ]);
    
    expect(hasLine(grid)).toBe(false);
  });
});

describe('Binary Detection (2+ adjacent stars)', () => {
  it('should detect horizontal adjacent pair', () => {
    const grid = createGrid([
      '**...',
      '.....',
      '.....',
      '.....',
      '.....',
    ]);
    
    expect(hasAdjacent(grid)).toBe(true);
    const result = findBestPattern(grid);
    expect(result.pattern).toBe(ConstellationPattern.BINARY);
    expect(result.multiplier).toBe(1.3);
  });

  it('should detect vertical adjacent pair', () => {
    const grid = createGrid([
      '*....',
      '*....',
      '.....',
      '.....',
      '.....',
    ]);
    
    expect(hasAdjacent(grid)).toBe(true);
    const result = findBestPattern(grid);
    expect(result.pattern).toBe(ConstellationPattern.BINARY);
  });

  it('should NOT detect diagonal-only adjacent (no horizontal/vertical)', () => {
    const grid = createGrid([
      '*....',
      '.*...',
      '.....',
      '.....',
      '.....',
    ]);
    
    // Diagonal adjacency is NOT counted in hasAdjacent
    expect(hasAdjacent(grid)).toBe(false);
  });

  it('should detect adjacent in middle of grid', () => {
    const grid = createGrid([
      '.....',
      '.....',
      '..**.',
      '.....',
      '.....',
    ]);
    
    expect(hasAdjacent(grid)).toBe(true);
  });
});

describe('Void Detection (no pattern)', () => {
  it('should detect Void with single isolated star', () => {
    const grid = createGrid([
      '*....',
      '.....',
      '.....',
      '.....',
      '.....',
    ]);
    
    const result = findBestPattern(grid);
    expect(result.pattern).toBe(ConstellationPattern.VOID);
    expect(result.multiplier).toBe(0);
    expect(result.starCount).toBe(1);
  });

  it('should detect Void with no stars', () => {
    const grid = createGrid([
      '.....',
      '.....',
      '.....',
      '.....',
      '.....',
    ]);
    
    const result = findBestPattern(grid);
    expect(result.pattern).toBe(ConstellationPattern.VOID);
    expect(result.multiplier).toBe(0);
    expect(result.starCount).toBe(0);
  });

  it('should detect Void with scattered non-adjacent stars', () => {
    const grid = createGrid([
      '*....',
      '..*..',
      '.....',
      '....*',
      '.....',
    ]);
    
    const result = findBestPattern(grid);
    expect(result.pattern).toBe(ConstellationPattern.VOID);
  });
});

describe('Cassiopeia Detection (W-shape)', () => {
  it('should detect W-shape pattern', () => {
    const grid = createGrid([
      '*...*',
      '.*.*.',
      '..*..', 
      '.....',
      '.....',
    ]);
    
    const result = findBestPattern(grid);
    expect(result.pattern).toBe(ConstellationPattern.CASSIOPEIA);
    expect(result.multiplier).toBe(5);
  });
});

describe('Crux Detection (Cross pattern)', () => {
  it('should detect small cross pattern', () => {
    const grid = createGrid([
      '.....',
      '..*..', 
      '.***.', 
      '..*..', 
      '.....',
    ]);
    
    const result = findBestPattern(grid);
    expect(result.pattern).toBe(ConstellationPattern.CRUX);
    expect(result.multiplier).toBe(3);
  });
});

describe('Pattern Priority', () => {
  it('should prioritize Galaxy over Line when both match', () => {
    // 20+ stars will always include lines
    const grid = createGrid([
      '*****',
      '*****',
      '*****',
      '*****',
      '.....',
    ]);
    
    const result = findBestPattern(grid);
    // Galaxy (10x) beats Line (2x)
    expect(result.pattern).toBe(ConstellationPattern.GALAXY);
  });

  it('should prioritize higher multiplier patterns', () => {
    // A grid with multiple pattern matches should return highest
    const grid = createGrid([
      '*****',  // Line
      '**...',  // Also has Binary
      '.....',
      '.....',
      '.....',
    ]);
    
    const result = findBestPattern(grid);
    // Line (2x) beats Binary (1.3x)
    expect(result.pattern).toBe(ConstellationPattern.LINE);
  });
});

describe('Star Count Accuracy', () => {
  it('should count stars correctly for various grids', () => {
    expect(countStars(createGrid([
      '*....',
      '.....',
      '.....',
      '.....',
      '.....',
    ]))).toBe(1);

    expect(countStars(createGrid([
      '*****',
      '.....',
      '.....',
      '.....',
      '.....',
    ]))).toBe(5);

    expect(countStars(createGrid([
      '*****',
      '*****',
      '*****',
      '*****',
      '*****',
    ]))).toBe(25);

    expect(countStars(createGrid([
      '*.*.*',
      '.*.*.',
      '*.*.*',
      '.*.*.',
      '*.*.*',
    ]))).toBe(13);
  });
});

describe('Grid Conversion', () => {
  it('should convert between array and number representation correctly', () => {
    const visual = [
      '*....',
      '.*...',
      '..*..', 
      '...*.',
      '....*',
    ];
    
    const grid = createGrid(visual);
    const array = gridToArray(grid);
    const backToGrid = arrayToGrid(array);
    
    expect(backToGrid).toBe(grid);
  });

  it('should handle full grid conversion', () => {
    const visual = [
      '*****',
      '*****',
      '*****',
      '*****',
      '*****',
    ];
    
    const grid = createGrid(visual);
    expect(grid).toBe(0x1FFFFFF); // All 25 bits set
    
    const array = gridToArray(grid);
    expect(array.flat().every(Boolean)).toBe(true);
  });

  it('should handle empty grid conversion', () => {
    const visual = [
      '.....',
      '.....',
      '.....',
      '.....',
      '.....',
    ];
    
    const grid = createGrid(visual);
    expect(grid).toBe(0);
    
    const array = gridToArray(grid);
    expect(array.flat().every(v => !v)).toBe(true);
  });
});
