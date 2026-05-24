// Integration coverage for [SWO_V2_COMPANION_INTERACTABLES] Track 0 — proves
// that interactWithCompanion actually APPLIES the preference / need-state /
// variable-reward systems (previously built but unwired) and reports the
// breakdown the UI needs. See docs/SANCTUARY_ENGAGEMENT_PLAN.md rules 1, 4, 7.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { __setTestDatabase, interactWithCompanion } from '@/lib/db';
import {
  preferenceProfile,
  PREFERENCE_BOND_MULTIPLIER,
  type PreferenceLevel,
} from '@/lib/sanctuary/preferences';
import type { CompanionStatAction } from '@/lib/sanctuary/companionStats';

const WALLET = '0x' + 'a'.repeat(40);
const TOKEN = 3;
const NON_SLEEP: CompanionStatAction[] = ['feed', 'pet', 'talk', 'play'];

// Migration chain in the same order lib/db.ts initializeSanctuary() applies it,
// so the in-memory DB has the full stats schema interactWithCompanion needs.
const SANCTUARY_SQL = [
  'init-sanctuary.sql',
  ...['1.5', '1.6', '1.7', '1.8', '1.9', '2.0', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'].map(
    (v) => `init-sanctuary-v${v}.sql`,
  ),
  'init-sanctuary-rate-limits.sql',
];

function createInteractReadyDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`CREATE TABLE star_skrumpey_metadata (token_id INTEGER PRIMARY KEY, name TEXT, constellation TEXT, aura TEXT, form TEXT, mood TEXT, eyes TEXT, background TEXT)`);
  db.exec(`CREATE TABLE user_xp (wallet_address TEXT PRIMARY KEY, total_xp INTEGER DEFAULT 0, level INTEGER DEFAULT 1, updated_at TEXT DEFAULT (datetime('now')))`);
  db.exec(`CREATE TABLE user_profiles (wallet_address TEXT PRIMARY KEY, display_name TEXT)`);
  for (const file of SANCTUARY_SQL) {
    db.exec(fs.readFileSync(path.join(process.cwd(), 'scripts', file), 'utf-8'));
  }
  // The V2.5 stats columns are added in JS (initializeSanctuary), not in the
  // .sql files — add the ones interactWithCompanion reads. Ignore "duplicate
  // column" if a future migration starts shipping them in SQL.
  for (const col of [
    'hunger REAL DEFAULT 100',
    'happiness REAL DEFAULT 100',
    'energy REAL DEFAULT 100',
    'is_sleeping INTEGER DEFAULT 0',
    'sleep_started_at TEXT',
    'stats_updated_at TEXT',
    'last_full_sleep_at TEXT',
    'xp INTEGER DEFAULT 0',
    'level INTEGER DEFAULT 1',
    'nickname TEXT',
    'current_activity TEXT',
    'activity_started_at TEXT',
    'activity_ends_at TEXT',
    'equipped_cosmetics TEXT',
    "created_at TEXT DEFAULT (datetime('now'))",
    "updated_at TEXT DEFAULT (datetime('now'))",
  ]) {
    try { db.exec(`ALTER TABLE sanctuary_companions ADD COLUMN ${col}`); } catch { /* already present */ }
  }
  db.prepare('INSERT INTO star_skrumpey_metadata (token_id, name) VALUES (?, ?)').run(TOKEN, 'Star #3');
  db.prepare('INSERT INTO user_xp (wallet_address, total_xp, level) VALUES (?, ?, ?)').run(WALLET, 500, 5);
  // Active companion, mid stats, rested (not Tired), starting bond 3.5.
  db.prepare(`
    INSERT INTO sanctuary_companions
      (wallet_address, token_id, is_active, bond_score, total_interactions,
       hunger, happiness, energy, is_sleeping, stats_updated_at, last_full_sleep_at)
    VALUES (?, ?, 1, 3.5, 0, 50, 50, 50, 0, datetime('now'), datetime('now'))
  `).run(WALLET, TOKEN);
  return db;
}

const mult = (level: PreferenceLevel): number => PREFERENCE_BOND_MULTIPLIER[level];

describe('interactWithCompanion — engagement mechanics wiring', () => {
  beforeEach(() => {
    // Force the variable-reward roll to the floor (no bonus STAR) so these
    // cases isolate the preference/need-state bond wiring and don't depend on
    // the STAR-ledger tables. The variable layer is covered in variableRewards.test.ts.
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    __setTestDatabase(createInteractReadyDb());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    __setTestDatabase(null);
  });

  it('reports the per-Skrumpey preference + variable-reward breakdown', () => {
    const profile = preferenceProfile(TOKEN);
    const res = interactWithCompanion(WALLET, TOKEN, 'feed');
    expect(res.preference).toBe(profile.feed);
    expect(typeof res.needBoosted).toBe('boolean');
    expect(res.variableTier).toBe('floor'); // Math.random pinned high
    expect(res.bonusStar).toBe(0);
    expect(typeof res.bondGain).toBe('number');
  });

  it('a loved/liked action gains more bond than a disliked/hated one', () => {
    const profile = preferenceProfile(TOKEN);
    const best = NON_SLEEP.reduce((a, b) => (mult(profile[a]) >= mult(profile[b]) ? a : b));
    const worst = NON_SLEEP.reduce((a, b) => (mult(profile[a]) <= mult(profile[b]) ? a : b));

    const bestRes = interactWithCompanion(WALLET, TOKEN, best);
    __setTestDatabase(createInteractReadyDb()); // reset so daily-cap/decay don't skew
    const worstRes = interactWithCompanion(WALLET, TOKEN, worst);

    expect(bestRes.bondGain).toBeGreaterThan(0);
    expect(worstRes.bondGain).toBeLessThanOrEqual(0);
    expect(bestRes.bondGain).toBeGreaterThan(worstRes.bondGain);
  });

  it('a hated action actually reduces the stored bond score', () => {
    const profile = preferenceProfile(TOKEN);
    const hated = NON_SLEEP.find((a) => profile[a] === 'hated');
    if (!hated) return; // 'hated' landed on sleep for this token — nothing to assert
    const res = interactWithCompanion(WALLET, TOKEN, hated);
    expect(res.preference).toBe('hated');
    expect(res.bondGain).toBeLessThan(0);
    expect(res.companion.bond_score).toBeLessThan(3.5);
  });
});
