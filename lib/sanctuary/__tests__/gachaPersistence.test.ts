/**
 * DB-layer tests for the gacha pull persistence wrapper. Mirrors the in-memory
 * SQLite pattern from `shop.test.ts` — replicates the helper SQL the
 * production code uses so we don't pull in the singleton DB.
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import {
  GACHA_PULL_COST,
  mulberry32,
  pickGachaItem,
  type GachaCandidate,
} from '@/lib/sanctuary/gacha';

const ALICE = '0x' + 'a'.repeat(40);

function loadSql(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'scripts', file), 'utf-8');
}

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
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
  db.exec(loadSql('init-sanctuary-v2.1.sql'));
  db.exec(loadSql('init-sanctuary-v2.2.sql'));
  // v2.3 → v2.6 carry preference / sleep / expeditions tables — load them so
  // the assertion test for PR2's star_cost column has the right schema.
  for (const v of ['v2.3', 'v2.4', 'v2.5', 'v2.6']) {
    const p = path.join(process.cwd(), 'scripts', `init-sanctuary-${v}.sql`);
    if (fs.existsSync(p)) db.exec(loadSql(`init-sanctuary-${v}.sql`));
  }

  // Seed a small catalog spanning all four tiers so we can exercise rare paths.
  const items: Array<[string, string, string, string, number, number, string]> = [
    ['hat_acorn_cap', 'Acorn Cap', 'hat', 'common', 10, 1, 'hat_acorn_cap'],
    ['hat_witch_hat', 'Witch Hat', 'hat', 'uncommon', 20, 1, 'hat_witch_hat'],
    ['hat_gold_crown', 'Gold Crown', 'hat', 'rare', 35, 1, 'hat_gold_crown'],
    ['hat_nebula_crown', 'Nebula Crown', 'hat', 'legendary', 50, 1, 'hat_nebula_crown'],
  ];
  const insert = db.prepare(
    'INSERT INTO sanctuary_cosmetic_items (item_key, name, category, rarity, star_cost, level_required, asset_key) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  for (const i of items) insert.run(...i);

  db.prepare(
    'INSERT OR REPLACE INTO user_xp (wallet_address, total_xp, level) VALUES (?, 0, ?)',
  ).run(ALICE, 5);
  db.prepare(
    'INSERT INTO sanctuary_star_balance (wallet_address, balance, lifetime_earned) VALUES (?, ?, ?)',
  ).run(ALICE, 100, 100);
  return db;
}

/** Replicates `gachaPullForWallet` against an in-memory DB so we don't need
 *  the singleton. Uses the same picker as the production path. */
function pullForTest(
  db: Database.Database,
  addr: string,
  rng: () => number,
): { itemKey: string; balance: number; isRare: boolean } {
  const owned = new Set(
    (
      db.prepare(
        'SELECT item_key FROM sanctuary_companion_inventory WHERE wallet_address = ?',
      ).all(addr) as Array<{ item_key: string }>
    ).map((r) => r.item_key),
  );
  const all = db.prepare(
    'SELECT item_key, name, category, rarity, star_cost, level_required, asset_key FROM sanctuary_cosmetic_items',
  ).all() as Array<{
    item_key: string;
    rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
    level_required: number;
  }>;
  const candidates: GachaCandidate[] = all
    .filter((i) => !owned.has(i.item_key))
    .map((i) => ({
      item_key: i.item_key,
      rarity: i.rarity,
      level_required: i.level_required,
    }));
  if (candidates.length === 0) throw new Error('GACHA_POOL_EMPTY');
  const level = (
    db.prepare('SELECT level FROM user_xp WHERE wallet_address = ?').get(addr) as
      | { level: number }
      | undefined
  )?.level ?? 1;
  const pick = pickGachaItem(candidates, level, rng);
  if (!pick) throw new Error('GACHA_NO_ELIGIBLE_ITEMS');

  // Spend STAR (atomic).
  const txn = db.transaction(() => {
    const row = db.prepare(
      'SELECT balance FROM sanctuary_star_balance WHERE wallet_address = ?',
    ).get(addr) as { balance: number } | undefined;
    const cur = row?.balance ?? 0;
    if (cur < GACHA_PULL_COST) throw new Error('Insufficient STAR balance');
    const newBal = cur - GACHA_PULL_COST;
    db.prepare(
      'UPDATE sanctuary_star_balance SET balance = ? WHERE wallet_address = ?',
    ).run(newBal, addr);
    db.prepare(
      'INSERT INTO sanctuary_star_ledger (wallet_address, delta, kind, source, balance_after) VALUES (?, ?, ?, ?, ?)',
    ).run(addr, -GACHA_PULL_COST, 'spend', `gacha:${pick.itemKey}`, newBal);
    db.prepare(
      "INSERT INTO sanctuary_companion_inventory (wallet_address, item_key, source) VALUES (?, ?, 'gift')",
    ).run(addr, pick.itemKey);
    return newBal;
  });
  const balance = txn();
  return { itemKey: pick.itemKey, balance, isRare: pick.isRare };
}

