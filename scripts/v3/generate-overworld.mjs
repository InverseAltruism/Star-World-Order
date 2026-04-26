#!/usr/bin/env node
// V3 overworld generator — Tiled-format JSON.
// Output: public/sanctuary-v3/maps/overworld.json
//
// Layout: 40×24 tile village — Tuxemon-Town pattern.
// - Tree perimeter (decor objects, not tile gids) wraps the world edge
// - North row of 4 buildings on grass meadows (row 5)
// - Wide central plaza meadow at the world centre with spawn fox + props
// - South row of 4 buildings on grass meadows (row 18)
// - Dirt fills everything else; dirt IS the walkway
//
// Buildings render at 1.5× in WorldSceneV3, so the visible footprint is
// 192×192 (6×6 tiles). 7×7 meadows around each building leave one tile of
// grass margin on every side.
//
// Tile gids (verified by atlas inspection — see internal-docs/v3 atlas dumps):
//   cols 0-4 × rows 0-4   primary 5×5 grass-on-dirt patch (opaque)
//   cols 5-9 × rows 0-4   alt-color grass patch
//   cols 10-15 × rows 0-3 dirt body (~24 variants)
// All other tiles in the FM tileset (concave grass corners, large oval
// meadows, cliff/elevation pieces, dense-grass overlay) are reserved for
// follow-up improvements; this generator stays small and readable.

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'public/sanctuary-v3/maps/overworld.json');

const W = 40, H = 24;
const TILE = 32;

const FM = { cols: 64, firstgid: 1 };
const gid = (c, r) => FM.firstgid + r * FM.cols + c;

// ---- Tile gid sets ----------------------------------------------------

const GRASS_INNER = [
  gid(1, 1), gid(2, 1), gid(3, 1),
  gid(1, 2), gid(2, 2), gid(3, 2),
  gid(1, 3), gid(2, 3), gid(3, 3),
];
const GRASS_INNER_ALT = [
  gid(6, 1), gid(7, 1), gid(8, 1),
  gid(6, 2), gid(7, 2), gid(8, 2),
  gid(6, 3), gid(7, 3), gid(8, 3),
];
const GRASS_INNER_MIX = [...GRASS_INNER, ...GRASS_INNER_ALT];

const GRASS_NW = gid(0, 0);
const GRASS_NE = gid(4, 0);
const GRASS_SW = gid(0, 4);
const GRASS_SE = gid(4, 4);
const GRASS_N  = [gid(1, 0), gid(2, 0), gid(3, 0)];
const GRASS_S  = [gid(1, 4), gid(2, 4), gid(3, 4)];
const GRASS_W  = [gid(0, 1), gid(0, 2), gid(0, 3)];
const GRASS_E  = [gid(4, 1), gid(4, 2), gid(4, 3)];

const DIRT = [
  gid(11, 0), gid(12, 0), gid(13, 0), gid(14, 0), gid(15, 0),
  gid(11, 1), gid(12, 1), gid(13, 1), gid(14, 1), gid(15, 1),
  gid(11, 2), gid(12, 2), gid(13, 2), gid(14, 2), gid(15, 2),
];

const pick = (arr, x, y, salt = 0) => {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return arr[Math.abs(h) % arr.length];
};

// ---- Helpers ----------------------------------------------------------

const ground = new Array(W * H);
const idx = (x, y) => y * W + x;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const setG = (x, y, t) => { if (inBounds(x, y)) ground[idx(x, y)] = t; };

// ---- Step 1: dirt background -----------------------------------------

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    setG(x, y, pick(DIRT, x, y, 7));
  }
}

// ---- Step 2: paint grass meadow at (x0,y0) sized w×h ------------------

function paintMeadow(x0, y0, w, h) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (!inBounds(x, y)) continue;
      const top = dy === 0, bot = dy === h - 1;
      const left = dx === 0, right = dx === w - 1;
      let g;
      if (top && left)       g = GRASS_NW;
      else if (top && right) g = GRASS_NE;
      else if (bot && left)  g = GRASS_SW;
      else if (bot && right) g = GRASS_SE;
      else if (top)   g = pick(GRASS_N, x, y, 11);
      else if (bot)   g = pick(GRASS_S, x, y, 13);
      else if (left)  g = pick(GRASS_W, x, y, 17);
      else if (right) g = pick(GRASS_E, x, y, 19);
      else            g = pick(GRASS_INNER_MIX, x, y, 23);
      setG(x, y, g);
    }
  }
}

