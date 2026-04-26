# Sanctuary V3 — Canonical Plan & Style Guide

> **Single source of truth** for Sanctuary V3 — supersedes:
> - `SANCTUARY_V3_PLAN.md` (deleted)
> - `SANCTUARY_V3_STYLE_GUIDE.md` (deleted)
> - `SANCTUARY_STYLE_DOCTRINE.md` (V1/V2 only — see banner there)
> - `public/sanctuary/ASSET_SPEC.md` (V2 only)
>
> **Status:** Active. Anything that contradicts this doc loses.
> **Last updated:** 2026-04-25
> **Mounts under:** `?v=3` (V2 stays alive at `?v=2` as gameplay testbed)
> **Baseline pack:** Forgotten Memories 32×32 by Immunity (free/open license per author, confirmed by user 2026-04-25). Source files: `public/sanctuary-v3/tilesets/forgotten-memories/`.

---

## 0. The two tracks

V2 and V3 run side-by-side. They share **all** game logic (DB, Colyseus, EventBus, React overlays, minigames, quest system, companion chat, etc.) and differ **only** in Phaser scenes and assets.

| Track | URL | Role | Art quality bar |
|-------|-----|------|------------------|
| **V2** | `?v=2` | **Gameplay testbed.** Where we prove minigames, NPC interactables, the quest board, multiplayer, room transitions, all logic. Iterate freely; placeholder visuals are intentional. | "Functional" — readable enough to test mechanics. Don't burn time polishing V2 art. |
| **V3** | `?v=3` | **The real product.** A proper hand-pixeled tile-based RPG. Shipped slowly, style-locked, every asset gated by the §15 checklist. | "Production." If it isn't FM-style, it doesn't ship. |

Game logic written against V2 ports to V3 unchanged because both call into the same APIs and EventBus. We never have to rewrite a minigame to migrate it.

**Deprecation plan:** V2 stays until V3 reaches feature parity. Then V2 becomes a `?v=2` debug route or is removed entirely (your call at that point).

---

## 1. Style summary (canonical paragraph)

V3 is a **muted 16-bit / early 32-bit top-down RPG** in the visual lineage of GBA / SNES forest-route maps and the Forgotten Memories pack: cozy but mysterious, hand-pixeled, tile-modular, with a forgotten-magical-forest mood. The world is **forest-and-village first, cosmic accents second**. Pixel clusters are clean and readable; outlines are dark local-color; saturation is controlled; subtle dithering is allowed but never heavy crosshatch; **no anti-aliasing, no painterly blur, no neon, no isometric tilt**.

**Strong prompt block** (paste verbatim into RD prompts, then append the per-asset subject):

> Top-down 2D pixel-art RPG environment in a modern 16-bit / Game Boy Advance JRPG tileset style. Orthographic top-down camera with slight SNES-style object depth, not isometric and not side-view. Designed as a real tile-based game map using 32x32 modular tiles with clean walkable paths, readable collision space, and seamless terrain transitions. Muted earthy fantasy palette: olive green grass, dusty brown dirt, beige broken stone paths, ochre and burnt-orange autumn foliage, teal-blue fantasy trees, soft muted blue water, gray-purple old fences. Handcrafted pixel-art look with crisp hard pixel edges, no anti-aliasing, no blur, no painterly gradients, no soft digital brushwork. Use limited-palette shading, hand-placed pixel clusters, subtle dithering, chunky shadows, and readable silhouettes. Environment should feel like a forgotten magical forest route: winding broken cobblestone paths, natural clearings, old fences, tree stumps, rocky cliffs, small flowers, grass tufts, mossy stones, layered tree clusters, atmospheric but readable terrain. Every object should look like it belongs to a reusable RPG tileset, with consistent scale, lighting, palette, and pixel density.

**Negative prompt** (append to every RD call):

> Do not use isometric perspective. Do not use side-scroller perspective. No 3D render. No smooth gradients. No anti-aliasing. No blurry pixels. No painterly brush strokes. No soft airbrush lighting. No realistic textures. No high-resolution digital painting. No vector art. No anime background painting. No inconsistent tile scale. No oversized props. No random noisy detail. No perspective distortion. No diagonal camera tilt. No glossy lighting. No generated text or UI frame.

