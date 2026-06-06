# SWO Outer Rim — Price Oracle Selection (Monad)

**Status:** Decided
**Date:** 2026-05-24
**Deciders:** Operator (InverseAltruism), Clarvis (executive function)
**Resolves:** [`[SWO_OUTER_RIM_PRICE_ORACLE_RESEARCH]`] (PROJECT:SWO, P1)
**Depends on:** [ADR-003 Outer Rim — Cosmic Offshore Overlay](./SANCTUARY_ADR_003_OUTER_RIM.md) (§2 Voyages, §"Risks" → "Oracle dependency")
**Blocks:** `[SWO_OUTER_RIM_VOYAGE_ENGINE_PURE]` (resolution params), DUST contract PR, voyage settlement endpoint.

---

## 1. Context

ADR-003 §2 defines voyages as leverage-on-price operations against MON/USD
(primary) and ETH/USD (secondary). The voyage engine must:

- Sample an **entry price** at voyage start.
- Detect whether the price has breached a leverage-derived **liquidation
  threshold** at any point during the voyage window (5 min / 30 min / 90 min
  for Sprint / Run / Expedition).
- Sample a **settlement price** at voyage end.

ADR-003 leaves the canonical feed as an open question (OQ2) and identifies
oracle stall as the top risk ("a bricked or delayed price feed bricks
Voyages"). This document picks the feed, names the fallback, fixes the
stall-handling policy, and budgets the cost.

---

## 2. Decision

**Primary: Pyth Network (pull updates) on Monad mainnet.**
**Fallback: Chainlink Data Feeds (push, read-only) on Monad mainnet.**
**Stall policy: pause-and-refund (no auto-claim on either side).**

A third-party TWAP-over-DEX path is **not adopted** as fallback — it is
sketched in §6 as a *last-resort* emergency mode if both Pyth and Chainlink
are simultaneously unavailable, but is not part of the launch surface.

---

## 3. Evaluation against the §"Decision criteria" gates from the task

| Criterion | Pyth pull | Chainlink Data Feeds | Chainlink Data Streams | TWAP-over-DEX |
|---|---|---|---|---|
| (a) Update latency ≤ 30 s | **~0.4 s publish + on-demand pull** ([source](https://docs.pyth.network/price-feeds/pull-updates)) | 1 h heartbeat (default Monad cadence; deviation-trigger faster but uncapped between triggers) | Sub-second pull | Defined by observation window; a 30 s TWAP barely fits and amplifies thin-liquidity noise |
| (b) Per-read cost < $0.0005 amortized | **0.005 MON update fee** ($0.00013 at $0.026/MON) + ~50 k gas verify ($0.00013) ≈ $0.00026/read | ~30 k gas `latestRoundData` call ≈ $0.000078/read — feed itself is free to read | Per-report verification fee TBD on Monad; on other chains targets ~$0.01/report — fails the budget for 5-min voyages | ~50 k gas `consult` ≈ $0.00013/read |
| (c) Primary + fallback architecture | ✅ Pyth primary, Chainlink Data Feeds fallback (orthogonal infrastructure, different node sets, different update models) | (as primary it loses on (a) for Sprint voyages) | n/a | n/a |
| (d) Primary feed stalls mid-voyage | **Pause and refund** — voyage settlement endpoint checks `publishTime` freshness; if both Pyth and Chainlink readings are older than `MAX_STALENESS_SEC = 60`, voyage is suspended and Influence stake is auto-refunded (not sent to Star Vault) | — | — | — |

Pyth wins (a) by an order of magnitude vs Chainlink Data Feeds and wins
(b) vs Chainlink Data Streams. Chainlink Data Feeds is selected as the
fallback because it is push-based (no `updatePriceFeeds` call required on
the read path), already live on Monad mainnet alongside Pyth, and provides
infrastructure independence — a Pythnet outage cannot brick the fallback.

### Why not Chainlink Data Streams as primary

Data Streams is technically capable of sub-second latency, but it is a
**pull-with-verification** model that, on every other live chain, charges
a per-report verification fee in the range of $0.01 (denominated in the
chain's native token). Even if the Monad-specific fee turns out lower at
launch, the *fee surface itself* (publicly governed per-chain) is a
runtime cost we can't pin — and the Outer Rim engine pulls on every
voyage start and settle. Pyth's flat `0.005 MON` per-feed update fee,
governance-locked via [OP-PIP-93 (Q1 2026)](https://forum.pyth.network/t/passed-op-pip-93-q1-2026-pyth-core-fee-implementation-evm-chains/2346),
is a known and tiny number; that's a better fit for an instrument the
engine touches ~6× per active voyage.

### Why not TWAP-DEX as primary

The MON/USDC pools on Monad mainnet at the time of this decision
(WMON/USDC on PancakeSwap V3 had ~$2.9M/day volume per [GeckoTerminal](https://www.geckoterminal.com/monad/pools/0xb9897986847472cd08b9a0e7bcd31ea4f1322361),
WMON/USDC on Uniswap V3 separately) are thin enough that a 30-second TWAP
is meaningfully manipulable by a single ~$50k swap from a Privateer-aligned
wallet. The whole point of the price oracle is that the *market* drives
voyage outcomes; if a single trader can drive the oracle they can drive
the outcome, and the §"output↔suspicion" mechanic collapses into a
griefing surface. Pyth and Chainlink both aggregate across off-chain
publisher sets that are immune to this.

---

## 4. Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                       Voyage settlement endpoint                   │
│              (Next.js route — pure deterministic engine)           │
└────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
        ┌─────────────────────────────────────────────────────┐
        │  readPrice(feedId, maxStaleness=60s):               │
        │    1. fetch latest Pyth price update from Hermes    │
        │    2. submit on-chain via updatePriceFeeds{value: } │
        │    3. read with getPriceUnsafe → check publishTime  │
        │    4. if stale or revert → goto fallback            │
        └─────────────────────────────────────────────────────┘
                       │                            │
              primary ✅                  primary ❌
                       │                            │
                       ▼                            ▼
        ┌──────────────────────┐   ┌────────────────────────────────┐
        │  Pyth PriceFeed      │   │  Chainlink AggregatorV3        │
        │  pull update         │   │  latestRoundData()             │
        └──────────────────────┘   └────────────────────────────────┘
                                                  │
                                          fallback ✅
                                                  │
                                                  ▼
                                   ┌──────────────────────────────┐
                                   │  Settle voyage normally,     │
                                   │  flag `oracle_source=        │
                                   │  chainlink_fallback`         │
                                   └──────────────────────────────┘
                       both ❌ (stale > 60s OR both revert)
                                                  │
                                                  ▼
                                   ┌──────────────────────────────┐
                                   │  PAUSE voyage; refund        │
                                   │  Influence stake; emit       │
                                   │  VoyagePaused(reason=oracle) │
                                   └──────────────────────────────┘
```

### Stall semantics (resolves §"Decision criteria" (d))

- **Mid-voyage stall (between start and settle):** voyage entry price is
  already locked. At settle time, if no fresh primary or fallback reading
  is available within `MAX_STALENESS_SEC = 60`, **the voyage pauses** —
  it is neither liquidated nor settled. A 24-h pause window applies; if
  the oracle returns within that window, voyage proceeds with the freshest
  available price stamped as the settlement price. If the pause exceeds
  24 h, **Influence stake is refunded** (not routed to the Star Vault)
  and the voyage is marked `aborted_oracle_stall`. Refunded stake does
  not pay into prior failed-voyage cycles, so a stall does not punish
  the bystander player who funded prior pools.
- **Start-time stall:** voyage simply cannot be initiated; the player
  sees an "Outer Rim — feed unavailable" notice. No Influence is debited.
- **Why not auto-liquidate on stall:** ADR-003 §"Risks" explicitly notes
  the oracle is the failure mode; auto-liquidating on stall converts a
  third-party outage into a player loss, which is the failure mode the
  refund policy is designed to prevent.

### Why 60 s and not 30 s for `MAX_STALENESS_SEC`

The task's §"Decision criteria" (a) requires **update latency** ≤ 30 s,
which Pyth's 400 ms publish cadence and on-demand pull model satisfy by
two orders of magnitude. `MAX_STALENESS_SEC` is a different number — it
is the **freshness gate** the settlement endpoint enforces against the
price's on-chain `publishTime`. 60 s gives one full block-time buffer
above the latency target for transient RPC / Hermes hiccups without
triggering pause-and-refund on every minor delay. The two numbers are
independent: latency ≤ 30 s is achievable; the freshness gate at 60 s is
the operational safety margin around it.

---

## 5. Monad contract addresses referenced (resolves §"Acceptance" (d))

All addresses below are sourced from the Monad-official `monad-crypto/protocols`
repository ([github.com/monad-crypto/protocols](https://github.com/monad-crypto/protocols))
and Pyth's developer hub, verified 2026-05-24.

### Pyth Network — Monad mainnet (chain ID 143)

| Contract | Address | Purpose |
|---|---|---|
| Pyth `PriceFeed` | `0x2880aB155794e7179c9eE2e38200202908C17B43` | `updatePriceFeeds` / `getPriceUnsafe` / `getUpdateFee` |
| Pyth `Entropy` | `0xD458261E832415CFd3BAE5E416FdF3230ce6F134` | (out of scope here, but the VRF surface lives on the same Pyth deployment — relevant if voyage jitter/RNG ever piggybacks on it) |

### Pyth Network — Monad testnet (chain ID 10143, required by task §"Acceptance" (e))

| Contract | Address | Purpose |
|---|---|---|
| Pyth `PriceFeed` (testnet) | `0x2880aB155794e7179c9eE2e38200202908C17B43` | Same address as mainnet — Pyth uses identical deployment slots |
| MON/USD **beta** price feed (testnet only) | `0xad2B52D2af1a9bD5c561894Cdd84f7505e1CD0B5` | Testnet-only adapter; mainnet uses the priceId directly |

### Pyth feed IDs (priceId, 32-byte) — same on all chains

The voyage engine references feed IDs, not addresses, for the price
lookups (priceIds are chain-agnostic, the contract address is per-chain):

| Symbol | Truncated priceId | Update params (Monad mainnet push exception list) |
|---|---|---|
| MON/USD | `0x3149…6cd1` | 1 h heartbeat, 0.02% deviation |
| ETH/USD | `0xff61…0ace` | 1 h heartbeat, 0.02% deviation |
| BTC/USD | `0xe62d…5b43` | 1 h heartbeat, 0.02% deviation |

Heartbeat is the **push** cadence; pull updates are available on demand
at the 400 ms publish cadence, which is what the voyage engine uses.
Full priceIds: [docs.pyth.network/price-feeds/core/push-feeds/evm](https://docs.pyth.network/price-feeds/core/push-feeds/evm).

### Chainlink — Monad mainnet (fallback)

| Contract | Address | Purpose |
|---|---|---|
| MON/USD proxy (`AggregatorV3Interface`) | `0xBcD78f76005B7515837af6b50c7C52BCf73822fb` | Fallback price for MON/USD |
| MON/USD aggregator | `0x2A347b30e1DA22Ec136142cdA88Bec59fDB6e9d3` | Underlying aggregator (the proxy is the canonical read target) |
| ETH/USD proxy | `0x1B1414782B859871781bA3E4B0979b9ca57A0A04` | Fallback price for ETH/USD |
| ETH/USD aggregator | `0x3d21E2E680E2a60b440da427820aEe2391375EB7` | Underlying aggregator |
| BTC/USD proxy | `0xc1d4C3331635184fA4C3c22fb92211B2Ac9E0546` | Reserved for future BTC-based voyages |
| BTC/USD aggregator | `0xC6D6f57EFe5Ce2769aF0e0D8708477e4819F92d0` | Underlying |
| Data Streams Router | `0x33566fE5976AAa420F3d5C64996641Fc3858CaDB` | Not used (Data Streams considered and rejected, §3) |
| Data Streams VerifierProxy | `0xEd813D895457907399E41D36Ec0bE103E32148c8` | Not used |

Source: [github.com/monad-crypto/protocols/mainnet/chainlink.jsonc](https://github.com/monad-crypto/protocols/blob/main/mainnet/chainlink.jsonc).

### Native infrastructure

- **WMON** (wrapped MON): `0x3bd359c1119da7da1d913d1c4d2b7c461115433a` — referenced by the §6 emergency-only TWAP path.
- **PancakeSwap V3 WMON/USDC pool** (1% fee, $2.9M/day at decision time): `0xb9897986847472cd08b9a0e7bcd31ea4f1322361` — TWAP source candidate (rejected as fallback, retained as emergency).

---

## 6. Gas math + sample TX cost per voyage (resolves §"Acceptance" (c))

Assumptions for the math below — all from the Monad documentation cited in §7:

- Monad minimum base fee: **100 gwei** = `100 × 10⁻⁹ MON` ([docs.monad.xyz/developer-essentials/gas-pricing](https://docs.monad.xyz/developer-essentials/gas-pricing)).
- Monad block time: **0.4 s**, finality **800 ms** ([Monad mainnet launch announcement, 2025-11-24](https://www.prnewswire.com/news-releases/monad-joins-chainlink-scale-bringing-chainlink-data-feeds-data-streams-and-cci-to-monad-302434291.html)).
- MON spot price at decision time: **~$0.026** ([CoinGecko 2026-05-19](https://www.coingecko.com/en/coins/monad)).
- Pyth Q1 2026 per-feed update fee: **0.005 MON** ([OP-PIP-93](https://forum.pyth.network/t/passed-op-pip-93-q1-2026-pyth-core-fee-implementation-evm-chains/2346)).

### Per-call cost breakdown

| Operation | Gas | Pyth fee | MON cost | USD cost ($0.026/MON) |
|---|---|---|---|---|
| Pyth `updatePriceFeeds` (1 feed) | ~50,000 | 0.005 MON | `50,000 × 100×10⁻⁹ + 0.005` = `0.005 + 0.005` = **0.010 MON** | **$0.00026** |
| Pyth `getPriceUnsafe` (read only) | ~5,000 | — | `5,000 × 100×10⁻⁹` = 0.0005 MON | $0.000013 |
| Chainlink `latestRoundData` (fallback path, free to read) | ~30,000 | — | `30,000 × 100×10⁻⁹` = 0.003 MON | $0.000078 |
| Voyage state-write overhead | ~80,000 | — | 0.008 MON | $0.000208 |

### Per-voyage cost (Sprint / Run / Expedition all identical — fixed touchpoints)

A voyage hits the oracle on **start** and on **settle**. With Pyth primary:

```
Start:    updatePriceFeeds(MON/USD)         = $0.00026
        + getPriceUnsafe                    = $0.000013
        + voyage state-write                = $0.000208
                                              ─────────
                                              $0.000481

Settle:   updatePriceFeeds(MON/USD)         = $0.00026
        + getPriceUnsafe                    = $0.000013
        + settlement state-write            = $0.000208
                                              ─────────
                                              $0.000481

Per-voyage total (Pyth-only happy path):     $0.00096 ≈ $0.001
```

If the fallback path engages on settle (Pyth stalls), the cost shape
stays in the same order of magnitude — the Pyth `updatePriceFeeds` call
is replaced by a free `latestRoundData` read, which is *cheaper*:

```
Settle (fallback):  latestRoundData         = $0.000078
                  + settlement state-write  = $0.000208
                                              ─────────
                                              $0.000286
```

### Cost-per-read amortized check

The criterion is `per-read cost < $0.0005`. The "read" here is one oracle
sample (start or settle). Pyth-only read = $0.000273 (update + read);
Chainlink fallback read = $0.000078. **Both are under the budget by 1.8×
or more.** Per-voyage total ($0.001) is also under any reasonable economic
floor — DUST rewards start at 50 DUST/success, the gas is negligible
against the stake size.

### Sensitivity check: what breaks the budget?

- **MON 10× to $0.26.** Pyth read becomes $0.0026/read, blowing the budget.
  Mitigation: at MON ≥ $0.10, switch primary to **Chainlink Data Feeds**
  (push, read-only — gas-only, no `updatePriceFeeds`). The fallback then
  flips to Pyth pull. Threshold trigger documented as a tunable in the
  voyage engine PR.
- **Pyth governance raises the per-feed fee.** Watch
  [Pyth governance forum](https://forum.pyth.network/c/proposals/2) for
  EVM fee proposals; the architecture already has the swap-primary lever.

---

## 7. Sources (resolves §"Acceptance" (e) — minimum 3 cited)

1. **Monad Developer Documentation — Oracles.** Lists every oracle live on
   Monad mainnet/testnet with contract-address pointers.
   [docs.monad.xyz/tooling-and-infra/oracles](https://docs.monad.xyz/tooling-and-infra/oracles)

2. **Pyth Developer Hub — EVM Contract Addresses.** Canonical Monad
   mainnet/testnet `PriceFeed` and `Entropy` addresses.
   [docs.pyth.network/price-feeds/core/contract-addresses/evm](https://docs.pyth.network/price-feeds/core/contract-addresses/evm)

3. **Pyth Developer Hub — Push Feeds (EVM, Monad section).** MON/USD,
   ETH/USD, BTC/USD priceIds + 1-h heartbeat / 0.02% deviation params.
   [docs.pyth.network/price-feeds/core/push-feeds/evm](https://docs.pyth.network/price-feeds/core/push-feeds/evm)

4. **Pyth DAO — OP-PIP-93 (Q1 2026 EVM fee implementation).** Locks the
   0.005 MON per-feed update fee on Monad.
   [forum.pyth.network/t/passed-op-pip-93-q1-2026-pyth-core-fee-implementation-evm-chains/2346](https://forum.pyth.network/t/passed-op-pip-93-q1-2026-pyth-core-fee-implementation-evm-chains/2346)

5. **Chainlink Changelog — Data Feeds Expands to Monad Mainnet
   (2025-11-24).** Confirms Data Feeds availability at Monad mainnet
   launch.
   [dev.chain.link/changelog](https://dev.chain.link/changelog)

6. **Monad Joins Chainlink Scale (PR Newswire, 2025-11-24).** Confirms
   Data Feeds + Data Streams + CCIP all live on Monad mainnet day-one
   with 15+ DeFi protocols already integrating.
   [prnewswire.com/news-releases/monad-joins-chainlink-scale-…](https://www.prnewswire.com/news-releases/monad-joins-chainlink-scale-bringing-chainlink-data-feeds-data-streams-and-ccip-to-monad-302434291.html)

7. **monad-crypto/protocols** (Monad-official). Authoritative
   contract-address registry for Pyth, Chainlink, Chronicle, eOracle,
   Redstone, Stork, Supra, Switchboard on Monad mainnet.
   [github.com/monad-crypto/protocols](https://github.com/monad-crypto/protocols)

8. **Monad Developer Documentation — Gas Pricing.** 100 gwei base-fee
   floor used in the §6 cost math.
   [docs.monad.xyz/developer-essentials/gas-pricing](https://docs.monad.xyz/developer-essentials/gas-pricing)

### Working testnet contract reference (§"Acceptance" (e))

The Pyth `PriceFeed` contract on **Monad testnet (chain ID 10143)** at
`0x2880aB155794e7179c9eE2e38200202908C17B43` is the integration target
for the voyage engine's unit harness — it is the same ABI as the mainnet
contract and is the canonical Monad-testnet Pyth deployment. The
testnet MON/USD beta feed adapter at
`0xad2B52D2af1a9bD5c561894Cdd84f7505e1CD0B5` lets the harness exercise
the MON/USD priceId before mainnet liquidity exists.

---

## 8. What this doc does *not* decide

- **Voyage engine pseudocode** — pure reducer lives in
  `lib/outer-rim/voyage.ts` per `[SWO_OUTER_RIM_VOYAGE_ENGINE_PURE]`.
- **DUST contract** — `[SWO_OUTER_RIM_DUST_TOKEN_CONTRACT]`. This doc
  fixes the oracle the contract reads; it does not spec the contract.
- **Settlement endpoint** — wraps the engine and the oracle reads;
  scoped to the voyage settlement PR.
- **Operator monitoring** — Pyth + Chainlink staleness alerting + a
  switch-primary lever should live in the casino-keeper-style health
  doctor (`/api/casino/health` precedent per
  `[SWO_CASINO_KEEPER_DOCTOR]`); scoped to a separate Outer Rim health
  PR.

---

## 9. Followups

- `[OUTER_RIM_ORACLE_INTEGRATION_HARNESS]` — TypeScript adapter under
  `lib/outer-rim/oracle/` with three call sites (Pyth pull, Chainlink
  read, emergency TWAP), 60-second freshness gate, unit tests against a
  mock that simulates stall scenarios.
- `[OUTER_RIM_ORACLE_HEALTH_CHECK]` — `/api/outer-rim/oracle/health`
  surfacing last successful read per feed per source, last fallback
  engagement, time-since-update.
- Watch Pyth governance for any per-feed fee change ([forum.pyth.network](https://forum.pyth.network/)).
  The architecture supports swapping primary to Chainlink Data Feeds if
  MON price rises 10×+ — keep that lever explicit in the engine code.
