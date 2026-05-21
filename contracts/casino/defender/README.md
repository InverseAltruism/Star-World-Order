# SWO Casino Defender 2.0 wiring

Monitor + Action configs for OpenZeppelin Defender 2.0, watching the live
Monad-testnet deploys (chain `10143`) and forwarding alerts to the operator
Telegram chat.

> Status: **operator-gated** — the Defender team / org token is not in the
> agent's environment. Run `scripts/deploy-monitors.ts --apply` only after the
> operator has provisioned the team and exported `DEFENDER_API_KEY` /
> `DEFENDER_API_SECRET` plus the `SWO_CASINO_TELEGRAM_*` secrets in the
> Defender web UI.

## Layout

```
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
