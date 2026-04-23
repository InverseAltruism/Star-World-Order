#!/usr/bin/env node
// Find each of the 16 characters' bounding box inside the 1254×1254 sheet.
// Outputs per-frame offsets so we can (a) fix the hair-bleed crop and
// (b) horizontally center each character so walking stops looking like a
// side-to-side bob.
import sharp from 'sharp';

const INPUT = '/opt/star_world_order/DEV/public/sanctuary/Male_Grey_Sprite_transparent.png';

async function main() {
  const img = sharp(INPUT).ensureAlpha();
  const { width: W, height: H } = await img.metadata();
  const buf = await img.raw().toBuffer();
  console.log(`sheet ${W}×${H}`);

  // First: find horizontal transparent bands (empty rows) to locate the
  // natural row separators. A row is "empty" if no pixel in it has alpha > 16.
  const rowAlpha = new Uint32Array(H);
  for (let y = 0; y < H; y++) {
    let count = 0;
    for (let x = 0; x < W; x++) {
      if (buf[(y * W + x) * 4 + 3] > 16) count++;
    }
    rowAlpha[y] = count;
  }
  // Find runs of empty rows.
  const empties = [];
  let runStart = -1;
  for (let y = 0; y < H; y++) {
    if (rowAlpha[y] === 0) {
      if (runStart < 0) runStart = y;
    } else if (runStart >= 0) {
      empties.push([runStart, y - 1]);
      runStart = -1;
    }
  }
  if (runStart >= 0) empties.push([runStart, H - 1]);
  console.log(`empty row runs: ${empties.length}`);
  for (const [a, b] of empties) console.log(`  y ${a}..${b}  (len ${b - a + 1})`);

  // Same for columns.
  const colAlpha = new Uint32Array(W);
  for (let x = 0; x < W; x++) {
    let count = 0;
    for (let y = 0; y < H; y++) {
      if (buf[(y * W + x) * 4 + 3] > 16) count++;
    }
    colAlpha[x] = count;
  }
  const colEmpties = [];
  let crs = -1;
  for (let x = 0; x < W; x++) {
    if (colAlpha[x] === 0) {
      if (crs < 0) crs = x;
    } else if (crs >= 0) {
      colEmpties.push([crs, x - 1]);
      crs = -1;
    }
  }
  if (crs >= 0) colEmpties.push([crs, W - 1]);
  console.log(`empty col runs: ${colEmpties.length}`);
  for (const [a, b] of colEmpties) console.log(`  x ${a}..${b}  (len ${b - a + 1})`);

  // If there are clear empty-row gaps we use them as row boundaries;
  // otherwise fall back to even quartering.
  const interiorGaps = empties.filter(([a, b]) => a > 0 && b < H - 1);
  let rowStarts, rowEnds;
  if (interiorGaps.length === 3) {
    rowStarts = [0, interiorGaps[0][1] + 1, interiorGaps[1][1] + 1, interiorGaps[2][1] + 1];
    rowEnds = [interiorGaps[0][0] - 1, interiorGaps[1][0] - 1, interiorGaps[2][0] - 1, H - 1];
    console.log('row starts from gaps:', rowStarts);
    console.log('row ends from gaps:  ', rowEnds);
  } else {
    console.log('no clean row gaps; fallback to quarter slicing');
    rowStarts = [0, 314, 627, 941];
    rowEnds = [312, 626, 940, 1253];
  }

  const colInteriorGaps = colEmpties.filter(([a, b]) => a > 0 && b < W - 1);
  let colStarts, colEnds;
  if (colInteriorGaps.length === 3) {
    colStarts = [0, colInteriorGaps[0][1] + 1, colInteriorGaps[1][1] + 1, colInteriorGaps[2][1] + 1];
    colEnds = [colInteriorGaps[0][0] - 1, colInteriorGaps[1][0] - 1, colInteriorGaps[2][0] - 1, W - 1];
    console.log('col starts from gaps:', colStarts);
    console.log('col ends from gaps:  ', colEnds);
  } else {
    console.log('no clean col gaps; fallback to quarter slicing');
    colStarts = [0, 314, 627, 941];
    colEnds = [312, 626, 940, 1253];
  }

  // For each frame cell, find the character's tight bounding box.
  console.log('');
  console.log('row  col  cellBox               charBBox          charCenterX  charBottom');
  const data = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const y0 = rowStarts[row], y1 = rowEnds[row];
      const x0 = colStarts[col], x1 = colEnds[col];
      let minX = x1, maxX = x0, minY = y1, maxY = y0, pixels = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (buf[(y * W + x) * 4 + 3] > 16) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            pixels++;
          }
        }
      }
      if (pixels === 0) {
        console.log(`${row}    ${col}    empty cell (${x0},${y0})-(${x1},${y1})`);
        continue;
      }
      const cellW = x1 - x0 + 1, cellH = y1 - y0 + 1;
      const charW = maxX - minX + 1, charH = maxY - minY + 1;
      const charCenterX = (minX + maxX) / 2;
      const cellCenterX = (x0 + x1) / 2;
      const horizDrift = (charCenterX - cellCenterX).toFixed(1);
      console.log(
        `${row}    ${col}    ` +
        `(${x0},${y0})-(${x1},${y1}) ${cellW}×${cellH}   ` +
        `(${minX},${minY})-(${maxX},${maxY}) ${charW}×${charH}   ` +
        `drift=${horizDrift}  bottom=${maxY - y0}`
      );
      data.push({ row, col, cellX: x0, cellY: y0, cellW, cellH, charMinX: minX, charMinY: minY, charW, charH, horizDrift: Number(horizDrift) });
    }
  }

  // Summary per row: average character width/height and horizontal drift spread.
  console.log('\nper-row summary (drift range):');
  for (let row = 0; row < 4; row++) {
    const row_data = data.filter(d => d.row === row);
    if (!row_data.length) continue;
    const drifts = row_data.map(d => d.horizDrift);
    console.log(`  row ${row}: drift min=${Math.min(...drifts).toFixed(1)} max=${Math.max(...drifts).toFixed(1)} range=${(Math.max(...drifts)-Math.min(...drifts)).toFixed(1)}px`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
