#!/usr/bin/env bash
# deploy-mainnet.sh — mainnet wrapper around `forge script Deploy.s.sol`
# for Monad mainnet (chain id 143).
#
# Mirrors deploy-testnet.sh in shape but adds three mainnet-grade guards:
#   1. Asserts the RPC actually points at chain 143 before broadcasting.
#   2. Asserts CreateX is present at 0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed.
#   3. Asserts the addresses Deploy.s.sol *would* produce match the published
#      predictions in `contracts/casino/deployments/143.predicted.json`. If
#      they don't, the deployer or a *_SALT changed and the published table
#      (contracts/DEPLOYED.md) would lie — abort.
#   4. Refuses to broadcast without `--yes` (or `CASINO_MAINNET_YES=1`) after
#      printing a pre-flight summary the operator has to eyeball.
#
# Usage:
#   bash script/deploy-mainnet.sh --dry-run         # simulate, no broadcast
#   bash script/deploy-mainnet.sh --yes             # broadcast (after guards)
#
# Env overrides:
#   CASINO_WALLET_FILE        wallet JSON (default ~/.config/cosmic-casino/mainnet-wallet.json)
#   MONAD_MAINNET_RPC         RPC URL (default https://rpc.monad.xyz)
#   MONAD_MAINNET_EXPLORER    Explorer base (default https://monadscan.com)
#   CASINO_INITIAL_DEPOSIT, CASINO_INITIAL_ALLOWANCE, CASINO_MIN_BET,
#   CASINO_MAX_BET, CASINO_CLIMB_MAX_PAYOUT, CASINO_MAX_DRAWDOWN_24H — see Deploy.s.sol.
#   CASINO_*_SALT             entropy overrides (leave at defaults to match the
#                             published prediction in 143.predicted.json).
#   CASINO_MAINNET_YES=1      same as --yes (for CI / automation).
#   CASINO_SKIP_PREDICTION_CHECK=1   bypass the predicted-address parity check
#                             (only set if you *intentionally* rotated salts and
#                             have re-derived contracts/casino/deployments/143.predicted.json).

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." &> /dev/null && pwd)"
CONTRACTS_DIR="$REPO_ROOT/contracts/casino"
PREDICTED_JSON="$CONTRACTS_DIR/deployments/143.predicted.json"
WALLET_FILE="${CASINO_WALLET_FILE:-$HOME/.config/cosmic-casino/mainnet-wallet.json}"
RPC_URL="${MONAD_MAINNET_RPC:-https://rpc.monad.xyz}"
EXPLORER_URL="${MONAD_MAINNET_EXPLORER:-https://monadscan.com}"
CREATEX="0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed"
EXPECTED_CHAIN_ID="143"

# Mainnet defaults match Deploy.s.sol's built-in defaults (see NatSpec there).
# Operator can override via env. These are *real money* — pick deliberately.
: "${CASINO_INITIAL_DEPOSIT:=10000000000000000000}"     # 10 MON
: "${CASINO_INITIAL_ALLOWANCE:=10000000000000000000}"   # 10 MON
: "${CASINO_MIN_BET:=1000000000000000}"                 # 0.001 MON
: "${CASINO_MAX_BET:=100000000000000000}"               # 0.1 MON
: "${CASINO_CLIMB_MAX_PAYOUT:=1000000000000000000}"     # 1 MON
# CASINO_MAX_DRAWDOWN_24H falls through to Deploy.s.sol's "deposit/2" if unset.

DRY_RUN="false"
CONFIRMED="${CASINO_MAINNET_YES:-0}"
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN="true" ;;
        --yes|-y)  CONFIRMED="1" ;;
        *)
            echo "deploy-mainnet: unknown arg '$arg' (expected --dry-run or --yes)" >&2
            exit 2
            ;;
    esac
done

if ! command -v forge >/dev/null 2>&1 || ! command -v cast >/dev/null 2>&1; then
    echo "deploy-mainnet: foundry (forge + cast) not on PATH." >&2
    echo "Install: https://book.getfoundry.sh/getting-started/installation" >&2
    exit 2
fi

if [[ ! -f "$WALLET_FILE" ]]; then
    echo "deploy-mainnet: wallet file missing: $WALLET_FILE" >&2
    echo "Create one with:" >&2
    echo "  mkdir -p \"$(dirname "$WALLET_FILE")\"" >&2
    echo "  cast wallet new --json > \"$WALLET_FILE\" && chmod 600 \"$WALLET_FILE\"" >&2
    echo "Then fund the printed address before re-running." >&2
    exit 2
fi

