# ADR-003: Outer Rim — Cosmic Offshore Overlay

**Status:** Proposed (pending operator review)
**Date:** 2026-05-24
**Deciders:** Operator (InverseAltruism), Clarvis (executive function)
**Supersedes:** None
**Extends:** [ADR-001](./SANCTUARY_ADR.md), [ADR-002](./SANCTUARY_ADR_002_STAR_CURRENCY.md)
**Resolves:** [SWO_OUTER_RIM_ADR_003] (PROJECT:SWO, P0)
**Source memo:** `memory/evolution/swo_offshore_protocol_analysis_2026-05-23.md`

---

## Context

Sanctuary V2 has shipped its companion-first core loop (3-stat tamagotchi,
5 actions, mood, LLM chat, off-chain STAR ledger per ADR-002, cosmetic shop).
The 2026-05-23 memo (`swo_offshore_protocol_analysis_2026-05-23.md`) analyses
the offshoreprotocol.fun Skinner-box-on-perp-DEX architecture and identifies
six mechanics SWO Sanctuary materially lacks: live-price as operation oracle,
output↔suspicion stat tradeoff, transferable economic currency on top of
soulbound engagement credit, multi-slot stat-bearing NFT loadouts, pro-rata
yield pool funded by losses, and burn-to-steal PvP.

The memo recommends an **opt-in expansion layer** — "the Outer Rim" — that
adds those mechanics *without* disturbing the cozy Sanctuary loop. This ADR
ratifies that design at the architectural level so contract / engine / UX
PRs can proceed in parallel.

The dependency graph for everything downstream (DUST contract, voyage
engine, Star Vault settlement reducer, Equipment data schema, bounty opt-in,
Outer Rim UI) flows through this document. It is the gate.

---

## Decision

**SWO Sanctuary ships an opt-in expansion layer called the Outer Rim,
running alongside the existing cozy Sanctuary loop, using a two-token
economy (STAR soulbound unchanged + DUST transferable ERC-20 new),
ETH/MON-price-anchored voyages, stat-bearing transferable Equipment NFTs,
24-hour pro-rata Star Vault settlement funded by lost stakes and casino
house-edge, and a Letter-of-Marque opt-in bounty system.**

Specifically:

1. **Two surfaces, one Skrumpey, shared economy.** Sanctuary stays exactly
   as it is for the cozy player. The Outer Rim is a new tab on the Companion
   screen, gated behind a STAR-burn opt-in (bond ≥ 25 + 100 STAR). The
   Skrumpey is the shared identity; STAR is engagement; DUST is wealth;
   MON is the cash-out exit.

2. **STAR stays soulbound per ADR-002.** No retroactive change. STAR gains
   one new sink (`outer_rim_opt_in`). It never converts to DUST directly.

3. **DUST is a new transferable ERC-20** on Monad, server-signed lazy mint
   via voyage settlement, with anti-snipe sell tax. See §1.

4. **Voyages** are 3-tier (Sprint / Run / Expedition) leverage instruments
   on the MON/ETH price feed. See §2.

5. **Equipment** is a 6-slot × 7-asset × 6-stat NFT loadout system with
   rarity multipliers ×1 / ×1.5 / ×2.5 / ×4.5 / ×8. See §3.

6. **Star Vault** settles a 24-hour cycle pro-rata across cleaned DUST,
   funded by lost Influence (split 40/30/30 → 70/15/15), casino house-edge
   inflow, and a 2% protocol skim. See §4.

7. **Bounties** are opt-in via Letter of Marque (a permanent STAR-burned
   flag per Skrumpey). See §5.

8. **Factions** reuse SWO's existing in-universe orders. See §6.

9. **Beta sequences voyages-alone first**, then layers Equipment. See §8.

---

## 1. Currency — the three-token stack

| Currency | Standard | Transferable? | Earned via | Spent on |
|---|---|---|---|---|
| **STAR** | ERC-20-shaped, soulbound (per ADR-002) | No | Care actions, quests, daily login, streaks | Cosmetic shop, Outer Rim opt-in, governance weight |
| **DUST** | ERC-20, new contract on Monad | Yes | Voyage success (50–100/op), Star Vault claim conversion, faction round refund | Equipment mint/repair, voyage Influence, hits, faction stake, Loadout-4 auction, casino chips |
| **MON** | Native Monad gas/value | Yes (native) | Star Vault yield, casino wins | Influence purchase, cash-out |

