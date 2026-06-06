# SWO Pending-Lane Dependency Status Audit — 2026-05-27

**Tag:** `SWO_PENDING_LANE_DEP_STATUS_AUDIT_2026-05-27` · **Project:** SWO · **Priority:** P1
**Composes with:** `QUEUE_DEFERRED_LANE_RECOVERY_2026-05-27`

## Why this exists

The critical lane reported **0/4 eligible** pending rows. That stall is partly a
*visibility* gap: no single artifact stated, per pending row, whether it is
genuinely blocked or just stale-deferred. This audit resolves each pending row's
dependencies against the live SWO repo (`origin/dev`) and renders a verdict with
commit/PR evidence.

**Headline finding:** all four "pending" rows are **stale-deferred, not blocked.**
Every stated dependency is shipped on `origin/dev`, *and* in every case the pending
row's own target tag is itself already merged. None of the four is waiting on
unshipped work.

## Method

- `git -C <repo> log --oneline origin/dev -80` — locate shipping commits.
- `gh -R InverseAltruism/Star-World-Order pr list --state all --limit 50` — map commits → PRs.
- `git log origin/dev --oneline | grep <sha>` — confirm each commit is on `origin/dev`
  (not a fork-only branch).
- Cross-check casino rows against the prior triage
  `docs/internal/audits/SWO_CASINO_P1_TRIAGE_2026-05-18.md` §3 (already-shipped list).

All seven commits cited below were verified present on `origin/dev` via
`git branch -r --contains` / `git log origin/dev`.

## Per-row resolution

### 1. `[SWO_CASINO_PLAYWRIGHT_CONNECTED]` — deps D8 / D9 / D10

