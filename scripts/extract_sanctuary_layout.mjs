#!/usr/bin/env node
// Extract DOORS and COLLISION from Sanctuary_map_marked.png.
// - Red marks = non-walkable boundary (outlines enclosing regions).
// - Green marks = door rectangles (one per building entry).
// Strategy:
//   1. Classify each pixel as red | green | other via thresholds.
//   2. Dilate red by 1px to close any tiny gaps in the hand-drawn outline.
//   3. At 16×16 cell resolution, flood-fill walkable cells from the player
//      spawn through cells that do NOT contain red pixels.
//   4. Any cell the flood didn't reach is non-walkable → collision.
//   5. Greedy-pack blocked cells into rectangles (horizontal runs, extended
//      vertically while row signatures match).
//   6. Find connected components of green pixels, bounding-box each, and
//      match to the nearest room center.
import sharp from 'sharp';
import fs from 'node:fs';

const INPUT = '/opt/star_world_order/DEV/public/sanctuary/Sanctuary_map_marked.png';
const OUT = '/tmp/extracted-layout.txt';
const CELL = 8;
const SPAWN = { x: 724, y: 700 };

const ROOM_CENTERS = {
  'Hot Springs': [200, 220],
  'Observatory': [720, 140],
  'Training Grounds': [1100, 200],
  'Nebula Kitchen': [180, 580],
  'Cosmic Library': [1060, 600],
  'Dream Hollow': [220, 830],
  'Aura Forge': [1320, 650],
};
const MIN_BLOB_PIXELS = 1000;

