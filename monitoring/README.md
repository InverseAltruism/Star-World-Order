# Monitoring

This directory holds outputs from out-of-band monitoring jobs. Files are
write-only from cron — no application code reads from here.

## Casino keeper health (`casino_keeper_health.log`)

Append-only JSON-lines log produced by `scripts/casino/keeperHealthMonitor.ts`,
which polls `/api/casino/health` every 5 minutes. Each line records:

```json
{
  "ts": "2026-05-21T19:00:00.000Z",
  "healthUrl": "https://.../api/casino/health",
  "rawStatus": "ok | keeper_offline | http_503 | fetch_AbortError | ...",
  "isOnline": true,
  "consecutiveOffline": 0,
  "action": "none | alert_offline | alert_healed",
  "message": "keeper online",
  "telegram": "skipped | sent | failed:<reason>"
}
```

Alerts fire when `isOnline === false` for ≥2 consecutive checks (~10 min)
and self-heal when the keeper returns to online. See
`lib/casino/keeperHealthMonitor.ts` for the decision logic and
`.github/workflows/casino-keeper-health.yml` for the scheduling.

The companion `.keeper-state.json` (not committed) holds the consecutive
counter between runs; in GitHub Actions it is persisted via `actions/cache`.

## Running locally

```sh
CASINO_HEALTH_URL=http://localhost:3000/api/casino/health \
TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... \
  npx tsx scripts/casino/keeperHealthMonitor.ts
```

Set `KEEPER_DRY_RUN=1` to suppress the Telegram POST while still
exercising the rest of the pipeline.
