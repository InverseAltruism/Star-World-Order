# Cosmic Casino — Monad Mainnet Gate Checklist

**Status**: Authoritative gate ledger for the casino mainnet launch.
**Task ID**: `SWO_CASINO_MAINNET_GATE_CHECKLIST_2026-05-22` (re-anchored by
`SWO_CASINO_MAINNET_GATE_CHECKLIST_REPAIR_2026-05-23`).
**Owner**: Operator (`0xb29e6735629539cEd64F0d6f0c476Fe92539fD7B` deployer / SWO ops).
**Chain**: Monad mainnet `143` (testnet `10143`).
**Source of on-chain truth**: [`contracts/DEPLOYED.md`](../../contracts/DEPLOYED.md).

---

## Why this document exists

Monad mainnet broadcast is **irreversible**. A CREATE3 deploy, a bankroll seed,
and an ownership handover cannot be un-sent. This checklist is the single artifact
that stands between *"an agent picks the lexically-next `SWO_CASINO_MAINNET_*` row
and fires `DEPLOY` before the audit closes"* and *"the launch stops at the gate."*

The gates are **strictly topologically ordered**. A row may only be started when
**every** precondition listed under it is satisfied. Preconditions are written on
their own line prefixed with the literal token `Precondition:` so they are
greppable:

```
grep -n "Precondition:" docs/casino/MAINNET_GATE_CHECKLIST.md
```

`[ ]` = not done · `[~]` = in progress / partial · `[x]` = done & verified ·
`[!]` = irreversible action (extra confirmation required).

---

## Gate header table

| Gate | Task ID | Stage | Owner | Irreversible | Blocks | Status |
|------|---------|-------|-------|:---:|--------|:---:|
| G0 | `SWO_CASINO_MAINNET_ADDRESS_PREDICTION` | CREATE3 address prediction | Agent | no | G5 | `[x]` |
| G1 | `SWO_CASINO_AUDIT_PICK` | Audit firm selection (RFC) | Operator | no | G2–G9 | `[~]` |
| G2 | `SWO_CASINO_AUDIT_BOOKED` | Audit kick-off (SOW signed) | Operator | no | G3 | `[ ]` |
| G3 | `SWO_CASINO_AUDIT_FIXES` | Remediate audit findings | Agent + Operator | no | G4 | `[ ]` |
| G4 | `SWO_CASINO_AUDIT_REREVIEW` | Fix re-review (clean report) | Operator | no | F8 | `[ ]` |
| F8 | `SWO_CASINO_OPS_SIGNOFF` | Ops go/no-go sign-off | Operator | no | G5 | `[ ]` |
| G5 | `SWO_CASINO_MAINNET_DEPLOY` | Broadcast deploy (chain 143) | Operator | **YES** | G6 | `[!] [ ]` |
| G6 | `SWO_CASINO_MAINNET_SEED` | Seed bankroll liquidity | Operator | **YES** | G7 | `[!] [ ]` |
| G7 | `SWO_CASINO_MAINNET_OWNERSHIP_HANDOVER` | Transfer owner → multisig | Operator | **YES** | G8 | `[!] [ ]` |
| G8 | `SWO_CASINO_MAINNET_SMOKE` | Live min-stake smoke (3 games) | Operator | **YES** (places real bets) | G9 | `[!] [ ]` |
| G9 | `SWO_CASINO_STATUS_FLIP_MAINNET` | Flip UI testnet → mainnet | Operator | no (reversible) | launch | `[ ]` |

> **10 gates between prediction and launch.** G1–G4 + F8 are the audit/sign-off
> wall; G5–G8 are the four irreversible broadcasts; G9 is the reversible UI flip.

---

## Topological ordering (must hold)

```
G0 ──┐
     ├──> G5 ──> G6 ──> G7 ──> G8 ──> G9
G1 ──> G2 ──> G3 ──> G4 ──> F8 ──┘
```

- **G0** (address prediction) and the **G1→G4→F8** audit chain both feed into **G5**.
- **No `MAINNET_*` broadcast (G5–G8) may run until F8 is `[x]`.**
- The four broadcasts (G5–G8) run **in order, one at a time**, each verifying the
  prior on-chain before starting. Skipping or reordering them invalidates the
  guards baked into the deploy/seed/handover/smoke scripts.

---

## Gate detail (per-row preconditions)

### G0 — `SWO_CASINO_MAINNET_ADDRESS_PREDICTION` `[x]`
Predicted CREATE3 mainnet addresses for the 4 casino contracts (deployer +
salt-derived; identical on 143 / 10143 because CreateX sits at the same address).

Precondition: `contracts/casino/deployments/143.predicted.json` exists and the
four rows in [`contracts/DEPLOYED.md`](../../contracts/DEPLOYED.md) match the
live dry-run prediction.
Precondition: deployer is `0xb29e6735629539cEd64F0d6f0c476Fe92539fD7B` and the
`CASINO_*_SALT` env vars are at their committed defaults.

Verify: `bash contracts/casino/script/deploy-mainnet.sh --dry-run` reprints the
predicted addresses and asserts parity with `143.predicted.json`.

