#!/usr/bin/env node
// Reconcile scripts/v3/requested.jsonl against RD's /credits endpoint.
//
// Usage:
//   RD_API_KEY=... node scripts/v3/rd-reconcile.mjs           # full report
//   RD_API_KEY=... node scripts/v3/rd-reconcile.mjs --today   # today only
//   RD_API_KEY=... node scripts/v3/rd-reconcile.mjs --offline # skip /credits
//
// Reports:
//   - count and total $ of POSTs in the audit log (overall + today)
//   - earliest / latest entry timestamps
//   - inferred starting balance (earliest entry's `cost + remaining_balance`)
//   - inferred ending balance (latest entry's `remaining_balance`) vs current
//     /credits balance — flags any drift > $0.05.
//   - dry-run entries excluded from cost totals.

import fs from 'node:fs/promises';
import path from 'node:path';
import { getCredits } from './lib/rd-client.mjs';
import { todayUtcDate } from './lib/safety.mjs';

const HERE = import.meta.dirname;
const LOG_PATH = path.join(HERE, 'requested.jsonl');

const args = new Set(process.argv.slice(2));
const TODAY_ONLY = args.has('--today');
const OFFLINE = args.has('--offline');

function fmt(usd) { return `$${Number(usd).toFixed(4)}`; }

async function readEntries() {
  let raw;
  try {
    raw = await fs.readFile(LOG_PATH, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
}

function summarize(entries, label) {
  const realCost = entries.filter(e => e.outcome === 'ok' && typeof e.cost === 'number')
    .reduce((s, e) => s + e.cost, 0);
  const dryRuns = entries.filter(e => e.outcome === 'dry-run').length;
  const apiErrors = entries.filter(e => e.outcome === 'api-error').length;
  const ok = entries.filter(e => e.outcome === 'ok').length;
  console.log(`\n--- ${label} (${entries.length} log entries) ---`);
  console.log(`  ok          ${ok}    (cost ${fmt(realCost)})`);
  console.log(`  dry-run     ${dryRuns}`);
  console.log(`  api-error   ${apiErrors}`);
  return { realCost, ok, dryRuns, apiErrors };
}

function balanceWindow(entries) {
  const ok = entries.filter(e => e.outcome === 'ok' && typeof e.remaining_balance === 'number');
  if (!ok.length) return null;
  const first = ok[0];
  const last = ok[ok.length - 1];
  const startBal = (first.remaining_balance ?? 0) + (first.cost ?? 0);
  return {
    earliestTs: first.timestamp,
    latestTs: last.timestamp,
    startBalance: startBal,
    endBalanceFromLog: last.remaining_balance,
  };
}

async function main() {
  const all = await readEntries();
  if (!all.length) {
    console.log(`no entries in ${LOG_PATH}`);
    return;
  }

  const today = todayUtcDate();
  const todayEntries = all.filter(e => typeof e.timestamp === 'string' && e.timestamp.slice(0, 10) === today);

  summarize(all, 'all-time');
  summarize(todayEntries, `today (${today})`);

  const allWin = balanceWindow(all);
  if (allWin) {
    console.log(`\nbalance window (from log):`);
    console.log(`  earliest ${allWin.earliestTs}   inferred start ≈ ${fmt(allWin.startBalance)}`);
    console.log(`  latest   ${allWin.latestTs}   end (from log) = ${fmt(allWin.endBalanceFromLog)}`);
  }

  if (OFFLINE) {
    console.log(`\n--offline; skipping /credits.`);
    return;
  }

  let credits;
  try {
    credits = await getCredits();
  } catch (e) {
    console.error(`failed to GET /credits: ${e.message}`);
    process.exit(1);
  }
  const liveBalance = Number(credits.balance ?? 0);
  console.log(`\nlive /credits: balance=${fmt(liveBalance)}, credits=${credits.credits ?? '-'}`);

  if (allWin) {
    const drift = liveBalance - allWin.endBalanceFromLog;
    const driftAbs = Math.abs(drift);
    const sign = drift >= 0 ? '+' : '-';
    console.log(`drift vs latest log: ${sign}${fmt(driftAbs)}  (live − log)`);
    if (driftAbs > 0.05) {
      console.log(`  ⚠ drift > $0.05 — likely off-band charges (other RD usage) or stale log.`);
      process.exitCode = 3;
    } else {
      console.log(`  ✅ within tolerance ($0.05).`);
    }
  }

  if (TODAY_ONLY) return;
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
