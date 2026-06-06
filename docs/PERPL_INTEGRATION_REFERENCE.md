# Perpl Integration Reference

**Status:** Reference (operational knowledge port) · **Owner:** SWO Outer Rim
**Source of record:** Star Arena trading agent (`/home/agent/agents/star-arena/`)
**Scope:** memo 2 §4 — everything the SWO agent needs to know about Perpl (and the
Monday Trade alt venue) to reason about the Outer Rim hybrid execution model
without leaving the SWO repo.

> Why this doc exists: the operational knowledge for trading on Perpl currently
> lives only in the Star Arena codebase. The Outer Rim hybrid execution RFC
> (`docs/SANCTUARY_OUTER_RIM_HYBRID_RFC.md`) needs these parameters locally so
> design and implementation can cite exact, verified values instead of
> re-discovering them. **Every value below is transcribed from source files
> (cited inline) — it is a port, not a redesign.** Where Perpl has not published
> a mainnet value yet, this doc says so explicitly.

---

## 0. Source files (citations)

All paths are under `/home/agent/agents/star-arena/workspace/`:

| Subject | File |
|---|---|
| REST/WS endpoints, SIWE auth, markets, order types/flags, msg types, gas, fills | `src/execution/live/perpl_connector.py` |
| Slippage / fill model (AMM + vol + pessimism + floor) | `src/execution/paper_fill_model.py` |
| PerplBot TypeScript bridge client | `src/execution/live/perplbot_client.py` |
| Monday Trade alt venue connector | `src/execution/live/monday_connector.py` |
| Bridge architecture + ~100ms latency note | `CLAUDE.md`, `README.md`, `REPO_MAP.md` |

If you change a value here, update the source file too (or flag the drift) — this
doc is downstream of the connector, not the other way around.

---

## 1. Networks, chains & contract addresses

| | Testnet | Mainnet |
|---|---|---|
| Monad chain ID | **10143** | **143** |
| REST API base | `https://testnet.perpl.xyz/api` | `https://perpl.xyz/api` *(TBD / unconfirmed)* |
| WS base | `wss://testnet.perpl.xyz` | `wss://perpl.xyz` *(TBD / unconfirmed)* |
| Exchange contract | `0x9c216d1ab3e0407b3d6f1d5e9effe6d01c326ab7` | `0x0000000000000000000000000000000000000000` — **zero address; not deployed today** |
| Collateral contract | `0xdf5b718d8fcc173335185a2a1513ee8151e3c027` | *(not published)* |
| Default RPC | `https://testnet-rpc.monad.xyz` | per `monad_config.json` |

**Mainnet status (explicit):** As of this port, the Perpl **mainnet exchange
address is the zero address** (`0x0…0`) — i.e. Perpl is **testnet-only** for
trading purposes. The mainnet REST/WS hosts in the connector are placeholders
marked `TBD`. Any SWO design that assumes real on-chain Perpl execution on
mainnet is blocked until Perpl publishes these. Testnet is the only venue where
the full flow has been exercised.

Source: `perpl_connector.py` class constants `TESTNET_API_URL`, `TESTNET_WS_URL`,
`MAINNET_API_URL`, `MAINNET_WS_URL`, `TESTNET_EXCHANGE`, `TESTNET_COLLATERAL`,
`MAINNET_EXCHANGE`, `TESTNET_CHAIN_ID`, `MAINNET_CHAIN_ID`.

---

## 2. SIWE authentication flow (REST nonce → sign → WS `mt:4`)

Perpl auth is **Sign-In With Ethereum (SIWE)** over REST, then the resulting
nonce is presented to the trading WebSocket.

1. **Get public context** — `GET {api}/v1/pub/context` (markets, tokens, chain
   config; also used as a connectivity test).
2. **Request signing payload** — `POST {api}/v1/auth/payload` with
   `{chain_id, address}`. Returns `{message, nonce, issued_at, mac}`.
3. **Sign** the SIWE `message` with the wallet key (`eth_account` /
   `encode_defunct`, i.e. EIP-191 personal-sign).
4. **Connect** — `POST {api}/v1/auth/connect` with
   `{chain_id, address, message, nonce, issued_at, mac, signature}`. The
   `signature` **must include the `0x` prefix**. On success returns a `nonce`
   used as the session token.
5. **WebSocket sign-in** — open the trading WS and send a **`mt: 4`**
   (`AUTH_SIGN_IN`) message: `{mt:4, chain_id, nonce, ses}` where `ses` is a
   client-generated UUID session id.

