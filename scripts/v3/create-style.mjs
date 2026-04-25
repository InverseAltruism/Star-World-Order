#!/usr/bin/env node
// One-shot: create the SWO custom Retro Diffusion user style locked to the
// Forgotten Memories baseline. Saves the returned prompt_style to scripts/v3/style-id.txt.
//
// Run with: RD_API_KEY=... node scripts/v3/create-style.mjs
//
// If the style already exists (style-id.txt present), prints the saved ID and exits.
// To recreate, delete scripts/v3/style-id.txt first.

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createStyle, fileToBase64 } from './lib/rd-client.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const STYLE_FILE = path.join(import.meta.dirname, 'style-id.txt');
const REFERENCE_PNG_OUT = path.join(import.meta.dirname, 'tmp', 'style-reference.png');

const NAME = 'SWO Forgotten Sanctuary';
const ICON = 'forest';
const TEMPLATE = `Top-down 2D pixel-art RPG asset in a modern 16-bit / Game Boy Advance JRPG tileset style. Orthographic top-down camera with slight SNES-style object depth, not isometric and not side-view. 32x32 modular tile logic. Muted earthy fantasy palette: olive green grass, dusty brown dirt, beige broken stone paths, ochre and burnt-orange autumn foliage, teal-blue fantasy trees, soft muted blue water, gray-purple old fences. Handcrafted pixel-art look with crisp hard pixel edges, no anti-aliasing, no blur, no painterly gradients. Limited-palette shading, hand-placed pixel clusters, subtle dithering, chunky shadows, readable silhouettes. Forgotten magical forest sanctuary atmosphere. Subtle cosmic star accents only as small pixel clusters of antique gold or soft lavender, never neon. {prompt}`;

const LLM_INSTRUCTIONS = `Match the Forgotten Memories 32x32 tileset baseline exactly: muted earthy palette, hand-placed pixel clusters, no anti-aliasing, no painterly gradients, slight SNES-style depth on upright objects only. Cosmic accents must be tiny pixel clusters, never glow halos.`;

/**
 * Build a 256×256 reference image by stitching crops from the Forgotten Memories
 * tileset. The crops are picked manually from sections that show grass, stone path,
 * fence, autumn tree foliage, and the cyan fantasy tree — i.e. one picture that
 * encodes the whole palette and shading approach in 256×256.
 *
 * If we can't find good crops, we fall back to a downsampled tileset.png so the
 * reference at least encodes the pack's palette.
 */
async function buildReferenceImage() {
  const tilesetPath = path.join(ROOT, 'public/sanctuary-v3/tilesets/forgotten-memories/tileset.png');
  const treesPath = path.join(ROOT, 'public/sanctuary-v3/tilesets/forgotten-memories/trees_separated.png');
  const propsPath = path.join(ROOT, 'public/sanctuary-v3/tilesets/forgotten-memories/props.png');

  // Compose a 256×256 reference: top half from the main tileset (grass/stone/fence area),
  // bottom-left from trees_separated, bottom-right from props.
  // The exact crop boxes are best-effort; we just want the model to "smell" the style.
  const main = await sharp(tilesetPath)
    .extract({ left: 0, top: 0, width: 512, height: 256 })
    .resize(256, 128, { kernel: sharp.kernel.nearest })
    .toBuffer();
  const trees = await sharp(treesPath)
    .extract({ left: 0, top: 0, width: 280, height: 320 })
    .resize(128, 128, { kernel: sharp.kernel.nearest })
    .toBuffer();
  const props = await sharp(propsPath)
    .extract({ left: 0, top: 0, width: 256, height: 256 })
    .resize(128, 128, { kernel: sharp.kernel.nearest })
    .toBuffer();

  const composed = await sharp({
    create: { width: 256, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: main, top: 0, left: 0 },
      { input: trees, top: 128, left: 0 },
      { input: props, top: 128, left: 128 },
    ])
    // RD requires reference_images to be RGB (no transparency).
    .removeAlpha()
    .png()
    .toFile(REFERENCE_PNG_OUT);

  return REFERENCE_PNG_OUT;
}

async function main() {
  // Idempotency: skip if we've already created the style.
  try {
    const existing = (await fs.readFile(STYLE_FILE, 'utf8')).trim();
    if (existing) {
      console.log(`style already created: ${existing}`);
      console.log(`(delete ${STYLE_FILE} to recreate)`);
      return;
    }
  } catch { /* fall through */ }

  await fs.mkdir(path.dirname(REFERENCE_PNG_OUT), { recursive: true });

  console.log('building 256×256 reference image from Forgotten Memories crops...');
  await buildReferenceImage();
  console.log(`  → ${REFERENCE_PNG_OUT}`);

  const refB64 = await fileToBase64(REFERENCE_PNG_OUT);

  console.log('POST /v1/styles ...');
  // Note: min_width/min_height are FORCED dimensions per RD docs — setting them
  // locks the style to that exact size (e.g. 96 → only accepts 96×96). Omit
  // them so the style accepts any size in the RD Pro range (64–256).
  const res = await createStyle({
    name: NAME,
    style_icon: ICON,
    description: 'Sanctuary V3 — locked to the Forgotten Memories 32x32 baseline.',
    reference_images: [refB64],
    user_prompt_template: TEMPLATE,
    apply_prompt_fixer: true,
    llm_instructions: LLM_INSTRUCTIONS,
    force_palette: false,
    force_bg_removal: false,
  });

  const promptStyle = res?.prompt_style;
  if (!promptStyle) {
    console.error('no prompt_style in response:', JSON.stringify(res, null, 2));
    process.exit(1);
  }

  await fs.writeFile(STYLE_FILE, promptStyle + '\n', 'utf8');
  console.log(`✅ style created. saved → ${STYLE_FILE}`);
  console.log(`   id: ${res.id}`);
  console.log(`   prompt_style: ${promptStyle}`);
}

main().catch(err => {
  console.error('FAILED:', err.message);
  if (err.body) console.error('body:', JSON.stringify(err.body, null, 2));
  process.exit(1);
});
