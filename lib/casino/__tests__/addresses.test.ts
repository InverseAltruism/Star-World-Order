/**
 * Anchor test for the casino vitest project — proves the project is wired up
 * and the address registry returns `null` for unknown chains.
 */

import { describe, it, expect } from 'vitest';
import {
  getCasinoAddresses,
  getSupportedCasinoChainIds,
} from '../addresses';

describe('getCasinoAddresses', () => {
  it('returns null for unknown chain', () => {
    expect(getCasinoAddresses(1)).toBeNull();
    expect(getCasinoAddresses(0)).toBeNull();
    expect(getCasinoAddresses(999_999)).toBeNull();
  });

  it('returns Monad Testnet (10143) deployment', () => {
    const addrs = getCasinoAddresses(10143);
    expect(addrs).not.toBeNull();
    expect(addrs!.chainId).toBe(10143);
    expect(addrs!.bankroll).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(addrs!.cosmicFlip).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(addrs!.gravityDice).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(addrs!.constellationClimb).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('exposes the supported chain id list', () => {
    const ids = getSupportedCasinoChainIds();
    expect(ids).toContain(10143);
    expect(ids.every((id) => Number.isInteger(id))).toBe(true);
  });
});
