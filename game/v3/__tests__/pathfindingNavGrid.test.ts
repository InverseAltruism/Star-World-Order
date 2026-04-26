import { describe, it, expect } from 'vitest';

// Mirror of WorldSceneV3's nav-grid construction so we can test it without
// booting Phaser. Keep these constants in sync with WorldSceneV3.ts.
const NAV_CELL = 16;

interface Rect { x: number; y: number; w: number; h: number }

function buildNavGrid(worldW: number, worldH: number, rects: Rect[]): number[][] {
  const gridW = Math.ceil(worldW / NAV_CELL);
  const gridH = Math.ceil(worldH / NAV_CELL);
  const grid = Array.from({ length: gridH }, () =>
    Array.from({ length: gridW }, () => 0),
  );
  for (const rect of rects) {
    const x0 = Math.max(0, Math.floor(rect.x / NAV_CELL));
    const y0 = Math.max(0, Math.floor(rect.y / NAV_CELL));
    const x1 = Math.min(gridW - 1, Math.floor((rect.x + rect.w - 1) / NAV_CELL));
    const y1 = Math.min(gridH - 1, Math.floor((rect.y + rect.h - 1) / NAV_CELL));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) grid[y][x] = 1;
    }
  }
  return grid;
}

describe('V3 nav grid construction', () => {
  it('produces a grid sized to worldW/worldH at NAV_CELL granularity', () => {
    const grid = buildNavGrid(1920, 1280, []);
    expect(grid.length).toBe(80);
    expect(grid[0].length).toBe(120);
    for (const row of grid) for (const cell of row) expect(cell).toBe(0);
  });

  it('blocks every cell touched by a collision rect', () => {
    const grid = buildNavGrid(128, 128, [{ x: 32, y: 32, w: 32, h: 32 }]);
    expect(grid[2][2]).toBe(1);
    expect(grid[2][3]).toBe(1);
    expect(grid[3][2]).toBe(1);
    expect(grid[3][3]).toBe(1);
    expect(grid[1][1]).toBe(0);
    expect(grid[4][4]).toBe(0);
  });

  it('clamps rects that overflow the world bounds', () => {
    const grid = buildNavGrid(64, 64, [{ x: -16, y: -16, w: 32, h: 32 }]);
    expect(grid[0][0]).toBe(1);
    expect(grid.length).toBe(4);
    expect(grid[0].length).toBe(4);
  });

  it('half-tile resolution exposes corner walkability inside a 32x32 tile', () => {
    // A single 16×16 collision in the top-left of a 32×32 tile should leave
    // the other three half-tiles walkable. This is V2's pathing-detail win
    // that V3 inherits.
    const grid = buildNavGrid(32, 32, [{ x: 0, y: 0, w: 16, h: 16 }]);
    expect(grid[0][0]).toBe(1);
    expect(grid[0][1]).toBe(0);
    expect(grid[1][0]).toBe(0);
    expect(grid[1][1]).toBe(0);
  });
});
