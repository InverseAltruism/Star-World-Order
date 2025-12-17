#!/usr/bin/env node
/**
 * Populate Database from Static Constellation Data
 * 
 * This script populates the star_skrumpey_metadata table with constellation data
 * from the static STAR_CONSTELLATION_MAP. This is a FALLBACK solution for environments
 * where IPFS is not accessible.
 * 
 * ⚠️ IMPORTANT: This uses the static map which may contain placeholder/incorrect data.
 * For accurate data, use: npm run db:fetch-metadata (which fetches from IPFS)
 * 
 * Usage:
 *   npx tsx scripts/populate-db-from-static.ts
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { STAR_CONSTELLATION_MAP } from '../data/starConstellationData';

const SKRUMPEY_IMAGE_BASE = 'https://ipfs-proxy.magiceden.dev/ipfs/bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu';

function initializeDatabase(dbPath: string): Database.Database {
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  
  // Ensure table exists
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
      attributes_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_star_skrumpey_metadata_token ON star_skrumpey_metadata(token_id);
    CREATE INDEX IF NOT EXISTS idx_star_skrumpey_metadata_constellation ON star_skrumpey_metadata(constellation);
  `);
  
  return db;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Populate Database from Static Constellation Data');
  console.log('='.repeat(60));
  console.log('⚠️  WARNING: Using static map data (may be inaccurate)');
  console.log('⚠️  For accurate data, use: npm run db:fetch-metadata');
  console.log('');
  
  const dbPath = path.join(process.cwd(), 'data', 'swo.db');
  console.log(`Database path: ${dbPath}`);
  const db = initializeDatabase(dbPath);
  console.log('Database initialized');
  console.log('');
  
  const stmt = db.prepare(`
    INSERT INTO star_skrumpey_metadata (
      token_id, name, description, image_url, constellation, attributes_json
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(token_id) DO UPDATE SET
      constellation = excluded.constellation,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  let count = 0;
  const constellationCounts: Record<string, number> = {};
  
  console.log('Populating database from static map...');
  
  for (const [tokenIdStr, constellation] of Object.entries(STAR_CONSTELLATION_MAP)) {
    const tokenId = parseInt(tokenIdStr, 10);
    
    // Create minimal attributes array with constellation
    const attributes = [
      { trait_type: 'constellation', value: constellation },
    ];
    
    stmt.run(
      tokenId,
      `SKRUMP #${tokenId}`,
      'A pixel art pfpNFT capturing Monad\'s spirit',
      `${SKRUMPEY_IMAGE_BASE}/${tokenId}.png`,
      constellation,
      JSON.stringify(attributes)
    );
    
    constellationCounts[constellation] = (constellationCounts[constellation] || 0) + 1;
    count++;
  }
  
  db.close();
  
  console.log('');
  console.log('='.repeat(60));
  console.log('Results');
  console.log('='.repeat(60));
  console.log(`Total records inserted/updated: ${count}`);
  console.log('');
  
  console.log('Constellation Distribution:');
  Object.entries(constellationCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([constellation, count]) => {
      console.log(`  ${constellation}: ${count}`);
    });
  
  console.log('');
  console.log('='.repeat(60));
  console.log('✓ Done! Database populated from static map.');
  console.log('');
  console.log('⚠️  REMINDER: This data may be inaccurate (placeholder values)');
  console.log('   For production, run: npm run db:fetch-metadata');
  console.log('='.repeat(60));
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