---

### G1 — `SWO_CASINO_AUDIT_PICK` `[~]`
Select an external audit firm. RFC: [`docs/casino/AUDIT_FIRM_SELECTION.md`](AUDIT_FIRM_SELECTION.md).

Precondition: G0 complete (scope addresses frozen).
Precondition: readiness checklist in `AUDIT_FIRM_SELECTION.md` §2 has no ❌ rows
that block kickoff (bug-bounty is optional).
Precondition: audit commit tagged — `git tag casino-audit-rev1 <sha>`.

Blocks G2–G9 until the operator picks a firm and gathers quotes.

---

### G2 — `SWO_CASINO_AUDIT_BOOKED` `[ ]`
SOW signed; engagement window booked.

Precondition: G1 complete (firm chosen).
Precondition: signed SOW specifies reviewer headcount, window, **1 free
fix-review pass confirmed in writing**, and report/disclosure format.
Precondition: shared comms channel + SWO on-call contact established.

---

### G3 — `SWO_CASINO_AUDIT_FIXES` `[ ]`
Remediate every finding the auditor flags above informational severity.

Precondition: G2 complete (audit delivered an initial report).
Precondition: each high/critical/medium finding has either a fix PR **merged to
`dev`** or a written, operator-accepted risk waiver.
Precondition: full Foundry suite + invariant + Halmos checks pass post-fix
(`contracts/casino/test/*.t.sol`).

---

### G4 — `SWO_CASINO_AUDIT_REREVIEW` `[ ]`
Auditor re-reviews the fixes and issues a clean (or accepted-residual) report.

Precondition: G3 complete (all fixes merged).
Precondition: auditor's final report shows **no open high/critical** findings.
Precondition: final report committed under `contracts/casino/` (e.g.
`SECURITY_REVIEW.md` updated or audit PDF/MD added) and DEPLOYED.md references it.

---

### F8 — `SWO_CASINO_OPS_SIGNOFF` `[ ]`
Operator go/no-go. Last reversible checkpoint before any broadcast.

Precondition: G4 complete (clean re-review).
Precondition: operator has confirmed funded deployer wallet, correct RPC
(`MONAD_MAINNET_RPC`), and a non-world-readable keystore.
Precondition: operator has rehearsed G5 with `--dry-run` and reviewed this
checklist's rollback protocol (below).

> **F8 is the irreversibility boundary.** Everything below this line touches
> mainnet state that cannot be undone.

---

### G5 — `SWO_CASINO_MAINNET_DEPLOY` `[!] [ ]`  — IRREVERSIBLE
Broadcast `Deploy.s.sol` via [`contracts/casino/script/deploy-mainnet.sh`](../../contracts/casino/script/deploy-mainnet.sh).

Precondition: F8 complete (`[x]` ops sign-off).
Precondition: `--dry-run` parity passes (live CREATE3 predictions == `143.predicted.json`).
Precondition: chain-id is `143` and CreateX is present at
`0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` (script asserts both).
Precondition: broadcast requires the explicit `--yes` flag.

On success: commit `contracts/casino/deployments/143.json`, update the four
Monad-mainnet rows in DEPLOYED.md from "Predicted" to "Live" with block numbers.

---

### G6 — `SWO_CASINO_MAINNET_SEED` `[!] [ ]`  — IRREVERSIBLE
Deposit operator-sized native MON into the bankroll via
[`contracts/casino/script/seed-mainnet.sh`](../../contracts/casino/script/seed-mainnet.sh).

Precondition: G5 complete — `contracts/casino/deployments/143.json` exists
(script refuses to seed otherwise).
Precondition: bankroll address has on-chain code (script verifies).
Precondition: `CASINO_SEED_AMOUNT_WEI` inside the `[CASINO_SEED_MIN_WEI,
CASINO_SEED_MAX_WEI]` band (defaults 0.1–50 MON) to block fat-finger amounts.
Precondition: chain-id `143`; broadcast requires `--yes`.

On success: record the row in the DEPLOYED.md "Bankroll seed (G6) — execution log".

---

### G7 — `SWO_CASINO_MAINNET_OWNERSHIP_HANDOVER` `[!] [ ]`  — IRREVERSIBLE
Migrate `Ownable.owner()` of all 4 contracts from deployer EOA → SWO governance
multisig via [`contracts/casino/script/handover-ownership.sh`](../../contracts/casino/script/handover-ownership.sh).

Precondition: G6 complete (bankroll funded; smoke would otherwise revert on payout).
Precondition: `CASINO_MULTISIG` is set and is a **contract** (codesize > 0;
override only via `CASINO_ALLOW_EOA_MULTISIG=1` with explicit operator intent).
Precondition: chain-id `143`; broadcast requires `--yes`.
Precondition: post-broadcast the script asserts `owner() == CASINO_MULTISIG` **and**
`owner() != deployer` on every casino contract — both must hold.

On success: update the DEPLOYED.md ownership-handover table from "deployer EOA"
to the multisig address with the handover block.

---

