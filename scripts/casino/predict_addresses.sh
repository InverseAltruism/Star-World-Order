#!/usr/bin/env bash
# predict_addresses.sh — cast-based dry-run helper that prints the CREATE3
# addresses the Cosmic Casino `Deploy.s.sol` script will produce for a given
# chain, without sending any tx.
#
# CREATE3 addresses depend only on (deployer, salt) — the chainId picks the
# RPC endpoint and lets the helper sanity-check that CreateX is actually
# present at `0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed` on that chain.
#
# Usage:
#   bash scripts/casino/predict_addresses.sh <chainId>
#
# Examples:
#   bash scripts/casino/predict_addresses.sh 10143    # Monad testnet
#   bash scripts/casino/predict_addresses.sh 143      # Monad mainnet
#   bash scripts/casino/predict_addresses.sh 31337    # local anvil
#
# Env overrides:
#   CASINO_DEPLOYER          deployer addr (default: prod 0xb29e…fD7B)
#   CASINO_BANKROLL_SALT     uint88 entropy (default 0xBB01)
#   CASINO_FLIP_SALT         uint88 entropy (default 0xBBC1)
#   CASINO_DICE_SALT         uint88 entropy (default 0xBBD1)
#   CASINO_CLIMB_SALT        uint88 entropy (default 0xBBA1)
#   CASINO_RPC_<chainId>     RPC URL for the chain (per-chain overrides)
#   MONAD_TESTNET_RPC        Monad testnet RPC (default https://testnet-rpc.monad.xyz)
#   MONAD_MAINNET_RPC        Monad mainnet RPC (default https://rpc.monad.xyz)
#   ANVIL_RPC                local anvil (default http://127.0.0.1:8545)

set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "usage: $0 <chainId>" >&2
    echo "see header comment for env overrides." >&2
    exit 2
fi

CHAIN_ID="$1"
DEPLOYER="${CASINO_DEPLOYER:-0xb29e6735629539cEd64F0d6f0c476Fe92539fD7B}"
BANKROLL_ENTROPY="${CASINO_BANKROLL_SALT:-0xBB01}"
FLIP_ENTROPY="${CASINO_FLIP_SALT:-0xBBC1}"
DICE_ENTROPY="${CASINO_DICE_SALT:-0xBBD1}"
CLIMB_ENTROPY="${CASINO_CLIMB_SALT:-0xBBA1}"

CREATEX="0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed"

# Pick RPC for the requested chain.
case "$CHAIN_ID" in
    10143) DEFAULT_RPC="${MONAD_TESTNET_RPC:-https://testnet-rpc.monad.xyz}" ;;
    143)   DEFAULT_RPC="${MONAD_MAINNET_RPC:-https://rpc.monad.xyz}" ;;
    31337) DEFAULT_RPC="${ANVIL_RPC:-http://127.0.0.1:8545}" ;;
    *)     DEFAULT_RPC="" ;;
esac

# Per-chain override always wins.
PER_CHAIN_VAR="CASINO_RPC_${CHAIN_ID}"
RPC_URL="${!PER_CHAIN_VAR:-$DEFAULT_RPC}"

if [[ -z "$RPC_URL" ]]; then
    echo "predict_addresses: no RPC URL configured for chain $CHAIN_ID." >&2
    echo "Set $PER_CHAIN_VAR=https://... and re-run." >&2
    exit 2
fi

if ! command -v cast >/dev/null 2>&1; then
    echo "predict_addresses: 'cast' (foundry) not on PATH." >&2
    echo "Install: https://book.getfoundry.sh/getting-started/installation" >&2
    exit 2
fi

# Strip 0x and lowercase the deployer for salt packing.
DEPLOYER_LC=$(echo "$DEPLOYER" | tr 'A-Z' 'a-z')
DEPLOYER_HEX="${DEPLOYER_LC#0x}"

# Pack the salt: 20-byte deployer || 0x00 || 11-byte entropy.
# Each entropy literal is 0x???? (2..4 nibbles); left-pad to 22 nibbles.
pack_salt() {
    local entropy_hex="${1#0x}"
    entropy_hex=$(echo "$entropy_hex" | tr 'A-Z' 'a-z')
    # 11 bytes = 22 nibbles. Left-pad with zeros.
    local padded
    padded=$(printf "%022s" "$entropy_hex" | tr ' ' '0')
    echo "0x${DEPLOYER_HEX}00${padded}"
}

BANKROLL_SALT=$(pack_salt "$BANKROLL_ENTROPY")
FLIP_SALT=$(pack_salt "$FLIP_ENTROPY")
DICE_SALT=$(pack_salt "$DICE_ENTROPY")
CLIMB_SALT=$(pack_salt "$CLIMB_ENTROPY")

# Sanity-check CreateX is deployed on the target chain.
CREATEX_CODE_SIZE=$(cast codesize "$CREATEX" --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
if [[ "$CREATEX_CODE_SIZE" == "0" ]]; then
    echo "predict_addresses: CreateX singleton has no code at $CREATEX on chain $CHAIN_ID." >&2
    echo "Either the RPC is wrong, or CreateX has not been deployed to this chain yet." >&2
    exit 1
fi

predict() {
    local salt="$1"
    cast call "$CREATEX" \
        "computeCreate3Address(bytes32,address)(address)" \
        "$salt" "$DEPLOYER" \
        --rpc-url "$RPC_URL"
}

BANKROLL_ADDR=$(predict "$BANKROLL_SALT")
FLIP_ADDR=$(predict "$FLIP_SALT")
DICE_ADDR=$(predict "$DICE_SALT")
CLIMB_ADDR=$(predict "$CLIMB_SALT")

echo "chainId:              $CHAIN_ID"
echo "rpc:                  $RPC_URL"
echo "deployer:             $DEPLOYER"
echo "createx:              $CREATEX (codesize=$CREATEX_CODE_SIZE)"
echo "CasinoBankroll:       $BANKROLL_ADDR   (salt $BANKROLL_SALT)"
echo "CosmicFlip:           $FLIP_ADDR   (salt $FLIP_SALT)"
echo "GravityDice:          $DICE_ADDR   (salt $DICE_SALT)"
echo "ConstellationClimb:   $CLIMB_ADDR   (salt $CLIMB_SALT)"
