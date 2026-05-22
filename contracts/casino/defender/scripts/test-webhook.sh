#!/usr/bin/env bash
# Cosmic Casino — synthetic Telegram alert.
#
# Fires one message via the SWO ops bot to the operator chat to satisfy the
# [SWO_CASINO_DEFENDER_ACTION_TELEGRAM] acceptance ("smoke alert (manually
# triggered) reaches the SWO ops chat").
#
# This bypasses Defender entirely: it talks to api.telegram.org directly with
# the same secrets the autotask uses. If THIS works, the `telegram-forwarder`
# Action will deliver real Defender Monitor alerts.
#
# Usage:
#   SWO_OPS_TELEGRAM_BOT_TOKEN=... SWO_OPS_TELEGRAM_CHAT_ID=... \
#     bash defender/scripts/test-webhook.sh
#
# Exit codes:
#   0 — Telegram returned ok:true for both messages
#   1 — env missing
#   2 — Telegram returned non-ok / HTTP error
set -euo pipefail

: "${SWO_OPS_TELEGRAM_BOT_TOKEN:?need SWO_OPS_TELEGRAM_BOT_TOKEN env}"
: "${SWO_OPS_TELEGRAM_CHAT_ID:?need SWO_OPS_TELEGRAM_CHAT_ID env}"

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
text=$(cat <<EOF
🧪 *Cosmic Casino Defender — synthetic alert*
${ts}

This is a one-off test from \`defender/scripts/test-webhook.sh\`. If you can
read this, the bot token + chat id are wired correctly and the
\`telegram-forwarder\` Action will be able to deliver real alerts to the SWO
ops chat.

Monitors expected to deliver here once provisioned (Monad testnet, chain 10143):
  1. BetPlaced rate spike (>10/min/address)
  2. Owner-key actions (Pause/Unpause/GameRegistered/GameRevoked/setGameAllowance)
  3. Bankroll MON balance < 10% of INITIAL_DEPOSIT (2e14 wei)
  4. 24h PnL drawdown > 50% of maxDrawdown24hWei (early warning at 50% of breaker)
EOF
)

send_msg() {
  local msg="$1"
  curl -fsS -X POST "https://api.telegram.org/bot${SWO_OPS_TELEGRAM_BOT_TOKEN}/sendMessage" \
    -H 'Content-Type: application/json' \
    -d "$(jq -nc \
          --arg c "$SWO_OPS_TELEGRAM_CHAT_ID" \
          --arg t "$msg" \
          '{chat_id:$c, text:$t, parse_mode:"Markdown", disable_web_page_preview:true}')"
}

resp=$(send_msg "$text")
if echo "$resp" | jq -e '.ok == true' >/dev/null; then
  echo "OK — Telegram delivered (overview). message_id=$(echo "$resp" | jq -r '.result.message_id')"
else
  echo "FAIL — Telegram response (overview):"
  echo "$resp" | jq .
  exit 2
fi

# --- Synthetic 24h PnL early-warning ----------------------------------------
# Numbers below are illustrative: max=2e15 wei (default = INITIAL_DEPOSIT/2),
# windowStart=2e15 wei, current=8e14 wei → drawdown=1.2e15 wei. Early-warning
# threshold = max/2 = 1e15 wei. drawdown > threshold ⇒ alert fires.
pnl_msg=$(cat <<'EOF'
📉 *Casino: 24h PnL early-warning*  _(synthetic test — IGNORE if not provisioning)_
bankroll: `0x33C5B6a95e71611F5dC821A74DDAD0F746fF2dFf`
24h window-start balance: 0.002000 MON
current balance:          0.000800 MON
drawdown:                 0.001200 MON
early-warning threshold (50% of max):  0.001000 MON
auto-trip threshold (maxDrawdown24hWei): 0.002000 MON
breaker: *ARMED*

Tripping rule: alert fires when 24h drawdown > 50% of `maxDrawdown24hWei`.
The on-chain breaker auto-trips at 100%. This is an early warning so the
operator has a 50% buffer to investigate before games auto-halt.
EOF
)
resp2=$(send_msg "$pnl_msg")
if echo "$resp2" | jq -e '.ok == true' >/dev/null; then
  echo "OK — Telegram delivered (24h PnL synthetic). message_id=$(echo "$resp2" | jq -r '.result.message_id')"
  exit 0
else
  echo "FAIL — Telegram response (24h PnL synthetic):"
  echo "$resp2" | jq .
  exit 2
fi
