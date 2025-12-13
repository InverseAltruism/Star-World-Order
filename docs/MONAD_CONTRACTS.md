# Monad Chain Contract Configuration Guide

This document outlines the contract configuration for the Monad chain and provides guidance for adding future contracts.

## Current Contracts

### Multicall3
- **Address**: `0xcA11bde05977b3631167028862bE2a173976CA11`
- **Purpose**: Batched RPC calls to prevent rate limiting
- **Status**: ✅ Configured
- **Usage**: Used by `lib/starSkrumpey.ts` for efficient Star Skrumpey ownership verification

```typescript
contracts: {
  multicall3: {
    address: '0xcA11bde05977b3631167028862bE2a173976CA11',
    // Multicall3 deployed at canonical address on Monad mainnet
    // Used for batched RPC calls to prevent rate limiting
  },
}
```

## Future Contract Considerations

When deploying additional contracts for governance, staking, or other DAO features, they can be added to the `contracts` object in `lib/wagmi.ts`.

### Adding Custom Contracts

Custom contracts (non-standard viem contracts) can be added with any key name:

```typescript
contracts: {
  multicall3: {
    address: '0xcA11bde05977b3631167028862bE2a173976CA11',
  },
  // Future governance contract
  starGovernance: {
    address: '0x...', // Deployed contract address
    blockCreated: 1234567, // Optional: block number when deployed
  },
  // Future staking contract
  starStaking: {
    address: '0x...', // Deployed contract address
    blockCreated: 1234567,
  },
}
```

### Standard viem Contracts

Viem recognizes these standard contract keys (if applicable to Monad):

- `ensRegistry` - Ethereum Name Service registry (typically Ethereum mainnet only)
- `ensUniversalResolver` - ENS universal resolver (typically Ethereum mainnet only)
- `multicall3` - ✅ Configured
- `erc6492Verifier` - EIP-6492 signature verifier (add if needed)

### Best Practices

1. **Canonical Addresses**: When possible, use canonical contract addresses that are consistent across chains
2. **Block Numbers**: Include `blockCreated` for event indexing efficiency
3. **Comments**: Add clear comments explaining each contract's purpose
4. **Documentation**: Update this file when adding new contracts

## Resources

- [Monad Documentation](https://docs.monad.xyz/)
- [Viem Chain Configuration](https://viem.sh/docs/clients/chains.html)
- [Multicall3 Info](https://www.multicall3.com/)

## Contract Deployment Checklist

When deploying new contracts to Monad:

- [ ] Deploy contract to Monad mainnet
- [ ] Verify contract on Monadscan
- [ ] Note the deployment block number
- [ ] Add contract to `lib/wagmi.ts` contracts configuration
- [ ] Update this documentation
- [ ] Create TypeScript interface for contract ABI
- [ ] Add contract constants to relevant library files
- [ ] Test contract integration
- [ ] Update RPC_OPTIMIZATION.md if the contract uses batched calls
