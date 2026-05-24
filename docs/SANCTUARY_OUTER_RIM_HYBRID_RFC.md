# SWO Outer Rim — Hybrid Execution Model RFC

**Status:** Proposed (engineering rationale; pending operator review)
**Date:** 2026-05-24
**Deciders:** Operator (InverseAltruism), Clarvis (executive function)
**Resolves:** [`[SWO_OUTER_RIM_HYBRID_RFC]`] (PROJECT:SWO, P2)
**Depends on:** [ADR-003 Outer Rim — Cosmic Offshore Overlay](./SANCTUARY_ADR_003_OUTER_RIM.md) (§2 Voyages, §"Risks" → "Oracle dependency", OQ2)
**Relates to:** [Price Oracle Selection](./SANCTUARY_OUTER_RIM_PRICE_ORACLE.md) (synthetic-path feed), `[SWO_OUTER_RIM_VOYAGE_ENGINE_PURE]` (the pure engine this RFC's modes plug into)
**Source memo:** `memory/evolution/swo_offshore_protocol_analysis_2026-05-23.md` **Memo 2 — Hybrid Execution** (§2 synthetic-vs-real, §2.1 fee-breakeven, §6 phased rollout, §8 decisions)

---

## 1. Context

ADR-003 §2 ratified voyages as "leverage-on-price operations" and fixed the
headline numbers — three tiers (Sprint 5 min / Run 30 min / Expedition
90 min), fantasy leverage (2,500× / 750× / 250×), oracle-anchored success
conditions. What ADR-003 deliberately left open is **how a voyage's outcome
is produced**: does the protocol merely *read* a price feed and compute a
synthetic win/loss against a threshold, or does it open an **actual
leveraged perpetual position** on a Monad perp DEX and let the venue decide?

ADR-003 §2's success condition ("the price feed does not breach the computed
liquidation threshold over the voyage duration") is a **synthetic** model: no
real position exists, the oracle path alone decides the outcome, and DUST is
minted/burned against the treasury. The ADR cites this RFC as the longer-form
engineering rationale for *why* synthetic is the launch default, *when* real
execution earns its keep, and *how* the two compose without forking the pure
voyage engine.

This document is the engineering-audience companion to ADR-003. It is a
**design RFC**, not an implementation. No contract, endpoint, or connector
ships from this doc; it fixes the execution model that the voyage engine,
the settlement endpoint, and any future perp-connector PR must conform to.

### 1.1 The Star Arena connector (ratified facts)

The only real-execution venue assumed available at Monad mainnet launch is
**Star Arena** (perp DEX). Its connector facts, carried verbatim from
Memo 2 and treated as fixed inputs to every calculation below:

| Connector fact | Value | Consequence for this RFC |
|---|---|---|
| Taker fee | **0.05%** per fill (5 bps) | Two fills per round trip → 10 bps floor |
| Max leverage | **50×** | Synthetic 2,500×/750×/250× cannot be expressed 1:1 on-venue |
| Order TTL | **6 blocks** | Fill-or-abort window; TTL expiry → resubmit/abort policy needed |
| Gas per order | **~200k gas** | Two orders/round trip → ~400k gas fixed cost, amortized over notional |
| Slippage floor | **2 bps** | Best-case slippage; two legs → 4 bps round-trip floor |

### 1.2 The Perpl-mainnet-zero-address constraint

Memo 2's second venue candidate, **Perpl**, is **not deployed on Monad
mainnet** — its registry entry resolves to the zero address
(`0x0000000000000000000000000000000000000000`) on mainnet. Any code path that
would route a real order to Perpl on mainnet therefore targets the zero
address and **must hard-revert, not silently no-op**. Practically:

- **Star Arena is the sole real-execution venue at launch.** Mode B and
  Mode C (§4) are Star-Arena-only until Perpl ships a non-zero mainnet
  address.
- The connector layer must **assert `venue != address(0)`** before any
  order placement, so a premature Perpl enablement fails loudly in CI /
  staging rather than burning gas on a black-hole transfer on mainnet.
- Perpl integration is explicitly **out of scope** here and gated behind a
  future "Perpl mainnet address is non-zero" precondition (see §"Open
  questions", OQ-H1).

---

## 2. Synthetic vs. real — the comparison

The core decision is per-voyage: produce the outcome **synthetically**
(oracle path vs. computed threshold, no venue order) or **really** (an
actual perp position on Star Arena whose PnL is the outcome).

| Dimension | Synthetic (Mode A) | Real (Mode B / C) |
|---|---|---|
| Position on-venue | none | actual perp order on Star Arena |
| Outcome source | oracle path vs. computed liquidation threshold | venue fill + mark-to-liquidation |
| Counterparty | the treasury's own book | the venue order book |
| Max leverage | **unbounded** (2,500× fantasy expressible) | **50×** (venue cap) |
| Venue fee per op | **zero** | 2×0.05% taker + 2×slippage + gas (§2.1) |
| Settlement latency | instant (oracle read) | 6-block TTL fill, then duration |
| Capital at risk | treasury variance (synthetic book) | real margin posted on-venue |
| Gas cost | none (off-chain compute + lazy settle) | ~200k/order × 2 round trip |
| Failure mode if oracle stalls | pause-and-refund (per oracle doc) | venue still holds a live position |
| Right tool for | Sprints, beta, fantasy leverage, low net OI | Expeditions, scale hedging, provenance |

The headline tension: **synthetic is free and supports fantasy leverage but
carries treasury variance; real costs fees + gas and caps leverage at 50×
but offloads variance to the venue.** Whether real execution is even
*economically possible* for a given voyage tier is decided entirely by
§2.1.

### 2.1 Fee-breakeven derivation

A real round trip (open + close) costs, as a fraction of position notional:

```
cost_roundtrip = 2 × f_taker  +  2 × s  +  g/N
               = 2 × 0.0005    +  2 × 0.0002 +  g/N
               = 0.0010        +  0.0004     +  g/N
               = 0.0014 + g/N            (= 14 bps + gas-on-notional)
```

where:
- `f_taker = 0.05%` (5 bps) per fill — Star Arena taker fee (§1.1)
- `s = 2 bps` per leg — slippage floor (§1.1); realized slippage ≥ this
- `g` = gas cost of two orders (~400k gas) expressed in MON
- `N` = position notional in MON

Real execution is **economically rational only when the voyage's expected
absolute price travel over its duration exceeds the round-trip cost**:

```
   E[ |ΔP| / P ]   ≥   2·f_taker + 2·s + g/N
   ───────────────       ─────────────────────
   expected edge          round-trip cost
```

If the left side is below the right, the protocol pays more in fees+gas
than the position can plausibly move — a guaranteed-negative-EV hedge, so
the voyage **must** stay synthetic.

**Worked numbers.** Model the underlying (MON/ETH major) as zero-drift with
realized volatility `σ = 60%` annualized — a deliberately conservative
mid-cycle figure. Expected absolute move over a horizon of `t` minutes is

```
E[ |ΔP|/P ]  =  σ × √(t / 525600) × √(2/π)        (√(2/π) ≈ 0.7979)
```

Evaluating per voyage tier, and comparing to the **14 bps** variable
round-trip floor (gas excluded for now):

| Voyage | Duration | σ-scaled std move | Expected abs move `E[\|ΔP\|/P]` | vs. 14 bps floor | Real-viable? |
|---|---|---|---|---|---|
| **Sprint** | 5 min | 18.5 bps | **14.8 bps** | 1.05× — a wash | ✗ negative after gas |
| **Run** | 30 min | 45.3 bps | **36.2 bps** | 2.58× | ◐ marginal, gas-sensitive |
| **Expedition** | 90 min | 78.5 bps | **62.6 bps** | 4.47× | ✓ clears comfortably |

**Why 5-min Sprints can't be real.** A Sprint's entire expected price travel
(~14.8 bps) is *equal to* the 14 bps variable fee floor before a single unit
of gas. The outcome is decided by a move smaller than the fee drag, so the
real counterparty (the treasury, opening the hedge) loses to fees in
expectation **regardless of direction**. Add the fixed gas term `g/N` and EV
is strictly negative. Sprints are therefore **synthetic-only, permanently** —
this is not a tuning knob, it is arithmetic.

**Why 90-min Expeditions can be real.** An Expedition's ~62.6 bps expected
move is **4.5× the variable fee floor**. The 14 bps round trip is amortized
against a much larger expected travel, leaving positive expected edge even
after gas, provided the notional clears the gas floor below.

**The gas floor (second axis).** Take `g ≈ 0.02 MON` round trip (≈400k gas at
~50 gwei). The `g/N` term shrinks as notional grows:

| Notional `N` | `g/N` | Total real cost (14 bps + g/N) | Kills Expedition (62.6 bps)? |
|---|---|---|---|
| 5 MON | 40 bps | 54 bps | nearly — only 1.16× edge left |
| 25 MON | 8 bps | 22 bps | no — 2.85× edge |
| 100 MON | 2 bps | 16 bps | no — 3.9× edge |

So real execution requires **both** a long duration (Expedition; Run is
marginal) **and** a notional above a gas floor (≈25 MON at these
parameters). Below either threshold, the voyage stays synthetic. The
inequality, not preference, decides.

> Assumptions are explicit and tunable: `σ = 60%` annualized, `s = 2 bps`
> (floor; realized may exceed), `g ≈ 0.02 MON`. Re-running the table with the
> operator's chosen `σ` regime is a one-cell change. The *shape* of the
> result — Sprints never, Expeditions yes, Runs marginal — is robust across
> any plausible major-asset vol because Sprint expected travel tracks the fee
> floor by construction of the 5-minute window.

---

## 3. The three execution modes

ADR-003's synthetic model is **Mode A**. This RFC adds two real-execution
modes that compose with it without forking the pure voyage engine: the
engine always computes the synthetic outcome; Modes B and C layer a real
on-venue position *behind* that synthetic result, transparently to the user.

### 3.1 Mode A — Synthetic

No real position. The pure voyage engine (`lib/outer-rim/voyage.ts`) samples
entry/settlement prices from the oracle (per the Price Oracle doc) and
checks threshold breach. DUST is minted/burned against the treasury. This is
exactly ADR-003 §2.

```
Mode A — Synthetic
─────────────────────────────────────────────────────────────
 Player        Voyage Endpoint      Oracle        DUST/Treasury
   │  start (5 Inf)   │                │                │
   ├─────────────────►│                │                │
   │                  ├─ entry price ─►│                │
   │                  │◄── price ──────┤                │
   │                  │  (compute threshold, store)     │
   │   ...duration elapses (engine reads oracle path)   │
   │                  ├─ settle price ►│                │
   │                  │◄── price ──────┤                │
   │                  │  breach? → win/loss             │
   │                  ├──── mint/burn DUST ────────────►│
   │◄── result + DUST ┤                │                │
─────────────────────────────────────────────────────────────
 No venue. No taker fee. No gas. Fantasy leverage OK.
```

**When this is the right tool.** Mode A is correct whenever real execution
is fee-negative or impossible: **every Sprint** (§2.1 arithmetic), the entire
**beta / Phase-1 launch** (no connector live yet), any voyage at **fantasy
leverage** above 50× that no venue can express, and any time **net open
interest is too low** for a treasury hedge to be worth a round trip. It is
also the permanent fallback when the oracle is healthy but the venue is
degraded. Mode A is the default; Modes B/C are opt-in overlays on top of it.

### 3.2 Mode B — Treasury netted position

Per-user voyages remain synthetic *to the user* (they see a Mode-A result).
Behind the book, the **treasury nets the directional exposure of all live
voyages** and opens **one** aggregate real perp position on Star Arena to
hedge its synthetic liability. One round trip hedges hundreds of voyages, so
the 14 bps + gas is amortized across the whole book rather than charged
per voyage.

```
Mode B — Treasury netted position
─────────────────────────────────────────────────────────────────────
 Players(N)   Voyage Endpoint    Treasury Hedger     Star Arena
   │ start ×N    │                    │                  │
   ├────────────►│ (each synthetic,   │                  │
   │             │  Mode A to user)   │                  │
   │             ├─ net exposure ────►│                  │
   │             │   (Σ long − Σ short)│                 │
   │             │                    │ if |net| > cap:  │
   │             │                    ├─ open 1 hedge ──►│  (≤50× on net Δ)
   │             │                    │◄── fill (6-blk) ─┤
   │   ...book evolves; rehedge on threshold crossings  │
   │             │                    ├─ close hedge ───►│
   │             │                    │◄── PnL ──────────┤
   │◄ Mode-A results to each player (unchanged) ┤        │
─────────────────────────────────────────────────────────────────────
 Hedge is on net DELTA notional, not leverage. 2500× synthetic
 book hedged with a 50× real position sized to the net delta.
```

**When this is the right tool.** Mode B is correct **at mainnet scale, once
net open interest across live voyages is large enough that the treasury's
synthetic book carries real variance worth hedging.** It is the
variance-management mode: it does not change any user's experience, it
protects the treasury from a correlated-loss event (e.g. everyone longs MON
and MON rips). The key reconciliation is that the hedge sizes to **net delta
notional**, not to the fantasy leverage — a 2,500× synthetic book is hedged
with a 50×-capped real position scaled to the net directional delta (see
OQ-H4). Below the net-OI cap, Mode B stands down and the book runs pure
Mode A.

### 3.3 Mode C — Premium per-user real position

A specific high-roller voyage maps **1:1** to a real perp order on Star
Arena. The user's outcome *is* the venue PnL (within the synthetic guard
rails). This is the "provenance" mode: the position is real, on-chain, and
verifiable.

```
Mode C — Premium per-user real position
─────────────────────────────────────────────────────────────
 Player       Voyage Endpoint       Star Arena      DUST/Treasury
   │ start (premium, ≥notional floor)│                │
   ├────────────────►│               │                │
   │                 ├─ open real pos►│ (≤50×, 6-blk TTL)
   │                 │◄── fill ───────┤                │
   │   ...Expedition duration; venue marks position    │
   │                 ├─ close pos ───►│                │
   │                 │◄── realized PnL┤                │
   │                 │  reconcile vs synthetic guard    │
   │                 ├──── settle DUST ───────────────►│
   │◄ result + DUST + on-chain proof ┤                │
─────────────────────────────────────────────────────────────
 Each voyage = one round trip. Only viable for long-duration,
 high-notional voyages that clear §2.1 breakeven solo.
```

**When this is the right tool.** Mode C is correct **only for long-duration
(Expedition), high-notional voyages that clear the §2.1 breakeven on their
own**, *and* where the user explicitly wants real, verifiable on-chain
provenance (a premium product surface — "your Long Haul was a real position,
here's the tx"). A single voyage bears a full round trip, so the notional
floor (≈25 MON at §2.1 params) and the duration gate are both hard
preconditions. Mode C is never appropriate for Sprints or low-notional
voyages — those are strictly negative-EV under §2.1 and stay Mode A.

---

## 4. How the modes compose

The pure voyage engine is **mode-agnostic**: it always computes the synthetic
outcome and is the single source of truth for the user-facing result. Modes B
and C attach a real position *behind* that result:

- **Mode A:** synthetic result, no venue.
- **Mode B:** synthetic result to the user + an aggregate treasury hedge that
  the user never sees.
- **Mode C:** synthetic result is the *guard rail*; the real venue PnL is the
  outcome, reconciled against the synthetic threshold (OQ-H8).

This keeps `[SWO_OUTER_RIM_VOYAGE_ENGINE_PURE]` unit-testable in pure form
(no network, no venue) — the discipline ADR-003 §"Constrains" requires. The
connector is an additive layer, not a fork of the engine.

---

## 5. Connector interface — out of RFC scope

> Section numbering mirrors Memo 2. Memo 2 §5 specifies the connector
> interface signature (order placement, fill callbacks, TTL handling); that
> is **connector-PR scope, not RFC scope**, and is deferred to a future
> `[SWO_OUTER_RIM_PERP_CONNECTOR]` task. This RFC fixes only the
> execution-model *contract* the connector must satisfy — the modes (§3),
> their composition (§4), and the open questions (§"Open questions") that
> bound its behavior.

---

## 6. Phased rollout

The rollout walks from zero venue risk to full real execution, gating each
step on the prior one being stable. This nests inside ADR-003 §8's beta
sequencing (which is about *features*); this is about *execution backing*.

| Phase | Backing | Venue risk | Gate to advance |
|---|---|---|---|
| **6.1 Synthetic-mainnet** | Mode A only, on mainnet | none | ADR-003 Phase-1 voyage loop stable; oracle (Pyth+Chainlink) healthy |
| **6.2 Testnet-executor** | Star Arena connector on **testnet**, dry-run | none (testnet funds) | Connector places/closes orders; gas, 6-block TTL, slippage floor all measured against live testnet |
| **6.3 Mainnet Mode B** | Treasury netted hedge live on **mainnet** | treasury margin | Mode B reconciles vs. synthetic book over a full cycle within tolerance; net-OI cap tuned |
| **6.4 Mode C** | Premium per-user real positions | per-user margin | Mode B stable; provenance UX + notional/duration gates shipped |

**6.1 Synthetic-mainnet.** Launch is Mode-A-only on mainnet. This *is*
ADR-003's Phase-1 voyages-only beta: the gamble loop, DUST market, and oracle
are validated with **zero venue surface area**. No connector code is on the
hot path.

**6.2 Testnet-executor.** Wire the Star Arena connector on **testnet** and
dry-run real order placement/closure. The point is to measure the §1.1
connector facts against a live venue — confirm ~200k gas/order, validate the
6-block TTL resubmit/abort path (OQ-H6), and observe realized slippage vs the
2 bps floor — **without risking mainnet funds**. Perpl stays at the zero
address; the connector asserts `venue != address(0)` here (§1.2).

**6.3 Mainnet Mode B.** Turn on the treasury netted hedge on mainnet. This is
the first real capital at risk, and it is *treasury* capital hedging
*treasury* variance — no user is exposed to the venue. Advance only after a
full cycle reconciles within tolerance.

**6.4 Mode C.** Premium per-user real positions, last. Requires Mode B proven
stable plus the provenance UX and the notional/duration gates that keep
Mode C inside §2.1 breakeven.

Each phase is independently revertible: ablating 6.4 leaves 6.3; ablating 6.3
leaves the pure synthetic-mainnet product, which is fully functional on its
own.

---

## 7. Why this is the right call

- **Synthetic-first is forced by arithmetic, not caution.** §2.1 shows
  Sprints are negative-EV real; the launch tier mix is Sprint-heavy; therefore
  synthetic-first is the only model that ships a working product on day one.
- **Real execution is additive, never load-bearing.** The pure engine owns
  the user-facing result in every mode. If the venue degrades, the product
  degrades to Mode A — which is the launch product — not to broken.
- **One venue at launch is a constraint, not a choice.** The Perpl
  zero-address constraint (§1.2) means Star Arena is the only real venue;
  the connector is built single-venue with an explicit non-zero-address
  assertion so a premature multi-venue rollout fails loudly.

---

## Open questions

These are the Memo 2 **§8 decisions** — the execution-model-specific operator
calls, distinct from ADR-003's OQ1–OQ8 (which are economy-model calls). Each
gates a downstream connector or settlement PR.

| # | Question | Gates |
|---|---|---|
| **OQ-H1** | **Perpl unblock trigger.** Star Arena is the sole real venue while Perpl resolves to the zero address on mainnet (§1.2). What concrete precondition ("Perpl mainnet registry address is non-zero **and** liquidity ≥ X") flips multi-venue routing on? | Connector venue table; multi-venue routing PR |
| **OQ-H2** | **Synthetic↔real cutover threshold.** §2.1 makes Sprint synthetic-only and Expedition real-viable, with Run marginal. Is the Mode-C cutover **Expedition-only**, or **Run-and-up** when notional clears the gas floor? | Mode-C eligibility predicate in the settlement endpoint |
| **OQ-H3** | **Mode-B net-OI cap.** At what net open-interest (in MON delta) does the treasury hedge trigger, and what is the rehedge hysteresis band to avoid churning round trips? | Treasury hedger constants |
| **OQ-H4** | **Leverage reconciliation.** Synthetic offers 2,500×/750×/250×; venue caps at 50×. Confirm the hedge sizes to **net delta notional** (not leverage) — i.e. a 50× position scaled to the book's net directional delta. | Mode-B hedger sizing math |
| **OQ-H5** | **Max slippage tolerance.** The floor is 2 bps/leg; what is the **max** slippage at which an order is aborted rather than filled (protecting against thin-book fills on a 6-block TTL)? | Connector order params |
| **OQ-H6** | **6-block TTL policy.** On TTL expiry without fill: **resubmit** (how many times, at what price drift) or **abort to synthetic**? | Connector retry state machine |
| **OQ-H7** | **Gas-budget owner.** Is the ~400k-gas round trip **protocol-paid** (treasury absorbs as a cost of variance management) or **netted from the voyage rake / protocol skim** (ADR-003 §4.3 item 3)? | Settlement accounting; Star Vault inflow ledger |
| **OQ-H8** | **Oracle-vs-fill divergence.** Mode-C outcome uses the venue mark; the synthetic guard rail uses the oracle. When they diverge (venue fill ≠ oracle path), which is authoritative for DUST settlement, and what is the reconciliation tolerance? | Mode-C settlement reducer; dispute handling |

---

## 8. References

- [ADR-003 Outer Rim — Cosmic Offshore Overlay](./SANCTUARY_ADR_003_OUTER_RIM.md)
  — §2 Voyages (the synthetic model this RFC extends), OQ2 (oracle).
- [Price Oracle Selection](./SANCTUARY_OUTER_RIM_PRICE_ORACLE.md) — the
  Pyth+Chainlink feed that drives the synthetic path and the Mode-C guard rail.
- [ADR-002](./SANCTUARY_ADR_002_STAR_CURRENCY.md) — STAR soulbound; unaffected
  by execution mode (DUST, not STAR, settles voyages).
- Source memo: `memory/evolution/swo_offshore_protocol_analysis_2026-05-23.md`
  **Memo 2 — Hybrid Execution** (§2, §2.1, §6, §8).
- Star Arena connector facts (§1.1): taker 0.05%, 50× max leverage, 6-block
  order TTL, ~200k gas/order, 2 bps slippage floor.
</content>
</invoke>