# Refuse to read a world-readable wallet file. Mainnet keys must be 0600 / 0400.
WALLET_MODE=$(stat -c '%a' "$WALLET_FILE" 2>/dev/null || stat -f '%Lp' "$WALLET_FILE" 2>/dev/null || echo "")
if [[ -n "$WALLET_MODE" && "$WALLET_MODE" != "600" && "$WALLET_MODE" != "400" ]]; then
    echo "deploy-mainnet: wallet file $WALLET_FILE has unsafe mode $WALLET_MODE (expected 600 or 400)." >&2
    echo "Fix with: chmod 600 \"$WALLET_FILE\"" >&2
    exit 2
fi

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

# Guard 1: assert RPC points at chain 143.
ACTUAL_CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null || echo "")
if [[ "$ACTUAL_CHAIN_ID" != "$EXPECTED_CHAIN_ID" ]]; then
    echo "deploy-mainnet: RPC chain-id mismatch." >&2
    echo "  expected: $EXPECTED_CHAIN_ID (Monad mainnet)" >&2
    echo "  actual:   '$ACTUAL_CHAIN_ID' from $RPC_URL" >&2
    echo "Set MONAD_MAINNET_RPC to a real mainnet endpoint and re-run." >&2
    exit 3
fi

# Guard 2: assert CreateX singleton is present.
CREATEX_CODE_SIZE=$(cast codesize "$CREATEX" --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
if [[ "$CREATEX_CODE_SIZE" == "0" ]]; then
    echo "deploy-mainnet: CreateX has no code at $CREATEX on chain $EXPECTED_CHAIN_ID." >&2
    echo "Deploy.s.sol cannot CREATE3 without it. Investigate before broadcasting." >&2
    exit 3
fi

# Guard 3: prediction parity — the (deployer, salt) inputs must still produce
# the addresses we already published in DEPLOYED.md / 143.predicted.json.
if [[ "${CASINO_SKIP_PREDICTION_CHECK:-0}" != "1" ]]; then
    if [[ ! -f "$PREDICTED_JSON" ]]; then
        echo "deploy-mainnet: $PREDICTED_JSON missing — cannot verify prediction parity." >&2
        echo "Re-run scripts/casino/predict_addresses.sh 143 to regenerate, or set" >&2
        echo "CASINO_SKIP_PREDICTION_CHECK=1 to override." >&2
        exit 3
    fi

    PUB_DEPLOYER=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["deployer"].lower())' "$PREDICTED_JSON")
    SELF_DEPLOYER=$(echo "$ADDRESS" | tr 'A-Z' 'a-z')
    if [[ "$PUB_DEPLOYER" != "$SELF_DEPLOYER" ]]; then
        echo "deploy-mainnet: deployer mismatch — predicted artifact uses $PUB_DEPLOYER, wallet is $SELF_DEPLOYER." >&2
        echo "Either you're using the wrong wallet, or 143.predicted.json is stale." >&2
        echo "If intentional, regenerate the prediction (predict_addresses.sh 143) and update" >&2
        echo "contracts/DEPLOYED.md *before* broadcasting." >&2
        exit 3
    fi

    # Re-derive the four predicted addresses live via CreateX and diff against
    # the committed JSON. If they drift, abort.
    PREDICT_SH="$REPO_ROOT/scripts/casino/predict_addresses.sh"
    if [[ -x "$PREDICT_SH" ]]; then
        LIVE_PRED=$(MONAD_MAINNET_RPC="$RPC_URL" CASINO_DEPLOYER="$ADDRESS" bash "$PREDICT_SH" 143 2>/dev/null || true)
        for label in CasinoBankroll CosmicFlip GravityDice ConstellationClimb; do
            key=$(echo "$label" | python3 -c 'import sys; s=sys.stdin.read().strip(); print(s[0].lower()+s[1:])')
            want=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]].lower())' "$PREDICTED_JSON" "$key")
            got_line=$(echo "$LIVE_PRED" | grep -E "^$label:" || true)
            got=$(echo "$got_line" | awk '{print tolower($2)}')
            if [[ -n "$got" && "$got" != "$want" ]]; then
                echo "deploy-mainnet: predicted-address drift for $label." >&2
                echo "  committed: $want" >&2
                echo "  re-derived: $got" >&2
                echo "Update contracts/DEPLOYED.md + 143.predicted.json before broadcasting." >&2
                exit 3
            fi
        done
    fi
fi

# Sanity-check funding (big-int safe — Monad balances can exceed int64).
BAL_DEC=$(curl -sS -m 10 -X POST -H "Content-Type: application/json" \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$ADDRESS\",\"latest\"],\"id\":1}" \
    "$RPC_URL" | python3 -c 'import json,sys; print(int(json.load(sys.stdin).get("result","0x0"), 16))')

INSUFFICIENT=$(python3 -c "print('1' if int('$BAL_DEC') < int('$CASINO_INITIAL_DEPOSIT') else '0')")

