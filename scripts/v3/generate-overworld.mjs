#!/usr/bin/env node
// Procedurally emit the V3 overworld as Tiled-format JSON.
// Output: public/sanctuary-v3/maps/overworld.json
//
// World: 60 cols × 40 rows of 32×32 tiles → 1920 × 1280 pixels.
// Two tilelayers — `ground` (opaque) and `ground_decoration` (sparse,
// transparent overlay) — both drawn from the Forgotten Memories atlas.
// Object layers: 'buildings', 'props', 'water', 'npcs', 'doors', 'collision'.
// The scene reads object layers by name and instantiates the right Phaser
// images by `name`/`type` properties — so editing the map later means just
// editing the JSON, no code change.
//
// Why two tile layers: the FM atlas stores the same 5×5 grass-on-dirt patch
// twice — once on solid dirt (rows 0–4) and once on transparent background
// (rows 5–9). The transparent variant lets us scatter grass tufts and
// decorative overlays on top of dirt patches, which reads as a hand-pixeled
// RPG map rather than a single-tile grass carpet.

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'public/sanctuary-v3/maps/overworld.json');

const W = 60, H = 40;
const TILE = 32;

// --- Tile gid mapping ---------------------------------------------------
// Forgotten Memories tileset (2048×2048, 64 cols × 64 rows). firstgid = 1.
// gid(col, row) = 1 + row*64 + col.
const FM = { cols: 64, firstgid: 1 };
const gid = (c, r) => FM.firstgid + r * FM.cols + c;

// Grass body, opaque on dirt (inner 3×3 of the primary 5×5 patch at rows 0-4
// cols 0-4). Nine variants — random selection produces hand-pixeled feel.
const GRASS_BODY = [
  gid(1, 1), gid(2, 1), gid(3, 1),
  gid(1, 2), gid(2, 2), gid(3, 2),
  gid(1, 3), gid(2, 3), gid(3, 3),
];
// Alternate grass patch (cols 5-9 rows 0-4) — same shape, slight color
// variation. Mixing both prevents the "stamped" repetition look.
const GRASS_BODY_ALT = [
  gid(6, 1), gid(7, 1), gid(8, 1),
  gid(6, 2), gid(7, 2), gid(8, 2),
  gid(6, 3), gid(7, 3), gid(8, 3),
];
// Dirt fill (cols 11-15 rows 0-3) — solid brown, used for path bodies.
// Five horizontal variants × four vertical = 20 tiles to choose from.
const DIRT_BODY = [
  gid(11, 0), gid(12, 0), gid(13, 0), gid(14, 0), gid(15, 0),
  gid(11, 1), gid(12, 1), gid(13, 1), gid(14, 1), gid(15, 1),
  gid(11, 2), gid(12, 2), gid(13, 2), gid(14, 2), gid(15, 2),
];

// Edge transitions for the primary 5×5 patch — these are the *grass* tile
// at the edge of a grass meadow that abuts dirt on one side. We use them
// alongside paths so the path doesn't read as a hard rectangle. Naming is
// "GRASS_EDGE_<dirt-side>" — i.e. NORTH means dirt is to the north of the
// grass tile, so this is the top-edge of a grass meadow.
const GRASS_EDGE_NORTH = [gid(1, 0), gid(2, 0), gid(3, 0)]; // top edges
const GRASS_EDGE_SOUTH = [gid(1, 4), gid(2, 4), gid(3, 4)]; // bottom edges
const GRASS_EDGE_WEST  = [gid(0, 1), gid(0, 2), gid(0, 3)]; // left edges
const GRASS_EDGE_EAST  = [gid(4, 1), gid(4, 2), gid(4, 3)]; // right edges

// Decoration overlays (ground_decoration layer) — use the *transparent-bg*
// version of the patch (rows 5-9). Sparingly placed so the look stays
// readable. Picking edge variants gives nice "tuft" shapes against the
// underlying ground.
const DECO_GRASS_TUFT = [
  gid(1, 5), gid(2, 5), gid(3, 5),   // top tufts
  gid(0, 6), gid(4, 6),               // side tufts
  gid(1, 9), gid(2, 9), gid(3, 9),   // bottom tufts
];

// --- Deterministic pick helper -----------------------------------------
// Tiny xorshift-style hash; same inputs → same output, no Math.random.
const pick = (arr, x, y, salt = 0) => {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return arr[Math.abs(h) % arr.length];
};