### 1.1 How DUST avoids the failure modes ADR-002 §"Why not transferable" called out

ADR-002 §"Why not transferable" rejected making **STAR itself** transferable
on three grounds: sybil/rate-arbitrage on the earn API, regulatory surface
of a tradeable utility token earned through user actions, and unbuilt
economic design burden (supply schedule, sinks, DEX liquidity).

DUST is a **different token, not a relaxation of STAR**, and each of those
three concerns is addressed by that separation:

- **Sybil-on-engagement is not a DUST attack surface.** DUST is *not* minted
  by the off-chain engagement APIs (`earn`, quest claim, daily login, care
  actions). Those paths only mint STAR, which is still soulbound and still
  carries the per-source rate-clamps. DUST is minted exclusively by
  **voyage settlement**, which is gated by an Influence stake **paid in MON**
  and is non-trivially loss-bearing on the underlying price feed. There is
  no free-DUST faucet to sybil-farm — the wallet has to put MON at risk
  to mint any. The "rate-clamp becomes a yield" attack on STAR does not
  port to DUST because DUST has no rate-clamps to defend; it has a market.

- **Regulatory posture is decoupled from the engagement signal.** ADR-002's
  concern was that turning the engagement credit itself into a tradeable
  utility token meaningfully expanded SWO's securities footprint as a
  333-NFT community DAO. DUST is **not** the engagement credit. It is a
  gameplay-derived chip with no claim against the DAO, no governance
  weight, no earn-by-existing emission, and no rev-share. It sits next to
  STAR rather than replacing it. STAR keeps its "engagement-not-yield"
  posture intact.

- **Distinct purpose carries its own design rigor.** ADR-002 noted that
  doing transferable-token design pre-V2 was premature. The Outer Rim
  memo is the design work that ADR-002 said had not been done. Supply
  schedule (uncapped, mint = voyage success), sinks (Equipment mint /
  repair / Loadout-4 / hits / faction stake / casino chip), anti-snipe
  (50% first-24h sell tax), and DEX liquidity (single DUST/MON LP seeded
  from treasury) are now defined here as load-bearing structure, not
  optional polish.

In short: ADR-002's reasoning was correct **for STAR** and is preserved
unchanged. DUST is the right shape for the wealth/gamble surface because
it is a separate contract, mints only through a MON-at-risk path, and
carries no engagement-credit semantics. The two-token split is what
ADR-002 §"Why not hybrid" gestured at when it said *"the right path is a
separate sister token"* — DUST is that sister token, just spec'd for the
Outer Rim job rather than for transferable rewards.

### 1.2 DUST contract shape

- **ERC-20, uncapped.** Total supply is a pure function of voyage successes
  minus burns. No team allocation, matching Offshore's posture and SWO's
  no-operator-Skrumpey-hoard positioning.
- **MINTER_ROLE** held by a backend signer key (same model as the STAR
  cosmetic-mint path in ADR-002 §"Off-Chain ↔ On-Chain Boundary"), only
  callable from the voyage settlement endpoint with a signed payload.
  Per-epoch mint cap enforced on-chain.
- **BURNER_ROLE** held by Equipment factory, Loadout-4 auction, hit
  contract, and faction-stake contract.
- **Anti-snipe:** 50% sell tax on transfers in the first 24 hours of DUST
  contract deployment; tax routes to the Star Vault. Verbatim from Offshore.
- **DAO-revocable roles** via `StarWorldOrderGovernor`.
- **DEX liquidity:** seed a single DUST/MON AMM pool from existing SWO
  treasury (size set in the contract PR — reference ~$80k LP-grade slug
  per the Offshore presale playbook).

### 1.3 STAR ↔ DUST conversion policy

- **No STAR → DUST.** Direct conversion would floor STAR's market value
  at the DUST price × rate, collapsing ADR-002's sybil-defense. STAR
  stays an island.
