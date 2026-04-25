#!/usr/bin/env node
// Generate V3 assets per scripts/v3/asset-manifest.json.
//
// Usage:
//   RD_API_KEY=... node scripts/v3/generate.mjs                # cost-check then generate all enabled
//   RD_API_KEY=... node scripts/v3/generate.mjs --only spawn-fox
//   RD_API_KEY=... node scripts/v3/generate.mjs --check-cost    # cost-check only, no spend
//   RD_API_KEY=... node scripts/v3/generate.mjs --force          # skip cost prompt
//
// For each enabled entry:
//   1. (optional) check_cost first; print total; bail unless --yes / --force.
//   2. Call the inference endpoint with the manifest fields + custom user style.
//   3. Write raw output to scripts/v3/tmp/<id>-raw.png.
//   4. Run normalize → public/sanctuary-v3/<output_path>.
//   5. If normalize REJECTS: print reasons, bump seed, retry up to 2 times. After 3 fails total, escalate.
//   6. Append a record to scripts/v3/manifest-status.json.

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { inference, getCredits, fileToBase64, writeFirstImage } from './lib/rd-client.mjs';
import { normalize } from './lib/normalize.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HERE = import.meta.dirname;
const MANIFEST_PATH = path.join(HERE, 'asset-manifest.json');
const STATUS_PATH = path.join(HERE, 'manifest-status.json');
const STYLE_FILE = path.join(HERE, 'style-id.txt');
const TMP_DIR = path.join(HERE, 'tmp');
const PALETTE_PATH = path.join(ROOT, 'public/sanctuary-v3/palettes/forgotten-memories.txt');

const args = new Set(process.argv.slice(2));
const ONLY_FLAG_IDX = process.argv.indexOf('--only');
const ONLY_ID = ONLY_FLAG_IDX > 0 ? process.argv[ONLY_FLAG_IDX + 1] : null;
const CHECK_ONLY = args.has('--check-cost');
const FORCE = args.has('--force') || args.has('--yes');
const MAX_RETRIES = 2;

async function readJson(p) { return JSON.parse(await fs.readFile(p, 'utf8')); }
async function writeJson(p, v) { await fs.writeFile(p, JSON.stringify(v, null, 2) + '\n', 'utf8'); }
async function readMaybeJson(p) {
  try { return await readJson(p); } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

function buildPayload(entry, common, styleId) {
  const fullPrompt = `${common.style_prefix}${entry.prompt}`;
  const payload = {
    prompt: fullPrompt,
    width: entry.width,
    height: entry.height,
    seed: entry.seed,
    num_images: 1,
    prompt_style: entry.prompt_style,
  };
  // Negative-prompt phrasing folded into prompt (RD has no separate field).
  if (common.negative_prompt) payload.prompt = `${payload.prompt} ${common.negative_prompt}`;
  if (entry.remove_bg) payload.remove_bg = true;
  if (entry.return_spritesheet) payload.return_spritesheet = true;

  const isAnimation = entry.prompt_style?.startsWith('rd_animation__');
  if (isAnimation) {
    // Animation endpoints: don't support input_palette or custom user styles,
    // and don't support check_cost. Cost is documented fixed ($0.07).
    payload._wantReferenceImage = true;
  } else {
    // Non-animation: use our locked custom user style + palette.
    if (common.use_input_palette) payload._wantPalette = true;
    if (styleId) payload.prompt_style = styleId;
  }
  return { payload, isAnimation };
}

// Documented fixed prices (RD docs FAQ).
const ANIMATION_FIXED_PRICE = 0.07;

function fmtCost(usd) { return `$${usd.toFixed(2)}`; }

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

async function loadStyleId() {
  try { return (await fs.readFile(STYLE_FILE, 'utf8')).trim(); }
  catch { return null; }
}

async function checkCostFor(entry, common, styleId) {
  const { payload, isAnimation } = buildPayload(entry, common, styleId);
  if (isAnimation) {
    // Animation endpoints don't support check_cost; price is fixed.
    return ANIMATION_FIXED_PRICE;
  }
  payload.check_cost = true;
  delete payload._wantPalette;
  delete payload._wantReferenceImage;
  const res = await inference(payload);
  return res.balance_cost ?? 0;
}

async function runEntry(entry, common, styleId, palettePngPath, referencePngPath) {
  const out = path.join(ROOT, entry.output_path);
  await ensureDir(path.dirname(out));
  await ensureDir(TMP_DIR);

  const palB64 = await fileToBase64(palettePngPath).catch(() => null);
  const refB64 = await fileToBase64(referencePngPath).catch(() => null);

  let attempts = [];
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const seed = entry.seed + attempt;
    const built = buildPayload(entry, common, styleId);
    const payload = built.payload;
    payload.seed = seed;
    if (built.isAnimation && refB64 && payload._wantReferenceImage) {
      payload.input_image = refB64;
    }
    if (!built.isAnimation && palB64 && payload._wantPalette) {
      payload.input_palette = palB64;
    }
    delete payload._wantPalette;
    delete payload._wantReferenceImage;

    console.log(`\n--- ${entry.id} | attempt ${attempt + 1}/${MAX_RETRIES + 1} | seed ${seed} ---`);
    console.log(`POST /v1/inferences ...`);
    let res;
    try {
      res = await inference(payload);
    } catch (e) {
      attempts.push({ attempt: attempt + 1, seed, status: 'api-error', error: e.message });
      console.error(`  API error: ${e.message}`);
      continue;
    }

    const rawPath = path.join(TMP_DIR, `${entry.id}-attempt${attempt + 1}-raw.png`);
    await writeFirstImage(res, rawPath);
    console.log(`  raw → ${rawPath}`);
    console.log(`  cost ${fmtCost(res.balance_cost ?? 0)}, balance ${fmtCost(res.remaining_balance ?? 0)}`);

    console.log(`normalize → ${out}`);
    const normResult = await normalize({
      input: rawPath,
      output: out,
      palettePath: PALETTE_PATH,
      assetClass: entry.asset_class,
    });

    const summary = {
      attempt: attempt + 1,
      seed,
      status: normResult.pass ? 'pass' : 'fail',
      reasons: normResult.reasons,
      metrics: normResult.metrics,
      sha256: normResult.sha256,
      raw: rawPath,
      out: normResult.pass ? out : null,
      cost_balance: res.remaining_balance,
    };
    attempts.push(summary);

    if (normResult.pass) {
      console.log(`  ✅ pass — bbox ${JSON.stringify(normResult.metrics.bbox)}, opaque ${normResult.metrics.opaque}, accent ${(normResult.metrics.fracAccent*100).toFixed(2)}%, AA ${(normResult.metrics.fracAA*100).toFixed(1)}%`);
      return { entry, success: true, attempts, finalPath: out };
    }
    console.log(`  ❌ fail: ${normResult.reasons.join(' | ')}`);
  }
  return { entry, success: false, attempts, finalPath: null };
}

