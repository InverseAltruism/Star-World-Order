# SWO Outer Rim — Sanctuary / Companion UX Integration

**Status:** Proposed (pending operator review)
**Date:** 2026-05-24
**Deciders:** Operator (InverseAltruism), Clarvis (executive function)
**Resolves:** `[SWO_OUTER_RIM_SANCTUARY_INTEGRATION_DESIGN]` (PROJECT:SWO, P2)
**Depends on:** [ADR-003 Outer Rim — Cosmic Offshore Overlay](./SANCTUARY_ADR_003_OUTER_RIM.md), `[SWO_OUTER_RIM_BOUNTY_OPT_IN_DESIGN]` ([`SANCTUARY_OUTER_RIM_BOUNTIES.md`](./SANCTUARY_OUTER_RIM_BOUNTIES.md), PR #359)
**Binding direction:** `memory/evolution/swo_sanctuary_companion_first_2026-04-26.md` (the cozy-mode "companion-first" direction — see §1.1)
**Blocks:** Phase-3 Outer Rim tab implementation PRs (per ADR-003 §8).

---

## 1. Context

ADR-003 ratified the Outer Rim as an **opt-in expansion layer** running
alongside the cozy Sanctuary loop: "Two surfaces, one Skrumpey, shared
economy. Sanctuary stays exactly as it is for the cozy player. The Outer Rim
is a new tab on the Companion screen, gated behind a STAR-burn opt-in"
(ADR-003 §"Decision", item 1). The bounty opt-in spec
([`SANCTUARY_OUTER_RIM_BOUNTIES.md`](./SANCTUARY_OUTER_RIM_BOUNTIES.md)) defined
the **Letter of Marque** flag — a permanent per-Skrumpey on-chain flag flipping
Pacifist → Privateer (ADR-003 §5.1).

This document is the UX spec that ADR-003 §8 Phase 3 and the Next-Steps list
item (8) call for. It says **exactly** how the Outer Rim surfaces inside the
existing Companion screen (`app/sanctuary/CompanionView.tsx`) and Sanctuary
world HUD (`components/sanctuary/overlays/CompanionHUD.tsx`) **without**
disturbing the cozy loop for the holder who never opts in.

### 1.1 The binding cozy-mode direction

The 2026-04-26 companion-first memo
(`memory/evolution/swo_sanctuary_companion_first_2026-04-26.md`) is the
binding direction for everything below. Its load-bearing rule: **the cozy
companion loop is the product's front door, and a holder who only ever wants
to feed/pet/talk must never be confronted with markets, leverage, or
liquidation language.** ADR-003 §"Constrains" restates it as the standing
test every STAR-sink decision is measured against — *"is this still legible to
a cozy-only player."* This doc treats that memo as a hard constraint, not a
preference: every Outer Rim surface defined here is **conditionally rendered
on the Privateer flag** and is invisible (not merely disabled) for the
Pacifist default. See §5 "Cozy-mode protection".

### 1.2 What exists today (grounding)

The Companion screen is a single client component reached via `?v=2`
(`app/sanctuary/SanctuaryRouter.tsx` → `CompanionView`). There is no
`/sanctuary/companion` route segment yet; "the Companion screen" in ADR-003
means `CompanionView.tsx`. Its main area is already a small in-place view
state machine:

- `CompanionView.tsx:237` — `const [view, setView] = useState<'companion' | 'quests' | 'shop'>('companion')`.
- `CompanionView.tsx:813-832` — when `view !== 'companion'`, the sprite/needs
  grid is replaced by a `swo-panel-frame` panel with a back button and the
  inline `QuestBoard` / `ShopDialog`.
- `CompanionView.tsx:1354-1377` — the **EXPLORE** `pixel-card` is the launcher
  grid (`🗺️ QUESTS`, `🛍️ SHOP`) that calls `setView(...)`.

The world HUD (`CompanionHUD.tsx`) is a layer of absolutely-positioned badges
over the Phaser canvas:

- `CompanionHUD.tsx:371-382` — STAR badge (`top-2 right-2`).
- `CompanionHUD.tsx:388-410` — streak chip (`top-2 right-24`).
- `CompanionHUD.tsx:496-528` — the **Quest away-state panel** (`top-14 left-2`)
  with `formatCountdown()` (`CompanionHUD.tsx:84-95`) — the existing countdown
  pattern the voyage chip mirrors.

These are the exact extension points the spec targets.

---

## 2. Surface inventory

| # | Surface | File | Privateer-gated? | Mockup |
|---|---|---|---|---|
| S1 | "Outer Rim" tab on the Companion screen | `CompanionView.tsx` (`view` machine + EXPLORE grid) | **Yes** | §6 M1 |
| S2 | Voyage HUD chip (countdown + liquidation risk) | `CompanionHUD.tsx` | **Yes** | §6 M2 |
| S3 | Equipment tab + grid | new `EquipmentPanel.tsx` (mirrors `ShopDialog`) | **Yes** | §6 M3 |
| S4 | Voyage-outcome journal voice | journal entries (existing renderer) | **Yes** (privateer-only entry types) | §6 M4 |
| S5 | Sanctuary (default companion view) | `CompanionView.tsx:833-1388` | No — unchanged | — |

The Privateer flag is read once per screen mount from a new
`GET /api/sanctuary/outer-rim/status?address=…` returning
`{ privateer: boolean, optInPending: boolean }`. Everything Privateer-gated
keys off that single boolean so cozy-mode protection (§5) has one chokepoint.

---

## 3. S1 — the "Outer Rim" tab

### 3.1 Where it lives

Extend the `view` union to `'companion' | 'quests' | 'shop' | 'outer-rim'`
(`CompanionView.tsx:237`) and add an EXPLORE launcher tile **only when
`privateer === true`**. The EXPLORE grid (`CompanionView.tsx:1359`) is today a
`grid grid-cols-2`; for a Privateer it becomes a third tile:

```
EXPLORE
┌──────────┬──────────┬──────────┐
│  🗺️       │  🛍️       │  🛰️       │
│  QUESTS  │  SHOP    │ OUTER RIM│   ← rendered only if privateer
└──────────┴──────────┴──────────┘
```

For the Pacifist default the grid is byte-for-byte the current two-tile
layout — no greyed-out tile, no "unlock" teaser (that would violate §1.1).
Opt-in discovery happens elsewhere (a one-line entry point in the Shop or a
DAO announcement), never as dangling UI in the cozy view.

### 3.2 Tab contents

When `view === 'outer-rim'`, reuse the existing back-panel chrome
(`CompanionView.tsx:813-825`: the `swo-panel-frame` + `‹ #token` back button)
with header `🛰️ OUTER RIM`. The panel hosts a sub-tab strip:

- **Voyages** — list active/available voyages (Sprint / Run / Expedition per
  ADR-003 §2 table), each with the same `formatCountdown` clock used by the
  HUD chip and a Launch button costing Influence.
- **Equipment** — the loadout grid (§4, S3).
- **Factions / Bounties** — Phase-3; link out to the Letter-of-Marque status
  (Privateer flag is already set if you can see this tab) and the
  hit/faction surfaces specified in
  [`SANCTUARY_OUTER_RIM_BOUNTIES.md`](./SANCTUARY_OUTER_RIM_BOUNTIES.md).

Copy register: ADR-003 OQ4 recommends "transgressive in marketing, neutral in
UI copy." This tab uses the neutral lane — "Outer Rim", "Voyage", "Haul",
"Detection" — never "rug", "degen", etc.

---

## 4. S3 — Equipment tab + grid (mirrors the cosmetic shop)

Equipment is the second NFT layer (ADR-003 §3). Its grid **mirrors the
cosmetic shop layout** so a player who has used the Shop already knows how to
read it. The cosmetic shop is `ShopDialog.tsx`, rendered inline at
`CompanionView.tsx:829-831` (`<ShopDialog inline … />`).

- New component `components/sanctuary/overlays/EquipmentPanel.tsx`, taking the
  same `inline / walletAddress / tokenId` props as `ShopDialog` so it drops
  into the Outer Rim panel exactly like the shop drops into `view === 'shop'`.
- Grid: 6 slot rows (Vessel / Crew / Cloaking / Cargo / Quartermaster /
  CommsBlackout per ADR-003 §3.1), each a horizontally-scrollable row of the
  7 assets for that slot, cards styled like the cosmetic cards (rarity border
  colors: Common→Mythic, ADR-003 §3.4).
- Each card shows the 6 stats (ADR-003 §3.3) and the **output↔detection
  tradeoff** inline (e.g. "+Haul / +Detection") so the core mechanic is
  legible at the card level, not buried.
- Costs are denominated in **DUST** (mint/repair), never STAR — DUST only ever
  appears behind the Privateer flag, satisfying §5.
- Catalog source: `data/sanctuary/outer_rim_equipment.json`
  (`[SWO_OUTER_RIM_EQUIPMENT_DATA_SCHEMA]`), mirroring
  `data/sanctuary/cosmetic_items.json` the shop reads.

---

## 5. Cozy-mode protection

This section enumerates **which surfaces stay unchanged for a non-opted-in
(Pacifist) user**, per the §1.1 binding direction. For a wallet whose active
Skrumpey has `privateer === false`, all of the following are byte-identical to
today's behaviour:

| Surface | File / lines | Guarantee for Pacifist |
|---|---|---|
| Default landing view | `CompanionView.tsx:833-1352` | Sprite + needs + actions + journal + chat render exactly as now. No new chrome. |
| EXPLORE launcher | `CompanionView.tsx:1359` | Stays a 2-tile grid (`QUESTS`, `SHOP`). No third tile, no greyed teaser. |
| Quick-action feedback copy | `CompanionView.tsx:191-211` (`actionFeedbackMessage`) | Never references DUST, voyages, liquidation, factions, or bounties. |
| Care-action journal entries | journal renderer `CompanionView.tsx:1256-1285` | Only cozy entry types surface; voyage/bounty entry types are filtered out server-side for Pacifists. |
| World HUD | `CompanionHUD.tsx:368-566` | STAR badge, streak chip, quest panel, journal/traits buttons render as now. **No voyage chip** (§7). |
| Currency shown | STAR only | DUST/MON balances never appear. The STAR badge (`CompanionHUD.tsx:371`) is unchanged. |
| Chat companion voice | `/api/sanctuary/companion/chat` system prompt | Privateer-only lore (smuggling, patrols, hauls) is gated behind the flag in the prompt builder; a Pacifist's companion never volunteers it. |

### 5.1 The cozy-mode invariant (care actions)

**Care actions (feed / pet / talk / sleep / play) never reference DUST or
voyages unless the privateer flag is set.** This is enforced in two places so
it cannot regress:

1. **Client:** `actionFeedbackMessage` (`CompanionView.tsx:191`) and the
   `ACTION_REACTION_EMOJI` map (`CompanionView.tsx:84`) contain only cozy
   strings/emoji. Any Outer-Rim flavor is a *separate* code path keyed on the
   flag, never spliced into these.
2. **Server:** the journal entry written for a care action uses a cozy
   `entry_type`; voyage outcomes (§6 M4) use a distinct `entry_type` that the
   journal fetch filters out when `privateer === false`.

A regression here is a §1.1 violation, so §8 makes it a named test case.

---

## 6. Mockups

Sketch-level only — no RD spend (ADR-003 OQ5 keeps Equipment art unfunded).
ASCII wireframes referencing the real components they extend.

### M1 — Outer Rim tab (extends `CompanionView.tsx` `view` machine)

```
‹ #1234                                   🛰️ OUTER RIM
─────────────────────────────────────────────────────
[ VOYAGES ]  EQUIPMENT   FACTIONS
─────────────────────────────────────────────────────
 SPRINT   ▸ Quick contraband run   2,500×   ⏱ 04:12   [LAUNCH 5⚙]
 RUN      ▸ Cargo haul               750×   ⏱ READY   [LAUNCH 5⚙]
 EXPED.   ▸ Long Haul                250×   idle       [LAUNCH 5⚙]

 Star Vault: next settlement in 18h 22m · your cleaned DUST: 312
```
Chrome reused: the `swo-panel-frame` back-panel at `CompanionView.tsx:813-832`.
Clock reused: `formatCountdown` (`CompanionHUD.tsx:84`). `⚙` = Influence.

### M2 — Voyage HUD chip (new badge in `CompanionHUD.tsx`)

```
 ┌─ top-2 right-2 ──────────────┐
 │  ⭐ 1,204                     │   ← existing STAR badge (line 371), untouched
 └──────────────────────────────┘
 ┌─ top-14 left-2 ──────────────┐
 │  🛰️ RUN · ⏱ 21:47           │
 │  ▰▰▰▰▱▱  risk: ⚠ 0.6%       │   ← liquidation-risk indicator
 └──────────────────────────────┘
```
Placement mirrors the existing **Quest away-state panel**
(`CompanionHUD.tsx:496-528`) — same `top-14 left-2` slot family, same
countdown helper. The risk bar reads live from the price oracle
([`SANCTUARY_OUTER_RIM_PRICE_ORACLE.md`](./SANCTUARY_OUTER_RIM_PRICE_ORACLE.md)):
distance from current price to the leverage-derived liquidation threshold
(ADR-003 §2), green→amber→red as the margin shrinks. Renders **only when
`privateer === true` AND a voyage is in flight**; otherwise the slot is empty
exactly as today.

### M3 — Equipment grid (mirrors `ShopDialog.tsx`)

```
 EQUIPMENT — Loadout 1                          DUST 312
 ─────────────────────────────────────────────────────
 VESSEL      [Common ]  [Rare* ]  [Mythic ]  →  (scroll)
             Haul +4    Haul +9    Haul +22
             Det. +2    Det. +5    Det. +12
 CREW        [ ... 7 asset cards ... ]
 CLOAKING    [ ... ]    ← Stealth-heavy, lowers Detection
 CARGO / QUARTERMASTER / COMMSBLACKOUT ...
```
Card chrome and inline-panel mounting mirror the cosmetic shop
(`<ShopDialog inline …>` at `CompanionView.tsx:829`). Rarity border palette per
ADR-003 §3.4; every card shows the output↔Detection tradeoff (§4).

### M4 — Voyage-outcome journal voice

The companion narrates voyages in the **same journal** the cozy loop writes to
(`CompanionView.tsx:1256-1285`), in first-person companion voice — the single
lore bridge ADR-003 §2 calls out. Examples:

```
 ✦ We slipped past the patrols tonight; brought home 78 DUST.
 ✦ The Nebula Pass got hot — we bailed early, lost the stake. We'll try again.
 ✦ A Privateer tailed us out of the Run. Cost us 80% of the haul. I noted their colors.
```
These use a privateer-only `entry_type`, filtered out for Pacifists (§5.1), so
a cozy player's journal stays "fed you a snack 🍎"-shaped and never mentions
DUST.

---

## 7. The voyage HUD chip — detail

- **Data:** poll/subscribe to active voyage state; reuse `formatCountdown`
  (`CompanionHUD.tsx:84-95`) verbatim for the clock.
- **Liquidation-risk indicator:** a small bar + percentage = current margin to
  the liquidation threshold, sourced from the price oracle. Color thresholds:
  green ≥ 2× safety margin, amber within 1–2×, red < 1× (imminent). This is
  the "the market is the game's pulse" hook ADR-003 §7.4 argues for, surfaced
  passively so a lurking holder gets pulled back ("MON just dumped — is my Long
  Haul ok?").
- **Gating:** wrapped in `privateer && voyageInFlight`. No flag → the slot
  never mounts. This keeps the HUD identical for cozy holders (§5).
- **Non-blocking:** `pointer-events-auto` only on the chip itself (matching the
  quest panel), so it never eats canvas clicks.

---

## 8. Test cases — privateer-flag UX

Vitest/RTL component tests against `CompanionView` and `CompanionHUD` with a
mocked `outer-rim/status` response. Three flag states drive the matrix:

### 8.1 Toggle visible (Privateer, `privateer === true`)
1. `OuterRimTab.visible` — EXPLORE grid renders the 3rd `🛰️ OUTER RIM` tile;
   clicking it sets `view === 'outer-rim'`.
2. `VoyageChip.visibleWhenInFlight` — with a mocked in-flight voyage, the HUD
   renders the voyage chip with countdown + risk indicator.
3. `EquipmentGrid.rendersSixSlots` — Equipment sub-tab renders 6 slot rows.
4. `JournalVoice.voyageEntryShown` — a voyage-outcome `entry_type` is rendered
   in the journal list.

### 8.2 Toggle hidden (Pacifist, `privateer === false` — the default)
1. `OuterRimTab.absent` — EXPLORE grid renders **exactly 2 tiles**; no 3rd
   tile, no greyed/teaser node in the DOM (assert query returns null).
2. `VoyageChip.absent` — even if a stray voyage payload is present, the HUD
   renders no voyage chip (flag is the gate, not the payload).
3. `CozyInvariant.noDustInCareCopy` — fire each care action (feed/pet/talk/
   sleep/play); assert the feedback string and journal entry contain no
   "DUST" / "voyage" / "liquidation" / "Privateer" substrings (§5.1).
4. `Currency.starOnly` — only the STAR badge renders; no DUST/MON badge.

### 8.3 Mid-opt-in state (`optInPending === true`)
The opt-in burns STAR on-chain (ADR-003 §5.1); there is a window between the
tx submit and the flag confirming. The UX must not flicker the cozy↔Outer-Rim
surfaces during it.
1. `MidOptIn.tabShowsPending` — the Outer Rim entry point (wherever opt-in is
   offered) shows a "Signing Letter of Marque…" pending state, disabled, not a
   live Outer Rim tab.
2. `MidOptIn.cozyUnchanged` — while pending, the default companion view and HUD
   stay in their Pacifist form (no premature voyage chip / Equipment tab).
3. `MidOptIn.resolvesToPrivateer` — when `status` flips to
   `{ privateer: true, optInPending: false }`, the Outer Rim tile + HUD chip
   appear on the next render without a full reload.
4. `MidOptIn.txFailRollback` — if the opt-in tx fails, `status` returns to
   `{ privateer: false, optInPending: false }` and the UI is byte-identical to
   the never-opted-in state (no orphaned Outer Rim chrome).

---

## 9. Open questions (UX-specific)

| # | Question | Blocks |
|---|---|---|
| UX1 | Where does opt-in *discovery* live for a cozy player without violating §1.1? Candidate: a single neutral line in the Shop footer ("Outer Rim — ask in the DAO") rather than any companion-view chrome. | Opt-in entry-point PR |
| UX2 | Should the voyage chip also surface in the `CompanionView` header (not just the Phaser HUD) for mobile players who never enter the world? Leaning yes — a compact chip near the Lv/Bond chips (`CompanionView.tsx:795-805`). | S2 scope |
| UX3 | Does the Equipment grid need its own route for deep-linking, or stay an inline panel like the Shop? Inline matches today's pattern; revisit if loadout management gets heavy. | S3 scope |

These are UX-implementation decisions, not architectural — none block the
ADR. They resolve as the Phase-3 tab PRs reach them.

---

## 10. References

- [ADR-003 — Outer Rim Overlay](./SANCTUARY_ADR_003_OUTER_RIM.md) — §"Decision"
  item 1 (tab on Companion screen), §2 (Voyages + companion presence), §3
  (Equipment), §5 (Letter of Marque), §8 (phase sequencing).
- [`SANCTUARY_OUTER_RIM_BOUNTIES.md`](./SANCTUARY_OUTER_RIM_BOUNTIES.md) —
  Letter-of-Marque opt-in spec (PR #359).
- [`SANCTUARY_OUTER_RIM_PRICE_ORACLE.md`](./SANCTUARY_OUTER_RIM_PRICE_ORACLE.md)
  — feed the liquidation-risk indicator reads.
- [`SANCTUARY_STYLE_DOCTRINE.md`](./SANCTUARY_STYLE_DOCTRINE.md) — V2 visual
  language the cozy surfaces preserve.
- Binding cozy-mode direction:
  `memory/evolution/swo_sanctuary_companion_first_2026-04-26.md`.
- Grounding code: `app/sanctuary/CompanionView.tsx`,
  `components/sanctuary/overlays/CompanionHUD.tsx`,
  `components/sanctuary/overlays/ShopDialog.tsx`.
```
