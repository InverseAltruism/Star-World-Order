import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Tests cover the shop catalog + buy + inventory + equip flows. They run
// against an in-memory SQLite DB seeded with the V2.2 schema and replicate the
// same SQL the helpers in `lib/db.ts` use, mirroring the pattern established
// in `starCurrency.test.ts`.

const ALICE = '0x' + 'a'.repeat(40);
const TOKEN_ID = 3;

interface BalanceRow { balance: number; lifetime_earned: number }
interface ItemRow {
  id: number;
  item_key: string;
  name: string;
  category: string;
  rarity: string;
  star_cost: number;
  level_required: number;
  description: string | null;
  asset_key: string;
  created_at: string;
}

function loadSql(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'scripts', file), 'utf-8');
}

function createShopDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Stand up minimal upstream tables so v1 sanctuary schema's FK on token_id
  // and the user_xp lookup for level gating both resolve.
  db.exec(`
    CREATE TABLE star_skrumpey_metadata (
      token_id INTEGER PRIMARY KEY,
      name TEXT,
      constellation TEXT,
      aura TEXT,
      form TEXT,
      mood TEXT,
      eyes TEXT,
      background TEXT,
      hat TEXT,
      image_url TEXT,
      rarity_rank INTEGER,
      attributes_json TEXT
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

  // Token + companion fixtures
  db.prepare('INSERT INTO star_skrumpey_metadata (token_id, name) VALUES (?, ?)').run(TOKEN_ID, 'Star #3');
  db.prepare(
    "INSERT INTO sanctuary_companions (wallet_address, token_id, is_active, equipped_cosmetics) VALUES (?, ?, 1, '{}')"
  ).run(ALICE, TOKEN_ID);

  return db;
}

// Replicate the seed inserts (the lib/db seedSanctuaryCosmeticItems helper
// requires the singleton DB; we inline it here so tests stay isolated).
function seedItems(db: Database.Database): void {
  const items: Array<[string, string, string, string, number, number, string]> = [
    ['hat_acorn_cap', 'Acorn Cap', 'hat', 'common', 10, 1, 'hat_acorn_cap'],
    ['hat_witch_hat', 'Witch Hat', 'hat', 'uncommon', 20, 3, 'hat_witch_hat'],
    ['hat_nebula_crown', 'Nebula Crown', 'hat', 'legendary', 50, 10, 'hat_nebula_crown'],
    ['acc_star_pendant', 'Star Pendant', 'accessory', 'common', 10, 1, 'acc_star_pendant'],
    ['bg_starfield', 'Starfield', 'background', 'common', 10, 1, 'bg_starfield'],
    ['anim_gentle_bob', 'Gentle Bob', 'animation', 'common', 10, 1, 'anim_gentle_bob'],
  ];
  const insert = db.prepare(`
    INSERT INTO sanctuary_cosmetic_items
      (item_key, name, category, rarity, star_cost, level_required, asset_key)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const i of items) insert.run(...i);
}

function setBalance(db: Database.Database, addr: string, balance: number, lifetime?: number): void {
  const lt = lifetime ?? balance;
  db.prepare(
    'INSERT OR REPLACE INTO sanctuary_star_balance (wallet_address, balance, lifetime_earned) VALUES (?, ?, ?)'
  ).run(addr, balance, lt);
}

function setLevel(db: Database.Database, addr: string, level: number): void {
  db.prepare(
    'INSERT OR REPLACE INTO user_xp (wallet_address, total_xp, level) VALUES (?, 0, ?)'
  ).run(addr, level);
}

// Replicates the spend logic used by `spendStar` in lib/db.ts.
function spend(db: Database.Database, addr: string, amount: number, source: string): number {
  return db.transaction(() => {
    const row = db.prepare(
      'SELECT balance FROM sanctuary_star_balance WHERE wallet_address = ?'
    ).get(addr) as { balance: number } | undefined;
    const cur = row?.balance ?? 0;
    if (cur < amount) throw new Error('Insufficient STAR balance');
    const newBal = cur - amount;
    db.prepare(
      'UPDATE sanctuary_star_balance SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?'
    ).run(newBal, addr);
    db.prepare(
      'INSERT INTO sanctuary_star_ledger (wallet_address, delta, kind, source, balance_after) VALUES (?, ?, ?, ?, ?)'
    ).run(addr, -amount, 'spend', source, newBal);
    return newBal;
  })();
}