Auth error codes worth handling:
- **418** — access code required (wallet not whitelisted).
- **423** — access code invalid/exhausted.

Reconnect re-auth uses the **cached nonce** (no fresh REST call) to avoid
Cloudflare rate-limiting; REST re-auth only fires if the cached nonce is missing.

Source: `perpl_connector.py` `_authenticate()`, `connect_trading_websocket()`,
`_reauth_trading_ws()`.

---

## 3. Endpoints

### REST (`{api}` = `https://testnet.perpl.xyz/api`)
- `GET  /v1/pub/context` — public markets/tokens/chain config.
- `POST /v1/auth/payload` — SIWE payload (nonce).
- `POST /v1/auth/connect` — SIWE verify → session nonce.

### WebSocket
- **Market data (public):** `wss://testnet.perpl.xyz/ws/v1/market-data`
- **Trading (authenticated):** `wss://testnet.perpl.xyz/ws/v1/trading`

Market-data subscription (`mt:5` `SUBSCRIPTION_REQUEST`) streams, per market:
`order-book@{market_id}`, `trades@{market_id}`, `market-state@{chain_id}`.

Source: `perpl_connector.py` module docstring, `subscribe_market_data()`,
`_resubscribe_market_data()`.

---

## 4. Markets table

`PerplMarket(id, symbol, price_decimals, size_decimals, min_size=0, max_leverage=50)`.
All markets use **`size_decimals = 5`**.

| Symbol | `id` | `price_decimals` | `size_decimals` |
|---|---|---|---|
| BTC-PERP | 16 | 1 | 5 |
| ETH-PERP | 32 | 2 | 5 |
| SOL-PERP | 48 | 2 | 5 |
| **MON-PERP** | **64** | **5** | 5 |
| ZEC-PERP | 256 | 3 | 5 |

`price_decimals` / `size_decimals` are scaling exponents: on-the-wire integers
are the human value × `10^decimals`. E.g. a MON-PERP price is sent as
`price × 10^5`; a size as `amount × 10^5`. Market metadata is refreshed from
`/v1/pub/context` on connect (the table above is the hardcoded fallback/default).

Source: `perpl_connector.py` `PerplMarket`, `MARKETS`, `_decode_price()`,
`_decode_size()`, `place_order()` scaling.

---

## 5. Trading parameters

| Parameter | Value | Notes |
|---|---|---|
| Taker fee | **0.05%** (`base_fee_pct = 0.0005`) | applied to fill notional |
| Default leverage | **10×** (`default_leverage = 10`) | |
| Max leverage | **50×** (`PerplMarket.max_leverage = 50`) | |
| Default slippage tolerance | **1%** (`slippage_tolerance = 0.01`) | bounds market-order limit price |
| Order TTL | **≈ 6 blocks** (`order_ttl_blocks = 6`) | testnet caps max TTL; expiry = `current_block + 6` |
| Leverage encoding | `lv = int(leverage × 100)` | i.e. 10× → `1000` |
| Collateral scaling | `/ 1e6` | balances are 6-decimal (USDC-like) |

Source: `perpl_connector.py` `__init__` defaults, `place_order()`;
`paper_fill_model.py` `base_fee_pct`.

---

## 6. Order types & flags

**Order types** (`OrderType` IntEnum, sent as field `t`):

| Value | Type |
|---|---|
| 0 | UNSPECIFIED |
| 1 | OPEN_LONG |
| 2 | OPEN_SHORT |
| 3 | CLOSE_LONG |
| 4 | CLOSE_SHORT |
| 5 | CANCEL |
| 6 | INCREASE_POSITION_COLLATERAL |
| 7 | CHANGE |

**Order flags** (`OrderFlags` IntEnum, sent as field `fl`):

| Value | Flag |
|---|---|
| 0 | GOOD_TILL_CANCEL (GTC) |
| 1 | POST_ONLY |
| 2 | FILL_OR_KILL |
| 4 | IMMEDIATE_OR_CANCEL (IOC) |

**Convention used by the connector:**
- **Market order → `IMMEDIATE_OR_CANCEL` (IOC, flag 4)**, priced at a
  slippage-adjusted worst-acceptable level (Perpl's CLOB rejects `price = 0`,
  so market orders carry a bounded limit price = `mark × (1 ± slippage)`).
- **Limit order → `GOOD_TILL_CANCEL` (GTC, flag 0)**, requires an explicit price.

