#!/usr/bin/env node
// Build review images for every generated NPC and a single grid image of all of
// them so the user can preview at a glance via the test site.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const NPC_DIR = path.join(ROOT, 'public/sanctuary-v3/npcs');
const TILESET = path.join(ROOT, 'public/sanctuary-v3/tilesets/forgotten-memories/tileset.png');
const REVIEW_DIR = path.join(ROOT, 'public/sanctuary-v3/_review/all-npcs');

async function makeGrass(w, h) {
  // Crop one 32×32 grass tile from FM and tile it.
  const tile = await sharp(TILESET).extract({ left: 32, top: 0, width: 32, height: 32 }).toBuffer();
  const composite = [];
  const tilesX = Math.ceil(w / 32), tilesY = Math.ceil(h / 32);
  for (let y = 0; y < tilesY; y++) for (let x = 0; x < tilesX; x++)
    composite.push({ input: tile, left: x * 32, top: y * 32 });
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite(composite).png().toBuffer();
}

async function main() {
  await fs.mkdir(REVIEW_DIR, { recursive: true });
  const entries = (await fs.readdir(NPC_DIR))
    .filter(f => f.endsWith('.png'))
    .sort();

  // Per-NPC: side-by-side raw sheet on dark bg + sheet on grass.
  const cells = []; // { id, sheetOnDark, sheetOnGrass }
  for (const f of entries) {
    const id = f.replace(/\.png$/, '');
    const sheet = await fs.readFile(path.join(NPC_DIR, f));
    const meta = await sharp(sheet).metadata();
    const W = meta.width, H = meta.height;
    const grass = await makeGrass(W, H);
    const onGrass = await sharp(grass).composite([{ input: sheet, top: 0, left: 0 }]).png().toBuffer();
    const onDark = await sharp({
      create: { width: W, height: H, channels: 4, background: { r: 26, g: 0, b: 51, alpha: 1 } },
    }).composite([{ input: sheet, top: 0, left: 0 }]).png().toBuffer();

    // Per-NPC review (left = dark bg, right = grass).
    const review = await sharp({
      create: { width: W * 2 + 8, height: H, channels: 4, background: { r: 26, g: 0, b: 51, alpha: 1 } },
    })
      .composite([
        { input: onDark, top: 0, left: 0 },
        { input: onGrass, top: 0, left: W + 8 },
      ])
      .png().toBuffer();
    await fs.writeFile(path.join(REVIEW_DIR, `${id}-review.png`), review);

    cells.push({ id, onDark, onGrass, W, H });
    console.log(`  ${id}: ${W}×${H}`);
  }

  // Build grid: 2 columns × ceil(N/2) rows.
  // Each row shows: [name label area] [onDark] [onGrass]
  // Simpler: 5×2 grid of "onGrass", each cell labeled below.
  const COLS = 5;
  const ROWS = Math.ceil(cells.length / COLS);
  const CELL_W = cells[0].W;
  const CELL_H = cells[0].H + 14; // extra room for label
  const PAD = 8;
  const W = COLS * CELL_W + (COLS + 1) * PAD;
  const H = ROWS * CELL_H + (ROWS + 1) * PAD;

  // Render labels via SVG → buffer.
  const composite = [];
  for (let i = 0; i < cells.length; i++) {
    const cx = i % COLS, cy = Math.floor(i / COLS);
    const x = PAD + cx * (CELL_W + PAD);
    const y = PAD + cy * (CELL_H + PAD);
    composite.push({ input: cells[i].onGrass, left: x, top: y });
    const labelSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="14"><rect width="100%" height="100%" fill="rgba(10,0,21,0.85)"/><text x="50%" y="11" font-family="monospace" font-size="10" fill="#ffd700" text-anchor="middle">${cells[i].id}</text></svg>`,
    );
    composite.push({ input: labelSvg, left: x, top: y + cells[i].H });
  }

  const gridPath = path.join(REVIEW_DIR, 'grid.png');
  await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 26, g: 0, b: 51, alpha: 1 } },
  }).composite(composite).png().toFile(gridPath);

  console.log(`\n✅ ${cells.length} NPC review images written to ${REVIEW_DIR}`);
  console.log(`   grid → ${gridPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
