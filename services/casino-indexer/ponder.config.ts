// Ponder runtime config for the SWO Cosmic Casino bet-history indexer.
//
// Targets Monad testnet (chainId 10143). Contract addresses come from env
// vars so the indexer stays decoupled from the deploy-address book — set
// `SWO_<GAME>_ADDRESS` (or the `BUNNYBAGZ_*` legacy aliases used by anvil
// fork scripts) to point at the live deployment.
//
// Ponder reads this file via dynamic import; the runtime is *not* required
// for vitest (tests target the pure handlers). When Ponder is added to the
// workspace, `createConfig` will resolve from `ponder` and `ponder dev`
// boots normally. Until then, the export is a plain config object that
// typechecks without the Ponder package installed.

import type { Address } from 'viem';

import { BANKROLL_EVENT_ABI } from './abis/CasinoBankroll';
import { COINFLIP_EVENT_ABI } from './abis/CasinoCoinflip';
import { DICE_EVENT_ABI } from './abis/CasinoDice';
import { HILO_EVENT_ABI } from './abis/CasinoHiLo';

/** Monad testnet chain id. Source of truth: https://docs.monad.xyz */
export const MONAD_TESTNET_CHAIN_ID = 10143;

/** Default RPC for Monad testnet — override with `MONAD_TESTNET_RPC_URL`. */
export const MONAD_TESTNET_DEFAULT_RPC = 'https://testnet-rpc.monad.xyz';

const PLACEHOLDER: Address = '0x000000000000000000000000000000000000dEaD';

/** Loose env-bag — accepts both NodeJS.ProcessEnv and arbitrary test stubs. */
export type EnvBag = Record<string, string | undefined>;

export function resolveChainId(env: EnvBag = process.env): number {
  if (env.SWO_CHAIN_ID) {
    const id = Number(env.SWO_CHAIN_ID);
    if (Number.isFinite(id)) return id;
  }
  return MONAD_TESTNET_CHAIN_ID;
}

export function resolveRpcUrl(env: EnvBag = process.env): string {
  return (
    env.SWO_INDEXER_RPC_URL ??
    env.MONAD_TESTNET_RPC_URL ??
    env.PONDER_RPC_URL_MONAD_TESTNET ??
    MONAD_TESTNET_DEFAULT_RPC
  );
}

export function resolveStartBlock(env: EnvBag = process.env): number {
  if (env.SWO_INDEXER_FROM_BLOCK) {
    const n = Number(env.SWO_INDEXER_FROM_BLOCK);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function resolveCoinflipAddress(env: EnvBag = process.env): Address {
  return (env.SWO_COINFLIP_ADDRESS ??
    env.BUNNYBAGZ_COINFLIP_ADDRESS ??
    PLACEHOLDER) as Address;
}

export function resolveDiceAddress(env: EnvBag = process.env): Address {
  return (env.SWO_DICE_ADDRESS ??
    env.BUNNYBAGZ_DICE_ADDRESS ??
    PLACEHOLDER) as Address;
}

export function resolveHiLoAddress(env: EnvBag = process.env): Address {
  return (env.SWO_HILO_ADDRESS ??
    env.BUNNYBAGZ_HILO_ADDRESS ??
    PLACEHOLDER) as Address;
}

export function resolveBankrollAddress(env: EnvBag = process.env): Address {
  return (env.SWO_BANKROLL_ADDRESS ??
    env.BUNNYBAGZ_BANKROLL_ADDRESS ??
    PLACEHOLDER) as Address;
}

// Plain config object — keeps the file consumable without a Ponder install.
// When Ponder is added, `ponder.schema.ts` + `createConfig` can wrap this
// directly: `export default createConfig(indexerConfig)`.
export const indexerConfig = {
  networks: {
    monadTestnet: {
      chainId: resolveChainId(),
      transport: { kind: 'http' as const, url: resolveRpcUrl() },
    },
  },
  contracts: {
    CasinoCoinflip: {
      network: 'monadTestnet' as const,
      abi: COINFLIP_EVENT_ABI,
      address: resolveCoinflipAddress(),
      startBlock: resolveStartBlock(),
      filter: [
        { event: 'BetPlaced' },
        { event: 'BetSettled' },
        { event: 'BetRefunded' },
      ],
    },
    CasinoDice: {
      network: 'monadTestnet' as const,
      abi: DICE_EVENT_ABI,
      address: resolveDiceAddress(),
      startBlock: resolveStartBlock(),
      filter: [
        { event: 'BetPlaced' },
        { event: 'BetSettled' },
        { event: 'BetRefunded' },
      ],
    },
    CasinoHiLo: {
      network: 'monadTestnet' as const,
      abi: HILO_EVENT_ABI,
      address: resolveHiLoAddress(),
      startBlock: resolveStartBlock(),
      filter: [
        { event: 'SessionOpened' },
        { event: 'StepPlayed' },
        { event: 'SessionCashedOut' },
        { event: 'SessionRefunded' },
        { event: 'SessionPushed' },
      ],
    },
    CasinoBankroll: {
      network: 'monadTestnet' as const,
      abi: BANKROLL_EVENT_ABI,
      address: resolveBankrollAddress(),
      startBlock: resolveStartBlock(),
      filter: [
        { event: 'Deposited' },
        { event: 'Withdrawn' },
        { event: 'GamePayout' },
        { event: 'GameSettled' },
        { event: 'CircuitBreakerTripped' },
        { event: 'CircuitBreakerReset' },
      ],
    },
  },
} as const;

export default indexerConfig;
