/**
 * SQLite Database Connection for Star World Order
 * 
 * This module provides database connectivity for:
 * - Chat messages in the Hangout Hub
 * - Online presence tracking
 * - Voice chat sessions
 * - Social connections (Discord, X)
 * - User profiles
 * 
 * The database file is stored at data/swo.db
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { getResilientClient } from './rpcClient';
import {
  applyInteractionStats,
  toSqlDate,
  parseSqlDateMs,
  type CompanionStatAction,
} from './sanctuary/companionStats';
import {
  applyTiredBondMultiplier,
  classifySleepTransition,
  computeDreamReward,
  computeEarlyWakeOutcome,
  isCompanionTired,
} from './sanctuary/sleepDynamics';
import {
  GACHA_PULL_COST,
  pickGachaItem,
  type GachaCandidate,
  type GachaPickResult,
} from './sanctuary/gacha';
import { decayStats, computeNeeds, type DecayedStats } from './sanctuary/decay';
import {
  preferenceFor,
  isNeedTargeted,
  computeBondDelta,
  type PreferenceLevel,
} from './sanctuary/preferences';
import { rollVariableReward, type VariableRewardTier } from './sanctuary/variableRewards';
import {
  ACTION_RESOURCE,
  ACTION_DAILY_LIMIT,
  RESOURCE_MAX,
  decayResources,
  replenish,
  gateAction,
  advanceUsage,
  usesRemaining,
  cooldownRemainingMs,
  type ResourceSnapshot,
  type ActionUsage as WalletActionUsage,
} from './sanctuary/walletResources';
import { journalLineForAction } from './sanctuary/companionGreeting';
import {
  QUEST_CATALOG,
  getQuestDef,
  getWagerTier,
  isValidStake,
  questResourceCost,
  gateQuestStart,
  payCost,
  earnPayout,
  effectiveWager,
  type CharmEffect,
  type CharmEffectType,
} from './sanctuary/questsV2';
import { resolveArcade, isValidArcadeStake } from './sanctuary/arcade';
import {
  abandonExpedition,
  chooseExpeditionPath,
  getExpeditionRewards,
  startExpedition,
  type ExpeditionDefinition,
  type ExpeditionHistoryEntry,
  type ExpeditionState,
  type ExpeditionStatus,
  type ExpeditionOutcome,
} from './sanctuary/expeditions';
import {
  EXPEDITION_TIERS,
  getExpeditionCatalog,
  getExpeditionCatalogEntry,
  type ExpeditionTier,
} from './sanctuary/expeditionDefs';


// ---------------------------------------------------------------------------
// Connection + schema bootstrap extracted to ./db/connection.ts.
// This file remains the public barrel: every `@/lib/db` import still resolves
// here. getDatabase()/__setTestDatabase are re-exported so callers are unchanged.
// ---------------------------------------------------------------------------
import { getDatabase, registerSchemaInitializer } from './db/connection';
export { getDatabase, __setTestDatabase, closeDatabase } from './db/connection';
// addUserXP now lives in ./db/quests (re-exported below via `export *`), but the
// WIP sanctuary tail in this file calls it directly, so bind it locally too.
import { addUserXP } from './db/quests';

// Sanctuary schema/seed init lives in this file (WIP domain); register it with
// the connection module so it runs on first getDatabase(). `function`
// declarations hoist, so initializeSanctuary is in scope here.
registerSchemaInitializer(initializeSanctuary);
// ============================================================
// CHAT MESSAGES  → extracted to ./db/chat.ts
// ============================================================
export * from './db/chat';

// ============================================================
// ONLINE PRESENCE  → extracted to ./db/presence.ts
// ============================================================
export * from './db/presence';

// ============================================================
// VOICE CHAT SESSIONS  → extracted to ./db/voice.ts
// ============================================================
export * from './db/voice';

// ============================================================
// USER PROFILES  → extracted to ./db/profiles.ts
// ============================================================
export * from './db/profiles';

// ============================================================
// STAR SKRUMPEY METADATA  → extracted to ./db/skrumpeyMetadata.ts
// ============================================================
export * from './db/skrumpeyMetadata';

// ============================================================
// HOLDER SNAPSHOTS  → extracted to ./db/holderSnapshots.ts
// ============================================================
export * from './db/holderSnapshots';

// ============================================================
// QUESTS AND XP SYSTEM  → extracted to ./db/quests.ts
// ============================================================
export * from './db/quests';

// ============================================================
// DATABASE BACKUP  → extracted to ./db/backup.ts
// ============================================================
export * from './db/backup';

// ============================================================
// CLEANUP  → extracted to ./db/cleanup.ts
// ============================================================
export * from './db/cleanup';

// ============================================================
// NOTIFICATIONS  → extracted to ./db/notifications.ts
// ============================================================
export * from './db/notifications';

// ============================================================
// FRIENDS SYSTEM  → extracted to ./db/friends.ts
// ============================================================
export * from './db/friends';

// ============================================================
// DIRECT MESSAGES  → extracted to ./db/directMessages.ts
// ============================================================
export * from './db/directMessages';

// ============================================================
// TREASURY NFT CACHE  → extracted to ./db/treasury.ts
// ============================================================
export * from './db/treasury';

// ============================================================
// Star Forge Database Functions  → extracted to ./db/starforge.ts
// ============================================================
export * from './db/starforge';

// ============================================================
// Raffle System Database Functions  → extracted to ./db/raffle.ts
// ============================================================
export * from './db/raffle';

// ============================================================
// Admin Database Functions  → extracted to ./db/admin.ts
// ============================================================
export * from './db/admin';

// ============================================================
// Governance System Database Functions (Web2 Style)  → extracted to ./db/governance.ts
// ============================================================
export * from './db/governance';

// ============================================================
// Governance Nonce Management (Security Enhancement)  → extracted to ./db/governanceNonce.ts
// ============================================================
export * from './db/governanceNonce';

// ============================================================
// Admin Nonce Management (replay protection for admin auth)  → extracted to ./db/adminNonce.ts
// ============================================================
export * from './db/adminNonce';

// ============================================================
// Forum System Database Functions (with likes and edits)  → extracted to ./db/forum.ts
// ============================================================
export * from './db/forum';

// ============================================================
// Sanctuary — Companion, Journal, Map
// ============================================================

export interface SanctuaryCompanion {
  id: number;
  wallet_address: string;
  token_id: number;
  is_active: number;
  nickname: string | null;
  current_activity: string;
  activity_started_at: string | null;
  activity_ends_at: string | null;
  bond_score: number;
  total_interactions: number;
  equipped_cosmetics: string;
  xp: number;
  level: number;
  // V2.4 vitality stats — clamped 0–100. `is_sleeping` is queryable for HUD
  // display; `sleep_started_at` lets `interactWithCompanion` compute energy
  // recovery (+60/hour) when waking the companion or refreshing energy mid-sleep.
  hunger: number;
  happiness: number;
  energy: number;
  is_sleeping: number;
  sleep_started_at: string | null;
  // V2.5 — last time the persisted vitality snapshot was reconciled with
  // wall-clock decay. `decayStats(companion, now)` projects forward from
  // this timestamp; `tickStats` writes the projection back and bumps it.
  stats_updated_at: string | null;
  // [SWO_V2_SANCTUARY_SLEEP_DYNAMICS] — last full sleep cycle completion.
  // 24h+ without a full cycle marks the companion `Tired` (half bond gains).
  last_full_sleep_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SanctuaryCompanionWithMeta extends Omit<SanctuaryCompanion, 'level'> {
  constellation: string | null;
  aura: string | null;
  form: string | null;
  mood: string | null;
  background: string | null;
  eyes: string | null;
  hat: string | null;
  image_url: string | null;
  rarity_rank: number | null;
  attributes_json: string | null;
  // Companion-level XP/level (per-token, set by Training Grounds)
  companion_xp: number;
  companion_level: number;
  // Wallet-level XP/level (aggregate, set by user_xp table). The `level` field
  // is the wallet-wide level for backward compatibility with existing UI that
  // uses it for location unlock thresholds.
  total_xp: number;
  level: number;
}

export interface SanctuaryJournalEntry {
  id: number;
  wallet_address: string;
  token_id: number;
  entry_type: string;
  content: string;
  metadata: string;
  created_at: string;
}

export interface SanctuaryMapLocation {
  id: number;
  name: string;
  description: string | null;
  max_capacity: number;
  unlock_level: number;
  position_x: number;
  position_y: number;
}

function initializeSanctuary(database: Database.Database): void {
  const sqlPath = path.join(process.cwd(), 'scripts', 'init-sanctuary.sql');
  if (fs.existsSync(sqlPath)) {
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    database.exec(sql);
  }
  const v15Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v1.5.sql');
  if (fs.existsSync(v15Path)) {
    const sql = fs.readFileSync(v15Path, 'utf-8');
    database.exec(sql);
  }
  const v16Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v1.6.sql');
  if (fs.existsSync(v16Path)) {
    const sql = fs.readFileSync(v16Path, 'utf-8');
    database.exec(sql);
  }
  const v17Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v1.7.sql');
  if (fs.existsSync(v17Path)) {
    const sql = fs.readFileSync(v17Path, 'utf-8');
    database.exec(sql);
  }
  const v18Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v1.8.sql');
  if (fs.existsSync(v18Path)) {
    const sql = fs.readFileSync(v18Path, 'utf-8');
    database.exec(sql);
  }
  const v19Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v1.9.sql');
  if (fs.existsSync(v19Path)) {
    const sql = fs.readFileSync(v19Path, 'utf-8');
    database.exec(sql);
  }
  const v20Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.0.sql');
  if (fs.existsSync(v20Path)) {
    const sql = fs.readFileSync(v20Path, 'utf-8');
    database.exec(sql);
  }
  const v21Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.1.sql');
  if (fs.existsSync(v21Path)) {
    const sql = fs.readFileSync(v21Path, 'utf-8');
    database.exec(sql);
  }
  const v22Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.2.sql');
  if (fs.existsSync(v22Path)) {
    const sql = fs.readFileSync(v22Path, 'utf-8');
    database.exec(sql);
  }
  const v23Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.3.sql');
  if (fs.existsSync(v23Path)) {
    const sql = fs.readFileSync(v23Path, 'utf-8');
    database.exec(sql);
  }
  const v24Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.4.sql');
  if (fs.existsSync(v24Path)) {
    const sql = fs.readFileSync(v24Path, 'utf-8');
    database.exec(sql);
  }
  const v25Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.5.sql');
  if (fs.existsSync(v25Path)) {
    const sql = fs.readFileSync(v25Path, 'utf-8');
    database.exec(sql);
  }
  const v26Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.6.sql');
  if (fs.existsSync(v26Path)) {
    const sql = fs.readFileSync(v26Path, 'utf-8');
    database.exec(sql);
  }
  const v27Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.7.sql');
  if (fs.existsSync(v27Path)) {
    const sql = fs.readFileSync(v27Path, 'utf-8');
    database.exec(sql);
  }
  const v28Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.8.sql');
  if (fs.existsSync(v28Path)) {
    const sql = fs.readFileSync(v28Path, 'utf-8');
    database.exec(sql);
  }
  const v29Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.9.sql');
  if (fs.existsSync(v29Path)) {
    const sql = fs.readFileSync(v29Path, 'utf-8');
    database.exec(sql);
  }
  const v210Path = path.join(process.cwd(), 'scripts', 'init-sanctuary-v2.10.sql');
  if (fs.existsSync(v210Path)) {
    const sql = fs.readFileSync(v210Path, 'utf-8');
    database.exec(sql);
  }
  // V1.7: per-companion XP/level columns (Training Grounds). ALTER TABLE IF NOT
  // EXISTS is not portable across SQLite versions, so wrap in try/catch.
  try { database.exec('ALTER TABLE sanctuary_companions ADD COLUMN xp INTEGER NOT NULL DEFAULT 0'); }
  catch { /* column already exists */ }
  try { database.exec('ALTER TABLE sanctuary_companions ADD COLUMN level INTEGER NOT NULL DEFAULT 1'); }
  catch { /* column already exists */ }
  // V2.3: guided onboarding tutorial state on sanctuary_player_state.
  try { database.exec("ALTER TABLE sanctuary_player_state ADD COLUMN onboarding_step TEXT"); }
  catch { /* column already exists */ }
  try { database.exec("ALTER TABLE sanctuary_player_state ADD COLUMN onboarding_skipped INTEGER NOT NULL DEFAULT 0"); }
  catch { /* column already exists */ }
  // V2.4: companion vitality stats (hunger/happiness/energy + sleep state).
  try { database.exec('ALTER TABLE sanctuary_companions ADD COLUMN hunger INTEGER NOT NULL DEFAULT 50'); }
  catch { /* column already exists */ }
  try { database.exec('ALTER TABLE sanctuary_companions ADD COLUMN happiness INTEGER NOT NULL DEFAULT 50'); }
  catch { /* column already exists */ }
  try { database.exec('ALTER TABLE sanctuary_companions ADD COLUMN energy INTEGER NOT NULL DEFAULT 100'); }
  catch { /* column already exists */ }
  try { database.exec('ALTER TABLE sanctuary_companions ADD COLUMN is_sleeping INTEGER NOT NULL DEFAULT 0'); }
  catch { /* column already exists */ }
  try { database.exec('ALTER TABLE sanctuary_companions ADD COLUMN sleep_started_at DATETIME'); }
  catch { /* column already exists */ }
  // V2.5: tamagotchi-style decay — `stats_updated_at` lets `decayStats`
  // project current vitality from the persisted snapshot. Backfilled to
  // CURRENT_TIMESTAMP for existing rows so day-1 projections are accurate.
  try {
    database.exec('ALTER TABLE sanctuary_companions ADD COLUMN stats_updated_at DATETIME');
    database.exec('UPDATE sanctuary_companions SET stats_updated_at = CURRENT_TIMESTAMP WHERE stats_updated_at IS NULL');
  } catch { /* column already exists */ }
  // [SWO_V2_SANCTUARY_SLEEP_DYNAMICS]: track last full sleep cycle for Tired gate.
  // Backfilled to created_at so existing companions are not retroactively Tired
  // (they get their first 24h window from the moment we deploy this column).
  try {
    database.exec('ALTER TABLE sanctuary_companions ADD COLUMN last_full_sleep_at DATETIME');
    database.exec('UPDATE sanctuary_companions SET last_full_sleep_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE last_full_sleep_at IS NULL');
  } catch { /* column already exists */ }
  const rateLimitPath = path.join(process.cwd(), 'scripts', 'init-sanctuary-rate-limits.sql');
  if (fs.existsSync(rateLimitPath)) {
    const sql = fs.readFileSync(rateLimitPath, 'utf-8');
    database.exec(sql);
  }
  seedSanctuaryMapLocations(database);
  seedSanctuaryQuests(database);
  seedSkrumpeyMetadataFromCorpus(database);
  seedSanctuaryCosmeticItems(database);
  seedSanctuaryCharmItems(database);
}

function seedSkrumpeyMetadataFromCorpus(database: Database.Database): void {
  const count = (database.prepare('SELECT COUNT(*) as count FROM star_skrumpey_metadata').get() as { count: number }).count;
  if (count >= 3333) return;

  const corpusPath = path.join(process.cwd(), 'data', 'sanctuary', 'skrumpey_sanctuary.json');
  if (!fs.existsSync(corpusPath)) return;

  const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf-8')) as Array<{
    id: number; name: string; traits: Record<string, string>;
    traitCount: number; rarityRank: number; rarityScore: number; image: string;
  }>;

  const description = "A collection of 3,333 pixel art pfpNFTs capturing Monad's spirit. Created by melo.";

  const upsert = database.prepare(`
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
      name = excluded.name, image_url = excluded.image_url,
      constellation = excluded.constellation, aura = excluded.aura,
      background = excluded.background, eyes = excluded.eyes,
      form = excluded.form, mood = excluded.mood,
      hat = excluded.hat, gaze = excluded.gaze, relic = excluded.relic,
      pet = excluded.pet, fit = excluded.fit, attitude = excluded.attitude,
      scene = excluded.scene, extra = excluded.extra, submerged = excluded.submerged,
      rarity_rank = excluded.rarity_rank, rarity_score = excluded.rarity_score,
      trait_count = excluded.trait_count, attributes_json = excluded.attributes_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  const seedAll = database.transaction(() => {
    for (const token of corpus) {
      const t = token.traits;
      upsert.run(
        token.id, token.name, description, token.image,
        t.constellation ?? null, t.aura ?? null, t.background ?? null,
        t.eyes ?? null, t.form ?? null, t.mood ?? null,
        t.hat ?? null, t.gaze ?? null, t.relic ?? null,
        t.pet ?? null, t.fit ?? null, t.attitude ?? null,
        t.scene ?? null, t.extra ?? null, t.submerged ?? null,
        token.rarityRank, token.rarityScore, token.traitCount,
        JSON.stringify(token.traits),
      );
    }
  });

  seedAll();
}

function seedSanctuaryMapLocations(database: Database.Database): void {
  const countStmt = database.prepare('SELECT COUNT(*) as count FROM sanctuary_map_locations');
  const { count } = countStmt.get() as { count: number };
  if (count > 0) return;

  // Progression pacing: 2 starter rooms unlock at L1, the rest spread across
  // L3..L15 so newcomers aren't dropped into 8 rooms of content at once. The
  // live DEV/PROD DBs already hold these values; this seed exists for fresh
  // installs / `prod→test` syncs into empty databases.
  const locations = [
    { name: 'Hot Springs', description: 'A relaxing place for tired Skrumpeys to unwind.', position_x: 0.2, position_y: 0.3, unlock_level: 1 },
    { name: 'Dream Hollow', description: 'Where Skrumpeys rest and dream of adventures.', position_x: 0.1, position_y: 0.8, unlock_level: 1 },
    { name: 'Training Grounds', description: 'Practice arena where Skrumpeys sharpen their skills.', position_x: 0.7, position_y: 0.2, unlock_level: 3 },
    { name: 'Nebula Kitchen', description: 'Cook up cosmic treats for your companion.', position_x: 0.3, position_y: 0.7, unlock_level: 5 },
    { name: 'Star Garden', description: 'A mystical garden where constellations bloom.', position_x: 0.5, position_y: 0.5, unlock_level: 7 },
    { name: 'Cosmic Library', description: 'Ancient texts and forgotten lore.', position_x: 0.8, position_y: 0.6, unlock_level: 9 },
    { name: 'Observatory', description: 'Gaze at the stars and discover hidden constellations.', position_x: 0.5, position_y: 0.1, unlock_level: 12 },
    { name: 'Aura Forge', description: 'Channel aura energy into powerful bonds.', position_x: 0.9, position_y: 0.4, unlock_level: 15 },
  ];

  const insert = database.prepare(`
    INSERT INTO sanctuary_map_locations (name, description, position_x, position_y, unlock_level)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const loc of locations) {
    insert.run(loc.name, loc.description, loc.position_x, loc.position_y, loc.unlock_level);
  }
}

export function getSanctuaryCompanion(walletAddress: string, tokenId: number): SanctuaryCompanion | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?');
  return (stmt.get(walletAddress.toLowerCase(), tokenId) as SanctuaryCompanion) || null;
}

export function getActiveCompanion(walletAddress: string): SanctuaryCompanionWithMeta | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT sc.id, sc.wallet_address, sc.token_id, sc.is_active, sc.nickname,
           sc.current_activity, sc.activity_started_at, sc.activity_ends_at,
           sc.bond_score, sc.total_interactions, sc.equipped_cosmetics,
           sc.xp, sc.level, sc.created_at, sc.updated_at,
           sc.hunger, sc.happiness, sc.energy, sc.is_sleeping, sc.sleep_started_at,
           sc.xp as companion_xp, sc.level as companion_level,
           ssm.constellation, ssm.aura, ssm.form, ssm.mood,
           ssm.background, ssm.eyes, ssm.hat, ssm.image_url,
           ssm.rarity_rank, ssm.attributes_json,
           COALESCE(ux.total_xp, 0) as total_xp,
           COALESCE(ux.level, 1) as wallet_level
    FROM sanctuary_companions sc
    LEFT JOIN star_skrumpey_metadata ssm ON sc.token_id = ssm.token_id
    LEFT JOIN user_xp ux ON sc.wallet_address = ux.wallet_address
    WHERE sc.wallet_address = ? AND sc.is_active = 1
  `);
  const row = stmt.get(walletAddress.toLowerCase()) as (SanctuaryCompanionWithMeta & { wallet_level: number }) | undefined;
  if (!row) return null;
  // Expose wallet-level level under `level` name for existing callers (SanctuaryContent
  // uses companion.level for location unlocks, which is wallet-wide progression).
  return { ...row, level: row.wallet_level } as SanctuaryCompanionWithMeta;
}

export function getAllCompanions(walletAddress: string): SanctuaryCompanionWithMeta[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT sc.id, sc.wallet_address, sc.token_id, sc.is_active, sc.nickname,
           sc.current_activity, sc.activity_started_at, sc.activity_ends_at,
           sc.bond_score, sc.total_interactions, sc.equipped_cosmetics,
           sc.xp, sc.level, sc.created_at, sc.updated_at,
           sc.hunger, sc.happiness, sc.energy, sc.is_sleeping, sc.sleep_started_at,
           sc.xp as companion_xp, sc.level as companion_level,
           ssm.constellation, ssm.aura, ssm.form, ssm.mood,
           ssm.background, ssm.eyes, ssm.hat, ssm.image_url,
           ssm.rarity_rank, ssm.attributes_json,
           COALESCE(ux.total_xp, 0) as total_xp,
           COALESCE(ux.level, 1) as wallet_level
    FROM sanctuary_companions sc
    LEFT JOIN star_skrumpey_metadata ssm ON sc.token_id = ssm.token_id
    LEFT JOIN user_xp ux ON sc.wallet_address = ux.wallet_address
    WHERE sc.wallet_address = ?
    ORDER BY sc.is_active DESC, sc.updated_at DESC
  `);
  const rows = stmt.all(walletAddress.toLowerCase()) as (SanctuaryCompanionWithMeta & { wallet_level: number })[];
  return rows.map((r) => ({ ...r, level: r.wallet_level }) as SanctuaryCompanionWithMeta);
}

