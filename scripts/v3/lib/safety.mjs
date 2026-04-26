// Safety rails for the V3 RD pipeline.
//
// Provides:
//   - promptHash(entry, common, styleId) — canonical SHA-256 over the inputs
//     that determine the RD output. Used for dedup against approved entries.
//   - acquireLock() / releaseLock() — process-level mutex on
//     /tmp/rd_v3_generate.lock with stale-PID detection. Refuses to proceed
//     if another generator is live.
//   - getCostCaps() — read RD_BATCH_CAP_USD / RD_DAILY_CAP_USD env vars.
//   - dailyTotalUsd(jsonlPath, dateIso) — sum cost from today's POSTs.
//   - appendRequested(jsonlPath, record) — append-only audit log.
//   - loadStatus / saveStatus — read/write the manifest-status.json file
//     with an `approved[id] = [{prompt_hash, ...}]` index for dedup.
//   - findApproved(status, id, hash) — bool/record lookup.
//   - markApproved(status, id, record) — append + dedupe by hash.
//   - writeStubPng(path, w, h) — solid-color PNG used by RD_DRY_RUN mode.
//
// All write paths assume the caller holds the process lock.

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';

export const LOCK_PATH = '/tmp/rd_v3_generate.lock';
export const BATCH_CAP_DEFAULT_USD = 0.50;
export const DAILY_CAP_DEFAULT_USD = 5.00;

// ----- prompt hash ----------------------------------------------------------

/**
 * Canonical SHA-256 over (entry × common × styleId). Any change to prompt,
 * dimensions, seed, palette flag, style id, or asset class produces a new
 * hash. Used to skip already-approved entries.
 */
export function promptHash(entry, common, styleId) {
  const canonical = JSON.stringify({
    style_prefix: common?.style_prefix ?? '',
    negative_prompt: common?.negative_prompt ?? '',
    use_input_palette: common?.use_input_palette ?? false,
    style_id: styleId ?? null,
    id: entry.id,
    prompt: entry.prompt,
    prompt_style: entry.prompt_style,
    width: entry.width,
    height: entry.height,
    seed: entry.seed,
    remove_bg: entry.remove_bg ?? false,
    return_spritesheet: entry.return_spritesheet ?? false,
    asset_class: entry.asset_class ?? null,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// ----- lock -----------------------------------------------------------------

let _heldLock = false;

async function _isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code !== 'ESRCH';
  }
}

/**
 * Take the v3 generator lock. Throws if another live process owns it.
 * Idempotent within a single process — safe to call once at startup.
 */
export async function acquireLock(lockPath = LOCK_PATH) {
  if (_heldLock) return lockPath;
  const pidStr = String(process.pid);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fh = await fs.open(lockPath, 'wx');
      try {
        await fh.write(pidStr);
      } finally {
        await fh.close();
      }
      _heldLock = true;
      return lockPath;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let oldPid = NaN;
      try {
        const txt = (await fs.readFile(lockPath, 'utf8')).trim();
        oldPid = parseInt(txt, 10);
      } catch {}
      if (await _isPidAlive(oldPid)) {
        throw new Error(`v3 pipeline lock held by pid=${oldPid} at ${lockPath}. ` +
          `Wait for it to finish, or remove the lock if you are sure it is stale.`);
      }
      // stale — unlink and retry once
      await fs.unlink(lockPath).catch(() => {});
    }
  }
  throw new Error(`could not acquire ${lockPath} (race with another stale-takeover?)`);
}

export async function releaseLock(lockPath = LOCK_PATH) {
  if (!_heldLock) return;
  try {
    const txt = (await fs.readFile(lockPath, 'utf8')).trim();
    if (txt === String(process.pid)) {
      await fs.unlink(lockPath);
    }
  } catch {}
  _heldLock = false;
}

// ----- cost caps ------------------------------------------------------------

export function getCostCaps() {
  const batch = parseFloat(process.env.RD_BATCH_CAP_USD ?? BATCH_CAP_DEFAULT_USD);
  const daily = parseFloat(process.env.RD_DAILY_CAP_USD ?? DAILY_CAP_DEFAULT_USD);
  if (!Number.isFinite(batch) || batch < 0) {
    throw new Error(`RD_BATCH_CAP_USD must be a non-negative number, got ${process.env.RD_BATCH_CAP_USD}`);
  }
  if (!Number.isFinite(daily) || daily < 0) {
    throw new Error(`RD_DAILY_CAP_USD must be a non-negative number, got ${process.env.RD_DAILY_CAP_USD}`);
  }
  return { batch, daily };
}

/** UTC date prefix (YYYY-MM-DD) for the current moment. */
export function todayUtcDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/** Sum of `cost` (USD) from jsonl entries whose `timestamp` starts with dateIso. */
export async function dailyTotalUsd(jsonlPath, dateIso) {
  let total = 0;
  let raw;
  try {
    raw = await fs.readFile(jsonlPath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return 0;
    throw e;
  }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (typeof r.cost !== 'number' || !Number.isFinite(r.cost)) continue;
    if (typeof r.timestamp !== 'string') continue;
    if (r.timestamp.slice(0, 10) === dateIso) total += r.cost;
  }
  return total;
}

// ----- requested.jsonl ------------------------------------------------------

/**
 * Append one JSON record + newline to the audit log. Uses fs.open('a') which
 * is atomic for small writes; outer process lock keeps multi-write batches in
 * order.
 */
export async function appendRequested(jsonlPath, record) {
  const line = JSON.stringify(record) + '\n';
  const fh = await fs.open(jsonlPath, 'a');
  try {
    await fh.write(line);
    await fh.sync().catch(() => {}); // best-effort fsync
  } finally {
    await fh.close();
  }
}

// ----- manifest-status.json -------------------------------------------------

export async function loadStatus(statusPath) {
  try {
    const txt = await fs.readFile(statusPath, 'utf8');
    const obj = JSON.parse(txt);
    if (!obj.runs) obj.runs = [];
    if (!obj.approved) obj.approved = {};
    return obj;
  } catch (e) {
    if (e.code === 'ENOENT') return { runs: [], approved: {} };
    throw e;
  }
}

export async function saveStatus(statusPath, status) {
  await fs.writeFile(statusPath, JSON.stringify(status, null, 2) + '\n', 'utf8');
}

/** Returns the matching approval record (with prompt_hash) or null. */
export function findApproved(status, id, hash) {
  const arr = status?.approved?.[id];
  if (!Array.isArray(arr)) return null;
  return arr.find(r => r && r.prompt_hash === hash) || null;
}

/**
 * Record a successful normalize as approved. Dedup by prompt_hash so re-runs
 * don't bloat the file. Most recent record wins.
 */
export function markApproved(status, id, record) {
  if (!status.approved) status.approved = {};
  const arr = status.approved[id] = (status.approved[id] || []);
  const existing = arr.findIndex(r => r && r.prompt_hash === record.prompt_hash);
  if (existing >= 0) arr.splice(existing, 1);
  arr.push(record);
}

// ----- dry-run stub ---------------------------------------------------------

/**
 * Write a tiny solid-color PNG at the requested dimensions. Used by
 * RD_DRY_RUN to simulate the RD POST without spending credits.
 */
export async function writeStubPng(outPath, width, height) {
  const w = Math.max(1, width | 0) || 32;
  const h = Math.max(1, height | 0) || 32;
  const buf = await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 132, g: 49, b: 121, alpha: 1 }, // muted lavender — easy to spot
    },
  }).png().toBuffer();
  await fs.writeFile(outPath, buf);
  return { width: w, height: h, bytes: buf.length };
}
