#!/usr/bin/env node
// V3 overworld generator — Tiled-format JSON.
// Output: public/sanctuary-v3/maps/overworld.json
//
// Hub-world layout — denser than the prior version. World is 32×22 tiles
// (1024×704 px), with a central plaza and eight buildings arranged in a
// ring around it. Every tile choice is deliberate; no random scatter.
//
// Aesthetic: the FM tileset is grass-on-dirt patches, not stone-paths.
// Dirt is the world background; grass meadows are islands that mark the
// plaza and each building. There's no separate path tile to draw — the
// dirt between meadows IS the walkway.
//
// Tile gids (verified by atlas inspection):
//   cols 0-4 × rows 0-4   → primary grass-on-dirt 5×5 patch (opaque)
//                           corners (0,0)/(4,0)/(0,4)/(4,4); inner = grass body
//   cols 5-9 × rows 0-4   → alt-color grass patch, same shape
//   cols 10-15 × rows 0-3 → solid dirt body (~24 variants)

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'public/sanctuary-v3/maps/overworld.json');

const W = 32, H = 22;
const TILE = 32;

const FM = { cols: 64, firstgid: 1 };
const gid = (c, r) => FM.firstgid + r * FM.cols + c;

// ---- Tile gid sets ----------------------------------------------------

// Inner grass body (3×3 inner of primary patch). 9 tile choices.
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

// Meadow edges + corners — used when meadow meets dirt.
const GRASS_NW = gid(0, 0);
const GRASS_NE = gid(4, 0);
const GRASS_SW = gid(0, 4);
const GRASS_SE = gid(4, 4);
const GRASS_N  = [gid(1, 0), gid(2, 0), gid(3, 0)];
const GRASS_S  = [gid(1, 4), gid(2, 4), gid(3, 4)];
const GRASS_W  = [gid(0, 1), gid(0, 2), gid(0, 3)];
const GRASS_E  = [gid(4, 1), gid(4, 2), gid(4, 3)];

// Dirt body — solid brown.
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

// ---- Step 2: paint a grass meadow at (x0,y0) sized w×h ---------------

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
// Plaza at the world's centre. Buildings arranged in a ring around it:
// 4 cardinal positions + 4 diagonal corners. Each building sits on its
// own 5×5 grass meadow; the plaza is a 9×7 grass meadow. The dirt between
// meadows is the walkway — no separate path tiles needed.

const PCX = 16, PCY = 11;                  // plaza centre tile
const PLAZA = { x: PCX - 4, y: PCY - 3, w: 9, h: 7 };

// Building positions form a ring at radius ~9-11 tiles from the plaza.
// `meadow` is the 5×5 grass island under the building, centred on (col,row).
const BUILDINGS = [
  { id: 'observatory',       col: PCX,      row: 4 },         // N
  { id: 'star-garden',       col: PCX - 9,  row: 5 },         // NW
  { id: 'hot-springs',       col: PCX + 9,  row: 5 },         // NE
  { id: 'cosmic-library',    col: PCX - 11, row: PCY },       // W
  { id: 'training-grounds',  col: PCX + 11, row: PCY },       // E
  { id: 'nebula-kitchen',    col: PCX - 9,  row: PCY + 6 },   // SW
  { id: 'dream-hollow',      col: PCX + 9,  row: PCY + 6 },   // SE
  { id: 'aura-forge',        col: PCX,      row: PCY + 7 },   // S
];

// Paint plaza meadow first, then per-building meadows on top. Each meadow
// is 5×5 centred on the building's (col,row).
paintMeadow(PLAZA.x, PLAZA.y, PLAZA.w, PLAZA.h);
for (const b of BUILDINGS) {
  paintMeadow(b.col - 2, b.row - 2, 5, 5);
}

// ---- Object layers ---------------------------------------------------

let nextObjId = 1;
const obj = (props) => ({ id: nextObjId++, rotation: 0, visible: true, ...props });

// Buildings — image objects centred on (col*TILE, row*TILE), 128×128.
const buildingsLayer = BUILDINGS.map(b => obj({
  name: b.id, type: 'building',
  x: b.col * TILE - 64,
  y: b.row * TILE - 64,
  width: 128, height: 128,
}));

// Doors — at the south edge of each building's visible structure.
const doorsLayer = BUILDINGS.map(b => obj({
  name: b.id, type: 'door',
  x: b.col * TILE - 16,
  y: b.row * TILE + 32,
  width: 32, height: 24,
}));

// NPCs — themed NPC stands one tile south-east of each building's centre.
// Spawn fox stands at the centre of the plaza meadow.
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
    x: PCX * TILE - 24,
    y: PCY * TILE - 24,
    width: 48, height: 48,
  }),
];
for (const b of BUILDINGS) {
  const sheet = NPC_BY_ZONE[b.id];
  if (!sheet) continue;
  npcsLayer.push(obj({
    name: sheet, type: 'npc',
    x: b.col * TILE + 24,
    y: b.row * TILE + 16,
    width: 48, height: 48,
  }));
}

// Signature props — placed deliberately. Plaza gets signpost + cosmic-well
// as social anchors; each building's meadow gets a small thematic prop just
// to its west so it doesn't block the door.
const propsLayer = [
  obj({ name: 'signpost',    type: 'prop', x: (PCX - 3) * TILE,     y: (PCY + 1) * TILE,     width: 32, height: 64 }),
  obj({ name: 'cosmic-well', type: 'prop', x: (PCX + 2) * TILE,     y: (PCY + 1) * TILE,     width: 64, height: 64 }),
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
  propsLayer.push(obj({
    name: propName, type: 'prop',
    x: (b.col - 2) * TILE, y: (b.row + 1) * TILE,
    width: 32, height: 32,
  }));
}

// Building collision — hand-tuned to hug each visible structure. Values
// are offsets from the building's tile-centre (b.col*TILE, b.row*TILE) and
// width/height of the collider rect.
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
collisionLayer.push(obj({ name: 'border-top',    type: 'collide', x: 0, y: 0,                width: W * TILE, height: 2 * TILE }));
collisionLayer.push(obj({ name: 'border-bottom', type: 'collide', x: 0, y: (H - 2) * TILE,   width: W * TILE, height: 2 * TILE }));
collisionLayer.push(obj({ name: 'border-left',   type: 'collide', x: 0, y: 0,                width: 2 * TILE, height: H * TILE }));
collisionLayer.push(obj({ name: 'border-right',  type: 'collide', x: (W - 2) * TILE, y: 0,   width: 2 * TILE, height: H * TILE }));

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
    newLayer({ name: 'buildings', type: 'objectgroup', objects: buildingsLayer }),
    newLayer({ name: 'props',     type: 'objectgroup', objects: propsLayer }),
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
  `${doorsLayer.length} doors · ${collisionLayer.length} collision rects`,
);
console.log(`→ ${OUT}`);