function buy(db: Database.Database, addr: string, itemKey: string): { item: ItemRow; balance: number } {
  const item = db.prepare(
    'SELECT * FROM sanctuary_cosmetic_items WHERE item_key = ?'
  ).get(itemKey) as ItemRow | undefined;
  if (!item) throw new Error('ITEM_NOT_FOUND');

  const lvl = (db.prepare('SELECT COALESCE(level, 1) AS level FROM user_xp WHERE wallet_address = ?').get(addr) as { level: number } | undefined)?.level ?? 1;
  if (lvl < item.level_required) throw new Error(`LEVEL_TOO_LOW:required=${item.level_required}:have=${lvl}`);

  const owned = db.prepare(
    'SELECT 1 as found FROM sanctuary_companion_inventory WHERE wallet_address = ? AND item_key = ? LIMIT 1'
  ).get(addr, itemKey) as { found: number } | undefined;
  if (owned) throw new Error('ALREADY_OWNED');

  const balance = spend(db, addr, item.star_cost, `shop:${itemKey}`);
  db.prepare(
    'INSERT INTO sanctuary_companion_inventory (wallet_address, item_key, source) VALUES (?, ?, ?)'
  ).run(addr, itemKey, 'shop');

  return { item, balance };
}

function equip(
  db: Database.Database,
  addr: string,
  tokenId: number,
  itemKey: string | null,
  slot?: string,
): Record<string, string | null> {
  const comp = db.prepare(
    'SELECT id, equipped_cosmetics FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?'
  ).get(addr, tokenId) as { id: number; equipped_cosmetics: string | null } | undefined;
  if (!comp) throw new Error('COMPANION_NOT_FOUND');

  let equipped: Record<string, string | null> = {};
  try {
    const parsed = comp.equipped_cosmetics ? JSON.parse(comp.equipped_cosmetics) : {};
    if (parsed && typeof parsed === 'object') equipped = parsed;
  } catch { /* ignore */ }

  if (itemKey === null) {
    if (!slot) throw new Error('SLOT_REQUIRED');
    equipped[slot] = null;
  } else {
    const item = db.prepare(
      'SELECT * FROM sanctuary_cosmetic_items WHERE item_key = ?'
    ).get(itemKey) as ItemRow | undefined;
    if (!item) throw new Error('ITEM_NOT_FOUND');
    const owned = db.prepare(
      'SELECT 1 as found FROM sanctuary_companion_inventory WHERE wallet_address = ? AND item_key = ? LIMIT 1'
    ).get(addr, itemKey) as { found: number } | undefined;
    if (!owned) throw new Error('NOT_OWNED');

    const lvl = (db.prepare('SELECT COALESCE(level, 1) AS level FROM user_xp WHERE wallet_address = ?').get(addr) as { level: number } | undefined)?.level ?? 1;
    if (lvl < item.level_required) throw new Error(`LEVEL_TOO_LOW:required=${item.level_required}:have=${lvl}`);

    const target = slot ?? item.category;
    if (equipped[target] === itemKey) throw new Error('ALREADY_EQUIPPED');
    equipped[target] = itemKey;
  }

  db.prepare(
    'UPDATE sanctuary_companions SET equipped_cosmetics = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(JSON.stringify(equipped), comp.id);
  return equipped;
}

// =====================================================================

describe('shop catalog schema', () => {
  let db: Database.Database;
  beforeEach(() => { db = createShopDb(); });

  it('creates cosmetic_items and companion_inventory tables', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'sanctuary_%'"
    ).all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('sanctuary_cosmetic_items');
    expect(names).toContain('sanctuary_companion_inventory');
  });

  it('enforces category check constraint', () => {
    expect(() => {
      db.prepare(
        'INSERT INTO sanctuary_cosmetic_items (item_key, name, category, star_cost, asset_key) VALUES (?, ?, ?, ?, ?)'
      ).run('bogus', 'Bogus', 'invalid_cat', 10, 'bogus');
    }).toThrow();
  });

  it('enforces unique item_key', () => {
    db.prepare(
      'INSERT INTO sanctuary_cosmetic_items (item_key, name, category, star_cost, asset_key) VALUES (?, ?, ?, ?, ?)'
    ).run('hat_one', 'One', 'hat', 10, 'hat_one');
    expect(() => {
      db.prepare(
        'INSERT INTO sanctuary_cosmetic_items (item_key, name, category, star_cost, asset_key) VALUES (?, ?, ?, ?, ?)'
      ).run('hat_one', 'Dup', 'hat', 20, 'hat_one');
    }).toThrow();
  });

  it('enforces unique (wallet, item_key) on inventory', () => {
    db.prepare(
      'INSERT INTO sanctuary_cosmetic_items (item_key, name, category, star_cost, asset_key) VALUES (?, ?, ?, ?, ?)'
    ).run('hat_one', 'One', 'hat', 10, 'hat_one');
    db.prepare(
      'INSERT INTO sanctuary_companion_inventory (wallet_address, item_key, source) VALUES (?, ?, ?)'
    ).run(ALICE, 'hat_one', 'shop');
    expect(() => {
      db.prepare(
        'INSERT INTO sanctuary_companion_inventory (wallet_address, item_key, source) VALUES (?, ?, ?)'
      ).run(ALICE, 'hat_one', 'shop');
    }).toThrow();
  });
});