// ---- Step 3: world layout --------------------------------------------

const PLAZA = { col: 20, row: 12, w: 9, h: 7 };

const BUILDINGS = [
  { id: 'observatory',       row: 5,  col: 5  },
  { id: 'star-garden',       row: 5,  col: 14 },
  { id: 'cosmic-library',    row: 5,  col: 25 },
  { id: 'hot-springs',       row: 5,  col: 34 },
  { id: 'training-grounds',  row: 18, col: 5  },
  { id: 'dream-hollow',      row: 18, col: 14 },
  { id: 'nebula-kitchen',    row: 18, col: 25 },
  { id: 'aura-forge',        row: 18, col: 34 },
];

// Plaza meadow first, then building meadows on top — meadows are allowed
// to overlap the plaza on the cardinal sides for a continuous green hub.
paintMeadow(PLAZA.col - Math.floor(PLAZA.w / 2), PLAZA.row - Math.floor(PLAZA.h / 2),
            PLAZA.w, PLAZA.h);
for (const b of BUILDINGS) {
  paintMeadow(b.col - 3, b.row - 3, 7, 7);
}

// ---- Object layers ----------------------------------------------------

let nextObjId = 1;
const obj = (props) => ({ id: nextObjId++, rotation: 0, visible: true, ...props });

const buildingsLayer = BUILDINGS.map(b => obj({
  name: b.id, type: 'building',
  x: b.col * TILE - 64,
  y: b.row * TILE - 64,
  width: 128, height: 128,
}));

// Doors at the south face of each building (the structure scales 1.5× at
// render time so the visible bottom is at b.row*TILE + 96; door anchored
// just outside that).
const doorsLayer = BUILDINGS.map(b => obj({
  name: b.id, type: 'door',
  x: b.col * TILE - 24,
  y: b.row * TILE + 56,
  width: 48, height: 28,
}));

const NPC_BY_ZONE = {
  observatory: 'observatory-owl',
  'cosmic-library': 'library-moth',
  'star-garden': 'garden-ent',
  'hot-springs': 'springs-duck',
  'training-grounds': 'training-wolf',
  'dream-hollow': 'dream-sheep',
  'nebula-kitchen': 'kitchen-bunny',
  'aura-forge': 'forge-golem',
};
const npcsLayer = [
  obj({
    name: 'spawn-fox', type: 'npc',
    x: PLAZA.col * TILE - 24,
    y: PLAZA.row * TILE - 24,
    width: 48, height: 48,
  }),
];
for (const b of BUILDINGS) {
  const sheet = NPC_BY_ZONE[b.id];
  if (!sheet) continue;
  // NPC stands on the SE corner of the building's meadow (one tile inside
  // the corner) so they're easy to walk up to from the south.
  const dxSign = b.col < PLAZA.col ? 1 : -1;  // toward plaza
  const dySign = b.row < PLAZA.row ? 1 : -1;
  npcsLayer.push(obj({
    name: sheet, type: 'npc',
    x: b.col * TILE + dxSign * 64 - 24,
    y: b.row * TILE + dySign * 32 - 24,
    width: 48, height: 48,
  }));
}

// Plaza signature props: signpost (W) + cosmic-well (E) framing the spawn fox.
const propsLayer = [
  obj({ name: 'signpost',    type: 'prop', x: (PLAZA.col - 3) * TILE,     y: (PLAZA.row + 1) * TILE,     width: 32, height: 64 }),
  obj({ name: 'cosmic-well', type: 'prop', x: (PLAZA.col + 2) * TILE,     y: (PLAZA.row + 1) * TILE,     width: 64, height: 64 }),
];
const ZONE_PROP = {
  observatory:       'telescope',
  'cosmic-library':  'star-chart',
  'star-garden':     'star-flower',
  'hot-springs':     'moon-lantern',
  'training-grounds':'training-dummy',
  'dream-hollow':    'dream-mushroom',
  'nebula-kitchen':  'crystal-stove',
  'aura-forge':      'crystal-anvil',
};
for (const b of BUILDINGS) {
  const propName = ZONE_PROP[b.id];
  if (!propName) continue;
  // Signature prop placed two tiles west of the building (on grass meadow).
  propsLayer.push(obj({
    name: propName, type: 'prop',
    x: (b.col - 3) * TILE,
    y: (b.row + 2) * TILE,
    width: 32, height: 32,
  }));
}

