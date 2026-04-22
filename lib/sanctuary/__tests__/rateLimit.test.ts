import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { WALLETS } from './fixtures';

let testDb: Database.Database;

vi.mock('@/lib/db', () => ({
  getDatabase: () => testDb,
}));

import { checkRateLimit, recordRequest, applyRateLimit } from '../rateLimit';

function createRateLimitDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'scripts', 'init-sanctuary-rate-limits.sql'),
    'utf-8',
  );
  db.exec(sql);
  return db;
}

describe('SQLite Rate Limiter', () => {
  beforeEach(() => {
    testDb = createRateLimitDb();
  });

  it('allows requests under the limit', () => {
    const result = checkRateLimit(WALLETS.alice, 'companion/chat');
    expect(result.allowed).toBe(true);
  });

  it('records requests and counts them', () => {
    for (let i = 0; i < 5; i++) {
      recordRequest(WALLETS.alice, 'companion/chat');
    }
    const count = testDb
      .prepare('SELECT COUNT(*) as count FROM sanctuary_rate_limits WHERE wallet_address = ?')
      .get(WALLETS.alice) as { count: number };
    expect(count.count).toBe(5);
  });

  it('blocks requests at the limit', () => {
    for (let i = 0; i < 30; i++) {
      recordRequest(WALLETS.alice, 'companion/chat');
    }
    const result = checkRateLimit(WALLETS.alice, 'companion/chat');
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('isolates limits per endpoint', () => {
    for (let i = 0; i < 10; i++) {
      recordRequest(WALLETS.alice, 'companion/init');
    }
    const initCheck = checkRateLimit(WALLETS.alice, 'companion/init');
    expect(initCheck.allowed).toBe(false);

    const chatCheck = checkRateLimit(WALLETS.alice, 'companion/chat');
    expect(chatCheck.allowed).toBe(true);
  });

  it('isolates limits per wallet', () => {
    for (let i = 0; i < 10; i++) {
      recordRequest(WALLETS.alice, 'companion/init');
    }
    const aliceCheck = checkRateLimit(WALLETS.alice, 'companion/init');
    expect(aliceCheck.allowed).toBe(false);

    const bobCheck = checkRateLimit(WALLETS.bob, 'companion/init');
    expect(bobCheck.allowed).toBe(true);
  });

  it('allows requests after window expires', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const oldTimestamp = nowSec - 120;

    for (let i = 0; i < 10; i++) {
      testDb
        .prepare('INSERT INTO sanctuary_rate_limits (wallet_address, endpoint, created_at) VALUES (?, ?, ?)')
        .run(WALLETS.alice, 'companion/init', oldTimestamp);
    }

    const result = checkRateLimit(WALLETS.alice, 'companion/init');
    expect(result.allowed).toBe(true);
  });

  it('returns null from applyRateLimit when allowed', () => {
    const result = applyRateLimit(WALLETS.alice, 'companion/chat');
    expect(result).toBeNull();
  });

  it('returns 429 response from applyRateLimit when blocked', () => {
    for (let i = 0; i < 30; i++) {
      recordRequest(WALLETS.alice, 'companion/chat');
    }
    const result = applyRateLimit(WALLETS.alice, 'companion/chat');
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it('returns allowed for unknown endpoints', () => {
    const result = checkRateLimit(WALLETS.alice, 'unknown/endpoint');
    expect(result.allowed).toBe(true);
  });
});
