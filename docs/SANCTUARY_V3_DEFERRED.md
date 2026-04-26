# Sanctuary V3 — deferred

V3 was an ambitious from-scratch pixel-art rebuild parallel to V2. After multiple iterations, the result fell short of V2's existing painted hub map. **As of 2026-04-26 V3 is on hold; primary work returns to V2.**

This file is a snapshot of what V3 contains so we don't lose track.

---

## Status

- **Reachable:** Yes — `?v=3` still routes to `SanctuaryV3` via `app/sanctuary/SanctuaryRouter.tsx`.
- **Promoted:** No — not linked from the main UI; only direct-URL access.
- **Iteration:** Paused. No new commits to `game/v3/`, `public/sanctuary-v3/`, or `scripts/v3/` without an explicit decision to revive V3.

---

## What V3 has that V2 does not

| Feature | Where | Notes |
|---|---|---|
| Tilemap-based world (Tiled JSON + Forgotten Memories tileset) | `public/sanctuary-v3/maps/overworld.json`, `WorldSceneV3.ts` | V2 uses a single painted background image; this was V3's main architectural bet. |
| RD-generated FM-palette assets | `public/sanctuary-v3/{buildings,interiors,npcs,props,decor}/` | 8 building exteriors, 8 interior backdrops (256×192), 11 NPC sprite sheets (48×48 4-direction walk), 15 themed props, 12 decor objects (trees/stumps/rocks). |
| RD generation pipeline + custom user style | `scripts/v3/`, style ID `user__swo_forgotten_sanctuary_0dbd7f09` | Cost-gated, palette-locked, normalize+QA pipeline. Used for all V3 art. |
| Per-room collision shapes tuned to backdrop walls | `RoomSceneV3.ts` `ROOM_SHAPES` | South-doorway gap, walls at backdrop-art-aligned thicknesses. |
| Building 1.5× scale at render time + collision-rect scaling around centre | `WorldSceneV3.ts` `BUILDING_SCALE` | Lets us keep map-authored unscaled rects and still render building art larger. |
| Tree-perimeter "forest border" via decor object layer | `WorldSceneV3.ts`, `overworld.json` `trees` layer | Bottom-anchored multi-tile sprites with trunk-only collision. |
| 4-direction walking sheets (CW: up=0, right=1, down=2, left=3) | `PlayerSpriteV3.ts`, `NPCSpriteV3.ts` | Confirmed empirically; rd_animation__four_angle_walking layout. |

## V3 features Clarvis built that ALSO live in V2 (no port needed)

These were merged with `SWO_SHARED_*` or surface-equivalent tags:

- EasyStar click-to-move pathfinding (also in `game/scenes/WorldScene.ts`, `RoomScene.ts`)
- Radial CompanionMenu — V2 has `components/sanctuary/overlays/CompanionMenu.tsx` already
- Location-entered/exited events
- Audio service (Howler-based)
- 7 minigames (StarCatch, MemoryMatch, etc.) — V2 launches the same scenes
- Onboarding overlay
- ShopDialog + cosmetic catalog
- Shared VFX trigger API

## Why V3 stalled

The visual aesthetic V3 chose (FM 32-px tile + RD-generated buildings/interiors) is fundamentally different from V2's painted-hub aesthetic. Keeping both branches at parity required redoing every visual asset. The overworld map specifically — which is V2's strongest visual — was the hardest thing to recreate at quality, and procedural-generation attempts kept reading as slop.

## RD spend on V3

Roughly **$9 of RD credits** spent across 5 generation passes:
- NPCs (10 sheets × $0.07 = $0.70)
- Buildings (8 + 5 retries + 3 retries × $0.18 ≈ $2.88)
- Interior backdrops (8 + 1 retry + 7 retries × $0.18 ≈ $2.88)
- Props (15 × $0.025 = $0.38)
- Custom-style upload + style-test attempts ≈ $0.20

Current RD balance: see `scripts/v3/manifest-status.json`.

## Salvageable for V2?

**Probably not, due to style clash.** V2's painted assets and V3's pixel-art FM assets don't compose well on the same canvas. The audit recommendation was: keep V2 painterly, keep V3 pixel-art, don't mix.

Possible exceptions worth considering only if/when V2 gets a polish pass:
- The 8 V3 building exteriors are tightly-scoped 128×128 transparent PNGs; they could feasibly be used as V2 building thumbnails or icons.
- The custom RD user style ID is preserved in `scripts/v3/style-id.txt` for any future FM-aesthetic generation.

## To revive V3

1. Decide what V3's purpose is in the long run (deprecate V2, run in parallel, or sunset).
2. Address the overworld-map quality gap. Most likely path: stop trying to procedurally generate it; hand-author in Tiled with a proper village tileset (e.g. Immunity's "Resurrected RPG" pack, Cainos Pixel Art Top Down).
3. Reduce scope: 1-3 buildings playable, not 8.
