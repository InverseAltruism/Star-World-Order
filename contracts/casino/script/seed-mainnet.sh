#!/usr/bin/env bash
# seed-mainnet.sh — operator-sized bankroll seed for Monad mainnet (chain 143).
#
# The deploy script (deploy-mainnet.sh / Deploy.s.sol) already seeds the bankroll
# with `CASINO_INITIAL_DEPOSIT` (default 10 MON) during deploy. This script is
# the operator's lever to (a) seed with a different amount post-deploy, or
# (b) top up an already-funded bankroll up to the launch target.
#
# G6 sizing: suggested 10–50 MON of seed liquidity. The script enforces an
# upper bound (50 MON, override via CASINO_SEED_MAX_WEI) to prevent fat-finger
# overdeposits and a lower bound of 0.1 MON to prevent zero-effect runs.
#
# Mainnet guards (mirrors deploy-mainnet.sh):
#   1. Refuses to send unless the RPC reports chain id 143.
#   2. Refuses if CASINO_SEED_AMOUNT_WEI sits outside [min, max].
#   3. Refuses if the deployed bankroll address (143.json) is missing.
#   4. Refuses unless the wallet file mode is 0600/0400.
#   5. Refuses unless the deployer balance >= seed + gas headroom.
#   6. Refuses to broadcast without `--yes` (or CASINO_MAINNET_YES=1) after
#      printing a pre-flight summary the operator must eyeball.
#
# Usage:
#   bash script/seed-mainnet.sh --dry-run                       # simulate
#   CASINO_SEED_AMOUNT_WEI=25000000000000000000 \
#     bash script/seed-mainnet.sh --yes                         # broadcast 25 MON
#
# Env overrides:
#   CASINO_WALLET_FILE        wallet JSON (default ~/.config/cosmic-casino/mainnet-wallet.json)
#   MONAD_MAINNET_RPC         RPC URL (default https://rpc.monad.xyz)
#   MONAD_MAINNET_EXPLORER    Explorer base (default https://monadscan.com)
#   CASINO_SEED_AMOUNT_WEI    seed amount in wei (default 10 MON = 1e19)
#   CASINO_SEED_MIN_WEI       lower bound in wei (default 0.1 MON = 1e17)
#   CASINO_SEED_MAX_WEI       upper bound in wei (default 50 MON = 5e19)
#   CASINO_SEED_BANKROLL      override bankroll address (default: read 143.json)
#   CASINO_MAINNET_YES=1      same as --yes (for CI / automation).

set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." &> /dev/null && pwd)"
CONTRACTS_DIR="$REPO_ROOT/contracts/casino"
DEPLOY_JSON="$CONTRACTS_DIR/deployments/143.json"
PREDICTED_JSON="$CONTRACTS_DIR/deployments/143.predicted.json"
WALLET_FILE="${CASINO_WALLET_FILE:-$HOME/.config/cosmic-casino/mainnet-wallet.json}"
RPC_URL="${MONAD_MAINNET_RPC:-https://rpc.monad.xyz}"
EXPLORER_URL="${MONAD_MAINNET_EXPLORER:-https://monadscan.com}"
EXPECTED_CHAIN_ID="143"

# G6 sizing (10–50 MON suggested). Defaults err on the small side; operator
# sets the real number via env. All math is via python to avoid bash 64-bit
# overflow at >= ~9.2 MON.
: "${CASINO_SEED_AMOUNT_WEI:=10000000000000000000}"   # 10 MON
: "${CASINO_SEED_MIN_WEI:=100000000000000000}"        #  0.1 MON
: "${CASINO_SEED_MAX_WEI:=50000000000000000000}"      # 50 MON
# Reserve some headroom for gas; deposit() is cheap (~30k gas) but at high
# Monad gas prices a few mwei of margin matters. 0.01 MON is plenty.
GAS_HEADROOM_WEI="${CASINO_SEED_GAS_HEADROOM_WEI:-10000000000000000}"

