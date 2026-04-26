#!/usr/bin/env node
// V3 overworld generator — Tiled-format JSON.
// Output: public/sanctuary-v3/maps/overworld.json
//
// Aesthetic: the Forgotten Memories tileset is "grass-on-dirt patches" —
// dirt is the world background, grass meadows are *islands* that mark
// significant places. So the world is dirt, every building sits on its own
// 9×8 grass meadow, the spawn point sits on a 9×7 grass meadow at world
// centre, and the rest is dirt + a few hand-placed scatter props. No
// procedural noise, no random tile spam, no water (the water sheet's
// pre-composed lakes need separate asset prep — saved for a follow-up pass).
//
// Tile-gid map (verified by inspecting the rendered atlas):
//   cols 0–4 × rows 0–4  → primary grass-on-dirt 5×5 patch (opaque)
//                          (0,0) NW corner, (4,0) NE, (0,4) SW, (4,4) SE,
//                          row/col 1–3 are the inner grass body
//   cols 5–9 × rows 0–4  → alt-color grass patch, same shape
//   cols 10–15 × rows 0–3 → solid dirt body (~24 variants)
//
// We compose grass meadows as a 9-slice: 4 corners + 4 cardinal edges + a
// repeating interior body (3×3 of inner grass tiles, deterministically
// picked). Edge transitions handle the meadow's shore against dirt — no
// runtime alpha-blending needed.

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'public/sanctuary-v3/maps/overworld.json');

const W = 60, H = 40;
const TILE = 32;

const FM = { cols: 64, firstgid: 1 };
const gid = (c, r) => FM.firstgid + r * FM.cols + c;

// ---- Tile gid sets ----------------------------------------------------

// Inner grass body (3×3 inner of primary 5×5 patch). Used as meadow fill.
const GRASS_BODY = [
  gid(1, 1), gid(2, 1), gid(3, 1),
  gid(1, 2), gid(2, 2), gid(3, 2),
  gid(1, 3), gid(2, 3), gid(3, 3),
];

// Alt-color grass body (cols 5-9 rows 1-3). Mixed in lightly inside large
// meadows so they don't read as a single repeating tile.
const GRASS_BODY_ALT = [
  gid(6, 1), gid(7, 1), gid(8, 1),
  gid(6, 2), gid(7, 2), gid(8, 2),
  gid(6, 3), gid(7, 3), gid(8, 3),
];

// Combined primary + alt pool — each cell picks independently so the alt
// tiles are sprinkled organically instead of forming visible 2×2 blocks.
const GRASS_BODY_MIX = [...GRASS_BODY, ...GRASS_BODY_ALT];

// Meadow edges (the grass tile when meadow meets dirt on that side).
const GRASS_EDGE_N = [gid(1, 0), gid(2, 0), gid(3, 0)];
const GRASS_EDGE_S = [gid(1, 4), gid(2, 4), gid(3, 4)];
const GRASS_EDGE_W = [gid(0, 1), gid(0, 2), gid(0, 3)];
const GRASS_EDGE_E = [gid(4, 1), gid(4, 2), gid(4, 3)];
const GRASS_NW = gid(0, 0);
const GRASS_NE = gid(4, 0);
const GRASS_SW = gid(0, 4);
const GRASS_SE = gid(4, 4);

// Dirt body — solid brown, world background.
const DIRT_BODY = [
  gid(11, 0), gid(12, 0), gid(13, 0), gid(14, 0), gid(15, 0),
  gid(11, 1), gid(12, 1), gid(13, 1), gid(14, 1), gid(15, 1),
  gid(11, 2), gid(12, 2), gid(13, 2), gid(14, 2), gid(15, 2),
];

// Deterministic xorshift-ish pick — same (x,y,salt) ⇒ same tile.
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
const setGround = (x, y, t) => { if (inBounds(x, y)) ground[idx(x, y)] = t; };

// ---- Step 1: dirt background -----------------------------------------

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    setGround(x, y, pick(DIRT_BODY, x, y, 7));
  }
}

// ---- Step 2: place grass meadows --------------------------------------
// A meadow is a rectangular island of grass on dirt. We render it as a
// 9-slice: corners → fixed corner tile, edges → edge variant, interior
// → alternating GRASS_BODY/_ALT for subtle macro-variation.

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
      else if (top)   g = pick(GRASS_EDGE_N, x, y, 11);
      else if (bot)   g = pick(GRASS_EDGE_S, x, y, 13);
      else if (left)  g = pick(GRASS_EDGE_W, x, y, 17);
      else if (right) g = pick(GRASS_EDGE_E, x, y, 19);
      else {
        // Interior — pick from a combined primary+alt pool so each cell
        // is chosen independently. Avoids the 2×2 macro blocks that come
        // from alternating between two 9-tile sets at low frequency.
        g = pick(GRASS_BODY_MIX, x, y, 23);
      }
      setGround(x, y, g);
    }
  }
}

