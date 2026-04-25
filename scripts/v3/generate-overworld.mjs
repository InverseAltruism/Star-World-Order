#!/usr/bin/env node
// Procedurally emit the V3 overworld as Tiled-format JSON.
// Output: public/sanctuary-v3/maps/overworld.json
//
// World: 60 cols × 40 rows of 32×32 tiles → 1920 × 1280 pixels.
// One tilelayer ('ground') drawn from the Forgotten Memories atlas.
// Object layers: 'buildings', 'props', 'npcs', 'doors', 'collision'.
// The scene reads object layers by name and instantiates the right Phaser
// images by `name`/`type` properties — so editing the map later means just
// editing the JSON, no code change.

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'public/sanctuary-v3/maps/overworld.json');

const W = 60, H = 40;
const TILE = 32;

// --- Tile gid mapping ---------------------------------------------------
// Forgotten Memories tileset (2048×2048, 64 cols × 64 rows). firstgid = 1.
// gid(col, row) = 1 + row*64 + col. We only use a small set of well-known
// crops; everything else stays at the grass-A default.
const FM = {
  cols: 64,
  firstgid: 1,
};
function gid(col, row) { return FM.firstgid + row * FM.cols + col; }

const TILE_GIDS = {
  grassA:       gid(1, 0),   // bright olive grass
  grassB:       gid(2, 0),   // grass variant
  stoneBright:  gid(2, 1),   // beige cracked stone path (highlight)
  stoneMid:     gid(1, 1),   // stone path body
  dirt:         gid(1, 2),   // warm dirt
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

// --- Build the tile data array -----------------------------------------
// Start as all grass with light variation, then carve roads.
const data = new Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    // Sparse grass-B variation to avoid a flat carpet look.
    const variant = ((x * 31 + y * 17) % 9 === 0);
    data[y * W + x] = variant ? TILE_GIDS.grassB : TILE_GIDS.grassA;
  }
}

function setTile(x, y, t) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  data[y * W + x] = t;
}

// Main horizontal road across the world (3 tiles tall for visual weight).
for (let x = 2; x < W - 2; x++) {
  setTile(x, ROAD_ROW - 1, TILE_GIDS.stoneBright);
  setTile(x, ROAD_ROW,     TILE_GIDS.stoneMid);
  setTile(x, ROAD_ROW + 1, TILE_GIDS.stoneBright);
}

// Vertical access paths from main road to each building.
// Top row: path goes UP from road row to just south of the building (1 tile clearance).
// Bottom row: path goes DOWN from road row to just north of the building.
for (const b of BUILDINGS) {
  const c = b.col;
  if (b.row === ROW_TOP) {
    // path tiles: (col-1, road-2) .. (col-1, top+3) and (col, ...) and (col+1, ...)
    // Path is 2-wide so the player can pass any direction without zigzag.
    const yStart = ROAD_ROW - 2;
    const yEnd   = b.row + 3;          // just south of building footprint top
    for (let y = yEnd; y <= yStart; y++) {
      setTile(c,     y, TILE_GIDS.stoneMid);
      setTile(c + 1, y, TILE_GIDS.stoneBright);
    }
  } else {
    const yStart = ROAD_ROW + 2;
    const yEnd   = b.row - 3;          // just north of building footprint bottom
    for (let y = yStart; y <= yEnd; y++) {
      setTile(c,     y, TILE_GIDS.stoneMid);
      setTile(c + 1, y, TILE_GIDS.stoneBright);
    }
  }
}

// Spawn-area plaza: a 7×3 stone patch around the player spawn (centre of the road).
const SPAWN_COL = 30;
for (let dx = -3; dx <= 3; dx++) {
  for (let dy = -1; dy <= 1; dy++) {
    setTile(SPAWN_COL + dx, ROAD_ROW + dy, TILE_GIDS.stoneMid);
  }
}

// --- Object layers ------------------------------------------------------
// Tiled "objectgroup" with image-style objects identified by `name`/`type`.
// Phaser tilemap reader exposes them through map.getObjectLayer(name).objects.

let nextObjId = 1;
const obj = (props) => ({
  id: nextObjId++,
  rotation: 0,
  visible: true,
  ...props,
});