---

## 2. Camera / perspective

**Top-down with slight SNES-style object depth.** Not pure top-down, not isometric.

- The ground (grass, dirt, stone, water) reads as a flat top-down map.
- Trees, cliffs, fences, gates, stumps, rocks, buildings have a **slight front/side face** showing — like classic SNES/GBA RPG maps where you can see the trunk of a tree and a hint of foliage volume, but the ground beneath it stays flat.
- No 45° isometric tilt. No side-scroller view. The horizon line for upright objects is drawn shallow — a tree is maybe 15-20° front-facing, not 45°.

In RD prompts: always say `top-down 2D RPG perspective, orthographic camera, slight SNES-style object depth, not isometric, not side-view`. Saying just "top-down" gets flat tactical-map output.

---

## 3. Tile sizing & grid (locked technical specs)

| Asset class | Native | Rendered | Collision footprint |
|-------------|--------|----------|------------------------|
| Terrain tile | 32×32 | 1× (no scale during render) | 32×32 |
| Single prop | 32×32 | 1× | 16×16 to 32×32 |
| Large prop / statue | 64×64 | 1× | 32×32 |
| Building exterior | multi-tile (96×96, 128×128, etc.) | 1× | door tile walkable, rest blocking |
| NPC sprite | 32×48 (1.5 tiles tall) | 1× | 32×16 (feet only) |
| Important NPC | 48×64 | 1× | 32×16 |
| Player | 32×48 | 1× | 32×16 |
| UI 9-slice | 8 corners + 4 edges + center | 2×–4× zoom (still pixel-perfect) | n/a |

**Camera**: integer zoom only (1× / 2× / 3×, never 1.5×). At 2× zoom on 1920×1080 viewport ≈ 30 tiles wide × 17 tall — typical SNES RPG framing.

**Animations** (no tweening, all integer-frame pixel-art):
- Player + NPC walk: 4 frames per direction × 4 dirs = 16 frames, 8 fps (125 ms/frame)
- Idle: 2-frame bob (1 px shift), 1 fps (1 second hold)
- Water/waterfall: 6 frames (already in FM pack), 6 fps
- Magic FX (rune glow, crystal sparkle): 4 frames, 4 fps

---

## 4. Color palette (locked)

Master palette extracted from the Forgotten Memories pack across all 5 sheets, covering 98.5% of opaque pixels. **Every V3 asset's color must be in this palette** (or palette-snapped during normalize §10).

**Files:**
- Master swatch image: `public/sanctuary-v3/palettes/forgotten-memories.png` — pass as `input_palette` to **every** RD call.
- Hex list: `public/sanctuary-v3/palettes/forgotten-memories.txt` (64 colors)
- Per-sheet stats: `public/sanctuary-v3/palettes/forgotten-memories-fingerprint.txt`

### 4.1 Functional groups

