#!/usr/bin/env npx tsx
/**
 * Governance Migration Script
 * 
 * This script migrates the governance system to support:
 * - Three-way voting (Yes/No/Abstain)
 * - Enhanced quorum requirements
 * - Vote changing (24-hour window)
 * - Proposal categories
 * - Forum thread linking
 * - Proposer cancellation
 * 
 * Run with: npx tsx scripts/migrate-governance.ts
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DATABASE_URL?.replace('file:', '') || 
  path.join(process.cwd(), 'data', 'swo.db');

console.log('🔄 Starting governance migration...');
console.log(`📂 Database: ${DB_PATH}`);

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ Database file not found. Please run npm run db:init first.');
  process.exit(1);
}

const db = new Database(DB_PATH);

try {
  db.pragma('foreign_keys = ON');
  
  console.log('\n📋 Migration Steps:');
  
  // Step 1: Add abstain_votes column to governance_proposals
  console.log('1️⃣  Adding abstain_votes column...');
  try {
    db.exec(`
      ALTER TABLE governance_proposals 
      ADD COLUMN abstain_votes INTEGER NOT NULL DEFAULT 0
    `);
    console.log('   ✅ abstain_votes column added');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('duplicate column')) {
      console.log('   ⚠️  abstain_votes column already exists, skipping');
    } else {
      throw error;
    }
  }
  
  // Step 2: Add quorum tracking columns
  console.log('2️⃣  Adding quorum tracking columns...');
  const quorumColumns = [
    { name: 'unique_voter_count', type: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'min_voters', type: 'INTEGER NOT NULL DEFAULT 10' },
    { name: 'yes_threshold_percent', type: 'INTEGER NOT NULL DEFAULT 60' },
    { name: 'max_abstain_percent', type: 'INTEGER NOT NULL DEFAULT 30' },
  ];
  
  for (const col of quorumColumns) {
    try {
      db.exec(`
        ALTER TABLE governance_proposals 
        ADD COLUMN ${col.name} ${col.type}
      `);
      console.log(`   ✅ ${col.name} column added`);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('duplicate column')) {
        console.log(`   ⚠️  ${col.name} column already exists, skipping`);
      } else {
        throw error;
      }
    }
  }
  
  // Step 3: Add category column
  console.log('3️⃣  Adding category column...');
  try {
    db.exec(`
      ALTER TABLE governance_proposals 
      ADD COLUMN category TEXT NOT NULL DEFAULT 'general' 
      CHECK (category IN ('treasury', 'community', 'technical', 'governance', 'general'))
    `);
    console.log('   ✅ category column added');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('duplicate column')) {
      console.log('   ⚠️  category column already exists, skipping');
    } else {
      throw error;
    }
  }
  
  // Step 4: Add forum_thread_id column
  console.log('4️⃣  Adding forum_thread_id column...');
  try {
    db.exec(`
      ALTER TABLE governance_proposals 
      ADD COLUMN forum_thread_id TEXT
    `);
    console.log('   ✅ forum_thread_id column added');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('duplicate column')) {
      console.log('   ⚠️  forum_thread_id column already exists, skipping');
    } else {
      throw error;
    }
  }
  
  // Step 5: Add defeat_reason column
  console.log('5️⃣  Adding defeat_reason column...');
  try {
    db.exec(`
      ALTER TABLE governance_proposals 
      ADD COLUMN defeat_reason TEXT
    `);
    console.log('   ✅ defeat_reason column added');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('duplicate column')) {
      console.log('   ⚠️  defeat_reason column already exists, skipping');
    } else {
      throw error;
    }
  }
  
  // Step 6: Add updated_at column to governance_votes
  console.log('6️⃣  Adding updated_at column to governance_votes...');
  try {
    db.exec(`
      ALTER TABLE governance_votes 
      ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    `);
    console.log('   ✅ updated_at column added to governance_votes');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('duplicate column')) {
      console.log('   ⚠️  updated_at column already exists, skipping');
    } else {
      throw error;
    }
  }
  
  // Step 7: Update existing proposals with unique voter counts
  console.log('7️⃣  Calculating unique voter counts for existing proposals...');
  const proposals = db.prepare('SELECT id FROM governance_proposals').all() as { id: string }[];
  
  for (const proposal of proposals) {
    const voterCount = db.prepare(`
      SELECT COUNT(DISTINCT voter_address) as count 
      FROM governance_votes 
      WHERE proposal_id = ?
    `).get(proposal.id) as { count: number } | undefined;
    
    if (voterCount) {
      db.prepare(`
        UPDATE governance_proposals 
        SET unique_voter_count = ? 
        WHERE id = ?
      `).run(voterCount.count, proposal.id);
    }
  }
  console.log(`   ✅ Updated voter counts for ${proposals.length} proposals`);
  
  // Step 8: Ensure 'governance' category exists in forum categories
  console.log('8️⃣  Checking forum categories...');
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='forum_threads'
  `).get();
  
  if (tableExists) {
    console.log('   ✅ Forum threads table exists');
  } else {
    console.log('   ⚠️  Forum threads table not found (will be created by db.ts)');
  }
  
  // Step 9: Create trigger to auto-update updated_at on vote changes
  console.log('9️⃣  Creating vote update trigger...');
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_governance_vote_timestamp 
        AFTER UPDATE ON governance_votes
        FOR EACH ROW
      BEGIN
        UPDATE governance_votes 
        SET updated_at = CURRENT_TIMESTAMP 
        WHERE id = OLD.id;
      END;
    `);
    console.log('   ✅ Vote update trigger created');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('already exists')) {
      console.log('   ⚠️  Trigger already exists, skipping');
    } else {
      throw error;
    }
  }
  
  console.log('\n✨ Migration completed successfully!');
  console.log('\n📊 Database Schema Summary:');
  
  // Display schema info
  const proposalColumns = db.prepare(`
    PRAGMA table_info(governance_proposals)
  `).all() as Array<{ name: string; type: string }>;
  
  console.log('\n   governance_proposals columns:');
  proposalColumns.forEach(col => {
    console.log(`     - ${col.name} (${col.type})`);
  });
  
  const voteColumns = db.prepare(`
    PRAGMA table_info(governance_votes)
  `).all() as Array<{ name: string; type: string }>;
  
  console.log('\n   governance_votes columns:');
  voteColumns.forEach(col => {
    console.log(`     - ${col.name} (${col.type})`);
  });
  
  console.log('\n🎉 You can now use the enhanced governance features!');
  console.log('\nNext steps:');
  console.log('  1. Restart your application');
  console.log('  2. Test creating a proposal with a category');
  console.log('  3. Test voting with Yes/No/Abstain options');
  console.log('  4. Test changing votes within 24 hours');
  
} catch (error) {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
} finally {
  db.close();
}
