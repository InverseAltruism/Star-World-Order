import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { privateKeyToAccount } from 'viem/accounts';

const ADMIN_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const admin = privateKeyToAccount(ADMIN_PK);
const ADMIN_ADDRESS = admin.address.toLowerCase();

const { sharedDb, dbMocks } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BetterSqlite = require('better-sqlite3') as typeof import('better-sqlite3');
  const db = new BetterSqlite(':memory:');
  db.exec(`
    CREATE TABLE admin_nonces (
      nonce TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );
  `);
  return {
    sharedDb: db,
    dbMocks: {
      claimAdminNonce: (nonce: string, expiresAt: number): boolean => {
        return db
          .prepare('INSERT OR IGNORE INTO admin_nonces (nonce, expires_at) VALUES (?, ?)')
          .run(nonce, expiresAt).changes === 1;
      },
      pruneExpiredAdminNonces: (now: number): number => {
        return db
          .prepare('DELETE FROM admin_nonces WHERE expires_at <= ?')
          .run(now).changes;
      },
    },
  };
});

vi.mock('../config', () => ({
  ADMIN_WALLET_ADDRESS: ADMIN_ADDRESS,
}));

vi.mock('../logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../db', () => dbMocks);

async function makeAuthHeader(timestampMs: number): Promise<string> {
  const signature = await admin.signMessage({
    message: `SWO Admin Access\nTimestamp: ${timestampMs}`,
  });
  return `${ADMIN_ADDRESS}:${timestampMs}:${signature}`;
}

function requestWith(header: string | null): Request {
  const headers = new Headers();
  if (header !== null) headers.set('x-admin-auth', header);
  return new Request('http://localhost/api/admin', { method: 'POST', headers });
}

describe('verifyAdminAccess — SQLite-backed nonce', () => {
  let verifyAdminAccess: typeof import('../adminAuth').verifyAdminAccess;

  beforeEach(async () => {
    sharedDb.exec('DELETE FROM admin_nonces');
    vi.resetModules();
    ({ verifyAdminAccess } = await import('../adminAuth'));
  });

  it('accepts a valid signed request', async () => {
    const ts = Date.now();
    const header = await makeAuthHeader(ts);
    const result = await verifyAdminAccess(requestWith(header));
    expect(result.valid).toBe(true);
    expect(result.adminAddress).toBe(ADMIN_ADDRESS);
  });

  it('rejects replay of the same timestamp', async () => {
    const ts = Date.now();
    const header = await makeAuthHeader(ts);
    const first = await verifyAdminAccess(requestWith(header));
    expect(first.valid).toBe(true);

    const second = await verifyAdminAccess(requestWith(header));
    expect(second.valid).toBe(false);
    expect(second.error).toBe('Authentication already used');
  });

  it('persists consumed nonces across simulated process restarts', async () => {
    const ts = Date.now();
    const header = await makeAuthHeader(ts);
    const first = await verifyAdminAccess(requestWith(header));
    expect(first.valid).toBe(true);

    // Simulate a second serverless instance: reload the adminAuth module. The
    // db mock shares the same sqlite connection, so nonce state persists as
    // it would in real SQLite/KV storage. This is the regression test for the
    // original in-memory Map that would have let the replay succeed here.
    vi.resetModules();
    const fresh = await import('../adminAuth');
    const replay = await fresh.verifyAdminAccess(requestWith(header));
    expect(replay.valid).toBe(false);
    expect(replay.error).toBe('Authentication already used');
  });

  it('rejects stale timestamps (> 5 min skew)', async () => {
    const ts = Date.now() - 6 * 60 * 1000;
    const header = await makeAuthHeader(ts);
    const result = await verifyAdminAccess(requestWith(header));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Authentication expired');
  });

  it('rejects missing header', async () => {
    const result = await verifyAdminAccess(requestWith(null));
    expect(result.valid).toBe(false);
  });

  it('rejects non-admin wallet', async () => {
    const ts = Date.now();
    const header = `0x0000000000000000000000000000000000000001:${ts}:0xdeadbeef`;
    const result = await verifyAdminAccess(requestWith(header));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Unauthorized wallet address');
  });

  it('rejects invalid signature from admin address', async () => {
    const ts = Date.now();
    // Sign a different message so recovered address won't match, but the
    // signature is still structurally valid.
    const wrongSig = await admin.signMessage({ message: 'not the admin message' });
    const header = `${ADMIN_ADDRESS}:${ts}:${wrongSig}`;
    const result = await verifyAdminAccess(requestWith(header));
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid signature');
  });

  it('does not consume the nonce on invalid signature', async () => {
    const ts = Date.now();
    const wrongSig = await admin.signMessage({ message: 'wrong message' });
    const badHeader = `${ADMIN_ADDRESS}:${ts}:${wrongSig}`;
    const rejected = await verifyAdminAccess(requestWith(badHeader));
    expect(rejected.valid).toBe(false);

    // A later legitimate signature for the same timestamp should still succeed,
    // proving the bad attempt did not burn the nonce.
    const goodHeader = await makeAuthHeader(ts);
    const accepted = await verifyAdminAccess(requestWith(goodHeader));
    expect(accepted.valid).toBe(true);
  });
});
