<<<<<<< HEAD
# Cosmic Casino — Defender wiring

OpenZeppelin Defender 2.0 Action(s) for the Cosmic Casino contracts on Monad.
This directory currently ships only the Telegram-forwarding Action; the four
Monitor JSONs are tracked separately by `[SWO_CASINO_DEFENDER_MONITORS_PORT]`.

> Status: **operator-gated** — the Defender team / org token is not in the
> agent's environment. The action file is meant to be uploaded into the
> Defender web UI (Manage → Actions → New Action → paste the file body) by
> the operator, who also provisions the secrets and (for the on-chain read
> routes) attaches a `monad-testnet` Relayer.
=======
# SWO Casino Defender 2.0 wiring

Monitor + Action configs for OpenZeppelin Defender 2.0, watching the live
Monad-testnet deploys (chain `10143`) and forwarding alerts to the operator
Telegram chat.

> Status: **operator-gated** — the Defender team / org token is not in the
> agent's environment. Run `scripts/deploy-monitors.ts --apply` only after the
> operator has provisioned the team and exported `DEFENDER_API_KEY` /
> `DEFENDER_API_SECRET` plus the `SWO_CASINO_TELEGRAM_*` secrets in the
> Defender web UI.
>>>>>>> upstream/dev

## Layout

```
<<<<<<< HEAD
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
=======
contracts/casino/defender/
├── README.md                                    ← this file
├── monitors/
│   ├── 01-betplaced-rate-spike.json            ← >10 BetPlaced/60s/player
│   ├── 02-owner-key-actions.json               ← Pause/Unpause/Game lifecycle
│   ├── 03-bankroll-balance-threshold.json      ← bankroll < 2e15 wei
│   └── 04-pnl-monitor-24h.json                 ← STAT, every 15 min: 24h PnL early warning
├── actions/
│   └── telegram-forwarder.ts                   ← single autotask, routes by monitor name + scheduled
└── scripts/
    ├── deploy-monitors.ts                      ← idempotent deploy via Defender SDK
    └── test-webhook.sh                         ← synthetic Telegram test (no Defender)
```

## What each monitor catches

| Monitor | Type | Trigger | Routing in `telegram-forwarder` |
|---|---|---|---|
| `01-betplaced-rate-spike` | BLOCK | every `BetPlaced(...)` on CosmicFlip + GravityDice | sliding 60s window per `player`; alert iff > 10 |
| `02-owner-key-actions` | BLOCK | `Paused` / `Unpaused` / `GameRegistered` / `GameRevoked` / `GameAllowanceSet` events + `setGameAllowance(...)` calls on bankroll OR any game | forward immediately on every match (P0) |
| `03-bankroll-balance-threshold` | BLOCK | `Withdrawn` or `GamePayout` event on bankroll | live `bankroll.balance()` via Relayer; alert iff < 2e15 wei |
| `04-pnl-monitor-24h` | STAT (sched.) | cron `*/15 * * * *` — provisioned as `swo-casino-pnl-watcher` Action | live `bankroll.circuitBreakerState()` via Relayer; alert iff `windowStartBalance − currentBalance > maxDrawdown24hWei / 2` (50% of breaker) |

## Watched addresses (monad-testnet, chain 10143)

Read from `contracts/casino/deployments/10143.json`:

| Contract | Address |
|---|---|
| `CasinoBankroll` | `0x33C5B6a95e71611F5dC821A74DDAD0F746fF2dFf` |
| `CosmicFlip` | `0x064b8bfc03b23D2b525deD9d3969090347A21983` |
| `GravityDice` | `0xAC023542A8168465EE4A1b3e8Ae0f58F36A6d84B` |
| `ConstellationClimb` | `0xd9B9b6c37ad4f3D5b07ae76dE261c5C865600d6e` |

## Setup checklist (operator)

1. Create a Defender team (free tier OK for testnet) and an API key with
   Manage permissions on Monitors, Actions, Notifications, Relayers.
2. Export to local shell:
   ```bash
   export DEFENDER_API_KEY=<...>
   export DEFENDER_API_SECRET=<...>
   ```
3. In the Defender UI, **Manage → Secrets**, add:
   - `SWO_CASINO_TELEGRAM_BOT_TOKEN` — bot owning the operator chat
   - `SWO_CASINO_TELEGRAM_CHAT_ID`   — operator chat id
   - Legacy fallback also accepted by the Action/smoke-test: `SWO_OPS_TELEGRAM_BOT_TOKEN` / `SWO_OPS_TELEGRAM_CHAT_ID`
