/**
 * Admin Nonce Management (replay protection for admin auth) — db helpers. Extracted from the lib/db.ts god-file.
 * Handle via ./connection.
 */
import { getDatabase } from './connection';


/**
 * Atomically claim an admin-auth nonce. Returns true on first use, false if
 * the nonce has already been consumed within its TTL window.
 * Uses INSERT OR IGNORE so concurrent requests can't both succeed.
 */
export function claimAdminNonce(nonce: string, expiresAtMs: number): boolean {
  const db = getDatabase();
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO admin_nonces (nonce, expires_at) VALUES (?, ?)'
  );
  const result = stmt.run(nonce, expiresAtMs);
  return result.changes === 1;
}

/**
 * Delete admin nonces whose TTL has elapsed. Returns count removed.
 */
export function pruneExpiredAdminNonces(nowMs: number = Date.now()): number {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM admin_nonces WHERE expires_at <= ?');
  const result = stmt.run(nowMs);
  return result.changes;
}
