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

## Monad Testnet (chain id 10143)

| Contract | Version | Address | Block | Status |
|---|---|---|---|---|
| Skrumpeys NFT | v1 | _set via `NEXT_PUBLIC_SKRUMPEY_CONTRACT`_ | — | Variable |

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