cat <<EOF

deploy-mainnet: pre-flight summary
  chainId:          $EXPECTED_CHAIN_ID (Monad mainnet)
  rpc:              $RPC_URL
  explorer:         $EXPLORER_URL
  deployer:         $ADDRESS
  balance:          $BAL_DEC wei
  createX:          $CREATEX (codesize=$CREATEX_CODE_SIZE)
  initialDeposit:   $CASINO_INITIAL_DEPOSIT wei
  initialAllowance: $CASINO_INITIAL_ALLOWANCE wei
  minBet:           $CASINO_MIN_BET wei
  maxBet:           $CASINO_MAX_BET wei
  climbMaxPayout:   $CASINO_CLIMB_MAX_PAYOUT wei
  maxDrawdown24h:   ${CASINO_MAX_DRAWDOWN_24H:-<deposit/2 default>}
  dry-run:          $DRY_RUN
  predictionCheck:  ${CASINO_SKIP_PREDICTION_CHECK:-0}  (0=enforced, 1=skipped)

EOF

if [[ "$INSUFFICIENT" == "1" ]]; then
    echo "deploy-mainnet: WARNING — balance ($BAL_DEC) < initial deposit ($CASINO_INITIAL_DEPOSIT)." >&2
    if [[ "$DRY_RUN" != "true" ]]; then
        echo "                Aborting (use --dry-run to simulate without broadcast)." >&2
        exit 3
    fi
fi

# Gate the actual broadcast behind explicit confirmation.
if [[ "$DRY_RUN" != "true" && "$CONFIRMED" != "1" ]]; then
    echo "deploy-mainnet: this will broadcast to Monad MAINNET (chain $EXPECTED_CHAIN_ID)." >&2
    echo "Re-run with --yes (or CASINO_MAINNET_YES=1) once the audit gates" >&2
    echo "(G1 audit pick, G2 kickoff, G3 fixes, G4 re-review, F8 ops sign-off) have cleared." >&2
    exit 0
fi

cd "$CONTRACTS_DIR"

FORGE_ARGS=(
    script script/Deploy.s.sol:Deploy
    --rpc-url "$RPC_URL"
)
if [[ "$DRY_RUN" != "true" ]]; then
    FORGE_ARGS+=(--broadcast)
fi

ENV_PASSTHROUGH=(
    PRIVATE_KEY="$PRIVATE_KEY"
    CASINO_INITIAL_DEPOSIT="$CASINO_INITIAL_DEPOSIT"
    CASINO_INITIAL_ALLOWANCE="$CASINO_INITIAL_ALLOWANCE"
    CASINO_MIN_BET="$CASINO_MIN_BET"
    CASINO_MAX_BET="$CASINO_MAX_BET"
    CASINO_CLIMB_MAX_PAYOUT="$CASINO_CLIMB_MAX_PAYOUT"
)
if [[ -n "${CASINO_MAX_DRAWDOWN_24H:-}" ]]; then
    ENV_PASSTHROUGH+=(CASINO_MAX_DRAWDOWN_24H="$CASINO_MAX_DRAWDOWN_24H")
fi

env "${ENV_PASSTHROUGH[@]}" forge "${FORGE_ARGS[@]}"

if [[ "$DRY_RUN" == "true" ]]; then
    echo "deploy-mainnet: dry-run complete. Re-run with --yes to broadcast."
    exit 0
fi

DEPLOY_JSON="$CONTRACTS_DIR/deployments/143.json"
if [[ ! -f "$DEPLOY_JSON" ]]; then
    echo "deploy-mainnet: expected $DEPLOY_JSON to exist after broadcast" >&2
    exit 4
fi

BANKROLL=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["bankroll"])' "$DEPLOY_JSON")
FLIP=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["cosmicFlip"])' "$DEPLOY_JSON")
DICE=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["gravityDice"])' "$DEPLOY_JSON")
CLIMB=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["constellationClimb"])' "$DEPLOY_JSON")

echo
echo "deploy-mainnet: deploy complete"
echo "  bankroll:           $BANKROLL"
echo "  cosmicFlip:         $FLIP"
echo "  gravityDice:        $DICE"
echo "  constellationClimb: $CLIMB"
echo "  explorer: $EXPLORER_URL/address/$BANKROLL"
echo
echo "Next:"
echo "  - commit contracts/casino/deployments/143.json"
echo "  - flip the four CasinoBankroll/CosmicFlip/GravityDice/ConstellationClimb"
echo "    rows in contracts/DEPLOYED.md from 'Predicted' to 'Live' with block #"
echo "  - regenerate lib/casino/addresses.generated.ts for chain 143"
echo "  - verify contracts on monadscan via flattened sources"
echo "  - run keeper health: curl <prod>/api/casino/health"