export function selectCompanion(walletAddress: string, tokenId: number): SanctuaryCompanion {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    db.prepare('UPDATE sanctuary_companions SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ? AND is_active = 1')
      .run(addr);

    const existing = db.prepare('SELECT id FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?')
      .get(addr, tokenId) as { id: number } | undefined;

    if (existing) {
      db.prepare('UPDATE sanctuary_companions SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(existing.id);
    } else {
      db.prepare(`
        INSERT INTO sanctuary_companions (wallet_address, token_id, is_active, current_activity, bond_score, total_interactions)
        VALUES (?, ?, 1, 'lounging', 0.0, 0)
      `).run(addr, tokenId);

      addJournalEntry(addr, tokenId, 'system', 'Companion awakened in the Sanctuary for the first time.');
    }

    return db.prepare('SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?')
      .get(addr, tokenId) as SanctuaryCompanion;
  });

  return txn();
}

export function switchCompanion(walletAddress: string, newTokenId: number): SanctuaryCompanion {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const current = db.prepare('SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND is_active = 1')
      .get(addr) as SanctuaryCompanion | undefined;

    if (current) {
      db.prepare('UPDATE sanctuary_companions SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(current.id);
      addJournalEntry(addr, current.token_id, 'system', 'Companion resting while another takes the lead.');
    }

    const existing = db.prepare('SELECT id FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?')
      .get(addr, newTokenId) as { id: number } | undefined;

    if (existing) {
      db.prepare('UPDATE sanctuary_companions SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(existing.id);
    } else {
      db.prepare(`
        INSERT INTO sanctuary_companions (wallet_address, token_id, is_active, current_activity, bond_score, total_interactions)
        VALUES (?, ?, 1, 'lounging', 0.0, 0)
      `).run(addr, newTokenId);
    }

    addJournalEntry(addr, newTokenId, 'system', 'Companion activated as the new lead.');

    return db.prepare('SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?')
      .get(addr, newTokenId) as SanctuaryCompanion;
  });

  return txn();
}

const DAILY_INTERACTION_CAP = 15;
// `play` rewards bond like talk-equivalent; `sleep` is a state toggle and
// gives no bond/XP (it's not a social interaction).
const INTERACTION_BOND: Record<string, number> = { feed: 0.5, pet: 0.3, talk: 0.2, play: 0.4, sleep: 0 };
const INTERACTION_XP: Record<string, number> = { feed: 3, pet: 2, talk: 2, play: 3, sleep: 0 };
const STAR_HOLDER_XP_MULTIPLIER = 1.5;
const STAR_HOLDER_BOND_MULTIPLIER = 1.25;

/**
 * Result of a companion interaction. Carries the reward *breakdown* (not just
 * the new stats) so the UI can explain WHY an action paid off — preference
 * match, need-state boost, variable bonus — which is what turns flat
 * stat-bumping into a legible loop. See docs/SANCTUARY_ENGAGEMENT_PLAN.md.
 */
export interface CompanionInteractionResult {
  companion: SanctuaryCompanion;
  journal: SanctuaryJournalEntry;
  dailyRemaining: number;
  starBonus: boolean;
  /** Final bond delta applied (after preference × need × tired × diminishing). */
  bondGain: number;
  /** This Skrumpey's hidden preference for the action just performed. */
  preference: PreferenceLevel;
  /** True when the action targeted a currently-low stat (need-state boost). */
  needBoosted: boolean;
  /** Variable-reward tier rolled (floor / bonus_star / rare_trinket). */
  variableTier: VariableRewardTier;
  /** Bonus STAR minted by the variable layer (0 on a floor roll). */
  bonusStar: number;
}

function getDailyInteractionCount(db: ReturnType<typeof getDatabase>, addr: string, tokenId: number): number {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM sanctuary_journal
    WHERE wallet_address = ? AND token_id = ? AND entry_type = 'interaction'
      AND created_at >= ?
  `).get(addr, tokenId, todayStart.toISOString().replace('T', ' ').slice(0, 19)) as { count: number };
  return result.count;
}

export function interactWithCompanion(
  walletAddress: string, tokenId: number, action: CompanionStatAction,
  options?: { isStar?: boolean }
): CompanionInteractionResult {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  // Variety pool now lives in companionGreeting.journalLineForAction —
  // deterministic given (action, mood, hour-of-day bucket) so consecutive
  // interactions don't repeat the same flat phrase.

  const txn = db.transaction(() => {
    const comp = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ? AND is_active = 1'
    ).get(addr, tokenId) as SanctuaryCompanion | undefined;

    if (!comp) throw new Error('No active companion found');

    const dailyCount = getDailyInteractionCount(db, addr, tokenId);
    if (dailyCount >= DAILY_INTERACTION_CAP) {
      throw new Error('Daily interaction limit reached. Come back tomorrow!');
    }

    // First reconcile decay since the last `stats_updated_at` so the action's
    // deltas land on the projected (not stale persisted) snapshot. V2.5 —
    // [SWO_V2_COMPANION_STATS_SCHEMA].
    const now = new Date();
    const decayed = decayStats(
      {
        hunger: comp.hunger,
        happiness: comp.happiness,
        energy: comp.energy,
        stats_updated_at: comp.stats_updated_at,
        is_sleeping: comp.is_sleeping,
      },
      now,
    );

    // Compute the new vitality snapshot. This throws SleepingCompanionError
    // when a non-sleep action is attempted while is_sleeping=1 and the
    // recovered energy is still below SLEEP_BLOCK_THRESHOLD.
    const stats = applyInteractionStats(
      {
        hunger: decayed.hunger,
        happiness: decayed.happiness,
        energy: decayed.energy,
        is_sleeping: comp.is_sleeping,
        sleep_started_at: comp.sleep_started_at,
      },
      action,
      now,
    );

    const starBonus = options?.isStar ?? false;
    const baseBond = INTERACTION_BOND[action] * (starBonus ? STAR_HOLDER_BOND_MULTIPLIER : 1);

    // Engagement doctrine rule 1 — actions must differ in OUTCOME, not just
    // label. Scale the baseline by this Skrumpey's hidden per-action preference
    // (loved 4× … hated −1×) and a need-state boost (1.5× when the action
    // targets a currently-low stat, measured on the pre-action/decayed
    // snapshot). Previously unwired: every action gave a flat bond bump.
    const preference = preferenceFor(tokenId, action);
    const needBoosted = isNeedTargeted(action, {
      hunger: decayed.hunger,
      happiness: decayed.happiness,
      energy: decayed.energy,
    });
    const preferenceAdjusted = computeBondDelta({ baseline: baseBond, preference, needBoosted });

    // [SWO_V2_SANCTUARY_SLEEP_DYNAMICS] — Tired halves non-sleep bond gains.
    const tired = isCompanionTired(comp.last_full_sleep_at, now);
    // Doctrine rule 1 — diminishing returns within the daily cap so spam-tapping
    // tapers (consistency > binge). Full value on the first interaction of the
    // day, down to ~0.5× as the cap fills.
    const diminish = 1 - 0.5 * (dailyCount / DAILY_INTERACTION_CAP);
    let bondGain = applyTiredBondMultiplier(preferenceAdjusted, action, tired) * diminish;
    const xpGain = Math.round(INTERACTION_XP[action] * (starBonus ? STAR_HOLDER_XP_MULTIPLIER : 1));

    // [SWO_V2_SANCTUARY_VARIABLE_REWARDS] — doctrine rules 4 & 7: ambient bonus
    // STAR on routine interactions, always with a floor. Most taps just give
    // bond; occasionally a +STAR drop (the Neko-Atsume "gold fish"). This is
    // the primary way STAR is farmed from day-to-day care.
    const variable = rollVariableReward({ action, floorBond: bondGain });
    const variableTier = variable.tier;
    let bonusStar = variable.bonusStar;
    if (variable.tier === 'rare_trinket') {
      // v1: surface the ultra-rare branch as a small STAR windfall. Proper
      // cosmetic trinkets are a shop/gacha follow-up — minting an off-catalog
      // inventory key here would break the inventory→catalog join.
      bonusStar = STAR_EARN_RATES.interaction.max;
    }

    // Classify the sleep-state delta this action produced and apply the
    // dream-reward / early-wake economy on top of the baseline bond gain.
    const transition = classifySleepTransition({
      wasSleeping: comp.is_sleeping === 1,
      nowSleeping: stats.is_sleeping === 1,
      action,
    });
    let dreamStarGained = 0;
    let nextLastFullSleep: string | null = comp.last_full_sleep_at ?? null;
    if (transition === 'full_cycle') {
      const reward = computeDreamReward({ starBonus });
      bondGain += reward.bond;
      dreamStarGained = reward.star;
      nextLastFullSleep = toSqlDate(now);
    } else if (transition === 'early_wake') {
      const outcome = computeEarlyWakeOutcome();
      bondGain += outcome.bondDelta;
    }

    db.prepare(`
      UPDATE sanctuary_companions
      SET bond_score = MAX(MIN(bond_score + ?, 100.0), 0.0),
          total_interactions = total_interactions + 1,
          hunger = ?,
          happiness = ?,
          energy = ?,
          is_sleeping = ?,
          sleep_started_at = ?,
          stats_updated_at = ?,
          last_full_sleep_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      bondGain,
      stats.hunger,
      stats.happiness,
      stats.energy,
      stats.is_sleeping,
      stats.sleep_started_at,
      toSqlDate(now),
      nextLastFullSleep,
      comp.id,
    );

    if (xpGain > 0) addUserXP(addr, xpGain);

    // Dream reward STAR mints inside the same txn — the savepoint nesting in
    // better-sqlite3 keeps the journal entry, bond bump, and STAR ledger row
    // atomic with the interaction.
    if (transition === 'full_cycle' && dreamStarGained > 0) {
      earnStar(addr, 'dream', dreamStarGained, `token:${tokenId}`);
    }

    // Mint the variable-reward bonus STAR (if any) in the same txn.
    if (bonusStar > 0) {
      earnStar(addr, 'interaction', bonusStar, `token:${tokenId}:${variableTier}`);
    }

    const bonusTag = starBonus ? ' (Star Bonus!)' : '';
    // Seed the variety pool with the action itself — the live trait-mood is
    // not on SanctuaryCompanion (it comes from the meta view), but rotating
    // by (action × hour-of-day-bucket) is enough variety for the journal.
    const message = journalLineForAction(action, action, now.getHours());
    const journal = addJournalEntry(addr, tokenId, 'interaction', message + bonusTag,
      JSON.stringify({
        action, bond: bondGain, xp: xpGain, starBonus,
        hunger: stats.hunger, happiness: stats.happiness, energy: stats.energy,
        is_sleeping: stats.is_sleeping, woke_up: stats.woke_up,
        tired, sleep_transition: transition,
        preference, needBoosted, variableTier, bonusStar,
      }));

    // [SWO_V2_SANCTUARY_SLEEP_DYNAMICS] — annotate the journal with a
    // dedicated entry for dream rewards / early-wake penalties so the UI
    // surface (and Acceptance #2/#3) can render them distinctly.
    if (transition === 'full_cycle') {
      addJournalEntry(
        addr, tokenId, 'sleep_dynamics',
        `Drifted through a full dream cycle — felt rested and recharged. +${dreamStarGained} STAR, +1 Bond.`,
        JSON.stringify({ transition, star: dreamStarGained, bond: 1 }),
      );
    } else if (transition === 'early_wake') {
      addJournalEntry(
        addr, tokenId, 'sleep_dynamics',
        'Roused mid-dream. They blinked, a little wobbly, and the bond felt thinner. −2 Bond.',
        JSON.stringify({ transition, bondDelta: -2 }),
      );
    }

    const updated = db.prepare('SELECT * FROM sanctuary_companions WHERE id = ?')
      .get(comp.id) as SanctuaryCompanion;

    return {
      companion: updated,
      journal,
      dailyRemaining: DAILY_INTERACTION_CAP - dailyCount - 1,
      starBonus,
      bondGain,
      preference,
      needBoosted,
      variableTier,
      bonusStar,
    };
  });

  return txn();
}

/**
 * V2.5 — read-only stats projection for the GET /api/sanctuary/companion/stats
 * route. Returns the current decayed values plus the labelled needs[] without
 * mutating the persisted snapshot. Returns null when the wallet has no active
 * companion for the given token id.
 */
export function getCompanionStatsSnapshot(
  walletAddress: string,
  tokenId: number,
  now: Date = new Date(),
): { stats: DecayedStats; needs: string[]; updated_at: string | null } | null {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const comp = db.prepare(
    'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ? AND is_active = 1'
  ).get(addr, tokenId) as SanctuaryCompanion | undefined;
  if (!comp) return null;

  const stats = decayStats(
    {
      hunger: comp.hunger,
      happiness: comp.happiness,
      energy: comp.energy,
      stats_updated_at: comp.stats_updated_at,
      is_sleeping: comp.is_sleeping,
    },
    now,
  );
  return { stats, needs: computeNeeds(stats), updated_at: comp.stats_updated_at };
}

/**
 * V2.5 — converge the persisted vitality snapshot with wall-clock decay and
 * bump `stats_updated_at`. Idempotent: calling twice in the same second is a
 * no-op since the elapsed delta rounds to zero. `interactWithCompanion`
 * applies decay inline (see `decayed` snapshot above), so direct callers only
 * need this when they want to persist decay outside an interact path — e.g.
 * a background refresh job. Returns the updated row, or null when no active
 * companion exists for the wallet/token pair.
 */
export function tickStats(
  walletAddress: string,
  tokenId: number,
  now: Date = new Date(),
): SanctuaryCompanion | null {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const comp = db.prepare(
    'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ? AND is_active = 1'
  ).get(addr, tokenId) as SanctuaryCompanion | undefined;
  if (!comp) return null;

  const decayed = decayStats(
    {
      hunger: comp.hunger,
      happiness: comp.happiness,
      energy: comp.energy,
      stats_updated_at: comp.stats_updated_at,
      is_sleeping: comp.is_sleeping,
    },
    now,
  );

  db.prepare(`
    UPDATE sanctuary_companions
    SET hunger = ?, happiness = ?, energy = ?, stats_updated_at = ?
    WHERE id = ?
  `).run(decayed.hunger, decayed.happiness, decayed.energy, toSqlDate(now), comp.id);

  return db.prepare('SELECT * FROM sanctuary_companions WHERE id = ?').get(comp.id) as SanctuaryCompanion;
}

export function addJournalEntry(
  walletAddress: string, tokenId: number, entryType: string, content: string, metadata: string = '{}'
): SanctuaryJournalEntry {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO sanctuary_journal (wallet_address, token_id, entry_type, content, metadata)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(walletAddress.toLowerCase(), tokenId, entryType, content, metadata);
  return db.prepare('SELECT * FROM sanctuary_journal WHERE id = ?').get(result.lastInsertRowid) as SanctuaryJournalEntry;
}

export function getJournalEntries(walletAddress: string, tokenId: number, limit: number = 20): SanctuaryJournalEntry[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM sanctuary_journal
    WHERE wallet_address = ? AND token_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(walletAddress.toLowerCase(), tokenId, limit) as SanctuaryJournalEntry[];
}

export function getJournalEntriesPaginated(
  walletAddress: string, tokenId: number,
  options: { page?: number; limit?: number; type?: string; before?: string }
): { entries: SanctuaryJournalEntry[]; total: number; page: number; totalPages: number } {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const offset = (page - 1) * limit;

  const conditions = ['wallet_address = ?', 'token_id = ?'];
  const params: (string | number)[] = [addr, tokenId];

  if (options.type) {
    conditions.push('entry_type = ?');
    params.push(options.type);
  }
  if (options.before) {
    conditions.push('created_at < ?');
    params.push(options.before);
  }

  const where = conditions.join(' AND ');

  const total = (db.prepare(`SELECT COUNT(*) as count FROM sanctuary_journal WHERE ${where}`).get(...params) as { count: number }).count;

  const entries = db.prepare(`
    SELECT * FROM sanctuary_journal WHERE ${where}
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as SanctuaryJournalEntry[];

  return { entries, total, page, totalPages: Math.ceil(total / limit) || 1 };
}

export interface JournalStats {
  total: number;
  byType: Record<string, number>;
  firstEntry: string | null;
  lastEntry: string | null;
}

export function getJournalStats(walletAddress: string, tokenId: number): JournalStats {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const total = (db.prepare(
    'SELECT COUNT(*) as count FROM sanctuary_journal WHERE wallet_address = ? AND token_id = ?'
  ).get(addr, tokenId) as { count: number }).count;

  const typeCounts = db.prepare(
    'SELECT entry_type, COUNT(*) as count FROM sanctuary_journal WHERE wallet_address = ? AND token_id = ? GROUP BY entry_type'
  ).all(addr, tokenId) as { entry_type: string; count: number }[];

  const byType: Record<string, number> = {};
  for (const row of typeCounts) byType[row.entry_type] = row.count;

  const range = db.prepare(
    'SELECT MIN(created_at) as first_entry, MAX(created_at) as last_entry FROM sanctuary_journal WHERE wallet_address = ? AND token_id = ?'
  ).get(addr, tokenId) as { first_entry: string | null; last_entry: string | null };

  return { total, byType, firstEntry: range.first_entry, lastEntry: range.last_entry };
}

export function getSanctuaryMapLocations(): SanctuaryMapLocation[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM sanctuary_map_locations ORDER BY unlock_level, name').all() as SanctuaryMapLocation[];
}

const ACTIVITY_DURATIONS: Record<string, number> = {
  'Hot Springs': 60,
  'Training Grounds': 120,
  'Star Garden': 90,
  'Cosmic Library': 180,
  'Nebula Kitchen': 45,
  'Dream Hollow': 30,
  'Aura Forge': 240,
  'Observatory': 150,
};

export const TIMED_QUEST_DURATIONS_MINUTES = [5, 15, 60, 240, 480] as const;
export type TimedQuestDurationMinutes = typeof TIMED_QUEST_DURATIONS_MINUTES[number];

function isValidTimedDuration(minutes: number): minutes is TimedQuestDurationMinutes {
  return (TIMED_QUEST_DURATIONS_MINUTES as readonly number[]).includes(minutes);
}

const ACTIVITY_BOND_REWARDS: Record<string, number> = {
  'Dream Hollow': 0.8,
  'Nebula Kitchen': 1.2,
  'Hot Springs': 2.0,
  'Star Garden': 2.8,
  'Training Grounds': 4.0,
  'Observatory': 5.5,
  'Cosmic Library': 6.5,
  'Aura Forge': 9.0,
};

const ACTIVITY_XP_REWARDS: Record<string, number> = {
  'Dream Hollow': 5,
  'Nebula Kitchen': 8,
  'Hot Springs': 12,
  'Star Garden': 15,
  'Training Grounds': 20,
  'Observatory': 25,
  'Cosmic Library': 30,
  'Aura Forge': 40,
};

// --- Training Grounds (V1.7) ---
// Per-companion XP thresholds (cumulative). Level 1 = 0-99 XP, Level 2 = 100-299 XP, etc.
export const COMPANION_LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500] as const;

export function calculateCompanionLevel(xp: number): number {
  let level = 1;
  for (let i = 1; i < COMPANION_LEVEL_THRESHOLDS.length; i++) {
    if (xp >= COMPANION_LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return level;
}

export interface CompanionTrainingTypeDef {
  type: string;
  label: string;
  durationMinutes: number;
  xpReward: number;
  bondReward: number;
  minLevel: number;
  description: string;
}

// Training types keyed by name. Higher-level variants unlock at higher companion levels
// and grant more XP (and longer duration).
export const COMPANION_TRAINING_TYPES: Record<string, CompanionTrainingTypeDef> = {
  Endurance: {
    type: 'Endurance',
    label: 'Endurance',
    durationMinutes: 1,
    xpReward: 40,
    bondReward: 0.5,
    minLevel: 1,
    description: 'Short stamina drill. Quick XP for new companions.',
  },
  Agility: {
    type: 'Agility',
    label: 'Agility',
    durationMinutes: 2,
    xpReward: 85,
    bondReward: 0.8,
    minLevel: 2,
    description: 'Reflex and speed work. Unlocks at level 2.',
  },
  Wisdom: {
    type: 'Wisdom',
    label: 'Wisdom',
    durationMinutes: 5,
    xpReward: 180,
    bondReward: 1.2,
    minLevel: 3,
    description: 'Focused meditation drills. Unlocks at level 3.',
  },
  'Intense Endurance': {
    type: 'Intense Endurance',
    label: 'Intense Endurance',
    durationMinutes: 10,
    xpReward: 360,
    bondReward: 2.0,
    minLevel: 4,
    description: 'Grueling stamina circuit. Unlocks at level 4.',
  },
  'Master Training': {
    type: 'Master Training',
    label: 'Master Training',
    durationMinutes: 20,
    xpReward: 700,
    bondReward: 3.0,
    minLevel: 5,
    description: 'Peak conditioning across all disciplines. Unlocks at level 5.',
  },
};

export function listTrainingTypesForLevel(companionLevel: number): CompanionTrainingTypeDef[] {
  return Object.values(COMPANION_TRAINING_TYPES)
    .filter((t) => t.minLevel <= companionLevel)
    .sort((a, b) => a.minLevel - b.minLevel || a.xpReward - b.xpReward);
}

export function startCompanionTraining(
  walletAddress: string,
  tokenId: number,
  trainingType: string,
): { companion: SanctuaryCompanion; journal: SanctuaryJournalEntry; training: CompanionTrainingTypeDef } {
  const def = COMPANION_TRAINING_TYPES[trainingType];
  if (!def) throw new Error('Invalid training type');

  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const comp = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ? AND is_active = 1'
    ).get(addr, tokenId) as SanctuaryCompanion | undefined;

    if (!comp) throw new Error('No active companion found');

    if (comp.activity_ends_at) {
      const endsAt = new Date(comp.activity_ends_at + 'Z').getTime();
      if (endsAt > Date.now()) throw new Error('Companion is already on an activity');
    }

    const companionLevel = calculateCompanionLevel(comp.xp ?? 0);
    if (companionLevel < def.minLevel) {
      throw new Error(`Training requires companion level ${def.minLevel}`);
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + def.durationMinutes * 60 * 1000);

    db.prepare(`
      UPDATE sanctuary_companions
      SET current_activity = ?,
          activity_started_at = ?,
          activity_ends_at = ?,
          total_interactions = total_interactions + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      `training:${def.type}`,
      now.toISOString().replace('T', ' ').slice(0, 19),
      endsAt.toISOString().replace('T', ' ').slice(0, 19),
      comp.id,
    );

    const journal = addJournalEntry(addr, tokenId, 'activity',
      `Began ${def.label} training at the Training Grounds. (${def.durationMinutes}m)`,
      JSON.stringify({ action: 'start_training', training_type: def.type, duration_minutes: def.durationMinutes }));

    const updated = db.prepare('SELECT * FROM sanctuary_companions WHERE id = ?')
      .get(comp.id) as SanctuaryCompanion;

    return { companion: updated, journal, training: def };
  });

  return txn();
}