describe('gacha persistence — every pull yields ≥1 cosmetic', () => {
  it('writes exactly one inventory row per pull', () => {
    const db = createDb();
    const rng = mulberry32(1);
    const before = (
      db.prepare(
        "SELECT COUNT(*) AS c FROM sanctuary_companion_inventory WHERE wallet_address = ?",
      ).get(ALICE) as { c: number }
    ).c;
    pullForTest(db, ALICE, rng);
    const after = (
      db.prepare(
        "SELECT COUNT(*) AS c FROM sanctuary_companion_inventory WHERE wallet_address = ?",
      ).get(ALICE) as { c: number }
    ).c;
    expect(after - before).toBe(1);
  });

  it('debits STAR by exactly GACHA_PULL_COST and writes a spend ledger row', () => {
    const db = createDb();
    const rng = mulberry32(2);
    const { balance } = pullForTest(db, ALICE, rng);
    expect(balance).toBe(100 - GACHA_PULL_COST);

    const ledger = db.prepare(
      "SELECT delta, kind, source FROM sanctuary_star_ledger WHERE wallet_address = ? AND kind = 'spend'",
    ).all(ALICE) as Array<{ delta: number; kind: string; source: string }>;
    expect(ledger.length).toBe(1);
    expect(ledger[0].delta).toBe(-GACHA_PULL_COST);
    expect(ledger[0].source).toMatch(/^gacha:/);
  });

  it('inserts inventory source as "gift" (gacha is a gift-source pathway)', () => {
    const db = createDb();
    const rng = mulberry32(3);
    pullForTest(db, ALICE, rng);
    const rows = db.prepare(
      'SELECT source FROM sanctuary_companion_inventory WHERE wallet_address = ?',
    ).all(ALICE) as Array<{ source: string }>;
    expect(rows[0].source).toBe('gift');
  });

  it('never returns a duplicate of an already-owned item', () => {
    const db = createDb();
    // Pull until catalog is exhausted (4 items).
    const rng = mulberry32(99);
    const pulled = new Set<string>();
    for (let i = 0; i < 4; i++) {
      // Top up so we don't run out of STAR.
      db.prepare(
        'UPDATE sanctuary_star_balance SET balance = 100 WHERE wallet_address = ?',
      ).run(ALICE);
      const { itemKey } = pullForTest(db, ALICE, rng);
      expect(pulled.has(itemKey)).toBe(false);
      pulled.add(itemKey);
    }
    expect(pulled.size).toBe(4);
  });

  it('rejects when balance < GACHA_PULL_COST without writing inventory', () => {
    const db = createDb();
    db.prepare(
      'UPDATE sanctuary_star_balance SET balance = 5 WHERE wallet_address = ?',
    ).run(ALICE);
    const rng = mulberry32(4);
    expect(() => pullForTest(db, ALICE, rng)).toThrow(/Insufficient/);
    const inv = (
      db.prepare(
        'SELECT COUNT(*) AS c FROM sanctuary_companion_inventory WHERE wallet_address = ?',
      ).get(ALICE) as { c: number }
    ).c;
    expect(inv).toBe(0);
  });

  it('throws GACHA_POOL_EMPTY when wallet already owns every item', () => {
    const db = createDb();
    db.prepare(
      "INSERT INTO sanctuary_companion_inventory (wallet_address, item_key, source) VALUES (?, ?, 'shop')",
    ).run(ALICE, 'hat_acorn_cap');
    db.prepare(
      "INSERT INTO sanctuary_companion_inventory (wallet_address, item_key, source) VALUES (?, ?, 'shop')",
    ).run(ALICE, 'hat_witch_hat');
    db.prepare(
      "INSERT INTO sanctuary_companion_inventory (wallet_address, item_key, source) VALUES (?, ?, 'shop')",
    ).run(ALICE, 'hat_gold_crown');
    db.prepare(
      "INSERT INTO sanctuary_companion_inventory (wallet_address, item_key, source) VALUES (?, ?, 'shop')",
    ).run(ALICE, 'hat_nebula_crown');
    const rng = mulberry32(5);
    expect(() => pullForTest(db, ALICE, rng)).toThrow(/GACHA_POOL_EMPTY/);
  });
});

// PR2 (expedition entry cost) confirmed landed — assertion-only test for
// the column and the spend source format used by start-expedition.
describe('expedition entry cost (PR2) — landed assertion', () => {
  it('sanctuary_expeditions has a star_cost column', () => {
    const db = createDb();
    const cols = db.prepare("PRAGMA table_info('sanctuary_expeditions')").all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain('star_cost');
  });
});
