# Sanctuary Engagement Plan

> Mechanics to turn the companion from a stat-bumper into something players come back to.
>
> **Status:** Active — agent work package.
> **Date:** 2026-05-18
> **Authors:** Operator (InverseAltruism) + Claude (research, synthesis).
> **Supersedes:** Nothing — this is the first design doctrine on top of the V2 implementation.

---

## Why this doc exists

The infrastructure under the Sanctuary companion is solid. Stats, decay, mood, bond stages, chat personality, the expeditions engine, the soulbound STAR ledger (ADR-002), audio + VFX pipelines, ~25 vitest suites — all in place. The problem players are surfacing is on a different layer: every action bumps similar stats, every Skrumpey behaves identically, sleep is a free time-skip, and STAR has nowhere meaningful to flow. There is no reason to come back tomorrow, and no reason to choose Action A over Action B.

This document is the plan to turn that infrastructure into an engagement loop. It pairs a short, reasoned design doctrine (the *why*) with a prioritized set of small PRs (the *what*). The doctrine is grounded in research across Tamagotchi (1996+), Stardew Valley, Neko Atsume, Animal Crossing Pocket Camp, Pokémon GO's buddy system, Genshin's Resin economy, Cookie Clicker ascension, plus the ACM dark-pattern dataset for what *not* to build. Sources are cited at the end.

The doc is intended to be the single permanent reference the agent works from. Individual PRs should cite this file in their descriptions and name the specific doctrine rule they implement.

---

## Where we are right now

Five actions exist — feed, pet, talk, sleep, play — and they produce flat, state-independent stat deltas. Feeding adds 25 hunger regardless of whether the companion is starving or full. Petting and talking and playing all add to happiness in slightly different mixes, but none of them carry any reason to prefer one over another for any given Skrumpey. Sleep restores energy on a wall-clock timer with no opportunity cost. Bond and XP accumulate linearly with every successful interaction.

The Expeditions engine — a real branching-narrative system with deterministic outcomes per (state × choice) and graceful failure paths — exists in pure-data form in `lib/sanctuary/expeditions.ts`. It has no database tables, no API routes, no UI. Not one expedition has ever rendered for a player.

STAR is earned by interactions, has one sink (the cosmetic shop), and is soulbound on-chain. Earning rates comfortably out-pace spending, which means a few weeks of active play and the currency stops mattering.

That, in three paragraphs, is the engagement gap. Everything below is about closing it.

---

## Design doctrine

Six rules. Each is implemented by at least one PR in the plan that follows.

### 1. Actions must differ in outcome, not just in stat label

Three layers stack to produce this, and a single PR introduces all three:

