# Sanctuary Playtest Brief — 2026-04-26

_One-page operator brief. Read before sitting down to playtest. Updated to reflect both V2 (gameplay testbed, `?v=2`) and V3 (tile-based pixel-art rebuild, `?v=3`) tracks._

## TL;DR

| Track | URL | What it is | Visual mood |
|-------|-----|------------|-------------|
| V1    | `localhost:3000/sanctuary`            | Original React-only sanctuary (companion dashboard) | Cosmic UI |
| V2    | `localhost:3000/sanctuary?v=2`        | Phaser canvas testbed — all gameplay logic lives here | Placeholder cosmic palette |
| V3    | `localhost:3000/sanctuary?v=3`        | Production rebuild — tile-based, Forgotten-Memories palette, locked doctrine | FM tileset (warm earth tones) |

V3 is the destination. V2 stays as the iteration host for game logic until V3 reaches feature parity (`[SWO_V3_FEATURE_PARITY_AUDIT]`).

## Boot it locally

```bash
cd star-world-order
npm install            # if first run
npm run dev            # Next.js, port 3000
npm run colyseus:dev   # multiplayer server, port 2567 (separate terminal)
```

Open the wallet (any Skrumpey-holder address — Sanctuary is now open to all holders, PR #187). If you don't have one, you can still walk around and see NPCs in V2/V3 — only mutating actions (interact, claim, equip) need wallet auth.

## What works right now

### Shipped on dev as of 2026-04-26 (last 36 hours)

- **PR #245** — quest dialog content for 5 daily errands + 3 weekly adventures (`data/sanctuary/quests.json`)
- **PR #246** — 30-item cosmetic catalog spec (`data/sanctuary/cosmetic_items.json`)
- **PR #247** — guided onboarding tutorial (Spawn Fox walks new players through HUD, quest board, minigame)
- **PR #248** — Howler.js ambient + SFX audio service (8 zone loops + 10 SFX, muted by default, vol prefs persisted)
- **PR #249** — V3 RD pipeline hardened (prompt-hash dedup, $0.50 batch / $5 daily caps, lock, append-only audit log, dry-run mode)

### V2 — Testbed (`?v=2`)

| Layer | Status |
|-------|--------|
| Phaser canvas, 8-zone tilemap, click + WASD movement | Done |
| Player + companion sprites with mood + walk cycles | Done |
| Companion radial menu (pet/feed/talk) with reaction emoji | Done |
| Multiplayer (Colyseus, room-per-location) + remote players + chat bubbles | Done |
| Quest NPCs with click-to-dialog + Quest Board + Quest Tracker | Done |
| Room minigames: Memory Match, Cooking Rhythm, Dream Catcher, Lore Trivia, Star Catch | Done (5 minigames in `game/scenes/`) |
| LLM-backed companion chat with bond-tone selection + memory + history pagination | Done (#236–#240) |
| Layered cosmetics + STAR currency + shop backend + ShopDialog overlay | Done (`fd9924c`/`72d6202`/`5aa2965`/#244) |
| Audio (ambient + SFX) | Done (#248) — assets stubbed; service no-ops on missing audio |
| Onboarding tutorial | Done (#247) — fires on first login if `onboarding_step !== 'completed'` |

### V3 — Production rebuild (`?v=3`)

| Phase | Status |
|-------|--------|
| 0–7. canonical plan, FM tileset, RD pipeline, NPC sign-off, bulk NPCs/props, buildings, walkable test scene, tilemap+water, door transitions + procedural rooms | DONE (commits `7149ed2 → c2efa0c`) |
| 8. polish (HUD/UI/font/particles) | NOT STARTED — `[SWO_V3_HUD_ICONS]`, `[SWO_V3_FONT_SWAP]`, `[SWO_V3_UI_RESTYLE]`, `[SWO_V3_PARTICLES_AMBIENT]` |
| 9. hand-authored room interiors + parity audit | NOT STARTED — `[SWO_V3_OVERWORLD_MAP_DETAIL]`, `[SWO_V3_ROOM_INTERIOR_MAPS]`, `[SWO_V3_FEATURE_PARITY_AUDIT]` |

V3 reuses V2 React overlays (QuestDialog, QuestBoard, ShopDialog, OnboardingOverlay) — they work in `?v=3` automatically.

## Known visual issues (don't be alarmed)

1. **V3 overworld reads as a flat green carpet around 8 building anchors.** `public/sanctuary-v3/maps/overworld.json` ground layer uses only ~5 unique tile gids on a 60×40 grid (gid=2 grass = 79%). Tracked: `[SWO_V3_OVERWORLD_MAP_DETAIL]`.
2. **V3 room interiors are procedurally painted from one FM crop.** All 8 rooms look near-identical apart from a signature prop. Tracked: `[SWO_V3_ROOM_INTERIOR_MAPS]`.
3. **V3 HUD/UI still uses Press Start 2P + cosmic neon (`#ffd700`).** FM doctrine specifies antique gold (`#d4a445`) and a SNES-mood bitmap font. Tracked: `[SWO_V3_FONT_SWAP]`, `[SWO_V3_HUD_ICONS]`, `[SWO_V3_UI_RESTYLE]`.
4. **V3 has no companion sprite in-world yet.** `WorldSceneV3` does not spawn the companion next to the player. Tracked under `[SWO_V3_FEATURE_PARITY_AUDIT]`.
5. **Audio: muted by default with stubbed assets.** Service ships in #248 but the 9 ambient loops + 10 SFX listed in `public/audio/sanctuary/README.md` still need to be sourced/produced. Audio toggles work; they just produce silence.
6. **V2 cosmic palette is intentional placeholder.** V2 stays cosmic-neon to remain the visually-obvious testbed. Don't file polish PRs against V2 chrome.

`[SWO_V2_COMPANION_BG_MATTE]` was verified clean on 2026-04-26 — no action needed (60 PNGs already transparent).

## 5 things to try

1. **V2: Walk to Hot Springs and play Memory Match.** Move with WASD to the south-east zone, click the building door, then click the Memory Match minigame trigger. Tests: zone routing, Phaser scene swap, minigame framework, STAR earn flow.
2. **V2: Click an NPC and open the Quest Board.** Tests: NPC click → QuestDialog overlay → Quest Board (`Q` hotkey) → Quest Tracker pinning.
3. **V2: Open companion radial menu and pet/feed/talk.** Click the companion sprite, then choose an action. Tests: API auth (`/api/sanctuary/companion/interact`), bond/XP increment, mood update, reaction effect, EventBus → CompanionHUD refresh.
4. **V2: Open shop and equip a cosmetic.** Press `S` (or click Shop NPC if shipped) → buy item with STAR → equip from inventory. Tests: STAR backend, layered cosmetic rendering on companion sprite.
5. **V3: Walk to a building door and press `[E]`.** Move to one of the 8 buildings on `?v=3` and press `[E]` — RoomSceneV3 launches a procedural interior. Confirm the door transition fades in/out and `[Esc]` returns you to the overworld.

## Top 3 polish items still in front of "smooth V3 playthrough"

V3 has no P0 blockers — the engine works end-to-end. The 3 items most worth doing before a polished V3 playtest:

1. **`[SWO_V3_OVERWORLD_MAP_DETAIL]`** — replace the flat-green-carpet overworld with a richer Tiled composition (path threading, decoration variation, fence segments). No new RD spend. Biggest single visual upgrade for V3.
2. **`[SWO_V3_FONT_SWAP]`** — global Press Start 2P → SNES-mood bitmap font (~1h). Single change, ships immediately on both V2 and V3 chrome (since overlays are shared).
3. **`[SWO_V3_HUD_ICONS]`** — generate 12 × 16×16 HUD icons in FM palette via the now-hardened V3 pipeline (~$0.30 RD spend). Replaces emoji in `CompanionHUD.tsx` and `QuestBoard.tsx`. Lands on both tracks because HUD is shared overlay.

After these three, the next priority is `[SWO_V3_ROOM_INTERIOR_MAPS]` (hand-author 8 Tiled JSON interior maps to replace the procedural floor-and-wall renderer).

## Where to file feedback

- Lane: SHARED / V2 / V3. Use the `[SWO_SHARED_*]`, `[SWO_V2_*]`, `[SWO_V3_*]` prefixes.
- Queue: append to Clarvis QUEUE.md (`memory/evolution/QUEUE.md` in this repo's parent workspace). The auto-evolution scan picks them up.
- For visual changes, attach a screenshot when you can — operator-aesthetic calls don't survive being described in text.

---

_Generated by Clarvis. Sources: SWO_TRACKER.md (sanctuary V2/V3 status), QUEUE.md (open work), `docs/SANCTUARY_V3.md` (canonical V3 doctrine)._