describe('shop buy flow', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createShopDb();
    seedItems(db);
    setLevel(db, ALICE, 5);
    setBalance(db, ALICE, 100);
  });

  it('debits STAR, writes ledger, and adds inventory row', () => {
    const result = buy(db, ALICE, 'hat_acorn_cap');
    expect(result.item.star_cost).toBe(10);
    expect(result.balance).toBe(90);

    const bal = db.prepare(
      'SELECT balance, lifetime_earned FROM sanctuary_star_balance WHERE wallet_address = ?'
    ).get(ALICE) as BalanceRow;
    expect(bal.balance).toBe(90);
    expect(bal.lifetime_earned).toBe(100);

    const ledger = db.prepare(
      "SELECT * FROM sanctuary_star_ledger WHERE wallet_address = ? AND kind = 'spend'"
    ).all(ALICE) as Array<{ delta: number; source: string }>;
    expect(ledger.length).toBe(1);
    expect(ledger[0].delta).toBe(-10);
    expect(ledger[0].source).toBe('shop:hat_acorn_cap');

    const inv = db.prepare(
      'SELECT item_key FROM sanctuary_companion_inventory WHERE wallet_address = ?'
    ).all(ALICE) as Array<{ item_key: string }>;
    expect(inv.map((r) => r.item_key)).toEqual(['hat_acorn_cap']);
  });

  it('rejects when balance is insufficient and leaves balance unchanged', () => {
    setBalance(db, ALICE, 5);
    expect(() => buy(db, ALICE, 'hat_acorn_cap')).toThrow(/Insufficient/);
    const bal = db.prepare('SELECT balance FROM sanctuary_star_balance WHERE wallet_address = ?').get(ALICE) as BalanceRow;
    expect(bal.balance).toBe(5);

    const inv = db.prepare(
      'SELECT 1 as f FROM sanctuary_companion_inventory WHERE wallet_address = ? AND item_key = ?'
    ).get(ALICE, 'hat_acorn_cap');
    expect(inv).toBeUndefined();
  });

  it('blocks repurchase of an already-owned item', () => {
    buy(db, ALICE, 'hat_acorn_cap');
    expect(() => buy(db, ALICE, 'hat_acorn_cap')).toThrow(/ALREADY_OWNED/);
    const count = (db.prepare(
      'SELECT COUNT(*) as c FROM sanctuary_companion_inventory WHERE wallet_address = ?'
    ).get(ALICE) as { c: number }).c;
    expect(count).toBe(1);
  });

  it('enforces level_required gating', () => {
    setLevel(db, ALICE, 2); // Witch Hat needs level 3
    setBalance(db, ALICE, 100);
    expect(() => buy(db, ALICE, 'hat_witch_hat')).toThrow(/LEVEL_TOO_LOW/);
    // No STAR debited on level reject
    const bal = db.prepare('SELECT balance FROM sanctuary_star_balance WHERE wallet_address = ?').get(ALICE) as BalanceRow;
    expect(bal.balance).toBe(100);
  });

  it('rejects unknown items', () => {
    expect(() => buy(db, ALICE, 'not_a_real_item')).toThrow(/ITEM_NOT_FOUND/);
  });
});

