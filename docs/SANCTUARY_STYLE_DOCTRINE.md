# Sanctuary Style Doctrine (V1 / V2 only)

> ⚠️ **Superseded for V3 by `SANCTUARY_V3.md`.** This document remains the visual reference for the V2 testbed at `?v=2` (luminous cosmic playground tone). V3 follows a different aesthetic — muted SNES/GBA forest-route tileset based on Forgotten Memories — see `SANCTUARY_V3.md`.

**Status:** Reference for V1/V2 only — not binding on V3.  
**Created:** 2026-04-20  
**Last updated:** 2026-04-20 (banner added 2026-04-25)

---

## 1. Core Identity: Cosmic Pixel Companion World

Star Sanctuary is a **luminous cosmic playground**, not a dark dungeon. It's where cute pixel creatures live among stars. The mood is **mystical-premium** with **game-like charm** — think Stardew Valley's warmth meets a retro space aesthetic.

### The Skrumpey Visual Language (non-negotiable)

The existing Skrumpey sprites define the visual floor. All Sanctuary assets must be **compatible** with these traits:

| Trait | Description | Reference |
|-------|-------------|-----------|
| **Resolution** | ~32×32px native, crisp pixel edges, no anti-aliasing | `purple_skrumpey.png` |
| **Palette** | Purple/lavender dominant, cyan + magenta accents, gold highlights | All 3 sprites |
| **Form** | Round blob body OR five-pointed star body. Simple silhouette, readable at 32px | `purple_skrumpey.png` (blob), `skr_str_mon2.png` (star) |
| **Eyes** | Large, expressive, black pupils with cyan/pink reflections. Emotional center of the character | All sprites |
| **Personality** | Cute, friendly, slightly mischievous. Never threatening or grimdark | Design principle |
| **Glow** | Soft ethereal aura around edges — lavender/white. Luminous, not dark | `skr_str_mon2.png` glow effect |
| **Readability** | Must be instantly recognizable at 48px display size (typical in-page use) | Functional requirement |

### What Sanctuary Is NOT

- **Not grimdark fantasy.** No skulls, blood, decay, rusted metal, or horror elements.
- **Not generic dark cosmic.** The space theme serves charm, not intimidation. Stars twinkle, they don't menace.
- **Not realistic.** Everything is pixel-art stylized. No gradients pretending to be 3D, no photorealistic textures.
- **Not cluttered.** Backgrounds support the Skrumpey, never compete with it. Negative space is a feature.
- **Not desaturated.** Colors are vivid and warm even on dark backgrounds. The palette glows.

---

## 2. Color System

### Primary Palette (inherited from SWO design system)

| Role | Hex | Usage |
|------|-----|-------|
| **Gold accent** | `#ffd700` | Headers, highlights, rewards, XP, CTA borders |
| **Purple primary** | `#9966ff` | UI chrome, trait badges, secondary elements |
| **Deep background** | `#0a0a1a` → `#1a1a2e` | Page/card backgrounds (gradient) |
| **Bond pink** | `#ff66aa` | Bond score, companion affection indicators |
| **Success green** | `#44ff88` | Completed activities, positive states |
| **Calm blue** | `#66bbff` | Water locations, calm mood |

### Sanctuary-Specific Additions

| Role | Hex | Usage |
|------|-----|-------|
| **Starlight white** | `#e8e0ff` | Sprite glow halos, sparkle particles, star points |
| **Nebula lavender** | `#b088ff` | Map atmosphere, location auras, ambient glow |
| **Warm amber** | `#ffaa44` | Kitchen/forge locations, warm-light sources |
| **Garden teal** | `#44ddbb` | Garden/nature locations, growth indicators |
| **Dream indigo** | `#6644cc` | Dream Hollow, sleep states, mystery |

### Color Rules

1. **Backgrounds stay dark** (`#0a0a1a` base) but are never flat black — always have subtle star-field or gradient.
2. **Foreground elements glow.** Every interactive element should feel slightly luminous against the dark field.
3. **Location zones use warm accents** over the dark base — Hot Springs gets amber glow, Star Garden gets teal, etc.
4. **Never use pure white** (`#ffffff`) for large areas. Use `#e8e0ff` (starlight) or `#e8e8e8` (text) instead.
5. **Companion sprites must pop** against any background. If a sprite doesn't read clearly on a given background, the background is wrong.

---

## 3. Asset Specifications

### Companion Sprites (per constellation)