- **DUST → STAR is permitted as a slow charity-style rebate** (e.g.
  1000 DUST → 1 STAR), shipped as a later optional sink. Lets DUST-rich
  players slowly climb the engagement ranks without buying STAR. Not in
  scope for the launch PR.

---

## 2. Voyages — leverage-on-price operations

| Voyage | Duration | Leverage | Reward shape | Lore name |
|---|---|---|---|---|
| Sprint | 5 min | 2,500× | binary | Quick contraband run |
| Run | 30 min | 750× | progressive | Cargo haul |
| Expedition | 90 min | 250× | progressive | Long Haul |

- **Cost:** 5 Influence per voyage. Influence is purchased with MON or
  earned in trickle from Sanctuary streaks.
- **Oracle:** MON/USD price feed (primary) or ETH/USD (secondary), pulled
  from a canonical Monad oracle. The exact feed and fallback chain is the
  output of `[SWO_OUTER_RIM_PRICE_ORACLE_RESEARCH]` (P1, blocks contract).
- **Success condition:** the price feed does not breach the computed
  liquidation threshold over the voyage duration. Threshold = entry price
  × `(1 − sensitivity)` where `sensitivity` is leverage-derived plus
  per-trade jitter.
- **Failure:** Influence stake is lost and routed to the Star Vault pool
  over the next 3 cycles.
- **Success reward:** `DUST_PER_SUCCESS × completion^1.2` (progressive)
  or fixed 50–100 DUST (binary, scales with Voyage Level), plus 5
  Influence refund. The `^1.2` curve is lifted verbatim from Offshore —
  it is playtested and gives early-failure proportionally larger
  haircuts (50% completion → ~44% payout).
- **Leverage jitter** + dynamic vol adjustment: per-trade liquidation
  spread is slightly randomized; baseline tightens/widens with realized
  vol. Keeps success rate stable across regimes while preserving
  per-trade unpredictability.
- **Parallelism:** Voyage Level 1–5 controls how many voyages run
  concurrently (1 / 1 / 2 / 2 / 3). Voyage Level is gated by Sanctuary
  bond + DUST treasury, not by Influence purchases — different from
  Offshore, because SWO already has the bond loop as a progression hook.
- **Companion presence:** the Sanctuary HUD shows a ship icon next to the
  companion while voyages run; on success/failure the companion journals
  the trip ("we cleared the Nebula Pass; brought home 78 DUST"). This is
  the single explicit lore bridge between cozy and gamble.

The pure deterministic engine for all of the above ships in
`lib/outer-rim/voyage.ts` per `[SWO_OUTER_RIM_VOYAGE_ENGINE_PURE]` (P1) —
mirrors the discipline of `lib/sanctuary/expeditions.ts`.

---

## 3. Equipment — 6-slot × 7-asset × 6-stat loadouts

Equipment is the second NFT layer (Skrumpey itself remains the primary).
Each Skrumpey can equip up to **4 loadouts × 6 slots = 24 Equipment NFTs**.

### 3.1 Slots (6)

| Slot | Role | Offshore parallel |
|---|---|---|
| Vessel | Power core / ship class | Business |
| Crew | NPC sidekicks | Associates |
| Cloaking | Defense | Insurance |
| Cargo | What you smuggle | Method |
| Quartermaster | Logistics / efficiency | Accountant |
| CommsBlackout | Stealth gear | OpSec |

### 3.2 Assets per slot (7)

Each slot has **7 distinct assets** with flavored SWO-themed names. Total
canonical catalog = **6 × 7 = 42 items**, defined in
`data/sanctuary/outer_rim_equipment.json` per
`[SWO_OUTER_RIM_EQUIPMENT_DATA_SCHEMA]` (P1). Schema mirrors
`data/sanctuary/cosmetic_items.json`.

### 3.3 Stats (6)

| Stat | Role |
|---|---|
| Haul Rate | DUST output per tick |
| Detection Tolerance | How long until patrols spot you in-cycle |
| Speed | % faster tick (e.g. 27s vs 30s) |
| Stealth | % detection reduction (capped 70%) |
| Bonus Chance | Crit chance |
| Bonus Multiplier | Crit size |