describe('shop equip flow', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createShopDb();
    seedItems(db);
    setLevel(db, ALICE, 5);
    setBalance(db, ALICE, 100);
    buy(db, ALICE, 'hat_acorn_cap');
    buy(db, ALICE, 'acc_star_pendant');
    buy(db, ALICE, 'bg_starfield');
  });

  it('writes the item to the matching slot', () => {
    const eq = equip(db, ALICE, TOKEN_ID, 'hat_acorn_cap');
    expect(eq.hat).toBe('hat_acorn_cap');

    const stored = db.prepare(
      'SELECT equipped_cosmetics FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?'
    ).get(ALICE, TOKEN_ID) as { equipped_cosmetics: string };
    expect(JSON.parse(stored.equipped_cosmetics).hat).toBe('hat_acorn_cap');
  });

  it('rejects equipping an item the wallet does not own', () => {
    expect(() => equip(db, ALICE, TOKEN_ID, 'hat_witch_hat')).toThrow(/NOT_OWNED/);
  });

  it('blocks equipping the same item twice into the same slot', () => {
    equip(db, ALICE, TOKEN_ID, 'hat_acorn_cap');
    expect(() => equip(db, ALICE, TOKEN_ID, 'hat_acorn_cap')).toThrow(/ALREADY_EQUIPPED/);
  });

  it('allows swapping items in the same slot when wallet owns both', () => {
    // Buy a second hat with proper level (already 5)
    db.prepare(
      'INSERT INTO sanctuary_cosmetic_items (item_key, name, category, rarity, star_cost, level_required, asset_key) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('hat_blue', 'Blue Cap', 'hat', 'common', 10, 1, 'hat_blue');
    setBalance(db, ALICE, 100);
    buy(db, ALICE, 'hat_blue');

    equip(db, ALICE, TOKEN_ID, 'hat_acorn_cap');
    const eq = equip(db, ALICE, TOKEN_ID, 'hat_blue');
    expect(eq.hat).toBe('hat_blue');
  });

  it('supports unequip with item_key=null + slot', () => {
    equip(db, ALICE, TOKEN_ID, 'hat_acorn_cap');
    const eq = equip(db, ALICE, TOKEN_ID, null, 'hat');
    expect(eq.hat).toBeNull();
  });

  it('keeps slots independent (equipping hat does not touch accessory)', () => {
    equip(db, ALICE, TOKEN_ID, 'hat_acorn_cap');
    const eq = equip(db, ALICE, TOKEN_ID, 'acc_star_pendant');
    expect(eq.hat).toBe('hat_acorn_cap');
    expect(eq.accessory).toBe('acc_star_pendant');
  });

  it('supports background and animation slots', () => {
    setBalance(db, ALICE, 100);
    buy(db, ALICE, 'anim_gentle_bob');
    const eq1 = equip(db, ALICE, TOKEN_ID, 'bg_starfield');
    expect(eq1.background).toBe('bg_starfield');
    const eq2 = equip(db, ALICE, TOKEN_ID, 'anim_gentle_bob');
    expect(eq2.animation).toBe('anim_gentle_bob');
  });
});

describe('shop catalog query', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createShopDb();
    seedItems(db);
  });

  it('sorts items by price within a category', () => {
    const rows = db.prepare(
      "SELECT item_key, star_cost FROM sanctuary_cosmetic_items WHERE category = 'hat' ORDER BY star_cost ASC"
    ).all() as Array<{ item_key: string; star_cost: number }>;
    expect(rows[0].item_key).toBe('hat_acorn_cap');
    expect(rows[rows.length - 1].item_key).toBe('hat_nebula_crown');
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].star_cost).toBeGreaterThanOrEqual(rows[i - 1].star_cost);
    }
  });
});

describe('seeded shop catalog (V2.2 lib helpers)', () => {
  it('exports the expected COSMETIC_CATEGORIES list', async () => {
    const { COSMETIC_CATEGORIES } = await import('@/lib/db');
    expect([...COSMETIC_CATEGORIES]).toEqual(['hat', 'accessory', 'background', 'animation']);
  });
});