// Trees — placed deliberately along the world perimeter to create a
// "forest border" feel. Trees use bottom-anchor (origin 0.5, 1) so the
// world position == the trunk base. Multi-tile-tall canopies extend up.
//
// Each entry: [name, world-x in tiles, world-y in tiles, w_tiles, h_tiles].
// Where (x, y) is the BOTTOM-CENTRE of the tree in tile coords.
const TREES = [
  // Top edge — varied row: pines, willows, autumn maples
  ['tree-pine',    1, 2, 1, 4],
  ['tree-red',     4, 2, 3, 6],
  ['tree-yellow',  8, 2, 3, 4],
  ['tree-pine',   11, 2, 1, 4],
  ['tree-willow', 14, 2, 5, 6],
  ['tree-orange-sm', 19, 1, 2, 3],
  ['tree-blue',   22, 2, 4, 6],
  ['tree-pine',   28, 1, 1, 4],
  ['tree-red',    31, 2, 3, 6],
  ['tree-teal-sm', 35, 1, 2, 3],
  ['tree-pine',   38, 2, 1, 4],

  // Bottom edge — mirrored with different mix
  ['tree-yellow',  2, 23, 3, 4],
  ['tree-pine',    6, 22, 1, 4],
  ['tree-blue',    9, 23, 4, 6],
  ['tree-orange-sm', 14, 23, 2, 3],
  ['tree-pine',   17, 22, 1, 4],
  ['tree-red',    20, 23, 3, 6],
  ['tree-pine',   25, 22, 1, 4],
  ['tree-willow', 28, 23, 5, 6],
  ['tree-teal-sm', 34, 23, 2, 3],
  ['tree-pine',   37, 22, 1, 4],

  // Left edge
  ['tree-pine',    1, 7, 1, 4],
  ['tree-orange-sm', 1, 11, 2, 3],
  ['tree-pine',    1, 15, 1, 4],
  ['tree-teal-sm', 1, 19, 2, 3],
  // Right edge
  ['tree-pine',   38, 7, 1, 4],
  ['tree-orange-sm', 37, 11, 2, 3],
  ['tree-pine',   38, 15, 1, 4],
  ['tree-teal-sm', 37, 19, 2, 3],
];

// Decorative ground objects (rocks, stumps) — sprinkled near tree clusters
// for organic forest-floor feel.
const DECOR = [
  ['rocks-1',  2, 4],
  ['rocks-2', 36, 4],
  ['stump-2', 17, 22],
  ['stump-3',  6, 22],
];

const treesLayer = TREES.map(([name, cx, by, wT, hT]) => obj({
  name, type: 'tree',
  // Tiled object x/y is top-left. We want the BOTTOM-CENTRE of the tree
  // at the world position (cx*TILE, by*TILE). Convert:
  x: cx * TILE - (wT * TILE) / 2 + TILE / 2,
  y: by * TILE - hT * TILE + TILE,
  width: wT * TILE, height: hT * TILE,
}));

const decorLayer = DECOR.map(([name, cx, cy]) => obj({
  name, type: 'decor',
  x: cx * TILE, y: cy * TILE,
  width: 96, height: 32,
}));