| Item | Shipped? | Evidence |
| --- | --- | --- |
| Target tag itself | **YES** | `af6e7b6` (PR #353, synthetic BetSettled/SessionCashedOut logs); earlier `f9933f4` (PR #338, wallet-mock bet-submission), `985e320` (PR #323, wallet-mocked coinflip+dice e2e) |
| Deps D8/D9/D10 (queue infra codes) | **moot** | The D-codes are QUEUE.md infra references (not app-repo tags). The target deliverable is fully merged regardless; prior triage lists `PLAYWRIGHT_CONNECTED` as disk-verified closed (`SWO_CASINO_P1_TRIAGE_2026-05-18.md` §3) |

**Verdict: STALE-DEFERRED (work shipped — close as done).** The connected-Playwright
deliverable landed across PRs #323 → #338 → #353. There is no unshipped dependency.

### 2. `[SWO_CASINO_VITEST_BET_PANEL]` — dep D3

| Item | Shipped? | Evidence |
| --- | --- | --- |
| Target tag itself | **YES** | `3010b22` (BetPanel dwell honours custom `signingDwellMs`); base coverage `d7e127e` (PR #326, 44px touch floor + 12px caption floor + 600ms CTA dwell) |
| Dep D3 (queue infra code) | **moot** | Same as above — D3 is a QUEUE.md reference, not an app-repo tag. Prior triage §3 lists `VITEST_BET_PANEL` as disk-verified closed |

**Verdict: STALE-DEFERRED (work shipped — close as done).**

### 3. `[SWO_V2_SANCTUARY_EXPEDITIONS_UI]` — dep PR2 = `[SWO_V2_SANCTUARY_EXPEDITIONS_DB_API]`

| Item | Shipped? | Evidence |
| --- | --- | --- |
| Dep PR2 (`EXPEDITIONS_DB_API`) | **YES** | `fd703c7` (PR #328, "expeditions DB + API + seed catalog (PR2/7)") |
| Target tag itself | **YES** | `2f5c8bb` (PR #344, QuestBoard → ExpeditionDialog wiring integration test); UI overlay `fd4d278` (PR #329, ExpeditionDialog overlay UI PR3/7) |

**Verdict: RUNNABLE-NOW → in fact STALE-DEFERRED.** PR2 (the DB+API dependency) is
merged via #328, and the UI deliverable itself is merged via #329/#344. No blocker.

### 4. `[SWO_V2_SANCTUARY_VARIABLE_REWARDS]` — deps PR1 (shipped) + PR4

| Item | Shipped? | Evidence |
| --- | --- | --- |
| Dep PR1 (preference profile) | **YES** | `96b586f` (PR #327, "per-Skrumpey preference profile + journal clue (PR1/7)") — matches the row's "PR1 shipped" annotation |
| Dep PR4 (sleep dynamics) | **YES** | `55dc816` (PR #330, "sleep that matters — Tired gate + dream reward + early-wake penalty (PR4/7)") |
| Target tag itself | **YES** | `215c00c` (PR #349, "variable rewards on the 5 actions + HUD bonus badge") |

**Verdict: RUNNABLE-NOW → in fact STALE-DEFERRED.** Both deps (PR1 #327, PR4 #330)
are merged, and the variable-rewards deliverable itself is merged via #349.

## Summary table

| Pending row | Deps | Deps shipped? | Target shipped? | Verdict |
| --- | --- | --- | --- | --- |
| `SWO_CASINO_PLAYWRIGHT_CONNECTED` | D8/D9/D10 | n/a (infra codes) | YES (#323/#338/#353) | STALE-DEFERRED — close as done |
| `SWO_CASINO_VITEST_BET_PANEL` | D3 | n/a (infra code) | YES (#326 + `3010b22`) | STALE-DEFERRED — close as done |
| `SWO_V2_SANCTUARY_EXPEDITIONS_UI` | PR2=`EXPEDITIONS_DB_API` | YES (#328) | YES (#329/#344) | STALE-DEFERRED — close as done |
| `SWO_V2_SANCTUARY_VARIABLE_REWARDS` | PR1 + PR4 | YES (#327, #330) | YES (#349) | STALE-DEFERRED — close as done |

**0 of 4 rows are genuinely blocked.** No blocking tag needs to be named because
no dependency is unshipped.

## De-deferral action (QUEUE.md is external Clarvis infra)

Acceptance (b) calls for clearing the `no_pr_delivery` deferral annotation on
runnable rows in `QUEUE.md`. **`QUEUE.md` does not live in this app repo** — it is
external Clarvis evolution infra (`memory/evolution/QUEUE.md` is not tracked; only
`SWO_TRACKER.md` and the V3 deferred memo are). This matches prior runs
(`SWO_CASINO_P1_TRIAGE_2026-05-18`, the held-closure reconcile `reconcile_held_closures.py`),
which all treat `QUEUE.md` as out-of-repo.

The mechanical edit each row needs (for the scheduler /
`QUEUE_DEFERRED_LANE_RECOVERY_2026-05-27` to apply against the external QUEUE):

```
# For each of the 4 rows below: remove the `no_pr_delivery` deferral annotation
# and re-mark the row as done (target tag is already merged on origin/dev).
SWO_CASINO_PLAYWRIGHT_CONNECTED   → drop no_pr_delivery; mark done (PR #353)
SWO_CASINO_VITEST_BET_PANEL       → drop no_pr_delivery; mark done (PR #326)
SWO_V2_SANCTUARY_EXPEDITIONS_UI   → drop no_pr_delivery; mark done (PR #329/#344)
SWO_V2_SANCTUARY_VARIABLE_REWARDS → drop no_pr_delivery; mark done (PR #349)
```

Because every row's deliverable is already merged, the correct recovery action is
**close-as-done**, not merely "un-defer for re-pick." The recovery row no longer
needs to guess: this audit is the cited evidence layer.

## References

- Repo: `InverseAltruism/Star-World-Order` @ `origin/dev`
- Prior triage: `docs/internal/audits/SWO_CASINO_P1_TRIAGE_2026-05-18.md`
- Tracker: `memory/evolution/SWO_TRACKER.md`
