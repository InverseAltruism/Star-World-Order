# Cosmic Casino — Audit Firm Selection RFC

**Status**: Open — awaiting operator decision
**Task ID**: SWO_CASINO_AUDIT_PICK (G1)
**Blocks**: G2–G9 (audit kick-off, fixes, re-review, mainnet enable, post-launch monitoring)
**Owner**: Operator (`0xb29e…fD7B` deployer / SWO ops)
**Decision deadline**: TBD by operator (the longer this stays open, the longer mainnet stays gated)

This document exists so the operator can pick an audit firm in one sitting
without re-deriving scope, readiness, or vendor knowledge from scratch. It is
**not** a recommendation — the four shortlisted firms all credibly cover the
scope and the right choice depends on price/availability negotiated with each.

---

## 1. Scope to audit

Six Solidity files under `contracts/casino/src/`, ported (mechanical rename
only) from the audited-internally BunnyBagz MegaETH build:

| Contract                  | LoC | Role                                                                 |
|---------------------------|-----|----------------------------------------------------------------------|
| `CasinoBankroll.sol`      | 348 | Shared liquidity pool, per-game allowance, 24h drawdown breaker      |
| `CosmicFlip.sol`          | 293 | Heads/tails, 1.98× payout, commit-reveal                             |
| `GravityDice.sol`         | 292 | Roll-under 2..98, `99/(R-1)` multiplier, commit-reveal               |
| `ConstellationClimb.sol`  | 395 | Multi-step Hi-Lo, compounding, cashOut anytime                       |
| `CasinoAllowlist.sol`     |  88 | Soft-launch gate (mainnet only)                                      |
| `CommitRevealRandomness.sol` | 43 | Stateless `outcomeHash` / `verifyCommit` library                  |
| **Total**                 | **1,459** |                                                                |

Solidity `0.8.24`, EVM target `cancun`, OZ v5.x. Targets Monad chain `143`
(testnet `10143`). Cancun-EVM compatible, no Monad-specific opcodes.

**Out of scope** (already audited or not yet built):
- SWO governance multisig — reused, not part of this audit.
- StarForge / Marketplace / Staking / Raffle — separate audit track (G10+).

---

## 2. Readiness checklist (what auditors get on day one)

| Item                                             | State   | Path                                                                    |
|--------------------------------------------------|---------|-------------------------------------------------------------------------|
| Foundry unit + integration tests                 | ✅ pass | `contracts/casino/test/*.t.sol` (13 files)                              |
| Foundry invariant tests (`CasinoBankrollInvariant`, `CasinoMedusaInvariant`) | ✅ pass | `contracts/casino/test/Casino*Invariant*.t.sol`     |
| Halmos symbolic checks (`CosmicFlipHalmos`)      | ✅ pass | `contracts/casino/test/CosmicFlipHalmos.t.sol`                          |
| Medusa coverage-guided fuzzer                    | ✅ wired (not CI; manual ≥10min runs)  | `contracts/casino/medusa.json`         |
| Determinism pin (predictions match deployments)  | ✅ pass | `DeployDeterministic.t.sol::test_predictionsMatchDeployments10143Json`  |
| Live testnet deployment (chain 10143)            | ✅ live since 2026-05-15 | `contracts/casino/deployments/10143.json`              |
| Flattened sources for explorer fallback          | ✅ committed | `contracts/casino/flattened/*.flat.sol`                            |
| Threat model document                            | ⚠️ partial — distributed across `docs/SMART_CONTRACT_SECURITY.md` and per-contract NatSpec | needs consolidation pre-kickoff |
| Spec / invariants list                           | ⚠️ partial — captured as invariant test names | could be lifted into a one-pager |
| Bug bounty (pre or post audit)                   | ❌ none yet | open question for operator                                          |

**Pre-audit cleanup (recommended, ≤1 day operator work):**
1. Lift invariant statements out of test names into `docs/casino/AUDIT_SCOPE.md`
   spec sheet (1 pager).
2. Consolidate the trust assumptions currently scattered across NatSpec
   (`@dev Phase 0–2: 1/1 owner. Phase 3 migrates owner to 3-of-5 multisig.`) into
   the same doc.
3. Tag the audit commit (`git tag casino-audit-rev1 <sha>`).

---

## 3. Candidates

All four firms have shipped public reports on EVM gambling / payout-pool /
commit-reveal RNG systems that resemble this scope. Numbers are public-knowledge
ranges, **not negotiated quotes** — the operator must request live quotes.

### Spearbit (Cantina)
- **Model**: Distributed marketplace — Cantina assembles a 2–4 reviewer team
  per engagement from its researcher network.
