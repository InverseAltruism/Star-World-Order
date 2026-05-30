# SWO V2 — Site-Wide UI Overhaul & Boot-Screen Redesign

> Status: **Approved — in progress** · Author: design audit 2026-05-31 · Branch: `dev` (work directly, no PR-per-step)
> Scope: whole-site visual system + new loading/boot screen + IA/nav + Sanctuary finish-line.
> This is a *consolidation + level-up* of the existing retro-pixel identity, not a from-scratch reskin.
>
> **Locked decisions (2026-05-31):** aesthetic = **cozy N64/CRT, refine current** (not harder BIOS — keep the warm console soul; the BIOS/terminal texture is reserved for the boot screen & system pages only). Component base = **pixelact-ui (shadcn/Radix)** themed to SWO tokens. Rollout = **work directly on the `dev` branch**, sequenced (foundation → boot → surfaces → sanctuary), not a stack of separate PRs. Start = **Foundation (Track A)**.

---

## 0. TL;DR

The app is already a synthwave / N64 / CRT cozy-retro pixel site, but the "design system" is
3,656 lines of hand-written `globals.css` with **no tokens, no shared components, a dead Tailwind v3
config fighting live Tailwind v4, and no centralized layout**. Every page is "neon pixel heading +
tab row + cards on a starfield," which reads flat and generic despite charming source art (the
Skrumpey NFTs and sanctuary sprites are genuinely good).

V2 = **(1)** a real token + primitive layer, **(2)** a redesigned "STAR-64" boot screen that is
*both* better-looking and faster-perceived, **(3)** an IA/nav that actually surfaces the two biggest
experiences (Sanctuary game + Casino), **(4)** a per-surface visual pass, and **(5)** finishing the
last Sanctuary mile. Shipped as ~10–14 small PRs (300–800 lines each) down the existing
`dev → main` promotion path.

---

## 1. Design vision: "STAR-64 / Cosmic OS"

Keep the cozy-retro-console soul; sharpen it into a coherent **fictional retro game console + its OS**.

- **Concept:** the whole site is the UI of a fictional late-90s cosmic game console, the **STAR-64**
  (the boot screen already names it). Navigation = the console's "OS"; each feature = a "cartridge /
  app." This gives one organizing metaphor for nav, loading, empty states, and error pages.
- **Mood:** deep-charcoal/indigo night, **off-white text (never pure white on pure black)**, neon
  gold/magenta/cyan reserved for *accents and focus*, not body. Cozy > harsh — lean **Sweetie 16 /
  Resurrect 64** rather than PICO-8's high-glare set.
- **Three texture layers, kept separate and in sync:**
  1. **DOM chrome** — Tailwind v4 tokens, 9-slice pixel panels, CSS scanline/vignette overlay.
  2. **Phaser game canvas** — its own GLSL postFX (CRT curvature + bloom + chromatic aberration).
  3. **Brand art** — Skrumpey/companion sprites, treated as content, on a calm frame.

---

## 2. Current-state diagnosis (what we're fixing)

| Area | Problem | Evidence |
|---|---|---|
| Tokens | No design tokens; palette duplicated in dead `tailwind.config.ts` (v3) **and** `globals.css` `:root`, with Tailwind v4 actually CSS-first | `tailwind.config.ts`, `app/globals.css:8-38` |
| CSS | One 3,656-line `globals.css`, ~110+ lines just for the loading screen | `app/globals.css` |
| Primitives | No component lib; buttons/cards/badges re-implemented inline; nav repeats an 8-line style block ~8× | `components/Header.tsx`, `components/Hero.tsx` |
| Layout | `Header` imported per-page, **missing on casino/starforge/admin**; footer inline on landing only; hangout renders 2 nav bars | `app/layout.tsx`, `app/*/page.tsx` |
| IA | Flat 6–8 link nav **omits Casino, Treasury, Members**; Sanctuary world + Casino are undiscoverable from nav | `components/Header.tsx` |
| Boot | 7.6s scripted, click-gated, sessionStorage-flagged (replays per tab); Google-Fonts `<link>` → FOUT | `components/LoadingScreen.tsx`, `app/layout.tsx:18-21` |
| Fonts | "Press Start 2P" used for everything incl. body; not `next/font` | `app/layout.tsx` |
| Effects | CRT scanlines (`body::before` z-9998) + noise (`body::after` z-9997) + global `image-rendering:pixelated` force z-index hacks; no reduced-motion gating | `app/globals.css:41-109` |
| A11y | Neon-on-dark contrast unverified; all-caps pixel body text; no reduced-motion path; weak focus rings | global |