// --- World layout -------------------------------------------------------
// 8 buildings in 2 rows; spawn at the centre of the main horizontal road.
const ROW_TOP = 8;
const ROW_BOTTOM = 28;
const ROAD_ROW = 20;
const COLS_BUILDING = [10, 22, 38, 50];

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

// --- Build the ground tile array ---------------------------------------
const ground = new Array(W * H);
const decoration = new Array(W * H).fill(0);   // 0 = empty in Tiled

// 1. Fill with varied grass. ~30% chance to use the alternate patch so the
//    overall texture has subtle macro variation — looks like two grass
//    species mixed, not a single repeating tile.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const useAlt = ((x * 31 + y * 17) % 11) < 4;
    ground[y * W + x] = pick(useAlt ? GRASS_BODY_ALT : GRASS_BODY, x, y);
  }
}

const idx = (x, y) => y * W + x;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const setGround = (x, y, t) => { if (inBounds(x, y)) ground[idx(x, y)] = t; };
const setDeco   = (x, y, t) => { if (inBounds(x, y)) decoration[idx(x, y)] = t; };

// Track which cells are dirt so we can compute grass-edge transitions later.
const isDirt = new Set();
const carveDirt = (x, y) => {
  if (!inBounds(x, y)) return;
  setGround(x, y, pick(DIRT_BODY, x, y, 7));
  isDirt.add(idx(x, y));
};

// 2. Main horizontal road across the world (3 tiles tall for visual weight).
for (let x = 2; x < W - 2; x++) {
  carveDirt(x, ROAD_ROW - 1);
  carveDirt(x, ROAD_ROW);
  carveDirt(x, ROAD_ROW + 1);
}

// 3. Vertical access paths from the main road to each building (2-wide so
//    the player can pass any direction without zigzag).
for (const b of BUILDINGS) {
  const c = b.col;
  const yStart = b.row === ROW_TOP ? ROAD_ROW - 2 : ROAD_ROW + 2;
  const yEnd   = b.row === ROW_TOP ? b.row + 3   : b.row - 3;
  const [yLo, yHi] = yStart < yEnd ? [yStart, yEnd] : [yEnd, yStart];
  for (let y = yLo; y <= yHi; y++) {
    carveDirt(c,     y);
    carveDirt(c + 1, y);
  }
}

// 4. Spawn-area plaza: 7×3 dirt patch around the player spawn.
const SPAWN_COL = 30;
for (let dx = -3; dx <= 3; dx++) {
  for (let dy = -1; dy <= 1; dy++) {
    carveDirt(SPAWN_COL + dx, ROAD_ROW + dy);
  }
}

// 5. Compute grass-edge transitions: grass tiles directly adjacent to dirt
//    get swapped to the appropriate side-edge tile. This softens the path
//    edges so they don't read as hard rectangles. We only edit the four
//    cardinal neighbours — diagonal corners stay as plain grass body.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (isDirt.has(idx(x, y))) continue;
    // Dirt is to the NORTH of this grass tile → use SOUTH-edge (grass
    // tile with dirt-band along its top edge).
    if (y > 0 && isDirt.has(idx(x, y - 1))) {
      setGround(x, y, pick(GRASS_EDGE_NORTH, x, y, 11));
    } else if (y < H - 1 && isDirt.has(idx(x, y + 1))) {
      setGround(x, y, pick(GRASS_EDGE_SOUTH, x, y, 13));
    } else if (x > 0 && isDirt.has(idx(x - 1, y))) {
      setGround(x, y, pick(GRASS_EDGE_WEST, x, y, 17));
    } else if (x < W - 1 && isDirt.has(idx(x + 1, y))) {
      setGround(x, y, pick(GRASS_EDGE_EAST, x, y, 19));
    }
  }
}

// 6. Sprinkle decorative grass tufts on the ground_decoration layer.
//    ~6% of grass tiles get a tuft. Avoid placing on dirt (visually wrong)
//    or directly under building footprints.
const buildingFootprintCells = new Set();
for (const b of BUILDINGS) {
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -1; dy <= 2; dy++) {
      buildingFootprintCells.add(idx(b.col + dx, b.row + dy));
    }
  }
}
for (let y = 2; y < H - 2; y++) {
  for (let x = 2; x < W - 2; x++) {
    const i = idx(x, y);
    if (isDirt.has(i) || buildingFootprintCells.has(i)) continue;
    if (((x * 73 + y * 41) % 17) === 0) {
      setDeco(x, y, pick(DECO_GRASS_TUFT, x, y, 23));
    }
  }
}