- **Strengths**: Deep DeFi/economics coverage; competitive-style depth.
  Strong track record on payout pools and prize-claim mechanics.
- **Typical window**: 1–3 weeks for ~1.5k LoC, depending on researcher
  availability. Booking lead time is the variable here.
- **Typical cost band** (public): $30k–$80k for ~1.5k LoC, depends on senior mix.
- **Quote URL**: <https://cantina.xyz/welcome> (request via "Get a quote")

### Trail of Bits (ToB)
- **Model**: In-house team, fixed senior staff, slate-based engagement.
- **Strengths**: Tooling depth (Slither, Echidna, Medusa — they wrote Medusa).
  The Medusa harness already in this repo means ToB engineers walk in with
  familiar tooling. Heavy on formal methods and fuzzing.
- **Typical window**: 2–4 weeks; booking lead time usually 6–12 weeks out.
- **Typical cost band** (public): highest of the four; $60k–$150k for ~1.5k LoC.
- **Quote URL**: <https://www.trailofbits.com/contact>

### Cyfrin
- **Model**: In-house + Codehawks competitive layer. Often pairs a private audit
  with a public competitive round.
- **Strengths**: Strong on commit-reveal randomness and gaming/casino primitives
  specifically (multiple public reports in this exact niche). Fastest-moving
  on booking.
- **Typical window**: 1–2 weeks private; +1 week for Codehawks competitive.
- **Typical cost band** (public): $20k–$60k private; competitive layer is
  prize-pool based.
- **Quote URL**: <https://www.cyfrin.io/contact>

### ChainSecurity
- **Model**: In-house, Zurich-based, formal-methods leaning.
- **Strengths**: Rigorous on access-control, upgrade-paths, and economic
  invariants (drawdown breakers fit this). Strong reputation with regulated /
  EU-facing deployments.
- **Typical window**: 2–4 weeks; lead time 4–8 weeks.
- **Typical cost band** (public): $40k–$100k for ~1.5k LoC.
- **Quote URL**: <https://chainsecurity.com/contact-us/>

---

## 4. Decision criteria

Weight per the operator's priorities. Suggested defaults in parentheses.

| Criterion                          | Weight | Notes                                                            |
|------------------------------------|--------|------------------------------------------------------------------|
| Domain fit (casino / commit-reveal)| (25%)  | Cyfrin and Spearbit have the most public reports in-niche.       |
| Tooling overlap (Medusa, Halmos)   | (15%)  | ToB wrote Medusa; Cyfrin uses Halmos heavily.                    |
| Calendar fit vs. mainnet target    | (20%)  | If mainnet is < 6 weeks out, Cyfrin > Spearbit > ToB/ChainSec.   |
| Cost vs. budget                    | (20%)  | Operator-only input.                                             |
| Brand signal to LPs / token-holders| (10%)  | ToB / ChainSec > Cyfrin / Spearbit, on average.                  |
| Re-audit / fix-review terms        | (10%)  | Confirm 1 free fix-review pass is included; ask explicitly.      |

Sum the weighted scores after collecting quotes, pick the highest, book.

---

## 5. Booking checklist (post-pick)

Once a firm is selected, the operator should complete:

1. **Send scope email** with:
   - Repo URL + commit SHA (`casino-audit-rev1` tag).
   - LoC table from §1, readiness checklist from §2.
   - Deadline / mainnet target date.
2. **Receive signed SOW** specifying:
   - Reviewer headcount and seniority.
   - Engagement window (start/end dates).
   - Fix-review terms (1 free pass is standard; confirm in writing).
   - Report delivery format and disclosure window.
3. **Operational hand-off**:
   - Shared comms channel (Telegram / Slack / Discord — match firm preference).
   - On-call review contact on SWO side (operator).
   - Optional: pre-kickoff walkthrough call (30–45 min, recommended).
4. **Calendar window booked** — start date set, blockers (G2) can begin to
   close the moment the SOW is signed.
5. **Update tracker**: mark `SWO_CASINO_AUDIT_PICK` as complete with chosen
   firm + window, unblock G2.

---

## 6. What this RFC does not do

- It does not pick a firm. That requires the operator's quote-gathering and
  budget decision.
- It does not book a calendar window. That requires external contact.
- It does not amend the audit scope — additions (e.g. StarForge) should be
  filed as a separate selection RFC to avoid re-scoping mid-engagement.

---

## 7. Next action (operator)

Send the §5 step-1 email to **all four** firms in parallel. Quote turnaround is
typically 2–5 business days. Use the §4 scoring rubric on the returned quotes,
pick, and proceed to §5 step 2.

The moment the SOW is signed, file `SWO_CASINO_AUDIT_BOOKED` as the G2
unblocker and link this RFC.
