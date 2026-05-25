/**
 * Guards the Monad-mainnet (143) go-live gate in `addresses.ts`.
 *
 * Flipping the casino live on mainnet must be a single env-flag action
 * (`NEXT_PUBLIC_CASINO_MAINNET_LIVE=true`), taken only once mainnet bets have
 * settled — NOT a code change. These tests pin both halves of that contract:
 *
 *  - gate OFF (default): chain 143 is NOT registered, so `getCasinoAddresses`
 *    returns null and the UI stays in its "coming soon" / "not deployed" state
 *    instead of routing real value to an unconfirmed contract;
 *  - gate ON: chain 143 registers with the predicted CREATE3 addresses.
 *
 * The registry is built at module load from the env flag, so each case
 * resets the module graph and re-imports under the desired env.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import testnet from '../../../contracts/casino/deployments/10143.json';
import predicted from '../../../contracts/casino/deployments/143.predicted.json';

const MAINNET = 143;
const ENV_KEY = 'NEXT_PUBLIC_CASINO_MAINNET_LIVE';

const originalEnv = process.env[ENV_KEY];

async function loadFresh() {
  vi.resetModules();
  return import('../addresses');
}

afterEach(() => {
  if (originalEnv === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = originalEnv;
  }
});

describe('casino mainnet live gate (default OFF)', () => {
  beforeEach(() => {
    delete process.env[ENV_KEY];
  });

  it('reports mainnet as not live', async () => {
    const { isCasinoMainnetLive } = await loadFresh();
    expect(isCasinoMainnetLive()).toBe(false);
  });

  it('does not register chain 143 — getCasinoAddresses(143) is null', async () => {
    const { getCasinoAddresses, getSupportedCasinoChainIds } = await loadFresh();
    expect(getCasinoAddresses(MAINNET)).toBeNull();
    expect(getSupportedCasinoChainIds()).not.toContain(MAINNET);
    // testnet stays available regardless of the gate
    expect(getCasinoAddresses(10143)).not.toBeNull();
  });

  it('treats any non-"true" value as off', async () => {
    process.env[ENV_KEY] = 'false';
    const { isCasinoMainnetLive, getCasinoAddresses } = await loadFresh();
    expect(isCasinoMainnetLive()).toBe(false);
    expect(getCasinoAddresses(MAINNET)).toBeNull();
  });
});

describe('casino mainnet live gate (flipped ON)', () => {
  beforeEach(() => {
    process.env[ENV_KEY] = 'true';
  });

  it('reports mainnet as live', async () => {
    const { isCasinoMainnetLive } = await loadFresh();
    expect(isCasinoMainnetLive()).toBe(true);
  });

  it('registers chain 143 with the predicted CREATE3 addresses', async () => {
    const { getCasinoAddresses, getSupportedCasinoChainIds } = await loadFresh();
    const addrs = getCasinoAddresses(MAINNET);
    expect(addrs).not.toBeNull();
    expect(getSupportedCasinoChainIds()).toContain(MAINNET);
    expect(addrs!.chainId).toBe(MAINNET);
    expect(addrs!.cosmicFlip).toBe(predicted.cosmicFlip);
    expect(addrs!.gravityDice).toBe(predicted.gravityDice);
    expect(addrs!.constellationClimb).toBe(predicted.constellationClimb);
    expect(addrs!.bankroll).toBe(predicted.bankroll);
  });
});

describe('MONAD_MAINNET_CASINO constant', () => {
  it('is populated from the predicted artifact regardless of the gate', async () => {
    const { MONAD_MAINNET_CASINO, MONAD_MAINNET_CHAIN_ID } = await loadFresh();
    expect(MONAD_MAINNET_CHAIN_ID).toBe(MAINNET);
    expect(MONAD_MAINNET_CASINO.chainId).toBe(MAINNET);
    expect(MONAD_MAINNET_CASINO.cosmicFlip).toBe(predicted.cosmicFlip);
    expect(MONAD_MAINNET_CASINO.gravityDice).toBe(predicted.gravityDice);
    expect(MONAD_MAINNET_CASINO.constellationClimb).toBe(predicted.constellationClimb);
    // deploy-time circuit-breaker config is identical across Monad chains
    expect(MONAD_MAINNET_CASINO.maxDrawdown24hWei).toBe(
      BigInt(testnet.maxDrawdown24hWei),
    );
  });
});
