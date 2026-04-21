/**
 * Seed star_skrumpey_metadata from the canonical Skrumpey corpus.
 * Run: npx tsx scripts/seed-skrumpey-metadata.ts
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DATABASE_URL?.replace('file:', '') ||
  path.join(process.cwd(), 'data', 'swo.db');

const SANCTUARY_JSON = path.join(process.cwd(), 'data', 'sanctuary', 'skrumpey_sanctuary.json');

interface CorpusToken {
  id: number;
  name: string;
  traits: Record<string, string>;
  traitCount: number;
  rarityRank: number;
  rarityScore: number;
  image: string;
}

function seed() {
  if (!fs.existsSync(SANCTUARY_JSON)) {
    console.error('Sanctuary corpus not found at', SANCTUARY_JSON);
    process.exit(1);
  }

  const corpus: CorpusToken[] = JSON.parse(fs.readFileSync(SANCTUARY_JSON, 'utf-8'));
  console.log(`Loaded ${corpus.length} tokens from corpus`);

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Ensure new columns exist on existing tables
  const newCols = ['hat','gaze','relic','pet','fit','attitude','scene','extra','submerged','rarity_rank','rarity_score','trait_count'];
  for (const col of newCols) {
    try {
      const colType = ['rarity_rank','trait_count'].includes(col) ? 'INTEGER' : col === 'rarity_score' ? 'REAL' : 'TEXT';
      db.exec(`ALTER TABLE star_skrumpey_metadata ADD COLUMN ${col} ${colType}`);
      console.log(`Added column: ${col}`);
    } catch { /* already exists */ }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS star_skrumpey_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT NOT NULL,
      constellation TEXT,
      aura TEXT,
      background TEXT,
      eyes TEXT,
      form TEXT,
      mood TEXT,
      hat TEXT,
      gaze TEXT,
      relic TEXT,
      pet TEXT,
      fit TEXT,
      attitude TEXT,
      scene TEXT,
      extra TEXT,
      submerged TEXT,
      rarity_rank INTEGER,
      rarity_score REAL,
      trait_count INTEGER,
      attributes_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const upsert = db.prepare(`
    INSERT INTO star_skrumpey_metadata (
      token_id, name, description, image_url,
      constellation, aura, background, eyes, form, mood,
      hat, gaze, relic, pet, fit, attitude, scene, extra, submerged,
      rarity_rank, rarity_score, trait_count, attributes_json
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?
    ) ON CONFLICT(token_id) DO UPDATE SET
      name = excluded.name,
      image_url = excluded.image_url,
      constellation = excluded.constellation,
      aura = excluded.aura,
      background = excluded.background,
      eyes = excluded.eyes,
      form = excluded.form,
      mood = excluded.mood,
      hat = excluded.hat,
      gaze = excluded.gaze,
      relic = excluded.relic,
      pet = excluded.pet,
      fit = excluded.fit,
      attitude = excluded.attitude,
      scene = excluded.scene,
      extra = excluded.extra,
      submerged = excluded.submerged,
      rarity_rank = excluded.rarity_rank,
      rarity_score = excluded.rarity_score,
      trait_count = excluded.trait_count,
      attributes_json = excluded.attributes_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  const description = "A collection of 3,333 pixel art pfpNFTs capturing Monad's spirit. Created by melo.";

  const insertAll = db.transaction(() => {
    for (const token of corpus) {
      const t = token.traits;
      upsert.run(
        token.id,
        token.name,
        description,
        token.image,
        t.constellation ?? null,
        t.aura ?? null,
        t.background ?? null,
        t.eyes ?? null,
        t.form ?? null,
        t.mood ?? null,
        t.hat ?? null,
        t.gaze ?? null,
        t.relic ?? null,
        t.pet ?? null,
        t.fit ?? null,
        t.attitude ?? null,
        t.scene ?? null,
        t.extra ?? null,
        t.submerged ?? null,
        token.rarityRank,
        token.rarityScore,
        token.traitCount,
        JSON.stringify(token.traits),
      );
    }
  });

  insertAll();

  const count = (db.prepare('SELECT COUNT(*) as c FROM star_skrumpey_metadata').get() as { c: number }).c;
  console.log(`Seeded ${count} tokens into star_skrumpey_metadata`);

  db.close();
}

seed();
