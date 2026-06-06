#!/usr/bin/env node
// Matte companion sprite backgrounds.
//
// Scans public/sanctuary/companions/<constellation>/<mood>.png, detects the
// dominant opaque corner color in each PNG, and replaces pixels within a
// small RGB tolerance with full transparency. Pixels that are already alpha=0
// are skipped; fringe pixels (partial alpha) are left alone so antialiasing
// around the sprite silhouette is preserved.
//
// Usage:
//   node scripts/matte_companion_sprites.mjs           # dry run, report only
//   node scripts/matte_companion_sprites.mjs --write   # write changes in-place
//   node scripts/matte_companion_sprites.mjs --write --tolerance 20
//   node scripts/matte_companion_sprites.mjs --dir custom/path --write
//
// Why: operator-exported sprites occasionally ship with opaque backgrounds
// (e.g. a solid purple matte behind the character). This script removes that
// matte so the sprites composite cleanly in-game.

import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_DIR = 'public/sanctuary/companions';
const DEFAULT_TOLERANCE = 15;
const ALPHA_OPAQUE = 200;      // treat alpha >= this as "background candidate"
const CORNER_OPAQUE = 32;      // corner alpha below this means "already transparent"

function parseArgs(argv) {
  const args = { dir: DEFAULT_DIR, tolerance: DEFAULT_TOLERANCE, write: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') args.write = true;
    else if (a === '--tolerance') args.tolerance = Number(argv[++i]);
    else if (a === '--dir') args.dir = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log(
        'matte_companion_sprites.mjs — removes opaque corner-color background from companion sprites\n' +
        '\nOptions:\n' +
        '  --write              write changes in-place (default: dry run)\n' +
        '  --tolerance <n>      RGB distance tolerance per channel (default 15)\n' +
        '  --dir <path>         root companions dir (default public/sanctuary/companions)\n'
      );
      process.exit(0);
    }
  }
  return args;
}

async function listPngs(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const sub = path.join(root, e.name);
    const files = await fs.readdir(sub);
    for (const f of files) {
      if (f.toLowerCase().endsWith('.png')) out.push(path.join(sub, f));
    }
  }
  return out.sort();
}

// Pick the opaque corner color that appears most often across the four corners.
// Returns null if no corner is opaque (already-transparent PNG).
function dominantCornerColor(buf, width, height) {
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  const counts = new Map();
  for (const [x, y] of corners) {
    const i = (y * width + x) * 4;
    const a = buf[i + 3];
    if (a < CORNER_OPAQUE) continue;
    const key = `${buf[i]},${buf[i + 1]},${buf[i + 2]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (counts.size === 0) return null;
  let best = null, bestCount = -1;
  for (const [k, c] of counts) {
    if (c > bestCount) { best = k; bestCount = c; }
  }
  const [r, g, b] = best.split(',').map(Number);
  return { r, g, b };
}

function matchesBackground(buf, i, bg, tol) {
  return (
    Math.abs(buf[i] - bg.r) <= tol &&
    Math.abs(buf[i + 1] - bg.g) <= tol &&
    Math.abs(buf[i + 2] - bg.b) <= tol
  );
}

async function processFile(file, { tolerance, write }) {
  const input = sharp(file).ensureAlpha();
  const meta = await input.metadata();
  const { width, height } = meta;
  const raw = await input.raw().toBuffer();
  const buf = Buffer.from(raw);
  const total = width * height;

  const bg = dominantCornerColor(buf, width, height);
  if (!bg) {
    return { file, skipped: 'already-transparent', changed: 0, total };
  }

  let changed = 0;
  for (let i = 0; i < total; i++) {
    const off = i * 4;
    const a = buf[off + 3];
    if (a < ALPHA_OPAQUE) continue;
    if (!matchesBackground(buf, off, bg, tolerance)) continue;
    buf[off + 3] = 0;
    changed++;
  }

  if (changed === 0) {
    return { file, skipped: 'no-match', changed: 0, total, bg };
  }

  if (write) {
    await sharp(buf, { raw: { width, height, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toFile(file);
  }

  return { file, changed, total, bg, wrote: write };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = await listPngs(args.dir);
  if (files.length === 0) {
    console.error(`No PNGs found under ${args.dir}`);
    process.exit(1);
  }

  console.log(
    `Scanning ${files.length} PNG(s) under ${args.dir} ` +
    `(tolerance=${args.tolerance}, ${args.write ? 'WRITE' : 'dry-run'})`
  );

  let skippedTransparent = 0;
  let skippedNoMatch = 0;
  let modified = 0;
  let totalChanged = 0;

  for (const f of files) {
    const r = await processFile(f, args);
    if (r.skipped === 'already-transparent') {
      skippedTransparent++;
      console.log(`  skip (transparent corners): ${f}`);
    } else if (r.skipped === 'no-match') {
      skippedNoMatch++;
      console.log(
        `  skip (no matching pixels, bg=${r.bg.r},${r.bg.g},${r.bg.b}): ${f}`
      );
    } else {
      modified++;
      totalChanged += r.changed;
      const pct = ((r.changed / r.total) * 100).toFixed(1);
      console.log(
        `  ${r.wrote ? 'wrote' : 'would matte'} ${r.changed}/${r.total} px ` +
        `(${pct}%, bg=${r.bg.r},${r.bg.g},${r.bg.b}): ${f}`
      );
    }
  }

  console.log('');
  console.log(
    `Summary: ${modified} file(s) ${args.write ? 'modified' : 'would be modified'} ` +
    `(${totalChanged} total px), ` +
    `${skippedTransparent} already transparent, ${skippedNoMatch} no-match.`
  );
  if (!args.write && modified > 0) {
    console.log('Dry run — re-run with --write to apply.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
