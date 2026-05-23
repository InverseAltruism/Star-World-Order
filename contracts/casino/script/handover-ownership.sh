#!/usr/bin/env bash
# handover-ownership.sh — mainnet wrapper around HandoverOwnership.s.sol.
#
# Transfers `Ownable.owner()` on every Cosmic Casino contract from the deploy
# EOA to the SWO governance multisig. Implements G7 of the casino mainnet
# checklist (`SWO_CASINO_MAINNET_OWNERSHIP_HANDOVER`).
#
# Mirrors deploy-mainnet.sh's structure and guards:
#   1. Asserts the RPC actually points at chain 143 before broadcasting.
#   2. Asserts the destination multisig has codesize > 0 (i.e. is a contract,
#      not an EOA) unless CASINO_ALLOW_EOA_MULTISIG=1.
#   3. Asserts the deployer is currently `owner()` on every casino contract.
#   4. Refuses to broadcast without `--yes` (or CASINO_HANDOVER_YES=1) after
#      printing a pre-flight summary the operator has to eyeball.
#   5. Post-broadcast, re-reads `owner()` on each contract and asserts the
#      multisig is the new owner AND the deployer is no longer the owner.
#
# Usage:
#   bash script/handover-ownership.sh --dry-run     # simulate, no broadcast
#   bash script/handover-ownership.sh --yes         # broadcast (after guards)
#
# Required env:
#   CASINO_MULTISIG               destination multisig address
#   CASINO_WALLET_FILE            deployer wallet JSON (default
#                                 ~/.config/cosmic-casino/mainnet-wallet.json)
#
# Optional env:
#   MONAD_MAINNET_RPC             RPC URL (default https://rpc.monad.xyz)
#   MONAD_MAINNET_EXPLORER        explorer base (default https://monadscan.com)
#   CASINO_DEPLOY_JSON            path to deployment artifact (default
#                                 contracts/casino/deployments/143.json)
#   CASINO_ALLOW_EOA_MULTISIG=1   waive the multisig-has-code check (testing only)
#   CASINO_HANDOVER_YES=1         same as --yes (for CI / automation)

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." &> /dev/null && pwd)"
CONTRACTS_DIR="$REPO_ROOT/contracts/casino"
DEPLOY_JSON="${CASINO_DEPLOY_JSON:-$CONTRACTS_DIR/deployments/143.json}"
WALLET_FILE="${CASINO_WALLET_FILE:-$HOME/.config/cosmic-casino/mainnet-wallet.json}"
RPC_URL="${MONAD_MAINNET_RPC:-https://rpc.monad.xyz}"
EXPLORER_URL="${MONAD_MAINNET_EXPLORER:-https://monadscan.com}"
EXPECTED_CHAIN_ID="143"

DRY_RUN="false"
CONFIRMED="${CASINO_HANDOVER_YES:-0}"
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN="true" ;;
        --yes|-y)  CONFIRMED="1" ;;
        *)
            echo "handover-ownership: unknown arg '$arg' (expected --dry-run or --yes)" >&2
            exit 2
            ;;
    esac
done

if ! command -v forge >/dev/null 2>&1 || ! command -v cast >/dev/null 2>&1; then
    echo "handover-ownership: foundry (forge + cast) not on PATH." >&2
    echo "Install: https://book.getfoundry.sh/getting-started/installation" >&2
    exit 2
fi

if [[ -z "${CASINO_MULTISIG:-}" ]]; then
    echo "handover-ownership: CASINO_MULTISIG is required (the destination multisig address)." >&2
    exit 2
fi

# Normalise the multisig to checksummed form via cast so downstream comparisons
# (e.g. against owner() output) are case-insensitive but predictable.
if ! cast to-check-sum-address "$CASINO_MULTISIG" >/dev/null 2>&1; then
    echo "handover-ownership: CASINO_MULTISIG '$CASINO_MULTISIG' is not a valid address." >&2
    exit 2
fi
MULTISIG=$(cast to-check-sum-address "$CASINO_MULTISIG")

if [[ ! -f "$WALLET_FILE" ]]; then
    echo "handover-ownership: wallet file missing: $WALLET_FILE" >&2
    exit 2
fi