async function main() {
  const img = sharp(INPUT).ensureAlpha();
  const meta = await img.metadata();
  const W = meta.width;
  const H = meta.height;
  const buf = await img.raw().toBuffer();
  const ch = buf.length / (W * H);
  console.log(`image ${W}x${H}, ${ch} channels, ${buf.length} bytes`);

  // Classify. Using tolerant thresholds for hand-drawn marker tones.
  // Red: R strong, G/B weak
  // Green: G strong, R/B weak
  const RED = 1, GREEN = 2;
  const cls = new Uint8Array(W * H);
  let redCount = 0, greenCount = 0;
  for (let i = 0; i < W * H; i++) {
    const r = buf[i * ch], g = buf[i * ch + 1], b = buf[i * ch + 2];
    if (r > 150 && g < 100 && b < 100) { cls[i] = RED; redCount++; }
    else if (g > 130 && r < 110 && b < 110) { cls[i] = GREEN; greenCount++; }
  }
  console.log(`red pixels=${redCount} green pixels=${greenCount}`);

  // Pixel-level flood fill from spawn through non-red pixels.
  // This preserves thin paths that cell-level flooding would close off.
  const walkablePx = new Uint8Array(W * H);
  const sx = SPAWN.x, sy = SPAWN.y;
  if (cls[sy * W + sx] === RED) {
    console.error('spawn pixel is red — aborting'); process.exit(1);
  }
  const stack = new Int32Array(W * H);
  let top = 0;
  stack[top++] = sy * W + sx;
  walkablePx[sy * W + sx] = 1;
  while (top > 0) {
    const idx = stack[--top];
    const py = (idx / W) | 0;
    const px = idx - py * W;
    // 4-connectivity
    if (px > 0)       { const ni = idx - 1; if (!walkablePx[ni] && cls[ni] !== RED) { walkablePx[ni] = 1; stack[top++] = ni; } }
    if (px < W - 1)   { const ni = idx + 1; if (!walkablePx[ni] && cls[ni] !== RED) { walkablePx[ni] = 1; stack[top++] = ni; } }
    if (py > 0)       { const ni = idx - W; if (!walkablePx[ni] && cls[ni] !== RED) { walkablePx[ni] = 1; stack[top++] = ni; } }
    if (py < H - 1)   { const ni = idx + W; if (!walkablePx[ni] && cls[ni] !== RED) { walkablePx[ni] = 1; stack[top++] = ni; } }
  }
  let walkablePxCount = 0;
  for (let i = 0; i < walkablePx.length; i++) walkablePxCount += walkablePx[i];
  console.log(`walkable pixels: ${walkablePxCount} / ${W*H}`);

  // Down-sample to CELL × CELL grid.  A cell is WALKABLE if the majority
  // of its pixels are walkable (excluding red line itself).
  const gW = Math.ceil(W / CELL);
  const gH = Math.ceil(H / CELL);
  const reached = new Uint8Array(gW * gH);
  for (let gy = 0; gy < gH; gy++) {
    for (let gx = 0; gx < gW; gx++) {
      let w = 0, total = 0;
      const y1 = Math.min(H, (gy + 1) * CELL);
      const x1 = Math.min(W, (gx + 1) * CELL);
      for (let y = gy * CELL; y < y1; y++) {
        for (let x = gx * CELL; x < x1; x++) {
          total++;
          if (walkablePx[y * W + x]) w++;
        }
      }
      reached[gy * gW + gx] = (w * 2 > total) ? 1 : 0;
    }
  }
  let reachedCount = 0;
  for (let i = 0; i < reached.length; i++) reachedCount += reached[i];
  console.log(`walkable cells: ${reachedCount} / ${gW * gH} (${CELL}px cells)`);

  // Greedy-pack blocked cells into rects. Horizontal run → extend vertically.
  const processed = new Uint8Array(gW * gH);
  const rects = [];
  const isBlocked = (gx, gy) => !reached[gy * gW + gx];
  for (let gy = 0; gy < gH; gy++) {
    let gx = 0;
    while (gx < gW) {
      if (processed[gy * gW + gx] || !isBlocked(gx, gy)) { gx++; continue; }
      let endX = gx;
      while (endX + 1 < gW && isBlocked(endX + 1, gy) && !processed[gy * gW + endX + 1]) endX++;
      let endY = gy;
      while (endY + 1 < gH) {
        let ok = true;
        for (let tx = gx; tx <= endX; tx++) {
          if (!isBlocked(tx, endY + 1) || processed[(endY + 1) * gW + tx]) { ok = false; break; }
        }
        if (!ok) break;
        endY++;
      }
      for (let ty = gy; ty <= endY; ty++) {
        for (let tx = gx; tx <= endX; tx++) processed[ty * gW + tx] = 1;
      }
      rects.push({
        x: gx * CELL,
        y: gy * CELL,
        w: (endX - gx + 1) * CELL,
        h: (endY - gy + 1) * CELL,
      });
      gx = endX + 1;
    }
  }
  console.log(`collision rects: ${rects.length}`);

  // Green connected components.
  const visited = new Uint8Array(W * H);
  const greens = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (cls[i] !== GREEN || visited[i]) continue;
      let minX = x, maxX = x, minY = y, maxY = y, pixels = 0;
      const stack = [i];
      visited[i] = 1;
      while (stack.length) {
        const ci = stack.pop();
        const cy = Math.floor(ci / W), cx = ci - cy * W;
        pixels++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (!visited[ni] && cls[ni] === GREEN) { visited[ni] = 1; stack.push(ni); }
        }
      }
      if (pixels >= MIN_BLOB_PIXELS) {
        greens.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, pixels });
      }
    }
  }
  console.log(`green blobs: ${greens.length}`);
  for (const g of greens) {
    const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
    let best = null, bestDist = Infinity;
    for (const [name, [rx, ry]] of Object.entries(ROOM_CENTERS)) {
      const d = Math.hypot(cx - rx, cy - ry);
      if (d < bestDist) { bestDist = d; best = name; }
    }
    g.room = best;
    console.log(`  door at (${g.x},${g.y}) ${g.w}x${g.h} pixels=${g.pixels} → ${best}`);
  }

  // Emit TS snippets.
  const out = [];
  out.push('// ==== DOORS ====');
  for (const g of greens) {
    out.push(`  { room: '${g.room}', x: ${g.x}, y: ${g.y}, w: ${g.w}, h: ${g.h} },`);
  }
  out.push('');
  out.push('// ==== COLLISION ====');
  for (const r of rects) {
    out.push(`  { x: ${r.x}, y: ${r.y}, w: ${r.w}, h: ${r.h} },`);
  }
  fs.writeFileSync(OUT, out.join('\n'));
  console.log(`wrote ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