// ---- Step 3: world layout --------------------------------------------
// 8 buildings in 2 rows × 4 cols, evenly spaced. Each building sits on a
// 9×8 grass meadow centred on its tile. The spawn meadow at world centre
// is 9×7 — same width, slightly shorter (no building inside it).
//
// Building footprint (visible structure within 128×128 PNG): we place the
// PNG centred on (col*TILE, row*TILE), so it covers tiles
//   (col-2, row-2) .. (col+1, row+1)  — a 4×4 area.
// The grass meadow extends 2 tiles past that on every side.

const ROW_TOP = 9;
const ROW_BOTTOM = 30;
const SPAWN_COL = 30;
const SPAWN_ROW = 19;
const COLS_BUILDING = [9, 21, 39, 51];

const BUILDINGS = [
  { id: 'observatory',       row: ROW_TOP,    col: COLS_BUILDING[0] },
  { id: 'cosmic-library',    row: ROW_TOP,    col: COLS_BUILDING[1] },
  { id: 'star-garden',       row: ROW_TOP,    col: COLS_BUILDING[2] },
  { id: 'hot-springs',       row: ROW_TOP,    col: COLS_BUILDING[3] },
  { id: 'training-grounds',  row: ROW_BOTTOM, col: COLS_BUILDING[0] },
  { id: 'dream-hollow',      row: ROW_BOTTOM, col: COLS_BUILDING[1] },
  { id: 'nebula-kitchen',    row: ROW_BOTTOM, col: COLS_BUILDING[2] },
  { id: 'aura-forge',        row: ROW_BOTTOM, col: COLS_BUILDING[3] },
];

// Building meadow: 9 wide × 8 tall, centred on (col, row). Extends 4 tiles
// west, 4 east, 4 north, 3 south of the building tile-centre — so the door
// at (col, row+2) sits on grass with one tile of grass clearance south.
for (const b of BUILDINGS) {
  paintMeadow(b.col - 4, b.row - 4, 9, 8);
}
// Spawn meadow at world centre, 9×7.
paintMeadow(SPAWN_COL - 4, SPAWN_ROW - 3, 9, 7);

// ---- Object layers ----------------------------------------------------

let nextObjId = 1;
const obj = (props) => ({ id: nextObjId++, rotation: 0, visible: true, ...props });

// Buildings — image objects, centred on (col*TILE, row*TILE) with 128×128.
// Tiled top-left convention means we shift by -64 from centre.
const buildingsLayer = BUILDINGS.map(b => obj({
  name: b.id, type: 'building',
  x: b.col * TILE - 64,
  y: b.row * TILE - 64,
  width: 128, height: 128,
}));

// Doors — placed on the south edge of each building's visible structure.
// The PNG door pixel sits roughly at building-y + 100 (out of 128), so in
// world coords that's (row*TILE - 64) + 100 = row*TILE + 36. We define a
// 1×1 door zone there so the player triggers entry by walking into the
// south face, not by passing through the structure.
const doorsLayer = BUILDINGS.map(b => obj({
  name: b.id, type: 'door',
  x: b.col * TILE - 16,
  y: b.row * TILE + 32,
  width: 32, height: 24,
}));

// NPCs — themed NPC stands one tile south-east of each door, on grass.
// Spawn fox stands at the centre of the spawn meadow.
const NPC_NEAR = {
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
    x: SPAWN_COL * TILE - 24,
    y: SPAWN_ROW * TILE - 24,
    width: 48, height: 48,
  }),
];
for (const b of BUILDINGS) {
  const sheet = NPC_NEAR[b.id];
  if (!sheet) continue;
  // Offset the NPC east so they don't sit in front of the door.
  npcsLayer.push(obj({
    name: sheet, type: 'npc',
    x: b.col * TILE + 32,
    y: b.row * TILE + 16,
    width: 48, height: 48,
  }));
}