WALLET_MODE=$(stat -c '%a' "$WALLET_FILE" 2>/dev/null || stat -f '%Lp' "$WALLET_FILE" 2>/dev/null || echo "")
if [[ -n "$WALLET_MODE" && "$WALLET_MODE" != "600" && "$WALLET_MODE" != "400" ]]; then
    echo "handover-ownership: wallet file $WALLET_FILE has unsafe mode $WALLET_MODE (expected 600 or 400)." >&2
    echo "Fix with: chmod 600 \"$WALLET_FILE\"" >&2
    exit 2
fi

PRIVATE_KEY=$(python3 -c '
import json, sys
data = json.load(open(sys.argv[1]))
entry = data[0] if isinstance(data, list) else data
print(entry["private_key"])
' "$WALLET_FILE")

DEPLOYER=$(python3 -c '
import json, sys
data = json.load(open(sys.argv[1]))
entry = data[0] if isinstance(data, list) else data
print(entry["address"])
' "$WALLET_FILE")

if [[ ! -f "$DEPLOY_JSON" ]]; then
    echo "handover-ownership: deployment artifact missing: $DEPLOY_JSON" >&2
    echo "Run deploy-mainnet.sh first (G5), then re-run this script." >&2
    exit 3
fi

# Read contract addresses from the deployment artifact.
BANKROLL=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["bankroll"])' "$DEPLOY_JSON")
FLIP=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["cosmicFlip"])' "$DEPLOY_JSON")
DICE=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["gravityDice"])' "$DEPLOY_JSON")
CLIMB=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["constellationClimb"])' "$DEPLOY_JSON")
ALLOWLIST=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("allowlist","0x0000000000000000000000000000000000000000"))' "$DEPLOY_JSON")

# Guard 1: RPC must point at chain 143.
ACTUAL_CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null || echo "")
if [[ "$ACTUAL_CHAIN_ID" != "$EXPECTED_CHAIN_ID" ]]; then
    echo "handover-ownership: RPC chain-id mismatch." >&2
    echo "  expected: $EXPECTED_CHAIN_ID (Monad mainnet)" >&2
    echo "  actual:   '$ACTUAL_CHAIN_ID' from $RPC_URL" >&2
    exit 3
fi

# Guard 2: the multisig must not equal the deployer.
if [[ "$(echo "$MULTISIG" | tr 'A-Z' 'a-z')" == "$(echo "$DEPLOYER" | tr 'A-Z' 'a-z')" ]]; then
    echo "handover-ownership: CASINO_MULTISIG ($MULTISIG) equals the deployer ($DEPLOYER)." >&2
    echo "That's a no-op handover — refusing to broadcast." >&2
    exit 3
fi