DRY_RUN="false"
CONFIRMED="${CASINO_MAINNET_YES:-0}"
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN="true" ;;
        --yes|-y)  CONFIRMED="1" ;;
        *)
            echo "seed-mainnet: unknown arg '$arg' (expected --dry-run or --yes)" >&2
            exit 2
            ;;
    esac
done

if ! command -v cast >/dev/null 2>&1; then
    echo "seed-mainnet: foundry (cast) not on PATH." >&2
    echo "Install: https://book.getfoundry.sh/getting-started/installation" >&2
    exit 2
fi

if [[ ! -f "$WALLET_FILE" ]]; then
    echo "seed-mainnet: wallet file missing: $WALLET_FILE" >&2
    echo "Create one with:" >&2
    echo "  mkdir -p \"$(dirname "$WALLET_FILE")\"" >&2
    echo "  cast wallet new --json > \"$WALLET_FILE\" && chmod 600 \"$WALLET_FILE\"" >&2
    exit 2
fi

# Refuse to read a world-readable wallet file. Mainnet keys must be 0600 / 0400.
WALLET_MODE=$(stat -c '%a' "$WALLET_FILE" 2>/dev/null || stat -f '%Lp' "$WALLET_FILE" 2>/dev/null || echo "")
if [[ -n "$WALLET_MODE" && "$WALLET_MODE" != "600" && "$WALLET_MODE" != "400" ]]; then
    echo "seed-mainnet: wallet file $WALLET_FILE has unsafe mode $WALLET_MODE (expected 600 or 400)." >&2
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

# Resolve bankroll address: explicit env > 143.json (post-deploy) > error.
# 143.predicted.json is intentionally NOT a fallback: seeding before broadcast
# would burn MON into an EOA-free address.
if [[ -n "${CASINO_SEED_BANKROLL:-}" ]]; then
    BANKROLL="$CASINO_SEED_BANKROLL"
elif [[ -f "$DEPLOY_JSON" ]]; then
    BANKROLL=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["bankroll"])' "$DEPLOY_JSON")
else
    echo "seed-mainnet: $DEPLOY_JSON missing — bankroll not yet deployed on chain $EXPECTED_CHAIN_ID." >&2
    if [[ -f "$PREDICTED_JSON" ]]; then
        PRED_BANK=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["bankroll"])' "$PREDICTED_JSON")
        echo "  predicted bankroll: $PRED_BANK (CREATE3 — not live until G5 broadcast)" >&2
    fi
    echo "Run G5 (deploy-mainnet.sh --yes) before seeding, or set CASINO_SEED_BANKROLL." >&2
    exit 3
fi

# Validate the bankroll address is well-formed (cast checksum normalises + validates).
BANKROLL_NORM=$(cast to-check-sum-address "$BANKROLL" 2>/dev/null || echo "")
if [[ -z "$BANKROLL_NORM" ]]; then
    echo "seed-mainnet: bankroll address '$BANKROLL' is not a valid 20-byte address." >&2
    exit 3
fi
BANKROLL="$BANKROLL_NORM"

# Guard 1: assert RPC points at chain 143.
ACTUAL_CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null || echo "")
if [[ "$ACTUAL_CHAIN_ID" != "$EXPECTED_CHAIN_ID" ]]; then
    echo "seed-mainnet: RPC chain-id mismatch." >&2
    echo "  expected: $EXPECTED_CHAIN_ID (Monad mainnet)" >&2
    echo "  actual:   '$ACTUAL_CHAIN_ID' from $RPC_URL" >&2
    echo "Set MONAD_MAINNET_RPC to a real mainnet endpoint and re-run." >&2
    exit 3
fi

