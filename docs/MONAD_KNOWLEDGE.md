# Monad knowledge layer — Star World Order

> How we deploy, verify, and interact with contracts on Monad. Distilled from the
> live STAR deployment (this repo) + the Star Arena codebase on this host
> (`/opt/apps-granus/Star_Arena/`, which runs extensive Monad + agentic-AI usage).
> **Read this before any on-chain work — deploying without verifying is slop.**

## 1. Chain facts

| | Mainnet | Testnet |
|---|---|---|
| chainId | **143** | **10143** |
| RPC | `https://rpc.monad.xyz` (+ rpc1/2/3) | `https://testnet-rpc.monad.xyz` |
| WS | `wss://ws.monad.xyz` | `wss://testnet-ws.monad.xyz` |
| Explorer | `https://monad.socialscan.io`, monadscan.com | `https://testnet.monadexplorer.com`, `https://testnet.monadscan.com` |
| Faucet | — | `https://faucet.monad.xyz`, quicknode faucet |

- Native token **MON**, 18 decimals. Full EVM equivalence (Cancun). ~400ms blocks, **~800ms finality**, gas ~0.001 gwei.
- **Gas is LEGACY, not EIP-1559** on Monad tooling here — sign with `gasPrice = eth.gas_price`, NOT `maxFeePerGas`/`maxPriorityFeePerGas`. Estimate gas then add a ~20% buffer; for trading paths Star Arena uses `confirmation_blocks: 1`, for indexers a 5-block reorg buffer.
- **eth_getLogs**: cap ranges at ~10,000 blocks; keep a `last_indexed_block` cursor.
- **RPC rate limits**: public endpoints ~15–25 rps. Use a dedicated provider (Alchemy/dRPC/Chainstack) for indexing; keep an RPC failover array.
- **CreateX singleton** is live on both chains at `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` (used for CREATE3 deterministic deploys). Multicall3 at the canonical `0xcA11bde05977b3631167028862bE2a173976CA11`.

## 2. Deploying (Foundry + CreateX/CREATE3)

Foundry, `solc 0.8.24/0.8.26`, `evm_version = "cancun"`, `optimizer_runs = 200`, `bytecode_hash` per project. Monad-aware foundry install: `foundryup` (CreateX present on-chain, no special network flag needed for our flow).

**Deterministic CREATE3 via CreateX** (what STAR uses — see `contracts/outer-rim/script/DeployStar.s.sol`):
- The same `(deployer, salt)` → same address on anvil/testnet/mainnet.
- **GOTCHA (cost us a reverted deploy):** the salt MUST be **deployer-prefixed** so `createx-forge`'s `computeCreate3Address(salt, deployer)` (which guards with `keccak256(deployer, salt)`) matches what `CreateX.deployCreate3` actually produces. A zero/raw-prefixed salt makes CreateX re-hash differently → prediction ≠ actual → `require(deployed == predicted)` reverts. Build the salt as:
  ```solidity
  // top 20 bytes = deployer, byte[20] = 0 (cross-chain deterministic), low bytes = entropy
  bytes32 salt = bytes32((uint256(uint160(deployer)) << 96) | entropy); // entropy < 2^88
  ```
- Deploy: `bash contracts/outer-rim/script/deploy-star-testnet.sh` (reads a gitignored `cast wallet new --json` key file, `--broadcast --skip-simulation`).
- Deployer key lives **outside the repo**, chmod 600 (e.g. `~/.config/swo-star/testnet-wallet.json`). Never commit keys; never print private keys.

## 3. Verifying contracts (do NOT skip this)

Two routes on Monad. **Verification inputs must match the deploy exactly**: `solc 0.8.24`, `optimizer=true`, `runs=200`, `evm_version=cancun`, plus ABI-encoded constructor args.

**Encode constructor args** (example for STAR `constructor(address admin, uint256 mintCapPerEpoch, uint256 epochDuration)`):
```bash
cast abi-encode "constructor(address,uint256,uint256)" \
  0x5e81C0D3511FD2266763448C8a6B7f9CE4a5142D 10000000000000000000000000 86400
```

**Route A — MonadScan (Etherscan-compatible, the canonical Monad explorer). Needs `MONADSCAN_API_KEY` (free from monadscan.com).**
```bash
MONAD_ETHERSCAN_KEY=$MONADSCAN_API_KEY forge verify-contract <ADDRESS> src/Star.sol:Star \
  --chain-id 10143 \
  --verifier etherscan \
  --verifier-url https://testnet-api.monadscan.com/api \
  --constructor-args <ENCODED> --watch
```
(Etherscan v2 unified also works with `chainid=10143` and a v2 key.)

