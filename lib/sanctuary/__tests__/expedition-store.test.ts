// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import {
  chooseExpeditionPath,
  getExpeditionRewards,
  startExpedition,
  type ExpeditionDefinition,
} from '../expeditions';

// Tests for the V2.6 expedition persistence layer. We exercise the SQL/logic
// against an in-memory SQLite DB and the pure reducer, mirroring the pattern
// established by starCurrency.test.ts and shop.test.ts.
//
// For the DB-backed integration tests we redirect lib/db.ts's getDatabase()
// to a fresh in-memory DB and let it load the real catalog from
// data/sanctuary/expeditions/easy.json — that doubles as a check that the
// seed files are wellformed.

const ALICE = '0x' + 'a'.repeat(40);
const TOKEN_ID = 3;
// Real seed from data/sanctuary/expeditions/easy.json — 5 STAR cost, 2 steps.
const EASY_EXP_ID = 'exp-easy-meadow-walk';
const EASY_STAR_COST = 5;
// Real seed from data/sanctuary/expeditions/medium.json — 15 STAR, 3-outcome final.
const MEDIUM_EXP_ID = 'exp-medium-observatory-eclipse';

function loadSql(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'scripts', file), 'utf-8');
}

function createExpeditionDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Minimal upstream tables so FKs resolve.
  db.exec(`
    CREATE TABLE star_skrumpey_metadata (
      token_id INTEGER PRIMARY KEY,
      name TEXT
    )
  `);
  db.exec(`
    CREATE TABLE user_xp (
      wallet_address TEXT PRIMARY KEY,
      total_xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1
    )
  `);
  db.exec(loadSql('init-sanctuary.sql'));
  db.exec(loadSql('init-sanctuary-v1.5.sql'));
  db.exec(loadSql('init-sanctuary-v2.1.sql'));
  db.exec(loadSql('init-sanctuary-v2.6.sql'));

  db.prepare('INSERT INTO star_skrumpey_metadata (token_id, name) VALUES (?, ?)').run(TOKEN_ID, 'Star #3');
  db.prepare(
    "INSERT INTO sanctuary_companions (wallet_address, token_id, is_active, bond_score, equipped_cosmetics) VALUES (?, ?, 1, 10.0, '{}')"
  ).run(ALICE, TOKEN_ID);
  return db;
}

function buildSimpleDef(): ExpeditionDefinition {
  return {
    id: 'test-easy',
    title: 'Easy',
    description: 'Easy run',
    npcSource: 'meadow',
    startStepId: 'a',
    rewards: { xp: 100, bond: 4.0, trait: 'TestTrait' },
    steps: [
      {
        id: 'a',
        narrative: 'start',
        choices: [{ id: 'go', label: 'go', nextStepId: 'b' }],
      },
      {
        id: 'b',
        narrative: 'end',
        isFinal: true,
        choices: [
          { id: 'win', label: 'win', outcome: 'success' },
          { id: 'lose', label: 'lose', outcome: 'failure' },
        ],
      },
    ],
  };
}

describe('sanctuary_expeditions schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createExpeditionDb();
  });

  it('creates both tables with the spec columns', () => {
    const expCols = db.prepare("PRAGMA table_info(sanctuary_expeditions)").all() as Array<{ name: string }>;
    const names = expCols.map((c) => c.name).sort();
    expect(names).toEqual(
      ['ended_at', 'expedition_id', 'id', 'outcome', 'star_cost', 'started_at', 'status', 'token_id', 'wallet_address'].sort(),
    );

    const progCols = db.prepare("PRAGMA table_info(sanctuary_expedition_progress)").all() as Array<{ name: string }>;
    const progNames = progCols.map((c) => c.name).sort();
    expect(progNames).toEqual(
      ['choices_jsonb', 'current_step_id', 'expedition_row_id', 'updated_at'].sort(),
    );
  });

  it('rejects an unknown outcome value via CHECK', () => {
    expect(() => {
      db.prepare(
        "INSERT INTO sanctuary_expeditions (wallet_address, token_id, expedition_id, star_cost, status, outcome) VALUES (?, ?, ?, 0, 'completed', 'bogus')"
      ).run(ALICE, TOKEN_ID, 'x');
    }).toThrow();
  });
});

describe('expedition reducer round-trip via JSON history', () => {
  it('rehydrates state from serialized history without losing the path', () => {
    const def = buildSimpleDef();
    const s0 = startExpedition(def);
    const s1 = chooseExpeditionPath(s0, def, 'go');
    const s2 = chooseExpeditionPath(s1, def, 'win');

    const serialized = JSON.stringify(s2.history);
    const rehydrated = { ...s2, history: JSON.parse(serialized) };

    expect(rehydrated.history).toHaveLength(2);
    expect(rehydrated.history[0]).toMatchObject({ stepId: 'a', choiceId: 'go' });
    expect(rehydrated.history[1]).toMatchObject({ stepId: 'b', choiceId: 'win', outcome: 'success' });

    const rewards = getExpeditionRewards(s2, def);
    expect(rewards.xp).toBe(100);
    expect(rewards.trait).toBe('TestTrait');
  });

  it('deterministically produces the same outcome for the same choices', () => {
    const def = buildSimpleDef();
    const runOnce = () => {
      let s = startExpedition(def);
      s = chooseExpeditionPath(s, def, 'go');
      s = chooseExpeditionPath(s, def, 'lose');
      return getExpeditionRewards(s, def);
    };
    expect(runOnce()).toEqual(runOnce());
  });
});

