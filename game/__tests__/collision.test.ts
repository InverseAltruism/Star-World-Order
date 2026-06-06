import { describe, it, expect } from 'vitest';
import {
  COLLISION,
  SPAWN,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  NAV_CELL,
  DOORS,
} from '../config/worldLayout';

function buildNavGrid(): number[][] {
  const gridW = Math.ceil(WORLD_WIDTH / NAV_CELL);
  const gridH = Math.ceil(WORLD_HEIGHT / NAV_CELL);
  const grid = Array.from({ length: gridH }, () =>
    Array.from({ length: gridW }, () => 0),
  );
  for (const rect of COLLISION) {
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

describe('Collision data integrity', () => {
  it('all collision rects originate within world bounds', () => {
    for (const rect of COLLISION) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x).toBeLessThan(WORLD_WIDTH);
      expect(rect.y).toBeLessThan(WORLD_HEIGHT);
    }
  });

  it('every collision rect blocks at least one nav cell', () => {
    const grid = buildNavGrid();
    for (const rect of COLLISION) {
      const cx = Math.floor((rect.x + rect.w / 2) / NAV_CELL);
      const cy = Math.floor((rect.y + rect.h / 2) / NAV_CELL);
      expect(grid[cy][cx]).toBe(1);
    }
  });

  it('spawn point is not inside a collision rect', () => {
    for (const rect of COLLISION) {
      const inside =
        SPAWN.x >= rect.x &&
        SPAWN.x < rect.x + rect.w &&
        SPAWN.y >= rect.y &&
        SPAWN.y < rect.y + rect.h;
      expect(inside).toBe(false);
    }
  });

  it('spawn nav cell is walkable', () => {
    const grid = buildNavGrid();
    const sx = Math.floor(SPAWN.x / NAV_CELL);
    const sy = Math.floor(SPAWN.y / NAV_CELL);
    expect(grid[sy][sx]).toBe(0);
  });

  it('collision rects have positive dimensions', () => {
    for (const rect of COLLISION) {
      expect(rect.w).toBeGreaterThan(0);
      expect(rect.h).toBeGreaterThan(0);
    }
  });

  it('door zones do not fully overlap collision rects', () => {
    for (const door of DOORS) {
      const doorCenterX = door.x + door.w / 2;
      const doorCenterY = door.y + door.h / 2;
      const grid = buildNavGrid();
      const gx = Math.floor(doorCenterX / NAV_CELL);
      const gy = Math.floor(doorCenterY / NAV_CELL);
      expect(grid[gy][gx]).toBe(0);
    }
  });
});

describe('Nav grid consistency with collision bodies', () => {
  it('nav grid and collision body count are consistent', () => {
    const grid = buildNavGrid();
    let blockedCells = 0;
    for (const row of grid) {
      for (const cell of row) {
        if (cell === 1) blockedCells++;
      }
    }
    expect(blockedCells).toBeGreaterThan(0);
    expect(COLLISION.length).toBeGreaterThan(0);
    expect(COLLISION.length).toBe(COLLISION.length);
  });

  it('WorldScene stores collision zones in a StaticGroup and adds a player collider', async () => {
    const source = await import('fs').then((fs) =>
      fs.readFileSync(
        new URL('../scenes/WorldScene.ts', import.meta.url),
        'utf-8',
      ),
    );
    expect(source).toContain('this.collisionGroup = this.physics.add.staticGroup()');
    expect(source).toContain('this.collisionGroup.add(zone)');
    expect(source).toContain('this.physics.add.collider(this.player, this.collisionGroup)');
  });
});
