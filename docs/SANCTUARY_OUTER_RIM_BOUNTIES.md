# SWO Outer Rim — Bounties: the Letter of Marque opt-in PvP layer

**Status:** Proposed (pending operator review)
**Date:** 2026-05-24
**Deciders:** Operator (InverseAltruism), Clarvis (executive function)
**Resolves:** [`[SWO_OUTER_RIM_BOUNTY_OPT_IN_DESIGN]`] (PROJECT:SWO, P2)
**Depends on:** [ADR-003 Outer Rim — Cosmic Offshore Overlay](./SANCTUARY_ADR_003_OUTER_RIM.md) (§5 Bounties, OQ7)
**Extends:** [ADR-002](./SANCTUARY_ADR_002_STAR_CURRENCY.md) (STAR soulbound; this adds one new STAR sink)
**Source memo:** `memory/evolution/swo_offshore_protocol_analysis_2026-05-23.md` **§4.1 Layer D** ("burn-to-steal PvP, opt-in")

---

## 1. Context

ADR-003 §5 ratified that the Outer Rim ships a **Letter of Marque** opt-in
PvP layer: a one-time STAR burn flips a per-Skrumpey flag from Pacifist to
Privateer, and only Privateers can hit or be hit. The source memo's
**§4.1 Layer D** identified burn-to-steal PvP as one of the six mechanics
SWO Sanctuary materially lacks, with the explicit caveat that SWO is a
333-NFT community where every holder roughly knows every other holder, so
mandatory PvP would be socially toxic — hence opt-in.

ADR-003 §5 fixed the headline numbers (hit costs, 80/20 split, 10-hit
daily cap) and deferred the full spec to this document. This doc closes
that gap: it specifies the **state machine**, the **invariants**, the
**economic flows**, the **NPC dialog branching**, the **anti-griefing
cooldown design**, the **failure modes**, and the **operator open
questions** that must resolve before the bounty contract / endpoint PR.

This is a **design doc**, not an implementation. No contract or endpoint
ships here. Like the voyage and Star Vault engines, the bounty resolution
logic should land first as a pure deterministic reducer
(`lib/outer-rim/bounties.ts`, suggested) unit-tested on a synthetic ledger
before any on-chain hit path is wired.

### 1.1 Scope (verbatim from the task)

- (a) 100-STAR sink to flip a per-Skrumpey `is_privateer` flag.
- (b) only-Privateer-can-hit-or-be-hit invariant.
- (c) Random / Targeted / Revenge hit types (35 / 60 / 35 DUST cost, burned).
- (d) 80/20 in-flight DUST split (attacker / victim).
- (e) victim Influence stake → Star Vault.
- (f) 10-hits-per-victim-per-day grief cap.
- (g) NPC dialog branch design (Pacifist vs Privateer).
- (h) anti-griefing cooldown design.

---

## 2. The Letter of Marque flag

### 2.1 The opt-in sink

| Property | Value | Source |
|---|---|---|
| Sink name | `outer_rim_letter_of_marque` | new STAR sink (ADR-002 §"sinks") |
| Cost | **100 STAR**, burned (soulbound; debited from off-chain ledger) | ADR-003 OQ7 baseline |
| Precondition | Outer Rim already opted-in (bond ≥ 25 + 100 STAR per ADR-003 §1) | ADR-003 §1 |
| Flag | `is_privateer: bool`, per-Skrumpey, on-chain | ADR-003 §5.1 |
| Direction | Pacifist → Privateer | §3 state machine |
| Reversibility | **Permanent** at launch. Opt-out is out of scope (see OQ-B3). | ADR-003 §5.1 |

The Letter of Marque cost (100 STAR) is **separate from and additional to**
the Outer Rim opt-in cost (100 STAR + bond ≥ 25). A holder can voyage,
mint Equipment, and claim Star Vault yield as a **Pacifist** forever; the
Letter of Marque is a second, deliberate consent gate purely for PvP
exposure. This double-consent is the core social-safety design: nobody is
ever hit without having personally spent STAR to enter the arena.

