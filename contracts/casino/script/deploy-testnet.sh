#!/usr/bin/env bash
# deploy-testnet.sh — opinionated wrapper around `forge script Deploy.s.sol`
# for Monad testnet (chain id 10143).
#
# Reads the deployer key from a flat-JSON wallet file (cast wallet new --json
# output, gitignored) and uses tiny initial values so a single faucet drip
# (~0.5 MON) is enough to deploy + seed the bankroll past `minBet` for at
# least one bet.
#
# Usage:
#   bash script/deploy-testnet.sh                # broadcast deploy
#   bash script/deploy-testnet.sh --dry-run      # simulate without broadcast
#
# Env overrides:
#   CASINO_WALLET_FILE   wallet JSON (default ~/.config/cosmic-casino/testnet-wallet.json)
#   MONAD_TESTNET_RPC    RPC URL (default https://testnet-rpc.monad.xyz)
#   MONAD_TESTNET_EXPLORER  Explorer base URL (default https://testnet.monadscan.com)
#   CASINO_INITIAL_DEPOSIT, CASINO_INITIAL_ALLOWANCE, CASINO_MIN_BET,
#   CASINO_MAX_BET, CASINO_CLIMB_MAX_PAYOUT, CASINO_MAX_DRAWDOWN_24H — see Deploy.s.sol.

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." &> /dev/null && pwd)"
CONTRACTS_DIR="$REPO_ROOT/contracts/casino"
WALLET_FILE="${CASINO_WALLET_FILE:-$HOME/.config/cosmic-casino/testnet-wallet.json}"
RPC_URL="${MONAD_TESTNET_RPC:-https://testnet-rpc.monad.xyz}"
EXPLORER_URL="${MONAD_TESTNET_EXPLORER:-https://testnet.monadscan.com}"

# Tiny defaults sized for a single faucet drip (~0.5 MON).
# minBet 1e15 (=0.001 MON), allowance 1e16 (=0.01 MON), deposit 2e16 (=0.02 MON).
: "${CASINO_INITIAL_DEPOSIT:=20000000000000000}"
: "${CASINO_INITIAL_ALLOWANCE:=10000000000000000}"
: "${CASINO_MIN_BET:=1000000000000000}"
: "${CASINO_MAX_BET:=2000000000000000}"

DRY_RUN="false"
if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN="true"
fi

if [[ ! -f "$WALLET_FILE" ]]; then
    echo "deploy-testnet: wallet file missing: $WALLET_FILE" >&2
    echo "Create one with:" >&2
    echo "  mkdir -p \"$(dirname "$WALLET_FILE")\"" >&2
    echo "  cast wallet new --json > \"$WALLET_FILE\" && chmod 600 \"$WALLET_FILE\"" >&2
    exit 2
fi

# cast wallet new --json may emit a list or a single object.
PRIVATE_KEY=$(python3 -c '
import json, sys
data = json.load(open(sys.argv[1]))
entry = data[0] if isinstance(data, list) else data
print(entry["private_key"])
' "$WALLET_FILE")

ADDRESS=$(python3 -c '
import json, sys
data = json.load(open(sys.argv[1]))
entry = data[0] if isinstance(data, list) else data
print(entry["address"])
' "$WALLET_FILE")

echo "deploy-testnet: deployer = $ADDRESS"
echo "deploy-testnet: rpc      = $RPC_URL"
echo "deploy-testnet: deposit  = $CASINO_INITIAL_DEPOSIT wei"
echo "deploy-testnet: allowance= $CASINO_INITIAL_ALLOWANCE wei"
echo "deploy-testnet: minBet   = $CASINO_MIN_BET wei"
echo "deploy-testnet: maxBet   = $CASINO_MAX_BET wei"

# Sanity-check funding. Use python to avoid 64-bit overflow in bash arithmetic
# (Monad balances of ≥ ~9.2 MON exceed signed-64-bit range and would wrap).
BAL_DEC=$(curl -sS -m 10 -X POST -H "Content-Type: application/json" \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$ADDRESS\",\"latest\"],\"id\":1}" \
    "$RPC_URL" | python3 -c 'import json,sys; print(int(json.load(sys.stdin).get("result","0x0"), 16))')
echo "deploy-testnet: balance  = $BAL_DEC wei"

# Use python comparison so big-integer strings work regardless of bash word size.
INSUFFICIENT=$(python3 -c "print('1' if int('$BAL_DEC') < int('$CASINO_INITIAL_DEPOSIT') else '0')")
if [[ "$INSUFFICIENT" == "1" ]]; then
    echo "deploy-testnet: WARNING — balance ($BAL_DEC) < initial deposit ($CASINO_INITIAL_DEPOSIT)." >&2
    echo "                Fund the wallet at https://faucet.monad.xyz first." >&2
    if [[ "$DRY_RUN" != "true" ]]; then
        echo "                Aborting (use --dry-run to simulate without broadcast)." >&2
        exit 3
    fi
fi

cd "$CONTRACTS_DIR"

FORGE_ARGS=(
    script script/Deploy.s.sol:Deploy
    --rpc-url "$RPC_URL"
)
if [[ "$DRY_RUN" != "true" ]]; then
    FORGE_ARGS+=(--broadcast)
fi

PRIVATE_KEY="$PRIVATE_KEY" \
CASINO_INITIAL_DEPOSIT="$CASINO_INITIAL_DEPOSIT" \
CASINO_INITIAL_ALLOWANCE="$CASINO_INITIAL_ALLOWANCE" \
CASINO_MIN_BET="$CASINO_MIN_BET" \
CASINO_MAX_BET="$CASINO_MAX_BET" \
forge "${FORGE_ARGS[@]}"

if [[ "$DRY_RUN" == "true" ]]; then
    echo "deploy-testnet: dry-run complete. Re-run without --dry-run to broadcast."
    exit 0
fi

DEPLOY_JSON="$CONTRACTS_DIR/deployments/10143.json"
if [[ ! -f "$DEPLOY_JSON" ]]; then
    echo "deploy-testnet: expected $DEPLOY_JSON to exist after broadcast" >&2
    exit 4
fi

BANKROLL=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["bankroll"])' "$DEPLOY_JSON")
FLIP=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["cosmicFlip"])' "$DEPLOY_JSON")
DICE=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["gravityDice"])' "$DEPLOY_JSON")
CLIMB=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["constellationClimb"])' "$DEPLOY_JSON")

echo
echo "deploy-testnet: deploy complete"
echo "  bankroll:           $BANKROLL"
echo "  cosmicFlip:         $FLIP"
echo "  gravityDice:        $DICE"
echo "  constellationClimb: $CLIMB"
echo "  explorer: $EXPLORER_URL/address/$BANKROLL"
echo
echo "Next:"
echo "  - commit contracts/casino/deployments/10143.json"
echo "  - regenerate the address book (see lib/casino/addresses.generated.ts)"
echo "  - update contracts/DEPLOYED.md with the new Monad Testnet entries"