// --- Object layers ------------------------------------------------------
// Tiled "objectgroup" with image-style objects identified by `name`/`type`.
// Phaser tilemap reader exposes them through map.getObjectLayer(name).objects.

let nextObjId = 1;
const obj = (props) => ({ id: nextObjId++, rotation: 0, visible: true, ...props });

const buildingsLayer = BUILDINGS.map(b => obj({
  name: b.id,
  type: 'building',
  x: b.col * TILE - 64 + 32,        // sprite is 128×128 placed centred on (col, row)
  y: b.row * TILE - 64 + 32,
  width: 128,
  height: 128,
}));

const doorsLayer = BUILDINGS.map(b => obj({
  name: b.id,
  type: 'door',
  x: b.col * TILE + 16,             // centre x
  y: (b.row + 2) * TILE + 16,       // 2 tiles south of the building's tile-centre
  width: 32,
  height: 32,
}));

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
  obj({ name: 'spawn-fox', type: 'npc', x: SPAWN_COL * TILE + 64, y: ROAD_ROW * TILE + 16, width: 48, height: 48 }),
];
for (const b of BUILDINGS) {
  const sheet = NPC_NEAR[b.id];
  if (!sheet) continue;
  const baseY = b.row === ROW_TOP ? (b.row + 3) * TILE : (b.row - 3) * TILE;
  npcsLayer.push(obj({
    name: sheet, type: 'npc',
    x: b.col * TILE + 64,
    y: baseY + 16,
    width: 48, height: 48,
  }));
}

const propsLayer = [
  obj({ name: 'signpost',     type: 'prop', x: (SPAWN_COL - 4) * TILE + 16, y: ROAD_ROW * TILE + 64, width: 32, height: 64 }),
  obj({ name: 'cosmic-well',  type: 'prop', x: (SPAWN_COL + 4) * TILE + 16, y: ROAD_ROW * TILE + 64, width: 64, height: 64 }),

  obj({ name: 'telescope',    type: 'prop', x: BUILDINGS[0].col * TILE + 96,  y: BUILDINGS[0].row * TILE + 32, width: 64, height: 64 }),
  obj({ name: 'star-chart',   type: 'prop', x: BUILDINGS[1].col * TILE + 96,  y: BUILDINGS[1].row * TILE + 32, width: 32, height: 32 }),
  obj({ name: 'star-banner',  type: 'prop', x: BUILDINGS[2].col * TILE - 64,  y: BUILDINGS[2].row * TILE + 32, width: 32, height: 64 }),
  obj({ name: 'moon-lantern', type: 'prop', x: BUILDINGS[3].col * TILE + 96,  y: BUILDINGS[3].row * TILE + 32, width: 32, height: 32 }),

  obj({ name: 'training-dummy', type: 'prop', x: BUILDINGS[4].col * TILE + 96, y: BUILDINGS[4].row * TILE + 32, width: 32, height: 64 }),
  obj({ name: 'crystal-stove',  type: 'prop', x: BUILDINGS[6].col * TILE + 96, y: BUILDINGS[6].row * TILE + 32, width: 64, height: 64 }),
  obj({ name: 'crystal-anvil',  type: 'prop', x: BUILDINGS[7].col * TILE + 96, y: BUILDINGS[7].row * TILE + 32, width: 64, height: 64 }),
];
const SCATTERS = [
  ['star-flower',    14, 12],
  ['star-flower',    32, 14],
  ['star-flower',    48, 24],
  ['dream-mushroom', 18, 16],
  ['dream-mushroom', 26, 26],
  ['rune-stone',      6, 14],
  ['rune-stone',     54, 24],
  ['seed-sprout',    42, 16],
  ['floating-stone', 36, 12],
  ['forge-stone',    52, 32],
];
for (const [name, cx, cy] of SCATTERS) {
  propsLayer.push(obj({
    name, type: 'prop',
    x: cx * TILE + 16,
    y: cy * TILE + 32,
    width: 32, height: 32,
  }));
}

