#!/usr/bin/env node
// Generate V3 assets per scripts/v3/asset-manifest.json.
//
// Usage:
//   RD_API_KEY=... node scripts/v3/generate.mjs                # cost-check then generate all enabled
//   RD_API_KEY=... node scripts/v3/generate.mjs --only spawn-fox
//   RD_API_KEY=... node scripts/v3/generate.mjs --check-cost    # cost-check only, no spend
//   RD_API_KEY=... node scripts/v3/generate.mjs --force         # skip cost prompt
//   RD_DRY_RUN=1   node scripts/v3/generate.mjs --only spawn-fox # no RD POST, stub PNG
//
// Safety rails (see scripts/v3/lib/safety.mjs):
//   - prompt_hash dedup: refuses any entry already in manifest-status.json
//     `approved` index unless --force-regenerate.
//   - process lock at /tmp/rd_v3_generate.lock.
//   - cost caps (env): RD_BATCH_CAP_USD (default 0.50) and RD_DAILY_CAP_USD
//     (default 5.00). --override-cost-cap to proceed past either.
//   - append-only audit log scripts/v3/requested.jsonl for every POST.
//
// For each enabled (or --only) entry:
//   1. compute prompt_hash; skip if already approved.
//   2. (optional) check_cost first; print total; bail unless --yes / --force.
//   3. assert batch + daily caps before any POST.
//   4. Call the inference endpoint with the manifest fields + custom user style.
//   5. Append to requested.jsonl (success + error).
//   6. Write raw output to scripts/v3/tmp/<id>-attempt<N>-raw.png.
//   7. Run normalize → public/sanctuary-v3/<output_path>.
//   8. If normalize REJECTS: print reasons, bump seed, retry up to 2 times.
//   9. Append a record to scripts/v3/manifest-status.json (run + approval index).

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { inference, getCredits, fileToBase64, writeFirstImage } from './lib/rd-client.mjs';
import { normalize } from './lib/normalize.mjs';
import {
  promptHash,
  acquireLock,
  releaseLock,
  getCostCaps,
  todayUtcDate,
  dailyTotalUsd,
  appendRequested,
  loadStatus,
  saveStatus,
  findApproved,
  markApproved,
  writeStubPng,
} from './lib/safety.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const HERE = import.meta.dirname;
const MANIFEST_PATH = path.join(HERE, 'asset-manifest.json');
const STATUS_PATH = path.join(HERE, 'manifest-status.json');
const REQUESTED_LOG = path.join(HERE, 'requested.jsonl');
const STYLE_FILE = path.join(HERE, 'style-id.txt');
const TMP_DIR = path.join(HERE, 'tmp');
const PALETTE_PATH = path.join(ROOT, 'public/sanctuary-v3/palettes/forgotten-memories.txt');

const args = new Set(process.argv.slice(2));
const ONLY_FLAG_IDX = process.argv.indexOf('--only');
const ONLY_ID = ONLY_FLAG_IDX > 0 ? process.argv[ONLY_FLAG_IDX + 1] : null;
const CHECK_ONLY = args.has('--check-cost');
const FORCE = args.has('--force') || args.has('--yes');
const FORCE_REGEN = args.has('--force-regenerate');
const OVERRIDE_CAP = args.has('--override-cost-cap');
const DRY_RUN = process.env.RD_DRY_RUN === '1' || process.env.RD_DRY_RUN === 'true' || args.has('--dry-run');
const MAX_RETRIES = 2;

async function readJson(p) { return JSON.parse(await fs.readFile(p, 'utf8')); }

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
  const isTile = entry.prompt_style?.startsWith('rd_tile__');
  if (isAnimation) {
    // Animation endpoints: don't support input_palette or custom user styles,
    // and don't support check_cost. Cost is documented fixed ($0.07).
    payload._wantReferenceImage = true;
  } else if (isTile) {
    // Tile endpoints (rd_tile__*): purpose-built for tilesheet pricing
    // (~$0.025 at 32×32). They accept input_palette directly. Do NOT swap to
    // the custom user style — that would re-route to RD Pro and 7× the price.
    if (common.use_input_palette) payload._wantPalette = true;
  } else {
    // RD Pro / Plus inferences: use our locked custom user style + palette.
    if (common.use_input_palette) payload._wantPalette = true;
    if (styleId) payload.prompt_style = styleId;
  }
  return { payload, isAnimation };
}

// Documented fixed prices (RD docs FAQ).
const ANIMATION_FIXED_PRICE = 0.07;

function fmtCost(usd) { return `$${Number(usd).toFixed(2)}`; }

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
  if (DRY_RUN) {
    // Don't hit RD in dry-run mode; assume animation-tier pricing as a stand-in.
    return ANIMATION_FIXED_PRICE;
  }
  payload.check_cost = true;
  delete payload._wantPalette;
  delete payload._wantReferenceImage;
  const res = await inference(payload);
  return res.balance_cost ?? 0;
}