**Core tradeoff (lifted from Offshore):** every output stat (Haul Rate,
Speed, Bonus Chance, Bonus Multiplier) **accelerates detection buildup**.
Pure-DPS stacking caps out early and stops earning for the rest of the
cycle. Players must trade output against survival (Detection Tolerance,
Stealth). This is the single mechanic the memo identifies as the
hardest-to-replicate Offshore lesson; it is non-negotiable for Outer Rim.

### 3.4 Rarities

Common / Uncommon / Rare / Legendary / Mythic with stat multipliers
**×1 / ×1.5 / ×2.5 / ×4.5 / ×8**. Numbers lifted verbatim from Offshore;
they are playtested and form one of the most-discussed parts of that
ecosystem.

### 3.5 Mint / market / maintenance

- **Mint:** ERC-1155 via DUST burn, analogous to the STAR-burn cosmetic
  mint pattern in ADR-002 §"Next Steps".
- **Transferable:** yes. The existing `StarSkrumpeyMarketplace` extends
  to list Equipment. Synergy-hunting and market-making is the intended
  emergent gameplay.
- **Degradation:** 15% per cycle, 50% floor. Maintenance scales with
  rarity (Common ~9 DUST/cycle/100% → Mythic ~104 DUST/cycle/100%).
  Better gear = better income + bigger treadmill.
- **Loadout 4** is a **Dutch auction starting at 200,000 DUST, decaying
  20% per cycle, no floor, burned on win, one per Skrumpey.** Verbatim
  from Offshore.

---

## 4. Star Vault — 24-hour pro-rata yield settlement

### 4.1 Cycle

24-hour cycles, one claim per Skrumpey per cycle.
**One Skrumpey = one entry per cycle**, only if an Equipment loadout is
active. Idle Skrumpeys earn nothing — yield is engagement-gated.

### 4.2 Reward formula

```
Your MON reward = (Your DUST cleaned this cycle / Total network DUST cleaned this cycle)
                  × Cycle pool size
```

### 4.3 Cycle pool sources

1. **Lost Influence from failed voyages** over the prior 3 cycles.
   Default split **40 / 30 / 30** (oldest cycle pays out 40% etc.).
   Under sluggish-economy conditions (detected by a low active-voyage
   count or low cleaned-DUST volume), the split escalates to **70 / 15 / 15**
   to front-load reward and pull players back in. Verbatim from Offshore.
2. **Cosmic Casino house-edge inflow.** A fixed cut of casino settled
   volume routes to the Star Vault — `~50bps to vault, ~250bps to bankroll,
   rest paid out` is the target shape; exact values set in the cycle
   reducer PR. **This is the integration the casino currently lacks**, and
   is what makes the Outer Rim and Casino *one product*.
3. **2% protocol skim** for operations. Offshore takes 3%; SWO is tighter
   because the holder base is smaller and visible.

### 4.4 Settlement engine

Pure deterministic cycle-settlement reducer in `lib/outer-rim/star-vault.ts`
per `[SWO_OUTER_RIM_STAR_VAULT_ENGINE_PURE]` (P1). Inputs: per-cycle
lost-Influence ledger, casino-edge inflow ledger, prior cycle balances.
Outputs: per-Skrumpey MON entitlement + updated pool state. Unit-tested
on a synthetic ledger before going anywhere near a contract.

---

## 5. Bounties — Letter of Marque opt-in

SWO is a 333-NFT community where every holder roughly knows every other
holder. Mandatory PvP would be socially toxic. Bounties are opt-in.

### 5.1 Opt-in mechanic

A Skrumpey must spend a one-time **STAR burn** (target: 50–100 STAR;
operator-tunable) to flip the **Letter of Marque** flag from Pacifist to
**Privateer**. Only Privateer Skrumpeys can hit or be hit.

The flag is per-Skrumpey, permanent, on-chain. Once Privateer, always
Privateer (until a future opt-out mechanic ships, if ever — out of scope).

### 5.2 Hit types

| Type | Cost (DUST, burned) | Target |
|---|---|---|
| Random | 35 | Random live voyage among Privateers |
| Targeted | 60 | Specific Privateer from dropdown |
| Revenge | 35 | Strike back at a recent attacker only |

