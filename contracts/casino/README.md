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
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts
forge install radeksvarz/createx-forge
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

## Verification

Source code for the four contracts deployed on Monad testnet (chain `10143`)
is published two ways:

1. **Monadscan (Etherscan-compatible).** When a Monadscan API key is available,
   verify against the live explorer with `forge verify-contract`.
2. **Flattened sources.** Committed under `contracts/casino/flattened/` as a
   permanent fallback (and for any explorer that prefers a single-file
   submission). One `.flat.sol` per deployed contract, produced by
   `forge flatten` against the same `solc 0.8.24` + `optimizer_runs = 200`
   profile used at deploy time. These are the canonical artifacts to upload
   when the Monadscan API is unavailable, rejects the v2 endpoint, or when no
   API key has been provisioned for the deployer.

### Deployed addresses (chain `10143`)

| Contract              | Address                                      |
|-----------------------|----------------------------------------------|
| `CasinoBankroll`      | `0x33C5B6a95e71611F5dC821A74DDAD0F746fF2dFf` |
| `CosmicFlip`          | `0x064b8bfc03b23D2b525deD9d3969090347A21983` |
| `GravityDice`         | `0xAC023542A8168465EE4A1b3e8Ae0f58F36A6d84B` |
| `ConstellationClimb`  | `0xd9B9b6c37ad4f3D5b07ae76dE261c5C865600d6e` |

Authoritative list: `deployments/10143.json`.

### Verifying against Monadscan

The `[etherscan]` block in `foundry.toml` already pins the Monadscan endpoint
for both networks. Run the following from `contracts/casino/` with
`MONAD_ETHERSCAN_KEY` exported. Forge's chain alias uses a hyphen
(`monad-testnet`), not the underscore form (`monad_testnet`) used elsewhere in
the etherscan config table — pass the alias on the CLI exactly as below:

The constructor signatures and the values used at deploy time on chain
`10143` (taken from `script/Deploy.s.sol` + the `CASINO_*` env defaults in
`script/deploy-testnet.sh`) are:

| Contract              | Signature                                                                 | Args (in order)                                                                                                                                  |
|-----------------------|---------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| `CasinoBankroll`      | `constructor(address initialOwner)`                                       | `0xb29e6735629539cEd64F0d6f0c476Fe92539fD7B`                                                                                                     |
| `CosmicFlip`          | `constructor(address initialOwner, address bankroll, uint256 minBet, uint256 maxBet)` | `0xb29e…fD7B`, `0x33C5…2dFf`, `1000000000000000` (1e15 = 0.001), `2000000000000000` (2e15 = 0.002)                                                |
| `GravityDice`         | `constructor(address initialOwner, address bankroll, uint256 minBet, uint256 maxBet)` | `0xb29e…fD7B`, `0x33C5…2dFf`, `1000000000000000`, `2000000000000000`                                                                              |
| `ConstellationClimb`  | `constructor(address initialOwner, address bankroll, uint256 minBet, uint256 maxBet, uint256 maxPayout)` | `0xb29e…fD7B`, `0x33C5…2dFf`, `1000000000000000`, `2000000000000000`, `1000000000000000000` (1e18 = 1 MON, the `Deploy.s.sol` default for `climbMaxPayout`) |

`maxDrawdown24hWei` on `CasinoBankroll` is configured **after** deploy via
`setMaxDrawdown24hWei(1e16)` (see `script/Deploy.s.sol` lines 131–140) — it is
not a constructor arg, so it is **not** part of the verification calldata.

```bash
export MONAD_ETHERSCAN_KEY=<your monadscan api key>
DEPLOYER=0xb29e6735629539cEd64F0d6f0c476Fe92539fD7B
BANKROLL=0x33C5B6a95e71611F5dC821A74DDAD0F746fF2dFf
MINBET=1000000000000000
MAXBET=2000000000000000
CLIMB_MAX_PAYOUT=1000000000000000000

# CasinoBankroll
forge verify-contract \
  --chain monad-testnet \
  --etherscan-api-key "$MONAD_ETHERSCAN_KEY" \
  --watch \
  --constructor-args "$(cast abi-encode 'constructor(address)' "$DEPLOYER")" \
  "$BANKROLL" \
  src/CasinoBankroll.sol:CasinoBankroll

# CosmicFlip
forge verify-contract \
  --chain monad-testnet \
  --etherscan-api-key "$MONAD_ETHERSCAN_KEY" \
  --watch \
  --constructor-args "$(cast abi-encode 'constructor(address,address,uint256,uint256)' \
      "$DEPLOYER" "$BANKROLL" "$MINBET" "$MAXBET")" \
  0x064b8bfc03b23D2b525deD9d3969090347A21983 \
  src/CosmicFlip.sol:CosmicFlip

# GravityDice
forge verify-contract \
  --chain monad-testnet \
  --etherscan-api-key "$MONAD_ETHERSCAN_KEY" \
  --watch \
  --constructor-args "$(cast abi-encode 'constructor(address,address,uint256,uint256)' \
      "$DEPLOYER" "$BANKROLL" "$MINBET" "$MAXBET")" \
  0xAC023542A8168465EE4A1b3e8Ae0f58F36A6d84B \
  src/GravityDice.sol:GravityDice

# ConstellationClimb
forge verify-contract \
  --chain monad-testnet \
  --etherscan-api-key "$MONAD_ETHERSCAN_KEY" \
  --watch \
  --constructor-args "$(cast abi-encode 'constructor(address,address,uint256,uint256,uint256)' \
      "$DEPLOYER" "$BANKROLL" "$MINBET" "$MAXBET" "$CLIMB_MAX_PAYOUT")" \
  0xd9B9b6c37ad4f3D5b07ae76dE261c5C865600d6e \
  src/ConstellationClimb.sol:ConstellationClimb
```