| Property | Spec |
|----------|------|
| **Native size** | 32×32px (rendered at 64×64 or 48×48 with `image-rendering: pixelated`) |
| **Format** | PNG with transparency |
| **Variants per constellation** | 5 moods: happy, excited, calm, sleepy, curious + 1 idle/neutral |
| **Palette constraint** | Each constellation has a signature accent color over the purple base |
| **Animation** | 2-frame idle bob (shift 1px up/down). Mood transitions: 3-frame crossfade |
| **File structure** | `public/sanctuary/companions/{constellation}/{mood}.png` |

#### Constellation Accent Colors

| Constellation | Accent | Character Note |
|---------------|--------|----------------|
| Aether | `#e8e0ff` (white shimmer) | Ethereal, translucent edges |
| Spectra | `#ff66aa` + `#66bbff` (rainbow shift) | Prismatic eye reflections |
| Solveil | `#ffd700` (solar gold) | Warm glow, sun-like aura |
| Nebulu | `#b088ff` (deep lavender) | Misty, cloud-like edges |
| Chroma | `#ff4466` + `#44ff88` (vivid contrast) | Bold, saturated accents |
| Rose | `#ff88aa` (soft pink) | Gentle glow, rosy cheeks |
| Monflare | `#ff9944` (flame orange) | Flickering edge particles |
| Auracore | `#44ddbb` (teal core) | Inner glow emanating outward |
| Parallel | `#4488ff` (electric blue) | Geometric, slightly angular |
| Prime | `#ffd700` + `#9966ff` (gold-purple) | Regal, slightly larger eyes |

### World Map Background

| Property | Spec |
|----------|------|
| **Size** | 720×405px (16:9 aspect, matching current container) |
| **Style** | Top-down pixel-art star-map with themed terrain zones |
| **Palette** | Dark cosmic base (`#0a0a1a`) with luminous location zones |
| **Detail level** | Low — suggestive terrain, not detailed tiles. Think constellation map, not Zelda overworld |
| **Location markers** | Each zone has a distinct glow color matching the location theme |
| **Stars** | Scattered tiny bright dots (1-2px) across empty space. Some twinkle (CSS animation) |
| **Mood** | Serene, inviting, like looking at a planetarium ceiling with cozy glowing islands |
| **File** | `public/sanctuary/map_bg.png` |

### Location Vignettes (optional, for tooltips/panels)

| Property | Spec |
|----------|------|
| **Size** | 64×64px native |
| **Style** | Iconic pixel scene representing each location |
| **Examples** | Hot Springs: steaming pool with pixel bubbles. Star Garden: tiny flowers under starlight |
| **File** | `public/sanctuary/locations/{location_slug}.png` |

### Empty State Illustrations

| Property | Spec |
|----------|------|
| **Size** | 96×64px native |
| **Style** | Simple pixel scenes showing "waiting" or "come back" themes |
| **Mood** | Inviting, not sad. A sleeping Skrumpey silhouette, not an empty void |
| **Usage** | No-companion-selected, empty journal, no quests available |
| **File** | `public/sanctuary/empty/{state_name}.png` |

---

## 4. Animation Guidelines

### Principles

1. **Pixel-snapped movement.** All translations in whole-pixel increments. No sub-pixel smoothing.
2. **Low frame count.** 2-4 frames per animation cycle. This is pixel art, not Flash.
3. **Subtle over dramatic.** A 1px float is better than a 10px bounce.
4. **Glow over motion.** Prefer pulsing luminosity changes over position changes for ambient effects.

### Standard Animations

| Animation | Frames | Duration | Usage |
|-----------|--------|----------|-------|
| **Idle bob** | 2 (up 1px, down 1px) | 2s ease | Companion sprite resting |
| **Happy bounce** | 3 (up 2px, down 1px, rest) | 0.6s | Mood = excited, interaction feedback |
| **Sleepy sway** | 2 (tilt 1px left, 1px right) | 3s ease | Mood = sleepy |
| **Sparkle** | 3 (appear, bright, fade) | 1.5s | Reward gained, level up, quest complete |
| **Glow pulse** | CSS only (opacity 0.6→1→0.6) | 2s ease | Active location, selected state |
| **Star twinkle** | CSS only (opacity 0→1→0) | 3-5s random | Background star-field decoration |
| **Bar fill** | CSS transition (width) | 0.5s ease-out | Bond/XP gain |

### Animation Don'ts

- No screen shake or camera effects
- No particle explosions (small sparkle bursts only)
- No continuous spinning or rotation
- No animation on elements below the fold / not in viewport

---

## 5. Typography in Sanctuary

