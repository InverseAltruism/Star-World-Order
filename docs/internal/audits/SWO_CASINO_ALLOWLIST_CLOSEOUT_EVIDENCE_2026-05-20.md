# SWO_CASINO_ALLOWLIST_CLOSEOUT_EVIDENCE — 2026-05-20

**Task:** `[SWO_CASINO_ALLOWLIST_CLOSEOUT_EVIDENCE_AUDIT_2026-05-20]`
**Resolves the open P0:** `[SWO_CASINO_ALLOWLIST_UI_GATE_CLOSEOUT_REPAIR]`
**Author:** project agent (Clarvis) · **Type:** markdown audit, no code change

---

## 1. Why this audit exists (the truth gap)

The closed row `[SWO_CASINO_ALLOWLIST_UI_GATE]` was marked shipped in
`a55b4be chore(queue): close [SWO_CASINO_ALLOWLIST_UI_GATE] — shipped in PRs #319/#320`,
but the repair row `[SWO_CASINO_ALLOWLIST_UI_GATE_CLOSEOUT_REPAIR]` flagged two
defects in that close:

1. The closed row cited **no real artifact path** under `tests/` or `docs/`.
2. HiLo was described as a **deferred follow-up** that needed splitting out.

A held-evidence note (`e6aad25 chore(queue): record held closeout evidence for
allowlist gate`) captured evidence at hold time but never folded it back into the
row. Both the monitoring log and the queue rows live **outside this repository**
(`monitoring/` contains only `README.md`; no `closeout_evidence_holds.log` exists
in-tree), so this audit reconstructs the evidence from the **merged PRs of record**
(`gh pr view`) and the **live working tree**.

**Both premises of the repair row are now stale:**

- Real test artifacts **do** exist for all three games — they are co-located under
  `__tests__/` (the project convention) rather than a top-level `tests/` dir, plus
  one genuine `tests/e2e/casino/` Playwright spec.
- HiLo is **not deferred** — it shipped in PR **#331** under its own task tag
  `[SWO_CASINO_ALLOWLIST_UI_GATE_HILO]`.

---

## 2. Artifact inventory (verified against working tree @ branch HEAD)

All paths below were confirmed present in the repo (`-f` checks pass) and trace to
the PR cited.

### Shared hook (covers all three games)
| Artifact path | Kind | PR | Status |
|---|---|---|---|
| `lib/casino/useAllowlistGate.ts` | source | #319 | present |
| `lib/casino/__tests__/useAllowlistGate.test.tsx` | **test** (4 gate cases + 5 edge) | #319 | present |

### Coinflip
| Artifact path | Kind | PR | Status |
|---|---|---|---|
| `app/casino/coinflip/CoinflipContent.tsx` | source (gate wiring) | #319/#320 | present |
| `app/casino/coinflip/CoinflipPanel.tsx` | source (disabled CTA) | #320 | present |
| `app/casino/coinflip/__tests__/CoinflipPanel.test.tsx` | **test** (disabled CTA + no-fire) | #320 | present |

### Dice
| Artifact path | Kind | PR | Status |
|---|---|---|---|
| `app/casino/dice/DiceContent.tsx` | source (gate wiring) | #319/#320 | present |
| `app/casino/dice/DicePanel.tsx` | source (disabled CTA) | #320 | present |
| `app/casino/dice/__tests__/DicePanel.test.tsx` | **test** (disabled CTA + no-fire) | #320 | present |

### HiLo (Constellation Climb)
| Artifact path | Kind | PR | Status |
|---|---|---|---|
| `app/casino/constellation-climb/HiLoContent.tsx` | source (gate on 3 lifecycle CTAs) | #331 | present |
| `app/casino/constellation-climb/HiLoPanel.tsx` | source (disabled CTAs) | #331 | present |
| `app/casino/constellation-climb/__tests__/HiLoPanel.test.tsx` | **test** (4 UI states) | #331 | present |
| `app/casino/constellation-climb/page.tsx` | source (route scaffold) | #331 | present |
| `tests/e2e/casino/climb.connected.spec.ts` | **e2e** (denied-allowlist branch, wallet-mocked) | #331 | present |

> Note: `tests/e2e/casino/climb.connected.spec.ts` is the single artifact that lives
> at the literal `tests/` path the repair row asked for. The other tests follow the
> repo's co-located `__tests__/` convention; there is no top-level `tests/casino/`
> unit dir in this project (`tests/` contains only `e2e/`).

