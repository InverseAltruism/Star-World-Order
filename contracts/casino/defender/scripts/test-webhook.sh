#!/usr/bin/env bash
# Smoke-test the SWO Casino Telegram bot end-to-end WITHOUT going through Defender.
#
# Usage:
#   SWO_CASINO_TELEGRAM_BOT_TOKEN=... SWO_CASINO_TELEGRAM_CHAT_ID=... \
#     bash contracts/casino/defender/scripts/test-webhook.sh
#
# Expects a Markdown-formatted message in the operator chat. If the call fails
# with 401 the token is wrong; with 400 (`chat not found`) the chat id is wrong
# or the bot hasn't been added to the chat.
set -euo pipefail

: "${SWO_CASINO_TELEGRAM_BOT_TOKEN:?SWO_CASINO_TELEGRAM_BOT_TOKEN must be set}"
: "${SWO_CASINO_TELEGRAM_CHAT_ID:?SWO_CASINO_TELEGRAM_CHAT_ID must be set}"

TEXT='🧪 *SWO Casino Defender smoke test*
This is a synthetic alert sent by `contracts/casino/defender/scripts/test-webhook.sh`.
If you see this message, the Telegram bot token + chat id are correctly configured.'

curl -fsS \
  -X POST "https://api.telegram.org/bot${SWO_CASINO_TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H 'Content-Type: application/json' \
  --data "$(cat <<JSON
{
  "chat_id": "${SWO_CASINO_TELEGRAM_CHAT_ID}",
  "text": $(printf '%s' "$TEXT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),
  "parse_mode": "Markdown",
  "disable_web_page_preview": true
}
JSON
)" | python3 -m json.tool
