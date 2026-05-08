# Companion UI — Before/After Audit (2026-05-08)

_Audit task: `[SWO_V2_COMPANION_UI_BEFORE_AFTER_AUDIT]` (P2)._

## TL;DR

The four-PR cozy push (#282–#285) lifted the Companion surface from "additive overlay clutter" to "one tamagotchi shell with consistent pixel-art language." Shell clarity, tactile affordance, and pixel-art cohesion are clearly improved. Emotional warmth is **good in mood-extreme states** (sleeping, very-happy, milestone celebrate) but **still generic in the default `idle` state**, which is what most players see most of the time. Readability is the weakest dimension — 7px / 8px Press Start 2P body copy is at the edge of legibility on mobile, especially with cyan/lavender on `#0a0a15`. **Not a pass on its own bar yet** — three concrete gaps are queued as follow-ups.

| Dimension | Before (pre-#282) | After (post-#285) | Score (/10) | Verdict |
|---|---|---|---|---|
| Shell clarity         | 4 | 8 | **8/10** | One device-shaped shell instead of four floating cards. Pass. |
| Tactile affordance    | 3 | 8 | **8/10** | Action buttons have real depth + press travel + focus rings. Pass. |
| Emotional warmth      | 4 | 6 | **6/10** | Strong in mood-extreme states; flat in default idle. Conditional pass. |
| Readability           | 6 | 6 | **6/10** | Press Start 2P at 7–8px on dark fields is the bottleneck. No regression, no improvement. |
| Pixel-art cohesion    | 3 | 8 | **8/10** | Single chrome + VFX manifest with shared palette. Pass. |
| **Overall**           | 4.0 | 7.2 | **7.2/10** | Below the "feels distinctively cozy" bar (≥8.0). Three follow-ups queued. |

## Scope of the audit

This audit checks the Companion surface at `app/sanctuary/CompanionView.tsx` after the shell + RD batches landed:

- **#282** `[SWO_V2_COMPANION_UI_SHELL_REDESIGN]` — single tamagotchi shell, five zones, layout helpers in `lib/sanctuary/companionShell.ts`.
- **#283** `[SWO_V2_RD_COMPANION_CHROME_BATCH_2]` — 9-slice frame set + ornaments under `public/sanctuary/ui/chrome/`.
- **#284** `[SWO_V2_COMPANION_INTERACTABLES_POLISH]` — shared `CompanionActionButton` with all variants + pixel-art SVG icons + `CompanionChip` outline language.
- **#285** `[SWO_V2_COMPANION_MISC_COZY_ASSETS]` — 12 VFX/ornament SVGs (snack pips, hearts, sparkles, sleepy Z, very-happy aura, journal stickers).

The "before" baseline is the state of `CompanionView.tsx` immediately prior to PR #282 — four floating `pixel-card` panels with flat 2px borders, raw emoji affordances on the action grid, no chrome, no per-state VFX layers, single greeting line.

## How this audit was performed

**Code-first, not screenshot-first.** Spawned-agent runs do not have a wallet-connected, companion-populated browser session available, and standing one up (Next.js dev server + colyseus + sqlite seed + mock wallet auth + signed-in companion record) is out of budget for a P2 audit run. Acceptance criterion (a) — capture before/after screenshots at mobile + desktop, idle + interacting + sleeping — is therefore **not satisfied by this run**; it is queued as a follow-up (`[SWO_V2_COMPANION_UI_AUDIT_SCREENSHOTS]`, see below). The judgments below are grounded in the actual JSX, CSS, and asset manifests, not visual sampling.

What this means for the scores: the structural / asset / state-coverage dimensions (shell, tactile, cohesion) are confidently scored. Emotional-warmth and readability include a margin of subjectivity I'd trim with a real-device pass.

## Dimension scoring

### 1. Shell clarity — 8/10

**Before.** Four discrete `pixel-card`s — needs, actions, journal, chat — floating on the page with no shared border language and no anchoring frame. Visually read as "four widgets," not "one device."

**After.** A single `chrome-panel` (9-slice border-image from `panel_frame.svg`) wraps the sprite + needs zone, with paired `chrome-flourish-a` / `chrome-flourish-b` corner ornaments and a shared 8px border. Action / journal / chat continue to use `pixel-card` but now sit beside the chrome panel as deliberate satellite cards (`grid md:grid-cols-2`). `lib/sanctuary/companionShell.ts` exposes `zoneOrderFor(layout)` so mobile re-stacks header → viewport → actions → needs → journal (thumb-down feel) and desktop is header → viewport → needs → actions → journal. Shell zones are explicit and named.

**Why not 10.** The chrome treatment is applied only to the sprite/needs panel; actions/journal/chat panels still use `pixel-card`, which has a different (flat-rectangular) border story. The shell reads as **one chrome panel + three satellite cards**, not as **one continuous device**. To clear the 9–10 bar, every primary panel on the surface should share the chrome border language (or pixel-card should be retired in favor of a `chrome-panel--muted` variant).

### 2. Tactile affordance — 8/10

**Before.** Action buttons were inline JSX with flat 2px borders and emoji glyphs. No press travel, no focus ring, no resolved variant for "another action in flight," no pixel-art icon language. Sleep + cooldown + disabled states were ad-hoc.

**After.** `CompanionActionButton` resolves a single state from `resolveCompanionActionState({ action, busy, isSleeping, cooldownSeconds, isSelected })` and emits one of seven variant classes (`idle / hover / pressed / disabled / sleeping / cooldown / selected`). CSS gives each:

- **Idle:** layered inset highlight + 2px drop shadow → real "rest" depth (`globals.css:3097`).
- **Hover:** `translateY(-1px)` + warmer color + soft purple glow.
- **Pressed:** `translateY(2px)` + inner shadow inversion → physical press travel.
- **Pressed + busy:** `companion-action-pulse` 1.1s gold-glow loop.
- **Sleeping:** cool dusk tint, "💤" badge, cyan border accent — distinct from "broken."
- **Cooldown:** warm copper tint, seconds badge, orange border accent.
- **Disabled:** preserved cozy palette at 0.65 opacity (no harsh grey).
- **Focus-visible:** swap to `focus_ring.svg` 6px border + warm gold halo (`globals.css:3269`).

Variants and precedence are covered by 13 unit tests in `lib/sanctuary/__tests__/`.

**Why not 10.** Stat bars and the journal "OPEN/CLOSE" chat toggle still feel flat — only the five action buttons got the tactile pass. The `Enter Sanctuary` CTA at the bottom is a one-off styled `<button>` that doesn't share the chrome-button language. Until every interactive surface in the shell speaks the same depth + focus + press vocabulary, this is conditional.

### 3. Emotional warmth — 6/10

**Before.** A single greeting line and three floating stat bars. No celebratory feedback, no per-mood differentiation in the sprite frame, no empty-state warmth.

**After.** Real warmth in **state-extreme moments**:

- **Time-of-day prefix + cozy greeting line** (header).
- **Stat-delta `+N` floating text** when an action lands.
- **Bond-milestone celebration** at 25/50/75/100: gold banner, 10 emoji + 6 pixel-art sparkle/heart sprites bursting in a circle around the sprite, `heart` VFX emitted to V2 world bus.
- **Sleeping state:** `vfx-sleepy-zzz-stamp` overlay + 3 staggered drift-Z particles + journal swaps paw → moon sticker + dream-themed copy.
- **Very-happy aura:** when mood ∈ {happy, excited} AND bond ≥ 50, four corner sprites slow-pulse around the sprite frame.
- **Per-action VFX layer:** snack pips for feed, heart pips for pet, sparkle for play/talk, drift Z for sleep — alongside the emoji burst.
- **Journal empty-state pixel-art stickers** flanking the cozy text (paw + moon, swapped while sleeping).

**Why only 6.** All of the above only fires on **events**. The default `idle` state — the one a new player sees on first load before they tap anything, and the one a returning player sees when stats are mid-range and bond < 50 — has the same visual vocabulary as the "before": a sprite, a mood emoji badge, three stat bars, three pills, a couple of static cozy stars behind the sprite. There is no companion-specific tell (breathing, blink, idle gesture, time-of-day room/lighting tint) until the player commits an action. The companion still feels like **a portrait card with vitals**, not **a creature in a corner of the world**, when nothing is happening.

The `cozy-star` field (5 dots) animates but is generic — the same five stars float behind every Skrumpey, every mood, every time-of-day. They do not vary by trait, level, or constellation, and they sit behind the sprite where players don't look.

### 4. Readability — 6/10

**Before.** Same body type system as today: `Press_Start_2P` at 7–10px on dark navy backgrounds.

**After.** No regression, no improvement. Specific pain points that survive:

- Journal entries: `text-[8px] text-gray-300` at 1.4 leading on `#0a0a15` border-left card. Press Start 2P at 8px is below most accessibility floors and gets worse for English readers on small phones (~360px CSS width).
- Stat bar values: `text-[8px]` color-keyed to bar color (`#ff9944`, `#ff66aa`, `#66ccff`) — three different chromas at small size, all close to AA-borderline against `#1a1a2e`.
- Header ladder: `text-[10px]` greeting + `text-[10px]` time-of-day prefix + `text-[8px]` last-visit hint, all italic, three close colors (`#88ccff`, `#bb88ff`, `gray-500`). On a phone this stacks four narrow lines of similar weight; the eye doesn't know which is the headline.
- "💤 Shhh — they're dreaming." footer line uses `text-[8px]` Press Start 2P — narrow + small + cyan on near-black is the worst legibility cell in the design.

This dimension is the most likely to fail real-device testing.

### 5. Pixel-art cohesion — 8/10

**Before.** Raw emoji affordances on action buttons, no shared chrome language, no asset manifest, no palette discipline beyond `SANCTUARY_STYLE_DOCTRINE.md`.

**After.** Two manifests under `public/sanctuary/ui/{chrome,vfx}/manifest.json` declare every asset's prompt, seed, palette, and intent so RD-generated PNG drop-ins can replace the SVGs without code changes. The palette is genuinely shared:

- Chrome: `#0d0a1c` deep / `#1a1430` panel / `#4a3a7e` frame mid / `#ffd070` gold / accents `#88e0ff`, `#bb88ff`, `#ff99cc`.
- VFX: same anchors — `#ffd070` for sparkles, `#ff99cc` for hearts, `#88e0ff` for sleepy Zs.
- All sprites use `image-rendering: pixelated` and integer pixel sizes (8/12/16px boxes).
- All animations are gated behind `prefers-reduced-motion: reduce` consistently.

Eight chrome assets + 12 VFX assets share a coherent visual language with the existing Sanctuary doctrine.

**Why not 10.** The actions/journal/chat panels use `pixel-card`, which predates the chrome manifest and applies a non-9-slice border. The mood badge in the corner of the sprite frame is a CSS-only `bg-black/90` pill with `border border-[#9966ff]/60` — no pixel-art treatment, no manifest entry. The "Enter Sanctuary" CTA is `bg-[#00f7ff]/15 border-2 border-[#00f7ff]/60` flat — visually unrelated to the chrome above it.

## Remaining gaps (>3 required)

If the surface still feels generic, these are the concrete reasons:

### Gap 1 — Idle is still a portrait card

The default state — no sleep, no very-happy aura, no celebration, no in-flight action — gets static cozy stars and nothing else. A first-load player sees a polished sprite frame with vitals but no living-creature signal: no idle blink, no breathing scale loop on the sprite, no time-of-day tint on the frame, no per-trait or per-constellation varation. The whole emotional-warmth case rests on event-triggered VFX; players who lurk and don't tap experience none of it. Recommended fix: a low-amplitude idle "breath" `transform: scale(1.0 → 1.012)` on the sprite, plus a gentle frame-tint shift keyed off `timeOfDayPrefix` (warm dawn, neutral day, cool dusk, deep night).

### Gap 2 — Pixel-art language is partial

`chrome-panel` only wraps the sprite/needs zone. Actions, journal, and chat still use `pixel-card` (flat 2px border). The `Enter Sanctuary` CTA is a one-off cyan flat button. The mood emoji badge is a CSS pill, not a chrome-treated badge. To clear "every panel on this surface speaks the same dialect," `pixel-card` should either get a `panel_frame_muted.svg` border-image variant or be retired in favor of the chrome classes, and the CTA + mood badge should adopt the chrome-button language.

### Gap 3 — Body copy fights readability at the smallest sizes

Press Start 2P at 7–8px on dark fields is the throughline — it shows up in journal entries, stat bar deltas, the sleeping footer, the last-visit hint, and the chat lines. The font is doctrinal (we are not switching), but two cheap mitigations would help: (a) raise body-copy floor from 8px → 9px on stories (`PRD: SANCTUARY_STYLE_DOCTRINE` already permits 9px for body), (b) use a non-pixel fallback (system stack) for journal + chat content where character count > 24, reserving Press Start 2P for headers, badges, and stat labels. The current rule "Press Start 2P everywhere" reads as committed to the bit but costs us on the surface where players actually want to read sentences.

### Gap 4 — Very-happy aura gates exclude most players

`bond_score >= 50` is the lower threshold for the aura. New players (bond 0–24) and even moderately attached players (25–49) never see it, even when their companion is in the happy/excited mood. The bar is high enough that the most polished VFX moment is invisible during the first dozen sessions. Either drop the gate to bond ≥ 25 or scale the aura intensity continuously with bond rather than gating it.

### Gap 5 — Stat bars don't tell a vitality story

Three horizontal bars colored orange/pink/cyan. A delta `+N` floats and a pulse fires when a stat changes, but at rest the bars look identical regardless of severity. A genuinely cozy tamagotchi cue would be: bars at <25% gain a soft red rim glow, bars at >75% gain a soft glow in their own color, and the text label ("Hungry — feed me!") gains a small wiggle when a need first crosses the alert threshold. Right now the bar at 12% looks the same as the bar at 88% except for width.

## Self-assessed pass/fail

The audit fails its own bar (≥8.0 overall is "feels distinctively cozy"). Surface scores **7.2/10** with two dimensions at 6/10. Per acceptance criterion (d), follow-ups are queued instead of hand-waving:

- **`[SWO_V2_COMPANION_UI_AUDIT_SCREENSHOTS]`** (P2) — capture the six promised screenshots (mobile + desktop × idle + interacting + sleeping) once a Playwright fixture with seeded companion stats + mocked wallet auth lands. Operator-run, ≤30min.
- **`[SWO_V2_COMPANION_IDLE_LIVING_TELLS]`** (P2) — close Gap 1. Add a low-amplitude breath loop on the sprite + a time-of-day frame tint keyed to `timeOfDayPrefix`. Reduced-motion respected.
- **`[SWO_V2_COMPANION_PANEL_LANGUAGE_UNIFY]`** (P2) — close Gap 2. Extend `chrome-panel--muted` (or retire `pixel-card`) so actions/journal/chat panels share the 9-slice border. Adopt `chrome-button` for the `Enter Sanctuary` CTA.
- **`[SWO_V2_COMPANION_BODYCOPY_LEGIBILITY]`** (P3) — close Gap 3. Raise body-copy floor 8px → 9px in journal + chat + sleeping footer + last-visit hint. Allow a system-stack fallback for >24-char prose runs.
- **`[SWO_V2_COMPANION_AURA_GATE_TUNE]`** (P3) — close Gap 4. Drop very-happy-aura gate to bond ≥ 25 or scale aura intensity continuously with bond.
- **`[SWO_V2_COMPANION_VITALITY_STORYTELLING]`** (P3) — close Gap 5. Soft rim glow on stat bars at <25% / >75%; wiggle on `acuteNeed` label when a need first crosses the alert threshold.

## Provenance

- Audited `app/sanctuary/CompanionView.tsx` at commit `1ea25fd` (post-merge of #285).
- Cross-referenced `app/globals.css` lines 246–293 (`pixel-card`), 567–658 (companion micro-VFX), 2998–3076 (chrome), 3097–3285 (action interactables), 3372–3529 (VFX sprites).
- Cross-referenced `public/sanctuary/ui/{chrome,vfx}/manifest.json` for asset traceability.
- "Before" baseline reconstructed from commits `e4827e4`, `1b6aed2`, `7063499`, `cd9cbc6` (the four landings being audited).
- Screenshots not captured — see follow-up `[SWO_V2_COMPANION_UI_AUDIT_SCREENSHOTS]`.
