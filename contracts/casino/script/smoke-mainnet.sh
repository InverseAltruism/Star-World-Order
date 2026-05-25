#!/usr/bin/env bash
# smoke-mainnet.sh — operator post-launch smoke on Monad mainnet (chain 143).
#
# G8: places a single min-stake bet against EACH of the three games and drives
# it to a terminal state, capturing every tx hash so the operator can paste a
# verifiable smoke record into contracts/DEPLOYED.md:
#
#   1. CosmicFlip          placeBet(Heads) -> settleBet                 (2 tx)
#   2. GravityDice         placeBet(rollUnder) -> settleBet             (2 tx)
#   3. ConstellationClimb  openSession -> cashOut (immediate, 1.0x)     (2 tx)
#
# All three games are commit/reveal. For a smoke the operator plays both roles:
# we generate a random 32-byte server reveal, derive the commit as
# keccak256(abi.encodePacked(reveal)) (matches CommitRevealRandomness.verifyCommit),
# place the bet against that commit, then settle by revealing it. The
# ConstellationClimb session is cashed out at step 0 (multiplier 1.0x) so the
# smoke returns the exact stake — no extra bankroll exposure beyond the round-trip.
#
# Mainnet guards (mirror seed-mainnet.sh / deploy-mainnet.sh):
#   1. Refuses unless the RPC reports chain id 143.
#   2. Refuses if deployments/143.json (G5 broadcast artifact) is missing.
#   3. Refuses unless each game + bankroll address has on-chain code.
#   4. Refuses unless the wallet file mode is 0600/0400.
#   5. Refuses unless the wallet balance covers 3 stakes + gas headroom.
#   6. Refuses to broadcast without `--yes` (or CASINO_MAINNET_YES=1) after
#      printing a pre-flight summary the operator must eyeball.
#
# Usage:
#   bash script/smoke-mainnet.sh --dry-run         # simulate all 6 calls, no broadcast
#   bash script/smoke-mainnet.sh --yes             # broadcast the smoke
#
# Env overrides:
#   CASINO_WALLET_FILE        wallet JSON (default ~/.config/cosmic-casino/mainnet-wallet.json)
#   MONAD_MAINNET_RPC         RPC URL (default https://rpc.monad.xyz)
#   MONAD_MAINNET_EXPLORER    Explorer base (default https://monadscan.com)
#   CASINO_SMOKE_STAKE_WEI    stake per bet in wei (default: each game's on-chain minBet())
#   CASINO_SMOKE_ROLL_UNDER   GravityDice rollUnder, [2,98] (default 50)
#   CASINO_SMOKE_GAS_HEADROOM_WEI  gas reserve (default 0.05 MON)
#   CASINO_MAINNET_YES=1      same as --yes (for CI / automation).

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." &> /dev/null && pwd)"
CONTRACTS_DIR="$REPO_ROOT/contracts/casino"
DEPLOY_JSON="$CONTRACTS_DIR/deployments/143.json"
WALLET_FILE="${CASINO_WALLET_FILE:-$HOME/.config/cosmic-casino/mainnet-wallet.json}"
RPC_URL="${MONAD_MAINNET_RPC:-https://rpc.monad.xyz}"
EXPLORER_URL="${MONAD_MAINNET_EXPLORER:-https://monadscan.com}"
EXPECTED_CHAIN_ID="143"

ROLL_UNDER="${CASINO_SMOKE_ROLL_UNDER:-50}"
GAS_HEADROOM_WEI="${CASINO_SMOKE_GAS_HEADROOM_WEI:-50000000000000000}"   # 0.05 MON

DRY_RUN="false"
CONFIRMED="${CASINO_MAINNET_YES:-0}"
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN="true" ;;
        --yes|-y)  CONFIRMED="1" ;;
        *)
            echo "smoke-mainnet: unknown arg '$arg' (expected --dry-run or --yes)" >&2
            exit 2
            ;;
    esac
done

