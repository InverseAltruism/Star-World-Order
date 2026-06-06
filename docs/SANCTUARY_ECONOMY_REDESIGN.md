# Sanctuary Economy Redesign — the spend / earn / lose loop

> **Status:** Active spec. **Date:** 2026-05-24. **Author:** Operator (InverseAltruism) + Claude.
> **Supersedes:** parts of `SANCTUARY_ENGAGEMENT_PLAN.md` — specifically it overrides the
> blanket "no punitive loss" anti-pattern (see Risk doctrine below) and recasts the five
> quick actions from per-Skrumpey stat-bumps into a shared resource economy.

## Why

Even after the engagement mechanics were wired in (preferences, need-state, variable STAR —
commit 35509a5), the loop is still hollow: the quick actions just nudge meters with no sink,
so a player spam-taps to the daily cap and then has nothing to *do*. There is no clear reason
to come back. This redesign gives the meters a purpose by turning them into **resources you
spend** on quests and games for STAR — a real economy with risk.

## The loop

```
   quick actions  ──fill──▶  RESOURCES  (hunger · happiness · energy, shared per wallet)
   (per-action 24h limit          │
    + cooldown, shown)            │ consumed + gated by thresholds
                                   ▼
                  ┌──────────────────────────────────┐
                  │  QUESTS                            │
                  │   • Free/Earn — no wager, costs    │──▶ small guaranteed STAR
                  │     resources + time, safe income  │     (scales with duration)
                  │   • Wager — stake STAR, tiered     │──▶ % win: payout × multiplier
                  │     difficulty, odds shown up front │    % lose: forfeit the wager
                  │  GAMES — cost resources, skill →   │──▶ STAR
                  └──────────────────────────────────┘
                                   │
                                   ▼
                               Shop (cosmetics — looks only)
```

## Resource model (shared per wallet)

- The three meters — **hunger, happiness, energy** — become a single **per-wallet pool**
  (`sanctuary_wallet_resources`), shared across all the wallet's Skrumpeys. No more
  tend-each-Skrumpey-then-swap grind.
- **Per-Skrumpey and unique:** level, XP, bond, traits, preferences, cosmetics, journal.
  These stay on `sanctuary_companions` and are *not* shared.
- **Quick actions** (feed → hunger, pet/talk/play → happiness, rest → energy) refill the
  shared pool. Each action has:
  - a **24h use counter** (e.g. "Feed 3/5 today"), and
  - a **cooldown** between uses (e.g. 30–60s), both **surfaced on the button** with a live
    countdown. This is the "do I need to feed today?" cadence.
- Bond/preference gains (Track 0) still happen per-Skrumpey on the active companion when you
  perform an action — the action does double duty (fills shared resources *and* deepens the
  active bond). Daily counters/cooldowns are per-wallet, per-action.

## Quests (launched from the Companion view)

Tiered. A quest declares: resource cost, resource thresholds (min hunger/happiness/energy to
start), duration (bigger = longer), and a reward spec.

- **Free / Earn quests** — no STAR wager. Cost resources + time, return a **guaranteed**
  (floored) small STAR amount that scales with duration. The reliable income floor so a player
  always has a non-gambling path to STAR.
- **Wager quests** — the player **stakes STAR** up front. Tiered difficulty (e.g. Safe /
  Risky / Reckless) each with **odds shown before committing**:
  - on **win**: stake returned × payout multiplier,
  - on **lose**: stake forfeited (resources + time also spent).
  Deterministic per `(quest, tier, roll)` where the roll is the *only* RNG and it sits on top
  of an explicit player choice (see Risk doctrine).

Quests take real wall-clock time; the Skrumpey is "away" until it resolves (claim on return).

## Games

Skill minigames cost resources to enter and pay STAR by performance. (Existing minigame
scenes are reused; entry gets a resource cost + STAR payout. The "games don't work" bug is to
be fixed as part of this.)

## Risk doctrine (overrides SANCTUARY_ENGAGEMENT_PLAN anti-pattern)

The engagement plan said "variable rewards always have a floor / no punitive loss." This spec
**narrows** that: STAR loss IS allowed, but **only** as the outcome of a wager quest the
player entered **knowing the odds** (shown up front). This preserves doctrine rule 3 — *risk
is owed to a choice, never to a blind RNG*. Free/Earn quests and routine actions keep their
floor. A player never loses STAR they didn't knowingly stake.

## Data model (sketch)

- `sanctuary_wallet_resources(wallet_address PK, hunger, happiness, energy, updated_at)` —
  shared pool, decays over time like the old per-companion stats.
- `sanctuary_action_usage(wallet_address, action, used_count, window_start, last_used_at)` —
  per-action 24h counter + cooldown source of truth.
- Quests build on the existing `sanctuary_expeditions` / `expeditions.ts` engine, extended
  with: `kind` (earn | wager), `resource_cost`, `resource_thresholds`, `duration_s`,
  `star_wager`, `tiers[]` (label, win_chance, payout_mult). Persisted runs already exist.
- STAR flows through the existing soulbound ledger (`earnStar` / `spendStar`); add
  `quest_earn` / `quest_wager` sources + a `quest_loss` spend reason.

## Phased build

1. **Resources foundation** — `sanctuary_wallet_resources` + `sanctuary_action_usage`, lib
   (get/replenish/decay + cooldown/daily-count enforcement), API, and the Companion-view
   quick-action UI with live counters + cooldowns. Quick actions fill the shared pool.
2. **Quests v2 (the sink)** — earn + wager tiers, resource cost/threshold gating, durations,
   STAR stake/payout/loss with odds shown; "send on quest" UI on the Companion view; claim flow.
3. **Games** — resource entry cost + STAR payout; fix the in-world minigame launch.
4. **Polish** — Quest Board declutter (guide the player in), reframe overlays into
   `SanctuaryWindow`, Today panel.

Each phase ships wired end-to-end (lib + API + UI + tests) — no tested-but-unwired modules.
