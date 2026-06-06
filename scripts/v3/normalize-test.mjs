#!/usr/bin/env node
// Run normalize on the 3 already-generated spawn-fox raw outputs without RD spend.
// Outputs side-by-side: raw + normalized + bg-overlaid (on FM grass tile) for review.

import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import { normalize } from './lib/normalize.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PALETTE_PATH = path.join(ROOT, 'public/sanctuary-v3/palettes/forgotten-memories.txt');
const TILESET_PATH = path.join(ROOT, 'public/sanctuary-v3/tilesets/forgotten-memories/tileset.png');
const OUT_DIR = path.join(ROOT, 'scripts/v3/tmp/review');

async function makeGrassBg(w, h) {
  // Crop a 32×32 grass tile from the FM tileset (top-left area is grass).
  const tile = await sharp(TILESET_PATH)
    .extract({ left: 32, top: 0, width: 32, height: 32 })
    .toBuffer();
  // Tile it to fill w×h.
  const tilesX = Math.ceil(w / 32);
  const tilesY = Math.ceil(h / 32);
  const composite = [];
  for (let y = 0; y < tilesY; y++) {
    for (let x = 0; x < tilesX; x++) {
      composite.push({ input: tile, left: x * 32, top: y * 32 });
    }
  }
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite(composite)
    .png()
    .toBuffer();
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  for (let attempt = 1; attempt <= 3; attempt++) {
    const rawPath = path.join(ROOT, `scripts/v3/tmp/spawn-fox-attempt${attempt}-raw.png`);
    const cleanPath = path.join(OUT_DIR, `attempt${attempt}-clean.png`);

    try { await fs.access(rawPath); } catch { console.log(`skip ${rawPath} (not found)`); continue; }

    console.log(`\n--- attempt ${attempt} ---`);
    const r = await normalize({
      input: rawPath,
      output: cleanPath,
      palettePath: PALETTE_PATH,
      assetClass: 'npc',
    });
    console.log(`  pass=${r.pass}, reasons=${r.reasons.join(' | ') || 'none'}`);
    console.log(`  metrics: opaque=${r.metrics.opaque} accent=${(r.metrics.fracAccent*100).toFixed(2)}% AA=${(r.metrics.fracAA*100).toFixed(1)}% snapFar=${(r.metrics.fracFar*100).toFixed(1)}%`);

    // Compose review image: top half = raw, bottom half = normalized on FM grass.
    const meta = await sharp(rawPath).metadata();
    const W = meta.width, H = meta.height;
    const grass = await makeGrassBg(W, H);
    const overlay = await sharp(cleanPath).png().toBuffer();
    const onGrass = await sharp(grass)
      .composite([{ input: overlay, top: 0, left: 0 }])
      .png()
      .toBuffer();

    const reviewPath = path.join(OUT_DIR, `attempt${attempt}-review.png`);
    await sharp({ create: { width: W * 2 + 8, height: H, channels: 4, background: { r: 26, g: 0, b: 51, alpha: 1 } } })
      .composite([
        { input: await fs.readFile(rawPath), left: 0, top: 0 },
        { input: onGrass, left: W + 8, top: 0 },
      ])
      .png()
      .toFile(reviewPath);
    console.log(`  review (raw | normalized on grass) → ${reviewPath}`);

    // Also copy the raw + clean alone for inspection.
    await fs.copyFile(rawPath, path.join(OUT_DIR, `attempt${attempt}-raw.png`));
  }

  console.log(`\n✅ all review images in ${OUT_DIR}`);
  console.log(`open them with any image viewer; raw=left, normalized-on-grass=right.`);
}

main().catch(e => { console.error(e); process.exit(1); });
