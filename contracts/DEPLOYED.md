# Deployed Contracts

Canonical mapping of SWO contract versions to deployment addresses.
This file is the source of truth for on-chain identity. Update it in the
same PR that deploys a contract.

## Monad Mainnet (chain id 143)

| Contract | Version | Address | Block | Status | Notes |
|---|---|---|---|---|---|
| Skrumpeys NFT | v1 | `0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0` | — | Live | External collection, not deployed by SWO |
| Multicall3 | canonical | `0xcA11bde05977b3631167028862bE2a173976CA11` | — | Live | Canonical cross-chain address |
| StarForge | V5 | _not yet deployed_ | — | Planned | See `contracts/StarForgeV5.sol` |
| StarSkrumpeyMarketplace | v1 | _not yet deployed_ | — | Planned | See `contracts/StarSkrumpeyMarketplace.sol` |
| StarSkrumpeyStaking | v1 | _not yet deployed_ | — | Planned | See `contracts/StarSkrumpeyStaking.sol` |
| StarWorldOrderGovernor | v1 | _not yet deployed_ | — | Planned | See `contracts/StarWorldOrderGovernor.sol` |
| CasinoBankroll | v1 | `0x33C5B6a95e71611F5dC821A74DDAD0F746fF2dFf` | — | Predicted (pending operator deploy) | CREATE3, salt entropy `0xBB01` |
| CosmicFlip | v1 | `0x064b8bfc03b23D2b525deD9d3969090347A21983` | — | Predicted (pending operator deploy) | CREATE3, salt entropy `0xBBC1` |
| GravityDice | v1 | `0xAC023542A8168465EE4A1b3e8Ae0f58F36A6d84B` | — | Predicted (pending operator deploy) | CREATE3, salt entropy `0xBBD1` |
| ConstellationClimb | v1 | `0xd9B9b6c37ad4f3D5b07ae76dE261c5C865600d6e` | — | Predicted (pending operator deploy) | CREATE3, salt entropy `0xBBA1` |

