import { getDatabase } from '@/lib/db';

export interface ChatUsageRecord {
  walletAddress: string;
  tokenId: number;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  wasDryRun: boolean;
}

export const DAILY_CHAT_LIMIT = Number(process.env.SANCTUARY_CHAT_DAILY_LIMIT ?? 15);

export function utcDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getDailyChatUsage(walletAddress: string, dateUtc: string = utcDateString()): {
  count: number;
  totalTokens: number;
  totalCostUsd: number;
} {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT
      COUNT(*) AS count,
      COALESCE(SUM(total_tokens), 0) AS totalTokens,
      COALESCE(SUM(estimated_cost_usd), 0) AS totalCostUsd
    FROM sanctuary_chat_usage
    WHERE wallet_address = ?
      AND usage_date = ?
      AND was_dry_run = 0
  `).get(walletAddress.toLowerCase(), dateUtc) as {
    count: number;
    totalTokens: number;
    totalCostUsd: number;
  };
  return {
    count: row?.count ?? 0,
    totalTokens: row?.totalTokens ?? 0,
    totalCostUsd: row?.totalCostUsd ?? 0,
  };
}

export function recordChatUsage(record: ChatUsageRecord): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO sanctuary_chat_usage
      (wallet_address, token_id, usage_date, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, was_dry_run)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.walletAddress.toLowerCase(),
    record.tokenId,
    utcDateString(),
    record.model,
    record.promptTokens,
    record.completionTokens,
    record.totalTokens,
    record.estimatedCostUsd,
    record.wasDryRun ? 1 : 0,
  );
}

export function checkDailyChatLimit(walletAddress: string): {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
} {
  const limit = DAILY_CHAT_LIMIT;
  const { count } = getDailyChatUsage(walletAddress);
  const remaining = Math.max(0, limit - count);
  return {
    allowed: count < limit,
    used: count,
    limit,
    remaining,
  };
}
