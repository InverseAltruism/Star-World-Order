/**
 * Regression guard for `contracts/casino/script/seed-mainnet.sh` (G6 — initial
 * bankroll seed on Monad mainnet, chain 143).
 *
 * The script broadcasts real MON to a real bankroll. CI cannot exercise it
 * end-to-end (no foundry, no mainnet keys), so this test pins the safety
 * invariants the human operator relies on at run time:
 *
 *   1. Chain-id assertion against 143.
 *   2. Wallet file mode check (0600 / 0400 only).
 *   3. `--yes` / `CASINO_MAINNET_YES` gating before broadcast.
 *   4. Seed-amount band check inside [min, max].
 *   5. Default band defaults sit at the G6 target (10–50 MON).
 *   6. Refuses to seed if 143.json (post-deploy) is missing.
 *   7. Asserts the bankroll address has code on chain.
 *
 * Anyone ripping out one of these guards will trip the test in CI before it
 * lands on mainnet.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const SCRIPT_PATH = resolve(
  __dirname,
  '../../../contracts/casino/script/seed-mainnet.sh',
);

const script = readFileSync(SCRIPT_PATH, 'utf8');

describe('contracts/casino/script/seed-mainnet.sh', () => {
  it('exists and is executable', () => {
    const st = statSync(SCRIPT_PATH);
    expect(st.isFile()).toBe(true);
    // owner-execute bit (0o100) must be set
    expect(st.mode & 0o100).toBe(0o100);
  });

  it('asserts the RPC reports chain id 143 before broadcasting', () => {
    expect(script).toMatch(/EXPECTED_CHAIN_ID="143"/);
    expect(script).toMatch(/cast chain-id --rpc-url "\$RPC_URL"/);
    expect(script).toMatch(/RPC chain-id mismatch/);
  });

  it('refuses world-readable wallet files (enforces 0600/0400)', () => {
    expect(script).toMatch(/WALLET_MODE.*!=.*"600".*!=.*"400"/s);
    expect(script).toMatch(/unsafe mode/);
  });

  it('gates broadcast behind --yes or CASINO_MAINNET_YES', () => {
    expect(script).toMatch(/--yes\|-y\)\s*CONFIRMED="1"/);
    expect(script).toMatch(/CASINO_MAINNET_YES:-0/);
    expect(script).toMatch(/Re-run with --yes/);
  });

  it('enforces a seed-amount band [min, max]', () => {
    // Both bounds must be compared
    expect(script).toMatch(/below floor/);
    expect(script).toMatch(/above ceiling/);
    expect(script).toMatch(/G6 target is 10–50 MON/);
  });

  it('defaults the seed band to the G6 10–50 MON target', () => {
    // 10 MON = 1e19 wei (default amount)
    expect(script).toMatch(/CASINO_SEED_AMOUNT_WEI:=10000000000000000000/);
    // 50 MON = 5e19 wei (max)
    expect(script).toMatch(/CASINO_SEED_MAX_WEI:=50000000000000000000/);
    // 0.1 MON = 1e17 wei (min, prevents zero-effect runs)
    expect(script).toMatch(/CASINO_SEED_MIN_WEI:=100000000000000000/);
  });

  it('refuses to seed before G5 has been broadcast (no 143.json)', () => {
    expect(script).toMatch(/DEPLOY_JSON=.*deployments\/143\.json/);
    expect(script).toMatch(/bankroll not yet deployed/);
    expect(script).toMatch(/Run G5/);
  });

  it('asserts the bankroll address has on-chain code before depositing', () => {
    expect(script).toMatch(/cast codesize "\$BANKROLL"/);
    expect(script).toMatch(/has no code on chain/);
  });

  it('refuses unless the wallet balance covers seed + gas headroom', () => {
    expect(script).toMatch(/CASINO_SEED_AMOUNT_WEI.*\+.*GAS_HEADROOM_WEI/s);
    expect(script).toMatch(/wallet balance.*<.*seed/);
  });

  it('uses the canonical deposit() selector 0xd0e30db0', () => {
    // keccak256("deposit()")[:4]
    expect(script).toMatch(/CALLDATA="0xd0e30db0"/);
    // and double-checks via `cast sig` so a future rename trips the script
    expect(script).toMatch(/cast sig 'deposit\(\)'/);
  });
});