Order request message (`mt:22` `ORDER_REQUEST`):
`{mt:22, rq, mkt, acc, t, p, s, fl, lv, lb}` where `p`/`s` are scaled
price/size, `lv` is `leverage×100`, and `lb = current_block + order_ttl_blocks`
(the "last block" / expiry). Closing an existing position adds `lp = position_id`.

Orders are rejected before the first heartbeat (block height unknown). Send is
retried up to 3× on WS drop, refreshing `lb` and `rq` each attempt.

Source: `perpl_connector.py` `OrderType`, `OrderFlags`, `place_order()`.

---

## 7. Slippage / fill model

Used in **paper mode** to approximate Perpl AMM behaviour (replaces a flat 0.1%
slippage). Constant-product (`x·y=k`) impact + volatility spread + pessimistic
domain randomization + a floor:

```
sqrt_k        = sqrt(pool_depth_k)                 # pool_depth_k = 5e9
amm_slippage  = notional_usd / (2 * sqrt_k)        # ≈ notional / (2√k)
vol_slippage  = atr_pct * 0.1                       # atr_pct default 0.02
pessimism     = uniform(1.0, 1.3)                   # 0–30% worse than estimate
raw_slippage  = pessimism * (amm_slippage + vol_slippage)
slippage_pct  = max(2bps_floor, raw_slippage)       # floor = 2.0 / 10000
fill_price    = spot * (1 ± slippage_pct)           # adverse to trader
fee_usd       = fill_notional * 0.0005              # 0.05% taker
```

| Parameter | Value |
|---|---|
| `pool_depth_k` (`k`) | **5e9** (approximates Perpl BTC-PERP testnet liquidity) |
| AMM impact | **`notional / (2 · √k)`** |
| Vol component | `atr_pct × 0.1` (default ATR 2%) |
| Pessimism multiplier | **`uniform(1.0, 1.3)`** (1.3 = up to 30% worse) |
| Slippage floor | **2 bps** (`min_slippage_bps = 2.0`) |
| Base/taker fee | **0.05%** |

Worked sanity check (`k = 5e9` → `2√k ≈ 141,421`):
`$100` notional → AMM ≈ 0.071%; `$1,000` → ≈ 0.707%; `$10,000` → ≈ 7.07%
(before vol + pessimism). Impact is **non-linear in size** — large clips are
punished hard, which is the whole point of the model.

Source: `paper_fill_model.py` `RealisticPaperFillModel`.

---

## 8. Gas

On-chain (web3) transactions use fixed gas limits:

| Operation | Gas limit |
|---|---|
| Deposit collateral | **~500,000** |
| Place / withdraw order (on-chain fallback) | **~200,000** |

Source: `perpl_connector.py` `build_transaction({"gas": 500000})` (deposit) and
`{"gas": 200000}` (order/withdraw paths).

---

## 9. Fill tracking

- A fill tracker is registered **before** sending an order, keyed by
  `request_id` (`rq`), so the fill event is never missed:
  `_pending_fills[rq] = {event, fills, order_update, order_final}`.
- `ORDERS_UPDATE` (`mt:24`) maps `rq → oid` once the exchange assigns an order
  id, so later fills can be resolved by either key.
- **`FILLS_UPDATE` (`mt:25`)** carries fill rows with fields **`p` = price,
  `s` = size, `f` = fee** (strings or ints). Trackers resolve on `oid` or `rq`;
  the `asyncio.Event` is set so the caller can await the fill.
- Fill history is trimmed to the last 500 rows.
- Average fill price = Σ(p·s)/Σs; total fee = Σf.

Source: `perpl_connector.py` `place_order()`, `_on_trading_message()`
(`FILLS_UPDATE`/`ORDERS_UPDATE` branches), fill-assembly near `# Perpl
FILLS_UPDATE uses: p=price, s=size, f=fee`.

---

## 10. WebSocket message types (reference)

`MessageType` IntEnum (field `mt`). Most-used in **bold**:

