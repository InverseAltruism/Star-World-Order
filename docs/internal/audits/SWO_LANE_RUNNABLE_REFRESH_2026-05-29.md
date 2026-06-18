# SWO Lane Runnable Refresh — 2026-05-29

**Tag:** `SWO_LANE_RUNNABLE_REFRESH_2026-05-29` · **Project:** SWO · **Priority:** P1
**Composes with:** `HEARTBEAT_NOTASK_VS_ELIGIBLE_RECONCILE_2026-05-29`
**Supersedes the held re-anchor of:** `[SWO_PENDING_LANE_DEP_STATUS_AUDIT_2026-05-27]` (artifact `SWO_PENDING_LANE_STATUS_2026-05-27.md` did exist — PR #379, `434e6e3` — but it covered the *pending* lane, not the *pick-order* rows #4–#11 enumerated here).

## Why this exists

The scheduler reports a 52% no-task rate. The SWO lane is the only non-Clarvis source of autonomous slots, but its pick-order rows #4–#11 (the queued P1 SWO work after the top 3) sit deferred/invisible because their dependency status is recorded in queue prose, not against ground truth. This audit resolves each pick-order tag against the live SWO repo (`origin/dev`) and renders a per-row verdict with commit/PR evidence, so the scheduler (and the composing `QUEUE_DEFERRED_LANE_RECOVERY_*` / `HEARTBEAT_NOTASK_VS_ELIGIBLE_RECONCILE_*` rows) can apply the mechanical close-as-done sweep against the external `QUEUE.md`.

**Headline finding:** all 8 pick-order rows #4–#11 are **STALE-DEFERRED, not blocked.** Every dependency *and* every target tag is already merged on `origin/dev`. Zero rows are waiting on unshipped work.

## Method

- `git -C <repo> log --oneline origin/dev -120` — locate shipping commits.
- `gh -R InverseAltruism/Star-World-Order pr list --state all --search '<tag>' --limit 20` — map commits → PRs.
- `git branch -r --contains <sha>` / direct `git log origin/dev` grep — confirm each commit landed on `origin/dev` (not fork-only).
- Cross-check against prior triages:
  - `docs/internal/audits/SWO_CASINO_P1_TRIAGE_2026-05-18.md` (already-shipped casino list)
  - `docs/internal/audits/SWO_PENDING_LANE_STATUS_2026-05-27.md` (pending-lane resolution)
  - `docs/internal/audits/SWO_CASINO_ALLOWLIST_CLOSEOUT_EVIDENCE_2026-05-20.md` (3-game allowlist closeout)

## Per-row resolution

### #4 `[SWO_V2_SANCTUARY_EXPEDITIONS_DB_API]` (PR2/7) — deps: none stated

| Item | Shipped? | Evidence |
| --- | --- | --- |
| Target tag itself | **YES** | `fd703c7` → PR **#328** ("expeditions DB + API + seed catalog (PR2/7)", merged 2026-05-20) |
| Upstream dep PR1 (referenced by downstream rows) | **YES** | `96b586f` → PR **#327** (per-Skrumpey preference profile, PR1/7) |

**Verdict: STALE-DEFERRED — close as done.** PR2/7 is merged and was the dep that the 2026-05-27 audit already cited as the unblocker for `EXPEDITIONS_UI`.

### #5 `[SWO_CASINO_ALLOWLIST_UI_GATE]` — deps: none stated (3-game scope)

| Item | Shipped? | Evidence |
| --- | --- | --- |
| Coinflip + Dice allowlist gate | **YES** | `489f585` → PR **#319** (`useAllowlistGate` hook + UI gate for Coinflip/Dice bets) |
| Disable bet CTA when gate blocks | **YES** | `75fc115` → PR **#320** |
| Hi-Lo (Constellation Climb) | **YES** | `7fc115c` → PR **#331** ("allowlist UI gate for Constellation Climb (Hi-Lo) session UI") |
| Closeout audit | **YES** | `7315450` → PR **#374** (`SWO_CASINO_ALLOWLIST_CLOSEOUT_EVIDENCE_AUDIT_2026-05-20`) |

**Verdict: STALE-DEFERRED — close as done.** All three games gated; the 2026-05-20 closeout audit (PR #374) is the canonical evidence layer.

### #6 `[SWO_CASINO_MASCOT_SWAP]` — deps: none stated

| Item | Shipped? | Evidence |
| --- | --- | --- |
| Target tag itself (dealer-art swap) | **YES** | `dd56e37` → PR **#317** ("swap upstream mascot refs for Star Skrumpey dealer art") |
| Regression guard | **YES** | `255bac9` → PR **#318** ("regression guard for Star Skrumpey mascot swap") |

**Verdict: STALE-DEFERRED — close as done.** Feature + regression test both merged.

### #7 `[SWO_CASINO_VITEST_BET_PANEL]` — dep: D3 (queue-infra code)

| Item | Shipped? | Evidence |
| --- | --- | --- |
| Target base coverage | **YES** | `d7e127e` → PR **#326** (BetPanel vitest — 44px touch floor + 12px caption floor + 600ms CTA dwell) |
| Refinement | **YES** | `3010b22` (BetPanel dwell honours custom `signingDwellMs` prop) |
| Dep D3 | **moot** | D3 is a `QUEUE.md` infra code, not a repo tag |

**Verdict: STALE-DEFERRED — close as done.** Matches prior triage §3 (already-shipped) and the 2026-05-27 pending-lane audit.

### #8 `[SWO_CASINO_PLAYWRIGHT_CONNECTED]` — deps: D8/D9/D10 (queue-infra codes)

| Item | Shipped? | Evidence |
| --- | --- | --- |
| Wallet-mocked Coinflip + Dice e2e | **YES** | `985e320` → PR **#323** |
| Wallet-mock bet-submission flow | **YES** | `f9933f4` → PR **#338** |
| Synthetic BetSettled/SessionCashedOut log injection | **YES** | `af6e7b6` → PR **#353** |
| Deps D8/D9/D10 | **moot** | Queue-infra references, not repo tags |

**Verdict: STALE-DEFERRED — close as done.** Three connected-Playwright PRs cover the full deliverable; matches prior triage and the 2026-05-27 audit.

### #9 Expeditions **PR3/7** = `[SWO_V2_SANCTUARY_EXPEDITIONS_UI]`

| Item | Shipped? | Evidence |
| --- | --- | --- |
| Dep PR2 (`EXPEDITIONS_DB_API`) | **YES** | `fd703c7` → PR **#328** (row #4 above) |
| Target tag (ExpeditionDialog overlay UI) | **YES** | `fd4d278` → PR **#329** ("ExpeditionDialog overlay UI (PR3/7)") |
| Integration test follow-up | **YES** | `2f5c8bb` → PR **#344** ("QuestBoard ⇄ ExpeditionDialog integration coverage (PR3/7 follow-up)") |

**Verdict: STALE-DEFERRED — close as done.** UI + integration test both merged.

### #10 Expeditions **PR4/7** = `[SWO_V2_SANCTUARY_SLEEP_THAT_MATTERS]`

| Item | Shipped? | Evidence |
| --- | --- | --- |
| Target tag (Tired gate + dream reward + early-wake penalty) | **YES** | `55dc816` → PR **#330** ("sleep that matters — Tired gate + dream reward + early-wake penalty (PR4/7)") |
| Dep PR1 (preference profile) | **YES** | `96b586f` → PR **#327** |

**Verdict: STALE-DEFERRED — close as done.**

### #11 Expeditions **PR5/7** — slot resolution

The PR5/7 slot was **never labeled as such in a commit message** — the planned PR5 content (variable rewards on the action loop) shipped under a renamed tag, and a sibling streaks deliverable shipped alongside it. Both candidates are on `origin/dev`:

| Candidate | Shipped? | Evidence |
| --- | --- | --- |
| `[SWO_V2_SANCTUARY_VARIABLE_REWARDS]` (most likely PR5 content) | **YES** | `215c00c` → PR **#349** ("variable rewards on the 5 actions + HUD bonus badge") |
| `[SWO_V2_SANCTUARY_STREAKS]` (sibling compassionate-streak counter) | **YES** | `4915e17` → PR **#345** ("compassionate streak counter") |
| Dep PR1 | **YES** | `96b586f` → PR **#327** |
| Dep PR4 | **YES** | `55dc816` → PR **#330** |

**Verdict: STALE-DEFERRED — close as done.** The 2026-05-27 pending-lane audit already confirmed `VARIABLE_REWARDS` shipped via #349 with both PR1 and PR4 deps merged; the PR-numbering scheme was effectively dropped after PR4/7 once the task graph reorganized. There is no unshipped PR5 work.

## Summary table

| # | Pick-order row | Deps shipped on `origin/dev`? | Target shipped on `origin/dev`? | Verdict |
| --- | --- | --- | --- | --- |
| 4 | `SWO_V2_SANCTUARY_EXPEDITIONS_DB_API` | n/a | YES (#328) | STALE-DEFERRED → close as done |
| 5 | `SWO_CASINO_ALLOWLIST_UI_GATE` | n/a | YES (#319/#320/#331; audit #374) | STALE-DEFERRED → close as done |
| 6 | `SWO_CASINO_MASCOT_SWAP` | n/a | YES (#317/#318) | STALE-DEFERRED → close as done |
| 7 | `SWO_CASINO_VITEST_BET_PANEL` | moot (D3 = infra) | YES (#326 + `3010b22`) | STALE-DEFERRED → close as done |
| 8 | `SWO_CASINO_PLAYWRIGHT_CONNECTED` | moot (D8/D9/D10 = infra) | YES (#323/#338/#353) | STALE-DEFERRED → close as done |
| 9 | Expeditions PR3 = `SANCTUARY_EXPEDITIONS_UI` | YES (#328) | YES (#329/#344) | STALE-DEFERRED → close as done |
| 10 | Expeditions PR4 = `SANCTUARY_SLEEP_THAT_MATTERS` | YES (#327) | YES (#330) | STALE-DEFERRED → close as done |
| 11 | Expeditions PR5 slot = `SANCTUARY_VARIABLE_REWARDS` (+ sibling `STREAKS`) | YES (#327, #330) | YES (#349; #345) | STALE-DEFERRED → close as done |

**0 of 8 rows are genuinely blocked. 8 of 8 are work-already-shipped.** No blocker need be named because no dependency or target is unshipped.

## De-deferral action (QUEUE.md is external Clarvis infra)

Acceptance (b) calls for either (i) lifting ≥1 genuinely-runnable row into a live `- [ ]` checkbox in QUEUE.md, or (ii) explicitly proving every row is blocked with the blocker named per row. **Neither of those is the correct action here**, because the ground-truth check above shows every row is *already shipped*. The correct action is **close-as-done**, not requeue or block.

`QUEUE.md` is **not in this app repo** — it is external Clarvis evolution infra (`memory/evolution/QUEUE.md` is not git-tracked here; only `SWO_TRACKER.md` and `swo_sanctuary_v3_deferred_2026-04-26.md` are). This matches the prior `SWO_PENDING_LANE_STATUS_2026-05-27` audit, `SWO_CASINO_P1_RUNNABLE_TRIAGE_2026-05-18`, and the held-closure reconcile script — all of which treat `QUEUE.md` as out-of-repo.

The mechanical edit each row needs (for the composing `QUEUE_DEFERRED_LANE_RECOVERY_*` / `HEARTBEAT_NOTASK_VS_ELIGIBLE_RECONCILE_*` rows to apply against the external QUEUE):

```
# Pick-order rows #4–#11: drop any deferral annotation and mark done.
# All 8 target deliverables are merged on origin/dev — cite the PR # below.
#4  SWO_V2_SANCTUARY_EXPEDITIONS_DB_API  → mark done (PR #328)
#5  SWO_CASINO_ALLOWLIST_UI_GATE         → mark done (PR #319/#320/#331; audit #374)
#6  SWO_CASINO_MASCOT_SWAP               → mark done (PR #317/#318)
#7  SWO_CASINO_VITEST_BET_PANEL          → mark done (PR #326 + 3010b22)
#8  SWO_CASINO_PLAYWRIGHT_CONNECTED      → mark done (PR #323/#338/#353)
#9  SWO_V2_SANCTUARY_EXPEDITIONS_UI      → mark done (PR #329/#344)
#10 SWO_V2_SANCTUARY_SLEEP_THAT_MATTERS  → mark done (PR #330)
#11 SWO_V2_SANCTUARY_VARIABLE_REWARDS    → mark done (PR #349) [PR5/7 slot]
    SWO_V2_SANCTUARY_STREAKS             → mark done (PR #345) [sibling]
```

After this sweep, the SWO lane's #4–#11 slots are *cleared*, not refilled. The 52% no-task rate cannot be solved by un-deferring these rows (they're done); it has to be solved by **enqueuing genuinely new SWO work** into the lane. That is out of scope for this audit but is the natural follow-up: stand up new P1 SWO rows for whatever the next sprint's deliverables are (e.g. the Outer Rim Cosmic Offshore chain whose RFC + ADR-003 already shipped — `SWO_OUTER_RIM_HYBRID_RFC` `56aefb0`, `SWO_OUTER_RIM_ADR_003` `f874588`).

## References

- Repo: `InverseAltruism/Star-World-Order` @ `origin/dev`
- Prior pending-lane audit: `docs/internal/audits/SWO_PENDING_LANE_STATUS_2026-05-27.md`
- Prior casino triage: `docs/internal/audits/SWO_CASINO_P1_TRIAGE_2026-05-18.md`
- Allowlist closeout audit: `docs/internal/audits/SWO_CASINO_ALLOWLIST_CLOSEOUT_EVIDENCE_2026-05-20.md`
- Tracker: `memory/evolution/SWO_TRACKER.md`
