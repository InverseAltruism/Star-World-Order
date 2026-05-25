# SWO_CASINO_* P1 "This Week" Triage — 2026-05-18

**Task:** `[SWO_CASINO_P1_RUNNABLE_TRIAGE_2026-05-18]`
**Goal:** give the next agent a *pick list* instead of a wall of 25 lexically-ordered
P1 rows. Classify every open `SWO_CASINO_*` row, name the top-5 PICK in pick-order,
and flag any row whose acceptance bar is prose-only (no concrete artifact path).

## Data-source caveat (read first)

The canonical P1 "This Week" queue is an **orchestration artifact maintained outside
this repository** (the same reason `QUEUE.md` is absent — see
`docs/casino/coverage_2026-05-16.md` and project memory `casino-coverage-verify`).
This agent cannot read that queue directly. The triage below is therefore
**reconstructed from on-disk evidence**, which is authoritative for the only thing
that matters for pick-order — *whether a row's dependencies and acceptance artifacts
actually exist on disk*:

- `git log --all` tag scan → which `SWO_CASINO_*` rows already shipped (closed).
- `contracts/DEPLOYED.md` → the G1–G8 / F8 mainnet gate ledger (deps + status).
- Project memory (`casino-mainnet-seed`, `casino-mainnet-smoke`,
  `casino-geo-blocklist`, `casino-responsible-gaming`, `casino-coverage-verify`).

Where a row tag could not be matched to on-disk evidence it is marked
`(unmatched)` rather than guessed. The classifications below are
**disk-verified**, not queue-verified; if a P1 row exists that has no `SWO_CASINO_*`
commit tag and no artifact on disk, it falls under §4 prose-only flags.

## Classification scheme

| Class | Meaning |
|---|---|
| `ship_today_unblocked` | deps on disk, acceptance bar concrete, < 1 cron slot |
| `ship_today_with_dep_check` | deps look closed (`[x] [UNVERIFIED]`) but need a quick disk check first |
| `blocked_external` | waits on audit pick / multisig migration / mainnet credentials / geo-blocklist policy (counsel) |
| `mainnet_gated` | `SWO_CASINO_MAINNET_*` family — do NOT pick until testnet is end-to-end green AND G5 deploy is broadcast |

## §2 — Open / in-flight P1 rows (the triage)

The mainnet gate chain on disk is **G5 deploy → G6 seed → G7 handover → G8 smoke**,
all `Predicted (pending operator deploy)` in `contracts/DEPLOYED.md`. G5 is gated on
G1–G4 (audit pick, kickoff, fixes, re-review) + F8 (ops sign-off) and needs the
operator broadcast key — unavailable to agents.