> **Predicted = the address mainnet WILL have if deployer + salts are unchanged.**
> The four casino rows above are CREATE3 predictions, not live deployments. They
> were derived by running
> `forge script Deploy --rpc-url $MONAD_MAINNET_RPC --sender 0xb29e6735629539cEd64F0d6f0c476Fe92539fD7B --skip-simulation`
> against the live Monad mainnet RPC; the script does not broadcast in this
> mode, it only computes the CREATE3 addresses via the CreateX singleton at
> `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed`. Because CREATE3 addresses
> depend only on `(deployer, salt)` and CreateX sits at the same address on
> both Monad chains, these predicted addresses are identical to the live
> testnet (10143) deployment. They will be the real mainnet addresses iff
> the operator broadcasts the same `Deploy.s.sol` with (a) the same
> deployer `0xb29e6735629539cEd64F0d6f0c476Fe92539fD7B` and (b) unchanged
> salt entropy (`CASINO_*_SALT` env vars left at defaults). Changing
> either invalidates this table — re-run the dry-run and update the rows
> before broadcasting.
>
> Full predicted artifact: `contracts/casino/deployments/143.predicted.json`.
>
> **Mainnet broadcast script:** `contracts/casino/script/deploy-mainnet.sh`.
> Gated on G1–G4 (audit pick, kickoff, fixes, re-review) and F8 (ops sign-off);
> the script refuses to broadcast without `--yes` and enforces chain-id 143,
> CreateX presence at `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed`, and parity
> between the live CREATE3 predictions and `143.predicted.json` before sending.
> Run `bash contracts/casino/script/deploy-mainnet.sh --dry-run` to rehearse.
>
> **Mainnet seed script (G6):** `contracts/casino/script/seed-mainnet.sh`.
> Deposits operator-sized native MON into the bankroll post-deploy. Suggested
> sizing is 10–50 MON; the script enforces a `[CASINO_SEED_MIN_WEI,
> CASINO_SEED_MAX_WEI]` band (defaults 0.1–50 MON) to block fat-finger amounts,
> asserts chain-id 143, refuses if `143.json` is missing (G5 not broadcast),
> verifies the bankroll has on-chain code, and gates broadcast behind `--yes`.
> Rehearse with `bash contracts/casino/script/seed-mainnet.sh --dry-run` and
> set `CASINO_SEED_AMOUNT_WEI` to the operator-chosen seed.
>
> Record each executed seed below so the bankroll's funded state is auditable
> alongside its on-chain identity. The script prints these fields on success;
> commit the row in the same tracking PR that follows the broadcast.
>
> **Bankroll seed (G6) — execution log**
>
> | Date | Seed (MON) | Tx | Resulting bankroll balance | Block |
> |---|---|---|---|---|
> | _pending operator broadcast_ | — | — | — | — |
>
> **Ownership handover (G7):** the four casino contracts ship with the deployer
> EOA as `Ownable.owner()`. Phase 3 migrates that owner role to the SWO
> governance multisig via `contracts/casino/script/handover-ownership.sh` (wraps
> `HandoverOwnership.s.sol`). The script enforces chain-id 143, requires
> `CASINO_MULTISIG` to be a contract (codesize > 0, override with
> `CASINO_ALLOW_EOA_MULTISIG=1`), refuses to broadcast without `--yes`, and
> post-broadcast asserts `owner() == CASINO_MULTISIG` and `owner() != deployer`
> on every casino contract. Update the table below from "deployer EOA" to the
> multisig address (with the handover block #) in the same PR that broadcasts.
>
> | Contract | Current owner | Target owner (Phase 3) |
> |---|---|---|
> | CasinoBankroll | deployer EOA (`0xb29e6735629539cEd64F0d6f0c476Fe92539fD7B`) | SWO governance multisig (TBD) |
> | CosmicFlip | deployer EOA | SWO governance multisig (TBD) |
> | GravityDice | deployer EOA | SWO governance multisig (TBD) |
> | ConstellationClimb | deployer EOA | SWO governance multisig (TBD) |

## Monad Testnet (chain id 10143)

| Contract | Version | Address | Block | Status |
|---|---|---|---|---|
| Skrumpeys NFT | v1 | _set via `NEXT_PUBLIC_SKRUMPEY_CONTRACT`_ | — | Variable |
| STAR (soulbound) | v1 | `0x27EdCbA8A50b6872b7b95F49d198A277DEcBfA1D` | — | **Live + Sourcify-verified** (2026-05-25) |
| Casino suite (review deploy) | v1 | see review artifact ↓ | — | **Reviewed + verified** (2026-05-25) |

> **Casino review deployment (separate deployer):** I deployed the casino suite to
> testnet for security review under the review wallet
> `0x5e81C0D3511FD2266763448C8a6B7f9CE4a5142D` (CREATE3; bankroll funded 0.05 MON,
> each game allowance 0.01 MON). These are DISTINCT from the canonical operator
> prediction (`0xb29e…fD7B`, recorded in `deployments/10143.json` / `143.predicted.json`)
> — the operator's mainnet/testnet identity is unchanged. Review-deploy addresses +
> Sourcify `exact_match` verification are in `contracts/casino/SECURITY_REVIEW.md`
> and `deployments/10143.review-0x5e81.json`. Review: no high/critical; 198 tests +
> Slither + live e2e bet.

> **STAR** — soulbound Sanctuary currency (`contracts/outer-rim/src/Star.sol`).
> CREATE3 via CreateX, deployer `0x5e81C0D3511FD2266763448C8a6B7f9CE4a5142D`,
> salt entropy `0x57A201`. Constructor: admin = deployer, mintCapPerEpoch =
> 10,000,000e18, epochDuration = 1 day. On-chain verified: mint ✓, burn ✓,
> transfer reverts `Soulbound()` ✓. Deploy: `contracts/outer-rim/script/deploy-star-testnet.sh`.
> Roles: deployer holds DEFAULT_ADMIN + (for testing) MINTER + BURNER; the
> Sanctuary backend signer should receive MINTER/BURNER for live distribution.

## Environment variable mapping

These env vars are read at runtime and must match the table above:

| Variable | Default source |
|---|---|
| `NEXT_PUBLIC_SKRUMPEY_CONTRACT` | `lib/starSkrumpey.ts` |
| `NEXT_PUBLIC_GOVERNANCE_CONTRACT` | `lib/governance.ts` |
| `NEXT_PUBLIC_STAKING_CONTRACT` | `lib/governance.ts` |
| `NEXT_PUBLIC_MARKETPLACE_CONTRACT` | `lib/marketplace.ts` |
| `NEXT_PUBLIC_STARFORGE_CONTRACT` | (future) StarForgeV5 address |

## Version history

### StarForge

| Version | Source | Status | Reason archived |
|---|---|---|---|
| V1 | `contracts/archive/StarForge.sol` | Archived | Superseded by V2 — no VRF, chain randomness vulnerable |
| V2 | `contracts/archive/StarForgeV2.sol` | Archived | Superseded by V3 — pre-commit-reveal |
| V3 | `contracts/archive/StarForgeV3.sol` | Archived | Superseded by V4 — security fixes rolled forward |
| V4 | `contracts/archive/StarForgeV4.sol` | Archived | Superseded by V5 — provably fair refactor (see `docs/starforge-archive/STARFORGE_V3_FIX_16.md`) |
| V5 | `contracts/StarForgeV5.sol` | **Active** | Production-ready commit-reveal with AccessControl + Pausable |

Only `contracts/StarForgeV5.sol` is compiled (see `scripts/compile-contracts.js`).
The archived versions are kept for provenance, audit history, and on-chain
verification of prior deployments — not for deployment.

### Testing / legacy

| File | Status | Reason archived |
|---|---|---|
| `contracts/archive/Testing_casino.sol` | Archived | Non-production experimental contract |

## Update procedure

When deploying a new contract or version:

1. Deploy to Monad (see `TESTNET.md`, `DEPLOYMENT.md`).
2. Verify on monadscan.
3. Update the relevant row in this file with address + block.
4. Update the env-var table if a new `NEXT_PUBLIC_*` is introduced.
5. If a prior version is superseded, move its source to `contracts/archive/`
   and add a row under "Version history".