4. **Manage → Relayers**: provision a Relayer on `monad-testnet` (chain id
   `10143`, RPC `https://testnet-rpc.monad.xyz`). Attach it to the
   `swo-casino-telegram-forwarder` Action (the drawdown route uses it for
   `eth_call` against `bankroll.balance()`). The same Relayer is reused by the
   scheduled `swo-casino-pnl-watcher` Action.
5. Pack + upload the autotask:
   ```bash
   npx @openzeppelin/defender-actions-cli pack \
     contracts/casino/defender/actions/telegram-forwarder.ts
   ```
   Replace the `encodeAction()` stub in `deploy-monitors.ts` with the produced
   base64 (or wire it to `defender-actions-cli upload` directly — see TODO in
   that file).
6. Dry-run, then apply:
   ```bash
   npx tsx contracts/casino/defender/scripts/deploy-monitors.ts --dry-run
   npx tsx contracts/casino/defender/scripts/deploy-monitors.ts --apply
   ```
7. Fire a synthetic alert to confirm Telegram works end-to-end:
   ```bash
   SWO_CASINO_TELEGRAM_BOT_TOKEN=... SWO_CASINO_TELEGRAM_CHAT_ID=... \
     bash contracts/casino/defender/scripts/test-webhook.sh
   ```
   Expect a Markdown-formatted message in the operator chat.

## Operator-driven install (per monitor)

If you'd rather click through the Defender UI instead of running the script:

1. **Monitor 01 — BetPlaced rate spike**
   - New Monitor → Block Monitor → network `monad-testnet`.
   - Addresses: paste both `CosmicFlip` and `GravityDice` from
     `deployments/10143.json` (or copy from `monitors/01-betplaced-rate-spike.json`).
   - ABI: copy the `abi` field from the JSON.
   - Event condition: `BetPlaced(uint256,address,uint8,uint256,bytes32,bytes32,uint256,uint64)`.
   - Notification channel: select `swo-casino-telegram-webhook` (create it once
     pointing to the `swo-casino-telegram-forwarder` Action's webhook URL).

2. **Monitor 02 — Owner-key actions**
   - Addresses: bankroll + all three games (4 addresses total).
   - Event conditions: `Paused`, `Unpaused`, `GameRegistered`,
     `GameRevoked`, `GameAllowanceSet`.
   - Function condition: `setGameAllowance(address,uint256)`.
   - `alertThreshold = 1 / 60s` — fire on every match.

3. **Monitor 03 — Bankroll MON balance threshold**
   - Address: bankroll only.
   - Event conditions: `Withdrawn`, `GamePayout` (the only outflow paths).
   - The action does the live `balance()` check; alert only fires if balance
     drops below 2e15 wei.

4. **Monitor 04 — 24h PnL early warning (STAT)**
   - This is NOT a Block Monitor in the UI. Create a scheduled **Action**
     named `swo-casino-pnl-watcher`, cron `*/15 * * * *`, sharing the same
     packaged source as `swo-casino-telegram-forwarder`. The handler routes
     scheduled invocations to `handlePnlCheck()`.

## Updating after a redeploy

Every game-only redeploy changes the cosmicFlip / gravityDice /
constellationClimb addresses. Workflow:

1. Re-run the deploy script and let it overwrite `deployments/10143.json`.
2. Edit `addresses` in `monitors/01-betplaced-rate-spike.json` and
   `monitors/02-owner-key-actions.json` to the new game addresses.
3. `npx tsx contracts/casino/defender/scripts/deploy-monitors.ts --apply`
   (idempotent).

The bankroll address is stable across game redeploys, so monitors `03` and `04`
only watch the bankroll and don't need editing unless the bankroll itself is
re-deployed.

## 24h PnL early-warning thresholds

`04-pnl-monitor-24h.json` does NOT replace the on-chain circuit-breaker —
it gives the operator a 50% headroom signal *before* the breaker auto-trips:

- The contract auto-trips at `windowStartBalance − currentBalance ≥ maxDrawdown24hWei` (100%).
- The 24h PnL monitor alerts at 50% of that: `drawdown > maxDrawdown24hWei / 2`.
- Default `maxDrawdown24hWei` = `1e16` wei (set by `Deploy.s.sol`; current
  testnet value recorded in `deployments/10143.json`), override via
  `CASINO_MAX_DRAWDOWN_24H` env at deploy time.
- Setting `maxDrawdown24hWei = 0` disables both auto-trip and the 24h PnL
  alert (the action returns `pnl_disabled` rather than spamming).
>>>>>>> upstream/dev
