# contracts/archive/

Superseded contract versions kept for provenance and audit history.

**None of these files are compiled or deployed.**
See [../DEPLOYED.md](../DEPLOYED.md) for the canonical version→address map
and [../../scripts/compile-contracts.js](../../scripts/compile-contracts.js)
for the active build list.

## Contents

- `StarForge.sol` — V1, pre-VRF (chain-randomness vulnerable)
- `StarForgeV2.sol` — V2, VRF integration, pre-commit-reveal
- `StarForgeV3.sol` — V3, commit-reveal (see `docs/starforge-archive/`)
- `StarForgeV4.sol` — V4, superseded by V5's provably-fair refactor
- `Testing_casino.sol` — non-production experimental contract

If you need to interact with a deployed archived version, use its address
from [../DEPLOYED.md](../DEPLOYED.md) against the archived ABI; do not
redeploy from this directory.
