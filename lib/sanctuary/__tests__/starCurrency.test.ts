import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// We test the SQL/logic for STAR currency by replicating the helpers'
// transactions against an in-memory DB. This mirrors the pattern used by
// `sanctuary.test.ts` and avoids reaching into the singleton `getDatabase()`.

const ALICE = '0x' + 'a'.repeat(40);
const BOB = '0x' + 'b'.repeat(40);

function createStarDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const sqlPath = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.1.sql');
  db.exec(fs.readFileSync(sqlPath, 'utf-8'));
  return db;
}

interface BalanceRow { balance: number; lifetime_earned: number }
interface LedgerRow { id: number; delta: number; kind: string; source: string; balance_after: number }

function earn(db: Database.Database, addr: string, amount: number, source: string) {
  return db.transaction(() => {
    const existing = db.prepare(
      'SELECT balance, lifetime_earned FROM sanctuary_star_balance WHERE wallet_address = ?'
    ).get(addr) as BalanceRow | undefined;
    const newBalance = (existing?.balance ?? 0) + amount;
    const newLifetime = (existing?.lifetime_earned ?? 0) + amount;
    if (existing) {
      db.prepare(
        'UPDATE sanctuary_star_balance SET balance = ?, lifetime_earned = ?, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?'
      ).run(newBalance, newLifetime, addr);
    } else {
      db.prepare(
        'INSERT INTO sanctuary_star_balance (wallet_address, balance, lifetime_earned) VALUES (?, ?, ?)'
      ).run(addr, newBalance, newLifetime);
    }
    db.prepare(
      'INSERT INTO sanctuary_star_ledger (wallet_address, delta, kind, source, balance_after) VALUES (?, ?, ?, ?, ?)'
    ).run(addr, amount, 'earn', source, newBalance);
    return { balance: newBalance, lifetime_earned: newLifetime };
  })();
}

function spend(db: Database.Database, addr: string, amount: number, source: string) {
  return db.transaction(() => {
    const existing = db.prepare(
      'SELECT balance, lifetime_earned FROM sanctuary_star_balance WHERE wallet_address = ?'
    ).get(addr) as BalanceRow | undefined;
    const cur = existing?.balance ?? 0;
    if (cur < amount) throw new Error('Insufficient STAR balance');
    const newBalance = cur - amount;
    db.prepare(
      'UPDATE sanctuary_star_balance SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?'
    ).run(newBalance, addr);
    db.prepare(
      'INSERT INTO sanctuary_star_ledger (wallet_address, delta, kind, source, balance_after) VALUES (?, ?, ?, ?, ?)'
    ).run(addr, -amount, 'spend', source, newBalance);
    return { balance: newBalance, lifetime_earned: existing?.lifetime_earned ?? 0 };
  })();
}

describe('STAR currency schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createStarDb();
  });

  it('creates the balance table with expected columns and PK', () => {
    const cols = db.prepare(`PRAGMA table_info(sanctuary_star_balance)`).all() as Array<{ name: string; pk: number }>;
    const names = cols.map((c) => c.name).sort();
    expect(names).toEqual(['balance', 'lifetime_earned', 'updated_at', 'wallet_address']);
    const pk = cols.find((c) => c.pk === 1);
    expect(pk?.name).toBe('wallet_address');
  });

  it('creates the ledger table with kind constraint', () => {
    expect(() => {
      db.prepare(
        'INSERT INTO sanctuary_star_ledger (wallet_address, delta, kind, source, balance_after) VALUES (?, ?, ?, ?, ?)'
      ).run(ALICE, 10, 'invalid_kind', 'test', 10);
    }).toThrow();
  });

  it('returns zero for a wallet with no balance row', () => {
    const row = db.prepare('SELECT * FROM sanctuary_star_balance WHERE wallet_address = ?').get(ALICE);
    expect(row).toBeUndefined();
  });
});

describe('STAR earn flow', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createStarDb();
  });

  it('credits balance and lifetime_earned, writes a ledger entry', () => {
    const result = earn(db, ALICE, 25, 'quest:1');
    expect(result.balance).toBe(25);
    expect(result.lifetime_earned).toBe(25);

    const ledger = db.prepare('SELECT * FROM sanctuary_star_ledger WHERE wallet_address = ?').all(ALICE) as LedgerRow[];
    expect(ledger.length).toBe(1);
    expect(ledger[0].kind).toBe('earn');
    expect(ledger[0].delta).toBe(25);
    expect(ledger[0].balance_after).toBe(25);
    expect(ledger[0].source).toBe('quest:1');
  });

  it('accumulates multiple earns', () => {
    earn(db, ALICE, 10, 'daily_login');
    earn(db, ALICE, 25, 'minigame_first:dodge');
    const r = earn(db, ALICE, 50, 'levelup');
    expect(r.balance).toBe(85);
    expect(r.lifetime_earned).toBe(85);

    const count = (db.prepare('SELECT COUNT(*) as c FROM sanctuary_star_ledger WHERE wallet_address = ?').get(ALICE) as { c: number }).c;
    expect(count).toBe(3);
  });

  it('isolates wallets', () => {
    earn(db, ALICE, 30, 'quest:2');
    earn(db, BOB, 5, 'daily_login');
    const aliceBal = (db.prepare('SELECT balance FROM sanctuary_star_balance WHERE wallet_address = ?').get(ALICE) as BalanceRow).balance;
    const bobBal = (db.prepare('SELECT balance FROM sanctuary_star_balance WHERE wallet_address = ?').get(BOB) as BalanceRow).balance;
    expect(aliceBal).toBe(30);
    expect(bobBal).toBe(5);
  });
});

describe('STAR spend flow', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createStarDb();
    earn(db, ALICE, 50, 'quest:3');
  });

  it('deducts from balance but leaves lifetime_earned untouched', () => {
    const r = spend(db, ALICE, 20, 'shop:hat_acorn');
    expect(r.balance).toBe(30);
    expect(r.lifetime_earned).toBe(50);
  });

  it('rejects spend that exceeds balance and leaves balance unchanged', () => {
    expect(() => spend(db, ALICE, 100, 'shop:bg_galaxy')).toThrow(/Insufficient/);
    const bal = (db.prepare('SELECT balance, lifetime_earned FROM sanctuary_star_balance WHERE wallet_address = ?').get(ALICE) as BalanceRow);
    expect(bal.balance).toBe(50);
    expect(bal.lifetime_earned).toBe(50);
  });

  it('writes a negative-delta spend entry to the ledger', () => {
    spend(db, ALICE, 15, 'shop:accessory_scarf');
    const ledger = db.prepare(
      "SELECT * FROM sanctuary_star_ledger WHERE wallet_address = ? AND kind = 'spend'"
    ).all(ALICE) as LedgerRow[];
    expect(ledger.length).toBe(1);
    expect(ledger[0].delta).toBe(-15);
    expect(ledger[0].balance_after).toBe(35);
    expect(ledger[0].source).toBe('shop:accessory_scarf');
  });
});

describe('STAR earn-rate guardrails (constants)', () => {
  it('exports the documented earn rate ranges', async () => {
    const { STAR_EARN_RATES } = await import('@/lib/db');
    expect(STAR_EARN_RATES.quest).toEqual({ min: 10, max: 50 });
    expect(STAR_EARN_RATES.minigame_first).toEqual({ min: 25, max: 25 });
    expect(STAR_EARN_RATES.daily_login).toEqual({ min: 5, max: 5 });
    expect(STAR_EARN_RATES.activity).toEqual({ min: 5, max: 20 });
    expect(STAR_EARN_RATES.levelup).toEqual({ min: 50, max: 50 });
  });
});
