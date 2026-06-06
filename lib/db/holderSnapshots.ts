/**
 * Holder snapshots — db helpers for periodic Star/constellation holder counts.
 * Self-contained leaf domain; handle via ./connection.
 * Extracted from the lib/db.ts god-file.
 */
import { getDatabase } from './connection';

export interface HolderSnapshot {
  id: number;
  constellation: string;
  holder_count: number;
  created_at: string;
}

/**
 * Insert a holder count snapshot for a constellation.
 * Use 'all' for total holder count across all constellations.
 */
export function insertHolderSnapshot(
  constellation: string,
  holderCount: number
): HolderSnapshot {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO holder_snapshots (constellation, holder_count)
    VALUES (?, ?)
  `);
  
  const result = stmt.run(constellation.toLowerCase(), holderCount);
  
  const getStmt = db.prepare('SELECT * FROM holder_snapshots WHERE id = ?');
  return getStmt.get(result.lastInsertRowid) as HolderSnapshot;
}

/**
 * Batch insert holder snapshots for multiple constellations.
 * More efficient than multiple single inserts.
 */
export function insertHolderSnapshotsBatch(
  snapshots: Array<{ constellation: string; holderCount: number }>
): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO holder_snapshots (constellation, holder_count)
    VALUES (?, ?)
  `);
  
  const insertMany = db.transaction((items: Array<{ constellation: string; holderCount: number }>) => {
    for (const item of items) {
      stmt.run(item.constellation.toLowerCase(), item.holderCount);
    }
  });
  
  insertMany(snapshots);
}

/**
 * Get holder snapshots for a constellation within a time range.
 * @param constellation - 'all' for total, or specific constellation name
 * @param hoursBack - How many hours of data to retrieve
 * @param limit - Maximum number of data points to return (for chart performance)
 */
export function getHolderSnapshots(
  constellation: string,
  hoursBack: number = 24,
  limit: number = 100
): HolderSnapshot[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM holder_snapshots 
    WHERE constellation = ?
    AND datetime(created_at) > datetime('now', ?)
    ORDER BY created_at ASC
    LIMIT ?
  `);
  
  return stmt.all(constellation.toLowerCase(), `-${hoursBack} hours`, limit) as HolderSnapshot[];
}

/**
 * Get the most recent holder snapshot for a constellation.
 */
export function getLatestHolderSnapshot(constellation: string): HolderSnapshot | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM holder_snapshots 
    WHERE constellation = ?
    ORDER BY created_at DESC 
    LIMIT 1
  `);
  
  return stmt.get(constellation.toLowerCase()) as HolderSnapshot | null;
}

/**
 * Get latest holder snapshots for all constellations.
 * Returns a map of constellation -> latest snapshot
 */
export function getLatestHolderSnapshotsAll(): Map<string, HolderSnapshot> {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT h1.* FROM holder_snapshots h1
    INNER JOIN (
      SELECT constellation, MAX(created_at) as max_created_at
      FROM holder_snapshots
      GROUP BY constellation
    ) h2 ON h1.constellation = h2.constellation AND h1.created_at = h2.max_created_at
  `);
  
  const results = stmt.all() as HolderSnapshot[];
  const map = new Map<string, HolderSnapshot>();
  
  for (const snapshot of results) {
    map.set(snapshot.constellation, snapshot);
  }
  
  return map;
}

/**
 * Clean up old holder snapshots (keep only last 7 days of data)
 */
export function cleanupOldHolderSnapshots(): void {
  const db = getDatabase();
  db.prepare(`
    DELETE FROM holder_snapshots 
    WHERE datetime(created_at) < datetime('now', '-7 days')
  `).run();
}
