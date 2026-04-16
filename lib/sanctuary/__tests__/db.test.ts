import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE star_skrumpey_metadata (
      token_id INTEGER PRIMARY KEY,
      name TEXT,
      constellation TEXT,
      aura TEXT,
      form TEXT,
      mood TEXT,
      eyes TEXT,
      background TEXT
    )
  `);

  db.exec(`
    CREATE TABLE user_xp (
      wallet_address TEXT PRIMARY KEY,
      total_xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1
    )
  `);

  db.exec(`
    CREATE TABLE user_profiles (
      wallet_address TEXT PRIMARY KEY,
      display_name TEXT
    )
  `);

  const sanctuarySql = fs.readFileSync(
    path.join(process.cwd(), 'scripts', 'init-sanctuary.sql'), 'utf-8'
  );
  db.exec(sanctuarySql);

  db.prepare('INSERT INTO star_skrumpey_metadata (token_id, name, constellation, aura, form, mood) VALUES (?, ?, ?, ?, ?, ?)')
    .run(3, 'Star #3', 'aether', 'mystic', 'classic', 'happy');
  db.prepare('INSERT INTO star_skrumpey_metadata (token_id, name, constellation, aura, form, mood) VALUES (?, ?, ?, ?, ?, ?)')
    .run(17, 'Star #17', 'spectra', 'radiant', 'evolved', 'calm');
  db.prepare('INSERT INTO star_skrumpey_metadata (token_id, name, constellation, aura, form, mood) VALUES (?, ?, ?, ?, ?, ?)')
    .run(20, 'Star #20', 'solveil', 'bright', 'prime', 'excited');

  db.prepare('INSERT INTO user_xp (wallet_address, total_xp, level) VALUES (?, ?, ?)')
    .run('0xalice', 500, 5);
  db.prepare('INSERT INTO user_xp (wallet_address, total_xp, level) VALUES (?, ?, ?)')
    .run('0xbob', 100, 2);

  return db;
}

describe('Sanctuary Schema', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDb();
  });

  it('creates sanctuary_companions table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'sanctuary_%'").all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('sanctuary_companions');
    expect(names).toContain('sanctuary_map_locations');
    expect(names).toContain('sanctuary_journal');
  });

  it('enforces unique wallet+token constraint', () => {
    db.prepare('INSERT INTO sanctuary_companions (wallet_address, token_id, is_active) VALUES (?, ?, ?)').run('0xalice', 3, 1);
    expect(() => {
      db.prepare('INSERT INTO sanctuary_companions (wallet_address, token_id, is_active) VALUES (?, ?, ?)').run('0xalice', 3, 0);
    }).toThrow();
  });

  it('enforces foreign key to star_skrumpey_metadata', () => {
    expect(() => {
      db.prepare('INSERT INTO sanctuary_companions (wallet_address, token_id, is_active) VALUES (?, ?, ?)').run('0xalice', 99999, 0);
    }).toThrow();
  });

  it('enforces journal entry_type check constraint', () => {
    expect(() => {
      db.prepare("INSERT INTO sanctuary_journal (wallet_address, token_id, entry_type, content) VALUES (?, ?, ?, ?)")
        .run('0xalice', 3, 'invalid_type', 'test');
    }).toThrow();
  });
});

describe('Companion Selection', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDb();
  });

  it('selects a companion and marks it active', () => {
    db.prepare('INSERT INTO sanctuary_companions (wallet_address, token_id, is_active) VALUES (?, ?, ?)').run('0xalice', 3, 1);
    const row = db.prepare('SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND is_active = 1').get('0xalice') as any;
    expect(row).toBeTruthy();
    expect(row.token_id).toBe(3);
    expect(row.bond_score).toBe(0.0);
    expect(row.current_activity).toBe('lounging');
  });

  it('switching deactivates previous and activates new', () => {
    db.prepare('UPDATE sanctuary_companions SET is_active = 0 WHERE wallet_address = ?').run('0xalice');
    db.prepare('INSERT INTO sanctuary_companions (wallet_address, token_id, is_active) VALUES (?, ?, ?)').run('0xalice', 17, 1);

    const active = db.prepare('SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND is_active = 1').all('0xalice') as any[];
    expect(active.length).toBe(1);
    expect(active[0].token_id).toBe(17);

    const old = db.prepare('SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?').get('0xalice', 3) as any;
    expect(old.is_active).toBe(0);
  });

  it('preserves per-token progress on switch', () => {
    db.prepare('UPDATE sanctuary_companions SET bond_score = 5.5, total_interactions = 10 WHERE wallet_address = ? AND token_id = ?')
      .run('0xalice', 3);

    db.prepare('UPDATE sanctuary_companions SET is_active = 0 WHERE wallet_address = ?').run('0xalice');
    db.prepare('UPDATE sanctuary_companions SET is_active = 1 WHERE wallet_address = ? AND token_id = ?').run('0xalice', 3);

    const restored = db.prepare('SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?').get('0xalice', 3) as any;
    expect(restored.bond_score).toBe(5.5);
    expect(restored.total_interactions).toBe(10);
    expect(restored.is_active).toBe(1);
  });

  it('different wallets have independent companions', () => {
    db.prepare('INSERT INTO sanctuary_companions (wallet_address, token_id, is_active) VALUES (?, ?, ?)').run('0xbob', 20, 1);

    const aliceActive = db.prepare('SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND is_active = 1').get('0xalice') as any;
    const bobActive = db.prepare('SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND is_active = 1').get('0xbob') as any;

    expect(aliceActive.token_id).toBe(3);
    expect(bobActive.token_id).toBe(20);
  });
});

describe('Companion + Metadata Join', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDb();
    db.prepare('INSERT INTO sanctuary_companions (wallet_address, token_id, is_active) VALUES (?, ?, ?)').run('0xalice', 3, 1);
  });

  it('joins companion with NFT metadata and XP', () => {
    const row = db.prepare(`
      SELECT sc.*, ssm.constellation, ssm.aura, ssm.form, ssm.mood,
             COALESCE(ux.total_xp, 0) as total_xp, COALESCE(ux.level, 1) as level
      FROM sanctuary_companions sc
      JOIN star_skrumpey_metadata ssm ON sc.token_id = ssm.token_id
      LEFT JOIN user_xp ux ON sc.wallet_address = ux.wallet_address
      WHERE sc.wallet_address = ? AND sc.is_active = 1
    `).get('0xalice') as any;

    expect(row).toBeTruthy();
    expect(row.token_id).toBe(3);
    expect(row.constellation).toBe('aether');
    expect(row.aura).toBe('mystic');
    expect(row.total_xp).toBe(500);
    expect(row.level).toBe(5);
  });

  it('returns level 1 for wallet with no XP', () => {
    db.prepare('INSERT INTO sanctuary_companions (wallet_address, token_id, is_active) VALUES (?, ?, ?)').run('0xcharlie', 17, 1);

    const row = db.prepare(`
      SELECT sc.*, COALESCE(ux.total_xp, 0) as total_xp, COALESCE(ux.level, 1) as level
      FROM sanctuary_companions sc
      LEFT JOIN user_xp ux ON sc.wallet_address = ux.wallet_address
      WHERE sc.wallet_address = ? AND sc.is_active = 1
    `).get('0xcharlie') as any;

    expect(row.total_xp).toBe(0);
    expect(row.level).toBe(1);
  });
});

describe('Journal', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDb();
  });

  it('records journal entries', () => {
    db.prepare("INSERT INTO sanctuary_journal (wallet_address, token_id, entry_type, content) VALUES (?, ?, ?, ?)")
      .run('0xalice', 3, 'system', 'Companion awakened.');
    db.prepare("INSERT INTO sanctuary_journal (wallet_address, token_id, entry_type, content) VALUES (?, ?, ?, ?)")
      .run('0xalice', 3, 'interaction', 'Fed a cosmic treat.');

    const entries = db.prepare('SELECT * FROM sanctuary_journal WHERE wallet_address = ? AND token_id = ? ORDER BY id DESC')
      .all('0xalice', 3) as any[];

    expect(entries.length).toBe(2);
    expect(entries[0].entry_type).toBe('interaction');
    expect(entries[1].entry_type).toBe('system');
  });

  it('journal entries are per-companion', () => {
    db.prepare("INSERT INTO sanctuary_journal (wallet_address, token_id, entry_type, content) VALUES (?, ?, ?, ?)")
      .run('0xalice', 17, 'system', 'Different companion journal.');

    const token3 = db.prepare('SELECT COUNT(*) as count FROM sanctuary_journal WHERE wallet_address = ? AND token_id = ?')
      .get('0xalice', 3) as { count: number };
    const token17 = db.prepare('SELECT COUNT(*) as count FROM sanctuary_journal WHERE wallet_address = ? AND token_id = ?')
      .get('0xalice', 17) as { count: number };

    expect(token3.count).toBe(2);
    expect(token17.count).toBe(1);
  });
});

describe('Companion Interactions', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDb();
    db.prepare('INSERT INTO sanctuary_companions (wallet_address, token_id, is_active, bond_score, total_interactions) VALUES (?, ?, ?, ?, ?)')
      .run('0xalice', 3, 1, 2.0, 5);
  });

  it('feed increases bond by 0.5 and increments interactions', () => {
    db.prepare('UPDATE sanctuary_companions SET bond_score = bond_score + 0.5, total_interactions = total_interactions + 1, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ? AND token_id = ? AND is_active = 1')
      .run('0xalice', 3);
    db.prepare("INSERT INTO sanctuary_journal (wallet_address, token_id, entry_type, content, metadata) VALUES (?, ?, ?, ?, ?)")
      .run('0xalice', 3, 'interaction', 'Enjoyed a tasty cosmic treat. Bond strengthened!', '{"action":"feed"}');

    const comp = db.prepare('SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?').get('0xalice', 3) as any;
    expect(comp.bond_score).toBe(2.5);
    expect(comp.total_interactions).toBe(6);

    const journal = db.prepare("SELECT * FROM sanctuary_journal WHERE wallet_address = ? AND token_id = ? ORDER BY id DESC LIMIT 1").get('0xalice', 3) as any;
    expect(journal.entry_type).toBe('interaction');
    expect(JSON.parse(journal.metadata).action).toBe('feed');
  });

  it('bond_score caps at 100', () => {
    db.prepare('UPDATE sanctuary_companions SET bond_score = 99.8 WHERE wallet_address = ? AND token_id = ?').run('0xalice', 3);
    db.prepare('UPDATE sanctuary_companions SET bond_score = MIN(bond_score + 0.5, 100.0) WHERE wallet_address = ? AND token_id = ?').run('0xalice', 3);

    const comp = db.prepare('SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?').get('0xalice', 3) as any;
    expect(comp.bond_score).toBe(100.0);
  });
});

describe('Map Locations', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createTestDb();

    const locations = [
      { name: 'Hot Springs', desc: 'Relaxing.', x: 0.2, y: 0.3, level: 1 },
      { name: 'Training Grounds', desc: 'Practice.', x: 0.7, y: 0.2, level: 1 },
      { name: 'Aura Forge', desc: 'Power.', x: 0.9, y: 0.4, level: 5 },
    ];
    const insert = db.prepare('INSERT INTO sanctuary_map_locations (name, description, position_x, position_y, unlock_level) VALUES (?, ?, ?, ?, ?)');
    for (const loc of locations) {
      insert.run(loc.name, loc.desc, loc.x, loc.y, loc.level);
    }
  });

  it('returns seeded locations', () => {
    const locs = db.prepare('SELECT * FROM sanctuary_map_locations ORDER BY unlock_level, name').all() as any[];
    expect(locs.length).toBe(3);
    expect(locs[0].name).toBe('Hot Springs');
    expect(locs[2].name).toBe('Aura Forge');
    expect(locs[2].unlock_level).toBe(5);
  });

  it('enforces unique location names', () => {
    expect(() => {
      db.prepare('INSERT INTO sanctuary_map_locations (name, position_x, position_y) VALUES (?, ?, ?)').run('Hot Springs', 0, 0);
    }).toThrow();
  });
});