async function runEntry(entry, common, styleId, palettePngPath, referencePngPath, hash) {
  const out = path.join(ROOT, entry.output_path);
  await ensureDir(path.dirname(out));
  await ensureDir(TMP_DIR);

  const palB64 = await fileToBase64(palettePngPath).catch(() => null);
  const refB64 = await fileToBase64(referencePngPath).catch(() => null);

  const attempts = [];
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

    const rawPath = path.join(TMP_DIR, `${entry.id}-attempt${attempt + 1}-raw.png`);
    let res;
    let postedAt = new Date().toISOString();

    if (DRY_RUN) {
      console.log(`DRY-RUN: skipping POST /v1/inferences (RD_DRY_RUN=1)`);
      const stub = await writeStubPng(rawPath, entry.width, entry.height);
      res = {
        base64_images: [], // unused in dry-run
        balance_cost: 0,
        remaining_balance: null,
        _dry_run: true,
      };
      await appendRequested(REQUESTED_LOG, {
        timestamp: postedAt,
        id: entry.id,
        attempt: attempt + 1,
        seed,
        prompt_hash: hash,
        endpoint: '/v1/inferences',
        outcome: 'dry-run',
        cost: 0,
        remaining_balance: null,
        stub_bytes: stub.bytes,
        pid: process.pid,
      });
      console.log(`  raw → ${rawPath} (stub ${stub.width}x${stub.height})`);
    } else {
      console.log(`POST /v1/inferences ...`);
      try {
        res = await inference(payload);
      } catch (e) {
        await appendRequested(REQUESTED_LOG, {
          timestamp: postedAt,
          id: entry.id,
          attempt: attempt + 1,
          seed,
          prompt_hash: hash,
          endpoint: '/v1/inferences',
          outcome: 'api-error',
          error: e.message,
          status: e.status ?? null,
          cost: 0,
          pid: process.pid,
        });
        attempts.push({ attempt: attempt + 1, seed, status: 'api-error', error: e.message });
        console.error(`  API error: ${e.message}`);
        continue;
      }
      const cost = res.balance_cost ?? 0;
      await appendRequested(REQUESTED_LOG, {
        timestamp: postedAt,
        id: entry.id,
        attempt: attempt + 1,
        seed,
        prompt_hash: hash,
        endpoint: '/v1/inferences',
        outcome: 'ok',
        cost,
        remaining_balance: res.remaining_balance ?? null,
        pid: process.pid,
      });
      await writeFirstImage(res, rawPath);
      console.log(`  raw → ${rawPath}`);
      console.log(`  cost ${fmtCost(cost)}, balance ${fmtCost(res.remaining_balance ?? 0)}`);
    }

    if (DRY_RUN) {
      // In dry-run we keep the stub PNG in tmp/ — never overwrite the real
      // output asset. The dedup record uses the tmp path as a marker so that
      // re-running --dry-run with the same hash still hits the dedup gate.
      console.log(`  ✅ dry-run: stub at ${rawPath} (output path NOT overwritten)`);
      const summary = {
        attempt: attempt + 1,
        seed,
        status: 'dry-run-pass',
        reasons: [],
        metrics: { dry_run: true },
        sha256: null,
        raw: rawPath,
        out: rawPath,
        cost_balance: null,
      };
      attempts.push(summary);
      return { entry, success: true, attempts, finalPath: rawPath, dryRun: true };
    }

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
      return { entry, success: true, attempts, finalPath: out, dryRun: false };
    }
    console.log(`  ❌ fail: ${normResult.reasons.join(' | ')}`);
  }
  return { entry, success: false, attempts, finalPath: null, dryRun: DRY_RUN };
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

  // --only bypasses the enabled filter so devs can dry-run any disabled entry.
  let entries;
  if (ONLY_ID) {
    entries = manifest.entries.filter(e => e.id === ONLY_ID);
    if (!entries.length) {
      console.log(`no manifest entry matches --only ${ONLY_ID}.`);
      return;
    }
  } else {
    entries = manifest.entries.filter(e => e.enabled);
    if (!entries.length) {
      console.log('no enabled entries to generate.');
      return;
    }
  }

  console.log(`entries: ${entries.map(e => e.id).join(', ')}${DRY_RUN ? '  [DRY-RUN]' : ''}`);

  // ----- safety rails ------------------------------------------------------
  await acquireLock();
  process.on('exit', () => { releaseLock().catch(() => {}); });
  process.on('SIGINT', () => { releaseLock().finally(() => process.exit(130)); });
  process.on('SIGTERM', () => { releaseLock().finally(() => process.exit(143)); });

  const status = await loadStatus(STATUS_PATH);

  // ----- prompt-hash dedup gate -------------------------------------------
  const annotated = entries.map(e => ({ entry: e, hash: promptHash(e, manifest.common, styleId) }));
  const skipped = [];
  const todo = [];
  for (const a of annotated) {
    const existing = findApproved(status, a.entry.id, a.hash);
    if (existing && !FORCE_REGEN) {
      skipped.push({ ...a, existing });
    } else {
      todo.push(a);
    }
  }

  if (skipped.length) {
    console.log('\n--- already approved (skipping) ---');
    for (const s of skipped) {
      console.log(`  ${s.entry.id.padEnd(24)} hash=${s.hash.slice(0, 10)}…  approvedAt=${s.existing.approvedAt}`);
    }
    if (!todo.length) {
      console.log('\nnothing to do. pass --force-regenerate to regenerate already-approved entries.');
      await releaseLock();
      return;
    }
  }

  // ----- cost gate (check_cost + caps) ------------------------------------
  console.log(`\n--- cost check ---`);
  let batchEstimate = 0;
  const perEntryCost = new Map();
  for (const a of todo) {
    const c = await checkCostFor(a.entry, manifest.common, styleId);
    perEntryCost.set(a.entry.id, c);
    batchEstimate += c;
    console.log(`  ${a.entry.id.padEnd(24)} ${fmtCost(c)}`);
  }
  const credits = DRY_RUN ? { balance: null, credits: null } : await getCredits();
  console.log(`total estimated: ${fmtCost(batchEstimate)}`);
  if (!DRY_RUN) {
    console.log(`current balance: ${fmtCost(credits.balance ?? 0)}, ${credits.credits ?? '-'} credits`);
  } else {
    console.log(`current balance: (skipped — DRY-RUN)`);
  }

  const caps = getCostCaps();
  const dailyAlready = await dailyTotalUsd(REQUESTED_LOG, todayUtcDate());
  const projectedDaily = dailyAlready + batchEstimate;
  console.log(`caps: batch≤${fmtCost(caps.batch)}, daily≤${fmtCost(caps.daily)} (already today: ${fmtCost(dailyAlready)} → projected ${fmtCost(projectedDaily)})`);

  const breaches = [];
  if (batchEstimate > caps.batch) breaches.push(`batch ${fmtCost(batchEstimate)} > cap ${fmtCost(caps.batch)}`);
  if (projectedDaily > caps.daily) breaches.push(`projected daily ${fmtCost(projectedDaily)} > cap ${fmtCost(caps.daily)}`);
  if (breaches.length) {
    if (!OVERRIDE_CAP) {
      console.error(`\nABORT — cost cap breach: ${breaches.join('; ')}.\n` +
        `  override with --override-cost-cap, or raise via RD_BATCH_CAP_USD / RD_DAILY_CAP_USD env vars.`);
      await releaseLock();
      process.exit(2);
    }
    console.warn(`WARNING — cap override active: ${breaches.join('; ')}`);
  }

  if (CHECK_ONLY) {
    console.log('--check-cost only; exiting.');
    await releaseLock();
    return;
  }

  if (!FORCE && !DRY_RUN) {
    const rl = readline.createInterface({ input, output });
    const ans = await rl.question(`proceed with generation? [y/N] `);
    rl.close();
    if (!/^y/i.test(ans.trim())) {
      console.log('aborted.');
      await releaseLock();
      return;
    }
  }

  // ----- run --------------------------------------------------------------
  const runRecord = {
    startedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    entries: [],
  };

  for (const a of todo) {
    const r = await runEntry(a.entry, manifest.common, styleId, palettePngPath, referencePngPath, a.hash);
    runRecord.entries.push({
      id: a.entry.id,
      success: r.success,
      finalPath: r.finalPath,
      prompt_hash: a.hash,
      dry_run: !!r.dryRun,
      attempts: r.attempts,
    });
    if (r.success) {
      const lastAttempt = r.attempts.at(-1) || {};
      markApproved(status, a.entry.id, {
        prompt_hash: a.hash,
        finalPath: r.finalPath,
        sha256: lastAttempt.sha256 ?? null,
        approvedAt: new Date().toISOString(),
        method: r.dryRun ? 'dry-run' : 'rd',
      });
    }
  }

  runRecord.finishedAt = new Date().toISOString();
  status.runs.push(runRecord);
  await saveStatus(STATUS_PATH, status);

  const ok = runRecord.entries.filter(x => x.success).length;
  const failed = runRecord.entries.filter(x => !x.success);
  console.log(`\n=== run done: ${ok}/${runRecord.entries.length} passed ===`);
  if (failed.length) {
    console.log('failed:');
    for (const f of failed) console.log(`  - ${f.id}: ${f.attempts.at(-1)?.reasons?.join(' | ') || f.attempts.at(-1)?.error}`);
  }
  console.log(`status log → ${STATUS_PATH}`);
  console.log(`request log → ${REQUESTED_LOG}`);
  await releaseLock();
}

main().catch(async err => {
  await releaseLock().catch(() => {});
  console.error('FAILED:', err.message);
  if (err.body) console.error('body:', JSON.stringify(err.body, null, 2));
  process.exit(1);
});