| Role | Hex | Notes |
|------|-----|-------|
| **Universal ink** (deepest shadow / inner outline) | `#2c2133` | Used in every FM sheet. Use sparingly; this is **not** pure black. |
| **Grass — bright** | `#808449` | Olive. Most-used color in TileSet (22%). |
| **Grass — shadow** | `#6a6a46` | Mossy underbrush. |
| **Grass — outline** | `#52513d` | Local-color dark for grass-edged shapes. |
| **Dirt path — main** | `#98734c` | Warm brown body. |
| **Dirt path — light** | `#9e8251` | Sandy edge highlight. |
| **Dirt — shadow** | `#825e48`, `#603f36` | Path edge cracks. |
| **Stone path — bright** | `#c0af83` | Beige cracked stone face. |
| **Stone — mid** | `#a78c61` | Stone body. |
| **Stone — shadow** | `#936d53`, `#805147` | Mortar / outline. |
| **Wood — trunk warm** | `#5f4848` | Tree trunk. |
| **Wood — bark dark** | `#52513d` | Trunk shadow. |
| **Wood — fence highlight** | `#9c7b4f`, `#a57660` | Fence rail bright. |
| **Foliage — autumn yellow** | `#968325`, `#6f7227` | Most foliage. |
| **Foliage — autumn red** | `#ab5124`, `#8c3329` | Red leaves. |
| **Foliage — autumn orange** | `#ab7923`, `#a16e25`, `#8e5829` | Orange leaves. |
| **Foliage — fantasy cyan-blue** | `#508e87`, `#67ab8d` | "Magical tree" — most saturated natural color. |
| **Foliage — magic deep** | `#008293`, `#00747e` | Inner shadow of fantasy tree. |
| **Water — main** | `#4c8d9d` | Surface. |
| **Water — highlight** | `#5b99a6`, `#7fb7bd`, `#6ba2af` | Sparkle / wave crest. |
| **Water — shadow** | `#3c6175`, `#4f7a8a` | Deep water / waterfall fall. |
| **Cool stone / cliff** | `#5b6772`, `#606f75`, `#4d4753` | Rocky cliff face. |
| **Cool accent** | `#3e526a`, `#387080` | Distant stone / dusk. |
| **Soft dusk pink** | `#86677c`, `#7b6268`, `#6b535b` | Only non-earthy tone in base. Use for dawn light, magic crystals. |

### 4.2 SWO cosmic accent palette (additive — strict 2% pixel cap per asset)

These are **not** in the FM base. Reserved for SWO theming. Hard cap: **≤2% of opaque pixels per asset**. More than that and the asset reads anime/neon and breaks doctrine.

| Role | Hex | Where to use |
|------|-----|--------------|
| **Antique gold** | `#d4a445` | Constellation symbols, banner trim, observatory brass. |
| **Soft lavender** | `#a08cc0` | Magic glow on rune stones, dream hollow petals, soft violet shadow accents. |
| **Crystal cyan-bright** | `#8ec4cc` | Aura forge crystal highlight (sparingly). |
| **Star white** | `#e4ddc4` | Single-pixel star points, eye glints. Never fills areas. |
| **Nebula faint violet** | `#6e5d8a` | Nebula-themed decoration tints, distant cosmic detail. |

A correctly-themed cosmic prop has ~150 brown/stone/grass pixels and ~10 accent pixels (gold + lavender + crystal). If you generate a magic crystal that's 80% cyan, it's wrong.

---

## 5. Shading method

- **Hand-placed pixel clusters** — 3–5 px clusters of grass tufts, leaves, cracks, flowers, bark texture.
- **2–4 tones per material** — base + 1 highlight + 1 shadow + optional darkest accent.
- **Outlines in dark local color** — `#52513d` around grass, `#603f36` around wood, `#5f4848` around stone, `#2c2133` only for the deepest inner shadow points.
- **Subtle dithering allowed** — 2-color checker patterns at material transitions are fine; heavy crosshatch dithering is forbidden.
- **Highlights in chunky patches** — never single bright pixels scattered; use 2–4 px highlight shapes that follow the silhouette.
- **No anti-aliasing, no smooth gradients, no painterly blur.**

---

## 6. Environment design

The world reads as a natural RPG forest route, not a tactical board:

- Winding stone paths and broken cobblestone trails — irregular but tile-friendly.
- Cliffs with grass caps and rocky vertical faces.
- Rivers and 6-frame animated waterfalls.
- Old wooden / stone / vine fences, gates with hinges.
- Tree clusters (groups of 3–5 trees) more than single trees in isolation.
- Stumps, rocks, scattered flowers, grass tufts, mossy stones.
- Empty walkable space — silence between busy zones.

Avoid: symmetrical layouts, board-game grid feels, cluttered decoration, repeating identical tile chunks side-by-side.

---

## 7. SWO theme integration

Cosmic accents layer on top of the forest sanctuary, never replace it. Concrete vocabulary:

