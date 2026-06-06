# Sanctuary Asset Specifications (V1 / V2 only)

> ⚠️ **V2 testbed only.** This spec applies to the V1/V2 art at `public/sanctuary/`. V3 assets live at `public/sanctuary-v3/` and follow `docs/SANCTUARY_V3.md` (different style, different palette, different sizing).

See `docs/SANCTUARY_STYLE_DOCTRINE.md` for the V1/V2 visual reference.

## Directory Structure

```
public/sanctuary/
├── companions/           # Per-constellation sprite sets
│   ├── aether/          # 32×32 PNGs: happy.png, excited.png, calm.png, sleepy.png, curious.png, idle.png
│   ├── spectra/
│   ├── solveil/
│   ├── nebulu/
│   ├── chroma/
│   ├── rose/
│   ├── monflare/
│   ├── auracore/
│   ├── parallel/
│   └── prime/
├── locations/            # 64×64 location vignettes
│   ├── hot-springs.png
│   ├── training-grounds.png
│   ├── star-garden.png
│   ├── cosmic-library.png
│   ├── nebula-kitchen.png
│   ├── dream-hollow.png
│   ├── aura-forge.png
│   └── observatory.png
├── empty/                # 96×64 empty state illustrations
│   ├── no-companion.png
│   ├── empty-journal.png
│   └── no-quests.png
├── map_bg.png            # 720×405 world map background
└── sfx/                  # Future: interaction sound effects
```

## Quick Reference

| Asset Type | Native Size | Display Size | Format | Max File Size |
|-----------|-------------|--------------|--------|---------------|
| Companion sprite | 32×32 | 48-64px (pixelated) | PNG transparent | 15KB |
| Location vignette | 64×64 | 40-64px (pixelated) | PNG transparent | 20KB |
| Empty state | 96×64 | 192×128 (pixelated) | PNG transparent | 25KB |
| Map background | 720×405 | fluid 16:9 | PNG | 100KB |

## Generation Notes

- Use Retro Diffusion or Aseprite — NOT AI image generators (wrong style)
- All sprites must be palette-compliant (see doctrine §2)
- Test every sprite on `#0a0a1a` background at display size
- Companion sprites: base is purple blob/star, accent color per constellation table in doctrine §3
