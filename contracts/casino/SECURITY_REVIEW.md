# Cosmic Casino — Security Review (testnet)

> Reviewer: Claude (autonomous). Date: 2026-05-25. Scope: the on-chain casino
> suite forked from the BunnyBagz Foundry contracts (commit-reveal coinflip /
> dice / hi-lo + shared bankroll), re-targeted to Monad. **Verdict: no high or
> critical issues found.** Suitable for testnet (now live + verified); mainnet
> needs the operational hardening in §6 (multisig admin, external audit, seed
> entropy) before holding real funds.

## 1. Scope
`CasinoBankroll`, `CosmicFlip`, `GravityDice`, `ConstellationClimb`,
`CasinoAllowlist`, `CommitRevealRandomness` (library). Methodology: full test
suite, Slither static analysis, and a manual read of the security-critical
paths (randomness, reentrancy, fund custody, payout math), plus a live
end-to-end bet on testnet.

## 2. Testing
- **`forge test`: 198/198 pass** — unit + invariant (incl. `invariant_systemNeverInsolvent`, 64 runs × 4096 calls, 0 reverts) + breaker + integration + Halmos symbolic (`CosmicFlipHalmos`) + commit-replay (`CosmicFlipCommitReplay`).
- **Slither 0.11.5**: 0 high, 0 critical, 0 medium. Lows/informational only (triaged in §4).
- **Live e2e (testnet 10143):** funded bankroll → `placeBet` (Pending) → `settleBet` with revealed seed → `Won`, 1.98× payout routed through the bankroll. Confirmed the full commit-reveal lifecycle works on-chain.

## 3. Manual review — security-critical paths
- **Randomness (provably fair).** `outcome = keccak256(serverSeed, clientSeed, nonce) % mod`; `commit = keccak256(serverSeed)` published before the bet. Server can't change the seed post-bet (`verifyCommit` enforced at settle); player can't grind because the seed is hidden until reveal. `commitUsed[serverCommit]` makes every commit **single-use**, killing the reveal-replay attack (the `CosmicFlipCommitReplay` test guards this). Per-player `nonce` de-correlates repeated seed pairs. Operator non-reveal only *griefs* → player reclaims via `refundBet` after `EXPIRY_BLOCKS` (no fund loss).
- **Reentrancy.** Every state-changing path (`placeBet`/`settleBet`/`refundBet`, `payout`/`withdraw`/`settle`, climb `step`/`cashOut`/`refund`) is `nonReentrant` **and** follows checks-effects-interactions: status/allowance is written *before* the external `.call`. `CasinoBankroll.payout` even trips the drawdown breaker predictively before the transfer. The Slither low-level-call flags are these intentional `.call{value}` payouts, all CEI-guarded.
- **Fund custody.** Per-game `allowanceOf` caps each game's exposure; `settle` (inflow) is always open while `payout` (outflow) is gated by `whenNotPaused`/`whenNotHalted`. A 24h rolling **drawdown circuit-breaker** auto-trips on `drop >= maxDrawdown24hWei` and auto-resets after cooldown. The insolvency invariant proves the system never pays out more than it holds.
- **Payout math.** `ConstellationClimb` multiplier uses integer division that truncates **down each step (house-favoring)** — Slither's divide-before-multiply flag is benign here (conservative, never overpays).

## 4. Findings (all LOW / informational — accepted)
| # | Detector | Location | Disposition |
|---|---|---|---|
| L1 | divide-before-multiply | `ConstellationClimb.playStep` | Accepted — rounds down, favors house. |
| L2 | block.timestamp comparisons | `CasinoBankroll` breaker windows | Accepted — used for a 24h cooldown; seconds-level miner skew is immaterial. |
| L3 | strict `== 0` equality | `CasinoBankroll` sentinels | Accepted — intentional "uninitialized" checks. |
| L4 | low-level `.call{value}` | payouts/refunds | Accepted — required for gas-safe native transfers; all CEI + `nonReentrant`. |
| L5 | high cyclomatic complexity | `playStep` (13) | Accepted — readability, not a vuln; covered by unit + invariant tests. |
| L6 | missing-inheritance | `CasinoBankroll`/`CasinoAllowlist` vs their interfaces | Cosmetic — they implement the interface shape; consider `is ICasinoBankroll` for clarity. |

## 5. Deployment + verification (testnet 10143)
Deployed via CREATE3 (deployer `0x5e81C0D3511FD2266763448C8a6B7f9CE4a5142D`), funded 0.05 MON, each game allowance 0.01 MON. **All verified on Sourcify (`exact_match`)** — keyless, no explorer API key.

| Contract | Address |
|---|---|
| CasinoBankroll | `0x7bE6C6f2635F58df8A76F42a3C0cCF52956f0C34` |
| CosmicFlip | `0x735Bd1882722b4910B3eABF00958cd78496f0E56` |
| GravityDice | `0x3af4660AF1119ee05a9e972d2fC76606b1AF967A` |
| ConstellationClimb | `0xea45093Be67cB771D5feB7fd4856A4424cB10F7e` |

Verify command (reproducible, keyless): emit `forge verify-contract … --show-standard-json-input`, then `POST https://sourcify.dev/server/v2/verify/10143/<addr>` with `{stdJsonInput, compilerVersion:"0.8.24+commit.e11b9ed9", contractIdentifier}`. (Foundry's bundled `--verifier sourcify` is incompatible with Sourcify's current API and wrongly falls back to etherscan — use the v2 HTTP API directly.)

## 6. Before mainnet (operational, not code bugs)
1. **Admin → multisig/timelock.** `owner` can `withdraw` the bankroll, `pause`, and set bounds. On testnet that's the deployer EOA; mainnet must use the SWO governance multisig (README already intends this).
2. **External audit** of the fund-bearing bankroll + games (this is an internal review, not a substitute).
3. **Seed entropy.** The off-chain seed manager MUST generate high-entropy 32-byte `serverSeed` (else the `keccak256(serverSeed)` commit is brute-forceable). Operational invariant.
4. **Allowlist** for the soft-launch window (`CasinoAllowlist`, not deployed in this testnet run — set `CASINO_DEPLOY_ALLOWLIST=true`).
5. Consider a fuzzer campaign (Medusa/Echidna — configs exist) on the bankroll + climb before mainnet.