const buildingsLayer = BUILDINGS.map(b =>
  obj({
    name: b.id,
    type: 'building',
    x: b.col * TILE - 64 + 32,        // sprite is 128×128 placed centred on (col, row)
    y: b.row * TILE - 64 + 32,
    width: 128,
    height: 128,
  }),
);

// Door anchors: south-bottom-centre of each building. Player stands here to enter.
const doorsLayer = BUILDINGS.map(b =>
  obj({
    name: b.id,
    type: 'door',
    x: b.col * TILE + 16,             // centre x
    y: (b.row + 2) * TILE + 16,       // 2 tiles south of the building's tile-center
    width: 32,
    height: 32,
  }),
);

// NPCs: one themed NPC near each building's door, plus Spawn Fox at world centre.
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
  // Place NPC just outside the building, beside its door.
  const baseY = b.row === ROW_TOP ? (b.row + 3) * TILE : (b.row - 3) * TILE;
  npcsLayer.push(obj({
    name: sheet,
    type: 'npc',
    x: b.col * TILE + 64,             // ~2 tiles east of door
    y: baseY + 16,
    width: 48,
    height: 48,
  }));
}

// Props: scatter SWO-themed pixel-art props for atmosphere + signature per zone.
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
// Ambient scattered decorations.
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

// Animated water pool — 4×3 tiles south of the Hot Springs building.
// The renderer cycles through 6 frames of the FM water atlas.
const HS = BUILDINGS.find(b => b.id === 'hot-springs');
const waterLayer = [
  obj({
    name: 'pool',
    type: 'water',
    x: (HS.col - 2) * TILE,
    y: (HS.row + 4) * TILE,
    width: 4 * TILE,
    height: 3 * TILE,
  }),
];

// Collision rects: building footprints + map borders (outer 2 tiles).
const collisionLayer = [];
for (const b of BUILDINGS) {
  // Footprint: 4 tiles wide × 3 tiles tall, centred on (col*TILE, row*TILE).
  collisionLayer.push(obj({
    name: `collide-${b.id}`,
    type: 'collide',
    x: b.col * TILE - 64,
    y: b.row * TILE - 32,
    width: 128,
    height: 80,
  }));
}
// Top border (so the camera doesn't scroll past world edge): top 2 rows
// blocked. Bottom border: bottom 2 rows. Left/right: outer 2 cols.
collisionLayer.push(obj({ name: 'border-top',    type: 'collide', x: 0, y: 0,        width: W * TILE, height: 2 * TILE }));
collisionLayer.push(obj({ name: 'border-bottom', type: 'collide', x: 0, y: (H - 2) * TILE, width: W * TILE, height: 2 * TILE }));
collisionLayer.push(obj({ name: 'border-left',   type: 'collide', x: 0, y: 0,        width: 2 * TILE, height: H * TILE }));
collisionLayer.push(obj({ name: 'border-right',  type: 'collide', x: (W - 2) * TILE, y: 0, width: 2 * TILE, height: H * TILE }));

// --- Compose the Tiled JSON --------------------------------------------
let nextLayerId = 1;
const newLayer = (extra) => ({
  id: nextLayerId++,
  opacity: 1,
  visible: true,
  ...extra,
});

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
  tilesets: [
    {
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
    },
  ],
  layers: [
    newLayer({ name: 'ground',    type: 'tilelayer',  x: 0, y: 0, width: W, height: H, data }),
    newLayer({ name: 'buildings', type: 'objectgroup', objects: buildingsLayer }),
    newLayer({ name: 'props',     type: 'objectgroup', objects: propsLayer }),
    newLayer({ name: 'water',     type: 'objectgroup', objects: waterLayer }),
    newLayer({ name: 'npcs',      type: 'objectgroup', objects: npcsLayer }),
    newLayer({ name: 'doors',     type: 'objectgroup', objects: doorsLayer }),
    newLayer({ name: 'collision', type: 'objectgroup', objects: collisionLayer }),
  ],
};
map.nextlayerid = nextLayerId;

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(map, null, 2) + '\n', 'utf8');

const summary = `world ${W}×${H} tiles (${W*TILE}×${H*TILE} px), ${buildingsLayer.length} buildings, ${propsLayer.length} props, ${npcsLayer.length} NPCs, ${doorsLayer.length} doors, ${collisionLayer.length} collision rects, ${waterLayer.length} water region`;
console.log(summary);
console.log(`→ ${OUT}`);