// ─── Integration tests against the real seed catalog ──────────────────

async function withDb<T>(testDb: Database.Database, fn: (mod: typeof import('../../db')) => Promise<T> | T): Promise<T> {
  const mod = await import('../../db');
  mod.__setTestDatabase(testDb);
  try {
    return await fn(mod);
  } finally {
    mod.__setTestDatabase(null);
  }
}

describe('startExpeditionRun deducts STAR and creates a run', () => {
  it('rejects when balance is insufficient and creates no row', async () => {
    const db = createExpeditionDb();
    await withDb(db, (mod) => {
      expect(() => mod.startExpeditionRun(ALICE, TOKEN_ID, EASY_EXP_ID)).toThrow(/Insufficient STAR/);
    });
    const count = db.prepare('SELECT COUNT(*) AS c FROM sanctuary_expeditions').get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('deducts STAR on success and seeds the progress row', async () => {
    const db = createExpeditionDb();
    db.prepare(
      'INSERT INTO sanctuary_star_balance (wallet_address, balance, lifetime_earned) VALUES (?, ?, ?)'
    ).run(ALICE, 50, 50);

    await withDb(db, (mod) => {
      const result = mod.startExpeditionRun(ALICE, TOKEN_ID, EASY_EXP_ID);
      expect(result.row.expedition_id).toBe(EASY_EXP_ID);
      expect(result.row.star_cost).toBe(EASY_STAR_COST);
      expect(result.row.status).toBe('active');
      expect(result.state.currentStepId).toBe('meadow-start');
    });

    const bal = db.prepare('SELECT balance FROM sanctuary_star_balance WHERE wallet_address = ?').get(ALICE) as { balance: number };
    expect(bal.balance).toBe(50 - EASY_STAR_COST);

    const progress = db.prepare('SELECT * FROM sanctuary_expedition_progress WHERE expedition_row_id = 1').get() as { current_step_id: string };
    expect(progress.current_step_id).toBe('meadow-start');
  });

  it('rejects starting a second concurrent run for the same expedition', async () => {
    const db = createExpeditionDb();
    db.prepare(
      'INSERT INTO sanctuary_star_balance (wallet_address, balance, lifetime_earned) VALUES (?, ?, ?)'
    ).run(ALICE, 50, 50);

    await withDb(db, (mod) => {
      mod.startExpeditionRun(ALICE, TOKEN_ID, EASY_EXP_ID);
      expect(() => mod.startExpeditionRun(ALICE, TOKEN_ID, EASY_EXP_ID)).toThrow('ALREADY_ACTIVE');
    });
  });
});

describe('chooseExpeditionStep settles rewards on terminal outcome', () => {
  it('on success: grants STAR + bond + trait', async () => {
    const db = createExpeditionDb();
    db.prepare(
      'INSERT INTO sanctuary_star_balance (wallet_address, balance, lifetime_earned) VALUES (?, ?, ?)'
    ).run(ALICE, 50, 50);

    await withDb(db, (mod) => {
      const run = mod.startExpeditionRun(ALICE, TOKEN_ID, EASY_EXP_ID);
      mod.chooseExpeditionStep(ALICE, TOKEN_ID, run.row.id, 'trail-flowers');
      const finished = mod.chooseExpeditionStep(ALICE, TOKEN_ID, run.row.id, 'rest-share');

      expect(finished.state.status).toBe('completed');
      expect(finished.state.finalOutcome).toBe('success');
      expect(finished.rewards.trait).toBe('Wanderer');
      expect(finished.rewards.starGained).toBeGreaterThan(0);

      // STAR settled (cost 5 deducted at start, success grant added).
      const bal = db.prepare('SELECT balance FROM sanctuary_star_balance WHERE wallet_address = ?').get(ALICE) as { balance: number };
      expect(bal.balance).toBe(50 - EASY_STAR_COST + finished.rewards.starGained);

      // Trait unlocked
      const trait = db.prepare(
        'SELECT * FROM sanctuary_traits WHERE wallet_address = ? AND token_id = ? AND trait_name = ?'
      ).get(ALICE, TOKEN_ID, 'Wanderer') as { unlocked: number } | undefined;
      expect(trait?.unlocked).toBe(1);

      // Bond increased
      const comp = db.prepare(
        'SELECT bond_score FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ? AND is_active = 1'
      ).get(ALICE, TOKEN_ID) as { bond_score: number };
      expect(comp.bond_score).toBeGreaterThan(10); // started at 10
    });
  });

  it('on failure path (hard tier risky branch): cost stays deducted, no trait, scaled reward', async () => {
    const db = createExpeditionDb();
    db.prepare(
      'INSERT INTO sanctuary_star_balance (wallet_address, balance, lifetime_earned) VALUES (?, ?, ?)'
    ).run(ALICE, 100, 100);

    await withDb(db, (mod) => {
      // The hard tier risky branch (take-quench → risky-dunk-early) yields failure.
      const HARD_EXP = 'exp-hard-forge-emberheart';
      const run = mod.startExpeditionRun(ALICE, TOKEN_ID, HARD_EXP);
      mod.chooseExpeditionStep(ALICE, TOKEN_ID, run.row.id, 'take-quench');
      const finished = mod.chooseExpeditionStep(ALICE, TOKEN_ID, run.row.id, 'risky-dunk-early');

      expect(finished.state.finalOutcome).toBe('failure');
      expect(finished.rewards.trait).toBeNull();
      expect(finished.rewards.xp).toBeLessThan(150); // scaled below base 150 xp
      const trait = db.prepare(
        'SELECT * FROM sanctuary_traits WHERE wallet_address = ? AND token_id = ? AND trait_name = ?'
      ).get(ALICE, TOKEN_ID, 'Emberheart') as { unlocked: number } | undefined;
      expect(trait?.unlocked ?? 0).toBe(0);
    });
  });

  it('outcomes are deterministic against (expedition, choice path)', async () => {
    const db = createExpeditionDb();
    db.prepare(
      'INSERT INTO sanctuary_star_balance (wallet_address, balance, lifetime_earned) VALUES (?, ?, ?)'
    ).run(ALICE, 200, 200);

    await withDb(db, (mod) => {
      const run1 = mod.startExpeditionRun(ALICE, TOKEN_ID, MEDIUM_EXP_ID);
      mod.chooseExpeditionStep(ALICE, TOKEN_ID, run1.row.id, 'ready-pen');
      const a = mod.chooseExpeditionStep(ALICE, TOKEN_ID, run1.row.id, 'write-bullets');
      const run2 = mod.startExpeditionRun(ALICE, TOKEN_ID, MEDIUM_EXP_ID);
      mod.chooseExpeditionStep(ALICE, TOKEN_ID, run2.row.id, 'ready-pen');
      const b = mod.chooseExpeditionStep(ALICE, TOKEN_ID, run2.row.id, 'write-bullets');
      expect(a.state.finalOutcome).toBe(b.state.finalOutcome);
      expect(a.rewards.xp).toBe(b.rewards.xp);
      expect(a.rewards.starGained).toBe(b.rewards.starGained);
    });
  });
});

describe('abandonExpeditionRun', () => {
  it('marks the row abandoned and does not refund STAR', async () => {
    const db = createExpeditionDb();
    db.prepare(
      'INSERT INTO sanctuary_star_balance (wallet_address, balance, lifetime_earned) VALUES (?, ?, ?)'
    ).run(ALICE, 50, 50);
    await withDb(db, (mod) => {
      const run = mod.startExpeditionRun(ALICE, TOKEN_ID, EASY_EXP_ID);
      const result = mod.abandonExpeditionRun(ALICE, TOKEN_ID, run.row.id);
      expect(result.row.status).toBe('abandoned');
      expect(result.row.ended_at).not.toBeNull();
    });
    const bal = db.prepare('SELECT balance FROM sanctuary_star_balance WHERE wallet_address = ?').get(ALICE) as { balance: number };
    expect(bal.balance).toBe(50 - EASY_STAR_COST); // no refund
  });
});

describe('listExpeditions surfaces tiered catalog', () => {
  it('returns all tiers and flags the active row', async () => {
    const db = createExpeditionDb();
    db.prepare(
      'INSERT INTO sanctuary_star_balance (wallet_address, balance, lifetime_earned) VALUES (?, ?, ?)'
    ).run(ALICE, 50, 50);

    await withDb(db, (mod) => {
      const before = mod.listExpeditions(ALICE, TOKEN_ID);
      expect(before.tiers).toEqual(['easy', 'medium', 'hard']);
      expect(before.expeditions.length).toBeGreaterThanOrEqual(3);
      expect(before.expeditions.every((e) => e.active_row_id === null)).toBe(true);

      const run = mod.startExpeditionRun(ALICE, TOKEN_ID, EASY_EXP_ID);
      const after = mod.listExpeditions(ALICE, TOKEN_ID);
      const easyRow = after.expeditions.find((e) => e.id === EASY_EXP_ID);
      expect(easyRow?.active_row_id).toBe(run.row.id);
    });
  });
});
