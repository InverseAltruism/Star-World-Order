/**
 * Casino contract address registry.
 *
 * Reads the per-chain deployment JSON committed under
 * `contracts/casino/deployments/<chainId>.json` and exposes a typed lookup.
 * Returns `null` for chains that have no committed deployment so callers can
 * fail gracefully (banner, disabled UI) instead of crashing on `undefined`.
 */

import testnet10143 from '../../contracts/casino/deployments/10143.json';

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

const REGISTRY: Record<number, CasinoAddresses> = {
  10143: {
    chainId: 10143,
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

export function getCasinoAddresses(chainId: number): CasinoAddresses | null {
  return REGISTRY[chainId] ?? null;
}

export function getSupportedCasinoChainIds(): number[] {
  return Object.keys(REGISTRY).map((k) => Number(k));
}