- **Hidden per-Skrumpey preferences** (Stardew Valley's preferred-gift system). Every Skrumpey privately ranks the five actions on a loved → liked → neutral → disliked → hated scale. Loved actions yield 4× the bond gain; hated actions cost bond outright. Profiles are deterministic per `token_id` (same seed → same profile across sessions). Players discover their companion's profile gradually through observation — the journal records one clue per N matched interactions.
- **Need-state multipliers** (Pokémon GO buddy moods, Tamagotchi discipline). The same action with the same stat-delta yields different rewards depending on current need-state. Feeding a hungry companion at 20 hunger is generous; feeding a full one at 90 is wasted. Players learn to *read* their companion before acting.
- **Mood-multipliers on top of need-state**. Only companions who've completed a full daily cycle (including sleep) reach the bonus tier of mood, where STAR/bond rewards are inflated. This is what makes sleep matter.

The composite rule is `effective_bond_gain = base × preference × need_state × mood × diminishing_returns_within_daily_cap`. The daily cap matters: it ensures check-ins reward consistency over time, not binge-grinding.

### 2. Sleep must be a meaningful state, not a free regenerate

Sleep is currently optional. The fix is a `Tired` mood gate that triggers after 24 hours without a sleep cycle, halving all non-sleep action effectiveness until the companion completes a full cycle. Completing a cycle yields a guaranteed-floor dream reward — usually small STAR or a journal entry, occasionally a rare trinket. Waking the companion early to chase a quick interaction costs bond.

The lesson from the original Tamagotchi is that sleep is a recurring chore done correctly or incorrectly, not an off-switch. Energy regeneration is the *reward* for handling sleep correctly, not the reason for doing it.

### 3. Risk is owed to choice, never to RNG

This is the line between fair and rigged. Players can lose STAR, bond, even a trait — but only as the consequence of a choice they explicitly made (taking the reckless branch of an expedition, attempting an action while the companion is in the wrong state). The same companion-state plus the same choice must always produce the same outcome. Randomness lives only on top of aesthetic rewards: cosmetic gacha, dream trinkets, bonus drops on routine actions.

A player who picked the reckless path in an expedition and lost STAR feels ownership of their decision. A player who lost STAR to a 30% black-box random roll feels cheated. The first is engagement; the second is uninstall.

### 4. Variable rewards always have a floor

Skinner-box mechanics are ethically clean only when zero-outcomes are rare or absent. Every action and every gacha pull returns *something* — base reward at the floor, with a small chance of an upgraded outcome on top. This applies uniformly: expedition success branches, gacha, daily check-ins, ambient bonus drops on routine actions.

### 5. Streaks are compassionate

Missing one day pauses the streak; only two consecutive missed days reset it (Pokémon GO's buddy-pause pattern). Punishing a casual player at day 30 for missing one Tuesday destroys six months of retention.

### 6. Identity over power

At bond milestones, the companion reveals something about *itself* — a preferred action made visible in the journal, a personality trait unlocked, a unique chat line — not just a stat boost. Stardew Valley heart events are the canonical example. What players return for in long-running companion games is the relationship, not the multiplier.

---

## The plan

Seven PRs, each sized to land independently in 300–800 lines of code + tests. Each ships with vitest unit/component coverage and at least one Playwright end-to-end test covering both a happy path and a failure/negative path. Ship in order — later items assume earlier ones have landed.

### PR 1 — Preference profiles + need-state multiplier

Adds a deterministic-per-`token_id` preference profile (loved / liked / neutral / disliked / hated across the five actions) and a need-state multiplier on top of the existing stat deltas. Bond gain becomes `base × preference × need-state × diminishing-returns-within-daily-cap`. A journal entry slowly reveals one preference clue per N matched interactions, so players *discover* their companion's personality through play.

This single PR is the largest single conversion of the current flat-stat experience into a discovery game and is the highest leverage item in the plan. Land it first.

### PR 2 — Expeditions: schema + API

Wires the existing pure `lib/sanctuary/expeditions.ts` engine into persistence and HTTP. New tables `sanctuary_expeditions` and `sanctuary_expedition_progress`. Four routes (`list`, `start`, `choose`, `abandon`). Three starter expedition JSONs covering the difficulty spread:

- A short safe expedition (low STAR cost, low payout, all branches lead to success).
- A medium expedition with at least one failure path that costs STAR.
- A hard expedition where the risky branch is high-reward-or-high-loss, deterministic per `(companion_state, choice)`.

Branching is deterministic — no RNG in the decision tree. Outcomes are testable.

### PR 3 — Expedition overlay UI

The player-facing overlay consuming PR 2's API. Mirrors the style of the existing `QuestDialog.tsx`. Resumes mid-expedition on page reload by reading persisted state from the DB rather than React state alone. Hooks into the existing `QuestBoard` so expeditions appear alongside quests in the same hub.

### PR 4 — Sleep dynamics

Implements the `Tired` mood gate (no sleep in 24h → 0.5× bond on all non-sleep actions), the dream reward on full sleep cycle (with a floor: every cycle returns *something*), and the bond cost for waking the companion early. No "lights-off" minigame in v1 — keep the chore implicit, surface a single "💤 Tuck in" affordance.

This is what makes the existing `sleep` action a meaningful choice rather than a free option.

### PR 5 — Compassionate daily streaks

Per-companion streak counter visible in the HUD. Milestones at 7, 14, and 30 days, each yielding escalating STAR + a journal "your bond deepens" entry. Pause-not-reset semantics: one missed calendar day pauses the streak (the visible chip dims); two consecutive misses reset it.

### PR 6 — STAR economy sinks

A cosmetic gacha pull mounted into the existing shop UI (every pull returns *something*; rare cosmetics 1–2%). This, combined with the expedition entry costs from PR 2 and the eventual ascension/prestige loop, gives STAR somewhere to flow so it doesn't inflate into worthlessness.

### PR 7 — Variable rewards on routine actions

A 5–10% chance of bonus STAR on any successful interaction, plus a 0.5–1% chance of a direct rare trinket. Every interaction still returns the base reward — the bonus is purely additive. A visible `+✨` badge animation on bonus draws is what makes ambient check-ins feel rewarding instead of grindy. This is the Neko Atsume "fish drops" pattern: most cats just leave normal fish; once in a while, gold.

---

## Anti-patterns — do not ship without explicit operator approval

These are evidence-based, drawn from the ACM dark-pattern study covering 1,496 games and from documented backlash against specific titles:

- **Notification spam** ("your companion is hungry!"). Pou's canonical mistake; generates uninstalls within weeks.
- **Pay-to-not-lose**. Any path where the companion dies, regresses, or loses progress permanently unless STAR is spent.
- **Streaks that fully reset on a single missed day**. Use the pause-not-reset pattern.
- **Variable rewards with a zero outcome**. Always a floor.
- **Hidden costs or opaque consequences**. Stat decay rates, action outcomes, and mood thresholds should be discoverable through play and ideally surfaced in the journal once observed. Only preference profiles are kept hidden — because *discovering* them is the gameplay.
- **Forced social or share gates**. "Invite a friend to unlock" is the most-uninstalled dark pattern in the ACM dataset.

---

## PR-quality rules

These apply to every PR in this package and to anything else shipped to `dev`.

Before opening a PR, run `git log --oneline origin/dev -50` and `gh pr list --state open` to confirm the work isn't already on `origin/dev` and isn't in flight in another PR. Recent dev history has multiple closed PRs that raced the same files; do not be the next one. If your work overlaps another open PR or has already landed under a different branch name, close your draft and pick a different item from the plan.

Each PR should be 300–800 lines including tests, rebased on the latest `origin/dev` (not merged), and accompanied by both vitest coverage for new logic and at least one Playwright end-to-end test for player-facing flows — one happy path, one failure path. CI must be green before requesting merge: type-check, vitest, eslint, playwright. The PR description must name which doctrine rule (above) the change implements, list its acceptance criteria as a checklist, and include actual local test results (the counts, not "tests passed").

When a feature naturally exceeds 800 lines, split along clean seams. PRs 2 and 3 above are the worked example, where schema + API ship before the UI consumes them. Commit prefix is `feat(sanctuary): …` for new features, `fix(sanctuary): …` for bug fixes, `docs(sanctuary): …` for design docs.

---

## Out of scope

Flag separately to the operator before doing any of these:

- Wallet-to-wallet trading or social mechanics between companions.
- Multiplayer interactions in the V2 / V3 world maps.
- Re-designing the STAR mint flow. ADR-002 is accepted; mint happens lazily, don't redesign.
- Push notifications. This is an anti-pattern (see above) and requires explicit operator approval.

---

## Sources

Tamagotchi care/death cycle: [Thaao P1 guide](https://thaao.net/tama/p1/), [Tamagotchi Wiki: Care](https://tamagotchi.fandom.com/wiki/Care).
Stardew Valley friendship + gift system: [Wiki](https://stardewvalleywiki.com/Friendship), [GameRant guide](https://gamerant.com/stardew-valley-friendship-point-system-guide/).
Neko Atsume engagement analysis: [GameSkinny](https://www.gameskinny.com/culture/the-science-behind-why-neko-atsume-is-so-addictive/), [Mandeville on Medium](https://alexiamandeville.medium.com/game-design-breakdown-the-simplicity-of-neko-atsume-a8616a937a47).
Pokémon GO buddy moods, streaks, raid windows: [Switchblade Buddy Guide](https://www.switchbladegaming.com/pokemon-go/buddy-guide/), [Raid Battle Fandom](https://pokemongo.fandom.com/wiki/Raid_Battle).
Animal Crossing Pocket Camp time-gates: [Fishing Tourney Fandom](https://animalcrossing.fandom.com/wiki/Fishing_Tourney_(Pocket_Camp)).
Genshin Resin economy: [anuflora analysis](https://www.anuflora.com/game/?p=4448).
Cookie Clicker ascension / prestige loops: [Wiki](https://cookieclicker.fandom.com/wiki/Ascension).
Variable-ratio reinforcement schedules: [PSU article](https://www.psu.com/news/the-slot-machine-psyche-how-variable-ratio-reinforcement-drives-modern-gaming-engagement/).
F2P soft currency design: [Game Developer book excerpt](https://www.gamedeveloper.com/design/book-excerpt-game-economy-design-metagame-monetization-and-live-operations).
Dark patterns at scale (1,496 games): [ACM/arXiv 2412.05039](https://arxiv.org/pdf/2412.05039).
