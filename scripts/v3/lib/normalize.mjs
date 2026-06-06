// Normalize / QA pipeline for V3 assets — the slop-killer.
//
// Contract: take a raw RD output PNG, produce a cleaned PNG that:
//   - has only colors from the master palette (snapped to nearest)
//   - has binary alpha (0 or 255)
//   - has no soft anti-aliasing mush
//   - has no pure black outlines
//   - (per-asset-class) caps cosmic accent colors
//
// Returns a result object with verdict (pass/reject), reasons, and metrics.

import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// ----- Palette helpers ------------------------------------------------------

/** Parse hex like #ab12cd → [171, 18, 205]. */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`bad hex: ${hex}`);
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Load a palette txt file (one #rrggbb per line, # or comment lines ignored). */
export async function loadPalette(palettePath) {
  const text = await fs.readFile(palettePath, 'utf8');
  const colors = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) {
      // '#' alone or '# comment' is comment; '#rrggbb' is a color.
      if (/^#[0-9a-f]{6}$/i.test(line)) colors.push(hexToRgb(line));
      continue;
    }
    if (/^[0-9a-f]{6}$/i.test(line)) colors.push(hexToRgb('#' + line));
  }
  if (!colors.length) throw new Error(`no colors loaded from ${palettePath}`);
  return colors;
}

/** Manhattan distance in RGB. */
function manhattan(r1, g1, b1, r2, g2, b2) {
  return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
}

/** Find nearest palette color and its distance. */
function snap(r, g, b, palette) {
  let bestIdx = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i];
    const d = manhattan(r, g, b, pr, pg, pb);
    if (d < bestD) { bestD = d; bestIdx = i; if (d === 0) break; }
  }
  return { idx: bestIdx, distance: bestD };
}

// ----- Cosmic accent colors (must come from the V3 doc §4.2) ---------------

const COSMIC_ACCENTS = [
  hexToRgb('#d4a445'),  // antique gold
  hexToRgb('#a08cc0'),  // soft lavender
  hexToRgb('#8ec4cc'),  // crystal cyan-bright
  hexToRgb('#e4ddc4'),  // star white
  hexToRgb('#6e5d8a'),  // nebula faint violet
];

function isCosmicAccent(r, g, b, tolerance = 32) {
  for (const [ar, ag, ab] of COSMIC_ACCENTS) {
    if (manhattan(r, g, b, ar, ag, ab) <= tolerance) return true;
  }
  return false;
}

// ----- Per-class thresholds ------------------------------------------------

export const ASSET_CLASS_THRESHOLDS = {
  // Strict: terrain tiles and props must be earthy with tiny accents.
  tile:     { snap: true,  paletteSnapMaxFrac: 0.05, snapMaxDist: 24, aaMaxFrac: 0.40, accentMaxFrac: 0.02, blackMaxFrac: 0.005, bboxMinFrac: 0.10 },
  // Props: include explicitly themed SWO items (moon lantern, crystal anvil,
  // floating stone) where antique-gold/lavender accent pixels are *intentional*.
  // Cap at 12% — that's enough headroom for a small magical glow cluster
  // without permitting "the whole prop is one neon color".
  prop:     { snap: true,  paletteSnapMaxFrac: 0.05, snapMaxDist: 24, aaMaxFrac: 0.40, accentMaxFrac: 0.12, blackMaxFrac: 0.005, bboxMinFrac: 0.20 },
  // NPCs: animation endpoints can't accept input_palette and the model produces
  // its own consistent pixel-art palette. Forcing FM-snap darkens characters
  // unnecessarily, so we DO NOT palette-snap NPCs by default — only run alpha,
  // AA, accent, and bbox guardrails. The model's palette is treated as
  // intentional and harmonious-with-FM rather than identical-to-FM.
  npc:      { snap: false, paletteSnapMaxFrac: 1.00, snapMaxDist: 999, aaMaxFrac: 0.60, accentMaxFrac: 0.40, blackMaxFrac: 0.005, bboxMinFrac: 0.30 },
  // Buildings: large multi-tile objects, many wall/roof tones; accents on banners ok.
  building: { snap: true,  paletteSnapMaxFrac: 0.08, snapMaxDist: 28, aaMaxFrac: 0.45, accentMaxFrac: 0.05, blackMaxFrac: 0.005, bboxMinFrac: 0.30 },
};

// ----- The normalize step --------------------------------------------------

/**
 * Run normalize + QA on a PNG.
 *
 * @param {object} opts
 * @param {string} opts.input    Path to raw input PNG.
 * @param {string} opts.output   Path to write cleaned PNG.
 * @param {string} opts.palettePath  Path to palette .txt.
 * @param {'tile'|'prop'|'npc'|'building'} opts.assetClass
 * @param {boolean} [opts.binaryAlpha=true]  Force alpha to 0 or 255.
 * @param {boolean} [opts.snapToPalette=true]  Quantize to palette.
 * @returns {Promise<{ pass: boolean, reasons: string[], metrics: object, sha256: string }>}
 */
