import { getDatabase } from '@/lib/db';
import { NextResponse } from 'next/server';

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

const LIMITS: Record<string, RateLimitConfig> = {
  'companion/init': { maxRequests: 10, windowSeconds: 60 },
  'companion/select': { maxRequests: 10, windowSeconds: 60 },
  'companion/switch': { maxRequests: 10, windowSeconds: 60 },
  'companion/interact': { maxRequests: 20, windowSeconds: 60 },
  'companion/send-to-activity': { maxRequests: 10, windowSeconds: 60 },
  'companion/complete-activity': { maxRequests: 10, windowSeconds: 60 },
  'companion/training': { maxRequests: 20, windowSeconds: 60 },
  'companion/chat': { maxRequests: 30, windowSeconds: 60 },
  'quests/claim': { maxRequests: 10, windowSeconds: 60 },
};

let cleanupCounter = 0;

export function checkRateLimit(
  walletAddress: string,
  endpoint: string,
): { allowed: boolean; retryAfter?: number } {
  const config = LIMITS[endpoint];
  if (!config) return { allowed: true };

  const db = getDatabase();
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = nowSec - config.windowSeconds;

  cleanupCounter++;
  if (cleanupCounter >= 50) {
    cleanupCounter = 0;
    db.prepare(
      'DELETE FROM sanctuary_rate_limits WHERE created_at < ?',
    ).run(nowSec - 300);
  }

  const result = db.prepare(
    'SELECT COUNT(*) as count FROM sanctuary_rate_limits WHERE wallet_address = ? AND endpoint = ? AND created_at >= ?',
  ).get(walletAddress, endpoint, windowStart) as { count: number };

  if (result.count >= config.maxRequests) {
    const oldest = db.prepare(
      'SELECT created_at FROM sanctuary_rate_limits WHERE wallet_address = ? AND endpoint = ? AND created_at >= ? ORDER BY created_at ASC LIMIT 1',
    ).get(walletAddress, endpoint, windowStart) as { created_at: number } | undefined;

    const retryAfter = oldest
      ? Math.max(1, oldest.created_at + config.windowSeconds - nowSec)
      : config.windowSeconds;

    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}

export function recordRequest(walletAddress: string, endpoint: string): void {
  const db = getDatabase();
  db.prepare(
    'INSERT INTO sanctuary_rate_limits (wallet_address, endpoint, created_at) VALUES (?, ?, ?)',
  ).run(walletAddress, endpoint, Math.floor(Date.now() / 1000));
}

export function applyRateLimit(
  walletAddress: string,
  endpoint: string,
): NextResponse | null {
  const check = checkRateLimit(walletAddress, endpoint);
  if (!check.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(check.retryAfter) },
      },
    );
  }
  recordRequest(walletAddress, endpoint);
  return null;
}