// ---- Collision -------------------------------------------------------
// Building rects authored at unscaled (128×128) size; WorldSceneV3 scales
// them by BUILDING_SCALE around the building's tile-centre at load time.
const BUILDING_COLLISION = {
  observatory:       { dx: -32, dy: -40, w: 64, h: 72 },
  'cosmic-library':  { dx: -40, dy: -36, w: 80, h: 64 },
  'star-garden':     { dx: -36, dy: -32, w: 72, h: 64 },
  'hot-springs':     { dx: -32, dy: -36, w: 64, h: 64 },
  'training-grounds':{ dx: -48, dy: -28, w: 96, h: 56 },
  'dream-hollow':    { dx: -56, dy: -56, w: 112, h: 96 },
  'nebula-kitchen':  { dx: -40, dy: -32, w: 80, h: 64 },
  'aura-forge':      { dx: -36, dy: -40, w: 72, h: 72 },
};

const collisionLayer = [];
for (const b of BUILDINGS) {
  const c = BUILDING_COLLISION[b.id];
  collisionLayer.push(obj({
    name: `collide-${b.id}`, type: 'collide',
    x: b.col * TILE + c.dx,
    y: b.row * TILE + c.dy,
    width: c.w, height: c.h,
  }));
}
// Tree trunks block walking — small narrow rect at the base of each tree.
for (const [name, cx, by, wT] of TREES) {
  // Trunk is roughly the bottom 32px of the bounding box, half-tile wide.
  collisionLayer.push(obj({
    name: `collide-tree-${name}-${cx}-${by}`, type: 'collide',
    x: cx * TILE - 8 + (wT * TILE) / 2 - 8,
    y: by * TILE - 16,
    width: 16, height: 16,
  }));
}
collisionLayer.push(obj({ name: 'border-top',    type: 'collide', x: 0, y: 0,                width: W * TILE, height: TILE }));
collisionLayer.push(obj({ name: 'border-bottom', type: 'collide', x: 0, y: (H - 1) * TILE,   width: W * TILE, height: TILE }));
collisionLayer.push(obj({ name: 'border-left',   type: 'collide', x: 0, y: 0,                width: TILE, height: H * TILE }));
collisionLayer.push(obj({ name: 'border-right',  type: 'collide', x: (W - 1) * TILE, y: 0,   width: TILE, height: H * TILE }));

// ---- Compose Tiled JSON ----------------------------------------------

let nextLayerId = 1;
const newLayer = (extra) => ({ id: nextLayerId++, opacity: 1, visible: true, ...extra });

const map = {
  type: 'map',
  version: '1.10',
  tiledversion: '1.10.0',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  width: W, height: H,
  tilewidth: TILE, tileheight: TILE,
  infinite: false,
  nextlayerid: 0,
  nextobjectid: nextObjId,
  tilesets: [{
    firstgid: FM.firstgid,
    name: 'forgotten-memories',
    image: '../tilesets/forgotten-memories/tileset.png',
    imagewidth: 2048, imageheight: 2048,
    tilewidth: TILE, tileheight: TILE,
    tilecount: 4096, columns: FM.cols,
    spacing: 0, margin: 0,
  }],
  layers: [
    newLayer({ name: 'ground',    type: 'tilelayer',  x: 0, y: 0, width: W, height: H, data: ground }),
    newLayer({ name: 'decor',     type: 'objectgroup', objects: decorLayer }),
    newLayer({ name: 'buildings', type: 'objectgroup', objects: buildingsLayer }),
    newLayer({ name: 'props',     type: 'objectgroup', objects: propsLayer }),
    newLayer({ name: 'trees',     type: 'objectgroup', objects: treesLayer }),
    newLayer({ name: 'npcs',      type: 'objectgroup', objects: npcsLayer }),
    newLayer({ name: 'doors',     type: 'objectgroup', objects: doorsLayer }),
    newLayer({ name: 'collision', type: 'objectgroup', objects: collisionLayer }),
  ],
};
map.nextlayerid = nextLayerId;

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(map, null, 2) + '\n', 'utf8');

const uniqGround = new Set(ground);
console.log(
  `world ${W}×${H} (${W * TILE}×${H * TILE}px) · ${uniqGround.size} unique ground gids · ` +
  `${buildingsLayer.length} buildings · ${propsLayer.length} props · ${npcsLayer.length} NPCs · ` +
  `${treesLayer.length} trees · ${decorLayer.length} decor · ${doorsLayer.length} doors · ` +
  `${collisionLayer.length} collision rects`,
);
console.log(`→ ${OUT}`);
