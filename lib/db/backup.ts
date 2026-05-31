/**
 * DATABASE BACKUP — db helpers. Extracted from the lib/db.ts god-file.
 * Handle via ./connection.
 */
import fs from 'fs';
import path from 'path';
import { getDatabase } from './connection';


/**
 * Create a backup of the database file
 * @param backupDir Directory to store backups (defaults to data/backups)
 * @returns Path to the backup file
 */
export function createDatabaseBackup(backupDir?: string): string {
  const db = getDatabase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDirectory = backupDir || path.join(process.cwd(), 'data', 'backups');
  
  // Ensure backup directory exists
  if (!fs.existsSync(backupDirectory)) {
    fs.mkdirSync(backupDirectory, { recursive: true });
  }
  
  const backupPath = path.join(backupDirectory, `swo-backup-${timestamp}.db`);
  
  try {
    // Use SQLite's backup API
    db.backup(backupPath);
  } catch (error) {
    throw new Error(`Database backup failed: ${String(error)}`);
  }
  
  return backupPath;
}

/**
 * List all database backups
 */
export function listDatabaseBackups(backupDir?: string): Array<{
  filename: string;
  path: string;
  timestamp: Date;
  size: number;
}> {
  const backupDirectory = backupDir || path.join(process.cwd(), 'data', 'backups');
  
  if (!fs.existsSync(backupDirectory)) {
    return [];
  }
  
  const files = fs.readdirSync(backupDirectory)
    .filter(f => f.startsWith('swo-backup-') && f.endsWith('.db'))
    .map(filename => {
      const filePath = path.join(backupDirectory, filename);
      const stats = fs.statSync(filePath);
      
      // Extract timestamp from filename: swo-backup-YYYY-MM-DDTHH-MM-SS-sssZ.db
      // The ISO timestamp uses '-' instead of ':' and '.' for filesystem safety
      const timestampMatch = filename.match(/swo-backup-(.+)\.db/);
      let timestamp: Date;
      
      if (timestampMatch) {
        // Reconstruct ISO format: replace position-based separators
        // Format: 2024-12-26T12-00-00-000Z -> 2024-12-26T12:00:00.000Z
        const ts = timestampMatch[1];
        // Only need to fix the time portion (after T): positions 11,14 should be : and position 17 should be .
        const isoString = ts.substring(0, 13) + ':' + ts.substring(14, 16) + ':' + ts.substring(17, 19) + '.' + ts.substring(20);
        timestamp = new Date(isoString);
      } else {
        timestamp = stats.mtime;
      }
      
      return {
        filename,
        path: filePath,
        timestamp,
        size: stats.size,
      };
    })
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  
  return files;
}

/**
 * Clean up old backups, keeping only the most recent N backups
 */
export function cleanupOldBackups(keepCount: number = 7, backupDir?: string): number {
  const backups = listDatabaseBackups(backupDir);
  let deletedCount = 0;
  
  if (backups.length > keepCount) {
    const toDelete = backups.slice(keepCount);
    for (const backup of toDelete) {
      fs.unlinkSync(backup.path);
      deletedCount++;
    }
  }
  
  return deletedCount;
}