export async function normalize(opts) {
  const {
    input, output, palettePath, assetClass,
    binaryAlpha = true,
    snapToPalette: snapOverride,
  } = opts;
  const t = ASSET_CLASS_THRESHOLDS[assetClass];
  if (!t) throw new Error(`unknown assetClass: ${assetClass}`);
  // Per-class default; explicit option wins.
  const snapToPalette = snapOverride === undefined ? t.snap !== false : snapOverride;

  const palette = await loadPalette(palettePath);

  const img = sharp(input).ensureAlpha();
  const meta = await img.metadata();
  const W = meta.width, H = meta.height;
  const buf = await img.raw().toBuffer();

  let opaque = 0, transparent = 0, halo = 0;
  let aaSuspect = 0, edgeCount = 0;
  let snappedFar = 0;
  let blackPx = 0;
  let accentPx = 0;
  let minX = W, maxX = -1, minY = H, maxY = -1;

  const out = Buffer.alloc(buf.length);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let r = buf[i], g = buf[i + 1], b = buf[i + 2], a = buf[i + 3];

      // Alpha clean: snap to binary; treat very low-alpha edge pixels as transparent.
      if (binaryAlpha) {
        if (a < 32) {
          a = 0;
          if (a !== buf[i + 3]) halo++;
        } else if (a < 220) {
          // soft edge → transparent (we do not allow halos)
          a = 0;
          halo++;
        } else {
          a = 255;
        }
      }

      if (a === 0) {
        out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0;
        transparent++;
        continue;
      }

      // Palette snap (only on opaque pixels).
      let usedR = r, usedG = g, usedB = b;
      if (snapToPalette) {
        const { idx, distance } = snap(r, g, b, palette);
        if (distance > t.snapMaxDist) snappedFar++;
        const [pr, pg, pb] = palette[idx];
        usedR = pr; usedG = pg; usedB = pb;
      }
      out[i] = usedR; out[i + 1] = usedG; out[i + 2] = usedB; out[i + 3] = 255;

      opaque++;
      if (usedR === 0 && usedG === 0 && usedB === 0) blackPx++;
      if (isCosmicAccent(usedR, usedG, usedB)) accentPx++;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // Anti-alias detection on the snapped buffer: count edge pixels that are
  // "soft" (different from neighbors but by small amounts in all directions).
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4;
      if (out[i + 3] === 0) continue;
      const lr = out[i - 4], lg = out[i - 3], lb = out[i - 2], la = out[i - 1];
      const rr = out[i + 4], rg = out[i + 5], rb = out[i + 6], ra = out[i + 7];
      if (la === 0 || ra === 0) continue;
      const dl = manhattan(out[i], out[i + 1], out[i + 2], lr, lg, lb);
      const dr = manhattan(out[i], out[i + 1], out[i + 2], rr, rg, rb);
      if (dl === 0 && dr === 0) continue;
      edgeCount++;
      // "Soft AA mush": both neighbors differ by a small but non-zero amount.
      if (dl > 0 && dl < 96 && dr > 0 && dr < 96) aaSuspect++;
    }
  }

  await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .png({ compressionLevel: 9, palette: false })
    .toFile(output);

  const sha256 = crypto.createHash('sha256').update(await fs.readFile(output)).digest('hex');

  const total = opaque + transparent;
  const opaqueFrac = total ? opaque / total : 0;
  const fracFar = opaque ? snappedFar / opaque : 0;
  const fracBlack = opaque ? blackPx / opaque : 0;
  const fracAccent = opaque ? accentPx / opaque : 0;
  const fracAA = edgeCount ? aaSuspect / edgeCount : 0;
  const bboxArea = maxX < 0 ? 0 : (maxX - minX + 1) * (maxY - minY + 1);
  const fracBbox = (W * H) ? bboxArea / (W * H) : 0;

  const reasons = [];
  if (fracFar > t.paletteSnapMaxFrac) {
    reasons.push(`palette-snap: ${(fracFar * 100).toFixed(2)}% pixels snapped > ${t.snapMaxDist} (max ${(t.paletteSnapMaxFrac * 100).toFixed(0)}%)`);
  }
  if (fracAA > t.aaMaxFrac) {
    reasons.push(`anti-alias: ${(fracAA * 100).toFixed(2)}% edge pixels look like AA mush (max ${(t.aaMaxFrac * 100).toFixed(0)}%)`);
  }
  if (fracBlack > t.blackMaxFrac) {
    reasons.push(`black-pixel: ${(fracBlack * 100).toFixed(2)}% pure-black pixels (max ${(t.blackMaxFrac * 100).toFixed(2)}%)`);
  }
  if (fracAccent > t.accentMaxFrac) {
    reasons.push(`cosmic-accent overdose: ${(fracAccent * 100).toFixed(2)}% accent colors (max ${(t.accentMaxFrac * 100).toFixed(0)}%)`);
  }
  if (fracBbox < t.bboxMinFrac) {
    reasons.push(`bbox tightness: subject occupies ${(fracBbox * 100).toFixed(1)}% of frame (min ${(t.bboxMinFrac * 100).toFixed(0)}%)`);
  }
  if (opaque === 0) {
    reasons.push('empty: no opaque pixels after normalize');
  }

  return {
    pass: reasons.length === 0,
    reasons,
    metrics: {
      width: W, height: H,
      opaque, transparent, halo,
      paletteSnappedFar: snappedFar,
      fracFar, fracAA, fracBlack, fracAccent, fracBbox,
      edgeCount, aaSuspect,
      bbox: maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    },
    sha256,
  };
}