| Row tag | Class | Declared deps | Concrete acceptance? | Next-3-days verdict |
|---|---|---|---|---|
| `SWO_CASINO_TEST_GRAVITYDICE_GAP_2026-05-16` | ship_today_unblocked | none (coverage doc + `test/GravityDiceUnit.t.sol` on disk) | **YES** — line ≥90% (currently 89.9%, 8 uncovered lines) per `coverage_2026-05-16.md` | **PICK** |
| `SWO_CASINO_TEST_CASINOBANKROLL_GAP_2026-05-16` | ship_today_unblocked | none (`test/CasinoBankrollUnit.t.sol` + `CasinoBankrollBreaker.t.sol` on disk) | **YES** — line ≥90% (88.2%) & branch ≥80% (75.0%), 13 lines / 7 branches | **PICK** |
| `SWO_CASINO_MAINNET_ADDRESS_PREDICTION` | mainnet_gated | live RPC dry-run | **YES** — `contracts/casino/deployments/143.predicted.json` exists; 4 CREATE3 addrs in `DEPLOYED.md` | **DEFER** (agent-deliverable already on disk; closes when operator broadcasts G5) |
| `SWO_CASINO_MAINNET_DEPLOY` (G5) | mainnet_gated | G1–G4 + F8 ops sign-off | **YES** — `script/deploy-mainnet.sh` (gated, `--yes`) | **DEFER** — needs operator key; not agent-runnable |
| `SWO_CASINO_MAINNET_SEED` (G6) | mainnet_gated | G5 (`deployments/143.json`) | **YES** — `script/seed-mainnet.sh` + `seedMainnetScript.test.ts` | **DEFER** — agent part shipped (PR #365); broadcast operator-only |
| `SWO_CASINO_MAINNET_OWNERSHIP_HANDOVER` (G7) | mainnet_gated | G5, G6 | **YES** — `script/handover-ownership.sh` + handover table in `DEPLOYED.md` | **DEFER** — needs multisig addr (TBD) + operator key |
| `SWO_CASINO_MAINNET_SMOKE` (G8) | mainnet_gated | G5, G6, G7 | **YES** — `script/smoke-mainnet.sh` | **DEFER** — agent part shipped (PR #369); broadcast operator-only |
| `SWO_CASINO_STATUS_FLIP_MAINNET` | mainnet_gated | "testnet end-to-end green" (prose) + G8 | partial — flag shipped (a706060) but green-signal **has no artifact path** (see §4) | **DEFER** — single-flag flip; gated on a prose precondition |
| `SWO_CASINO_GEO_BLOCKLIST` (G3) | blocked_external | counsel sign-off to flip `SWO_CASINO_GEO_MODE=enforce` | **YES** — route layer (`7aaa241`) + WAF (PR #361) + `docs/casino/CASINO_GEO_WAF.md` | **DEFER** — agent work done; enforce-mode flip is counsel/policy-gated |
| `SWO_CASINO_RESPONSIBLE_GAMING_PAGE` (G4) | blocked_external | counsel review of legal copy | **YES** — `app/casino/responsible-gaming/page.tsx` (PR #364) | **DEFER** — page shipped with `Draft — counsel review pending` ribbon; flip off post-signoff |

### §2 closed-this-week note
The two `ship_today_unblocked` GAP rows are the **only** agent-runnable picks with
both deps and a concrete numeric bar on disk. Every other open row is either
`mainnet_gated` (blocked on the operator broadcast key + G5) or `blocked_external`
(blocked on counsel/policy). No open row is `ship_today_with_dep_check` — the rows
that *were* dep-gated have all closed (see §3).

## §3 — Already-shipped `SWO_CASINO_*` tags (excluded from P1 triage)

Disk-verified closed (commit tag present in `git log --all`). Listed for
completeness so the next agent does not re-pick them:

`CI_E2E`, `CI_FORGE_COVERAGE`, `CI_FORGE_TEST`, `CI_FOUNDRY_FMT`, `CI_VITEST`,
`COINFLIP_UI`, `DICE_UI`, `COMPONENT_BET_PANEL`, `COMPONENT_FAIRNESS_PROOF`,
`COMPONENT_RECENT_BETS`, `COMPONENT_TRUST_STRIP`, `COMPONENT_WALLET_SHEET`,
`DEFENDER_MONITORS_PORT`, `INDEXER_PORT`, `KEEPER_DOCTOR`, `LIB_VERIFY`,
`PLAYWRIGHT_CONNECTED`, `UI_CHAIN_GATE`, `VITEST_BET_PANEL`,
`TEST_PORT_ALLOWLIST`, `TEST_PORT_BANKROLL`, `TEST_PORT_COINFLIP`,
`TEST_PORT_DICE`, `TEST_PORT_HILO`, `TEST_PORT_MEDUSA`, `TEST_PORT_RANDOMNESS`,
`FORGE_COVERAGE_VERIFY_2026-05-16` (PR #372).

> Note: `GEO_BLOCKLIST` (G3) and `RESPONSIBLE_GAMING_PAGE` (G4) have shipped their
> *agent-completable* deliverable but remain open at the policy layer, so they are
> tracked in §2 as `blocked_external`, not here.

## §4 — Prose-only acceptance flags (`NO_CONCRETE_ARTIFACT_PATH`, per 9f37466)

A row trips `NO_CONCRETE_ARTIFACT_PATH` when its acceptance is prose with no path to
a file/test/report that defines "done".

- **`SWO_CASINO_STATUS_FLIP_MAINNET` — FLAGGED.** The go-live precondition
  *"do not flip until testnet is end-to-end green"* names **no artifact** that
  defines "green": there is no committed e2e report path, no CI green-badge file,
  and no `143.json` testnet-settle log referenced. The flag commit (a706060) is
  concrete, but the *gate* on it is prose. **Fix:** point the precondition at a
  concrete artifact — e.g. a passing `casino-e2e.yml` run URL or a committed
  `docs/casino/testnet_e2e_green_<date>.md` settle log — before this row is
  eligible to pick.

No other open row is prose-only: the four `MAINNET_*` rows each name a `script/*.sh`
artifact, and the two GAP rows name a `test/*.t.sol` file plus a numeric coverage bar.

## §5 — Top-5 PICK (pick-order, with rationale)

1. **`SWO_CASINO_TEST_CASINOBANKROLL_GAP_2026-05-16`** — *highest impact.*
   `CasinoBankroll` is the weakest contract on **both** axes (line 88.2%, branch
   75.0%) and is the shared dependency under all three games' payouts; raising it
   to bar removes the single biggest blocker to any future "casino coverage green"
   gate (which `STATUS_FLIP_MAINNET` ultimately leans on). Concrete bar, files on
   disk, zero external deps.
2. **`SWO_CASINO_TEST_GRAVITYDICE_GAP_2026-05-16`** — *lowest ambiguity, fastest.*
   One axis only (line 89.9% → ≥90%); "a single additional covered line clears the
   bar" per the coverage doc. Smallest cron slot of any open row.
3. **`SWO_CASINO_STATUS_FLIP_MAINNET` (acceptance hardening only)** — *unblocks the
   most downstream rows* by converting its prose precondition into a concrete
   green-signal artifact path (§4). This does **not** flip the flag (mainnet-gated);
   it makes the whole `MAINNET_*` chain's exit-criterion auditable. Pick the
   *doc/criteria* slice, not the broadcast.
4. **`SWO_CASINO_MAINNET_ADDRESS_PREDICTION`** — *verify-and-close.* Its agent
   deliverable (`143.predicted.json` + the 4 CREATE3 rows in `DEPLOYED.md`) already
   exists; a quick re-run of the dry-run to confirm parity lets the queue close the
   row without waiting on the operator broadcast. Low effort, removes a stale `[ ]`.
5. **`SWO_CASINO_GEO_BLOCKLIST` (G3) — close-out the agent layer** — *documentation
   close.* Route + WAF + runbook all shipped; the only remaining work is a
   counsel-gated `enforce` flip. Re-classify it explicitly as `blocked_external` in
   the queue so it stops being lexically re-picked by agents who can't move it.

**Do NOT pick (next 3 days):** `MAINNET_DEPLOY` (G5), `MAINNET_SEED` (G6),
`MAINNET_OWNERSHIP_HANDOVER` (G7), `MAINNET_SMOKE` (G8) — all require the operator
broadcast key and a real G5 deploy; their agent-completable artifacts are already on
disk. Picking them yields "No output" runs (the documented G6/G8 failure mode).

---

*Generated 2026-05-18 from on-disk evidence (git tag scan + `contracts/DEPLOYED.md`
gate ledger + project memory). Classifications are disk-verified; the canonical P1
queue is an external orchestration artifact this agent cannot read directly.*
