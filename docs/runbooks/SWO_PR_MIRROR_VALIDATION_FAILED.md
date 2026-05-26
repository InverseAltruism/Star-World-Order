# Runbook — "Mirror validation FAILED" (SWO PR pre-submit gate)

**Status:** active · **Owner:** SWO project agent · **Last updated:** 2026-05-26
**Trigger:** evolution-scan / spawn context lists `AVOID: Mirror validation FAILED`
as a recurring failure pattern, or a PR carries a post-spawn gate comment reporting
new `tsc`/`vitest` errors.

This runbook removes the repeat diagnostic cost of "Mirror validation FAILED": each
recurrence otherwise burns a full spawned session re-discovering the same handful of
causes. Read it, match your symptom to a row in the taxonomy, run the detection
command, apply the remediation, re-validate.

---

## What the mirror gate actually is

SWO PRs flow **fork → upstream**: push the work branch to the
`GranusClarvis/Star-World-Order` fork, open the PR against
`InverseAltruism/Star-World-Order` `dev`. Before that PR is created, the SWO agent
runs a **pre-submit mirror validation** against the PROD mirror at
`/opt/star_world_order/PROD`, and a **post-spawn gate** re-runs the same checks and
comments on the PR.

The gate is **baseline-diff**, not absolute:

1. It runs the checks **before** overlaying your changed files onto the mirror →
   records pre-existing errors.
2. It copies your changed files into `/opt/star_world_order/PROD`, runs the checks
   **after** → records the new error set.
3. Only errors present **after but not before** (i.e. **introduced by your diff**)
   cause failure. Pre-existing PROD errors (e.g. modules not yet deployed) are
   excluded from the diff.

Checks run, from the mirror root:

```sh
cd /opt/star_world_order/PROD
tsc --noEmit
vitest run
```

Gate mode is **soft**: on failure the PR is **commented, not closed**. "FAILED"
therefore means *your diff introduced a new `tsc` or `vitest` error that did not exist
in PROD before the overlay* — or the mirror was left dirty by a previous run and the
baseline is corrupted (see Mode E).

> The gate's source is Clarvis Python infrastructure (the post-spawn gate invoked by
> `project_agent.py spawn`), not this repo — do not go looking for it under
> `scripts/` or `monitoring/`. The authoritative behaviour is the "Pre-Submit Mirror
> Validation" contract in the SWO spawn brief, reproduced above.

---

## Symptoms — what you actually see

| Where it surfaces | Exact text (shape) |
|---|---|
| Spawn / evolution-scan context | `AVOID: Mirror validation FAILED` (learned-avoidance pattern) |
| PR comment from post-spawn gate | `## Mirror Validation (PROD)` … `tsc --noEmit: FAIL` and/or `vitest run: FAIL`, `Overall: FAIL`, with the **new** error lines listed |
| Local pre-submit (your own run) | `tsc --noEmit` prints `error TS####` lines that were not in the pre-overlay baseline |

The failure is opaque because the *message* ("FAILED") is decoupled from the *cause*
(one of the modes below). The taxonomy maps message → cause → fix.

---

## Root-cause taxonomy

Run the **Detect** command for each candidate mode against your changed files; apply
**Remediate**; then re-run the verification block at the bottom.

### Mode A — New type/interface not exported (`tsc`, class `missing_type_export`)

A consumer imports a type your diff added, but the type is not re-exported from the
module's barrel (`index.ts`). Compiles in isolation, fails under the full PROD graph.
*Auto-learned failure constraint: failed 2× in this repo.*

- **Detect:** for each new type `T` you reference across modules,
  ```sh
  grep -rn "export .*\b<TypeName>\b" lib/<module>/index.ts
  ```
  Empty result on a cross-module type = this mode.
- **Remediate:** add `export type { <TypeName> } from './<file>';` (or
  `export *`) to the module's `index.ts`. Every new public type/interface must be
  explicitly exported.

### Mode B — Import path case / spelling mismatch (`tsc`, class `missing_import`)

The mirror filesystem is case-sensitive. An import like `./starVault` resolves on a
case-insensitive dev box but fails in PROD when the file is `star-vault.ts`. *This
exact `starVault.ts` vs `star-vault.ts` gap has bitten Outer Rim work; auto-learned
failure constraint: failed 2× in this repo.*

- **Detect:** for each import in your changed files,
  ```sh
  grep -rn "from ['\"]\./" <changed-file> | \
    while read -r l; do echo "$l"; done   # then compare each spec against:
  ls -la lib/<module>/        # exact filename + case
  ```
  Mismatch in case or hyphenation = this mode.
- **Remediate:** make the import string byte-match the on-disk filename. Do **not**
  rename the file unless every importer is updated in the same diff.

### Mode C — Reference to a module absent from the PROD mirror (`tsc`)