- **Star-shaped flowers** in grass clearings (1 per ~64 tiles, not every tile)
- **Glowing crystal stones** at zone entrances and beside the Aura Forge
- **Moonlit grass highlights** — 1-pixel `#e4ddc4` dots scattered in shadowed grass tiles, max 1 per tile
- **Soft violet shadow accents** — replace some `#52513d` outline pixels with `#a08cc0` near magical objects
- **Ancient sanctuary ruins** — broken stone pillars, sunken altars, cracked star runes carved into beige stone tiles
- **Floating stone fragments** — small fractured platforms drifting near the Observatory or Star Garden
- **Faint nebula-colored decoration** — `#6e5d8a` ground tints in the Dream Hollow / Cosmic Library
- **Constellation symbols** on banners, signs, room name plates

Per-zone hooks (which accents fit where):

| Zone | Cosmic accent flavor |
|------|------------------------|
| Spawn / Town Square | Star banner, signpost, cosmic well |
| Hot Springs | Moon lanterns, steam tinted faint lavender |
| Observatory | Brass telescope, floating stone, star runes |
| Training Grounds | Rune-carved practice dummies, star sigil floor inlay |
| Star Garden | Star-shaped flowers (this zone's signature), glowing seed sprouts |
| Cosmic Library | Floating star charts on walls, faint nebula floor wash |
| Nebula Kitchen | Crystal stove, nebula-colored ingredient jars |
| Dream Hollow | Dream mushrooms, lavender mist, sleeping moon-sheep |
| Aura Forge | Crystal anvil, glowing forge stones, sparks |

---

## 8. Asset categories needed for V3

Total scope, in priority. **Phase order in §14.**

| # | Category | Source | Count |
|---|----------|--------|-------|
| 1 | Overworld terrain (grass, dirt, stone, water, fences) | **Forgotten Memories** ✓ have | ~80 in pack |
| 2 | Trees + variations | **Forgotten Memories** ✓ | ~20 in pack |
| 3 | Generic props (stumps, signs, benches, crates) | **Forgotten Memories `Props.png`** ✓ | TBD on inventory |
| 4 | Buildings (8 themed exteriors) | **RD `rd_pro__topdown` or `rd_plus__topdown_asset`** | 8 sheets |
| 5 | Building interior tilesets | **RD** + hand-placed | 8 small tile sets |
| 6 | NPCs (10 characters, 4-dir walk + idle) | **RD `rd_animation__walking_and_idle`** at 48×48, palette-locked | 10 sheets |
| 7 | SWO themed props (telescope, anvil, star tree, dream mushroom, moon lantern, rune stone, cosmic crystal, signposts, ruins) | **RD `rd_tile__tile_object`** | ~15 props |
| 8 | UI panels, dialog frames, buttons | Hand-cropped from FM tones / minimal RD | 9-slice set |
| 9 | Icons (STAR, quest pin, mood) | Hand-pixeled (16×16) | ~10 icons |
| 10 | Player + companion sprites | **RD `walking_and_idle`** for player; existing constellation art kept for companion | 2 sheets |

FM covers categories 1–3 entirely. Everything else is RD using the FM palette as the lock.

---

## 9. Retro Diffusion pipeline

### 9.1 One-time: create the custom user style

`POST https://api.retrodiffusion.ai/v1/styles` with:
- `name: "SWO Forgotten Sanctuary"`
- `style_icon: "forest"`
- `reference_images:` 1 base64 of a 256×256 sample stitch — grass + stone path + a tree from `tileset.png`/`trees.png`
- `user_prompt_template:` the §1 strong prompt block + `{prompt}` placeholder for the per-asset subject
- `force_palette: true`
- `force_bg_removal: true` (for non-tile assets — toggle off for terrain tilesets)

Save the returned `prompt_style` ID to `scripts/v3/style-id.txt`. Reuse for **every** subsequent call. **This is the slop-killer**: every generation goes through one stylistic gate.

### 9.2 Per-asset templates

**NPC walking sheet** (`rd_animation__walking_and_idle`, fixed 48×48):
```
{user style template} + subject="small orange fox in a tiny indigo wizard cloak holding a wooden staff, friendly RPG NPC, 32x48 pixel character, 4 directions, transparent background, palette matches the forgotten forest tileset"
```
Plus: `input_palette: <forgotten-memories.png>`, `remove_bg: true`, fixed `seed` per character (so re-rolls reproduce).

**Themed prop tile** (`rd_tile__tile_object`, 32×32 or 64×64):
```
{user style template} + subject="ornate brass telescope on wooden tripod, top-down 3/4 view with slight SNES depth, single small RPG prop, transparent background"
```
Plus: `input_palette`, `remove_bg: true`.

**Building exterior** (`rd_pro__topdown`):
```
{user style template} + subject="small cozy stone observatory tower with thatched roof, brass telescope on top, single wooden door, blue-gray slate roof, mossy stone walls, warm yellow window light, top-down 3/4 SNES depth"
```
Plus: stitch a 256×256 strip of FM tileset (grass + path + a tree) and pass as `input_image` with `strength: 0.6` to lock perspective.

**Terrain tile** (`rd_tile__single_tile` or `rd_tile__tile_variation`, 32×32):
```
{user style template} + subject="cracked beige stone path with star runes carved subtly into it"
```
Plus: pass an existing FM stone tile as `input_image` for `tile_variation` to preserve scale/lighting.

### 9.3 Pre-generation cost gate

Every generate run starts with `check_cost: true` for every entry in the manifest, prints the total, and blocks until you confirm. No silent spend.

Estimated for the full V3 asset set (with FM already covering terrain):
- 10 NPCs × $0.07 = **$0.70**
- ~15 themed props × ~$0.025 = **$0.38**
- 8 buildings × $0.18 (`rd_pro__topdown`) = **$1.44**
- ~10 specialty terrain variations × ~$0.025 = **$0.25**
- Reroll buffer = **$2.00**
- **≈ $4.80** out of your current $10.22 RD balance

---

## 10. Normalize pipeline (post-RD, pre-commit)

`scripts/v3/normalize.mjs` runs on every output. **Reject + auto-regenerate (seed+1) if any check fails. After 3 retries, the asset is escalated for prompt review — it never silently ships.**

| Check | Rule | Failure threshold |
|-------|------|-------------------|
| **Palette quantize** | Snap every pixel to nearest in `forgotten-memories.png` master swatch (Manhattan distance in RGB) | If snap distance > 24 for >5% of pixels → REJECT (output too far from locked palette) |
| **AA detection** | For each opaque pixel, count cardinal neighbors with color delta in (0, 96) | If ≥40% pixels are surrounded by such soft transitions → REJECT (AA mush) |
| **Alpha clean** | Force binary alpha — pixels with α 8–200 near background color get α=0; everything else α=255 | Always run, never reject |
| **Bbox tightness** (NPCs only) | Character occupies ≥40% of frame | Below → REJECT |
| **Outline check** | Pure black `#000000` should never exceed 0.5% of pixels | Above → REJECT (we use `#2c2133`, not black) |
| **Cosmic accent cap** | gold + lavender + crystal-cyan + star-white combined ≤ 2% of opaque pixels | Above → REJECT (overdose) |
| **Frame-grid alignment** (NPC sheets) | walking_and_idle layout: 4 dirs × 4 frames at 48×48 each, ≥4 px margin per cell | Misaligned → REJECT |

This pipeline physically prevents slop. Outputs that pass all checks are committed; outputs that fail are rejected before they reach `public/sanctuary-v3/`.

---

## 11. Directory structure

```
public/sanctuary-v3/
├── tilesets/
│   ├── forgotten-memories/                # baseline ✓
│   │   ├── tileset.png                    (2048×2048, 32px grid)
│   │   ├── trees.png                      (1024×1024)
│   │   ├── trees_separated.png            (560×640)
│   │   ├── props.png                      (1024×1024)
│   │   ├── water_6frames.png              (1024×1024)
│   │   └── LICENSE.txt                    (TODO: paste author note)
│   ├── swo-themed/                        # RD-generated, palette-locked
│   │   ├── observatory.png
│   │   ├── aura-forge.png
│   │   └── ... (1 sheet per themed location)
│   └── ui/                                # 9-slice + bitmap font
├── npcs/                                  # RD walking_and_idle sheets, 48×48
│   ├── spawn-fox.png
│   ├── springs-duck.png
│   └── ... (10 NPCs)
├── maps/                                  # Tiled JSON / Sprite Fusion compatible
│   ├── overworld.json
│   ├── observatory.json
│   └── ... (1 per location)
├── palettes/
│   ├── forgotten-memories.png             # 64-color swatch ✓
│   ├── forgotten-memories.txt             # hex list ✓
│   └── forgotten-memories-fingerprint.txt ✓
└── manifest.json                          # generated assets + hashes

scripts/v3/
├── asset-manifest.json                    # what we want to generate (locked)
├── generate.mjs                           # CLI: read manifest → call RD API
├── normalize.mjs                          # post-process per §10
├── extract-palette.mjs                    # rebuild master palette if assets shift
└── style-id.txt                           # the custom RD user style ID
```

---

## 12. Map authoring

- **Tiled JSON** (Sprite Fusion exports compatible JSON). Phaser loads via `load.tilemapTiledJSON`.
- 90×60 tiles overworld (~22 screens at 2× zoom); 30×20 per room.
- Layers (in order): `ground` → `ground_decoration` → `objects` → `collision` (invisible) → `npcs` (object layer drives `npcDefinitionsV3`) → `doors` (object layer with target room).
- Tile change = JSON edit + commit. No baked images.
- Hand-design starts only AFTER §15 checklist passes on the first generated NPC + prop set — we do not sink hours into a map that turns out to be on the wrong style.

---

## 13. V2 vs V3 system map (what changes / what doesn't)

| System | V2 (testbed) | V3 (production) |
|--------|--------------|------------------|
| Overworld rendering | Single AI-PNG backdrop | Tilemap from `overworld.json` + FM tileset |
| Room rendering | Single AI-PNG backdrop per room | Tilemap from `<room>.json` |
| NPC sprites | Mixed sources, style mismatch | RD `walking_and_idle`, palette-locked |
| Player | V2 character sheet | RD-regenerated to FM palette |
| Companion | Existing constellation PNGs (kept — on-spec) | Same — no change |
| Font | Pixelify Sans (was Press Start 2P) | Pixelify Sans — SNES-mood bitmap, FM-aligned |
| Phaser scenes | `WorldScene`, `RoomScene`, minigame scenes | `WorldSceneV3`, `RoomSceneV3` (same minigames) |
| Game logic — minigames | Existing | **Identical, reused as-is** |
| Game logic — quest board, shop, training, companion chat | Existing | **Identical, reused as-is** |
| DB schema | Existing | **Identical, no migration** |
| Colyseus multiplayer | Existing | **Identical** |
| React overlays (Quest, Minigame, Welcome, Chat, Tracker, Journal, Traits) | Existing | **Identical** |

**V3 is a pure presentation rebuild.** Game logic does not change. Anything we add to V2's gameplay (new minigame, new room interactable, new quest mechanic, etc.) automatically benefits V3 because both share the same logic surface.

---

## 14. Process / phase order

**Stop after every phase for visual sign-off. No multi-phase silent burns.**

| Phase | Scope | Effort | Stop point | RD spend |
|-------|-------|--------|-------------|----------|
| **0** | Approve this canonical doc | 0 | (you confirm) | $0 |
| **1** | ✅ DONE — Replaced `Press Start 2P` globally with **Pixelify Sans** (Google Fonts, 4 weights, true bitmap pixel font, SNES-JRPG mood). LICENSE.txt for FM folder still pending. | ~1h | Font visible on V2 + V3 + DOM chrome | $0 |
| **2** | Build RD pipeline: `scripts/v3/{generate,normalize,extract-palette}.mjs`, create custom RD user style, save style ID | ~2h | Pipeline runs; one test prop generates + normalizes successfully | ~$0.05 |
| **3** | Generate ONE NPC (Spawn Fox) end-to-end through the pipeline. Render it on top of the FM tileset in a quick test scene. **You eyeball it.** | ~30min | **You sign off on the style.** If it looks slop, we re-prompt before any bulk spend. | ~$0.10 |
| **4** | Bulk-generate the rest: 9 more NPCs + ~15 themed props + 8 building exteriors. Each goes through normalize. | ~30min wall | All assets in `public/sanctuary-v3/` passing checklist | ~$3 |
| **5** | Build V3 Phaser scenes: `BootSceneV3`, `WorldSceneV3`, `RoomSceneV3`, `PlayerSpriteV3`, `NPCSpriteV3`, `CompanionSpriteV3`. Wire `app/sanctuary/SanctuaryV3.tsx` under `?v=3`. Render the FM tileset on a small placeholder map. | ~3-4h | Walkable tile-based test map at `?v=3` | $0 |
| **6** | Author the overworld map in Tiled / Sprite Fusion (procedural first cut, manual refinement) | ~3h | `overworld.json` in repo, full overworld walkable | $0 |
| **7** | Author the 8 room interior maps the same way | ~3-4h | Each door takes you to a tile-based room with NPCs in place | $0 |
| **8** | Polish: UI restyle to FM tones, ambient particles within accent budget, font tweaks | ~2h | Ship-ready V3 | small |
| **9** | (Optional) feature parity audit + V2 deprecation | ~1h | V2 stays as testbed or removed | $0 |

**Total**: ~14-17h of work, ~$3.50-5 RD spend. Spread across multiple sessions.

---

## 15. Asset acceptance checklist

Every new V3 asset (whether hand-pixeled or RD-generated) must pass **all** before commit:

- [ ] Native size matches §3 (32×32 / 32×48 / 48×48 / multi-tile, integer dimensions)
- [ ] Every color is in the §4 palette (auto-checked by normalize §10)
- [ ] No anti-aliasing — hard pixel transitions only (auto-checked §10)
- [ ] Alpha is binary 0/255, no halos (auto-checked §10)
- [ ] Outlines are dark local-color, not pure black (auto-checked §10)
- [ ] Cosmic accent pixels ≤ 2% of opaque area (auto-checked §10)
- [ ] Reads at 1× zoom — no detail requiring zoom-in to recognize
- [ ] Slight SNES-style object depth visible on upright objects (trees, fences, NPCs); ground stays flat
- [ ] Visually compatible with FM grass / dirt / fence next to it — drop into a test scene with `tileset.png` rendered behind, eyeball at 2× zoom
- [ ] If NPC: 4 directions match in proportion, palette, line weight; idle pose recognizable as the same character as walk frames
- [ ] If prop: silhouette is readable as the intended object at 1× without text label
- [ ] If themed cosmic prop: forest-RPG base reads first, cosmic accent reads second

If any answer is "no", the asset is rejected and either regenerated (RD) or hand-fixed (artist) before merging.

---

## 16. License notes

- **Forgotten Memories 32×32 pack** — author Immunity (itch.io). User confirmed free/open license usable in this project (2026-04-25). Drop the author's `LICENSE.txt` into `public/sanctuary-v3/tilesets/forgotten-memories/` once located, plus a credit line in the in-game About / Credits screen.
- **Retro Diffusion outputs** — generated content owned by us per RD's terms (verify on the day we generate). Document in same Credits screen.
- **SWO original art** (player, companion constellation set) — internal IP, retained.

---

## 17. Concrete next step

Approve §0–§16 (or amend in this thread). Then I:

1. Add `LICENSE.txt` placeholder + credits line for FM
2. Pick a SNES-mood bitmap font, swap globally (V2 + V3)
3. Scaffold `scripts/v3/{generate,normalize,extract-palette}.mjs`
4. Create the custom RD user style
5. Generate ONE Spawn Fox sheet through the full pipeline
6. **Stop, you eyeball.**

No code, no RD spend, no further commits until you greenlight.
