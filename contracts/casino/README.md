# Cosmic Casino — on-chain contracts

The on-chain layer of the Cosmic Casino sub-brand of Star World Order. Ported
from the (now-archived) BunnyBagz Foundry suite that originally targeted
MegaETH; the contract bodies are unchanged save for the type/library renames
listed below, and the chain target moved to Monad (chain id `143` mainnet /
`10143` testnet).

## Status

| Surface       | Status                                |
|---------------|---------------------------------------|
| Local tests   | ✅ 6/6 passing (`forge test`)         |
| Monad testnet | ✅ Live (2026-05-15, see DEPLOYED.md) |
| Monad mainnet | ⏳ Operator-gated (Phase E)           |

Deployed addresses for chain `10143` are in `deployments/10143.json` and
mirrored into `contracts/DEPLOYED.md` at the repo root.

## Contracts

| New name                | Source rename of           | Role                                        |
|-------------------------|----------------------------|---------------------------------------------|
| `CasinoBankroll`        | `BunnyBagzBankroll`        | Shared liquidity pool, per-game allowance, drawdown circuit-breaker |
| `CosmicFlip`            | `BunnyBagzCoinflip`        | Heads/tails, 1.98× payout, commit-reveal randomness |
| `GravityDice`           | `BunnyBagzDice`            | Roll-under 2..98, `99/(R-1)` multiplier, commit-reveal |
| `ConstellationClimb`    | `BunnyBagzHiLo`            | Multi-step Hi-Lo, compounding multiplier, cashOut anytime |
| `CasinoAllowlist`       | `BunnyBagzAllowlist`       | Soft-launch gate (mainnet only) |
| `CommitRevealRandomness`| `BunnyBagzRandomness`      | Stateless `outcomeHash` / `verifyCommit` library |

The treasury multisig (`BunnyBagzTreasury`) is **not** ported here — the SWO
deployment intends to reuse the SWO governance multisig once mainnet ships.

## Build / test

```bash
cd contracts/casino
forge install  # only on first checkout; see .gitignore note below
forge build
forge test
```

`lib/` is gitignored. On first checkout, restore deps with:

```bash
forge install foundry-rs/forge-std --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge install radeksvarz/createx-forge --no-commit
```

Or copy from a sibling project that already has them.

## Deploy

```bash
# Dry-run against Monad testnet:
bash script/deploy-testnet.sh --dry-run

# Broadcast for real (requires funded wallet at
# ~/.config/cosmic-casino/testnet-wallet.json — see script header):
bash script/deploy-testnet.sh
```

The deploy script uses CREATE3 via the CreateX singleton at
`0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed`, which is already live on Monad
testnet. Same `(deployer, salt)` ⇒ same address on mainnet, so the testnet
addresses are the predicted mainnet addresses for the same deployer.

### Predicting addresses (cast-based dry-run)

`scripts/casino/predict_addresses.sh <chainId>` prints the CREATE3 addresses
that `Deploy.s.sol` will produce on a target chain, without sending any tx.
It calls `computeCreate3Address` on the live CreateX singleton via `cast` and
also sanity-checks that CreateX actually has code on that chain.

```bash
bash scripts/casino/predict_addresses.sh 10143    # Monad testnet
bash scripts/casino/predict_addresses.sh 143      # Monad mainnet
bash scripts/casino/predict_addresses.sh 31337    # local anvil
```

Defaults match the production deployer (`0xb29e…fD7B`) and the salts in
`Deploy.s.sol`. Override via `CASINO_DEPLOYER`, `CASINO_BANKROLL_SALT`,
`CASINO_FLIP_SALT`, `CASINO_DICE_SALT`, `CASINO_CLIMB_SALT`, or per-chain
RPCs (`MONAD_TESTNET_RPC`, `MONAD_MAINNET_RPC`, `ANVIL_RPC`,
`CASINO_RPC_<chainId>`). For chain `10143` the output should match
`contracts/casino/deployments/10143.json` byte-for-byte; the Foundry test
`DeployDeterministic.t.sol::test_predictionsMatchDeployments10143Json` pins
the same invariant so the prediction can never silently drift away from the
deployed address book.

## Heritage

The 8-contract BunnyBagz suite (Foundry, Halmos, Medusa, OpenZeppelin Defender
monitors) was developed against MegaETH and shipped to MegaETH testnet
2026-05-05. MegaETH was deprecated as a target on 2026-05-15
(`memory/evolution/bb_swo_monad_repositioning_2026-05-15.md`) — user base
never materialised. The Solidity is identical because Monad is Cancun-EVM
compatible; only chain config + names changed.

Pinned upstream commit / version: `solc 0.8.24`, OpenZeppelin v5.x,
forge-std + createx-forge as vendored in the BB monorepo as of 2026-05-15.