# Guard 3: the multisig should be a contract, not an EOA. Skippable for the
# specific case where the operator is intentionally handing over to another
# EOA (e.g. a hot key + cold key two-step migration before multisig is live).
MULTISIG_CODESIZE=$(cast codesize "$MULTISIG" --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
if [[ "$MULTISIG_CODESIZE" == "0" && "${CASINO_ALLOW_EOA_MULTISIG:-0}" != "1" ]]; then
    echo "handover-ownership: destination multisig $MULTISIG has no code on chain $EXPECTED_CHAIN_ID." >&2
    echo "Refusing to hand ownership to an EOA. Set CASINO_ALLOW_EOA_MULTISIG=1 to override." >&2
    exit 3
fi

# Guard 4: deployer must currently own each casino contract.
TARGETS=("$BANKROLL" "$FLIP" "$DICE" "$CLIMB")
LABELS=("bankroll" "cosmicFlip" "gravityDice" "constellationClimb")
if [[ "$ALLOWLIST" != "0x0000000000000000000000000000000000000000" ]]; then
    TARGETS+=("$ALLOWLIST")
    LABELS+=("allowlist")
fi

for i in "${!TARGETS[@]}"; do
    target="${TARGETS[$i]}"
    label="${LABELS[$i]}"
    CUR_OWNER=$(cast call "$target" "owner()(address)" --rpc-url "$RPC_URL" 2>/dev/null || echo "")
    if [[ -z "$CUR_OWNER" ]]; then
        echo "handover-ownership: failed to read owner() on $label ($target)." >&2
        exit 3
    fi
    if [[ "$(echo "$CUR_OWNER" | tr 'A-Z' 'a-z')" != "$(echo "$DEPLOYER" | tr 'A-Z' 'a-z')" ]]; then
        echo "handover-ownership: $label ($target) owner is $CUR_OWNER, expected deployer $DEPLOYER." >&2
        echo "Either the wrong wallet is loaded or ownership was already moved." >&2
        exit 3
    fi
done

cat <<EOF

handover-ownership: pre-flight summary
  chainId:         $EXPECTED_CHAIN_ID (Monad mainnet)
  rpc:             $RPC_URL
  explorer:        $EXPLORER_URL
  deployer:        $DEPLOYER  (current owner — will lose owner role)
  multisig:        $MULTISIG  (new owner)
  multisigCode:    codesize=$MULTISIG_CODESIZE
  contracts:
    bankroll:           $BANKROLL
    cosmicFlip:         $FLIP
    gravityDice:        $DICE
    constellationClimb: $CLIMB
    allowlist:          $ALLOWLIST
  dry-run:         $DRY_RUN

EOF

if [[ "$DRY_RUN" != "true" && "$CONFIRMED" != "1" ]]; then
    echo "handover-ownership: this will MOVE ownership of every casino contract" >&2
    echo "                    on Monad MAINNET. This is a one-step transfer —" >&2
    echo "                    OZ Ownable, not Ownable2Step. Triple-check the" >&2
    echo "                    multisig address above before confirming." >&2
    echo "Re-run with --yes (or CASINO_HANDOVER_YES=1) to broadcast." >&2
    exit 0
fi

cd "$CONTRACTS_DIR"

FORGE_ARGS=(
    script script/HandoverOwnership.s.sol:HandoverOwnership
    --rpc-url "$RPC_URL"
)
if [[ "$DRY_RUN" != "true" ]]; then
    FORGE_ARGS+=(--broadcast)
fi

env \
    PRIVATE_KEY="$PRIVATE_KEY" \
    CASINO_MULTISIG="$MULTISIG" \
    CASINO_BANKROLL="$BANKROLL" \
    CASINO_FLIP="$FLIP" \
    CASINO_DICE="$DICE" \
    CASINO_CLIMB="$CLIMB" \
    CASINO_ALLOWLIST="$ALLOWLIST" \
    forge "${FORGE_ARGS[@]}"

if [[ "$DRY_RUN" == "true" ]]; then
    echo "handover-ownership: dry-run complete. Re-run with --yes to broadcast."
    exit 0
fi

# Post-broadcast verification — independent of the in-script asserts, so a
# stale RPC or a partial broadcast can't slip through. Reads owner() live and
# requires (a) new owner == multisig and (b) deployer no longer owner.
echo
echo "handover-ownership: post-broadcast verification"
FAIL=0
for i in "${!TARGETS[@]}"; do
    target="${TARGETS[$i]}"
    label="${LABELS[$i]}"
    NEW_OWNER=$(cast call "$target" "owner()(address)" --rpc-url "$RPC_URL" 2>/dev/null || echo "")
    new_lc=$(echo "$NEW_OWNER" | tr 'A-Z' 'a-z')
    multi_lc=$(echo "$MULTISIG" | tr 'A-Z' 'a-z')
    deployer_lc=$(echo "$DEPLOYER" | tr 'A-Z' 'a-z')
    if [[ "$new_lc" != "$multi_lc" ]]; then
        echo "  FAIL $label ($target): owner=$NEW_OWNER, expected $MULTISIG" >&2
        FAIL=1
    elif [[ "$new_lc" == "$deployer_lc" ]]; then
        # Defensive: this only happens if MULTISIG == DEPLOYER, which Guard 2
        # already ruled out. Kept so the invariant is enforced post-broadcast
        # regardless of how we got here.
        echo "  FAIL $label ($target): deployer still owner" >&2
        FAIL=1
    else
        echo "  OK   $label ($target): owner -> $NEW_OWNER"
    fi
done

if [[ "$FAIL" != "0" ]]; then
    echo "handover-ownership: verification failed — at least one contract is not owned by the multisig." >&2
    exit 4
fi

echo
echo "handover-ownership: complete — all casino contracts now owned by $MULTISIG"
echo "Next:"
echo "  - update contracts/DEPLOYED.md owner column to multisig"
echo "  - rotate the deployer key off the ops host (no longer holds owner role)"
echo "  - schedule a multisig transaction to seed the bankroll (G6)"