export function sendToActivity(
  walletAddress: string, tokenId: number, locationId: number,
  options?: { durationMinutes?: number }
): { companion: SanctuaryCompanion; journal: SanctuaryJournalEntry } {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const comp = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ? AND is_active = 1'
    ).get(addr, tokenId) as SanctuaryCompanion | undefined;

    if (!comp) throw new Error('No active companion found');

    if (comp.activity_ends_at) {
      const endsAt = new Date(comp.activity_ends_at + 'Z').getTime();
      if (endsAt > Date.now()) {
        throw new Error('Companion is already on an activity');
      }
    }

    const location = db.prepare(
      'SELECT * FROM sanctuary_map_locations WHERE id = ?'
    ).get(locationId) as SanctuaryMapLocation | undefined;

    if (!location) throw new Error('Location not found');

    const requestedDuration = options?.durationMinutes;
    if (requestedDuration !== undefined && !isValidTimedDuration(requestedDuration)) {
      throw new Error('Invalid quest duration');
    }
    const durationMinutes = requestedDuration ?? ACTIVITY_DURATIONS[location.name] ?? 60;
    const now = new Date();
    const endsAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

    db.prepare(`
      UPDATE sanctuary_companions
      SET current_activity = ?,
          activity_started_at = ?,
          activity_ends_at = ?,
          total_interactions = total_interactions + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      `exploring:${location.name}`,
      now.toISOString().replace('T', ' ').slice(0, 19),
      endsAt.toISOString().replace('T', ' ').slice(0, 19),
      comp.id
    );

    const journal = addJournalEntry(addr, tokenId, 'activity',
      `Set off to explore ${location.name}. ${location.description ?? ''} (${durationMinutes}m)`,
      JSON.stringify({ action: 'send_to_activity', location_id: locationId, location_name: location.name, duration_minutes: durationMinutes }));

    const updated = db.prepare('SELECT * FROM sanctuary_companions WHERE id = ?')
      .get(comp.id) as SanctuaryCompanion;

    return { companion: updated, journal };
  });

  return txn();
}

export interface CompleteActivityResult {
  companion: SanctuaryCompanion;
  journal: SanctuaryJournalEntry;
  starBonus: boolean;
  isTraining?: boolean;
  trainingType?: string;
  companionXpAwarded?: number;
  levelBefore?: number;
  levelAfter?: number;
  leveledUp?: boolean;
}

export function completeActivity(
  walletAddress: string, tokenId: number,
  options?: { isStar?: boolean }
): CompleteActivityResult | null {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const comp = db.prepare(
      'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ? AND is_active = 1'
    ).get(addr, tokenId) as SanctuaryCompanion | undefined;

    if (!comp || !comp.activity_ends_at) return null;

    const endsAt = new Date(comp.activity_ends_at + 'Z').getTime();
    if (endsAt > Date.now()) return null;

    const starBonus = options?.isStar ?? false;
    const isTraining = comp.current_activity.startsWith('training:');

    if (isTraining) {
      const trainingType = comp.current_activity.slice('training:'.length);
      const def = COMPANION_TRAINING_TYPES[trainingType];
      const xpBase = def?.xpReward ?? 20;
      const bondBase = def?.bondReward ?? 0.5;
      const bondReward = bondBase * (starBonus ? STAR_HOLDER_BOND_MULTIPLIER : 1);
      const companionXpAwarded = Math.round(xpBase * (starBonus ? STAR_HOLDER_XP_MULTIPLIER : 1));

      const xpBefore = comp.xp ?? 0;
      const xpAfter = xpBefore + companionXpAwarded;
      const levelBefore = calculateCompanionLevel(xpBefore);
      const levelAfter = calculateCompanionLevel(xpAfter);

      db.prepare(`
        UPDATE sanctuary_companions
        SET current_activity = 'lounging',
            activity_started_at = NULL,
            activity_ends_at = NULL,
            bond_score = MIN(bond_score + ?, 100.0),
            xp = ?,
            level = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(bondReward, xpAfter, levelAfter, comp.id);

      addUserXP(addr, companionXpAwarded);

      const bonusTag = starBonus ? ' (Star Bonus!)' : '';
      const levelUpTag = levelAfter > levelBefore ? ` — LEVEL UP! ${levelBefore} → ${levelAfter}` : '';
      const journal = addJournalEntry(addr, tokenId, 'activity',
        `Finished ${trainingType} training. Bond +${bondReward.toFixed(1)}, XP +${companionXpAwarded}${bonusTag}${levelUpTag}`,
        JSON.stringify({
          action: 'complete_training',
          training_type: trainingType,
          bond_reward: bondReward,
          companion_xp_awarded: companionXpAwarded,
          level_before: levelBefore,
          level_after: levelAfter,
          starBonus,
        }));

      const updated = db.prepare('SELECT * FROM sanctuary_companions WHERE id = ?')
        .get(comp.id) as SanctuaryCompanion;

      return {
        companion: updated,
        journal,
        starBonus,
        isTraining: true,
        trainingType,
        companionXpAwarded,
        levelBefore,
        levelAfter,
        leveledUp: levelAfter > levelBefore,
      };
    }

    const activityName = comp.current_activity.startsWith('exploring:')
      ? comp.current_activity.slice('exploring:'.length)
      : comp.current_activity;

    const bondReward = (ACTIVITY_BOND_REWARDS[activityName] ?? 1.0) * (starBonus ? STAR_HOLDER_BOND_MULTIPLIER : 1);
    const xpReward = Math.round((ACTIVITY_XP_REWARDS[activityName] ?? 5) * (starBonus ? STAR_HOLDER_XP_MULTIPLIER : 1));

    db.prepare(`
      UPDATE sanctuary_companions
      SET current_activity = 'lounging',
          activity_started_at = NULL,
          activity_ends_at = NULL,
          bond_score = MIN(bond_score + ?, 100.0),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(bondReward, comp.id);

    addUserXP(addr, xpReward);

    const bonusTag = starBonus ? ' (Star Bonus!)' : '';
    const journal = addJournalEntry(addr, tokenId, 'activity',
      `Returned from ${activityName} feeling refreshed! Bond +${bondReward.toFixed(1)}, XP +${xpReward}${bonusTag}`,
      JSON.stringify({ action: 'complete_activity', location_name: activityName, bond_reward: bondReward, xp_reward: xpReward, starBonus }));

    const updated = db.prepare('SELECT * FROM sanctuary_companions WHERE id = ?')
      .get(comp.id) as SanctuaryCompanion;

    return { companion: updated, journal, starBonus };
  });

  return txn();
}

// ============================================================================
// Minigame system (V1.8) — shared scoring + STAR rewards across mini-games
// ============================================================================

export interface MinigameDef {
  game_id: string;
  label: string;
  description: string;
  durationSeconds: number;
  firstPlayBonusStar: number;
  starPerScore: number; // STAR awarded = floor(score * starPerScore), capped
  starCapPerPlay: number;
}

export const SANCTUARY_MINIGAMES: Record<string, MinigameDef> = {
  'star-catch': {
    game_id: 'star-catch',
    label: 'Star Catch',
    description: 'Catch falling stars before they hit the ground.',
    durationSeconds: 60,
    firstPlayBonusStar: 25,
    starPerScore: 0.05,
    starCapPerPlay: 10,
  },
  'memory-match': {
    game_id: 'memory-match',
    label: 'Mood Match',
    description: 'Flip tiles in the Hot Springs to match Skrumpey moods. Streaks earn bonus points; clearing the board re-deals.',
    durationSeconds: 75,
    firstPlayBonusStar: 25,
    starPerScore: 0.04,
    starCapPerPlay: 10,
  },
  'star-connect': {
    game_id: 'star-connect',
    label: 'Star Connect',
    description: 'Trace constellations from the Observatory tablet — click each star in the highlighted order. Perfect rounds earn a bonus.',
    durationSeconds: 70,
    firstPlayBonusStar: 25,
    starPerScore: 0.05,
    starCapPerPlay: 10,
  },
  'forge-hammer': {
    game_id: 'forge-hammer',
    label: 'Forge Hammer',
    description: 'Time SPACE strikes against the Aura Forge anvil. Hit the gold center for PERFECT — chain hits to ramp the meter.',
    durationSeconds: 60,
    firstPlayBonusStar: 25,
    starPerScore: 0.05,
    starCapPerPlay: 10,
  },
  'cooking-rhythm': {
    game_id: 'cooking-rhythm',
    label: 'Cosmic Skillet',
    description: 'Press arrow keys to match recipe notes as they reach the pan. Streaks ramp the speed and bonus.',
    durationSeconds: 70,
    firstPlayBonusStar: 25,
    starPerScore: 0.04,
    starCapPerPlay: 10,
  },
  'dream-catcher': {
    game_id: 'dream-catcher',
    label: 'Dream Catcher',
    description: 'Move the dreamcatcher to scoop dream and lucid orbs while letting nightmares slip past.',
    durationSeconds: 75,
    firstPlayBonusStar: 25,
    starPerScore: 0.04,
    starCapPerPlay: 10,
  },
  'lore-trivia': {
    game_id: 'lore-trivia',
    label: 'Lore Tome',
    description: 'Answer Sanctuary trivia. Quick, correct answers build streak and speed bonuses; wrong answers cost points.',
    durationSeconds: 75,
    firstPlayBonusStar: 25,
    starPerScore: 0.05,
    starCapPerPlay: 10,
  },
};

export function getMinigameDef(gameId: string): MinigameDef | null {
  return SANCTUARY_MINIGAMES[gameId] ?? null;
}

export interface SanctuaryMinigameScore {
  id: number;
  wallet_address: string;
  token_id: number;
  game_id: string;
  score: number;
  star_awarded: number;
  played_at: string;
}

export interface MinigameSubmissionResult {
  score: number;
  star_awarded: number;
  is_first_play: boolean;
  personal_best: number;
  is_new_personal_best: boolean;
  total_plays: number;
  game_id: string;
  token_id: number;
}

export function submitMinigameScore(
  walletAddress: string,
  tokenId: number,
  gameId: string,
  score: number,
): MinigameSubmissionResult {
  const def = getMinigameDef(gameId);
  if (!def) throw new Error('Invalid minigame');
  if (!Number.isFinite(score) || score < 0) throw new Error('Invalid score');

  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const cappedScore = Math.min(Math.floor(score), 9999);

  const txn = db.transaction(() => {
    const prior = db.prepare(
      'SELECT COUNT(*) as count, COALESCE(MAX(score), 0) as best FROM sanctuary_minigame_scores WHERE wallet_address = ? AND token_id = ? AND game_id = ?',
    ).get(addr, tokenId, gameId) as { count: number; best: number };

    const isFirstPlay = prior.count === 0;
    const scoreReward = Math.min(
      Math.floor(cappedScore * def.starPerScore),
      def.starCapPerPlay,
    );
    const firstPlayBonus = isFirstPlay ? def.firstPlayBonusStar : 0;
    const starAwarded = scoreReward + firstPlayBonus;

    db.prepare(
      'INSERT INTO sanctuary_minigame_scores (wallet_address, token_id, game_id, score, star_awarded) VALUES (?, ?, ?, ?, ?)',
    ).run(addr, tokenId, gameId, cappedScore, starAwarded);

    if (starAwarded > 0) {
      addUserXP(addr, starAwarded);
    }

    addJournalEntry(addr, tokenId, 'achievement',
      `Played ${def.label} — Score ${cappedScore}, STAR +${starAwarded}${isFirstPlay ? ' (first play bonus!)' : ''}`,
      JSON.stringify({
        action: 'minigame_score',
        game_id: gameId,
        score: cappedScore,
        star_awarded: starAwarded,
        first_play: isFirstPlay,
      }),
    );

    return {
      score: cappedScore,
      star_awarded: starAwarded,
      is_first_play: isFirstPlay,
      personal_best: Math.max(prior.best, cappedScore),
      is_new_personal_best: cappedScore > prior.best,
      total_plays: prior.count + 1,
      game_id: gameId,
      token_id: tokenId,
    };
  });

  return txn();
}

export interface MinigameLeaderboardRow {
  rank: number;
  wallet_address: string;
  token_id: number;
  score: number;
  played_at: string;
}

export function getMinigameLeaderboard(
  gameId: string,
  limit: number = 20,
): MinigameLeaderboardRow[] {
  const db = getDatabase();
  const cap = Math.max(1, Math.min(Math.floor(limit), 100));
  // Best score per (wallet, token) pair, ranked descending.
  const rows = db.prepare(`
    SELECT wallet_address, token_id, score, played_at
    FROM (
      SELECT wallet_address, token_id, score, played_at,
             ROW_NUMBER() OVER (PARTITION BY wallet_address, token_id ORDER BY score DESC, played_at ASC) as rn
      FROM sanctuary_minigame_scores
      WHERE game_id = ?
    )
    WHERE rn = 1
    ORDER BY score DESC, played_at ASC
    LIMIT ?
  `).all(gameId, cap) as Array<{
    wallet_address: string;
    token_id: number;
    score: number;
    played_at: string;
  }>;

  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

export function getMinigamePersonalBest(
  walletAddress: string,
  tokenId: number,
  gameId: string,
): { personal_best: number; total_plays: number; total_star_earned: number } {
  const db = getDatabase();
  const row = db.prepare(
    'SELECT COUNT(*) as count, COALESCE(MAX(score), 0) as best, COALESCE(SUM(star_awarded), 0) as star FROM sanctuary_minigame_scores WHERE wallet_address = ? AND token_id = ? AND game_id = ?',
  ).get(walletAddress.toLowerCase(), tokenId, gameId) as {
    count: number;
    best: number;
    star: number;
  };
  return {
    personal_best: row.best,
    total_plays: row.count,
    total_star_earned: row.star,
  };
}

export function getCompanionsAtLocations(): { location_name: string; count: number; companions: { token_id: number; nickname: string | null }[] }[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT sc.current_activity, sc.token_id, sc.nickname, sc.activity_ends_at
    FROM sanctuary_companions sc
    WHERE sc.current_activity LIKE 'exploring:%'
      AND sc.is_active = 1
    ORDER BY sc.current_activity
  `).all() as { current_activity: string; token_id: number; nickname: string | null; activity_ends_at: string | null }[];

  const grouped: Record<string, { token_id: number; nickname: string | null }[]> = {};
  for (const row of rows) {
    if (row.activity_ends_at) {
      const endsAt = new Date(row.activity_ends_at + 'Z').getTime();
      if (endsAt < Date.now()) continue;
    }
    const locName = row.current_activity.slice('exploring:'.length);
    if (!grouped[locName]) grouped[locName] = [];
    grouped[locName].push({ token_id: row.token_id, nickname: row.nickname });
  }

  return Object.entries(grouped).map(([location_name, companions]) => ({
    location_name,
    count: companions.length,
    companions,
  }));
}

export function getSanctuaryState(walletAddress: string): {
  activeCompanion: SanctuaryCompanionWithMeta | null;
  companions: SanctuaryCompanionWithMeta[];
  recentJournal: SanctuaryJournalEntry[];
} {
  const addr = walletAddress.toLowerCase();
  const activeCompanion = getActiveCompanion(addr);
  const companions = getAllCompanions(addr);
  const recentJournal = activeCompanion
    ? getJournalEntries(addr, activeCompanion.token_id, 10)
    : [];

  return { activeCompanion, companions, recentJournal };
}

export type OnboardingStep =
  | 'select-companion'
  | 'enter-room'
  | 'interact-npc'
  | 'open-quest-board'
  | 'try-minigame'
  | 'done';

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  'select-companion',
  'enter-room',
  'interact-npc',
  'open-quest-board',
  'try-minigame',
  'done',
] as const;

export interface SanctuaryPlayerState {
  wallet_address: string;
  intro_completed: number;
  first_visit_at: string;
  last_visit_at: string;
  total_visits: number;
  created_at: string;
  updated_at: string;
  onboarding_step: OnboardingStep | null;
  onboarding_skipped: number;
}

export function getPlayerState(walletAddress: string): SanctuaryPlayerState | null {
  const addr = walletAddress.toLowerCase();
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM sanctuary_player_state WHERE wallet_address = ?')
    .get(addr) as SanctuaryPlayerState | undefined;
  return row ?? null;
}

export function upsertPlayerVisit(walletAddress: string): SanctuaryPlayerState {
  const addr = walletAddress.toLowerCase();
  const db = getDatabase();
  db.prepare(`
    INSERT INTO sanctuary_player_state (wallet_address, intro_completed, total_visits)
    VALUES (?, 0, 1)
    ON CONFLICT(wallet_address) DO UPDATE SET
      last_visit_at = CURRENT_TIMESTAMP,
      total_visits = total_visits + 1,
      updated_at = CURRENT_TIMESTAMP
  `).run(addr);
  return getPlayerState(addr) as SanctuaryPlayerState;
}

export function markIntroCompleted(walletAddress: string): SanctuaryPlayerState {
  const addr = walletAddress.toLowerCase();
  const db = getDatabase();
  db.prepare(`
    INSERT INTO sanctuary_player_state (wallet_address, intro_completed)
    VALUES (?, 1)
    ON CONFLICT(wallet_address) DO UPDATE SET
      intro_completed = 1,
      updated_at = CURRENT_TIMESTAMP
  `).run(addr);
  return getPlayerState(addr) as SanctuaryPlayerState;
}

function isValidOnboardingStep(step: string): step is OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(step);
}

