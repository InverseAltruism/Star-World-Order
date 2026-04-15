import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// --- Wallet addresses ---
export const WALLETS = {
  alice: '0x' + 'a'.repeat(40),
  bob: '0x' + 'b'.repeat(40),
  charlie: '0x' + 'c'.repeat(40),
  unauthorized: '0x' + 'f'.repeat(40),
} as const;

// --- Star Skrumpey tokens (must be in STAR_SKRUMPEY_IDS allow-list: 3, 17, 20, 23, ...) ---
export const TOKENS = {
  aether: { id: 3, name: 'Star #3', constellation: 'aether', aura: 'mystic', form: 'classic', mood: 'happy' },
  spectra: { id: 17, name: 'Star #17', constellation: 'spectra', aura: 'radiant', form: 'evolved', mood: 'calm' },
  solveil: { id: 20, name: 'Star #20', constellation: 'solveil', aura: 'bright', form: 'prime', mood: 'excited' },
  nebulu: { id: 23, name: 'Star #23', constellation: 'nebulu', aura: 'cosmic', form: 'astral', mood: 'serene' },
} as const;

export const NON_STAR_TOKEN = { id: 99999, name: 'Skrumpey #99999' };

// --- DB factory ---
export function createSanctuaryDb(): Database.Database {
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

  const insertMeta = db.prepare(
    'INSERT INTO star_skrumpey_metadata (token_id, name, constellation, aura, form, mood) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const t of Object.values(TOKENS)) {
    insertMeta.run(t.id, t.name, t.constellation, t.aura, t.form, t.mood);
  }

  const insertXp = db.prepare('INSERT INTO user_xp (wallet_address, total_xp, level) VALUES (?, ?, ?)');
  insertXp.run(WALLETS.alice, 500, 5);
  insertXp.run(WALLETS.bob, 100, 2);

  return db;
}

// --- Seeded state: alice owns token 3 (active) and 17 (inactive), bob owns 20 ---
export function createSeededDb(): Database.Database {
  const db = createSanctuaryDb();

  const insertComp = db.prepare(`
    INSERT INTO sanctuary_companions (wallet_address, token_id, is_active, current_activity, bond_score, total_interactions)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertComp.run(WALLETS.alice, TOKENS.aether.id, 1, 'exploring', 3.5, 15);
  insertComp.run(WALLETS.alice, TOKENS.spectra.id, 0, 'resting', 1.2, 4);
  insertComp.run(WALLETS.bob, TOKENS.solveil.id, 1, 'lounging', 0.0, 0);

  const insertJournal = db.prepare(
    "INSERT INTO sanctuary_journal (wallet_address, token_id, entry_type, content) VALUES (?, ?, ?, ?)"
  );
  insertJournal.run(WALLETS.alice, TOKENS.aether.id, 'system', 'Companion awakened.');
  insertJournal.run(WALLETS.alice, TOKENS.aether.id, 'interaction', 'Fed a cosmic treat.');
  insertJournal.run(WALLETS.bob, TOKENS.solveil.id, 'system', 'Companion awakened.');

  const locations = [
    { name: 'Hot Springs', desc: 'Relaxing.', x: 0.2, y: 0.3, level: 1 },
    { name: 'Training Grounds', desc: 'Practice.', x: 0.7, y: 0.2, level: 1 },
    { name: 'Aura Forge', desc: 'Power.', x: 0.9, y: 0.4, level: 5 },
  ];
  const insertLoc = db.prepare(
    'INSERT INTO sanctuary_map_locations (name, description, position_x, position_y, unlock_level) VALUES (?, ?, ?, ?, ?)'
  );
  for (const loc of locations) {
    insertLoc.run(loc.name, loc.desc, loc.x, loc.y, loc.level);
  }

  return db;
}
