#!/usr/bin/env tsx
/**
 * Casino keeper health monitor — wire-side.
 *
 * Polls the configured `/api/casino/health` endpoint, persists the
 * consecutive-offline counter to a state file, sends Telegram alerts on
 * threshold breach and recovery, and appends a structured line to
 * `monitoring/casino_keeper_health.log` for every check.
 *
 * Designed to run as:
 *   - GitHub Actions cron (every 5 min) — see `.github/workflows/casino-keeper-health.yml`
 *   - A systemd timer or any external scheduler — invoke directly with
 *     `npx tsx scripts/casino/keeperHealthMonitor.ts`
 *   - OpenZeppelin Defender Autotask — port the same logic; the alerting
 *     contract is decoupled from the runtime.
 *
 * Env vars (all optional except in production):
 *   CASINO_HEALTH_URL       — full URL to /api/casino/health (default: http://localhost:3000/api/casino/health)
 *   CASINO_HEALTH_TIMEOUT_MS — fetch timeout (default 8000)
 *   KEEPER_STATE_FILE       — path to JSON state file (default: monitoring/.keeper-state.json)
 *   KEEPER_LOG_FILE         — path to log (default: monitoring/casino_keeper_health.log)
 *   TELEGRAM_BOT_TOKEN      — bot token; when absent, alerts log only
 *   TELEGRAM_CHAT_ID        — chat id to receive alerts
 *   KEEPER_DRY_RUN          — when "1", skip the Telegram POST
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  type HealthAction,
  type KeeperHealthState,
  evaluateHealthCheck,
  initialState,
  parseKeeperOnline,
} from '../../lib/casino/keeperHealthMonitor';

const DEFAULT_HEALTH_URL = 'http://localhost:3000/api/casino/health';
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_STATE_FILE = 'monitoring/.keeper-state.json';
const DEFAULT_LOG_FILE = 'monitoring/casino_keeper_health.log';

interface HealthFetchResult {
  isOnline: boolean;
  rawStatus: string;
}

async function fetchHealth(url: string, timeoutMs: number): Promise<HealthFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'casino-keeper-health-monitor/1.0' },
    });
    if (!res.ok) {
      return { isOnline: false, rawStatus: `http_${res.status}` };
    }
    const body = await res.json().catch(() => null);
    const isOnline = parseKeeperOnline(body);
    return { isOnline, rawStatus: isOnline ? 'ok' : 'keeper_offline' };
  } catch (err) {
    const reason = err instanceof Error ? err.name : 'unknown_error';
    return { isOnline: false, rawStatus: `fetch_${reason}` };
  } finally {
    clearTimeout(timer);
  }
}

async function readState(stateFile: string): Promise<KeeperHealthState> {
  try {
    const raw = await fs.readFile(stateFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      // Trust the shape — this file is only written by us. If a future
      // schema bump introduces fields, missing ones default sensibly.
      return {
        consecutiveOffline: Number(parsed.consecutiveOffline) || 0,
        alertedOffline: parsed.alertedOffline === true,
        lastCheckTimestamp:
          typeof parsed.lastCheckTimestamp === 'number'
            ? parsed.lastCheckTimestamp
            : undefined,
        lastStatus:
          parsed.lastStatus === 'online' || parsed.lastStatus === 'offline'
            ? parsed.lastStatus
            : undefined,
      };
    }
  } catch {
    // First run, or corrupted file — fall back to a clean slate.
  }
  return initialState();
}

async function writeState(stateFile: string, state: KeeperHealthState): Promise<void> {
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2), 'utf8');
}

async function appendLog(logFile: string, line: string): Promise<void> {
  await fs.mkdir(path.dirname(logFile), { recursive: true });
  await fs.appendFile(logFile, line + '\n', 'utf8');
}

async function sendTelegram(text: string): Promise<{ sent: boolean; reason?: string }> {
  if (process.env.KEEPER_DRY_RUN === '1') {
    return { sent: false, reason: 'dry_run' };
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { sent: false, reason: 'telegram_not_configured' };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      return { sent: false, reason: `telegram_http_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      reason: `telegram_error_${err instanceof Error ? err.name : 'unknown'}`,
    };
  }
}

function alertText(action: HealthAction, message: string, healthUrl: string): string {
  switch (action) {
    case 'alert_offline':
      return `[SWO] casino keeper OFFLINE — ${message} (source: ${healthUrl})`;
    case 'alert_healed':
      return `[SWO] casino keeper RECOVERED — ${message}`;
    default:
      return message;
  }
}

async function main(): Promise<number> {
  const healthUrl = process.env.CASINO_HEALTH_URL ?? DEFAULT_HEALTH_URL;
  const timeoutMs = Number(process.env.CASINO_HEALTH_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const stateFile = process.env.KEEPER_STATE_FILE ?? DEFAULT_STATE_FILE;
  const logFile = process.env.KEEPER_LOG_FILE ?? DEFAULT_LOG_FILE;

  const prevState = await readState(stateFile);
  const fetched = await fetchHealth(healthUrl, timeoutMs);
  const now = Date.now();
  const outcome = evaluateHealthCheck(prevState, fetched.isOnline, now);

  let alertResult: { sent: boolean; reason?: string } = { sent: false };
  if (outcome.action !== 'none') {
    alertResult = await sendTelegram(alertText(outcome.action, outcome.message, healthUrl));
  }

  await writeState(stateFile, outcome.newState);

  const logEntry = {
    ts: new Date(now).toISOString(),
    healthUrl,
    rawStatus: fetched.rawStatus,
    isOnline: fetched.isOnline,
    consecutiveOffline: outcome.newState.consecutiveOffline,
    action: outcome.action,
    message: outcome.message,
    telegram: outcome.action === 'none' ? 'skipped' : alertResult.sent ? 'sent' : `failed:${alertResult.reason ?? 'unknown'}`,
  };
  await appendLog(logFile, JSON.stringify(logEntry));

  // Console output so the cron runner surfaces the result in its job log.
  console.log(JSON.stringify(logEntry));

  // Non-zero exit only when we both observed offline AND failed to alert —
  // useful as a secondary signal (cron-failure email) if Telegram is broken.
  if (outcome.action === 'alert_offline' && !alertResult.sent && process.env.KEEPER_DRY_RUN !== '1') {
    return 2;
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('keeperHealthMonitor crashed:', err);
    process.exit(1);
  });