Inherits SWO global: **Pixelify Sans** for all text (SNES-mood bitmap font, swapped from Press Start 2P 2026-04-26 per `[SWO_V3_FONT_SWAP]`).

| Element | Size | Color | Notes |
|---------|------|-------|-------|
| Section headers | 12-14px | `#ffd700` | UPPERCASE, tracking-wider |
| Companion name | 12px | `#ffd700` | Truncate with ellipsis if long |
| Body text | 8-10px | `#e8e8e8` | Standard readability |
| Stat labels | 7-8px | `#888` | Muted, uppercase |
| Tiny metadata | 6-7px | `#666` | Timestamps, counts |

**Mobile override:** Minimum touch-target text = 9px. Scale up the 6-7px elements on screens < 640px.

---

## 6. UI Component Patterns

### Cards (`.pixel-card`)
Already defined in globals.css — use as-is for Sanctuary panels. The beveled border + purple inner glow + gold corner decoration is the SWO signature and Sanctuary inherits it.

### Stat Bars
Current implementation is correct: thin (1.5px height), dark track with colored fill, rounded. Keep this minimal approach — don't over-design bars.

### Buttons
Use existing `.pixel-btn` / `.pixel-btn-gold` for primary actions. Interaction buttons (feed/pet/talk/send) use the current grid layout with emoji + label pattern. When sprites arrive, replace emoji with 16×16 pixel icons.

### Map
Current grid-line overlay is a placeholder. Replace with `map_bg.png` background image. Location markers stay as positioned buttons but get location vignette icons instead of emoji.

---

## 7. Asset Generation Workflow

### For Companion Sprites
**Tool:** Retro Diffusion or manual pixel art (Aseprite/Piskel)  
**NOT:** Claude Design, Midjourney, DALL-E (these produce wrong resolution/style)  
**Process:**
1. Generate base 32×32 sprite per constellation using accent color table above
2. Create 5 mood variants (minimal changes: eye shape, mouth, optional accessory)
3. Export as individual PNGs with transparency
4. Test at 48px and 64px display sizes — must be readable and charming
5. Test on dark background (`#0a0a1a`) — sprite must pop without custom backdrop

### For Map Background
**Tool:** Retro Diffusion or Aseprite (manual pixel art)  
**Layout guidance:** Claude Design can suggest zone placement and composition  
**Process:**
1. Start with 720×405 dark base
2. Paint 8 luminous zones at positions matching current `position_x/y` coordinates
3. Add scattered stars (1-2px white dots, varying opacity)
4. Keep zones as colored glows/terrain suggestions, not detailed illustrations
5. Test with location buttons overlaid — buttons must remain clickable and readable

### For Icons/Illustrations
**Tool:** Aseprite or Piskel (manual pixel art preferred for consistency)  
**Process:**
1. Work at native resolution (64×64 for locations, 96×64 for empty states)
2. Use the Sanctuary palette — no colors outside the defined system
3. Test rendering at 1× and 2× — should look good at both

---

## 8. Style Compliance Checklist

Before any Sanctuary asset ships, verify:

- [ ] **Skrumpey compatibility:** Does the asset look like it belongs in the same world as `purple_skrumpey.png`?
- [ ] **Pixel integrity:** No anti-aliased edges, no sub-pixel rendering, crisp at native res?
- [ ] **Palette compliance:** All colors within the defined system? No rogue greys or off-brand hues?
- [ ] **Readability at target size:** Can you identify what this is at its intended display size?
- [ ] **Dark background test:** Does it pop on `#0a0a1a`? No dark-on-dark issues?
- [ ] **Mood match:** Is it charming and inviting? Would you describe it as "cute" or "cool" rather than "dark" or "scary"?
- [ ] **File size:** Pixel art PNGs should be <20KB per sprite, <100KB for map background
- [ ] **Transparency:** Sprites have transparent backgrounds, not colored ones?

---

## 9. Reference Mood Board (verbal, for asset generation prompts)

**YES — looks like Sanctuary:**
- Stardew Valley's mines (luminous gems on dark rock, charming despite being underground)
- Celeste's pixel clouds and stars (ethereal, precise pixel work, emotional warmth)
- Kirby's Dream Land star backgrounds (cute characters on cosmic backdrops)
- Animal Crossing's museum planetarium (cozy + cosmic)

**NO — does NOT look like Sanctuary:**
- Hollow Knight (too dark, too melancholy, insects not blobs)
- Dark Souls UI (gothic, oppressive, no charm)
- Generic "dark space" with nebula stock photos (not pixel art, not charming)
- Crypto/DeFi dashboard aesthetics (cold, utilitarian, no personality)