# Guard 2: assert bankroll has code (it's a contract, not an EOA).
BANKROLL_CODE_SIZE=$(cast codesize "$BANKROLL" --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
if [[ "$BANKROLL_CODE_SIZE" == "0" ]]; then
    echo "seed-mainnet: bankroll $BANKROLL has no code on chain $EXPECTED_CHAIN_ID." >&2
    echo "Either G5 has not been broadcast, or CASINO_SEED_BANKROLL points at a wrong address." >&2
    exit 3
fi

# Guard 3: seed amount must sit inside the [min, max] band.
OUT_OF_RANGE=$(python3 -c "
amt = int('$CASINO_SEED_AMOUNT_WEI')
lo = int('$CASINO_SEED_MIN_WEI')
hi = int('$CASINO_SEED_MAX_WEI')
print('low' if amt < lo else ('high' if amt > hi else 'ok'))
")
if [[ "$OUT_OF_RANGE" == "low" ]]; then
    echo "seed-mainnet: CASINO_SEED_AMOUNT_WEI ($CASINO_SEED_AMOUNT_WEI) below floor $CASINO_SEED_MIN_WEI (0.1 MON)." >&2
    echo "If you really mean a sub-floor amount, lower CASINO_SEED_MIN_WEI explicitly." >&2
    exit 3
fi
if [[ "$OUT_OF_RANGE" == "high" ]]; then
    echo "seed-mainnet: CASINO_SEED_AMOUNT_WEI ($CASINO_SEED_AMOUNT_WEI) above ceiling $CASINO_SEED_MAX_WEI (50 MON)." >&2
    echo "G6 target is 10–50 MON. If you really mean more, raise CASINO_SEED_MAX_WEI explicitly." >&2
    exit 3
fi

# Sanity-check funding (big-int safe — Monad balances can exceed int64).
BAL_DEC=$(curl -sS -m 10 -X POST -H "Content-Type: application/json" \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$ADDRESS\",\"latest\"],\"id\":1}" \
    "$RPC_URL" | python3 -c 'import json,sys; print(int(json.load(sys.stdin).get("result","0x0"), 16))')

INSUFFICIENT=$(python3 -c "
bal = int('$BAL_DEC')
need = int('$CASINO_SEED_AMOUNT_WEI') + int('$GAS_HEADROOM_WEI')
print('1' if bal < need else '0')
")

# Read current bankroll balance so the operator can see the pre/post delta.
BANK_BAL_HEX=$(curl -sS -m 10 -X POST -H "Content-Type: application/json" \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$BANKROLL\",\"latest\"],\"id\":1}" \
    "$RPC_URL" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result","0x0"))')
BANK_BAL_DEC=$(python3 -c "print(int('$BANK_BAL_HEX', 16))")

# Human-readable MON amounts (18 decimals, 4 dp).
AMOUNT_MON=$(python3 -c "print(f'{int(\"$CASINO_SEED_AMOUNT_WEI\") / 10**18:.4f}')")
BAL_MON=$(python3 -c "print(f'{int(\"$BAL_DEC\") / 10**18:.4f}')")
BANK_BAL_MON=$(python3 -c "print(f'{int(\"$BANK_BAL_DEC\") / 10**18:.4f}')")
POST_BANK_MON=$(python3 -c "print(f'{(int(\"$BANK_BAL_DEC\") + int(\"$CASINO_SEED_AMOUNT_WEI\")) / 10**18:.4f}')")

cat <<EOF

seed-mainnet: pre-flight summary
  chainId:        $EXPECTED_CHAIN_ID (Monad mainnet)
  rpc:            $RPC_URL
  explorer:       $EXPLORER_URL
  bankroll:       $BANKROLL  (codesize=$BANKROLL_CODE_SIZE)
  bank balance:   $BANK_BAL_DEC wei  ($BANK_BAL_MON MON)
  depositor:      $ADDRESS
  wallet balance: $BAL_DEC wei  ($BAL_MON MON)
  seed amount:    $CASINO_SEED_AMOUNT_WEI wei  ($AMOUNT_MON MON)
  post-seed bank: $POST_BANK_MON MON (projected)
  band:           [$CASINO_SEED_MIN_WEI, $CASINO_SEED_MAX_WEI] wei
  gas headroom:   $GAS_HEADROOM_WEI wei
  dry-run:        $DRY_RUN

EOF

if [[ "$INSUFFICIENT" == "1" ]]; then
    echo "seed-mainnet: WARNING — wallet balance ($BAL_DEC) < seed ($CASINO_SEED_AMOUNT_WEI) + gas headroom ($GAS_HEADROOM_WEI)." >&2
    if [[ "$DRY_RUN" != "true" ]]; then
        echo "                Aborting (use --dry-run to simulate without broadcast)." >&2
        exit 3
    fi
fi

# Gate the actual broadcast behind explicit confirmation.
if [[ "$DRY_RUN" != "true" && "$CONFIRMED" != "1" ]]; then
    echo "seed-mainnet: this will send $AMOUNT_MON MON to bankroll $BANKROLL on chain $EXPECTED_CHAIN_ID (MAINNET)." >&2
    echo "Re-run with --yes (or CASINO_MAINNET_YES=1) once the launch checklist is satisfied." >&2
    exit 0
fi

# deposit() selector. Bankroll also accepts plain receive() with the same
# Deposited event, but calling deposit() explicitly is clearer in the trace
# and lets the contract revert with ZeroAmount() if msg.value is 0 (which
# the band-check above already prevents).
CALLDATA="0xd0e30db0"   # keccak256("deposit()")[:4]
DEPOSIT_SELECTOR_DERIVED=$(cast sig 'deposit()' 2>/dev/null || echo "")
if [[ -n "$DEPOSIT_SELECTOR_DERIVED" && "$DEPOSIT_SELECTOR_DERIVED" != "$CALLDATA" ]]; then
    echo "seed-mainnet: deposit() selector drift — expected $CALLDATA, derived $DEPOSIT_SELECTOR_DERIVED." >&2
    exit 4
fi

if [[ "$DRY_RUN" == "true" ]]; then
    echo "seed-mainnet: simulating via cast call (no broadcast)..."
    cast call "$BANKROLL" "deposit()" \
        --value "$CASINO_SEED_AMOUNT_WEI" \
        --from "$ADDRESS" \
        --rpc-url "$RPC_URL"
    echo
    echo "seed-mainnet: dry-run complete. Re-run with --yes to broadcast."
    exit 0
fi

echo "seed-mainnet: broadcasting deposit()..."
TX_OUT=$(cast send "$BANKROLL" "deposit()" \
    --value "$CASINO_SEED_AMOUNT_WEI" \
    --private-key "$PRIVATE_KEY" \
    --rpc-url "$RPC_URL" \
    --json)

TX_HASH=$(echo "$TX_OUT" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("transactionHash",""))')
TX_STATUS=$(echo "$TX_OUT" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))')

if [[ "$TX_STATUS" != "0x1" && "$TX_STATUS" != "1" && "$TX_STATUS" != "success" ]]; then
    echo "seed-mainnet: deposit reverted (status=$TX_STATUS, tx=$TX_HASH)" >&2
    exit 4
fi

NEW_BANK_HEX=$(curl -sS -m 10 -X POST -H "Content-Type: application/json" \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$BANKROLL\",\"latest\"],\"id\":1}" \
    "$RPC_URL" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result","0x0"))')
NEW_BANK_DEC=$(python3 -c "print(int('$NEW_BANK_HEX', 16))")
NEW_BANK_MON=$(python3 -c "print(f'{int(\"$NEW_BANK_DEC\") / 10**18:.4f}')")

echo
echo "seed-mainnet: deposit complete"
echo "  tx:           $TX_HASH"
echo "  bankroll:     $BANKROLL"
echo "  seeded:       $AMOUNT_MON MON"
echo "  new balance:  $NEW_BANK_MON MON  ($NEW_BANK_DEC wei)"
echo "  explorer:     $EXPLORER_URL/tx/$TX_HASH"
echo
echo "Next:"
echo "  - record this seed in the 'Bankroll seed (G6)' table in contracts/DEPLOYED.md"
echo "    (tx hash, amount, resulting bankroll balance, block #) in a tracking PR"
echo "  - run keeper health to confirm the bankroll is funded and live:"
echo "      curl <prod>/api/casino/health"
echo "  - if topping up later, re-run with a new CASINO_SEED_AMOUNT_WEI inside the band"