// Animated water — Hot Springs pool (south of building) + a smaller pond
// near the Star Garden (north row). Two regions instead of one breaks the
// world up visually and gives the cartographer something to look at on the
// north side.
const HS = BUILDINGS.find(b => b.id === 'hot-springs');
const SG = BUILDINGS.find(b => b.id === 'star-garden');
const waterLayer = [
  obj({
    name: 'hot-springs-pool', type: 'water',
    x: (HS.col - 2) * TILE,
    y: (HS.row + 4) * TILE,
    width: 4 * TILE,
    height: 3 * TILE,
  }),
  obj({
    name: 'star-garden-pond', type: 'water',
    x: (SG.col - 3) * TILE,
    y: (SG.row - 5) * TILE,
    width: 3 * TILE,
    height: 2 * TILE,
  }),
];

// Collision rects: building footprints + map borders + water ponds.
const collisionLayer = [];
for (const b of BUILDINGS) {
  collisionLayer.push(obj({
    name: `collide-${b.id}`, type: 'collide',
    x: b.col * TILE - 64,
    y: b.row * TILE - 32,
    width: 128, height: 80,
  }));
}
// Water collision so the player doesn't walk through ponds.
for (const w of waterLayer) {
  collisionLayer.push(obj({
    name: `collide-${w.name}`, type: 'collide',
    x: w.x, y: w.y, width: w.width, height: w.height,
  }));
}
collisionLayer.push(obj({ name: 'border-top',    type: 'collide', x: 0, y: 0,        width: W * TILE, height: 2 * TILE }));
collisionLayer.push(obj({ name: 'border-bottom', type: 'collide', x: 0, y: (H - 2) * TILE, width: W * TILE, height: 2 * TILE }));
collisionLayer.push(obj({ name: 'border-left',   type: 'collide', x: 0, y: 0,        width: 2 * TILE, height: H * TILE }));
collisionLayer.push(obj({ name: 'border-right',  type: 'collide', x: (W - 2) * TILE, y: 0, width: 2 * TILE, height: H * TILE }));

// --- Compose the Tiled JSON --------------------------------------------
let nextLayerId = 1;
const newLayer = (extra) => ({ id: nextLayerId++, opacity: 1, visible: true, ...extra });

const map = {
  type: 'map',
  version: '1.10',
  tiledversion: '1.10.0',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  width: W,
  height: H,
  tilewidth: TILE,
  tileheight: TILE,
  infinite: false,
  nextlayerid: 0,
  nextobjectid: nextObjId,
  tilesets: [{
    firstgid: FM.firstgid,
    name: 'forgotten-memories',
    image: '../tilesets/forgotten-memories/tileset.png',
    imagewidth: 2048,
    imageheight: 2048,
    tilewidth: TILE,
    tileheight: TILE,
    tilecount: 4096,
    columns: FM.cols,
    spacing: 0,
    margin: 0,
  }],
  layers: [
    newLayer({ name: 'ground',            type: 'tilelayer',  x: 0, y: 0, width: W, height: H, data: ground }),
    newLayer({ name: 'ground_decoration', type: 'tilelayer',  x: 0, y: 0, width: W, height: H, data: decoration }),
    newLayer({ name: 'buildings',         type: 'objectgroup', objects: buildingsLayer }),
    newLayer({ name: 'props',             type: 'objectgroup', objects: propsLayer }),
    newLayer({ name: 'water',             type: 'objectgroup', objects: waterLayer }),
    newLayer({ name: 'npcs',              type: 'objectgroup', objects: npcsLayer }),
    newLayer({ name: 'doors',             type: 'objectgroup', objects: doorsLayer }),
    newLayer({ name: 'collision',         type: 'objectgroup', objects: collisionLayer }),
  ],
};
map.nextlayerid = nextLayerId;

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(map, null, 2) + '\n', 'utf8');

// --- Summary diagnostics (so cron logs show what changed) --------------
const uniqGround = new Set(ground);
const uniqDeco = new Set(decoration.filter(t => t !== 0));
const decoCount = decoration.filter(t => t !== 0).length;
const dirtCount = isDirt.size;
const summary = `world ${W}×${H} tiles (${W*TILE}×${H*TILE} px), ` +
  `${uniqGround.size} unique ground gids, ` +
  `${uniqDeco.size} unique decoration gids (${decoCount} placed), ` +
  `${dirtCount} dirt-path tiles, ` +
  `${buildingsLayer.length} buildings, ` +
  `${propsLayer.length} props, ${npcsLayer.length} NPCs, ` +
  `${doorsLayer.length} doors, ${waterLayer.length} water regions, ` +
  `${collisionLayer.length} collision rects`;
console.log(summary);
console.log(`→ ${OUT}`);
