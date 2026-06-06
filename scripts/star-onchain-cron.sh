#!/usr/bin/env bash
# [SWO_V2_SANCTUARY_STAR_ONCHAIN] Drain the STAR on-chain outbox (auto mint/burn).
# Reads CRON_SECRET from the DEV .env.local and POSTs the worker. Run on a short
# interval so earned/spent STAR mirrors on-chain within ~a minute. Logs to logs/.
set -euo pipefail
DEV_DIR="${SWO_DEV_DIR:-/opt/star_world_order/DEV}"
PORT="${SWO_DEV_PORT:-3081}"
SECRET=$(grep -E '^CRON_SECRET=' "$DEV_DIR/.env.local" | cut -d= -f2- | tr -d '"')
[ -z "$SECRET" ] && { echo "no CRON_SECRET"; exit 1; }
mkdir -p "$DEV_DIR/logs"
curl -s -m 90 -X POST "http://127.0.0.1:$PORT/api/sanctuary/star/process-onchain" \
  -H "Authorization: Bearer $SECRET" \
  >> "$DEV_DIR/logs/star-onchain.log" 2>&1
echo "" >> "$DEV_DIR/logs/star-onchain.log"
