# Sanctuary V3 — Asset Credits

This file tracks every external asset used in V3, with attribution and license notes. Add a matching entry here for any new asset before it lands in `public/sanctuary-v3/`.

## Tilesets

### Forgotten Memories 32x32
- **Author:** Immunity
- **Source:** https://immunitys.itch.io/fm32x32
- **Used files:** `tileset.png`, `trees.png`, `trees_separated.png`, `props.png`, `water_6frames.png`
- **License:** See `tilesets/forgotten-memories/LICENSE.txt`. Confirmed for use 2026-04-25 by SWO project owner.

## Generated assets (Retro Diffusion)

NPCs, themed props, building exteriors, and interior backdrops are generated via the Retro Diffusion API using a custom user style locked to the Forgotten Memories palette + style reference. See `docs/SANCTUARY_V3.md` §9 for the pipeline.

Each generated asset is logged in `scripts/v3/asset-manifest.json` with prompt, style ID, seed, and SHA-256 of the produced PNG.

## Fonts

TBD — pending font selection in V3 phase 1.

## In-game credits screen

When V3 ships, the in-game About / Credits screen must surface:
- "Forgotten Memories tileset by Immunity (itch.io)"
- "Some assets generated with Retro Diffusion"
- Any added font's required attribution