export function setOnboardingStep(
  walletAddress: string,
  step: OnboardingStep,
): SanctuaryPlayerState {
  if (!isValidOnboardingStep(step)) {
    throw new Error(`Invalid onboarding step: ${step}`);
  }
  const addr = walletAddress.toLowerCase();
  const db = getDatabase();
  db.prepare(`
    INSERT INTO sanctuary_player_state (wallet_address, intro_completed, onboarding_step)
    VALUES (?, 0, ?)
    ON CONFLICT(wallet_address) DO UPDATE SET
      onboarding_step = excluded.onboarding_step,
      updated_at = CURRENT_TIMESTAMP
  `).run(addr, step);
  return getPlayerState(addr) as SanctuaryPlayerState;
}

export function skipOnboarding(walletAddress: string): SanctuaryPlayerState {
  const addr = walletAddress.toLowerCase();
  const db = getDatabase();
  db.prepare(`
    INSERT INTO sanctuary_player_state (wallet_address, intro_completed, onboarding_skipped, onboarding_step)
    VALUES (?, 0, 1, 'done')
    ON CONFLICT(wallet_address) DO UPDATE SET
      onboarding_skipped = 1,
      onboarding_step = 'done',
      updated_at = CURRENT_TIMESTAMP
  `).run(addr);
  return getPlayerState(addr) as SanctuaryPlayerState;
}

// Expedition stubs — tables exist but functions not yet implemented
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getAvailableExpeditions(_walletAddress: string) {
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getActiveExpeditionRun(_walletAddress: string) {
  return null;
}

// Legacy stubs removed in V2.6 — see startExpeditionRun / chooseExpeditionStep
// below for the real expedition lifecycle. Old callers (none in tree at the
// time of this PR) should migrate to the new helpers.

export function getPublicActivityFeed(limit: number, before?: string) {
  const db = getDatabase();
  const conditions = ['1=1'];
  const params: (string | number)[] = [];
  if (before) {
    conditions.push('sj.created_at < ?');
    params.push(before);
  }
  params.push(limit);
  return db.prepare(`
    SELECT sj.*, sc.nickname
    FROM sanctuary_journal sj
    LEFT JOIN sanctuary_companions sc ON sc.wallet_address = sj.wallet_address AND sc.token_id = sj.token_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY sj.created_at DESC
    LIMIT ?
  `).all(...params) as (SanctuaryJournalEntry & { nickname: string | null })[];
}

// ─── V1.5: Chat Messages ───────────────────────────────────────────

export interface SanctuaryChatMessage {
  id: number;
  wallet_address: string;
  token_id: number;
  role: 'user' | 'companion';
  content: string;
  created_at: string;
}

const PERSONALITY_TEMPLATES: Record<string, { greeting: string; phrases: string[]; style: string }> = {
  aether: {
    greeting: 'The cosmic winds whisper your arrival...',
    phrases: ['the stars reveal', 'cosmic energy suggests', 'in the astral plane', 'ethereal vibrations tell me'],
    style: 'mystical and dreamy',
  },
  spectra: {
    greeting: 'My light shifts to welcome you!',
    phrases: ['through the spectrum', 'colors of the cosmos show', 'in prismatic clarity', 'light patterns indicate'],
    style: 'vibrant and enthusiastic',
  },
  solveil: {
    greeting: 'Basking in your warm presence...',
    phrases: ['solar wisdom says', 'by the light of the sun', 'warmth flows through', 'radiant energy tells'],
    style: 'warm and nurturing',
  },
  nebulu: {
    greeting: 'Drifting through the nebula to greet you...',
    phrases: ['in the cosmic mist', 'nebula clouds reveal', 'stardust whispers', 'deep space echoes'],
    style: 'mysterious and contemplative',
  },
  chroma: {
    greeting: 'All my colors brighten for you!',
    phrases: ['chromatic shifts show', 'in vivid detail', 'brilliant hues suggest', 'color waves tell'],
    style: 'playful and colorful',
  },
  rose: {
    greeting: 'Petals unfurl at your approach...',
    phrases: ['rose-tinted visions show', 'in the garden of stars', 'gentle stardust says', 'petal whispers reveal'],
    style: 'gentle and poetic',
  },
  monflare: {
    greeting: 'FLARE UP! Ready for action!',
    phrases: ['blazing hot take:', 'fire in the chain says', 'with explosive energy', 'igniting the truth:'],
    style: 'energetic and bold',
  },
  auracore: {
    greeting: 'My aura pulses in sync with yours...',
    phrases: ['core resonance shows', 'aura alignment reveals', 'inner energy says', 'at the core of it all'],
    style: 'centered and wise',
  },
  parallel: {
    greeting: 'Across dimensions, I sensed you coming...',
    phrases: ['in the parallel realm', 'dimensional echoes say', 'across realities', 'the multiverse reveals'],
    style: 'philosophical and quirky',
  },
  prime: {
    greeting: 'The Prime acknowledges your presence.',
    phrases: ['prime analysis shows', 'at the fundamental level', 'core truth:', 'the essence reveals'],
    style: 'regal and authoritative',
  },
};

const DEFAULT_PERSONALITY = {
  greeting: 'Hey there, friend!',
  phrases: ['I think', 'it seems like', 'my instinct says', 'from what I can tell'],
  style: 'friendly and curious',
};

const MOOD_RESPONSES: Record<string, string[]> = {
  happy: ['I\'m feeling great today!', 'Everything is wonderful!', 'Life in the sanctuary is amazing!'],
  excited: ['I can barely contain my excitement!', 'Something big is coming, I can feel it!', 'LET\'S GO!'],
  calm: ['Taking it easy today...', 'Just vibing in the sanctuary.', 'Peace and serenity.'],
  sleepy: ['*yawns* I\'m a bit drowsy...', 'Could use a nap in Dream Hollow...', 'Zzz... oh, you\'re here!'],
  curious: ['I\'ve been wondering about something...', 'Did you know...?', 'I want to explore more!'],
};

const BOND_RESPONSES: Record<string, string[]> = {
  low: ['We\'re just getting to know each other!', 'I hope we become great friends.', 'Tell me about yourself!'],
  medium: ['I really enjoy your company.', 'Our bond grows stronger every day!', 'You\'re a great companion.'],
  high: ['You\'re my absolute best friend!', 'I can\'t imagine the sanctuary without you!', 'Our bond is legendary!'],
};

const TOPIC_RESPONSES: Record<string, string[]> = {
  food: ['Nebula Kitchen has the best cosmic treats!', 'Have you tried star-crystal cookies?', 'I could eat cosmic berries all day!'],
  adventure: ['Training Grounds are calling my name!', 'I heard there\'s treasure in the Observatory!', 'Let\'s explore together!'],
  stars: ['The constellations are beautiful tonight.', 'Each star tells a story.', 'I feel connected to the cosmos.'],
  friends: ['I wonder what the other Skrumpeys are up to.', 'The Hot Springs are always a good hangout spot.', 'Every Skrumpey has a unique aura!'],
  monad: ['The chain is our home, forever recorded.', 'On-chain memories last forever!', 'Monad moves fast, just like me!'],
};

function generateCompanionResponse(
  companion: SanctuaryCompanionWithMeta,
  userMessage: string,
  chatHistory: SanctuaryChatMessage[],
): string {
  const constellation = companion.constellation?.toLowerCase() ?? '';
  const personality = PERSONALITY_TEMPLATES[constellation] ?? DEFAULT_PERSONALITY;
  const mood = companion.mood ?? 'calm';
  const bondLevel = companion.bond_score < 30 ? 'low' : companion.bond_score < 70 ? 'medium' : 'high';

  const lower = userMessage.toLowerCase();

  if (chatHistory.length === 0 || lower.includes('hello') || lower.includes('hi ') || lower === 'hi') {
    return personality.greeting;
  }

  if (lower.includes('how are you') || lower.includes('how do you feel') || lower.includes('mood')) {
    const moodResponses = MOOD_RESPONSES[mood] ?? MOOD_RESPONSES.calm;
    return pick(moodResponses);
  }

  if (lower.includes('bond') || lower.includes('friend') || lower.includes('us') || lower.includes('relationship')) {
    return pick(BOND_RESPONSES[bondLevel]);
  }

  const topicMatch = Object.entries(TOPIC_RESPONSES).find(([key]) => lower.includes(key));
  if (topicMatch) {
    const phrase = pick(personality.phrases);
    return `${phrase}, ${pick(topicMatch[1]).toLowerCase()}`;
  }

  if (lower.includes('name') || lower.includes('who are you')) {
    const name = companion.nickname || `Skrumpey #${companion.token_id}`;
    return `I'm ${name}! ${companion.constellation ? `A ${companion.constellation} constellation Skrumpey.` : 'Your loyal companion.'} ${pick(personality.phrases)}, we make a great team!`;
  }

  if (lower.includes('?')) {
    const phrase = pick(personality.phrases);
    return `Hmm, ${phrase}... ${pick(BOND_RESPONSES[bondLevel]).toLowerCase()}`;
  }

  const fillers = [
    `${pick(personality.phrases)}... that's interesting!`,
    `I love chatting with you! ${pick(MOOD_RESPONSES[mood] ?? MOOD_RESPONSES.calm)}`,
    `${pick(BOND_RESPONSES[bondLevel])} Tell me more!`,
    `*wiggles happily* You always have the best things to say!`,
  ];
  return pick(fillers);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function addCompanionChatMessage(
  walletAddress: string, tokenId: number, role: 'user' | 'companion', content: string,
): SanctuaryChatMessage {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO sanctuary_chat_messages (wallet_address, token_id, role, content)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(walletAddress.toLowerCase(), tokenId, role, content);
  return db.prepare('SELECT * FROM sanctuary_chat_messages WHERE id = ?').get(result.lastInsertRowid) as SanctuaryChatMessage;
}

export function getCompanionChatHistory(walletAddress: string, tokenId: number, limit: number = 50, offset: number = 0): SanctuaryChatMessage[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM sanctuary_chat_messages
    WHERE wallet_address = ? AND token_id = ?
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(walletAddress.toLowerCase(), tokenId, limit, offset) as SanctuaryChatMessage[];
}

export function getCompanionChatHistoryCount(walletAddress: string, tokenId: number): number {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT COUNT(*) AS count FROM sanctuary_chat_messages
    WHERE wallet_address = ? AND token_id = ?
  `).get(walletAddress.toLowerCase(), tokenId) as { count: number } | undefined;
  return row?.count ?? 0;
}

// ─── V2.0: Companion Chat Memories ──────────────────────────────────

export type SanctuaryChatMemoryCategory =
  | 'owner_identity'
  | 'preferences'
  | 'shared_experiences'
  | 'companion_feelings'
  | 'recurring_topics';

export const SANCTUARY_MEMORY_CATEGORIES: SanctuaryChatMemoryCategory[] = [
  'owner_identity',
  'preferences',
  'shared_experiences',
  'companion_feelings',
  'recurring_topics',
];

export interface SanctuaryChatMemory {
  id: number;
  wallet_address: string;
  token_id: number;
  category: SanctuaryChatMemoryCategory;
  fact: string;
  importance: number;
  mention_count: number;
  last_mentioned_at: string;
  source_message_id: number | null;
  created_at: string;
  updated_at: string;
}

export function upsertChatMemory(
  walletAddress: string,
  tokenId: number,
  category: SanctuaryChatMemoryCategory,
  fact: string,
  options: { importance?: number; sourceMessageId?: number | null } = {},
): SanctuaryChatMemory {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const trimmedFact = fact.trim().slice(0, 280);
  if (!trimmedFact) throw new Error('Memory fact cannot be empty');
  const importance = Math.max(1, Math.min(5, options.importance ?? 1));
  const sourceMessageId = options.sourceMessageId ?? null;

  db.prepare(`
    INSERT INTO sanctuary_chat_memories
      (wallet_address, token_id, category, fact, importance, mention_count, source_message_id)
    VALUES (?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(wallet_address, token_id, category, fact) DO UPDATE SET
      importance = MAX(importance, excluded.importance),
      mention_count = mention_count + 1,
      last_mentioned_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `).run(addr, tokenId, category, trimmedFact, importance, sourceMessageId);

  return db.prepare(`
    SELECT * FROM sanctuary_chat_memories
    WHERE wallet_address = ? AND token_id = ? AND category = ? AND fact = ?
  `).get(addr, tokenId, category, trimmedFact) as SanctuaryChatMemory;
}

export function getChatMemories(
  walletAddress: string,
  tokenId: number,
  options: { limit?: number; category?: SanctuaryChatMemoryCategory } = {},
): SanctuaryChatMemory[] {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const limit = Math.max(1, Math.min(100, options.limit ?? 50));
  if (options.category) {
    return db.prepare(`
      SELECT * FROM sanctuary_chat_memories
      WHERE wallet_address = ? AND token_id = ? AND category = ?
      ORDER BY importance DESC, mention_count DESC, last_mentioned_at DESC
      LIMIT ?
    `).all(addr, tokenId, options.category, limit) as SanctuaryChatMemory[];
  }
  return db.prepare(`
    SELECT * FROM sanctuary_chat_memories
    WHERE wallet_address = ? AND token_id = ?
    ORDER BY importance DESC, mention_count DESC, last_mentioned_at DESC
    LIMIT ?
  `).all(addr, tokenId, limit) as SanctuaryChatMemory[];
}

export function getTopChatMemories(
  walletAddress: string,
  tokenId: number,
  limit: number = 5,
): SanctuaryChatMemory[] {
  return getChatMemories(walletAddress, tokenId, { limit });
}

// ─── V2.1: Memory Consolidation (weekly batch job) ──────────────────

export interface CompanionMemoryOwner {
  wallet_address: string;
  token_id: number;
}

export function listCompanionMemoryOwners(): CompanionMemoryOwner[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT DISTINCT wallet_address, token_id
    FROM sanctuary_chat_memories
    ORDER BY wallet_address ASC, token_id ASC
  `).all() as CompanionMemoryOwner[];
}

export function getAllChatMemoriesForCompanion(
  walletAddress: string,
  tokenId: number,
): SanctuaryChatMemory[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM sanctuary_chat_memories
    WHERE wallet_address = ? AND token_id = ?
    ORDER BY id ASC
  `).all(walletAddress.toLowerCase(), tokenId) as SanctuaryChatMemory[];
}

export interface ApplyConsolidationPlan {
  merges: Array<{
    keepId: number;
    removeIds: number[];
    newImportance: number;
    newMentionCount: number;
  }>;
  decays: Array<{ id: number; newImportance: number }>;
}

export interface ApplyConsolidationResult {
  merged: number;
  decayed: number;
}

export function applyMemoryConsolidationPlan(
  plan: ApplyConsolidationPlan,
): ApplyConsolidationResult {
  const db = getDatabase();
  const updateKeeper = db.prepare(`
    UPDATE sanctuary_chat_memories
    SET importance = ?, mention_count = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const deleteOne = db.prepare(`DELETE FROM sanctuary_chat_memories WHERE id = ?`);
  const decayOne = db.prepare(`
    UPDATE sanctuary_chat_memories
    SET importance = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  let merged = 0;
  let decayed = 0;

  const txn = db.transaction(() => {
    for (const m of plan.merges) {
      if (m.removeIds.length === 0) continue;
      updateKeeper.run(m.newImportance, m.newMentionCount, m.keepId);
      for (const rid of m.removeIds) {
        deleteOne.run(rid);
        merged += 1;
      }
    }
    for (const d of plan.decays) {
      decayOne.run(d.newImportance, d.id);
      decayed += 1;
    }
  });
  txn();

  return { merged, decayed };
}

export function generateTemplateCompanionReply(
  companion: SanctuaryCompanionWithMeta,
  userMessage: string,
  history: SanctuaryChatMessage[],
): string {
  return generateCompanionResponse(companion, userMessage, history);
}

export function persistCompanionChatExchange(
  walletAddress: string,
  tokenId: number,
  userMessage: string,
  companionReplyText: string,
): { userMessage: SanctuaryChatMessage; companionReply: SanctuaryChatMessage; companion: SanctuaryCompanionWithMeta } {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const comp = getActiveCompanion(addr);
    if (!comp || comp.token_id !== tokenId) throw new Error('No active companion found');

    const userMsg = addCompanionChatMessage(addr, tokenId, 'user', userMessage);
    const companionMsg = addCompanionChatMessage(addr, tokenId, 'companion', companionReplyText);

    db.prepare(`
      UPDATE sanctuary_companions SET total_interactions = total_interactions + 1, updated_at = CURRENT_TIMESTAMP
      WHERE wallet_address = ? AND token_id = ? AND is_active = 1
    `).run(addr, tokenId);

    updateTraitProgress(addr, tokenId, 'chat');

    return { userMessage: userMsg, companionReply: companionMsg, companion: comp };
  });

  return txn();
}

export function chatWithCompanion(
  walletAddress: string, tokenId: number, message: string,
): { userMessage: SanctuaryChatMessage; companionReply: SanctuaryChatMessage; companion: SanctuaryCompanionWithMeta } {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const comp = getActiveCompanion(addr);
    if (!comp || comp.token_id !== tokenId) throw new Error('No active companion found');

    const history = getCompanionChatHistory(addr, tokenId, 10);
    const userMsg = addCompanionChatMessage(addr, tokenId, 'user', message);
    const replyText = generateCompanionResponse(comp, message, history);
    const companionMsg = addCompanionChatMessage(addr, tokenId, 'companion', replyText);

    db.prepare(`
      UPDATE sanctuary_companions SET total_interactions = total_interactions + 1, updated_at = CURRENT_TIMESTAMP
      WHERE wallet_address = ? AND token_id = ? AND is_active = 1
    `).run(addr, tokenId);

    updateTraitProgress(addr, tokenId, 'chat');

    return { userMessage: userMsg, companionReply: companionMsg, companion: comp };
  });

  return txn();
}

// ─── V1.5: Trait Evolution ──────────────────────────────────────────

export interface SanctuaryTrait {
  id: number;
  wallet_address: string;
  token_id: number;
  trait_name: string;
  trait_category: string;
  progress: number;
  unlocked: number;
  unlocked_at: string | null;
  created_at: string;
  updated_at: string;
}

const TRAIT_DEFINITIONS: { name: string; category: string; trigger: string; threshold: number; description: string }[] = [
  { name: 'Chatterbox', category: 'social', trigger: 'chat', threshold: 20, description: 'Loves a good conversation' },
  { name: 'Social Butterfly', category: 'social', trigger: 'pet', threshold: 30, description: 'Thrives on affection' },
  { name: 'Foodie', category: 'gourmet', trigger: 'feed', threshold: 25, description: 'Never misses a meal' },
  { name: 'Gourmand', category: 'gourmet', trigger: 'feed', threshold: 60, description: 'A true cosmic cuisine connoisseur' },
  { name: 'Trailblazer', category: 'explorer', trigger: 'explore', threshold: 10, description: 'Always ready for adventure' },
  { name: 'World Walker', category: 'explorer', trigger: 'explore', threshold: 30, description: 'Has visited every corner of the sanctuary' },
  { name: 'Bookworm', category: 'scholar', trigger: 'library', threshold: 5, description: 'Lost in the Cosmic Library' },
  { name: 'Dreamer', category: 'dreamer', trigger: 'dream', threshold: 8, description: 'Dreams of far-off galaxies' },
  { name: 'Hot Tubber', category: 'special', trigger: 'springs', threshold: 10, description: 'Can\'t resist the Hot Springs' },
  { name: 'Star Gazer', category: 'special', trigger: 'observatory', threshold: 8, description: 'Eyes always on the cosmos' },
  { name: 'Forge Master', category: 'special', trigger: 'forge', threshold: 5, description: 'Channels pure aura energy' },
  { name: 'Loyal Companion', category: 'social', trigger: 'bond', threshold: 50, description: 'Bond score above 50 — a true partner' },
];

const ACTIVITY_TO_TRIGGER: Record<string, string> = {
  'Hot Springs': 'springs',
  'Training Grounds': 'explore',
  'Star Garden': 'explore',
  'Cosmic Library': 'library',
  'Nebula Kitchen': 'feed',
  'Dream Hollow': 'dream',
  'Aura Forge': 'forge',
  'Observatory': 'observatory',
};

export function updateTraitProgress(walletAddress: string, tokenId: number, trigger: string): SanctuaryTrait[] {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const updated: SanctuaryTrait[] = [];

  const matchingTraits = TRAIT_DEFINITIONS.filter((t) => t.trigger === trigger);

  for (const def of matchingTraits) {
    const existing = db.prepare(
      'SELECT * FROM sanctuary_traits WHERE wallet_address = ? AND token_id = ? AND trait_name = ?'
    ).get(addr, tokenId, def.name) as SanctuaryTrait | undefined;

    if (existing) {
      if (existing.unlocked) continue;
      const newProgress = Math.min(existing.progress + 1, def.threshold);
      const nowUnlocked = newProgress >= def.threshold ? 1 : 0;
      db.prepare(`
        UPDATE sanctuary_traits SET progress = ?, unlocked = ?, unlocked_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(newProgress, nowUnlocked, nowUnlocked, existing.id);
      if (nowUnlocked) {
        addJournalEntry(addr, tokenId, 'achievement', `Unlocked trait: ${def.name} — ${def.description}`);
      }
      updated.push({ ...existing, progress: newProgress, unlocked: nowUnlocked });
    } else {
      const result = db.prepare(`
        INSERT INTO sanctuary_traits (wallet_address, token_id, trait_name, trait_category, progress, unlocked)
        VALUES (?, ?, ?, ?, 1, 0)
      `).run(addr, tokenId, def.name, def.category);
      updated.push(db.prepare('SELECT * FROM sanctuary_traits WHERE id = ?').get(result.lastInsertRowid) as SanctuaryTrait);
    }
  }

  return updated;
}

export function getCompanionTraits(walletAddress: string, tokenId: number): SanctuaryTrait[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM sanctuary_traits WHERE wallet_address = ? AND token_id = ?
    ORDER BY unlocked DESC, progress DESC
  `).all(walletAddress.toLowerCase(), tokenId) as SanctuaryTrait[];
}

export function getUnlockedTraits(walletAddress: string, tokenId: number): SanctuaryTrait[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM sanctuary_traits WHERE wallet_address = ? AND token_id = ? AND unlocked = 1
    ORDER BY unlocked_at DESC
  `).all(walletAddress.toLowerCase(), tokenId) as SanctuaryTrait[];
}