| `mt` | Name | | `mt` | Name |
|---|---|---|---|---|
| 1 | PING | | 17 | TRADES_SNAPSHOT |
| 2 | PONG | | 18 | TRADES_UPDATE |
| 3 | STATUS_RESPONSE | | 19 | WALLET_SNAPSHOT |
| **4** | **AUTH_SIGN_IN** | | 20 | WALLET_UPDATE |
| **5** | **SUBSCRIPTION_REQUEST** | | 21 | ACCOUNT_UPDATE |
| 6 | SUBSCRIPTION_RESPONSE | | **22** | **ORDER_REQUEST** |
| 7 | GAS_PRICE_UPDATE | | 23 | ORDERS_SNAPSHOT |
| 8 | MARKET_CONFIG_UPDATE | | **24** | **ORDERS_UPDATE** |
| 9 | MARKET_STATE_UPDATE | | **25** | **FILLS_UPDATE** |
| 10 | MARKET_FUNDING_UPDATE | | 26 | POSITIONS_SNAPSHOT |
| 11 | CANDLES_SNAPSHOT | | 27 | POSITIONS_UPDATE |
| 12 | CANDLES_UPDATE | | **100** | **HEARTBEAT** (carries block height `h`) |
| 15 | L2_BOOK_SNAPSHOT | | | |
| 16 | L2_BOOK_UPDATE | | | |

Source: `perpl_connector.py` `MessageType`.

---

## 11. WebSocket resilience (reconnect)

`ReconnectingWebSocket` policy:

| Parameter | Value |
|---|---|
| Backoff | exponential `min(base·2^(n-1), max)` — **base 1s → max 60s** (class defaults) |
| Jitter | **±30%** random (anti thundering-herd) |
| Stability threshold | **10s** — retry count only resets after a connection survives this long (prevents cascade oscillation from sub-second flap) |
| Heartbeat | server heartbeat every **15s**; client responds in the message handler rather than sending proactive pings |
| Max retries | `0` = infinite (connector default) |

> Note: the `ReconnectingWebSocket` **class defaults** are `base_delay=1.0`,
> `max_delay=60.0`, `stability_threshold=10.0`, `heartbeat=15s` — these are the
> canonical resilience numbers. The `PerplConnector` instantiates it with
> tuned overrides (`base 2.0s`, `max 120s`, infinite retries) for production.

On reconnect: trading WS re-auths with the cached nonce; market WS re-subscribes
to all previously-subscribed symbols. Orders flagged cancel-on-disconnect are
cancelled when the trading WS drops.

Source: `perpl_connector.py` `ReconnectingWebSocket` (defaults at `__init__`,
backoff/jitter in `_reconnect_loop`), `connect_trading_websocket()` overrides.

---

## 12. PerplBot bridge (fast execution alternative)

Optional **TypeScript microservice** that wraps the Perpl SDK for lower-latency
execution than the Python connector.

- **Latency:** **~100ms** per order (vs ~2–3s via the pure-Python path).
- **Transport:** HTTP from Python (`PerplBotClient`) → Express server.
- **Default URL:** `http://localhost:3001` (env `PERPLBOT_URL`); **localhost-only
  binding**. API-key auth via `PERPLBOT_API_KEY` (env).
- Client defaults: `timeout 30s`, `max_retries 3`, `retry_delay 1.0s`.
- Stack: Python `PerplBotConnector`/`PerplBotClient` → Express (`viem` + Perpl
  SDK) → Exchange contract. `health_check()` gates order placement.

Source: `perplbot_client.py` (`PerplBotConfig`), `CLAUDE.md` (~100ms note),
`README.md` "PerplBot Bridge" section, `REPO_MAP.md`.

---

## 13. Monday Trade (alternate venue)

A second Monad perp DEX, available as an alternate execution venue.

- **Type:** hybrid **AMM + CLOB**, built on SynFutures infrastructure.
- **Max leverage:** **33×**.
- **Auth:** HMAC-SHA256 (`X-ACCESS-KEY`, `X-ACCESS-SIGN`, plus passphrase) —
  *not* SIWE, unlike Perpl.
- **Endpoints:** API `https://developers.monday.trade`, app `https://app.monday.trade`.

Source: `monday_connector.py` module docstring + `MondayConnector`.

---

## Appendix: relevance to SWO Outer Rim

The Outer Rim hybrid execution model (`docs/SANCTUARY_OUTER_RIM_HYBRID_RFC.md`)
weighs synthetic vs. real voyage execution. The numbers that drive that
tradeoff and are sourced here: **taker fee 0.05%**, **slippage floor 2 bps**,
the **non-linear AMM impact** `notional/(2√k)` (so large real positions are
expensive), **gas ~500k deposit / ~200k order**, and the hard fact that
**Perpl mainnet is not deployed (zero address)** — meaning any "real" execution
path is testnet-only today. Cross-reference: `SANCTUARY_ADR_003_OUTER_RIM.md`
(price-oracle open question OQ2) and `SANCTUARY_OUTER_RIM_PRICE_ORACLE.md`.
