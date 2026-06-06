/**
 * Governance Nonce Management (Security Enhancement) — db helpers. Extracted from the lib/db.ts god-file.
 * Handle via ./connection.
 */
import crypto from 'crypto';
import { getDatabase } from './connection';


/**
 * Nonce expiration time in minutes
 */
const NONCE_EXPIRATION_MINUTES = 10;

export interface GovernanceNonce {
  id: number;
  nonce: string;
  proposal_id: string;
  voter_address: string;
  status: 'issued' | 'consumed' | 'expired';
  issued_at: string;
  expires_at: string;
  consumed_at: string | null;
}

/**
 * Issue a new server-generated nonce for vote signing
 * Nonces are cryptographically random and single-use
 */
export function issueGovernanceNonce(proposalId: string, voterAddress: string): GovernanceNonce {
  const db = getDatabase();
  
  // Generate cryptographically secure nonce
  const nonce = `nonce-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + NONCE_EXPIRATION_MINUTES * 60 * 1000);
  
  // Insert nonce
  const stmt = db.prepare(`
    INSERT INTO governance_nonces (nonce, proposal_id, voter_address, status, expires_at)
    VALUES (?, ?, ?, 'issued', ?)
  `);
  
  stmt.run(nonce, proposalId, voterAddress.toLowerCase(), expiresAt.toISOString());
  
  // Retrieve the created nonce
  const getStmt = db.prepare('SELECT * FROM governance_nonces WHERE nonce = ?');
  return getStmt.get(nonce) as GovernanceNonce;
}

/**
 * Validate a nonce and mark it as consumed
 * Returns the nonce if valid, null if invalid/expired/already consumed
 */
export function consumeGovernanceNonce(
  nonce: string,
  proposalId: string,
  voterAddress: string
): GovernanceNonce | null {
  const db = getDatabase();
  
  // Find the nonce
  const stmt = db.prepare(`
    SELECT * FROM governance_nonces 
    WHERE nonce = ? 
      AND proposal_id = ? 
      AND voter_address = ?
      AND status = 'issued'
  `);
  
  const nonceRecord = stmt.get(nonce, proposalId, voterAddress.toLowerCase()) as GovernanceNonce | undefined;
  
  if (!nonceRecord) {
    return null; // Nonce not found or already consumed
  }
  
  // Check if nonce is expired
  const now = new Date();
  const expiresAt = new Date(nonceRecord.expires_at);
  if (now > expiresAt) {
    // Mark as expired
    db.prepare(`
      UPDATE governance_nonces 
      SET status = 'expired' 
      WHERE id = ?
    `).run(nonceRecord.id);
    return null;
  }
  
  // Mark as consumed
  const updateStmt = db.prepare(`
    UPDATE governance_nonces 
    SET status = 'consumed', consumed_at = ? 
    WHERE id = ?
  `);
  
  updateStmt.run(now.toISOString(), nonceRecord.id);
  
  // Return updated nonce
  const getStmt = db.prepare('SELECT * FROM governance_nonces WHERE id = ?');
  return getStmt.get(nonceRecord.id) as GovernanceNonce;
}

/**
 * Validate a nonce without consuming it
 * Returns true if nonce is valid and not expired
 */
export function validateGovernanceNonce(
  nonce: string,
  proposalId: string,
  voterAddress: string
): boolean {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    SELECT * FROM governance_nonces 
    WHERE nonce = ? 
      AND proposal_id = ? 
      AND voter_address = ?
      AND status = 'issued'
  `);
  
  const nonceRecord = stmt.get(nonce, proposalId, voterAddress.toLowerCase()) as GovernanceNonce | undefined;
  
  if (!nonceRecord) {
    return false;
  }
  
  // Check expiration
  const now = new Date();
  const expiresAt = new Date(nonceRecord.expires_at);
  return now <= expiresAt;
}

/**
 * Clean up expired nonces (should be called periodically)
 */
export function expireOldGovernanceNonces(): number {
  const db = getDatabase();
  
  const stmt = db.prepare(`
    UPDATE governance_nonces 
    SET status = 'expired' 
    WHERE status = 'issued' AND datetime(expires_at) < datetime('now')
  `);
  
  const result = stmt.run();
  return result.changes;
}

/**
 * Get nonce by value (for debugging/admin purposes)
 */
export function getGovernanceNonceByValue(nonce: string): GovernanceNonce | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM governance_nonces WHERE nonce = ?');
  return stmt.get(nonce) as GovernanceNonce | null;
}