- Attacker takes **80% of in-flight DUST** from victim's interrupted voyage.
- Victim keeps **20%** + loses full Influence stake (→ Star Vault).
- **10 hits per victim per day cap** (anti-griefing).
- Can't hit own voyages.
- **Story integration:** Privateer status flips NPC dialog branches, unlocks
  a mast-flag cosmetic, and surfaces in the chat companion's voice.

Full opt-in design spec in `[SWO_OUTER_RIM_BOUNTY_OPT_IN_DESIGN]` (P2).

---

## 6. Factions — reuse SWO orders

Three factions, **reusing existing SWO in-universe orders** rather than
inventing new ones:

- **Order of the Ascendant** (= Cayman House)
- **Free Stars Collective** (= Panama Cartel)
- **Outer Reach Syndicate** (= Swiss Guard)

### 6.1 Mechanic

- Per ~24h round, a Skrumpey stakes DUST into one faction's pot.
- Tier-based shared **Detection Tolerance** bonus for every faction member:
  **T1 +4%, T2 +8%, T3 +12%**.
- Tier thresholds scale with member count (~200 / 600 / 1,200 DUST per
  member).
- Stakes are **returned at round end, never burned**.
- All three factions can hit T3 simultaneously — coordination boost, not
  zero-sum war. Verbatim from Offshore.

This is the layer where the "everyone knows everyone" character of a
333-holder DAO becomes a competitive advantage instead of a constraint:
faction coordination on a small holder base is easier and more visible
than on Offshore's much larger player count.

---

## 7. Why this is the right call (and why not alternatives)

### 7.1 Why not bolt the mechanics directly into Sanctuary?

Stat-bearing transferable Equipment in the cozy companion loop would
turn every player's first Sanctuary visit into a market-research session.
The opt-in expansion preserves Sanctuary's no-pressure entry point for
cozy holders while letting yield-curious holders graduate. Two surfaces,
one Skrumpey, shared economy.

### 7.2 Why not reverse ADR-002 and make STAR transferable?

