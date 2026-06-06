/**
 * Casino contract address registry.
 *
 * Reads the per-chain deployment JSON committed under
 * `contracts/casino/deployments/<chainId>.json` and exposes a typed lookup.
 * Returns `null` for chains that have no committed deployment so callers can
 * fail gracefully (banner, disabled UI) instead of crashing on `undefined`.
 */

import testnet10143 from '../../contracts/casino/deployments/10143.json';
import predicted143 from '../../contracts/casino/deployments/143.predicted.json';

export const MONAD_TESTNET_CHAIN_ID = 10143;
export const MONAD_MAINNET_CHAIN_ID = 143;

export interface CasinoAddresses {
  chainId: number;
  bankroll: `0x${string}`;
  allowlist: `0x${string}`;
  allowlistEnabled: boolean;
  cosmicFlip: `0x${string}`;
  gravityDice: `0x${string}`;
  constellationClimb: `0x${string}`;
  deployer: `0x${string}`;
  maxDrawdown24hWei: bigint;
}

/**
 * Monad-mainnet (chain 143) casino addresses.
 *
 * Sourced from the committed CREATE3 prediction artifact
 * (`143.predicted.json`). CREATE3 addresses depend only on `(deployer, salt)`
 * and CreateX sits at the same address on every Monad chain, so these match the
 * live testnet (10143) addresses byte-for-byte and WILL be the live mainnet
 * addresses once the operator broadcasts `Deploy.s.sol` with the prod deployer
 * and unchanged salts (guarded by `predictedMainnet.test.ts`).
 *
 * `maxDrawdown24hWei` is the deploy-time circuit-breaker config, identical
 * across both Monad chains, so it is sourced from the testnet artifact.
 *
 * NOTE: this constant is *populated* but chain 143 is only *registered* (and
 * therefore usable for real bets / shown as "live") once mainnet bets have
 * settled and the operator flips `isCasinoMainnetLive()` on — see below.
 */
export const MONAD_MAINNET_CASINO: CasinoAddresses = {
  chainId: MONAD_MAINNET_CHAIN_ID,
  bankroll: predicted143.bankroll as `0x${string}`,
  allowlist: predicted143.allowlist as `0x${string}`,
  allowlistEnabled: predicted143.allowlistEnabled,
  cosmicFlip: predicted143.cosmicFlip as `0x${string}`,
  gravityDice: predicted143.gravityDice as `0x${string}`,
  constellationClimb: predicted143.constellationClimb as `0x${string}`,
  deployer: predicted143.deployer as `0x${string}`,
  maxDrawdown24hWei: BigInt(testnet10143.maxDrawdown24hWei),
};

/**
 * Single gate that flips the Monad-mainnet casino live.
 *
 * Stays off until the operator sets `NEXT_PUBLIC_CASINO_MAINNET_LIVE=true`
 * after mainnet contracts are broadcast and the first real bets settle. While
 * off, `getCasinoAddresses(143)` returns `null` so the game UIs render their
 * "not deployed yet" state instead of routing real value to an unconfirmed
 * contract, and the landing-page cards stay "coming soon". Flipping the env
 * var is the entire mainnet go-live action — no code change required.
 */
export function isCasinoMainnetLive(): boolean {
  return process.env.NEXT_PUBLIC_CASINO_MAINNET_LIVE === 'true';
}

const REGISTRY: Record<number, CasinoAddresses> = {
  [MONAD_TESTNET_CHAIN_ID]: {
    chainId: MONAD_TESTNET_CHAIN_ID,
    bankroll: testnet10143.bankroll as `0x${string}`,
    allowlist: testnet10143.allowlist as `0x${string}`,
    allowlistEnabled: testnet10143.allowlistEnabled,
    cosmicFlip: testnet10143.cosmicFlip as `0x${string}`,
    gravityDice: testnet10143.gravityDice as `0x${string}`,
    constellationClimb: testnet10143.constellationClimb as `0x${string}`,
    deployer: testnet10143.deployer as `0x${string}`,
    maxDrawdown24hWei: BigInt(testnet10143.maxDrawdown24hWei),
  },
};

// Mainnet (143) registers only once the operator flips the live gate, after
// mainnet bets have settled. Until then chain 143 stays unregistered and
// `getCasinoAddresses(143)` returns null.
if (isCasinoMainnetLive()) {
  REGISTRY[MONAD_MAINNET_CHAIN_ID] = MONAD_MAINNET_CASINO;
}

export function getCasinoAddresses(chainId: number): CasinoAddresses | null {
  return REGISTRY[chainId] ?? null;
}

export function getSupportedCasinoChainIds(): number[] {
  return Object.keys(REGISTRY).map((k) => Number(k));
}
