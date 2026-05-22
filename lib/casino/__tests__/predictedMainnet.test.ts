/**
 * Regression guard for the Monad-mainnet (143) CREATE3 prediction artifact.
 *
 * `contracts/casino/deployments/143.predicted.json` is the published prediction
 * for the live mainnet addresses the operator WILL get when they broadcast
 * `Deploy.s.sol` with the prod deployer + unchanged default salts.
 *
 * CREATE3 addresses depend only on `(deployer, salt)` and CreateX sits at the
 * same address on every Monad chain, so the predicted mainnet addresses MUST
 * be identical to the live testnet (10143) artifact. If they ever drift,
 * something rotated without re-running the dry-run — this test trips before
 * anyone can ship a stale prediction to docs or to mainnet.
 *
 * Also pins the deployer and salt format so anyone reaching for a new salt
 * value has to update this test in lock-step.
 */

import { describe, it, expect } from 'vitest';

import testnet from '../../../contracts/casino/deployments/10143.json';
import predicted from '../../../contracts/casino/deployments/143.predicted.json';

const PROD_DEPLOYER = '0xb29e6735629539cEd64F0d6f0c476Fe92539fD7B';
const SALT_REGEX = /^0xb29e6735629539ced64f0d6f0c476fe92539fd7b00[0-9a-f]{22}$/;
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

describe('143.predicted.json', () => {
  it('is marked as a non-live prediction for chain 143', () => {
    expect(predicted.status).toBe('predicted');
    expect(predicted.chainId).toBe(143);
  });

  it('uses the production deployer', () => {
    expect(predicted.deployer).toBe(PROD_DEPLOYER);
    expect(testnet.deployer).toBe(PROD_DEPLOYER);
  });

  it('matches the testnet (10143) addresses byte-for-byte', () => {
    expect(predicted.bankroll).toBe(testnet.bankroll);
    expect(predicted.cosmicFlip).toBe(testnet.cosmicFlip);
    expect(predicted.gravityDice).toBe(testnet.gravityDice);
    expect(predicted.constellationClimb).toBe(testnet.constellationClimb);
  });

  it('matches the testnet salts byte-for-byte', () => {
    expect(predicted.bankrollSalt).toBe(testnet.bankrollSalt);
    expect(predicted.cosmicFlipSalt).toBe(testnet.cosmicFlipSalt);
    expect(predicted.gravityDiceSalt).toBe(testnet.gravityDiceSalt);
    expect(predicted.constellationClimbSalt).toBe(testnet.constellationClimbSalt);
  });

  it('encodes salts with the prod-deployer permissioned-deploy prefix', () => {
    expect(predicted.bankrollSalt).toMatch(SALT_REGEX);
    expect(predicted.cosmicFlipSalt).toMatch(SALT_REGEX);
    expect(predicted.gravityDiceSalt).toMatch(SALT_REGEX);
    expect(predicted.constellationClimbSalt).toMatch(SALT_REGEX);
  });

  it('publishes valid 20-byte addresses for every contract', () => {
    expect(predicted.bankroll).toMatch(ADDRESS_REGEX);
    expect(predicted.cosmicFlip).toMatch(ADDRESS_REGEX);
    expect(predicted.gravityDice).toMatch(ADDRESS_REGEX);
    expect(predicted.constellationClimb).toMatch(ADDRESS_REGEX);
  });

  it('references the canonical CreateX singleton', () => {
    expect(predicted.createX).toBe('0xba5Ed099633D3B313e4D5F7bdc1305d3c28ba5Ed');
  });

  it('assigns a distinct address to each contract', () => {
    const addrs = [
      predicted.bankroll,
      predicted.cosmicFlip,
      predicted.gravityDice,
      predicted.constellationClimb,
    ];
    expect(new Set(addrs).size).toBe(addrs.length);
  });
});