Your new file imports a module that exists in your workspace but is **not yet in
PROD** and is **not part of your overlay**. Because the import resolves to nothing in
the mirror, it is a *new* error (the pre-existing-error exclusion does not save you —
the error did not exist before your file was overlaid).

- **Detect:**
  ```sh
  # for each non-relative-or-cross-module import in your diff:
  ls /opt/star_world_order/PROD/<expected/path>   # missing => this mode
  ```
- **Remediate:** include the dependency file(s) in your overlay/PR, or refactor so the
  new file only depends on modules already present in PROD. If the dependency is a
  legitimately undeployed module, this is a sequencing problem — ship the dependency
  PR first.

### Mode D — New/changed test fails under the mirror (`vitest`)

A test your diff adds or touches depends on env vars, network, fixtures, or a DB that
PROD doesn't provide, or asserts on workspace-only state. *Repo pitfall: avoid
unbounded loops / network calls in tests (logged 13×).*

- **Detect:**
  ```sh
  cd /opt/star_world_order/PROD && vitest run <your.test.ts> 2>&1 | tail -40
  ```
  Failure that references `fetch`, a missing env var, timeout, or a missing fixture =
  this mode.
- **Remediate:** mock network/env, gate on `process.env`, or keep the test pure. Tests
  overlaid into PROD must pass with **no external services**.

### Mode E — Mirror left dirty by a previous run (phantom diff)

A prior run copied files into the mirror and did **not** restore them / **not** remove
new directories. The next run's *baseline* now already contains those files, so the
before/after diff is wrong — failures appear unrelated to your actual diff, or your
clean diff is blamed for a predecessor's errors.

- **Detect:**
  ```sh
  cd /opt/star_world_order/PROD && git status --porcelain   # if PROD is a git tree
  # otherwise compare against workspace HEAD for unexpected files:
  diff -rq /opt/star_world_order/PROD <workspace> 2>/dev/null | grep -v node_modules | head
  ```
  Unexpected modified/untracked files you did not touch = this mode.
- **Remediate:** restore the mirror to byte-identical: revert modified files, delete
  any directories created by the prior overlay, then re-run validation. **Always**
  restore the mirror after your own pre-submit run (step 3 of the spawn-brief
  procedure) so you are not the one who corrupts the next baseline.

---

## Verification (after applying a fix)

1. **Local re-validate** against the mirror (the authoritative gate):
   ```sh
   # 1. overlay your changed files into /opt/star_world_order/PROD
   # 2.
   cd /opt/star_world_order/PROD && tsc --noEmit && vitest run
   # 3. restore the mirror byte-identical (revert files, remove new dirs)
   ```
   Both must pass (pre-existing errors excluded). Record the result in the PR body
   under `## Mirror Validation (PROD)`.
2. **Confirm the post-spawn gate is green on the PR.** The gate reports via a PR
   comment (`## Mirror Validation (PROD)` → `Overall: PASS`). For CI status checks
   on the same PR:
   ```sh
   gh -R InverseAltruism/Star-World-Order pr view <N> --json statusCheckRollup
   ```
   The mirror gate itself is a comment, not a required check, because the gate mode is
   **soft** — read the latest gate comment to confirm `Overall: PASS`.

---

## Prevention

- **Run the mirror checks locally before opening every PR** — the three-step overlay /
  `tsc --noEmit && vitest run` / restore procedure. This is already mandated by the
  SWO spawn brief; skipping it is the single largest source of "FAILED".
- **Preflight gap (follow-up, not fixed here):** the spawn brief *describes* the
  procedure but does not *enforce* it before PR creation. A preflight check baked into
  `project_agent.py spawn` for the SWO agent — run the overlay `tsc --noEmit`/`vitest
  run`, block PR creation on a *new* error, and auto-restore the mirror — would turn an
  opaque post-hoc comment into a blocking, self-explaining preflight. This is a Python
  change to Clarvis infra and is **out of scope for this markdown task**; tracked as a
  follow-up below (see PR body `Follow-ups`).
- **Never leave the mirror dirty** (Mode E): the restore step is not optional.
- **Match the two auto-learned constraints up front:** export every new public type
  from its `index.ts` (Mode A), and verify every import path's case/spelling against
  the filesystem (Mode B). These two account for the majority of recurrences.

---

## See also

- `CONTRIBUTING.md` — fork → upstream PR workflow and target branch (`dev`).
- SWO spawn brief, "Pre-Submit Mirror Validation" — the authoritative gate contract.
- Out-of-repo indexes that should also point here (cannot be edited from this repo):
  the Clarvis brain `MEMORY.md` "Fork workflow (2026-03-02)" entry and
  `docs/PROJECT_LANES.md` SWO section. Add a one-line link to this runbook there when
  next editing those files.