`is_privateer` is **soulbound to the Skrumpey, not the wallet**. If a
Privateer Skrumpey is sold, the buyer inherits Privateer status (the flag
travels with the NFT). This is surfaced in the marketplace listing (see
§7 failure mode F4) so a cozy buyer is not surprised into the arena.

### 2.2 Why STAR (soulbound), not DUST

The opt-in must be a **commitment signal**, not a **liquid wager**. Paying
in DUST would let a whale flip Privateer for pocket change and would make
the flag a tradable side-effect of market position. Paying in STAR — which
is soulbound, earned through engagement, and never re-acquirable on a
market (ADR-002) — means the cost is **personal time and care**, not
capital. That is the right gate for a decision that exposes a holder's
social standing in a 333-person community. Consistent with ADR-002's
"engagement-not-yield" posture: STAR gates *intent*, DUST settles *value*.

---

## 3. State machine

The Letter of Marque flag is a two-state machine per Skrumpey. A hit is a
*transaction* against a live voyage, not a state of the Skrumpey, so hits
are modeled as transitions on a transient **voyage** sub-state, not on the
Skrumpey flag. Both are listed below so every transition is enumerated.

### 3.1 Skrumpey flag states

```
            100 STAR burn (outer_rim_letter_of_marque)
            + Outer-Rim-opted-in + bond ≥ 25
   ┌────────┐ ───────────────────────────────────────────▶ ┌───────────┐
   │PACIFIST│                                                │ PRIVATEER │
   │(default)│ ◀───────────────────────────────────────────  │           │
   └────────┘     (opt-out — NOT shipped at launch; OQ-B3)   └───────────┘
        │                                                          │
        │ cannot hit / cannot be hit                               │ can hit + can be hit
        │ (invariant §4)                                           │ (subject to cooldowns §6)
```

### 3.2 Every transition (Pacifist ↔ Privateer and voyage sub-states)

| # | From | To | Trigger | Guard conditions | Effects |
|---|---|---|---|---|---|
| T1 | Pacifist | Privateer | `POST /api/outer-rim/letter-of-marque` | Outer-Rim opted-in; bond ≥ 25; STAR balance ≥ 100; not already Privateer | Burn 100 STAR; set `is_privateer=true`; emit `LetterOfMarqueIssued`; flip NPC dialog branch (§5); unlock mast-flag cosmetic |
| T2 | Privateer | Privateer | repeat opt-in attempt | already Privateer | **No-op, rejected** — STAR is NOT burned twice (idempotency guard, failure mode F7) |
| T3 | Pacifist | Pacifist | hit attempt by/against a Pacifist | — | **Rejected** by invariant §4 (no state change, no DUST burned) |
| T4 | Privateer | Privateer (opt-out) | future opt-out endpoint | **NOT shipped at launch** | Out of scope — see OQ-B3 |
| T5 | Privateer | Privateer | NFT transfer / sale | flag soulbound to Skrumpey | Buyer inherits `is_privateer=true`; marketplace surfaces it (F4) |

Voyage sub-state (transient, per live voyage; the actual PvP action):

| # | Voyage state | Event | Guard | Result |
|---|---|---|---|---|
| V1 | `IN_FLIGHT` | hit lands | attacker & victim both Privateer; victim voyage live; cooldowns OK; daily cap not hit; not self-hit | → `INTERRUPTED`; 80/20 DUST split; Influence stake → Star Vault; increment victim daily-hit counter; record attacker for Revenge eligibility |
| V2 | `IN_FLIGHT` | hit attempted | any guard in V1 fails | hit **rejected**, DUST cost refunded to attacker (not burned), voyage stays `IN_FLIGHT` (failure modes §7) |
| V3 | `IN_FLIGHT` | voyage completes/fails normally | no hit landed first | → `SETTLED` / `LIQUIDATED` per voyage engine; no PvP interaction |
| V4 | `INTERRUPTED` | — | terminal | voyage cannot be hit again (already resolved) |

The **only** way to enter Privateer is T1 (a deliberate 100-STAR burn).
There is **no implicit** Pacifist→Privateer path — opting into the Outer
Rim does not flip the flag; voyaging does not flip it; being targeted does
not flip it. This is the load-bearing safety property.

