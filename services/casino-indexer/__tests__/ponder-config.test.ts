// Smoke tests for ponder.config.ts — pins the Monad testnet retarget.
//
// Acceptance bullet (b) requires `ponder dev` to index against Monad
// testnet (chainId 10143). These tests pin the chain id + RPC defaults so
// a regression that quietly retargets the indexer fails CI.

import { describe, expect, test } from 'vitest';

import indexerConfig, {
  MONAD_TESTNET_CHAIN_ID,
  MONAD_TESTNET_DEFAULT_RPC,
  resolveBankrollAddress,
  resolveChainId,
  resolveRpcUrl,
  resolveStartBlock,
} from '../ponder.config';

describe('ponder.config (Monad testnet retarget)', () => {
  test('Monad testnet chain id is 10143', () => {
    expect(MONAD_TESTNET_CHAIN_ID).toBe(10143);
  });

  test('default chain id falls through to Monad testnet', () => {
    expect(resolveChainId({})).toBe(10143);
  });

  test('SWO_CHAIN_ID env override wins', () => {
    expect(resolveChainId({ SWO_CHAIN_ID: '31337' })).toBe(31337);
  });

  test('default RPC is the Monad testnet endpoint', () => {
    expect(resolveRpcUrl({})).toBe(MONAD_TESTNET_DEFAULT_RPC);
  });

  test('RPC env overrides cascade in priority order', () => {
    expect(
      resolveRpcUrl({ MONAD_TESTNET_RPC_URL: 'https://mon.example/rpc' }),
    ).toBe('https://mon.example/rpc');
    expect(
      resolveRpcUrl({
        SWO_INDEXER_RPC_URL: 'https://swo.example/rpc',
        MONAD_TESTNET_RPC_URL: 'https://mon.example/rpc',
      }),
    ).toBe('https://swo.example/rpc');
  });

  test('startBlock defaults to 0 and accepts override', () => {
    expect(resolveStartBlock({})).toBe(0);
    expect(resolveStartBlock({ SWO_INDEXER_FROM_BLOCK: '1234' })).toBe(1234);
  });

  test('config exposes the four casino contracts on monadTestnet', () => {
    expect(Object.keys(indexerConfig.networks)).toEqual(['monadTestnet']);
    expect(indexerConfig.networks.monadTestnet.chainId).toBe(10143);
    expect(Object.keys(indexerConfig.contracts).sort()).toEqual([
      'CasinoBankroll',
      'CasinoCoinflip',
      'CasinoDice',
      'CasinoHiLo',
    ]);
    for (const c of Object.values(indexerConfig.contracts)) {
      expect(c.network).toBe('monadTestnet');
    }
  });

  test('bankroll address falls through to placeholder and accepts overrides', () => {
    expect(resolveBankrollAddress({})).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(
      resolveBankrollAddress({
        SWO_BANKROLL_ADDRESS: '0x000000000000000000000000000000000000bA17',
      }),
    ).toBe('0x000000000000000000000000000000000000bA17');
    expect(
      resolveBankrollAddress({
        BUNNYBAGZ_BANKROLL_ADDRESS:
          '0x000000000000000000000000000000000000bB18',
      }),
    ).toBe('0x000000000000000000000000000000000000bB18');
  });
});