if ! command -v cast >/dev/null 2>&1; then
    echo "smoke-mainnet: foundry (cast) not on PATH." >&2
    echo "Install: https://book.getfoundry.sh/getting-started/installation" >&2
    exit 2
fi

if [[ ! -f "$WALLET_FILE" ]]; then
    echo "smoke-mainnet: wallet file missing: $WALLET_FILE" >&2
    echo "Create one with:" >&2
    echo "  mkdir -p \"$(dirname "$WALLET_FILE")\"" >&2
    echo "  cast wallet new --json > \"$WALLET_FILE\" && chmod 600 \"$WALLET_FILE\"" >&2
    exit 2
fi

# Refuse a world-readable wallet file. Mainnet keys must be 0600 / 0400.
WALLET_MODE=$(stat -c '%a' "$WALLET_FILE" 2>/dev/null || stat -f '%Lp' "$WALLET_FILE" 2>/dev/null || echo "")
if [[ -n "$WALLET_MODE" && "$WALLET_MODE" != "600" && "$WALLET_MODE" != "400" ]]; then
    echo "smoke-mainnet: wallet file $WALLET_FILE has unsafe mode $WALLET_MODE (expected 600 or 400)." >&2
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

# Guard 2: the G5 broadcast artifact must exist. 143.predicted.json is NOT a
# fallback — smoking against predicted-but-unbroadcast addresses would revert.
if [[ ! -f "$DEPLOY_JSON" ]]; then
    echo "smoke-mainnet: $DEPLOY_JSON missing — casino not yet deployed on chain $EXPECTED_CHAIN_ID." >&2
    echo "Run G5 (deploy-mainnet.sh --yes) and G6 (seed-mainnet.sh --yes) before smoking." >&2
    exit 3
fi

read_addr() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$DEPLOY_JSON" "$1"; }
BANKROLL=$(read_addr bankroll)
FLIP=$(read_addr cosmicFlip)
DICE=$(read_addr gravityDice)
CLIMB=$(read_addr constellationClimb)

# Validate every address is well-formed (cast checksum normalises + validates).
for pair in "bankroll:$BANKROLL" "cosmicFlip:$FLIP" "gravityDice:$DICE" "constellationClimb:$CLIMB"; do
    name="${pair%%:*}"; val="${pair#*:}"
    norm=$(cast to-check-sum-address "$val" 2>/dev/null || echo "")
    if [[ -z "$norm" ]]; then
        echo "smoke-mainnet: $name address '$val' in 143.json is not a valid 20-byte address." >&2
        exit 3
    fi
done

# Guard 1: assert RPC points at chain 143.
ACTUAL_CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null || echo "")
if [[ "$ACTUAL_CHAIN_ID" != "$EXPECTED_CHAIN_ID" ]]; then
    echo "smoke-mainnet: RPC chain-id mismatch." >&2
    echo "  expected: $EXPECTED_CHAIN_ID (Monad mainnet)" >&2
    echo "  actual:   '$ACTUAL_CHAIN_ID' from $RPC_URL" >&2
    echo "Set MONAD_MAINNET_RPC to a real mainnet endpoint and re-run." >&2
    exit 3
fi

