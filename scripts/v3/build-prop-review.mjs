#!/usr/bin/env node
// Build a review grid for V3 themed props. Each prop is shown on a 96×96 swatch
// of FM grass+stone background so we can judge how it sits in-world.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PROP_DIR = path.join(ROOT, 'public/sanctuary-v3/props');
const TILESET = path.join(ROOT, 'public/sanctuary-v3/tilesets/forgotten-memories/tileset.png');
const REVIEW_DIR = path.join(ROOT, 'public/sanctuary-v3/_review/all-props');

const SWATCH = 96;     // each cell is 96×96 + 14 label
const LABEL_H = 14;
const PAD = 8;
const COLS = 5;

async function makeBg(w, h) {
  const grass = await sharp(TILESET).extract({ left: 32, top: 0, width: 32, height: 32 }).toBuffer();
  const stone = await sharp(TILESET).extract({ left: 32, top: 64, width: 32, height: 32 }).toBuffer();
  // Mixed: top-half grass, bottom-half stone path so we see both.
  const composite = [];
  for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) {
    const tile = (y < h / 2) ? grass : stone;
    composite.push({ input: tile, left: x, top: y });
  }
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite(composite).png().toBuffer();
}

async function main() {
  await fs.mkdir(REVIEW_DIR, { recursive: true });
  let entries;
  try {
    entries = (await fs.readdir(PROP_DIR)).filter(f => f.endsWith('.png')).sort();
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log('no props/ folder yet'); return;
    }
    throw e;
  }
  if (!entries.length) { console.log('no props yet'); return; }

  const rows = Math.ceil(entries.length / COLS);
  const W = COLS * SWATCH + (COLS + 1) * PAD;
  const H = rows * (SWATCH + LABEL_H) + (rows + 1) * PAD;

  const composite = [];
  for (let i = 0; i < entries.length; i++) {
    const f = entries[i];
    const id = f.replace(/\.png$/, '');
    const propRaw = await fs.readFile(path.join(PROP_DIR, f));
    const propMeta = await sharp(propRaw).metadata();

    // Center prop in a 96×96 grass+stone swatch.
    const bg = await makeBg(SWATCH, SWATCH);
    const left = Math.floor((SWATCH - propMeta.width) / 2);
    const top  = Math.floor((SWATCH - propMeta.height) / 2);
    const cell = await sharp(bg)
      .composite([{ input: propRaw, top, left }])
      .png().toBuffer();

    const cx = i % COLS, cy = Math.floor(i / COLS);
    const x = PAD + cx * (SWATCH + PAD);
    const y = PAD + cy * (SWATCH + LABEL_H + PAD);
    composite.push({ input: cell, left: x, top: y });

    const labelSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${SWATCH}" height="${LABEL_H}"><rect width="100%" height="100%" fill="rgba(10,0,21,0.85)"/><text x="50%" y="11" font-family="monospace" font-size="9" fill="#ffd700" text-anchor="middle">${id}</text></svg>`,
    );
    composite.push({ input: labelSvg, left: x, top: y + SWATCH });

    console.log(`  ${id}: ${propMeta.width}×${propMeta.height}`);
  }

  const grid = path.join(REVIEW_DIR, 'grid.png');
  await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 26, g: 0, b: 51, alpha: 1 } },
  }).composite(composite).png().toFile(grid);

  console.log(`\n✅ ${entries.length} prop review composed → ${grid}`);
}

main().catch(e => { console.error(e); process.exit(1); });