export function getTraitDefinitions(): typeof TRAIT_DEFINITIONS {
  return TRAIT_DEFINITIONS;
}

// ─── V1.5: Seasonal Quests ─────────────────────────────────────────

export interface SanctuaryQuest {
  id: number;
  season: string;
  title: string;
  description: string;
  quest_type: string;
  requirement_type: string;
  requirement_count: number;
  reward_xp: number;
  reward_bond: number;
  reward_trait: string | null;
  active: number;
  starts_at: string | null;
  ends_at: string | null;
}

export interface SanctuaryQuestProgress {
  id: number;
  wallet_address: string;
  token_id: number;
  quest_id: number;
  current_count: number;
  completed: number;
  completed_at: string | null;
  reward_claimed: number;
}

export type QuestWithProgress = SanctuaryQuest & { progress: SanctuaryQuestProgress | null };

interface QuestSeed {
  season: string;
  title: string;
  description: string;
  quest_type: string;
  requirement_type: string;
  requirement_count: number;
  reward_xp: number;
  reward_bond: number;
  reward_trait: string | null;
}

const SEASONAL_QUEST_SEEDS: QuestSeed[] = [
  { season: 'spring-2026', title: 'First Steps', description: 'Interact with your companion 5 times.', quest_type: 'seasonal', requirement_type: 'interact', requirement_count: 5, reward_xp: 25, reward_bond: 2.0, reward_trait: null },
  { season: 'spring-2026', title: 'Cosmic Cuisine', description: 'Feed your Skrumpey 10 times.', quest_type: 'seasonal', requirement_type: 'feed', requirement_count: 10, reward_xp: 50, reward_bond: 5.0, reward_trait: null },
  { season: 'spring-2026', title: 'Explorer\'s Spirit', description: 'Send your companion on 5 activities.', quest_type: 'seasonal', requirement_type: 'explore', requirement_count: 5, reward_xp: 40, reward_bond: 3.0, reward_trait: null },
  { season: 'spring-2026', title: 'Heart to Heart', description: 'Chat with your Skrumpey 15 times.', quest_type: 'seasonal', requirement_type: 'chat', requirement_count: 15, reward_xp: 60, reward_bond: 4.0, reward_trait: 'Chatterbox' },
  { season: 'spring-2026', title: 'Stargazer\'s Vigil', description: 'Visit the Observatory 3 times.', quest_type: 'seasonal', requirement_type: 'observatory', requirement_count: 3, reward_xp: 35, reward_bond: 3.5, reward_trait: null },
  { season: 'spring-2026', title: 'Warm Welcome', description: 'Relax in the Hot Springs 5 times.', quest_type: 'seasonal', requirement_type: 'springs', requirement_count: 5, reward_xp: 30, reward_bond: 2.5, reward_trait: null },
  { season: 'spring-2026', title: 'Bonded', description: 'Reach 50 bond score with your companion.', quest_type: 'seasonal', requirement_type: 'bond_threshold', requirement_count: 50, reward_xp: 100, reward_bond: 0, reward_trait: 'Loyal Companion' },
  { season: 'spring-2026', title: 'Daily Devotion', description: 'Interact with your companion 3 days in a row.', quest_type: 'weekly', requirement_type: 'daily_streak', requirement_count: 3, reward_xp: 30, reward_bond: 2.0, reward_trait: null },
];

function loadQuestSeedsFromJson(): QuestSeed[] {
  try {
    const seedPath = path.join(process.cwd(), 'data', 'sanctuary', 'quests.json');
    if (!fs.existsSync(seedPath)) return [];
    const raw = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as {
      season?: string;
      daily_quests?: Partial<QuestSeed>[];
      weekly_quests?: Partial<QuestSeed>[];
    };
    const defaultSeason = raw.season ?? 'spring-2026';
    const fromGroup = (group: Partial<QuestSeed>[] | undefined): QuestSeed[] =>
      (group ?? []).map((q) => ({
        season: q.season ?? defaultSeason,
        title: String(q.title ?? ''),
        description: String(q.description ?? ''),
        quest_type: String(q.quest_type ?? 'daily'),
        requirement_type: String(q.requirement_type ?? 'interact'),
        requirement_count: Number(q.requirement_count ?? 1),
        reward_xp: Number(q.reward_xp ?? 0),
        reward_bond: Number(q.reward_bond ?? 0),
        reward_trait: q.reward_trait ?? null,
      }));
    return [...fromGroup(raw.daily_quests), ...fromGroup(raw.weekly_quests)];
  } catch {
    return [];
  }
}

function seedSanctuaryQuests(database: Database.Database): void {
  const allSeeds: QuestSeed[] = [...SEASONAL_QUEST_SEEDS, ...loadQuestSeedsFromJson()];

  const exists = database.prepare(
    'SELECT id FROM sanctuary_quests WHERE season = ? AND title = ?'
  );
  const insert = database.prepare(`
    INSERT INTO sanctuary_quests (season, title, description, quest_type, requirement_type, requirement_count, reward_xp, reward_bond, reward_trait)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const q of allSeeds) {
    if (exists.get(q.season, q.title)) continue;
    insert.run(q.season, q.title, q.description, q.quest_type, q.requirement_type, q.requirement_count, q.reward_xp, q.reward_bond, q.reward_trait);
  }
}

export function getSanctuaryQuests(season?: string): SanctuaryQuest[] {
  const db = getDatabase();
  if (season) {
    return db.prepare('SELECT * FROM sanctuary_quests WHERE active = 1 AND season = ? ORDER BY quest_type, id').all(season) as SanctuaryQuest[];
  }
  return db.prepare('SELECT * FROM sanctuary_quests WHERE active = 1 ORDER BY quest_type, id').all() as SanctuaryQuest[];
}

export function getSanctuaryQuestsWithProgress(walletAddress: string, tokenId: number, season?: string): QuestWithProgress[] {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const quests = getSanctuaryQuests(season);

  return quests.map((quest) => {
    const progress = db.prepare(
      'SELECT * FROM sanctuary_quest_progress WHERE wallet_address = ? AND token_id = ? AND quest_id = ?'
    ).get(addr, tokenId, quest.id) as SanctuaryQuestProgress | null;
    return { ...quest, progress };
  });
}

export function incrementQuestProgress(walletAddress: string, tokenId: number, requirementType: string, amount: number = 1): void {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const quests = db.prepare(
    'SELECT * FROM sanctuary_quests WHERE active = 1 AND requirement_type = ?'
  ).all(requirementType) as SanctuaryQuest[];

  for (const quest of quests) {
    const existing = db.prepare(
      'SELECT * FROM sanctuary_quest_progress WHERE wallet_address = ? AND token_id = ? AND quest_id = ?'
    ).get(addr, tokenId, quest.id) as SanctuaryQuestProgress | undefined;

    if (existing) {
      if (existing.completed) continue;
      const newCount = Math.min(existing.current_count + amount, quest.requirement_count);
      const nowComplete = newCount >= quest.requirement_count ? 1 : 0;
      db.prepare(`
        UPDATE sanctuary_quest_progress
        SET current_count = ?, completed = ?, completed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newCount, nowComplete, nowComplete, existing.id);
    } else {
      const nowComplete = amount >= quest.requirement_count ? 1 : 0;
      db.prepare(`
        INSERT INTO sanctuary_quest_progress (wallet_address, token_id, quest_id, current_count, completed, completed_at)
        VALUES (?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END)
      `).run(addr, tokenId, quest.id, Math.min(amount, quest.requirement_count), nowComplete, nowComplete);
    }
  }
}

export function claimSanctuaryQuestReward(
  walletAddress: string, tokenId: number, questId: number,
): { quest: SanctuaryQuest; xpGained: number; bondGained: number; traitUnlocked: string | null } {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const quest = db.prepare('SELECT * FROM sanctuary_quests WHERE id = ?').get(questId) as SanctuaryQuest | undefined;
    if (!quest) throw new Error('Quest not found');

    const progress = db.prepare(
      'SELECT * FROM sanctuary_quest_progress WHERE wallet_address = ? AND token_id = ? AND quest_id = ?'
    ).get(addr, tokenId, questId) as SanctuaryQuestProgress | undefined;

    if (!progress || !progress.completed) throw new Error('Quest not completed');
    if (progress.reward_claimed) throw new Error('Reward already claimed');

    db.prepare('UPDATE sanctuary_quest_progress SET reward_claimed = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(progress.id);

    if (quest.reward_xp > 0) addUserXP(addr, quest.reward_xp);
    if (quest.reward_bond > 0) {
      db.prepare('UPDATE sanctuary_companions SET bond_score = MIN(bond_score + ?, 100.0), updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ? AND token_id = ?')
        .run(quest.reward_bond, addr, tokenId);
    }

    addJournalEntry(addr, tokenId, 'quest', `Completed quest: ${quest.title}! +${quest.reward_xp} XP, +${quest.reward_bond.toFixed(1)} Bond`,
      JSON.stringify({ quest_id: questId, xp: quest.reward_xp, bond: quest.reward_bond, trait: quest.reward_trait }));

    return { quest, xpGained: quest.reward_xp, bondGained: quest.reward_bond, traitUnlocked: quest.reward_trait };
  });

  return txn();
}

// Hook trait + quest updates into existing interactions
export function interactWithCompanionV15(
  walletAddress: string, tokenId: number, action: CompanionStatAction,
  options?: { isStar?: boolean }
): CompanionInteractionResult {
  const result = interactWithCompanion(walletAddress, tokenId, action, options);
  const addr = walletAddress.toLowerCase();
  updateTraitProgress(addr, tokenId, action);
  incrementQuestProgress(addr, tokenId, 'interact');
  if (action === 'feed') incrementQuestProgress(addr, tokenId, 'feed');
  return result;
}

// ---------------------------------------------------------------------------
// Shared per-wallet resource economy (V2.8) — see
// docs/SANCTUARY_ECONOMY_REDESIGN.md. Quick actions fill a shared pool gated by
// a per-action 24h limit + cooldown; quests/games spend it. Bond/XP still land
// on the active companion (Track 0), but resources are wallet-wide.
// ---------------------------------------------------------------------------

const QUICK_ACTIONS: CompanionStatAction[] = ['feed', 'pet', 'talk', 'play', 'sleep'];

export interface ActionGateState {
  usesLeft: number;
  dailyLimit: number;
  cooldownMs: number;
}
export interface WalletResourceState {
  resources: ResourceSnapshot;
  actions: Record<string, ActionGateState>;
}
export interface QuickActionResult extends WalletResourceState {
  bondGain: number;
  preference: PreferenceLevel;
  needBoosted: boolean;
  variableTier: VariableRewardTier;
  bonusStar: number;
}

function loadWalletResources(
  db: ReturnType<typeof getDatabase>, addr: string, now: Date,
): ResourceSnapshot {
  const row = db.prepare(
    'SELECT hunger, happiness, energy, updated_at FROM sanctuary_wallet_resources WHERE wallet_address = ?',
  ).get(addr) as { hunger: number; happiness: number; energy: number; updated_at: string } | undefined;
  if (!row) return { hunger: RESOURCE_MAX, happiness: RESOURCE_MAX, energy: RESOURCE_MAX };
  return decayResources(
    { hunger: row.hunger, happiness: row.happiness, energy: row.energy },
    row.updated_at, now,
  );
}

function loadActionUsage(
  db: ReturnType<typeof getDatabase>, addr: string, action: string,
): WalletActionUsage | null {
  const row = db.prepare(
    'SELECT used_count, window_start, last_used_at FROM sanctuary_action_usage WHERE wallet_address = ? AND action = ?',
  ).get(addr, action) as { used_count: number; window_start: string; last_used_at: string | null } | undefined;
  return row
    ? { used_count: row.used_count, window_start: row.window_start, last_used_at: row.last_used_at }
    : null;
}

function buildActionGates(
  db: ReturnType<typeof getDatabase>, addr: string, now: Date,
): Record<string, ActionGateState> {
  const out: Record<string, ActionGateState> = {};
  for (const a of QUICK_ACTIONS) {
    const u = loadActionUsage(db, addr, a);
    out[a] = {
      usesLeft: usesRemaining(u, a, now),
      dailyLimit: ACTION_DAILY_LIMIT[a],
      cooldownMs: cooldownRemainingMs(u, a, now),
    };
  }
  return out;
}

/** Read the shared resource pool (decayed to now) + per-action gates for the UI. */
export function getWalletResources(walletAddress: string): WalletResourceState {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const now = new Date();
  return { resources: loadWalletResources(db, addr, now), actions: buildActionGates(db, addr, now) };
}

/**
 * Perform a quick action: enforce its per-action cooldown + 24h limit, fill the
 * shared resource pool, and deepen the active companion's bond (preference ×
 * need-state, with a chance of bonus STAR). Throws on a gated action.
 */