async function main() {
  const manifest = await readJson(MANIFEST_PATH);
  const styleId = await loadStyleId();
  if (!styleId) {
    console.warn('warning: scripts/v3/style-id.txt not found. Run create-style.mjs first to lock the SWO style.');
    console.warn('Continuing with the per-entry prompt_style values (animation styles do not use the custom user style anyway).');
  }
  const palettePngPath = path.join(ROOT, 'public/sanctuary-v3/palettes/forgotten-memories.png');
  const referencePngPath = path.join(HERE, 'tmp', 'style-reference.png');

  let entries = manifest.entries.filter(e => e.enabled);
  if (ONLY_ID) entries = entries.filter(e => e.id === ONLY_ID);
  if (!entries.length) {
    console.log('no enabled entries to generate.');
    if (ONLY_ID) console.log(`(filter: --only ${ONLY_ID})`);
    return;
  }

  console.log(`enabled entries: ${entries.map(e => e.id).join(', ')}`);

  // Cost gate: check_cost for each entry.
  console.log('\n--- cost check ---');
  let totalCost = 0;
  for (const e of entries) {
    const c = await checkCostFor(e, manifest.common, styleId);
    totalCost += c;
    console.log(`  ${e.id.padEnd(24)} ${fmtCost(c)}`);
  }
  const credits = await getCredits();
  console.log(`total estimated: ${fmtCost(totalCost)}`);
  console.log(`current balance: ${fmtCost(credits.balance ?? 0)}, ${credits.credits ?? '-'} credits`);

  if (CHECK_ONLY) { console.log('--check-cost only; exiting.'); return; }

  if (!FORCE) {
    const rl = readline.createInterface({ input, output });
    const ans = await rl.question(`proceed with generation? [y/N] `);
    rl.close();
    if (!/^y/i.test(ans.trim())) { console.log('aborted.'); return; }
  }

  // Run.
  const status = (await readMaybeJson(STATUS_PATH)) || { runs: [] };
  const runRecord = { startedAt: new Date().toISOString(), entries: [] };

  for (const e of entries) {
    const r = await runEntry(e, manifest.common, styleId, palettePngPath, referencePngPath);
    runRecord.entries.push({
      id: e.id,
      success: r.success,
      finalPath: r.finalPath,
      attempts: r.attempts,
    });
  }

  runRecord.finishedAt = new Date().toISOString();
  status.runs.push(runRecord);
  await writeJson(STATUS_PATH, status);

  const ok = runRecord.entries.filter(x => x.success).length;
  const failed = runRecord.entries.filter(x => !x.success);
  console.log(`\n=== run done: ${ok}/${runRecord.entries.length} passed ===`);
  if (failed.length) {
    console.log('failed:');
    for (const f of failed) console.log(`  - ${f.id}: ${f.attempts.at(-1)?.reasons?.join(' | ')}`);
  }
  console.log(`status log → ${STATUS_PATH}`);
}

main().catch(err => {
  console.error('FAILED:', err.message);
  if (err.body) console.error('body:', JSON.stringify(err.body, null, 2));
  process.exit(1);
});