// Signature props — one signature object per zone, placed deliberately on
// the grass meadow beside (not in front of) each building.
const propsLayer = [
  // Spawn area: signpost + cosmic-well as social anchors.
  obj({ name: 'signpost',    type: 'prop', x: (SPAWN_COL - 3) * TILE, y: (SPAWN_ROW + 1) * TILE, width: 32, height: 64 }),
  obj({ name: 'cosmic-well', type: 'prop', x: (SPAWN_COL + 2) * TILE, y: (SPAWN_ROW + 1) * TILE, width: 64, height: 64 }),

  // Per-building signature props, placed two tiles west of the building.
  obj({ name: 'telescope',      type: 'prop', x: (BUILDINGS[0].col - 4) * TILE, y: (BUILDINGS[0].row + 1) * TILE, width: 64, height: 64 }),
  obj({ name: 'star-chart',     type: 'prop', x: (BUILDINGS[1].col - 4) * TILE, y: (BUILDINGS[1].row + 1) * TILE, width: 32, height: 32 }),
  obj({ name: 'star-flower',    type: 'prop', x: (BUILDINGS[2].col - 4) * TILE, y: (BUILDINGS[2].row + 1) * TILE, width: 32, height: 32 }),
  obj({ name: 'moon-lantern',   type: 'prop', x: (BUILDINGS[3].col - 4) * TILE, y: (BUILDINGS[3].row + 1) * TILE, width: 32, height: 32 }),
  obj({ name: 'training-dummy', type: 'prop', x: (BUILDINGS[4].col - 4) * TILE, y: (BUILDINGS[4].row + 1) * TILE, width: 32, height: 64 }),
  obj({ name: 'dream-mushroom', type: 'prop', x: (BUILDINGS[5].col - 4) * TILE, y: (BUILDINGS[5].row + 1) * TILE, width: 32, height: 32 }),
  obj({ name: 'crystal-stove',  type: 'prop', x: (BUILDINGS[6].col - 4) * TILE, y: (BUILDINGS[6].row + 1) * TILE, width: 64, height: 64 }),
  obj({ name: 'crystal-anvil',  type: 'prop', x: (BUILDINGS[7].col - 4) * TILE, y: (BUILDINGS[7].row + 1) * TILE, width: 64, height: 64 }),
];

// Collision rects — building footprints + map borders. Each building
// rect is hand-tuned to hug the visible structure within the 128×128 PNG
// (centre 80×64, leaving the bushy/decorative edges walkable). Per-PNG
// overrides live in BUILDING_COLLISION; defaults catch anything we
// haven't tuned yet.
const DEFAULT_COL = { w: 80, h: 64, dx: -40, dy: -40 };
const BUILDING_COLLISION = {
  // observatory — tall narrow tower, structure roughly cols 32-96 of art,
  // rows 8-104 (autumn-bush at base extends past structure).
  observatory:       { w: 64, h: 72, dx: -32, dy: -40 },
  // cosmic-library — wider squat building, structure cols 16-112 rows 24-100.
  'cosmic-library':  { w: 96, h: 60, dx: -48, dy: -28 },
  // star-garden — tall narrow building, similar to observatory.
  'star-garden':     { w: 72, h: 64, dx: -36, dy: -32 },
  // hot-springs — wide cabin with fenced front; collision is just the cabin.
  'hot-springs':     { w: 80, h: 56, dx: -40, dy: -32 },
  // training-grounds — wider arena.
  'training-grounds':{ w: 96, h: 60, dx: -48, dy: -28 },
  // dream-hollow — narrower mushroom-tower.
  'dream-hollow':    { w: 64, h: 72, dx: -32, dy: -40 },
  // nebula-kitchen — squat kitchen.
  'nebula-kitchen':  { w: 80, h: 56, dx: -40, dy: -32 },
  // aura-forge — chimney structure.
  'aura-forge':      { w: 72, h: 72, dx: -36, dy: -40 },
};

const collisionLayer = [];
for (const b of BUILDINGS) {
  const c = BUILDING_COLLISION[b.id] ?? DEFAULT_COL;
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
    newLayer({ name: 'ground',     type: 'tilelayer',  x: 0, y: 0, width: W, height: H, data: ground }),
    newLayer({ name: 'buildings',  type: 'objectgroup', objects: buildingsLayer }),
    newLayer({ name: 'props',      type: 'objectgroup', objects: propsLayer }),
    newLayer({ name: 'npcs',       type: 'objectgroup', objects: npcsLayer }),
    newLayer({ name: 'doors',      type: 'objectgroup', objects: doorsLayer }),
    newLayer({ name: 'collision',  type: 'objectgroup', objects: collisionLayer }),
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