**Route B — Sourcify v2 API (KEYLESS — this is what we use). ✅ proven.** Foundry's
bundled `--verifier sourcify` is **broken** against Sourcify's current API (it wrongly
falls back to etherscan → "Invalid API Key" / "Cannot GET /"). Don't use it. Instead
emit the standard-json and POST it to Sourcify v2 directly:
```bash
# 1. emit std-json (the etherscan placeholder is only to satisfy foundry.toml parsing)
MONAD_ETHERSCAN_KEY=placeholder forge verify-contract <ADDR> src/Star.sol:Star \
  --show-standard-json-input > /tmp/std.json
# 2. POST to Sourcify v2 (compilerVersion from out/<C>.sol/<C>.json → metadata.compiler.version)
curl -s -X POST https://sourcify.dev/server/v2/verify/10143/<ADDR> \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,sys;print(json.dumps({"stdJsonInput":json.load(open("/tmp/std.json")),"compilerVersion":"0.8.24+commit.e11b9ed9","contractIdentifier":"src/Star.sol:Star"}))')"
# → {"verificationId":"..."} (202 async). Poll:
curl -s https://sourcify.dev/server/v2/contract/10143/<ADDR>   # → {"match":"exact_match"}
```
No constructor args needed — Sourcify matches bytecode and detects appended args.

> **Verified (2026-05-25, Sourcify `exact_match`):** STAR `0x27Ed…F8aF`, plus the
> casino suite (CasinoBankroll `0x7bE6…0C34`, CosmicFlip `0x735B…0E56`, GravityDice
> `0x3af4…967A`, ConstellationClimb `0xea45…0F7e`).

Note foundry.toml `[etherscan]` here interpolates `${MONAD_ETHERSCAN_KEY}` — set it to any
placeholder when emitting std-json, or forge errors before producing output.

## 4. Backend ↔ contract (server-side signing)

- **viem** (TS) or **web3.py** (Python). Sign with a server key; **legacy gasPrice**; `gas = estimate × 1.2`; wait for receipt with a timeout; check `status == 1` and `chainId`.
- **Nonce management** for concurrent sends: a thread-safe local nonce counter (lazy-init from chain, `release` on un-submitted tx, `confirm` on submitted, `sync_from_chain` after errors). Star Arena's `NonceManager` (`src/execution/live/monad_dex_connector.py`) is the reference.
- **Receipt RE-verification** (anti-fraud): never trust a client-claimed tx hash — independently fetch the receipt, decode the function input, and match the emitted event against expected args (Star Arena `src/tournament/contract_client.py`).
- **Feature-flag every on-chain path** (`*_ONCHAIN_ENABLED`, strict-mode, address + signer-key + RPC envs) so chain issues never block the app; fall back to the off-chain ledger.

## 5. Agentic-AI-on-chain safety (if/when agents touch chain)

- **LLM is advisory-only — it never holds keys or signs.** It outputs constrained JSON that *nudges* deterministic logic. Human-confirm before any state-changing write.
- **Hot/cold delegated wallets:** a cold owner wallet can withdraw; a hot operator wallet can only call allowlisted functions and **cannot withdraw — enforced on-chain** (Star Arena `DelegatedAccount` / `perplbot`). This is the canonical "let automation act without draining funds" pattern.
- **Prompt-injection defense:** sanitize + truncate any agent/user data before it enters a prompt (Star Arena `src/llm/sanitize.py`).
- **Circuit breaker + kill switch:** max drawdown / loss-per-hour / consecutive-loss triggers with cooldown.

## 6. Security bar for any fund-bearing contract

Before mainnet (Star Arena's standard, portable here): `forge test` (unit + **invariant** `--match-test invariant_`) + `forge coverage` + **Slither** in CI; symbolic/fuzzer campaigns (echidna/medusa/halmos/mythril) for custody/settlement/auth modules; OZ `AccessControl`+`Pausable`+`ReentrancyGuard`+`SafeERC20`; custom errors; bounded loops; strict state machines; external audit + multisig/timelock on admin roles before holding real funds.

## 7. Deployed (testnet 10143)

| Contract | Address | Notes |
|---|---|---|
| STAR (soulbound) | `0x27EdCbA8A50b6872b7b95F49d198A277DEcBfA1D` | OZ ERC20+AccessControl, MINTER/BURNER, per-epoch cap, `_update` soulbound revert. mint ✓ burn ✓ transfer-reverts ✓ on-chain. Deployer/admin `0x5e81C0D3511FD2266763448C8a6B7f9CE4a5142D`. |

See `contracts/DEPLOYED.md` for the canonical table.