---

## 3. Foundation layer (do this first — everything else depends on it)

### 3.1 Token system (Tailwind v4 `@theme`)
- Define one source of truth in `globals.css` via Tailwind v4 `@theme { --color-*; --font-*; --spacing-*; }`.
- **Delete the dead `tailwind.config.ts`** palette/font/animation extensions (v4 ignores them) — keep only what v4 still reads (content globs if any / plugins).
- Token groups:
  - **Surface:** `--color-bg` (deep charcoal `#0f0f1e`-ish, *not* pure black), `--color-surface`, `--color-surface-raised`, `--color-border`.
  - **Text:** `--color-fg` (off-white ~`#e8e8e8`), `--color-fg-muted`, `--color-fg-dim`.
  - **Accents (decorative + focus only):** `--color-gold`, `--color-magenta`, `--color-cyan`, `--color-purple`, `--color-green`, `--color-danger`.
  - **Per-feature accent** map (sanctuary=purple, casino=magenta, dao=gold, raffle=cyan…) as tokens, not inline hex.
- Generate the text/UI ramp through **InclusiveColors** so every fg/bg pair is **WCAG AA (4.5:1 text, 3:1 UI/focus)**. Keep a *separate* "art" palette (Sweetie 16 / Resurrect 64 from Lospec) for sprites/decor — do **not** let raw neon become body text (it "vibrates").

### 3.2 Fonts via `next/font` (self-hosted, `display: swap`)
- **Press Start 2P** — hero titles / "PRESS START" only.
- **Pixelify Sans** — section sub-headings & mid-size UI (has 4 weights, stays readable small).
- **Departure Mono** — numeric HUD, stat tables, leaderboards, STAR balances (monospaced = clean columns).
- **VT323** — boot/terminal log & any console-style body.
- All OFL. Remove the raw Google-Fonts `<link>` from `app/layout.tsx`. **Stop using Press Start 2P for body** (readability + a11y).

### 3.3 Effects as opt-in tokens, not forced globals
- Move CRT scanlines / noise / flicker into a `.crt-overlay` component wrapper gated by
  `prefers-reduced-motion` **and** an in-app "CRT effects: off / low / full" setting (persisted).
- Drop the blanket `* { image-rendering: pixelated }`; apply `image-rendering: pixelated` only on
  pixel-art elements and 9-slice panels. This removes the z-9998/9999 layering hacks.

---

## 4. Component primitives (`components/ui/`)

Introduce a small, accessible primitive set so pages stop hand-rolling chrome.

- **Base:** evaluate **pixelact-ui** (pixel components built on shadcn/Radix, Tailwind-v4-native) as
  the interactive base — gets us accessibility (focus, keyboard, ARIA) for free, themed to SWO tokens.
  If we'd rather not adopt shadcn, hand-roll the same primitives but keep Radix for menus/dialogs.
- **9-slice pixel panels/buttons:** take **Kenney Pixel UI Pack (CC0)** PNGs → run through Lean
  Rada's 9-slicer → ship `.swo-panel` / `.swo-button` via `border-image` + `image-rendering:pixelated`.
  Crisp at any size, replaces the bespoke `.pixel-card`/`.pixel-btn` bevels.
- **Primitives to build:** `Button` (variants: gold/ghost/danger), `Panel`/`Card`, `Tabs`,
  `Badge`/`Chip`, `StatReadout` (Departure Mono numbers), `Dialog`/`Sheet`, `Tooltip`, `EmptyState`,
  `ProgressBar` (stepped), `Skeleton`, `Toast`, `FocusRing` (chunky 3:1 pixel outline).