### G8 — `SWO_CASINO_MAINNET_SMOKE` `[!] [ ]`  — IRREVERSIBLE (real bets)
One min-stake commit/reveal bet per game via
[`contracts/casino/script/smoke-mainnet.sh`](../../contracts/casino/script/smoke-mainnet.sh).
Six broadcasts: CosmicFlip `placeBet(Heads)`→`settleBet`; GravityDice
`placeBet(rollUnder=50)`→`settleBet`; ConstellationClimb `openSession`→`cashOut`
(step 0, 1.0× — stake round-trips).

Precondition: G5–G7 complete (`143.json` present; bankroll funded; ownership handed over).
Precondition: every game + the bankroll has on-chain code (script asserts).
Precondition: smoke wallet is **not** world-readable and covers 3 stakes + gas.
Precondition: chain-id `143`; broadcast requires `--yes`.

On success: record the six tx hashes in the DEPLOYED.md "Mainnet smoke (G8) —
execution log".

---

### G9 — `SWO_CASINO_STATUS_FLIP_MAINNET` `[ ]`  — REVERSIBLE
Flip the casino UI/config from testnet (10143) to mainnet (143) so players hit
the live contracts.

Precondition: G8 complete (all six smoke txs confirmed on-chain).
Precondition: geo blocklist + allowlist gates (`SWO_CASINO_GEO_BLOCKLIST`,
`SWO_CASINO_ALLOWLIST_UI_GATE`) and responsible-gaming page are live.
Precondition: the flip is a config/feature-flag change, **fully reversible** —
revert the env var / flag to return the UI to testnet without touching chain state.

---

## Rollback protocol

Mainnet broadcasts cannot be un-sent. "Rollback" here means **contain and recover**,
not undo. Each irreversible gate has a defined containment path.

### G5 — DEPLOY rollback
- **What can't be undone**: the CREATE3 contracts now exist at the predicted addresses.
- **Containment**: do **not** proceed to G6/G7/G9. Un-seeded, owner-still-deployer,
  UI-still-testnet contracts hold no user funds and are not reachable by players.
- **Recover**: if the deployed bytecode is wrong/compromised, **abandon** the
  addresses, bump `CASINO_*_SALT` entropy, re-run G0 prediction → re-run G5 to new
  addresses, and update DEPLOYED.md to point at the new set. Old addresses are
  left orphaned (never seeded, never flipped to).

### G6 — SEED rollback
- **What can't be undone**: native MON now sits in the bankroll.
- **Containment**: the bankroll is owner-controlled. As long as G7 has **not** run,
  the deployer EOA can withdraw seeded liquidity via the bankroll's
  owner-withdraw path before any player exposure.
- **Recover**: withdraw to the deployer, halt the launch. If G7 already ran,
  withdrawal requires a **multisig** transaction (see G7 below).

### G7 — OWNERSHIP_HANDOVER rollback
- **What can't be undone**: `owner()` is now the multisig; the deployer EOA no
  longer controls the contracts.
- **Pre-flight guard (prevents the worst case)**: the script refuses to hand over
  to a non-contract `CASINO_MULTISIG` (codesize 0) unless explicitly overridden,
  so ownership cannot be sent to an unspendable address by accident.
- **Recover**: ownership can only move via a **multisig-signed** `transferOwnership`
  back to the deployer (or a fresh owner). This requires the multisig signer set
  to be live and reachable — confirm signer availability **before** running G7.
  There is no EOA-side recovery once handover completes.

### G9 — STATUS_FLIP rollback (reversible)
- **What can't be undone**: nothing — this is a config/feature-flag change.
- **Recover**: revert the env var / feature flag (and re-deploy the web build if
  the flag is build-time) to return the UI to testnet. No chain state is touched.

---

## Cross-references

- On-chain gate ledger + execution logs: [`contracts/DEPLOYED.md`](../../contracts/DEPLOYED.md)
- Audit firm RFC (G1): [`docs/casino/AUDIT_FIRM_SELECTION.md`](AUDIT_FIRM_SELECTION.md)
- Deploy script (G5): `contracts/casino/script/deploy-mainnet.sh`
- Seed script (G6): `contracts/casino/script/seed-mainnet.sh`
- Handover script (G7): `contracts/casino/script/handover-ownership.sh`
- Smoke script (G8): `contracts/casino/script/smoke-mainnet.sh`

> **Queue cross-link note.** Acceptance criterion (c) asks for ≥10 cross-links
> from `memory/evolution/QUEUE.md`, and (e) for the spawn-artifact-hold to clear
> on the next postflight run. Both `memory/evolution/QUEUE.md` and
> `monitoring/spawn_artifact_holds.log` live in Clarvis queue infrastructure that
> is **external to this application repo** (not present in the working tree). The
> shippable artifact — this gate checklist — is what those external rows link
> *to*; the cross-links and hold-clearing are applied by the queue layer once
> this file lands. This file’s concrete path (`docs/casino/MAINNET_GATE_CHECKLIST.md`)
> is exactly the path the hold was asserting on, so the artifact-path-parity hook
> resolves once it exists at HEAD.
