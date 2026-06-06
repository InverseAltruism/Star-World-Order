/**
 * STAR SKRUMPEY METADATA — db helpers. Extracted from the lib/db.ts god-file.
 * Handle via ./connection.
 */
import { getDatabase } from './connection';


export interface StarSkrumpeyMetadata {
  id: number;
  token_id: number;
  name: string;
  description: string | null;
  image_url: string;
  constellation: string | null;
  aura: string | null;
  background: string | null;
  eyes: string | null;
  form: string | null;
  mood: string | null;
  hat: string | null;
  gaze: string | null;
  relic: string | null;
  pet: string | null;
  fit: string | null;
  attitude: string | null;
  scene: string | null;
  extra: string | null;
  submerged: string | null;
  rarity_rank: number | null;
  rarity_score: number | null;
  trait_count: number | null;
  attributes_json: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get Star Skrumpey metadata by token ID
 */
export function getStarSkrumpeyMetadata(tokenId: number): StarSkrumpeyMetadata | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM star_skrumpey_metadata WHERE token_id = ?');
  return stmt.get(tokenId) as StarSkrumpeyMetadata | null;
}

/**
 * Get metadata for multiple Star Skrumpeys by token IDs
 */
export function getStarSkrumpeyMetadataBatch(tokenIds: number[]): Map<number, StarSkrumpeyMetadata> {
  if (tokenIds.length === 0) return new Map();
  
  const db = getDatabase();
  const placeholders = tokenIds.map(() => '?').join(',');
  const stmt = db.prepare(`SELECT * FROM star_skrumpey_metadata WHERE token_id IN (${placeholders})`);
  const results = stmt.all(...tokenIds) as StarSkrumpeyMetadata[];
  
  const metadataMap = new Map<number, StarSkrumpeyMetadata>();
  for (const meta of results) {
    metadataMap.set(meta.token_id, meta);
  }
  
  return metadataMap;
}

/**
 * Get all Star Skrumpey metadata
 */
export function getAllStarSkrumpeyMetadata(): StarSkrumpeyMetadata[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM star_skrumpey_metadata ORDER BY token_id ASC');
  return stmt.all() as StarSkrumpeyMetadata[];
}

/**
 * Upsert Star Skrumpey metadata
 */
export function upsertStarSkrumpeyMetadata(data: {
  tokenId: number;
  name: string;
  description?: string;
  imageUrl: string;
  constellation?: string;
  aura?: string;
  background?: string;
  eyes?: string;
  form?: string;
  mood?: string;
  attributesJson?: string;
}): StarSkrumpeyMetadata {
  const db = getDatabase();
  
  // Use excluded.column_name syntax to avoid parameter duplication
  const stmt = db.prepare(`
    INSERT INTO star_skrumpey_metadata (
      token_id, name, description, image_url, constellation,
      aura, background, eyes, form, mood, attributes_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(token_id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      image_url = excluded.image_url,
      constellation = excluded.constellation,
      aura = excluded.aura,
      background = excluded.background,
      eyes = excluded.eyes,
      form = excluded.form,
      mood = excluded.mood,
      attributes_json = excluded.attributes_json,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  stmt.run(
    data.tokenId,
    data.name,
    data.description || null,
    data.imageUrl,
    data.constellation || null,
    data.aura || null,
    data.background || null,
    data.eyes || null,
    data.form || null,
    data.mood || null,
    data.attributesJson || null
  );
  
  const getStmt = db.prepare('SELECT * FROM star_skrumpey_metadata WHERE token_id = ?');
  return getStmt.get(data.tokenId) as StarSkrumpeyMetadata;
}

/**
 * Get count of Star Skrumpeys by constellation type
 */
export function getConstellationDistribution(): Record<string, number> {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT constellation, COUNT(*) as count 
    FROM star_skrumpey_metadata 
    WHERE constellation IS NOT NULL 
    GROUP BY constellation
  `);
  const results = stmt.all() as Array<{ constellation: string; count: number }>;
  
  const distribution: Record<string, number> = {};
  for (const row of results) {
    distribution[row.constellation] = row.count;
  }
  
  return distribution;
}

/**
 * Get trait distribution (aura, background, form) for analytics
 */
export function getTraitDistribution(traitType: 'aura' | 'background' | 'form'): Record<string, number> {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT ${traitType}, COUNT(*) as count 
    FROM star_skrumpey_metadata 
    WHERE ${traitType} IS NOT NULL 
    GROUP BY ${traitType}
    ORDER BY count DESC
    LIMIT 10
  `);
  const results = stmt.all() as Array<{ [key: string]: string | number }>;
  
  const distribution: Record<string, number> = {};
  for (const row of results) {
    const trait = row[traitType] as string;
    const count = row.count as number;
    if (trait) {
      distribution[trait] = count;
    }
  }
  
  return distribution;
}

const VALID_TRAIT_COLUMNS = new Set([
  'constellation','aura','background','eyes','form','mood',
  'hat','gaze','relic','pet','fit','attitude','scene','extra','submerged',
]);

export function filterMetadataByTraits(
  filters: Record<string, string>,
  limit = 100,
  offset = 0,
): StarSkrumpeyMetadata[] {
  const db = getDatabase();
  const clauses: string[] = [];
  const params: string[] = [];
  for (const [col, val] of Object.entries(filters)) {
    if (!VALID_TRAIT_COLUMNS.has(col.toLowerCase())) continue;
    clauses.push(`${col.toLowerCase()} = ?`);
    params.push(val);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.prepare(
    `SELECT * FROM star_skrumpey_metadata ${where} ORDER BY rarity_rank ASC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as StarSkrumpeyMetadata[];
}

export function getMetadataTraitDistribution(traitColumn: string): Record<string, number> {
  if (!VALID_TRAIT_COLUMNS.has(traitColumn.toLowerCase())) return {};
  const db = getDatabase();
  const col = traitColumn.toLowerCase();
  const rows = db.prepare(`
    SELECT ${col} as trait_value, COUNT(*) as count
    FROM star_skrumpey_metadata WHERE ${col} IS NOT NULL
    GROUP BY ${col} ORDER BY count DESC
  `).all() as Array<{ trait_value: string; count: number }>;
  const dist: Record<string, number> = {};
  for (const r of rows) dist[r.trait_value] = r.count;
  return dist;
}

export function getMetadataForTokenIds(tokenIds: number[]): StarSkrumpeyMetadata[] {
  if (tokenIds.length === 0) return [];
  const db = getDatabase();
  const placeholders = tokenIds.map(() => '?').join(',');
  return db.prepare(
    `SELECT * FROM star_skrumpey_metadata WHERE token_id IN (${placeholders}) ORDER BY token_id`
  ).all(...tokenIds) as StarSkrumpeyMetadata[];
}
