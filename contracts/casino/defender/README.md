# Cosmic Casino — Defender wiring

OpenZeppelin Defender 2.0 Action(s) for the Cosmic Casino contracts on Monad.
This directory currently ships only the Telegram-forwarding Action; the four
Monitor JSONs are tracked separately by `[SWO_CASINO_DEFENDER_MONITORS_PORT]`.

> Status: **operator-gated** — the Defender team / org token is not in the
> agent's environment. The action file is meant to be uploaded into the
> Defender web UI (Manage → Actions → New Action → paste the file body) by
> the operator, who also provisions the secrets and (for the on-chain read
> routes) attaches a `monad-testnet` Relayer.

## Layout

```
defender/
├── README.md                       ← this file
├── actions/
│   └── telegram-forwarder.ts       ← single autotask, routes by monitor name + scheduled
└── scripts/
    └── test-webhook.sh             ← synthetic Telegram smoke test (no Defender)
```

## Routing in `telegram-forwarder`

| Monitor name (substring) | Trigger | Behaviour |
|---|---|---|
| `BetPlaced rate spike` | every `BetPlaced(...)` on a Casino game | 60s sliding window per `player`; alert iff > 10 |
| `Owner-key actions` | `Paused` / `Unpaused` / `GameRegistered` / `GameRevoked` / `GameAllowanceSet` | forward immediately on every match (P0) |
| `Bankroll MON balance` (or legacy `Bankroll ETH balance`) | `Withdrawn` or `GamePayout` event on bankroll | live `bankroll.balance()` via Relayer; alert iff < 2e14 wei |
| `24h PnL` *(scheduled, no monitor payload)* | cron `*/15 * * * *` Action trigger | live `bankroll.circuitBreakerState()` via Relayer; alert iff `windowStartBalance − currentBalance > maxDrawdown24hWei / 2` |

The Action only inspects the substring of `event.request.body.sentinel.name`
(or `body.monitor.name`), so the leading prefix on the monitor names is
flexible. Use whichever convention the operator prefers in the Defender UI.

## Environment / secret variables

The Defender Action reads two secrets from `event.secrets` — these are
configured in **Defender → Manage → Secrets**, not in any repo `.env` file:

| Secret name | Purpose |
|---|---|
| `SWO_OPS_TELEGRAM_BOT_TOKEN` | Bot token for the bot that owns the SWO ops chat. Format: `123456789:ABC...` |
| `SWO_OPS_TELEGRAM_CHAT_ID` | Numeric chat id of the SWO ops Telegram group / channel. Format: `-1001234567890` for supergroups, positive integer for DMs. |

For local smoke-testing (see below), the same two variables are read from the
shell environment by `defender/scripts/test-webhook.sh`.

If either secret is missing at Action runtime the handler throws
`Missing SWO_OPS_TELEGRAM_BOT_TOKEN or SWO_OPS_TELEGRAM_CHAT_ID secret` — the
Defender run log will surface that error to the operator.

> These secrets are *distinct* from the `TELEGRAM_BOT_TOKEN` /
> `TELEGRAM_CHAT_ID` env vars used by `scripts/casino/keeperHealthMonitor.ts`.
> The keeper health monitor runs out-of-band from GitHub Actions and may
> point at a different bot/chat than the on-chain Defender alerts; keeping
> the names separate avoids accidentally cross-wiring the two pipelines.

## Setup checklist (operator)

1. Create a Defender team and an API key with Manage permissions on
   Monitors, Actions, Notifications, Relayers.
2. **Manage → Secrets**, add:
   - `SWO_OPS_TELEGRAM_BOT_TOKEN` — bot owning the SWO ops chat
   - `SWO_OPS_TELEGRAM_CHAT_ID`   — chat id (group or channel)
3. **Manage → Relayers**: provision a Relayer on `monad-testnet`. Attach
   it to the `swo-casino-telegram-forwarder` Action (the drawdown + 24h PnL
   routes use it for `eth_call` against the bankroll).
4. **Manage → Actions → New Action**:
   - Name: `swo-casino-telegram-forwarder`
   - Runtime: Node.js
   - Trigger: Webhook (for monitors) AND Schedule `*/15 * * * *` (for 24h PnL)
   - Body: paste `defender/actions/telegram-forwarder.ts` (or pack with
     `@openzeppelin/defender-actions-cli` and upload)
   - Attach the Relayer from step 3
5. Fire a synthetic alert to confirm Telegram works end-to-end:
   ```bash
   SWO_OPS_TELEGRAM_BOT_TOKEN=... SWO_OPS_TELEGRAM_CHAT_ID=... \
     bash defender/scripts/test-webhook.sh
   ```
   Expect two Markdown-formatted messages in the SWO ops chat (an
   overview and a synthetic 24h PnL early-warning). Both must return
   `ok: true` from the Telegram API.

## Updating after a redeploy

Every game-only redeploy changes the per-game addresses but leaves the
bankroll address stable. The Action only hard-codes the bankroll
(`BANKROLL_ADDR` at the top of `telegram-forwarder.ts`); if the bankroll
itself is redeployed (Phase 3 mainnet cutover or governance migration),
update that constant and re-upload the Action.