# Guard 3: every contract must have on-chain code.
for pair in "bankroll:$BANKROLL" "cosmicFlip:$FLIP" "gravityDice:$DICE" "constellationClimb:$CLIMB"; do
    name="${pair%%:*}"; val="${pair#*:}"
    code_size=$(cast codesize "$val" --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
    if [[ "$code_size" == "0" ]]; then
        echo "smoke-mainnet: $name $val has no code on chain $EXPECTED_CHAIN_ID (G5 not broadcast?)." >&2
        exit 3
    fi
done

# Stake per game: explicit override, else each game's on-chain minBet().
flip_min=$(cast call "$FLIP" "minBet()(uint256)" --rpc-url "$RPC_URL" | awk '{print $1}')
dice_min=$(cast call "$DICE" "minBet()(uint256)" --rpc-url "$RPC_URL" | awk '{print $1}')
climb_min=$(cast call "$CLIMB" "minBet()(uint256)" --rpc-url "$RPC_URL" | awk '{print $1}')
FLIP_STAKE="${CASINO_SMOKE_STAKE_WEI:-$flip_min}"
DICE_STAKE="${CASINO_SMOKE_STAKE_WEI:-$dice_min}"
CLIMB_STAKE="${CASINO_SMOKE_STAKE_WEI:-$climb_min}"

# rollUnder bounds check (contract enforces [2,98]; fail early with a clear msg).
if (( ROLL_UNDER < 2 || ROLL_UNDER > 98 )); then
    echo "smoke-mainnet: CASINO_SMOKE_ROLL_UNDER=$ROLL_UNDER out of range [2,98]." >&2
    exit 3
fi

# Wallet funding: 3 stakes + gas headroom (big-int safe).
BAL_DEC=$(curl -sS -m 10 -X POST -H "Content-Type: application/json" \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$ADDRESS\",\"latest\"],\"id\":1}" \
    "$RPC_URL" | python3 -c 'import json,sys; print(int(json.load(sys.stdin).get("result","0x0"), 16))')

INSUFFICIENT=$(python3 -c "
bal = int('$BAL_DEC')
need = int('$FLIP_STAKE') + int('$DICE_STAKE') + int('$CLIMB_STAKE') + int('$GAS_HEADROOM_WEI')
print('1' if bal < need else '0')
")

mon() { python3 -c "print(f'{int(\"$1\") / 10**18:.6f}')"; }

cat <<EOF

smoke-mainnet: pre-flight summary
  chainId:        $EXPECTED_CHAIN_ID (Monad mainnet)
  rpc:            $RPC_URL
  explorer:       $EXPLORER_URL
  player:         $ADDRESS  ($(mon "$BAL_DEC") MON)
  bankroll:       $BANKROLL
  cosmicFlip:     $FLIP        stake $FLIP_STAKE wei  ($(mon "$FLIP_STAKE") MON)
  gravityDice:    $DICE        stake $DICE_STAKE wei  ($(mon "$DICE_STAKE") MON)  rollUnder=$ROLL_UNDER
  constellation:  $CLIMB        stake $CLIMB_STAKE wei  ($(mon "$CLIMB_STAKE") MON)  cashOut@1.0x
  gas headroom:   $GAS_HEADROOM_WEI wei
  dry-run:        $DRY_RUN

EOF

if [[ "$INSUFFICIENT" == "1" ]]; then
    echo "smoke-mainnet: WARNING — wallet balance ($BAL_DEC) < 3 stakes + gas headroom." >&2
    if [[ "$DRY_RUN" != "true" ]]; then
        echo "                Aborting (use --dry-run to simulate without broadcast)." >&2
        exit 3
    fi
fi

if [[ "$DRY_RUN" != "true" && "$CONFIRMED" != "1" ]]; then
    echo "smoke-mainnet: this will place 3 real min-stake bets on chain $EXPECTED_CHAIN_ID (MAINNET)." >&2
    echo "Re-run with --yes (or CASINO_MAINNET_YES=1) once G5/G6/G7 are complete." >&2
    exit 0
fi

# Random server seed + commit (commit = keccak256(abi.encodePacked(reveal))).
gen_reveal() { cast keccak "$(python3 -c "import secrets; print('0x'+secrets.token_hex(32))")"; }
client_seed() { python3 -c "import secrets; print('0x'+secrets.token_hex(32))"; }

tx_hash() { python3 -c 'import json,sys; print(json.load(sys.stdin).get("transactionHash",""))'; }
tx_status() { python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))'; }
ok_status() { [[ "$1" == "0x1" || "$1" == "1" || "$1" == "success" ]]; }

# Simulate (dry-run) or broadcast (--yes) one call. Echoes the tx hash on send.
play() { # <label> <to> <value_wei> <sig> [args...]
    local label="$1" to="$2" value="$3" sig="$4"; shift 4
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "  [dry-run] $label: cast call $to \"$sig\" $* ${value:+--value $value}"
        cast call "$to" "$sig" "$@" ${value:+--value "$value"} --from "$ADDRESS" --rpc-url "$RPC_URL" >/dev/null
        echo "            simulated OK"
        return 0
    fi
    local out hash st
    out=$(cast send "$to" "$sig" "$@" ${value:+--value "$value"} \
        --private-key "$PRIVATE_KEY" --rpc-url "$RPC_URL" --json)
    hash=$(echo "$out" | tx_hash); st=$(echo "$out" | tx_status)
    if ! ok_status "$st"; then
        echo "smoke-mainnet: $label reverted (status=$st, tx=$hash)" >&2
        exit 4
    fi
    echo "  $label: $hash"
    SMOKE_TX+=("$label|$hash")
}

declare -a SMOKE_TX=()

echo "smoke-mainnet: ${DRY_RUN:+dry-run }playing CosmicFlip..."
FLIP_BETID=$(cast call "$FLIP" "nextBetId()(uint256)" --rpc-url "$RPC_URL" | awk '{print $1}')
FLIP_REVEAL=$(gen_reveal); FLIP_COMMIT=$(cast keccak "$FLIP_REVEAL"); FLIP_CSEED=$(client_seed)
play "cosmicFlip.placeBet"  "$FLIP" "$FLIP_STAKE" "placeBet(uint8,bytes32,bytes32)" 0 "$FLIP_CSEED" "$FLIP_COMMIT"
play "cosmicFlip.settleBet" "$FLIP" ""            "settleBet(uint256,bytes32)" "$FLIP_BETID" "$FLIP_REVEAL"

echo "smoke-mainnet: ${DRY_RUN:+dry-run }playing GravityDice..."
DICE_BETID=$(cast call "$DICE" "nextBetId()(uint256)" --rpc-url "$RPC_URL" | awk '{print $1}')
DICE_REVEAL=$(gen_reveal); DICE_COMMIT=$(cast keccak "$DICE_REVEAL"); DICE_CSEED=$(client_seed)
play "gravityDice.placeBet"  "$DICE" "$DICE_STAKE" "placeBet(uint8,bytes32,bytes32)" "$ROLL_UNDER" "$DICE_CSEED" "$DICE_COMMIT"
play "gravityDice.settleBet" "$DICE" ""            "settleBet(uint256,bytes32)" "$DICE_BETID" "$DICE_REVEAL"

echo "smoke-mainnet: ${DRY_RUN:+dry-run }playing ConstellationClimb..."
CLIMB_SID=$(cast call "$CLIMB" "nextSessionId()(uint256)" --rpc-url "$RPC_URL" | awk '{print $1}')
CLIMB_COMMIT=$(cast keccak "$(gen_reveal)"); CLIMB_CSEED=$(client_seed)
play "constellation.openSession" "$CLIMB" "$CLIMB_STAKE" "openSession(bytes32,bytes32)" "$CLIMB_CSEED" "$CLIMB_COMMIT"
play "constellation.cashOut"     "$CLIMB" ""             "cashOut(uint256)" "$CLIMB_SID"

if [[ "$DRY_RUN" == "true" ]]; then
    echo
    echo "smoke-mainnet: dry-run complete (6 calls simulated). Re-run with --yes to broadcast."
    exit 0
fi

echo
echo "smoke-mainnet: smoke complete — all 3 games exercised on chain $EXPECTED_CHAIN_ID."
echo
echo "Captured tx hashes (record these in contracts/DEPLOYED.md, 'Mainnet smoke (G8)'):"
for entry in "${SMOKE_TX[@]}"; do
    label="${entry%%|*}"; hash="${entry#*|}"
    printf '  %-28s %s\n' "$label" "$EXPLORER_URL/tx/$hash"
done
echo
echo "Next:"
echo "  - paste the table above into the 'Mainnet smoke (G8)' section of contracts/DEPLOYED.md"
echo "  - confirm bankroll health: curl <prod>/api/casino/health"
echo "  - if any tx reverted, the script exited non-zero before reaching here"
