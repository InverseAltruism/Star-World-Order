#!/usr/bin/env bash
# Smoke-test the SWO Casino Telegram bot end-to-end WITHOUT going through Defender.
#
# Usage:
#   SWO_CASINO_TELEGRAM_BOT_TOKEN=... SWO_CASINO_TELEGRAM_CHAT_ID=... \
#     bash contracts/casino/defender/scripts/test-webhook.sh
#
# Legacy compatibility aliases are also accepted:
#   SWO_OPS_TELEGRAM_BOT_TOKEN / SWO_OPS_TELEGRAM_CHAT_ID
set -euo pipefail

BOT_TOKEN="${SWO_CASINO_TELEGRAM_BOT_TOKEN:-${SWO_OPS_TELEGRAM_BOT_TOKEN:-}}"
CHAT_ID="${SWO_CASINO_TELEGRAM_CHAT_ID:-${SWO_OPS_TELEGRAM_CHAT_ID:-}}"
: "${BOT_TOKEN:?SWO_CASINO_TELEGRAM_BOT_TOKEN (or legacy SWO_OPS_TELEGRAM_BOT_TOKEN) must be set}"
: "${CHAT_ID:?SWO_CASINO_TELEGRAM_CHAT_ID (or legacy SWO_OPS_TELEGRAM_CHAT_ID) must be set}"

send_msg() {
  local msg="$1"
  curl -fsS \
    -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H 'Content-Type: application/json' \
    --data "$(python3 - <<PY
import json
print(json.dumps({
  'chat_id': '''${CHAT_ID}''',
  'text': '''${msg}''',
  'parse_mode': 'Markdown',
  'disable_web_page_preview': True,
}))
PY
)"
}

TEXT='🧪 *SWO Casino Defender smoke test*
This is a synthetic alert sent by `contracts/casino/defender/scripts/test-webhook.sh`.
If you see this message, the Telegram bot token + chat id are correctly configured.'

send_msg "$TEXT" | python3 -m json.tool

PNL_TEXT='📉 *SWO Casino: 24h PnL early-warning* _(synthetic test)_
bankroll: `0x33C5B6a95e71611F5dC821A74DDAD0F746fF2dFf`
24h window-start balance: 0.020000 MON
current balance:          0.008000 MON
drawdown:                 0.012000 MON
early-warning threshold (50% of max):  0.010000 MON
auto-trip threshold (maxDrawdown24hWei): 0.020000 MON
breaker: *ARMED*

Synthetic message only — validates Markdown formatting and routing.'

send_msg "$PNL_TEXT" | python3 -m json.tool
