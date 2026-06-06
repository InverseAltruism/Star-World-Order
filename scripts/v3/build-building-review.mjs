#!/usr/bin/env node
// Build a review grid for V3 building exteriors. Each is shown on a 192×192
// FM grass swatch so we can judge how it sits in-world.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'public/sanctuary-v3/buildings');
const TILESET = path.join(ROOT, 'public/sanctuary-v3/tilesets/forgotten-memories/tileset.png');
const REVIEW_DIR = path.join(ROOT, 'public/sanctuary-v3/_review/all-buildings');

const SWATCH = 192;
const LABEL_H = 16;
const PAD = 12;
const COLS = 4;

async function makeGrass(w, h) {
  const tile = await sharp(TILESET).extract({ left: 32, top: 0, width: 32, height: 32 }).toBuffer();
  const composite = [];
  for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) {
    composite.push({ input: tile, left: x, top: y });
  }
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite(composite).png().toBuffer();
}

async function main() {
  await fs.mkdir(REVIEW_DIR, { recursive: true });
  const entries = (await fs.readdir(DIR).catch(() => [])).filter(f => f.endsWith('.png')).sort();
  if (!entries.length) { console.log('no buildings yet'); return; }

  const rows = Math.ceil(entries.length / COLS);
  const W = COLS * SWATCH + (COLS + 1) * PAD;
  const H = rows * (SWATCH + LABEL_H) + (rows + 1) * PAD;
  const composite = [];

  for (let i = 0; i < entries.length; i++) {
    const f = entries[i];
    const id = f.replace(/\.png$/, '');
    const raw = await fs.readFile(path.join(DIR, f));
    const meta = await sharp(raw).metadata();

    const bg = await makeGrass(SWATCH, SWATCH);
    const left = Math.floor((SWATCH - meta.width) / 2);
    // Place the building so its base sits ~16px above the cell bottom (visually grounded).
    const top  = Math.max(0, SWATCH - meta.height - 16);
    const cell = await sharp(bg).composite([{ input: raw, top, left }]).png().toBuffer();

    const cx = i % COLS, cy = Math.floor(i / COLS);
    const x = PAD + cx * (SWATCH + PAD);
    const y = PAD + cy * (SWATCH + LABEL_H + PAD);
    composite.push({ input: cell, left: x, top: y });

    const labelSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${SWATCH}" height="${LABEL_H}"><rect width="100%" height="100%" fill="rgba(10,0,21,0.85)"/><text x="50%" y="12" font-family="monospace" font-size="11" fill="#ffd700" text-anchor="middle">${id}</text></svg>`,
    );
    composite.push({ input: labelSvg, left: x, top: y + SWATCH });

    console.log(`  ${id}: ${meta.width}×${meta.height}`);
  }

  const grid = path.join(REVIEW_DIR, 'grid.png');
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 26, g: 0, b: 51, alpha: 1 } } })
    .composite(composite).png().toFile(grid);

  console.log(`\n✅ ${entries.length} building review composed → ${grid}`);
}

main().catch(e => { console.error(e); process.exit(1); });
