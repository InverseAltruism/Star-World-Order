// Sanctuary V3 — overworld layout (programmatic placeholder).
// Real Tiled JSON map comes in phase 6. For now we declare logical positions
// for buildings + NPCs + spawn so WorldSceneV3 can render a walkable test.

export const TILE = 32;                  // FM tileset native tile size
export const WORLD_TILES_W = 40;
export const WORLD_TILES_H = 28;
export const WORLD_W = WORLD_TILES_W * TILE;     // 1280
export const WORLD_H = WORLD_TILES_H * TILE;     // 896
export const NAV_CELL = TILE;            // 32px navigation grid

export const SPAWN = { x: WORLD_W / 2, y: WORLD_H / 2 };

export type BuildingId =
  | 'hot-springs'
  | 'observatory'
  | 'training-grounds'
  | 'star-garden'
  | 'cosmic-library'
  | 'nebula-kitchen'
  | 'dream-hollow'
  | 'aura-forge';

export interface Building {
  id: BuildingId;
  /** centre x, y of the 128×128 sprite in world pixels */
  x: number;
  y: number;
  /** door tile (collision-walkable) anchor — south-bottom-centre by default */
  doorOffsetX?: number;
  doorOffsetY?: number;
}

export const BUILDINGS: Building[] = [
  { id: 'observatory',       x: 6 * TILE,  y: 4 * TILE  },
  { id: 'cosmic-library',    x: 14 * TILE, y: 4 * TILE  },
  { id: 'star-garden',       x: 22 * TILE, y: 4 * TILE  },
  { id: 'hot-springs',       x: 30 * TILE, y: 4 * TILE  },

  { id: 'training-grounds',  x: 6 * TILE,  y: 20 * TILE },
  { id: 'dream-hollow',      x: 14 * TILE, y: 20 * TILE },
  { id: 'nebula-kitchen',    x: 22 * TILE, y: 20 * TILE },
  { id: 'aura-forge',        x: 30 * TILE, y: 20 * TILE },
];

/**
 * Collision rects in world pixels. For V3 phase-5 we generate them from
 * the building sprites' visible bbox. Each building blocks a ~96×80 area
 * centred on its tile anchor (the building art is 128×128 but the visible
 * footprint is smaller).
 */
export interface CollisionRect { x: number; y: number; w: number; h: number; }

export function buildingCollisions(): CollisionRect[] {
  const rects: CollisionRect[] = [];
  for (const b of BUILDINGS) {
    // Building sprite is 128×128 drawn centred on (x, y); body footprint
    // is the lower 80px (foundation), upper part is decorative roof.
    const w = 96, h = 80;
    rects.push({ x: b.x - w / 2, y: b.y - 24, w, h });
  }
  return rects;
}