The three failure modes ADR-002 §"Why not transferable" identifies remain
true (sybil-on-engagement, regulatory surface, undone economic design
work). §1.1 of this ADR explains how the two-token model addresses each
failure mode without reversing ADR-002. Reversing ADR-002 would force an
on-chain migration affecting every wallet that has ever held STAR; adding
DUST as a sister token is reversible (if DUST fails, ablate it, STAR
doesn't move).

### 7.3 Why not MON-only Outer Rim (the §8 fallback in the memo)?

Acceptable if the operator vetoes DUST. Cost is ~70% of design depth:
no DUST-priced Equipment market, no faction stakes, no DUST-burn hit
mechanic, no anti-snipe launch event, weaker "Cosmic Offshore" framing.
Operator review (§9 Open Questions, item 1) decides.

### 7.4 Why not skip the price-oracle and use a server-rolled outcome?

It removes the single most important mechanic in Offshore: the market
itself becomes the game's pulse. A bored player who never opens the app
gets reminded by the world ("MON just dumped 3% — did I have a Long Haul
running?"). No alternative replicates this for free. Worth the oracle
integration cost.

---

## 8. Beta sequencing

**Phase 1 (4–6 week beta) — Voyages only.**
Ship the voyage engine, DUST contract, Star Vault settlement (without
Equipment-stat modifiers — flat 1× multiplier for everyone), Letter of
Marque opt-in, basic bounty system. No Equipment NFTs yet — Voyage Level
is the only differentiation. Validates the core gamble loop, the oracle,
and DUST market behavior with the lowest possible surface area.

**Phase 2 — Equipment layer.**
Once Phase 1 is stable, ship the 42-item Equipment catalog, ERC-1155
factory, marketplace integration, degradation/maintenance, Loadout-4
Dutch auction.

**Phase 3 — Factions + polish.**
Faction stakes, T1/T2/T3 bonuses, NPC dialog overlays, the full visual
"Outer Rim" tab UI per `[SWO_OUTER_RIM_SANCTUARY_INTEGRATION_DESIGN]`.

The dependency ordering from memo §7 stands: this ADR → {oracle research,
voyage engine, equipment data schema, star vault engine} in parallel →
DUST contract → {bounty opt-in design, sanctuary integration design} in
parallel.

---

## Consequences

### Enables

- **A unified product.** Sanctuary, Casino, and Outer Rim share one
  Skrumpey identity, one STAR ledger, one DUST market, and one MON
  cash-out. The casino's house edge becomes the Star Vault's funding;
  the casino stops being a detached `/casino` surface.
- **Genuine on-chain economic depth.** Equipment NFTs trade; DUST has
  a market; voyage success ties to live market action; Star Vault yield
  is real MON. Holders have something to do with their NFT beyond
  patting it.
- **Two-surface UX is legible.** Cozy + wealth currencies are a
  well-validated pattern (Stardew Valley friendship + gold, Genshin
  AR + Primogems). Players already grok this split.
- **Reversible economic experiment.** If DUST fails, ablate it. STAR
  remains intact. ADR-002 is not at risk.

### Constrains

- The voyage engine, Star Vault reducer, and Equipment stat math must be
  **pure deterministic and unit-tested** before any contract goes near
  Monad. Mirrors `lib/sanctuary/expeditions.ts` discipline.
- The casino's settlement flow must add a Star Vault inflow path. This is
  additive but real — casino delivery plan absorbs the change.
- Backend signer key holds MINTER_ROLE for **two** tokens now (STAR per
  ADR-002, DUST new). Same hot-wallet hygiene applies; per-epoch mint cap
  is doubly important on DUST since DUST has a market price and any
  unauthorized mint translates directly into real loss.
- The Outer Rim opt-in burns STAR. The cozy player who never opts in
  loses zero STAR; the gamble-curious player pays once. This is
  acceptable, but every STAR-sink decision after this one must be
  evaluated against "is this still legible to a cozy-only player."

### Risks

- **Oracle dependency.** A bricked or delayed price feed bricks Voyages.
  Mitigated by selecting a fallback feed (Pyth + Chainlink) and by the
  voyage engine being resilient to delayed prices (sliding-window
  resolution).
- **DUST launch sniping.** Mitigated by the 50% first-24h sell tax and
  by a measured LP seed. Tax revenue funds the Star Vault, so the attack
  pays the holders.
- **Equipment-market thinness early.** 333 holders × low Phase-2 adoption
  could mean illiquid Equipment listings. Mitigated by phased rollout —
  Equipment is Phase 2, after a Voyage-only Phase 1 demonstrates demand.
- **Bounty-driven social damage** despite opt-in. Mitigated by per-victim
  daily cap (10), permanent opt-in flag visibility (Privateer status is
  public), and the chat companion's narration framing hits as in-character
  smuggler events rather than personal attacks.
- **Casino-house-edge inflow ties two systems' fates.** A casino exploit
  drains Star Vault funding. Mitigated by the inflow being a fixed
  percentage of *settled* volume, not bankroll, and by the bankroll's
  own commit-reveal RNG defenses already in place.
- **Operator scope-creep risk.** Outer Rim is six new subsystems. Phase
  sequencing (§8) is the primary mitigation; ADR ratification before any
  contract PR is the secondary.

---

## Open Questions

These are the 8 operator-decision items from the source memo §9. Each
blocks at least one downstream PR.

| # | Question | Blocks |
|---|---|---|
| OQ1 | **Two-token ratification.** Approve DUST as a separate transferable ERC-20, or insist on STAR-only Outer Rim (memo §8 fallback)? | `[SWO_OUTER_RIM_DUST_TOKEN_CONTRACT]` |
| OQ2 | **Price oracle.** Pyth Network on Monad (most coverage), Chainlink (newer to Monad), or a custom TWAP over a Monad DEX? Cost / latency / fallback tradeoffs to be detailed in `[SWO_OUTER_RIM_PRICE_ORACLE_RESEARCH]`. | `[SWO_OUTER_RIM_VOYAGE_ENGINE_PURE]` resolution params; contract PR |
| OQ3 | **Voyage cycle length.** Offshore uses 24h. SWO is sleepier — consider 48h? Tunable post-launch but baseline needs to be picked. | Star Vault reducer constants; HUD copy |
| OQ4 | **Branding.** "Outer Rim" / "Cosmic Offshore" / "The Edge" / "Skrumpey Smugglers". Transgressive lane sells on crypto Twitter; safe lane doesn't. Recommend tilting transgressive in marketing, neutral in UI copy. | All Outer Rim copy + the Sanctuary integration design |
| OQ5 | **Equipment art source.** Procedural variation over existing painted SWO sprites? External commission? One-time RD-budget thaw? | `[SWO_OUTER_RIM_EQUIPMENT_DATA_SCHEMA]` cannot finalize without an art pipeline |
| OQ6 | **Faction overlay.** Reuse SWO orders (Order of the Ascendant / Free Stars Collective / Outer Reach Syndicate, per §6) — confirm naming, or invent new factions purely for the Outer Rim? | Faction contract + UI naming |
| OQ7 | **Opt-in bond threshold.** Bond ≥ 25 + 100 STAR feels right. Operator should set exact numbers. | `[SWO_OUTER_RIM_BOUNTY_OPT_IN_DESIGN]` (Letter of Marque cost) |
| OQ8 | **Beta sequencing.** Voyages-alone for 4–6 weeks before Equipment (§8 default), or full-stack drop? | All downstream scheduling |

OQ1 is the gate. Until it resolves, the contract PR cannot ship.

---

## Status

**Proposed.** This ADR ratifies the architecture at the design level so
that the parallel work items (`[SWO_OUTER_RIM_PRICE_ORACLE_RESEARCH]`,
`[SWO_OUTER_RIM_VOYAGE_ENGINE_PURE]`,
`[SWO_OUTER_RIM_EQUIPMENT_DATA_SCHEMA]`,
`[SWO_OUTER_RIM_STAR_VAULT_ENGINE_PURE]`) can begin. It moves to
**Accepted** once operator review resolves OQ1 (two-token ratification)
at minimum; the remaining open questions can be resolved incrementally
as each downstream PR reaches them.

---

## Next Steps (not in scope of this ADR)

1. **Operator review** of this ADR, resolving at minimum OQ1.
2. **`[SWO_OUTER_RIM_PRICE_ORACLE_RESEARCH]`** (P1) — pick canonical feed.
3. **`[SWO_OUTER_RIM_VOYAGE_ENGINE_PURE]`** (P1) — pure state machine.
4. **`[SWO_OUTER_RIM_EQUIPMENT_DATA_SCHEMA]`** (P1) — 42-item catalog.
5. **`[SWO_OUTER_RIM_STAR_VAULT_ENGINE_PURE]`** (P1) — settlement reducer.
6. **`[SWO_OUTER_RIM_DUST_TOKEN_CONTRACT]`** (P2) — ERC-20 + Foundry tests.
7. **`[SWO_OUTER_RIM_BOUNTY_OPT_IN_DESIGN]`** (P2) — Letter of Marque.
8. **`[SWO_OUTER_RIM_SANCTUARY_INTEGRATION_DESIGN]`** (P2) — UX spec.

None of (2)–(8) require contract deployment. The DUST contract ships
after the engines are validated in pure form. Phase 1 beta launch is
voyage-only and gated on (2), (3), (5), (6).

---

## References

- [ADR-001](./SANCTUARY_ADR.md) — Sanctuary architecture baseline.
- [ADR-002](./SANCTUARY_ADR_002_STAR_CURRENCY.md) — STAR soulbound decision.
- [`docs/SANCTUARY_ENGAGEMENT_PLAN.md`](./SANCTUARY_ENGAGEMENT_PLAN.md) —
  7-PR Sanctuary engagement plan (2026-05-18); §7 to be added linking
  Outer Rim per memo §6.2.
- Source memo: `memory/evolution/swo_offshore_protocol_analysis_2026-05-23.md`.
- Offshore Protocol docs: `https://www.offshoreprotocol.fun/docs/{overview,offshore-corporations,enterprise-assets,swiss-vault,factions,hits,dirty-token,season-2,presale-faq}`.
