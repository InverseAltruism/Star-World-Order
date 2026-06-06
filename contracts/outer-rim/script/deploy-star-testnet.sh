#!/usr/bin/env bash
# deploy-star-testnet.sh — deploy the soulbound STAR token to Monad testnet
# (chain 10143) via CREATE3. Reads the deployer key from a flat-JSON wallet file
# (`cast wallet new --json` output, gitignored, outside the repo).
#
# Usage:
#   bash script/deploy-star-testnet.sh --dry-run    # predict address, no broadcast
#   bash script/deploy-star-testnet.sh              # broadcast (needs funded key)
#
# Env overrides:
#   STAR_WALLET_FILE   wallet JSON  (default ~/.config/swo-star/testnet-wallet.json)
#   MONAD_TESTNET_RPC  RPC URL      (default https://testnet-rpc.monad.xyz)
#   STAR_ADMIN, STAR_EPOCH_CAP, STAR_EPOCH_DURATION, STAR_TOKEN_SALT — see DeployStar.s.sol
set -euo pipefail

CONTRACTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." &> /dev/null && pwd)"
WALLET_FILE="${STAR_WALLET_FILE:-$HOME/.config/swo-star/testnet-wallet.json}"
RPC_URL="${MONAD_TESTNET_RPC:-https://testnet-rpc.monad.xyz}"

DRY_RUN="false"
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN="true"

if [[ ! -f "$WALLET_FILE" ]]; then
  echo "deploy-star: wallet missing: $WALLET_FILE" >&2
  echo "  mkdir -p \"$(dirname "$WALLET_FILE")\" && cast wallet new --json > \"$WALLET_FILE\" && chmod 600 \"$WALLET_FILE\"" >&2
  exit 2
fi

read_field() { python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); e=d[0] if isinstance(d,list) else d; print(e[sys.argv[2]])' "$WALLET_FILE" "$1"; }
PRIVATE_KEY="$(read_field private_key)"
ADDRESS="$(read_field address)"

echo "deploy-star: deployer = $ADDRESS"
echo "deploy-star: rpc      = $RPC_URL"

BAL_WEI=$(curl -s -X POST -H 'Content-Type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$ADDRESS\",\"latest\"],\"id\":1}" \
  "$RPC_URL" | python3 -c 'import json,sys; print(int(json.load(sys.stdin).get("result","0x0"),16))')
echo "deploy-star: balance  = $BAL_WEI wei"

cd "$CONTRACTS_DIR"

if [[ "$DRY_RUN" == "true" ]]; then
  forge script DeployStar --rpc-url "$RPC_URL" --sender "$ADDRESS" --skip-simulation
  exit 0
fi

if [[ "$BAL_WEI" -eq 0 ]]; then
  echo "deploy-star: deployer has 0 MON — fund $ADDRESS on Monad testnet first." >&2
  exit 3
fi

PRIVATE_KEY="$PRIVATE_KEY" forge script DeployStar \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --skip-simulation