---

## 3. Per-game verdict

| Game | Gate wired? | Unit/UI test? | E2E? | PR(s) | Verdict |
|---|---|---|---|---|---|
| **Coinflip** | yes (`CoinflipContent`) | yes (`CoinflipPanel.test.tsx`) + shared hook test | covered by casino e2e suite | #319, #320 | **SHIPPED** |
| **Dice** | yes (`DiceContent`) | yes (`DicePanel.test.tsx`) + shared hook test | covered by casino e2e suite | #319, #320 | **SHIPPED** |
| **HiLo** | yes (`HiLoContent`, 3 lifecycle CTAs) | yes (`HiLoPanel.test.tsx`, 4 UI states) | yes (`climb.connected.spec.ts`) | #331 | **SHIPPED** (not deferred) |

All three casino games enforce the same pre-bet allowlist contract: when
`useAllowlistGate()` returns `blocked`, the CTA renders disabled with
**"Allowlist required"** copy and **no `writeContract` / signing prompt is issued**.

---

## 4. HiLo verdict (explicit)

**HiLo split-out does NOT warrant its own row.** The allowlist gate for HiLo already
shipped in PR **#331** under the dedicated task tag
`[SWO_CASINO_ALLOWLIST_UI_GATE_HILO]`, including the gate wiring, a 4-state Vitest
panel test, and a wallet-mocked Playwright spec. The "deferred HiLo follow-up"
language in the repair row predates #331 and is now obsolete.

The open P1 row `[SWO_CASINO_HILO_UI]` (D10) is a **separate, broader** concern — the
full Hi-Lo game UI. PR #331 deliberately landed only the **minimum** Panel/Content/page
scaffold the gate needs to live on (direction picker, current-card row, three CTAs),
ahead of D10. Therefore:

- The **allowlist** aspect of HiLo is fully closed by #331 — no new row needed.
- `[SWO_CASINO_HILO_UI]` remains correctly open for the full game UI; it is **not**
  blocked by and does **not** block the allowlist closeout.

---

## 5. Proposed textual edit for `[SWO_CASINO_ALLOWLIST_UI_GATE_CLOSEOUT_REPAIR]`

Apply the following to close the repair row. Mechanical paste-in — replace the row
body with this resolved block:

```markdown
[SWO_CASINO_ALLOWLIST_UI_GATE_CLOSEOUT_REPAIR] — RESOLVED 2026-05-20
Status: CLOSED. Reconciled by audit
docs/internal/audits/SWO_CASINO_ALLOWLIST_CLOSEOUT_EVIDENCE_2026-05-20.md.

Both defects in the original close are dispositioned:
- Real artifact paths now cited (co-located __tests__/ per repo convention,
  plus one tests/e2e spec):
    Coinflip: lib/casino/useAllowlistGate.ts,
              lib/casino/__tests__/useAllowlistGate.test.tsx,
              app/casino/coinflip/__tests__/CoinflipPanel.test.tsx        [#319/#320]
    Dice:     app/casino/dice/__tests__/DicePanel.test.tsx                [#319/#320]
    HiLo:     app/casino/constellation-climb/__tests__/HiLoPanel.test.tsx,
              tests/e2e/casino/climb.connected.spec.ts                    [#331]
- HiLo is NOT deferred: shipped in PR #331 under
  [SWO_CASINO_ALLOWLIST_UI_GATE_HILO]. No split-out row required.

Per-game allowlist-gate verdict: Coinflip SHIPPED, Dice SHIPPED, HiLo SHIPPED.
Note: open P1 [SWO_CASINO_HILO_UI] (D10, full Hi-Lo game UI) is unrelated to
this gate closeout and stays open on its own merits.
```

---

## 6. Evidence provenance

- PR bodies/files: `gh pr view 319|320|331 --json files,title,body`
  (repo `InverseAltruism/Star-World-Order`).
- HiLo gate commit: `7fc115c feat(casino): allowlist UI gate for Constellation Climb
  (Hi-Lo) session UI (#331)`.
- Coinflip/Dice gate commits: `489f585` (#319), `75fc115` (#320).
- Working-tree presence: all 12 artifact paths confirmed with `-f` file checks at
  branch HEAD.
- `monitoring/` in-tree holds only `README.md`; the referenced
  `closeout_evidence_holds.log` and the queue rows are external to this repo.