- **Each primitive ships with the page that first needs it** — no giant "primitives PR" that touches
  nothing visible (matches our PR-quality rule: wired end-to-end).

---

## 5. Boot screen redesign — "STAR-64 BIOS boot"

Goal: **better-looking AND faster-perceived.** The current 7.6s click-gated sequence is charming but
blocks and replays per tab.

### Concept
A two-beat boot: a **"PRESS START" gate** → a short **BIOS/POST log** that resolves into the app.
- **PRESS START gate** (functional, not just flavor): the tap **unlocks WebAudio** (required for
  Phaser/howler sound) and **triggers prefetch** of the route's heavy bundle. Keep the cozy STAR-64
  console scene but make the cartridge insert the *gate*, not a 2s cinematic.
- **BIOS/POST log** in **VT323**: a stepped (`steps()`) typewriter "memory check / loading
  constellation map / mounting STAR ledger…" over a **real Next.js streamed skeleton underneath**.
  The log is **time-boxed (~1.5–2.5s) and auto-skips the instant real load completes** — it never
  blocks a fast load.
- **Return visitors skip** (persist the seen-flag in **localStorage**, not sessionStorage, so it
  doesn't replay every tab — confirm desired cadence; offer "replay intro" in settings).
- Keep the **SKIP** button and full keyboard/`role` a11y; respect `prefers-reduced-motion` (static
  logo + instant skip).

### Perceived-performance plumbing (the "faster" half)
- Add per-route `loading.tsx` + Suspense skeletons that **match final layout** (kill CLS); keep hero
  synchronous, stream the periphery (avoid the "popcorn" skeleton flicker).
- Prefetch the Sanctuary/Phaser bundle on the PRESS START gesture.
- Self-hosted fonts (`next/font`) remove the FOUT the current `<link>` causes.

Target: boot *feels* instant on warm loads, ≤2.5s themed sequence on cold, and never re-blocks
returning users.

---

## 6. Layout & IA / navigation overhaul

### 6.1 Centralize chrome
- Put `<Header/>` + `<Footer/>` (new shared component) in **`app/layout.tsx`** (or a route-group
  layout), so every page gets consistent chrome and casino/starforge/admin stop being orphaned.
  Remove per-page `<Header/>` imports and the inline landing footer. Fix the hangout double-nav.

### 6.2 New IA (the "Cosmic OS" model)
Reorganize the flat bar into grouped, discoverable nav. Proposed top-level:
- **Play** → Sanctuary (companion), Casino, Star Forge, *(Outer Rim — reserved/locked tile)*
- **Community** → Hangout, DAO/The Order, Members, Raffle
- **Collection** → Gallery, Treasury, Profile
- Persistent right side: **STAR balance readout** (Departure Mono) + Wallet + Notifications.
- Mobile: full-screen "console menu" overlay grouped the same way.
- Surface **Casino, Treasury, Members** (currently nav-hidden) and give **Outer Rim** a visible
  "coming soon / locked cartridge" slot so the roadmap reads on the nav.

---

## 7. Per-surface redesign specs

Order = visibility/impact. Each is one PR-sized pass using the new tokens/primitives.

1. **Landing (`/`)** — strengthen hierarchy: one hero focal (the gold star + title), a *tighter*
   feature grid with real iconography (not 6 near-identical cards), live stats (holders, STAR minted,
   active companions) as Departure-Mono readouts, clear primary CTA. Shared footer.
2. **Sanctuary (`/sanctuary`)** — see §8; the centerpiece. Polish CompanionView into a real
   "Tamagotchi handheld" frame; finish Phase-4; unlock or clearly roadmap the World hub.
3. **Casino (`/casino`)** — give it the shared header (currently has none), unify the game cards,
   a coherent "cosmic arcade" framing, prominent provably-fair/responsible-gaming trust strip, clear
   testnet-vs-mainnet state. Honor existing gates/flags.
4. **DAO (`/dao`)**, **Raffle (`/raffle`)** — same heading+tabs pattern but with the new Panel/Tabs
   primitives, better empty states ("No active proposals" → a styled console card with a CTA).
5. **Gallery (`/gallery`)** — already the strongest page; mostly retheme to tokens + crisper labels.
6. **Hangout (`/hangout`)** — fix double-nav, apply panel primitives to lobby/chat/members.
7. **Profile / Treasury / Members** — token pass + StatReadout components.
8. **System pages** — `loading.tsx`, `not-found`, `error`, `/region-not-supported` all get the
   STAR-64 OS treatment (consistent BIOS/console framing).

---

## 8. Sanctuary finish-line (where we left off → done)

**Built & wired** (Companion view): Phase 1 shared resources, Phase 2 Quests v2 (earn+wager),
Phase 3 arcade + charms, streaks/preferences/sleep/variable-rewards, on-chain soulbound STAR (testnet).

**Remaining to finish (fold into V2):**
1. **Phase-4 polish:** add the "Today" panel; declutter the Quest Board; fold overlays cleanly into
   `SanctuaryWindow`. *(player flow → needs E2E.)*
2. **Unlock or roadmap the World hub:** the default view dead-ends at a disabled **"Sanctuary World —
   Coming Soon"** tile (`CompanionView.tsx:1406-1416`); decide: ship the `?world=1` Phaser hub or make
   the locked state intentional/branded.
3. **Retire V1:** remove the duplicated `/api/sanctuary/quests` + `expeditions/*` and the
   `QuestBoard/QuestDialog/QuestTracker/ExpeditionDialog` overlays still mounted in `SanctuaryV2.tsx`.
4. **Calibrate** arcade `MINIGAME_PAR`; **batch** mainnet STAR minting before go-live.
5. **Prune** orphaned `public/sanctuary-v3/` art (or confirm reuse for V2 world).
6. **Outer Rim:** UI-less today (docs + pure libs + DUST contract). **Out of scope for the visual
   overhaul** beyond reserving the locked nav slot; build its UI as its own later track once ADR-003
   (OQ1) is approved.

---

## 9. CRT / effects strategy

- **DOM:** CSS scanline + vignette + subtle flicker as a *single* `.crt-overlay` wrapper, compositor-
  cheap, reduced-motion-gated, intensity-toggleable. (Refs: Lucas Bebber CodePen, aleclownes.com,
  D3nn7/crt-css.)
- **Phaser canvas only:** a GLSL **postFX pipeline** (crt-pi-derived: curvature + scanline mask +
  bloom + chromatic aberration) — one quad, cheap; **don't** run heavy post-FX over the whole DOM.
  Reference PixiJS CRTFilter + AdjustmentFilter (MIT) for parameters. Settings slider:
  off / low / full; default low on mobile.

---

## 10. Animation strategy

- **CSS-first** for everything pixel: sprite loops with `steps()` (authentic frame-snap, not smooth
  interpolation), keyframe flicker, boot typewriter. Zero JS, compositor-cheap.
- **Add Motion (framer-motion)** *only* for orchestration: route/page transitions, modal/panel
  enter-exit, staggered reveals, layout animation. Use `useReducedMotion`.
- **No react-spring** (its physics smoothing fights the pixel snap).
- **No-motion-first:** author static, layer motion for users who allow it.

---

## 11. Accessibility (non-negotiable, baked into each PR)

- WCAG AA: 4.5:1 text, 3:1 large/UI/focus. Off-white on deep charcoal; neon = accents only.
- `prefers-reduced-motion` disables scanline flicker / CRT jitter / transitions; plus explicit
  in-app CRT-off toggle.
- Pixel body text uses lowercase-bearing faces (VT323 / Departure Mono); all-caps pixel = labels only.
- Chunky, ≥3:1 pixel focus ring on every interactive primitive.

---

## 12. Rollout roadmap (PRs to `dev`, 300–800 lines each, E2E on player flows)

**Track A — Foundation (gates everything) — ✅ DONE 2026-05-31, verified live on test.starworldorder.com:**
- A1. ✅ Token system in Tailwind v4 `@theme` (`app/globals.css`) — surfaces/text/accents/per-feature/font roles; legacy `--pixel-*`/`--neon-*` aliased onto tokens with exact current hex → zero visual shift. (Dead v3 config left in place but no longer the palette source; safe to delete later.)
- A2. ✅ `next/font` self-hosting — Press Start 2P / Pixelify Sans / VT323 (Google) + Departure Mono (local woff2 in `app/fonts/`); removed render-blocking Google `<link>`. `app/fonts.ts`.
- A3. ✅ `components/ui/` primitives — Button, Panel, Badge, StatReadout, Tabs (Radix), CrtToggle + `cn()`. Deps added: clsx, tailwind-merge, class-variance-authority, @radix-ui/react-tabs. Wired into Hero CTAs; full showcase at `/dev-preview/ui`.
- A4. ✅ Centralized layout — new `Footer` + path-aware `SiteChrome` in root layout render Header/Footer/FeedbackButton once; removed per-page `<Header/>` from 10 pages + inline landing footer. Casino now gets the global header (was orphaned); footer suppressed on game/casino/admin surfaces. (Hangout "double nav" was just its in-content lobby bar — no fix needed.)
- A5. ✅ Effects refactor — CRT scanlines/noise now controllable via `<html data-crt=full|low|off>` + `CrtToggle` (persisted) and hard-disabled under `prefers-reduced-motion`; narrowed global `* { image-rendering: pixelated }` → `img, canvas` only (pixel art stays crisp). No-flash init script in layout.

**Track B — Boot screen:**
- B1. `loading.tsx` + Suspense skeletons (perceived-perf plumbing).
- B2. STAR-64 BIOS boot redesign (PRESS START gate unlocks audio + prefetch; VT323 POST log; time-boxed/auto-skip; localStorage cadence). *(E2E: skip + return-visit.)*

**Track C — Surfaces (parallelizable after A):**
- C1 Landing · C2 Casino chrome+cards · C3 DAO/Raffle · C4 Gallery/Hangout · C5 Profile/Treasury/Members · C6 system pages.

**Track D — Sanctuary finish (player flows → E2E):**
- D1 Phase-4 polish (Today panel + declutter) · D2 World-hub decision (ship or brand-lock) ·
  D3 retire V1 quests/expeditions · D4 arcade par calibration + mainnet STAR batching · D5 art prune.

Promotion: each lands on `dev` → verify on test.starworldorder.com → batched `dev → main` PR → prod.
Avoid dupe-racing PRs; audit any WIP file-by-file before bulk changes.

---

## 13. Open decisions (need operator input before execution)

1. **Aesthetic lean:** cozy-N64 (current, warmer) vs harder arcade/BIOS (cooler, more "OS"). Default: cozy with a BIOS *boot* moment.
2. **Component base:** adopt pixelact-ui (shadcn/Radix) vs hand-rolled primitives. Default: adopt — accessibility for free.
3. **Animation lib:** add Motion for orchestration vs stay CSS-only. Default: add Motion, CSS for pixel.
4. **Rollout shape:** incremental page-by-page (recommended, low risk) vs big-bang behind a `?v2` flag.
5. **Sanctuary World hub:** ship the `?world=1` free-roam now, or keep it an intentional locked "coming soon."
6. **Boot cadence:** once-ever (localStorage) vs once-per-session (current) vs every visit.

---

## 14. Source references (research)

Fonts: Press Start 2P, Pixelify Sans, Departure Mono, VT323 (all OFL, `next/font`).
Components: pixelact-ui (shadcn), NES.css / RPGUI (refs), Kenney Pixel UI Pack (CC0), Lean Rada 9-slicer.
Effects: Lucas Bebber CRT CodePen, aleclownes.com, D3nn7/crt-css, PixiJS CRTFilter (MIT), crt-pi.
Palette: Lospec (Sweetie 16 / Resurrect 64), InclusiveColors (WCAG token gen).
Perf: Next.js streaming/Suspense/`loading.tsx`. Motion: framer-motion `useReducedMotion`. A11y: WCAG 2.2, `prefers-reduced-motion`, Tatiana Mac no-motion-first.
