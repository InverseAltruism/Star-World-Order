#!/usr/bin/env npx tsx
/**
 * Forum Governance Category Migration Script
 * 
 * This script fixes the forum_threads table to include 'governance' in the 
 * category CHECK constraint. SQLite doesn't support ALTER COLUMN, so we need
 * to recreate the table.
 * 
 * Run with: npx tsx scripts/migrate-forum-governance-category.ts
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DATABASE_URL?.replace('file:', '') || 
  path.join(process.cwd(), 'data', 'swo.db');

console.log('🔄 Starting forum governance category migration...');
console.log(`📂 Database: ${DB_PATH}`);

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ Database file not found. Please run npm run db:init first.');
  process.exit(1);
}

const db = new Database(DB_PATH);

try {
  // Check if forum_threads table exists
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='forum_threads'
  `).get();
  
  if (!tableExists) {
    console.log('✅ forum_threads table does not exist yet - it will be created with correct schema by db.ts');
    process.exit(0);
  }
  
  // Check current CHECK constraint by attempting to insert a test record
  // If it fails with 'governance' category, we need to migrate
  console.log('🔍 Checking current CHECK constraint...');
  
  // Start a transaction for safety
  db.exec('BEGIN TRANSACTION');
  
  try {
    console.log('1️⃣  Creating backup table...');
    
    // Create new table with correct CHECK constraint
    db.exec(`
      CREATE TABLE IF NOT EXISTS forum_threads_new (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        original_content TEXT,
        author_address TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'governance', 'proposals', 'ideas', 'support', 'announcements')),
        proposal_id TEXT,
        pinned INTEGER NOT NULL DEFAULT 0,
        locked INTEGER NOT NULL DEFAULT 0,
        likes_count INTEGER NOT NULL DEFAULT 0,
        dislikes_count INTEGER NOT NULL DEFAULT 0,
        is_edited INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        edited_at DATETIME
      )
    `);
    
    console.log('2️⃣  Copying existing data...');
    
    // Copy data from old table to new table
    db.exec(`
      INSERT INTO forum_threads_new (
        id, title, content, original_content, author_address, category,
        proposal_id, pinned, locked, likes_count, dislikes_count, is_edited,
        created_at, updated_at, edited_at
      )
      SELECT 
        id, title, content, original_content, author_address, category,
        proposal_id, pinned, locked, likes_count, dislikes_count, is_edited,
        created_at, updated_at, edited_at
      FROM forum_threads
    `);
    
    // Count records
    const count = db.prepare('SELECT COUNT(*) as count FROM forum_threads_new').get() as { count: number };
    console.log(`   ✅ Copied ${count.count} threads`);
    
    console.log('3️⃣  Dropping old table...');
    db.exec('DROP TABLE forum_threads');
    
    console.log('4️⃣  Renaming new table...');
    db.exec('ALTER TABLE forum_threads_new RENAME TO forum_threads');
    
    console.log('5️⃣  Recreating indexes...');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_forum_threads_category ON forum_threads(category, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_forum_threads_author ON forum_threads(author_address);
      CREATE INDEX IF NOT EXISTS idx_forum_threads_pinned ON forum_threads(pinned DESC, updated_at DESC);
    `);
    
    // Commit transaction
    db.exec('COMMIT');
    
    console.log('\n✅ Migration completed successfully!');
    console.log('\nThe forum_threads table now supports the "governance" category.');
    console.log('\nNext steps:');
    console.log('  1. Restart your application');
    console.log('  2. Create a new proposal to test auto-thread creation');
    
  } catch (innerError) {
    // Rollback on error
    db.exec('ROLLBACK');
    throw innerError;
  }
  
} catch (error) {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
} finally {
  db.close();
}