---

## 4. The only-Privateer invariant

> **A hit may land if and only if BOTH the attacker Skrumpey and the
> victim Skrumpey have `is_privateer == true` at the instant of
> resolution, and the attacker is not the victim.**

Formally, for a hit `h(attacker A, victim voyage v owned by V)`:

```
landable(h) ⟺  A.is_privateer
            ∧  V.is_privateer
            ∧  A ≠ V
            ∧  v.state == IN_FLIGHT
            ∧  cooldowns_ok(A, V)        (§6)
            ∧  V.hits_today < 10         (§6 cap)
```

- The flag is checked **at resolution time**, not at hit-initiation time.
  This closes the race in failure mode F3 (victim is mid-flip — but since
  opt-out is not shipped, the only live race is *into* Privateer, which can
  only **enable** a hit, never strand one; see F3).
- A Pacifist is invisible to the entire hit surface: a Pacifist Skrumpey
  never appears in the Targeted dropdown, is never selected by Random, and
  cannot itself initiate a hit (the hit UI is gated behind `is_privateer`).
- Self-hits are rejected (T-table V1 guard `A ≠ V`): you cannot farm your
  own voyages.

---

## 5. NPC dialog branch design (Pacifist vs Privateer)

Privateer status is not just a mechanical flag — ADR-003 §5.2 requires it
to "flip NPC dialog branches, unlock a mast-flag cosmetic, and surface in
the chat companion's voice." This section specifies the branching.

### 5.1 Branch key

The companion-chat system prompt and the Outer Rim NPC (the "Harbormaster")
both read `is_privateer` as a boolean branch key. Two persona overlays:

| Branch | Persona overlay | Tone |
|---|---|---|
| **Pacifist** | "honest hauler" | The companion treats voyages as legitimate trade runs. The Harbormaster offers the Letter of Marque once, as a *choice*, never nags. Framing: cozy, safe, "you don't have to fight out here." |
| **Privateer** | "letter-bearing corsair" | The companion narrates hits as in-character smuggler raids ("we jumped the *Comet's Tail* off the Nebula Pass — took 80% of her cargo"). The Harbormaster greets the player as a fellow privateer, surfaces revenge opportunities, and references the mast-flag. |

### 5.2 Branch points (where dialog forks)