`--watch` blocks until Monadscan returns "Pass — Verified" or rejects the
submission; expected verified URLs:

- https://testnet.monadscan.com/address/0x33C5B6a95e71611F5dC821A74DDAD0F746fF2dFf#code
- https://testnet.monadscan.com/address/0x064b8bfc03b23D2b525deD9d3969090347A21983#code
- https://testnet.monadscan.com/address/0xAC023542A8168465EE4A1b3e8Ae0f58F36A6d84B#code
- https://testnet.monadscan.com/address/0xd9B9b6c37ad4f3D5b07ae76dE261c5C865600d6e#code

If any of the `CASINO_*` env vars were overridden in a particular broadcast
(re-deploys or operator forks), recover the as-deployed constructor calldata
straight from the deploy transaction instead: read the `input` field of the
CREATE3-deployer call (e.g. `cast tx --rpc-url $MONAD_TESTNET_RPC <txhash>`),
strip the contract creation code prefix, and pass the trailing ABI-encoded
tail as `--constructor-args`.

### Flattened sources fallback

Run from `contracts/casino/`:

```bash
mkdir -p flattened
forge flatten src/CasinoBankroll.sol     --output flattened/CasinoBankroll.flat.sol
forge flatten src/CosmicFlip.sol         --output flattened/CosmicFlip.flat.sol
forge flatten src/GravityDice.sol        --output flattened/GravityDice.flat.sol
forge flatten src/ConstellationClimb.sol --output flattened/ConstellationClimb.flat.sol
```

The committed copies under `flattened/` were produced with `forge 1.6.0`
against `solc 0.8.24` (the version pinned in `foundry.toml`). Upload them as
"single file" submissions on the explorer's manual verification UI with the
same compiler version, EVM target `cancun`, optimizer enabled, runs `200`,
and the constructor-args bytes from the verify commands above.

#### Why ship flattened sources now

At the time `10143.json` was deployed, attempting to run the verify commands
above without a provisioned `MONAD_ETHERSCAN_KEY` returns
`Invalid API Key` from the Monadscan endpoint (the testnet explorer's API
gate rejects unauthenticated submissions). The flattened sources let any
third party reproduce and audit the deployed bytecode without depending on
the explorer's API at all — drop the corresponding `.flat.sol` into Remix or
`solc --standard-json` with the pinned compiler settings to reproduce the
on-chain bytecode.

## Heritage

The 8-contract BunnyBagz suite (Foundry, Halmos, Medusa, OpenZeppelin Defender
monitors) was developed against MegaETH and shipped to MegaETH testnet
2026-05-05. MegaETH was deprecated as a target on 2026-05-15
(`memory/evolution/bb_swo_monad_repositioning_2026-05-15.md`) — user base
never materialised. The Solidity is identical because Monad is Cancun-EVM
compatible; only chain config + names changed.

Pinned upstream commit / version: `solc 0.8.24`, OpenZeppelin v5.x,
forge-std + createx-forge as vendored in the BB monorepo as of 2026-05-15.

### Medusa coverage-guided fuzzing (not wired to CI)

The cross-game solvency harness ported from BunnyBagz lives at
`test/CasinoMedusaInvariants.t.sol`, with the matching engine config at
`medusa.json` (target contract: `CasinoMedusaTester`). It exercises the full
game lattice (CosmicFlip + GravityDice + ConstellationClimb) against a single
`CasinoBankroll` and asserts `property_systemNeverInsolvent` — total ETH held
by (bankroll + every game) must always cover every still-pending stake.

Foundry runs the same handler surface via the `CasinoMedusaInvariant` shim
contract (Foundry `invariant_systemNeverInsolvent`), so day-to-day CI keeps a
fast cross-game solvency check. Medusa is **not** wired to CI because
coverage-guided campaigns are long-running (≥10 min for meaningful coverage).

Trigger Medusa locally:

```bash
cd contracts/casino
# Requires medusa (https://github.com/crytic/medusa) on PATH.
medusa fuzz --config medusa.json
```

Expected: campaign runs for at least 10 minutes without finding a violation
on bankroll solvency / payout invariants. If a counter-example is found,
Medusa writes the shrunken call sequence into `medusa-corpus/` and prints
the failing property name (`property_systemNeverInsolvent`).
