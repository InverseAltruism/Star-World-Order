# Outer Rim — DUST token (Foundry)

The transferable wealth token of the "Cosmic Offshore" overlay (ADR-003 §1.2).
Implements the ADR-002 §"Contract Shape" patterns (ERC-20 + AccessControl,
`MINTER_ROLE` + `BURNER_ROLE`, DAO-revocable via `StarWorldOrderGovernor`)
**without** the soulbound restriction — DUST transfers freely once the
24h anti-snipe window closes.

## Contracts (`src/`)

- **`Dust.sol`** — ERC-20 + AccessControl. Role-gated `mint`/`burn`, on-chain
  per-epoch mint cap, and a 50% anti-snipe sell tax on transfers into a
  registered AMM pair during the first 24h post-deploy (tax → Star Vault sink).
  No team allocation: the constructor mints nothing.
- **`DustVaultSink.sol`** — the Star Vault sink that receives the sell tax.
  DAO-controlled `sweep` into the 24h pro-rata settlement flow.

## Dependencies

Shares `contracts/casino/lib` (OpenZeppelin 5.0.2, forge-std, createx-forge)
via the relative `libs` path in `foundry.toml` — no duplicated `lib/` tree.

## Commands

```sh
forge test                                  # unit + fuzz + stateful invariants
forge coverage --report summary             # ≥90% line coverage on src/
halmos --contract DustSymbolicTest          # symbolic proofs (ADR-003 §1.2 c/d)

# Predict the CREATE3 DUST address (NO broadcast — operator-gated deploy):
forge script DeployDust --rpc-url $MONAD_TESTNET_RPC --sender <deployer>
```

> Coverage tooling does not resolve the relative `../casino/lib` path; run
> `forge coverage` with the remappings rewritten to absolute paths.

The ABI is exported to `lib/outer-rim/abi/dust.json` for the frontend/indexer.