| Dialog moment | Pacifist line intent | Privateer line intent |
|---|---|---|
| First Outer Rim entry | "Trade's good out here if you keep your head down." | (n/a — already chose the flag) |
| Harbormaster greeting | Offers Letter of Marque **once**, framed as opt-in choice; respects "no". | Greets as corsair; mentions open bounties / recent attackers. |
| On voyage success | "Brought home N DUST, clean run." | "Clean run — unless someone's eyeing our cargo." |
| On being hit (victim) | **Never fires** (Pacifists can't be hit). | "We got boarded — the *X* took 80% of the haul. Want to settle the score?" (surfaces Revenge, §"hit types"). |
| On landing a hit (attacker) | **Never fires.** | "Cargo's ours. The *X* won't forget this." |
| Idle / ambient | Cozy trade-run flavor. | Corsair flavor; occasional "the seas are quiet… too quiet." |

### 5.3 Companion-voice safety rail

The companion **always frames hits as in-character smuggler events, never
as personal attacks on the holder behind the victim Skrumpey** (ADR-003
"Risks" → bounty-driven social damage mitigation). This framing is a
non-negotiable system-prompt constraint, not a flavor preference: it is
the narrative half of the anti-griefing design (§6 is the mechanical half).

The Pacifist branch must **never** generate hit/raid narration even if the
LLM is prompted toward it — the branch key hard-gates the persona overlay
server-side before the prompt is assembled.

---

## 6. Anti-griefing: cooldowns and caps

ADR-003 §5.2 fixes one cap (10 hits/victim/day). A single cap is
insufficient — it bounds *total* damage to one victim but not *velocity*,
*concentration* (one attacker monopolizing a victim), or *retaliation
spirals*. This section specifies the full anti-griefing surface.

### 6.1 Caps and cooldowns

| Control | Value (baseline, operator-tunable) | Purpose | Resets |
|---|---|---|---|
| **Per-victim daily cap** | 10 hits / victim / 24h | Bounds total damage absorbed (ADR-003 §5.2) | Rolling 24h |
| **Per-attacker→victim cooldown** | 1 hit / (attacker,victim) pair / 4h | Stops one attacker monopolizing/harassing one victim | Per-pair, rolling 4h |
| **Per-attacker global cooldown** | 1 hit / attacker / 15 min | Rate-limits a single aggressor across all victims | Rolling 15 min |
| **New-Privateer grace window** | No hits *against* a Skrumpey for 24h after T1 | Lets a fresh Privateer learn the surface before exposure | One-time, post-flip |
| **Revenge eligibility window** | Revenge hit allowed only within 24h of being hit by that specific attacker | Bounds retaliation to recent, relevant grievances | Per-incident |
| **Voyage-level immunity** | Sprint (5-min) voyages are **un-hittable** | A 5-min binary voyage is too short to meaningfully interrupt; only Run/Expedition voyages are hittable | n/a (structural) |

### 6.2 Why these specific controls

- **Daily cap alone fails** against a coordinated trio: three attackers
  could each land their share against one victim. The **per-pair 4h
  cooldown** + **15-min global cooldown** together cap the *velocity* and
  prevent any single attacker from being the sole source of a victim's
  10 daily hits.
- **Grace window** prevents the "flip Privateer → instantly farmed by
  veterans camping the new-Privateer event feed" trap.
- **Revenge window** keeps the Revenge hit type (§ hit types) tied to a
  *recent* grievance rather than letting it become a permanent free
  targeting license against an old rival.
- **Sprint immunity** removes the degenerate case of hit-spamming the
  highest-frequency voyage tier.

### 6.3 Cap accounting

The daily-hit counter is keyed on the **victim Skrumpey** and increments
on hit *resolution* (V1), not on hit *initiation*. A rejected/refunded hit
(V2) does **not** consume cap — otherwise an attacker could exhaust a
victim's "hittable" budget with deliberately-failing hits to make them
un-hittable… but also un-grievable, which is fine; we choose **not** to
charge cap on rejected hits so that a victim's protection is never
*reduced* by a failed attack. The cap protects the victim; only successful
boardings count against it.

---

## 7. Failure modes

Each row is a concrete race or edge case, the chosen resolution, and which
state-machine guard (§3) enforces it. **At least five required by
acceptance; nine listed.**

| # | Failure mode | Resolution | Enforced by |
|---|---|---|---|
| **F1** | **Target Skrumpey's voyage completes/fails between hit-initiation and resolution** | Hit checks `v.state == IN_FLIGHT` at resolution; if `SETTLED`/`LIQUIDATED`/`INTERRUPTED`, hit is **rejected, DUST cost refunded** (not burned). | V2 / V3 guard |
| **F2** | **Target Skrumpey is unequipped (no active Equipment loadout) mid-hit** | A voyage requires an active loadout to *run* (ADR-003 §4.1). If the loadout is removed mid-voyage, the voyage itself is already invalid; the hit resolves against the **in-flight DUST as of interruption** and is otherwise normal. If no voyage is live, there is nothing to hit → reject + refund (F1 path). | V2 guard |
| **F3** | **Victim flips Privateer (T1) during an in-flight hit against… (race into the arena)** | Flag checked at resolution. Flipping *into* Privateer can only **enable** a hit, never strand one. There is no opt-out at launch, so there is no "flip out mid-hit" race. If the attacker initiated against a then-Pacifist (impossible — Pacifists aren't selectable), it is rejected; if the victim becomes Privateer after selection, the hit proceeds only if it was selectable (it wasn't) → net: no broken state. | §4 resolution-time check; T4 not shipped |
| **F4** | **Target Skrumpey is sold mid-hit (ownership changes)** | `is_privateer` is soulbound to the Skrumpey, not the wallet (T5), so the flag and any in-flight voyage travel with the NFT. The 80% DUST goes to the **attacker**; the 20% + the consequences accrue to the **current owner** of the victim Skrumpey at resolution. Marketplace listing surfaces "Privateer (PvP-enabled), active voyage" so a buyer is not blindsided. | T5; marketplace integration |
| **F5** | **Attacker's DUST balance drops below hit cost between initiation and resolution** | Hit cost is **escrowed/debited at initiation**, not at resolution. If balance is insufficient at initiation, the hit never starts. No mid-flight balance race. | initiation-time debit |
| **F6** | **Victim already at 10/day cap when a new hit is initiated** | Reject at initiation (cap is read before escrow), refund nothing because nothing was escrowed. UI greys out capped victims in the Targeted dropdown; Random skips them. | §6 cap; V2 guard |
| **F7** | **Double opt-in (repeat Letter of Marque purchase)** | Idempotency guard: if `is_privateer` already true, reject the second purchase, do **not** burn STAR a second time. | T2 |
| **F8** | **Self-hit (attacker == victim owner) via Random landing on own voyage** | Random selection excludes the caller's own live voyages; if a race slips one through, resolution guard `A ≠ V` rejects + refunds. | §4 `A ≠ V`; V2 |
| **F9** | **Two attackers hit the same victim voyage simultaneously** | Voyage interruption is a single atomic state transition (`IN_FLIGHT → INTERRUPTED`). First writer wins; the second hit sees `INTERRUPTED` (not `IN_FLIGHT`) → rejected + refunded (F1 path). The 80% goes to the first attacker only. | V4 terminal state; atomic transition |

---

## 8. Economic flows (summary)

ADR-003 §5.2 fixes the numbers; restated here as the authoritative ledger
spec for the reducer.

### 8.1 Per hit

| Flow | Amount | Direction |
|---|---|---|
| Hit cost (Random / Targeted / Revenge) | **35 / 60 / 35 DUST** | Attacker → **burned** |
| In-flight DUST split (attacker share) | **80%** of victim's in-flight DUST | Victim voyage → Attacker |
| In-flight DUST split (victim share) | **20%** of victim's in-flight DUST | Stays with victim |
| Victim Influence stake | **100%** of the interrupted voyage's Influence stake | Victim → **Star Vault** (per ADR-003 §4.3 source 1) |

- The hit **cost** is *burned* (deflationary on DUST, consistent with
  ADR-003 §1.2 BURNER_ROLE held by the hit contract).
- The **in-flight DUST** is *transferred* 80/20, not burned — it is the
  smuggled cargo changing hands.
- The victim **Influence** stake routes to the Star Vault exactly as a
  failed voyage would (ADR-003 §4.3), so a successful hit is, from the
  Star Vault's perspective, equivalent to the victim having failed the
  voyage. This keeps the §4 reducer's inputs uniform.

### 8.2 Cost-vs-reward sanity

- Random (35 DUST) is the cheapest but blind — expected value depends on
  the in-flight DUST of a *random* live Privateer voyage.
- Targeted (60 DUST) is priced higher because the attacker picks a fat
  cargo — a deliberate premium for information.
- Revenge (35 DUST) matches Random's cost but is gated to a recent
  attacker (§6) — a discounted, emotionally-priced strike-back.

The cost asymmetry (Targeted = 60 vs Random/Revenge = 35) is verbatim from
the source memo §4.1 Layer D / ADR-003 §5.2 and is operator-tunable
(OQ-B1).

---

## 9. Open questions (operator decisions)

**At least three required by acceptance; six listed.** Each blocks or
shapes the bounty contract / endpoint PR.

| # | Question | Default proposed here | Blocks |
|---|---|---|---|
| **OQ-B1** | **Cost tuning.** Confirm Letter of Marque = 100 STAR and hit costs 35/60/35 DUST, or retune? The memo numbers are Offshore-derived; SWO's smaller economy may want different absolutes. | 100 STAR; 35/60/35 DUST (ADR-003 baseline) | Sink constant, hit-contract burn amounts |
| **OQ-B2** | **Daily cap + cooldowns.** Confirm 10/victim/day, 4h per-pair, 15-min global, 24h grace, 24h revenge window? These are proposed here, not in ADR-003. | As §6.1 | Anti-grief reducer constants |
| **OQ-B3** | **Opt-out.** Should Privateer ever be reversible (e.g. a STAR-burn "retire the Letter" with a cooldown), or is it permanent at launch? Permanent is simpler and matches ADR-003 §5.1; reversible is kinder but adds a flip-flop griefing surface. | **Permanent at launch**; opt-out deferred | Whether T4 ships; UI copy |
| **OQ-B4** | **Sprint immunity.** Confirm 5-min Sprint voyages are un-hittable (proposed §6.1), or are all voyage tiers hittable? | Sprint immune | Hit target-selection filter |
| **OQ-B5** | **Inherited Privateer on sale.** Flag is soulbound-to-Skrumpey (T5) → a buyer inherits PvP exposure. Acceptable, or should a sale auto-reset to Pacifist (refunding nothing)? Auto-reset is safer for cozy buyers but breaks "flag is permanent." | **Inherit** + marketplace disclosure (F4) | Marketplace integration, transfer hook |
| **OQ-B6** | **Mast-flag cosmetic.** Privateer unlocks a mast-flag cosmetic (ADR-003 §5.2). Procedural over existing sprites, or a one-off commissioned asset? (Mirrors ADR-003 OQ5 for Equipment art.) | TBD — defer to art pipeline decision | Cosmetic asset, `cosmetic_items.json` entry |

---

## 10. Implementation sketch (not in scope of this doc)

For the downstream PR, in dependency order:

1. **`lib/outer-rim/bounties.ts`** — pure deterministic reducer:
   `resolveHit(state, hit) → { newState, ledgerDeltas, rejected? }`.
   Unit-tested on a synthetic ledger covering every §7 failure mode and
   every §3 transition. No network, no contract. Mirrors the discipline of
   `lib/outer-rim/voyage.ts` and `lib/outer-rim/star-vault.ts`.
2. **`is_privateer` flag storage** — added to the Skrumpey state schema
   (off-chain ledger now; on-chain flag when the bounty contract ships).
3. **`POST /api/outer-rim/letter-of-marque`** — opt-in endpoint (T1),
   burns 100 STAR via the existing STAR-spend path (ADR-002), idempotent (T2/F7).
4. **`POST /api/outer-rim/hit`** — Random/Targeted/Revenge, escrows DUST at
   initiation (F5), resolves through the reducer, applies cooldowns (§6).
5. **NPC dialog branch** — `is_privateer` branch key wired into the
   companion system prompt + Harbormaster (§5), with the Pacifist
   no-raid-narration hard gate.
6. **Bounty contract** — on-chain `is_privateer` flag + DUST burn/transfer,
   after the reducer is validated. Out of scope here.

The reducer (1) is the only piece that should land before operator review
resolves the §9 open questions, since it is pure and the constants are
parameters.

---

## 11. Acceptance self-check

| Criterion | Where |
|---|---|
| (a) doc exists | this file |
| (b) cites memo §4.1 Layer D | header "Source memo", §1, §8.2 |
| (c) §"State machine" lists every transition (Pacifist↔Privateer) | §3 (T1–T5, V1–V4) |
| (d) §"Failure modes" lists ≥ 5 (unequipped, sold, Privateer-flip mid-hit) | §7 (F1–F9; F2 unequipped, F4 sold, F3 flip-race) |
| (e) §"Open questions" lists ≥ 3 operator decisions | §9 (OQ-B1 … OQ-B6) |

---

## References

- [ADR-003 Outer Rim](./SANCTUARY_ADR_003_OUTER_RIM.md) — §5 Bounties, §4 Star Vault, OQ7.
- [ADR-002 STAR Currency](./SANCTUARY_ADR_002_STAR_CURRENCY.md) — STAR soulbound; engagement-not-yield posture.
- [SWO Outer Rim — Price Oracle Selection](./SANCTUARY_OUTER_RIM_PRICE_ORACLE.md) — sibling Outer Rim design doc (format reference).
- Source memo: `memory/evolution/swo_offshore_protocol_analysis_2026-05-23.md` §4.1 Layer D.
- Offshore Protocol docs: `https://www.offshoreprotocol.fun/docs/hits`.
</content>
</invoke>
