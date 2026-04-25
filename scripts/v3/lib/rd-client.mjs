// Retro Diffusion API client for Sanctuary V3 asset generation.
// All calls are gated by check_cost first unless explicitly forced.
// API key comes from RD_API_KEY env var; never hardcode it.

import fs from 'node:fs/promises';

const BASE = 'https://api.retrodiffusion.ai/v1';
const TIMEOUT_MS = 60_000;

function getApiKey() {
  const k = process.env.RD_API_KEY;
  if (!k) {
    throw new Error('RD_API_KEY env var is not set. Pass it inline: RD_API_KEY=... node scripts/v3/...');
  }
  return k;
}

async function rdFetch(path, { method = 'POST', body, headers = {}, timeoutMs = TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'X-RD-Token': getApiKey(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { _raw: text }; }
    if (!res.ok) {
      const msg = json?.error || json?.message || text || `HTTP ${res.status}`;
      const err = new Error(`RD ${method} ${path} → ${res.status} ${msg}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  } finally {
    clearTimeout(t);
  }
}

export async function getCredits() {
  return rdFetch('/inferences/credits', { method: 'GET' });
}

/**
 * Run an inference. Pass `check_cost: true` in the payload to estimate without generating.
 */
export async function inference(payload) {
  return rdFetch('/inferences', { method: 'POST', body: payload });
}

/**
 * Create a custom user style (RD Pro template).
 * Returns { id, prompt_style, ... } where prompt_style is the value to use in subsequent calls.
 */
export async function createStyle(payload) {
  return rdFetch('/styles', { method: 'POST', body: payload });
}

export async function deleteStyle(styleId) {
  return rdFetch(`/styles/${styleId}`, { method: 'DELETE' });
}

/** Read a binary file and return its base64 encoding (no data:... prefix). */
export async function fileToBase64(path) {
  const buf = await fs.readFile(path);
  return buf.toString('base64');
}

/** Decode the first base64 image in an inference response and write it to disk. */
export async function writeFirstImage(response, outPath) {
  const b64 = response?.base64_images?.[0];
  if (!b64) throw new Error('No base64_images in response');
  const buf = Buffer.from(b64, 'base64');
  await fs.writeFile(outPath, buf);
  return outPath;
}

/** Decode all images. */
export async function writeAllImages(response, outDir, baseName) {
  const list = response?.base64_images ?? [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const buf = Buffer.from(list[i], 'base64');
    const p = `${outDir}/${baseName}-${i}.png`;
    await fs.writeFile(p, buf);
    out.push(p);
  }
  return out;
}