export function applyQuickAction(
  walletAddress: string, tokenId: number, action: CompanionStatAction,
  options?: { isStar?: boolean },
): QuickActionResult {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const now = new Date();

  const txn = db.transaction(() => {
    const usage = loadActionUsage(db, addr, action);
    const gate = gateAction(usage, action, now);
    if (!gate.ok) {
      throw new Error(
        gate.reason === 'daily_limit'
          ? 'Daily limit reached for this action — come back tomorrow!'
          : 'That action is on cooldown.',
      );
    }

    // Need-boost is measured against the shared pool now (filling a low
    // resource is the "right when they needed it" moment).
    const decayed = loadWalletResources(db, addr, now);
    const needBoosted = isNeedTargeted(action, decayed);
    const next = replenish(decayed, action);
    db.prepare(`
      INSERT INTO sanctuary_wallet_resources (wallet_address, hunger, happiness, energy, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(wallet_address) DO UPDATE SET
        hunger = excluded.hunger, happiness = excluded.happiness,
        energy = excluded.energy, updated_at = excluded.updated_at
    `).run(addr, next.hunger, next.happiness, next.energy, toSqlDate(now));

    const adv = advanceUsage(usage, now);
    db.prepare(`
      INSERT INTO sanctuary_action_usage (wallet_address, action, used_count, window_start, last_used_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(wallet_address, action) DO UPDATE SET
        used_count = excluded.used_count, window_start = excluded.window_start,
        last_used_at = excluded.last_used_at
    `).run(addr, action, adv.used_count, adv.window_start, adv.last_used_at);

    // Bond/XP/variable-STAR on the active companion (Track 0 mechanics).
    const starBonus = options?.isStar ?? false;
    const preference = preferenceFor(tokenId, action);
    const variable = rollVariableReward({ action, floorBond: 0 });
    let bonusStar = variable.bonusStar;
    if (variable.tier === 'rare_trinket') bonusStar = STAR_EARN_RATES.interaction.max;

    let bondGain = 0;
    const comp = db.prepare(
      'SELECT id FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ? AND is_active = 1',
    ).get(addr, tokenId) as { id: number } | undefined;
    if (comp) {
      const baseBond = INTERACTION_BOND[action] * (starBonus ? STAR_HOLDER_BOND_MULTIPLIER : 1);
      bondGain = computeBondDelta({ baseline: baseBond, preference, needBoosted });
      const xpGain = Math.round(INTERACTION_XP[action] * (starBonus ? STAR_HOLDER_XP_MULTIPLIER : 1));
      db.prepare(`
        UPDATE sanctuary_companions
        SET bond_score = MAX(MIN(bond_score + ?, 100.0), 0.0),
            total_interactions = total_interactions + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(bondGain, comp.id);
      if (xpGain > 0) addUserXP(addr, xpGain);
      addJournalEntry(
        addr, tokenId, 'interaction',
        journalLineForAction(action, action, now.getHours()),
        JSON.stringify({ action, bond: bondGain, preference, needBoosted, bonusStar, resource: ACTION_RESOURCE[action] }),
      );
    }
    if (bonusStar > 0) earnStar(addr, 'interaction', bonusStar, `token:${tokenId}:${variable.tier}`);

    return {
      resources: next,
      actions: buildActionGates(db, addr, now),
      bondGain, preference, needBoosted, variableTier: variable.tier, bonusStar,
    };
  });

  return txn();
}

/**
 * Spend resources from the shared pool (decay-aware). Throws INSUFFICIENT_RESOURCES
 * if any resource can't cover its cost. Used by minigame entry and any other
 * sink that consumes the pool outside the quest engine. [SWO_V2_SANCTUARY_ECONOMY_REDESIGN]
 */
export function spendWalletResources(
  walletAddress: string, cost: Partial<ResourceSnapshot>,
): ResourceSnapshot {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const now = new Date();
  const want = { hunger: cost.hunger ?? 0, happiness: cost.happiness ?? 0, energy: cost.energy ?? 0 };

  const txn = db.transaction(() => {
    const pool = loadWalletResources(db, addr, now);
    const short = (['hunger', 'happiness', 'energy'] as const).filter((k) => pool[k] < want[k]);
    if (short.length > 0) {
      const e = new Error(`INSUFFICIENT_RESOURCES:${short.join(',')}`);
      (e as { code?: string }).code = 'INSUFFICIENT_RESOURCES';
      throw e;
    }
    const next = {
      hunger: Math.max(0, pool.hunger - want.hunger),
      happiness: Math.max(0, pool.happiness - want.happiness),
      energy: Math.max(0, pool.energy - want.energy),
    };
    db.prepare(`
      INSERT INTO sanctuary_wallet_resources (wallet_address, hunger, happiness, energy, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(wallet_address) DO UPDATE SET
        hunger = excluded.hunger, happiness = excluded.happiness,
        energy = excluded.energy, updated_at = excluded.updated_at
    `).run(addr, next.hunger, next.happiness, next.energy, toSqlDate(now));
    return next;
  });
  return txn();
}

/** Resource cost to enter a minigame — games tire the companion (the spend sink). */
export const MINIGAME_ENTRY_COST: Readonly<Partial<ResourceSnapshot>> = Object.freeze({ energy: 12, happiness: 4 });

export function completeActivityV15(
  walletAddress: string, tokenId: number,
  options?: { isStar?: boolean }
): CompleteActivityResult | null {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const comp = db.prepare(
    'SELECT * FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ? AND is_active = 1'
  ).get(addr, tokenId) as SanctuaryCompanion | undefined;

  const activityName = comp?.current_activity?.startsWith('exploring:')
    ? comp.current_activity.slice('exploring:'.length)
    : null;
  const wasTraining = comp?.current_activity?.startsWith('training:') ?? false;

  const result = completeActivity(walletAddress, tokenId, options);
  if (!result) return null;

  if (activityName) {
    const trigger = ACTIVITY_TO_TRIGGER[activityName];
    if (trigger) {
      updateTraitProgress(addr, tokenId, trigger);
      incrementQuestProgress(addr, tokenId, trigger);
    }
    incrementQuestProgress(addr, tokenId, 'explore');
  } else if (wasTraining) {
    // Training finishing still counts as a Training Grounds exploration quest trigger
    const trigger = ACTIVITY_TO_TRIGGER['Training Grounds'];
    if (trigger) {
      updateTraitProgress(addr, tokenId, trigger);
      incrementQuestProgress(addr, tokenId, trigger);
    }
    incrementQuestProgress(addr, tokenId, 'train');
  }

  return result;
}

// ---------------------------------------------------------------------------
// STAR currency (V2.1) — see docs/STAR_SANCTUARY_PLAN.md
// ---------------------------------------------------------------------------

export interface SanctuaryStarBalance {
  wallet_address: string;
  balance: number;
  lifetime_earned: number;
  updated_at: string;
}

export interface SanctuaryStarLedgerEntry {
  id: number;
  wallet_address: string;
  delta: number;
  kind: 'earn' | 'spend';
  source: string;
  balance_after: number;
  created_at: string;
}

export type StarEarnSource =
  | 'quest'
  | 'quest_earn'
  | 'quest_wager'
  | 'minigame_wager'
  | 'minigame_first'
  | 'daily_login'
  | 'activity'
  | 'levelup'
  | 'dream'
  | 'interaction';

// Earn-rate guardrails. Earn endpoint clamps the requested amount into the
// `[min, max]` band for its source so a single misbehaving caller cannot
// accidentally mint a million STAR. See task spec [SWO_V2_STAR_CURRENCY].
export const STAR_EARN_RATES: Record<StarEarnSource, { min: number; max: number }> = {
  quest: { min: 10, max: 50 },
  // [SWO_V2_SANCTUARY_QUESTS_V2] earn quests scale STAR with duration (the income
  // floor); wager wins pay stake × multiplier. Wide bands — the questsV2 engine
  // is the real guardrail (earn payout fixed per quest; wager EV capped < 1).
  quest_earn: { min: 1, max: 300 },
  quest_wager: { min: 1, max: 20000 },
  // Skill-wager minigames: payout = stake × score/par, capped. Wide band; the
  // resolver + the resource entry cost are the real guardrails.
  minigame_wager: { min: 1, max: 1000 },
  minigame_first: { min: 25, max: 25 },
  daily_login: { min: 5, max: 5 },
  activity: { min: 5, max: 20 },
  levelup: { min: 50, max: 50 },
  // [SWO_V2_SANCTUARY_SLEEP_DYNAMICS] — non-zero floor for the dream reward.
  // Baseline 1 STAR; Star-holder boost may request up to 3.
  dream: { min: 1, max: 3 },
  // [SWO_V2_SANCTUARY_VARIABLE_REWARDS] — ambient bonus STAR drops on routine
  // interactions (Neko-Atsume "gold fish" pattern). 1–3 STAR per bonus roll.
  interaction: { min: 1, max: 3 },
};

export function getStarBalance(walletAddress: string): SanctuaryStarBalance {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const row = db.prepare(
    'SELECT * FROM sanctuary_star_balance WHERE wallet_address = ?'
  ).get(addr) as SanctuaryStarBalance | undefined;
  if (row) return row;
  return {
    wallet_address: addr,
    balance: 0,
    lifetime_earned: 0,
    updated_at: new Date().toISOString(),
  };
}

export function earnStar(
  walletAddress: string,
  source: StarEarnSource,
  amount: number,
  detail?: string,
): { balance: number; lifetime_earned: number; gained: number } {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('STAR earn amount must be positive');
  }
  const rates = STAR_EARN_RATES[source];
  if (!rates) throw new Error(`Unknown STAR earn source: ${source}`);
  const clamped = Math.max(rates.min, Math.min(rates.max, Math.floor(amount)));

  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const sourceTag = detail ? `${source}:${detail}` : source;

  const txn = db.transaction(() => {
    const existing = db.prepare(
      'SELECT balance, lifetime_earned FROM sanctuary_star_balance WHERE wallet_address = ?'
    ).get(addr) as { balance: number; lifetime_earned: number } | undefined;

    const newBalance = (existing?.balance ?? 0) + clamped;
    const newLifetime = (existing?.lifetime_earned ?? 0) + clamped;

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
    ).run(addr, clamped, 'earn', sourceTag, newBalance);

    // Auto-mint mirror on-chain (no claim button) — enqueued in the same txn so
    // it's atomic with the ledger credit. A cron worker drains the queue.
    enqueueStarOnchain(db, addr, 'mint', clamped, sourceTag);

    return { balance: newBalance, lifetime_earned: newLifetime, gained: clamped };
  });

  return txn();
}

export function spendStar(
  walletAddress: string,
  amount: number,
  source: string,
): { balance: number; lifetime_earned: number; spent: number } {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('STAR spend amount must be positive');
  }
  const cost = Math.floor(amount);

  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const existing = db.prepare(
      'SELECT balance, lifetime_earned FROM sanctuary_star_balance WHERE wallet_address = ?'
    ).get(addr) as { balance: number; lifetime_earned: number } | undefined;

    const currentBalance = existing?.balance ?? 0;
    if (currentBalance < cost) {
      throw new Error('Insufficient STAR balance');
    }
    const newBalance = currentBalance - cost;
    const lifetime = existing?.lifetime_earned ?? 0;

    db.prepare(
      'UPDATE sanctuary_star_balance SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?'
    ).run(newBalance, addr);

    db.prepare(
      'INSERT INTO sanctuary_star_ledger (wallet_address, delta, kind, source, balance_after) VALUES (?, ?, ?, ?, ?)'
    ).run(addr, -cost, 'spend', source, newBalance);

    // Auto-burn mirror on-chain (atomic with the ledger debit).
    enqueueStarOnchain(db, addr, 'burn', cost, source);

    return { balance: newBalance, lifetime_earned: lifetime, spent: cost };
  });

  return txn();
}

// --- On-chain STAR mirror (auto mint/burn) — [SWO_V2_SANCTUARY_STAR_ONCHAIN] ---

export function isStarOnchainEnabled(): boolean {
  return process.env.STAR_ONCHAIN_ENABLED === 'true' || process.env.STAR_ONCHAIN_ENABLED === '1';
}

export interface StarOnchainOp {
  id: number;
  wallet_address: string;
  op: 'mint' | 'burn';
  amount: number;
  status: 'pending' | 'sent' | 'confirmed' | 'failed';
  tx_hash: string | null;
  attempts: number;
  last_error: string | null;
  reason: string | null;
}

/** Enqueue an on-chain mint/burn (call INSIDE the earn/spend txn). No-op unless enabled. */
function enqueueStarOnchain(
  db: ReturnType<typeof getDatabase>, walletAddress: string,
  op: 'mint' | 'burn', amount: number, reason: string,
): void {
  if (!isStarOnchainEnabled()) return;
  if (!Number.isFinite(amount) || amount <= 0) return;
  db.prepare(`
    INSERT INTO sanctuary_star_onchain_queue (wallet_address, op, amount, reason)
    VALUES (?, ?, ?, ?)
  `).run(walletAddress.toLowerCase(), op, Math.floor(amount), reason.slice(0, 120));
}

/** Pending on-chain ops, FIFO — the worker drains these. */
export function getPendingStarOnchainOps(limit = 25): StarOnchainOp[] {
  const db = getDatabase();
  return db.prepare(
    "SELECT * FROM sanctuary_star_onchain_queue WHERE status = 'pending' ORDER BY id ASC LIMIT ?"
  ).all(Math.max(1, Math.min(200, limit))) as StarOnchainOp[];
}

export function markStarOnchainSent(id: number, txHash: string): void {
  getDatabase().prepare(
    "UPDATE sanctuary_star_onchain_queue SET status = 'sent', tx_hash = ?, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(txHash, id);
}

export function markStarOnchainConfirmed(id: number, txHash: string): void {
  getDatabase().prepare(
    "UPDATE sanctuary_star_onchain_queue SET status = 'confirmed', tx_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(txHash, id);
}

export function markStarOnchainFailed(id: number, err: string): void {
  getDatabase().prepare(
    "UPDATE sanctuary_star_onchain_queue SET status = 'failed', last_error = ?, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(err.slice(0, 240), id);
}

export interface StarOnchainQueueStats { pending: number; sent: number; confirmed: number; failed: number; }
export function getStarOnchainQueueStats(): StarOnchainQueueStats {
  const db = getDatabase();
  const rows = db.prepare(
    'SELECT status, COUNT(*) as n FROM sanctuary_star_onchain_queue GROUP BY status'
  ).all() as { status: string; n: number }[];
  const out: StarOnchainQueueStats = { pending: 0, sent: 0, confirmed: 0, failed: 0 };
  for (const r of rows) (out as unknown as Record<string, number>)[r.status] = r.n;
  return out;
}

// Reconciliation model: rather than replaying each mint/burn (fragile — a burn
// strands if the on-chain balance is behind), the worker converges each wallet's
// ON-CHAIN balance to its OFF-CHAIN ledger balance by minting/burning only the
// net delta. Queue rows are just "this wallet is dirty" markers. Self-healing.

/** Distinct wallets with un-synced (pending OR failed) on-chain ops. */
export function getDirtyOnchainWallets(limit = 25): string[] {
  const db = getDatabase();
  const rows = db.prepare(
    "SELECT DISTINCT wallet_address FROM sanctuary_star_onchain_queue WHERE status IN ('pending','failed') ORDER BY wallet_address LIMIT ?"
  ).all(Math.max(1, Math.min(200, limit))) as { wallet_address: string }[];
  return rows.map((r) => r.wallet_address);
}

/** Mark all of a wallet's un-synced ops confirmed after a successful reconcile. */
export function markWalletOnchainSynced(wallet: string, txHash: string | null): void {
  getDatabase().prepare(
    "UPDATE sanctuary_star_onchain_queue SET status = 'confirmed', tx_hash = COALESCE(?, tx_hash), updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ? AND status IN ('pending','failed')"
  ).run(txHash, wallet.toLowerCase());
}

/** Mark a wallet's pending ops failed (leaves them eligible for the next reconcile). */
export function markWalletOnchainReconcileFailed(wallet: string, err: string): void {
  getDatabase().prepare(
    "UPDATE sanctuary_star_onchain_queue SET status = 'failed', last_error = ?, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ? AND status = 'pending'"
  ).run(err.slice(0, 240), wallet.toLowerCase());
}

export function getStarLedger(
  walletAddress: string,
  limit: number = 50,
): SanctuaryStarLedgerEntry[] {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  return db.prepare(
    'SELECT * FROM sanctuary_star_ledger WHERE wallet_address = ? ORDER BY created_at DESC, id DESC LIMIT ?'
  ).all(addr, Math.max(1, Math.min(500, Math.floor(limit)))) as SanctuaryStarLedgerEntry[];
}

// ---------------------------------------------------------------------------
// Functional charms + Quests v2 (V2.9) — see docs/SANCTUARY_ECONOMY_REDESIGN.md
// and lib/sanctuary/questsV2.ts (the pure engine). Charms are STAR-bought items
// that feed back into the win/lose loop (luck on wagers, resource discounts,
// STAR boosts). Quests are STAR-only and wall-clock-timed.
// ---------------------------------------------------------------------------

export interface SanctuaryCharmItem {
  id: number;
  item_key: string;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  star_cost: number;
  effect_type: CharmEffectType; // 'gambit' (wager) | 'prospect' (earn)
  upside: number; // fraction added to the reward side
  downside: number; // fraction added to the cost side
  charges: number;
  description: string;
  asset_key: string;
}

// Trade-off charms: bigger upside paired with a real downside. Bought in the
// Shop, applied at quest start, consumed by the charge. The engine clamps a
// charmed wager's EV to CHARM_EV_CAP so charms add spice + swing, never a
// printing press — and the charm itself is a STAR sink to buy.
const CHARM_SEED: Omit<SanctuaryCharmItem, 'id'>[] = [
  {
    item_key: 'charm-gambit', name: "Gambler's Token", rarity: 'uncommon', star_cost: 40,
    effect_type: 'gambit', upside: 0.35, downside: 0.25, charges: 3,
    description: 'Wager: +35% payout multiplier, but the stake costs 25% more (3 charges).',
    asset_key: 'charm/gambit',
  },
  {
    item_key: 'charm-highroller', name: 'High Roller Die', rarity: 'rare', star_cost: 90,
    effect_type: 'gambit', upside: 0.6, downside: 0.45, charges: 1,
    description: 'Wager: +60% payout multiplier, but the stake costs 45% more (1 charge).',
    asset_key: 'charm/highroller',
  },
  {
    item_key: 'charm-prospect', name: "Prospector's Map", rarity: 'uncommon', star_cost: 35,
    effect_type: 'prospect', upside: 0.5, downside: 0.5, charges: 3,
    description: 'Earn quest: +50% STAR, but it costs 50% more resources (3 charges).',
    asset_key: 'charm/prospect',
  },
  {
    item_key: 'charm-motherlode', name: 'Motherlode Charm', rarity: 'legendary', star_cost: 110,
    effect_type: 'prospect', upside: 1.0, downside: 0.9, charges: 1,
    description: 'Earn quest: double the STAR, but nearly double the resource cost (1 charge).',
    asset_key: 'charm/motherlode',
  },
];

function seedSanctuaryCharmItems(database: Database.Database): void {
  const insert = database.prepare(`
    INSERT INTO sanctuary_charm_items
      (item_key, name, rarity, star_cost, effect_type, upside, downside, charges, description, asset_key)
    VALUES (@item_key, @name, @rarity, @star_cost, @effect_type, @upside, @downside, @charges, @description, @asset_key)
    ON CONFLICT(item_key) DO UPDATE SET
      name = excluded.name, rarity = excluded.rarity, star_cost = excluded.star_cost,
      effect_type = excluded.effect_type, upside = excluded.upside, downside = excluded.downside,
      charges = excluded.charges, description = excluded.description, asset_key = excluded.asset_key
  `);
  const txn = database.transaction(() => {
    for (const c of CHARM_SEED) insert.run(c);
  });
  txn();
}

export function listCharmItems(): SanctuaryCharmItem[] {
  const db = getDatabase();
  return db.prepare(
    'SELECT * FROM sanctuary_charm_items ORDER BY star_cost ASC, id ASC'
  ).all() as SanctuaryCharmItem[];
}

function getCharmItem(db: ReturnType<typeof getDatabase>, itemKey: string): SanctuaryCharmItem | undefined {
  return db.prepare('SELECT * FROM sanctuary_charm_items WHERE item_key = ?')
    .get(itemKey) as SanctuaryCharmItem | undefined;
}

/** A wallet's remaining charm charges, keyed by item_key (only positive counts). */
export function getCharmStock(walletAddress: string): Record<string, number> {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const rows = db.prepare(
    'SELECT item_key, charges FROM sanctuary_charm_stock WHERE wallet_address = ? AND charges > 0'
  ).all(addr) as { item_key: string; charges: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.item_key] = r.charges;
  return out;
}

/** Buy a charm: spend STAR, add its charges to the wallet's stock. */
export function buyCharm(
  walletAddress: string, itemKey: string,
): { balance: number; charges: number; item: SanctuaryCharmItem } {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const item = getCharmItem(db, itemKey);
  if (!item) { const e = new Error('CHARM_NOT_FOUND'); (e as { code?: string }).code = 'CHARM_NOT_FOUND'; throw e; }

  const txn = db.transaction(() => {
    const spend = spendStar(addr, item.star_cost, `charm:${itemKey}`);
    const row = db.prepare(
      'SELECT charges FROM sanctuary_charm_stock WHERE wallet_address = ? AND item_key = ?'
    ).get(addr, itemKey) as { charges: number } | undefined;
    const nextCharges = (row?.charges ?? 0) + item.charges;
    db.prepare(`
      INSERT INTO sanctuary_charm_stock (wallet_address, item_key, charges, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(wallet_address, item_key) DO UPDATE SET
        charges = excluded.charges, updated_at = CURRENT_TIMESTAMP
    `).run(addr, itemKey, nextCharges);
    return { balance: spend.balance, charges: nextCharges };
  });
  const res = txn();
  return { ...res, item };
}

/** Build a CharmEffect from the catalog + verify the wallet has a charge (no consume). */
function resolveCharm(
  db: ReturnType<typeof getDatabase>, addr: string, itemKey: string | null | undefined,
): CharmEffect | null {
  if (!itemKey) return null;
  const item = getCharmItem(db, itemKey);
  if (!item) return null;
  const stock = db.prepare(
    'SELECT charges FROM sanctuary_charm_stock WHERE wallet_address = ? AND item_key = ?'
  ).get(addr, itemKey) as { charges: number } | undefined;
  if (!stock || stock.charges <= 0) return null;
  return { itemKey, type: item.effect_type, upside: item.upside, downside: item.downside };
}

/** Consume one charge of a charm (call inside the start transaction). */
function consumeCharmCharge(db: ReturnType<typeof getDatabase>, addr: string, itemKey: string): void {
  db.prepare(
    'UPDATE sanctuary_charm_stock SET charges = MAX(charges - 1, 0), updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ? AND item_key = ?'
  ).run(addr, itemKey);
}

// --- Quests v2 ---------------------------------------------------------------

export interface QuestRunRow {
  id: number;
  wallet_address: string;
  token_id: number;
  quest_key: string;
  kind: 'earn' | 'wager';
  tier: string | null;
  star_wager: number;
  win_chance: number;
  payout_mult: number;
  star_reward: number;
  charm_key: string | null;
  roll: number | null;
  started_at: string;
  ends_at: string;
  status: 'active' | 'claimed';
  outcome: 'win' | 'lose' | 'earn' | null;
  star_settled: number | null;
  claimed_at: string | null;
}

export interface ActiveQuestRunView {
  id: number;
  quest_key: string;
  title: string;
  kind: 'earn' | 'wager';
  tier: string | null;
  star_wager: number;
  win_chance: number;
  payout_mult: number;
  star_reward: number;
  ends_at: string;
  ready: boolean; // now >= ends_at
}

export interface QuestsV2View {
  quests: typeof QUEST_CATALOG;
  active: ActiveQuestRunView[];
  resources: ResourceSnapshot;
  charms: Record<string, number>;
  charmCatalog: SanctuaryCharmItem[];
  starBalance: number;
}

function activeQuestRuns(db: ReturnType<typeof getDatabase>, addr: string, tokenId: number): QuestRunRow[] {
  return db.prepare(
    "SELECT * FROM sanctuary_quest_runs WHERE wallet_address = ? AND token_id = ? AND status = 'active' ORDER BY started_at ASC"
  ).all(addr, tokenId) as QuestRunRow[];
}

/** Everything the Quests v2 panel needs in one read. */
export function getSanctuaryQuestsV2(walletAddress: string, tokenId: number): QuestsV2View {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const now = new Date();
  const runs = activeQuestRuns(db, addr, tokenId);
  const active: ActiveQuestRunView[] = runs.map((r) => {
    // ends_at is stored as a tz-naive UTC string; parse it AS UTC and hand the
    // client a real ISO timestamp so countdowns are correct in any timezone.
    const endsMs = parseSqlDateMs(r.ends_at) ?? Date.now();
    return {
      id: r.id,
      quest_key: r.quest_key,
      title: getQuestDef(r.quest_key)?.title ?? r.quest_key,
      kind: r.kind,
      tier: r.tier,
      star_wager: r.star_wager,
      win_chance: r.win_chance,
      payout_mult: r.payout_mult,
      star_reward: r.star_reward,
      ends_at: new Date(endsMs).toISOString(),
      ready: now.getTime() >= endsMs,
    };
  });
  return {
    quests: QUEST_CATALOG,
    active,
    resources: loadWalletResources(db, addr, now),
    charms: getCharmStock(addr),
    charmCatalog: listCharmItems(),
    starBalance: getStarBalance(addr).balance,
  };
}

export interface StartQuestOptions {
  tier?: string;
  stake?: number;
  charmKey?: string | null;
}

/**
 * Start a quest run: gate on resources, pay the (charm-discounted) resource cost,
 * stake STAR for wagers, freeze the roll, and consume one charm charge. The
 * outcome is sealed at start (roll frozen) but only revealed/credited on claim
 * after the duration elapses.
 */
export function startSanctuaryQuestV2(
  walletAddress: string, tokenId: number, questKey: string, opts: StartQuestOptions = {},
): { run: ActiveQuestRunView; resources: ResourceSnapshot } {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const now = new Date();
  const def = getQuestDef(questKey);
  if (!def) { const e = new Error('QUEST_NOT_FOUND'); (e as { code?: string }).code = 'QUEST_NOT_FOUND'; throw e; }

  const txn = db.transaction(() => {
    // One active run per quest per companion keeps the loop legible.
    const dupe = db.prepare(
      "SELECT id FROM sanctuary_quest_runs WHERE wallet_address = ? AND token_id = ? AND quest_key = ? AND status = 'active'"
    ).get(addr, tokenId, questKey);
    if (dupe) { const e = new Error('QUEST_ALREADY_ACTIVE'); (e as { code?: string }).code = 'QUEST_ALREADY_ACTIVE'; throw e; }

    const charm = resolveCharm(db, addr, opts.charmKey);
    const pool = loadWalletResources(db, addr, now);
    const gate = gateQuestStart(def, pool, charm);
    if (!gate.ok) {
      const e = new Error(`INSUFFICIENT_RESOURCES:${gate.failing.join(',')}`);
      (e as { code?: string }).code = 'INSUFFICIENT_RESOURCES';
      throw e;
    }

    // Pay resource cost (a prospect charm raises it).
    const cost = questResourceCost(def, charm);
    const nextPool = payCost(pool, def, charm);
    db.prepare(`
      INSERT INTO sanctuary_wallet_resources (wallet_address, hunger, happiness, energy, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(wallet_address) DO UPDATE SET
        hunger = excluded.hunger, happiness = excluded.happiness,
        energy = excluded.energy, updated_at = excluded.updated_at
    `).run(addr, nextPool.hunger, nextPool.happiness, nextPool.energy, toSqlDate(now));

    let starWager = 0;
    let winChance = 0;
    let payoutMult = 0;
    let starReward = 0;
    let roll: number | null = null;
    let tierLabel: string | null = null;

    if (def.kind === 'wager') {
      const tier = getWagerTier(def, opts.tier ?? '');
      if (!tier) { const e = new Error('TIER_REQUIRED'); (e as { code?: string }).code = 'TIER_REQUIRED'; throw e; }
      const baseStake = opts.stake ?? 0;
      if (!isValidStake(def, baseStake)) {
        const e = new Error('BAD_STAKE'); (e as { code?: string }).code = 'BAD_STAKE'; throw e;
      }
      // Effective terms after a gambit charm: bigger payout, bigger stake cost,
      // EV clamped by the engine. Stake the EFFECTIVE amount up front.
      const w = effectiveWager(tier, baseStake, charm);
      starWager = w.stake;
      winChance = w.winChance;
      payoutMult = w.payoutMult;
      spendStar(addr, starWager, `quest_wager_stake:${questKey}:${tier.label}`);
      roll = Math.random(); // the single RNG, frozen now
      tierLabel = tier.label;
    } else {
      starReward = earnPayout(def, charm);
    }

    if (charm) consumeCharmCharge(db, addr, charm.itemKey);

    const endsAt = new Date(now.getTime() + def.durationSeconds * 1000);
    const info = db.prepare(`
      INSERT INTO sanctuary_quest_runs
        (wallet_address, token_id, quest_key, kind, tier, cost_hunger, cost_happiness, cost_energy,
         star_wager, win_chance, payout_mult, star_reward, charm_key, roll, started_at, ends_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      addr, tokenId, questKey, def.kind, tierLabel, cost.hunger, cost.happiness, cost.energy,
      starWager, winChance, payoutMult, starReward, charm?.itemKey ?? null, roll,
      toSqlDate(now), toSqlDate(endsAt),
    );

    const run: ActiveQuestRunView = {
      id: Number(info.lastInsertRowid), quest_key: questKey, title: def.title, kind: def.kind,
      tier: tierLabel, star_wager: starWager, win_chance: winChance, payout_mult: payoutMult,
      star_reward: starReward, ends_at: endsAt.toISOString(), ready: false,
    };
    return { run, resources: nextPool };
  });
  return txn();
}

export interface QuestClaimResult {
  outcome: 'win' | 'lose' | 'earn';
  starDelta: number; // STAR credited on claim (0 on a wager loss)
  balance: number;
  quest_key: string;
  title: string;
  win_chance: number;
  payout_mult: number;
  star_wager: number;
}

/** Claim a finished run: reveal the sealed wager outcome / pay the earn reward. */
export function claimSanctuaryQuestV2(
  walletAddress: string, tokenId: number, runId: number,
): QuestClaimResult {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const now = new Date();

  const txn = db.transaction(() => {
    const run = db.prepare(
      'SELECT * FROM sanctuary_quest_runs WHERE id = ? AND wallet_address = ? AND token_id = ?'
    ).get(runId, addr, tokenId) as QuestRunRow | undefined;
    if (!run) { const e = new Error('RUN_NOT_FOUND'); (e as { code?: string }).code = 'RUN_NOT_FOUND'; throw e; }
    if (run.status !== 'active') { const e = new Error('ALREADY_CLAIMED'); (e as { code?: string }).code = 'ALREADY_CLAIMED'; throw e; }
    // ends_at is a tz-naive UTC string — parse it AS UTC (parseSqlDateMs), else a
    // CEST server reads it ~2h early and every quest is instantly claimable.
    const endsMs = parseSqlDateMs(run.ends_at) ?? 0;
    if (now.getTime() < endsMs) {
      const e = new Error('NOT_READY'); (e as { code?: string }).code = 'NOT_READY'; throw e;
    }
    const def = getQuestDef(run.quest_key);
    const title = def?.title ?? run.quest_key;

    let outcome: 'win' | 'lose' | 'earn';
    let starDelta = 0;
    if (run.kind === 'wager') {
      const won = (run.roll ?? 1) < run.win_chance;
      outcome = won ? 'win' : 'lose';
      if (won) {
        const payout = Math.round(run.star_wager * run.payout_mult);
        const res = earnStar(addr, 'quest_wager', payout, `${run.quest_key}:${run.tier}`);
        starDelta = res.gained;
      }
    } else {
      outcome = 'earn';
      if (run.star_reward > 0) {
        const res = earnStar(addr, 'quest_earn', run.star_reward, run.quest_key);
        starDelta = res.gained;
      }
    }

    db.prepare(
      "UPDATE sanctuary_quest_runs SET status = 'claimed', outcome = ?, star_settled = ?, claimed_at = ? WHERE id = ?"
    ).run(outcome, starDelta, toSqlDate(now), runId);

    addJournalEntry(
      addr, tokenId, 'quest',
      outcome === 'lose'
        ? `${title}: the wager didn’t pay off this time.`
        : `${title}: earned ${starDelta} STAR.`,
      JSON.stringify({ quest_key: run.quest_key, outcome, starDelta }),
    );

    return {
      outcome, starDelta, balance: getStarBalance(addr).balance,
      quest_key: run.quest_key, title, win_chance: run.win_chance,
      payout_mult: run.payout_mult, star_wager: run.star_wager,
    };
  });
  return txn();
}

// --- Arcade (minigame STAR wagers) ------------------------------------------

export interface ArcadeStartResult {
  resources: ResourceSnapshot;
  balance: number;
  stake: number;
  game_id: string;
}

/**
 * Open an arcade run: pay the resource entry cost AND stake STAR up front, then
 * record a server-side session so the stake can't be inflated at settle. Any
 * previously-open session is forfeited (abandoning a wager loses the stake).
 */
export function startArcadeRun(
  walletAddress: string, gameId: string, stake: number,
): ArcadeStartResult {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  if (!isValidArcadeStake(stake)) {
    const e = new Error('BAD_STAKE'); (e as { code?: string }).code = 'BAD_STAKE'; throw e;
  }
  const now = new Date();
  const txn = db.transaction(() => {
    // Resource gate first (throws INSUFFICIENT_RESOURCES) — games tire the companion.
    const pool = loadWalletResources(db, addr, now);
    const want = MINIGAME_ENTRY_COST;
    const short = (['hunger', 'happiness', 'energy'] as const).filter((k) => pool[k] < (want[k] ?? 0));
    if (short.length > 0) {
      const e = new Error(`INSUFFICIENT_RESOURCES:${short.join(',')}`);
      (e as { code?: string }).code = 'INSUFFICIENT_RESOURCES'; throw e;
    }
    const next = {
      hunger: Math.max(0, pool.hunger - (want.hunger ?? 0)),
      happiness: Math.max(0, pool.happiness - (want.happiness ?? 0)),
      energy: Math.max(0, pool.energy - (want.energy ?? 0)),
    };
    db.prepare(`
      INSERT INTO sanctuary_wallet_resources (wallet_address, hunger, happiness, energy, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(wallet_address) DO UPDATE SET
        hunger = excluded.hunger, happiness = excluded.happiness,
        energy = excluded.energy, updated_at = excluded.updated_at
    `).run(addr, next.hunger, next.happiness, next.energy, toSqlDate(now));

    // Stake STAR (throws on insufficient balance → surfaced as 402).
    const spend = spendStar(addr, stake, `arcade_stake:${gameId}`);

    db.prepare(`
      INSERT INTO sanctuary_arcade_session (wallet_address, game_id, stake, started_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(wallet_address) DO UPDATE SET
        game_id = excluded.game_id, stake = excluded.stake, started_at = excluded.started_at
    `).run(addr, gameId, stake, toSqlDate(now));

    return { resources: next, balance: spend.balance, stake, game_id: gameId };
  });
  return txn();
}

export interface ArcadeSettleResult {
  game_id: string;
  stake: number;
  score: number;
  payout: number;
  net: number;
  won: boolean;
  balance: number;
}

/** Settle an arcade run by score. Stake is read from the server session (anti-tamper). */
export function settleArcadeRun(
  walletAddress: string, tokenId: number, gameId: string, score: number,
): ArcadeSettleResult {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const now = new Date();
  const txn = db.transaction(() => {
    const session = db.prepare(
      'SELECT game_id, stake FROM sanctuary_arcade_session WHERE wallet_address = ?'
    ).get(addr) as { game_id: string; stake: number } | undefined;
    if (!session || session.game_id !== gameId) {
      const e = new Error('NO_SESSION'); (e as { code?: string }).code = 'NO_SESSION'; throw e;
    }
    const result = resolveArcade(gameId, session.stake, Math.max(0, Math.floor(score)));
    let balance = getStarBalance(addr).balance;
    if (result.payout > 0) {
      balance = earnStar(addr, 'minigame_wager', result.payout, `${gameId}:${session.stake}`).balance;
    }
    db.prepare('DELETE FROM sanctuary_arcade_session WHERE wallet_address = ?').run(addr);
    // entry_type must be one of the sanctuary_journal CHECK set
    // (activity/interaction/quest/achievement/system) — 'minigame' is NOT
    // allowed and would revert the whole settle txn. Use 'activity'.
    addJournalEntry(
      addr, tokenId, 'activity',
      result.won
        ? `Arcade ${gameId}: scored ${score} and won ${result.payout} STAR (staked ${session.stake}).`
        : `Arcade ${gameId}: scored ${score}, lost the ${session.stake} STAR wager.`,
      JSON.stringify({ game_id: gameId, stake: session.stake, score, payout: result.payout, net: result.net }),
    );
    return {
      game_id: gameId, stake: session.stake, score: Math.max(0, Math.floor(score)),
      payout: result.payout, net: result.net, won: result.won, balance,
    };
  });
  return txn();
}

// ---------------------------------------------------------------------------
// Cosmetic Shop + Inventory (V2.2) — see [SWO_V2_SHOP_BACKEND]
// ---------------------------------------------------------------------------

export type CosmeticCategory = 'hat' | 'accessory' | 'background' | 'animation';
export type CosmeticRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export const COSMETIC_CATEGORIES: readonly CosmeticCategory[] = [
  'hat',
  'accessory',
  'background',
  'animation',
] as const;

export interface SanctuaryCosmeticItem {
  id: number;
  item_key: string;
  name: string;
  category: CosmeticCategory;
  rarity: CosmeticRarity;
  star_cost: number;
  level_required: number;
  description: string | null;
  asset_key: string;
  created_at: string;
}

export interface SanctuaryInventoryEntry {
  id: number;
  wallet_address: string;
  item_key: string;
  source: 'shop' | 'quest' | 'event' | 'achievement' | 'gift';
  acquired_at: string;
}

// 24 items spanning 4 categories (hat, accessory, background, animation) at
// price points 10–50 STAR. Idempotent: only inserts on a fresh DB or rows
// missing by item_key.
const SANCTUARY_COSMETIC_SEED: ReadonlyArray<Omit<SanctuaryCosmeticItem, 'id' | 'created_at'>> = [
  // Hats — 10–50 STAR
  { item_key: 'hat_acorn_cap', name: 'Acorn Cap', category: 'hat', rarity: 'common', star_cost: 10, level_required: 1, description: 'A tiny acorn cap, perfect for forest strolls.', asset_key: 'hat_acorn_cap' },
  { item_key: 'hat_star_beanie', name: 'Star Beanie', category: 'hat', rarity: 'common', star_cost: 15, level_required: 1, description: 'A cozy beanie embroidered with a single bright star.', asset_key: 'hat_star_beanie' },
  { item_key: 'hat_witch_hat', name: 'Witch Hat', category: 'hat', rarity: 'uncommon', star_cost: 20, level_required: 3, description: 'A pointed hat that hums faintly with arcane energy.', asset_key: 'hat_witch_hat' },
  { item_key: 'hat_gold_crown', name: 'Gold Crown', category: 'hat', rarity: 'rare', star_cost: 35, level_required: 5, description: 'Worn by the rulers of forgotten constellations.', asset_key: 'hat_gold_crown' },
  { item_key: 'hat_cosmic_halo', name: 'Cosmic Halo', category: 'hat', rarity: 'rare', star_cost: 40, level_required: 7, description: 'A floating ring of starlight that orbits the wearer.', asset_key: 'hat_cosmic_halo' },
  { item_key: 'hat_nebula_crown', name: 'Nebula Crown', category: 'hat', rarity: 'legendary', star_cost: 50, level_required: 10, description: 'A crown spun from raw nebula dust. Only the boldest dare wear it.', asset_key: 'hat_nebula_crown' },

  // Accessories — 10–45 STAR
  { item_key: 'acc_star_pendant', name: 'Star Pendant', category: 'accessory', rarity: 'common', star_cost: 10, level_required: 1, description: 'A simple pendant carved from meteorite glass.', asset_key: 'acc_star_pendant' },
  { item_key: 'acc_comet_scarf', name: 'Comet Scarf', category: 'accessory', rarity: 'common', star_cost: 15, level_required: 1, description: 'A long scarf with a flowing comet-tail pattern.', asset_key: 'acc_comet_scarf' },
  { item_key: 'acc_moon_glasses', name: 'Moon Glasses', category: 'accessory', rarity: 'uncommon', star_cost: 20, level_required: 2, description: 'Tinted spectacles that filter even the brightest sun.', asset_key: 'acc_moon_glasses' },
  { item_key: 'acc_aura_ribbon', name: 'Aura Ribbon', category: 'accessory', rarity: 'uncommon', star_cost: 25, level_required: 3, description: 'A ribbon woven from threads of pure aura.', asset_key: 'acc_aura_ribbon' },
  { item_key: 'acc_nebula_collar', name: 'Nebula Collar', category: 'accessory', rarity: 'rare', star_cost: 35, level_required: 5, description: 'A collar that shimmers with swirling cosmic gases.', asset_key: 'acc_nebula_collar' },
  { item_key: 'acc_eclipse_pendant', name: 'Eclipse Pendant', category: 'accessory', rarity: 'legendary', star_cost: 45, level_required: 8, description: 'Forged during a total eclipse. Pulses with shadow-light.', asset_key: 'acc_eclipse_pendant' },

  // Backgrounds — 10–50 STAR
  { item_key: 'bg_starfield', name: 'Starfield', category: 'background', rarity: 'common', star_cost: 10, level_required: 1, description: 'A peaceful field of distant pinprick stars.', asset_key: 'bg_starfield' },
  { item_key: 'bg_soft_aurora', name: 'Soft Aurora', category: 'background', rarity: 'common', star_cost: 20, level_required: 2, description: 'Pale curtains of green and pink light drifting overhead.', asset_key: 'bg_soft_aurora' },
  { item_key: 'bg_cosmic_dawn', name: 'Cosmic Dawn', category: 'background', rarity: 'uncommon', star_cost: 25, level_required: 3, description: 'The first warm light of a galactic morning.', asset_key: 'bg_cosmic_dawn' },
  { item_key: 'bg_stellar_meadow', name: 'Stellar Meadow', category: 'background', rarity: 'uncommon', star_cost: 30, level_required: 4, description: 'A field of glowing flowers under a dark crystal sky.', asset_key: 'bg_stellar_meadow' },
  { item_key: 'bg_nebula_drift', name: 'Nebula Drift', category: 'background', rarity: 'rare', star_cost: 40, level_required: 6, description: 'Slow-rolling clouds of cyan and violet stardust.', asset_key: 'bg_nebula_drift' },
  { item_key: 'bg_galaxy_swirl', name: 'Galaxy Swirl', category: 'background', rarity: 'legendary', star_cost: 50, level_required: 9, description: 'A full spiral galaxy spinning lazily behind your companion.', asset_key: 'bg_galaxy_swirl' },

  // Animations — 10–50 STAR
  { item_key: 'anim_gentle_bob', name: 'Gentle Bob', category: 'animation', rarity: 'common', star_cost: 10, level_required: 1, description: 'A soft up-and-down bob, like floating on calm water.', asset_key: 'anim_gentle_bob' },
  { item_key: 'anim_star_sparkle', name: 'Star Sparkle', category: 'animation', rarity: 'common', star_cost: 15, level_required: 2, description: 'Tiny sparkles burst around the companion at random.', asset_key: 'anim_star_sparkle' },
  { item_key: 'anim_moon_glow', name: 'Moon Glow', category: 'animation', rarity: 'uncommon', star_cost: 25, level_required: 3, description: 'A pulsing silver halo of moonlight.', asset_key: 'anim_moon_glow' },
  { item_key: 'anim_comet_trail', name: 'Comet Trail', category: 'animation', rarity: 'uncommon', star_cost: 30, level_required: 4, description: 'A bright trail follows every step.', asset_key: 'anim_comet_trail' },
  { item_key: 'anim_aurora_dance', name: 'Aurora Dance', category: 'animation', rarity: 'rare', star_cost: 40, level_required: 6, description: 'Aurora ribbons twirl rhythmically around the companion.', asset_key: 'anim_aurora_dance' },
  { item_key: 'anim_constellation_burst', name: 'Constellation Burst', category: 'animation', rarity: 'legendary', star_cost: 50, level_required: 8, description: 'Periodic bursts of constellation glyphs orbit the companion.', asset_key: 'anim_constellation_burst' },
];

function seedSanctuaryCosmeticItems(database: Database.Database): void {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO sanctuary_cosmetic_items
      (item_key, name, category, rarity, star_cost, level_required, description, asset_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const item of SANCTUARY_COSMETIC_SEED) {
    insert.run(
      item.item_key,
      item.name,
      item.category,
      item.rarity,
      item.star_cost,
      item.level_required,
      item.description ?? null,
      item.asset_key,
    );
  }
}

export interface ListShopItemsOptions {
  category?: CosmeticCategory;
  walletAddress?: string;
}

export interface ShopItemView extends SanctuaryCosmeticItem {
  owned: boolean;
}

export function listShopItems(options: ListShopItemsOptions = {}): ShopItemView[] {
  const db = getDatabase();
  const { category, walletAddress } = options;

  const ownedKeys = new Set<string>();
  if (walletAddress) {
    const rows = db.prepare(
      'SELECT item_key FROM sanctuary_companion_inventory WHERE wallet_address = ?'
    ).all(walletAddress.toLowerCase()) as Array<{ item_key: string }>;
    for (const r of rows) ownedKeys.add(r.item_key);
  }

  const sql = category
    ? 'SELECT * FROM sanctuary_cosmetic_items WHERE category = ? ORDER BY star_cost ASC, id ASC'
    : 'SELECT * FROM sanctuary_cosmetic_items ORDER BY category ASC, star_cost ASC, id ASC';
  const rows = (
    category
      ? db.prepare(sql).all(category)
      : db.prepare(sql).all()
  ) as SanctuaryCosmeticItem[];

  return rows.map((r) => ({ ...r, owned: ownedKeys.has(r.item_key) }));
}

export function getShopItem(itemKey: string): SanctuaryCosmeticItem | null {
  const db = getDatabase();
  const row = db.prepare(
    'SELECT * FROM sanctuary_cosmetic_items WHERE item_key = ?'
  ).get(itemKey) as SanctuaryCosmeticItem | undefined;
  return row ?? null;
}

export function getCompanionInventory(walletAddress: string): SanctuaryInventoryEntry[] {
  const db = getDatabase();
  return db.prepare(
    'SELECT * FROM sanctuary_companion_inventory WHERE wallet_address = ? ORDER BY acquired_at DESC, id DESC'
  ).all(walletAddress.toLowerCase()) as SanctuaryInventoryEntry[];
}

export function ownsCosmetic(walletAddress: string, itemKey: string): boolean {
  const db = getDatabase();
  const row = db.prepare(
    'SELECT 1 as found FROM sanctuary_companion_inventory WHERE wallet_address = ? AND item_key = ? LIMIT 1'
  ).get(walletAddress.toLowerCase(), itemKey) as { found: number } | undefined;
  return !!row;
}

function getWalletLevel(database: Database.Database, walletAddress: string): number {
  const row = database.prepare(
    'SELECT COALESCE(level, 1) AS level FROM user_xp WHERE wallet_address = ?'
  ).get(walletAddress.toLowerCase()) as { level: number } | undefined;
  return row?.level ?? 1;
}

export interface BuyShopItemResult {
  item: SanctuaryCosmeticItem;
  balance: number;
  lifetime_earned: number;
  spent: number;
}

/**
 * Buy a cosmetic item. Validates: item exists, level gate, not already owned,
 * sufficient STAR balance. On success: deducts STAR via spendStar (which writes
 * the ledger) and inserts an inventory row.
 *
 * Throws Error with codes: ITEM_NOT_FOUND, LEVEL_TOO_LOW, ALREADY_OWNED,
 * "Insufficient STAR balance" (re-thrown from spendStar).
 */
export function buyShopItem(
  walletAddress: string,
  itemKey: string,
): BuyShopItemResult {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const item = db.prepare(
    'SELECT * FROM sanctuary_cosmetic_items WHERE item_key = ?'
  ).get(itemKey) as SanctuaryCosmeticItem | undefined;
  if (!item) throw new Error('ITEM_NOT_FOUND');

  const level = getWalletLevel(db, addr);
  if (level < item.level_required) {
    throw new Error(`LEVEL_TOO_LOW:required=${item.level_required}:have=${level}`);
  }

  const already = db.prepare(
    'SELECT 1 as found FROM sanctuary_companion_inventory WHERE wallet_address = ? AND item_key = ? LIMIT 1'
  ).get(addr, itemKey) as { found: number } | undefined;
  if (already) throw new Error('ALREADY_OWNED');

  // spendStar runs its own transaction (deducts balance + writes ledger). The
  // inventory insert runs after it succeeds; if the insert fails we re-credit.
  const spendResult = spendStar(addr, item.star_cost, `shop:${itemKey}`);
  try {
    db.prepare(
      'INSERT INTO sanctuary_companion_inventory (wallet_address, item_key, source) VALUES (?, ?, ?)'
    ).run(addr, itemKey, 'shop');
  } catch (e) {
    // Roll back the STAR deduction by re-crediting the same amount via a raw
    // ledger compensation. We don't use earnStar() because that clamps to the
    // earn-rate band and the source isn't an earn source.
    const txn = db.transaction(() => {
      const cur = db.prepare(
        'SELECT balance FROM sanctuary_star_balance WHERE wallet_address = ?'
      ).get(addr) as { balance: number } | undefined;
      const restored = (cur?.balance ?? 0) + item.star_cost;
      db.prepare(
        'UPDATE sanctuary_star_balance SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?'
      ).run(restored, addr);
      db.prepare(
        'INSERT INTO sanctuary_star_ledger (wallet_address, delta, kind, source, balance_after) VALUES (?, ?, ?, ?, ?)'
      ).run(addr, item.star_cost, 'earn', `refund:${itemKey}`, restored);
    });
    txn();
    throw e;
  }

  return {
    item,
    balance: spendResult.balance,
    lifetime_earned: spendResult.lifetime_earned,
    spent: spendResult.spent,
  };
}

// ---------------------------------------------------------------------------
// Cosmetic gacha pull (V2 §3.3 / §3.4) — see [SWO_V2_SANCTUARY_STAR_SINKS]
// ---------------------------------------------------------------------------

export interface GachaPullPersistedResult {
  item: SanctuaryCosmeticItem;
  isRare: boolean;
  fellBackToOtherTier: boolean;
  balance: number;
  lifetime_earned: number;
  spent: number;
}

/**
 * Run a single gacha pull for `walletAddress`. Loads the catalog, filters out
 * already-owned items, picks via {@link pickGachaItem} (RNG injectable for
 * tests), debits STAR, and writes the inventory row. Throws on empty pool or
 * insufficient balance.
 */
export function gachaPullForWallet(
  walletAddress: string,
  rng: () => number = Math.random,
): GachaPullPersistedResult {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const ownedKeys = new Set<string>();
  for (const r of db.prepare(
    'SELECT item_key FROM sanctuary_companion_inventory WHERE wallet_address = ?',
  ).all(addr) as Array<{ item_key: string }>) {
    ownedKeys.add(r.item_key);
  }

  const allItems = db.prepare(
    'SELECT * FROM sanctuary_cosmetic_items ORDER BY id ASC',
  ).all() as SanctuaryCosmeticItem[];

  const eligible: GachaCandidate[] = allItems
    .filter((i) => !ownedKeys.has(i.item_key))
    .map((i) => ({
      item_key: i.item_key,
      rarity: i.rarity,
      level_required: i.level_required,
    }));

  if (eligible.length === 0) throw new Error('GACHA_POOL_EMPTY');

  const level = getWalletLevel(db, addr);
  const pick: GachaPickResult | null = pickGachaItem(eligible, level, rng);
  if (!pick) throw new Error('GACHA_NO_ELIGIBLE_ITEMS');

  const item = allItems.find((i) => i.item_key === pick.itemKey)!;

  const spendResult = spendStar(addr, GACHA_PULL_COST, `gacha:${pick.itemKey}`);
  try {
    db.prepare(
      "INSERT INTO sanctuary_companion_inventory (wallet_address, item_key, source) VALUES (?, ?, 'gift')",
    ).run(addr, pick.itemKey);
  } catch (e) {
    // Compensate the spend if the inventory insert fails (race with a
    // concurrent buyShopItem on the same key, etc.).
    const txn = db.transaction(() => {
      const cur = db.prepare(
        'SELECT balance FROM sanctuary_star_balance WHERE wallet_address = ?',
      ).get(addr) as { balance: number } | undefined;
      const restored = (cur?.balance ?? 0) + GACHA_PULL_COST;
      db.prepare(
        'UPDATE sanctuary_star_balance SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?',
      ).run(restored, addr);
      db.prepare(
        'INSERT INTO sanctuary_star_ledger (wallet_address, delta, kind, source, balance_after) VALUES (?, ?, ?, ?, ?)',
      ).run(addr, GACHA_PULL_COST, 'earn', `refund:gacha:${pick.itemKey}`, restored);
    });
    txn();
    throw e;
  }

  return {
    item,
    isRare: pick.isRare,
    fellBackToOtherTier: pick.fellBackToOtherTier,
    balance: spendResult.balance,
    lifetime_earned: spendResult.lifetime_earned,
    spent: spendResult.spent,
  };
}

export interface EquipCosmeticResult {
  token_id: number;
  equipped_cosmetics: Record<string, string | null>;
}

/**
 * Equip (or unequip with itemKey === null) a cosmetic item on a companion.
 * Validates: companion belongs to wallet, item is owned, item category matches
 * a slot, and level gate. Only one item may be equipped per slot — equipping
 * a new one swaps the old one out (no double-equip).
 *
 * Throws Error with codes: COMPANION_NOT_FOUND, ITEM_NOT_FOUND, NOT_OWNED,
 * LEVEL_TOO_LOW, ALREADY_EQUIPPED.
 */
export function equipCosmetic(
  walletAddress: string,
  tokenId: number,
  itemKey: string | null,
  slot?: CosmeticCategory,
): EquipCosmeticResult {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const companion = db.prepare(
    'SELECT id, equipped_cosmetics FROM sanctuary_companions WHERE wallet_address = ? AND token_id = ?'
  ).get(addr, tokenId) as { id: number; equipped_cosmetics: string | null } | undefined;
  if (!companion) throw new Error('COMPANION_NOT_FOUND');

  let equipped: Record<string, string | null> = {};
  if (companion.equipped_cosmetics) {
    try {
      const parsed = JSON.parse(companion.equipped_cosmetics);
      if (parsed && typeof parsed === 'object') equipped = parsed;
    } catch { /* malformed — treat as empty */ }
  }

  if (itemKey === null) {
    // Unequip: requires explicit slot.
    if (!slot) throw new Error('SLOT_REQUIRED');
    if (equipped[slot] === undefined || equipped[slot] === null) {
      // No-op if nothing was equipped.
      return { token_id: tokenId, equipped_cosmetics: equipped };
    }
    equipped[slot] = null;
  } else {
    const item = db.prepare(
      'SELECT * FROM sanctuary_cosmetic_items WHERE item_key = ?'
    ).get(itemKey) as SanctuaryCosmeticItem | undefined;
    if (!item) throw new Error('ITEM_NOT_FOUND');

    const owned = db.prepare(
      'SELECT 1 as found FROM sanctuary_companion_inventory WHERE wallet_address = ? AND item_key = ? LIMIT 1'
    ).get(addr, itemKey) as { found: number } | undefined;
    if (!owned) throw new Error('NOT_OWNED');

    const level = getWalletLevel(db, addr);
    if (level < item.level_required) {
      throw new Error(`LEVEL_TOO_LOW:required=${item.level_required}:have=${level}`);
    }

    const targetSlot = (slot ?? item.category) as CosmeticCategory;
    if (equipped[targetSlot] === itemKey) {
      throw new Error('ALREADY_EQUIPPED');
    }
    equipped[targetSlot] = itemKey;
  }

  db.prepare(
    'UPDATE sanctuary_companions SET equipped_cosmetics = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(JSON.stringify(equipped), companion.id);

  return { token_id: tokenId, equipped_cosmetics: equipped };
}

// ---------------------------------------------------------------------------
// Expeditions (V2.6) — see [SWO_V2_SANCTUARY_EXPEDITIONS_DB_API]
// ---------------------------------------------------------------------------

export interface SanctuaryExpeditionRow {
  id: number;
  wallet_address: string;
  token_id: number;
  expedition_id: string;
  star_cost: number;
  started_at: string;
  ended_at: string | null;
  outcome: ExpeditionOutcome | null;
  status: ExpeditionStatus;
}

export interface SanctuaryExpeditionProgressRow {
  expedition_row_id: number;
  current_step_id: string | null;
  choices_jsonb: string;
  updated_at: string;
}

export interface ExpeditionListing {
  tier: ExpeditionTier;
  star_cost: number;
  id: string;
  title: string;
  description: string;
  npcSource: string;
  rewards: ExpeditionDefinition['rewards'];
  /** True when the holder has an active run for this expedition. */
  active_row_id: number | null;
}

export interface ExpeditionRunView {
  row: SanctuaryExpeditionRow;
  state: ExpeditionState;
  definition: ExpeditionDefinition;
}

function parseHistory(json: string): ExpeditionHistoryEntry[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return parsed as ExpeditionHistoryEntry[];
  } catch {
    /* fall through */
  }
  return [];
}

function rowToState(
  row: SanctuaryExpeditionRow,
  progress: SanctuaryExpeditionProgressRow | undefined,
): ExpeditionState {
  return {
    expeditionId: row.expedition_id,
    currentStepId: progress?.current_step_id ?? null,
    status: row.status,
    history: progress ? parseHistory(progress.choices_jsonb) : [],
    finalOutcome: row.outcome ?? undefined,
  };
}

export function listExpeditions(walletAddress: string, tokenId: number): {
  tiers: typeof EXPEDITION_TIERS;
  expeditions: ExpeditionListing[];
} {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const catalog = getExpeditionCatalog();

  const active = db.prepare(
    "SELECT id, expedition_id FROM sanctuary_expeditions WHERE wallet_address = ? AND token_id = ? AND status = 'active'"
  ).all(addr, tokenId) as Array<{ id: number; expedition_id: string }>;
  const activeById = new Map(active.map((a) => [a.expedition_id, a.id]));

  return {
    tiers: EXPEDITION_TIERS,
    expeditions: catalog.map((entry) => ({
      tier: entry.tier,
      star_cost: entry.star_cost,
      id: entry.definition.id,
      title: entry.definition.title,
      description: entry.definition.description,
      npcSource: entry.definition.npcSource,
      rewards: entry.definition.rewards,
      active_row_id: activeById.get(entry.definition.id) ?? null,
    })),
  };
}

/**
 * Start a new expedition run for (wallet, token). Deducts the seed-declared
 * `star_cost` atomically; on insufficient balance the run is not created.
 * Returns the new run plus the reducer state primed on the start step.
 */
export function startExpeditionRun(
  walletAddress: string,
  tokenId: number,
  expeditionId: string,
): ExpeditionRunView {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();
  const entry = getExpeditionCatalogEntry(expeditionId);
  if (!entry) throw new Error('EXPEDITION_NOT_FOUND');

  const txn = db.transaction(() => {
    const existing = db.prepare(
      "SELECT id FROM sanctuary_expeditions WHERE wallet_address = ? AND token_id = ? AND expedition_id = ? AND status = 'active'"
    ).get(addr, tokenId, expeditionId) as { id: number } | undefined;
    if (existing) throw new Error('ALREADY_ACTIVE');

    if (entry.star_cost > 0) {
      // Inline spend to keep ledger consistent with run id.
      const balRow = db.prepare(
        'SELECT balance, lifetime_earned FROM sanctuary_star_balance WHERE wallet_address = ?'
      ).get(addr) as { balance: number; lifetime_earned: number } | undefined;
      const cur = balRow?.balance ?? 0;
      if (cur < entry.star_cost) throw new Error('Insufficient STAR balance');
      const newBal = cur - entry.star_cost;
      if (balRow) {
        db.prepare(
          'UPDATE sanctuary_star_balance SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?'
        ).run(newBal, addr);
      } else {
        db.prepare(
          'INSERT INTO sanctuary_star_balance (wallet_address, balance, lifetime_earned) VALUES (?, ?, ?)'
        ).run(addr, newBal, 0);
      }
      db.prepare(
        'INSERT INTO sanctuary_star_ledger (wallet_address, delta, kind, source, balance_after) VALUES (?, ?, ?, ?, ?)'
      ).run(addr, -entry.star_cost, 'spend', `expedition:${expeditionId}`, newBal);
    }

    const state = startExpedition(entry.definition);
    const result = db.prepare(
      "INSERT INTO sanctuary_expeditions (wallet_address, token_id, expedition_id, star_cost, status) VALUES (?, ?, ?, ?, 'active')"
    ).run(addr, tokenId, expeditionId, entry.star_cost);
    const rowId = Number(result.lastInsertRowid);
    db.prepare(
      'INSERT INTO sanctuary_expedition_progress (expedition_row_id, current_step_id, choices_jsonb) VALUES (?, ?, ?)'
    ).run(rowId, state.currentStepId, JSON.stringify(state.history));

    const row = db.prepare('SELECT * FROM sanctuary_expeditions WHERE id = ?').get(rowId) as SanctuaryExpeditionRow;
    return { row, state, definition: entry.definition };
  });

  return txn();
}

export function getExpeditionRun(
  walletAddress: string,
  tokenId: number,
  rowId: number,
): ExpeditionRunView | null {
  const db = getDatabase();
  const row = db.prepare(
    'SELECT * FROM sanctuary_expeditions WHERE id = ? AND wallet_address = ? AND token_id = ?'
  ).get(rowId, walletAddress.toLowerCase(), tokenId) as SanctuaryExpeditionRow | undefined;
  if (!row) return null;

  const entry = getExpeditionCatalogEntry(row.expedition_id);
  if (!entry) return null;
  const progress = db.prepare(
    'SELECT * FROM sanctuary_expedition_progress WHERE expedition_row_id = ?'
  ).get(rowId) as SanctuaryExpeditionProgressRow | undefined;

  return { row, state: rowToState(row, progress), definition: entry.definition };
}

/**
 * Apply a choice to the current step of a run. On a terminal step this also
 * settles rewards: success grants STAR + bond + trait, partial/failure grant
 * the scaled subset per {@link EXPEDITION_OUTCOME_REWARD_SCALE}.
 */
export function chooseExpeditionStep(
  walletAddress: string,
  tokenId: number,
  rowId: number,
  choiceId: string,
): ExpeditionRunView & {
  rewards: { xp: number; bond: number; trait: string | null; starGained: number };
} {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const row = db.prepare(
      'SELECT * FROM sanctuary_expeditions WHERE id = ? AND wallet_address = ? AND token_id = ?'
    ).get(rowId, addr, tokenId) as SanctuaryExpeditionRow | undefined;
    if (!row) throw new Error('NOT_FOUND');
    if (row.status !== 'active') throw new Error('NOT_ACTIVE');

    const entry = getExpeditionCatalogEntry(row.expedition_id);
    if (!entry) throw new Error('EXPEDITION_NOT_FOUND');

    const progress = db.prepare(
      'SELECT * FROM sanctuary_expedition_progress WHERE expedition_row_id = ?'
    ).get(rowId) as SanctuaryExpeditionProgressRow | undefined;
    const state = rowToState(row, progress);
    const nextState = chooseExpeditionPath(state, entry.definition, choiceId);

    db.prepare(
      'UPDATE sanctuary_expedition_progress SET current_step_id = ?, choices_jsonb = ?, updated_at = CURRENT_TIMESTAMP WHERE expedition_row_id = ?'
    ).run(nextState.currentStepId, JSON.stringify(nextState.history), rowId);

    let rewards = { xp: 0, bond: 0, trait: null as string | null, starGained: 0 };

    if (nextState.status === 'completed' && nextState.finalOutcome) {
      const def = entry.definition;
      const computed = getExpeditionRewards(nextState, def);
      const starGained = Math.max(0, Math.round(computed.xp / 4));
      rewards = {
        xp: computed.xp,
        bond: computed.bond,
        trait: computed.trait ?? null,
        starGained,
      };

      db.prepare(
        "UPDATE sanctuary_expeditions SET status = 'completed', ended_at = CURRENT_TIMESTAMP, outcome = ? WHERE id = ?"
      ).run(nextState.finalOutcome, rowId);

      if (computed.xp > 0) {
        try { addUserXP(addr, computed.xp); } catch { /* user_xp may not be wired for tests */ }
      }
      if (computed.bond > 0) {
        db.prepare(
          'UPDATE sanctuary_companions SET bond_score = MIN(bond_score + ?, 100.0), updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ? AND token_id = ?'
        ).run(computed.bond, addr, tokenId);
      }
      if (computed.trait) {
        const traitName = computed.trait;
        const existing = db.prepare(
          'SELECT id FROM sanctuary_traits WHERE wallet_address = ? AND token_id = ? AND trait_name = ?'
        ).get(addr, tokenId, traitName) as { id: number } | undefined;
        if (existing) {
          db.prepare(
            'UPDATE sanctuary_traits SET unlocked = 1, progress = 1, unlocked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).run(existing.id);
        } else {
          db.prepare(
            "INSERT INTO sanctuary_traits (wallet_address, token_id, trait_name, trait_category, progress, unlocked, unlocked_at) VALUES (?, ?, ?, 'special', 1, 1, CURRENT_TIMESTAMP)"
          ).run(addr, tokenId, traitName);
        }
      }
      if (starGained > 0) {
        const balRow = db.prepare(
          'SELECT balance, lifetime_earned FROM sanctuary_star_balance WHERE wallet_address = ?'
        ).get(addr) as { balance: number; lifetime_earned: number } | undefined;
        const newBalance = (balRow?.balance ?? 0) + starGained;
        const newLifetime = (balRow?.lifetime_earned ?? 0) + starGained;
        if (balRow) {
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
        ).run(addr, starGained, 'earn', `expedition:${row.expedition_id}:${nextState.finalOutcome}`, newBalance);
      }

      try {
        addJournalEntry(
          addr, tokenId, 'quest',
          `Expedition "${def.title}" — ${nextState.finalOutcome}`,
          JSON.stringify({ expedition_id: def.id, outcome: nextState.finalOutcome, ...rewards }),
        );
      } catch { /* journal optional in tests */ }
    }

    const updatedRow = db.prepare('SELECT * FROM sanctuary_expeditions WHERE id = ?').get(rowId) as SanctuaryExpeditionRow;
    return { row: updatedRow, state: nextState, definition: entry.definition, rewards };
  });

  return txn();
}

/**
 * Abandon an active run. Idempotent on already-ended rows: returns the
 * existing state unchanged rather than re-stamping.
 */
export function abandonExpeditionRun(
  walletAddress: string,
  tokenId: number,
  rowId: number,
): ExpeditionRunView {
  const db = getDatabase();
  const addr = walletAddress.toLowerCase();

  const txn = db.transaction(() => {
    const row = db.prepare(
      'SELECT * FROM sanctuary_expeditions WHERE id = ? AND wallet_address = ? AND token_id = ?'
    ).get(rowId, addr, tokenId) as SanctuaryExpeditionRow | undefined;
    if (!row) throw new Error('NOT_FOUND');

    const entry = getExpeditionCatalogEntry(row.expedition_id);
    if (!entry) throw new Error('EXPEDITION_NOT_FOUND');

    const progress = db.prepare(
      'SELECT * FROM sanctuary_expedition_progress WHERE expedition_row_id = ?'
    ).get(rowId) as SanctuaryExpeditionProgressRow | undefined;
    const state = rowToState(row, progress);
    if (state.status !== 'active') {
      return { row, state, definition: entry.definition };
    }

    const nextState = abandonExpedition(state);
    db.prepare(
      "UPDATE sanctuary_expeditions SET status = 'abandoned', ended_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(rowId);
    db.prepare(
      'UPDATE sanctuary_expedition_progress SET current_step_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE expedition_row_id = ?'
    ).run(rowId);

    const updatedRow = db.prepare('SELECT * FROM sanctuary_expeditions WHERE id = ?').get(rowId) as SanctuaryExpeditionRow;
    return { row: updatedRow, state: nextState, definition: entry.definition };
  });

  return txn();
}
