# EIP-712 Migration Guide

## Overview

This document describes the migration from EIP-191 (personal_sign) to EIP-712 (signTypedData) for vote signatures in the Star World Order DAO governance system.

## Table of Contents

1. [Why EIP-712?](#why-eip-712)
2. [What Changed](#what-changed)
3. [Security Improvements](#security-improvements)
4. [Implementation Details](#implementation-details)
5. [Migration Strategy](#migration-strategy)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)

---

## Why EIP-712?

### Problems with EIP-191

While EIP-191 (personal_sign) is safe, it has limitations:

1. **No Cryptographic Domain Separation**: The domain text `starworldorder.com` in the message is just text. A malicious site can craft the exact same message.

2. **Poor Wallet UX**: Users see a long text message they must read carefully to understand what they're signing.

3. **No ChainId Enforcement**: While we include chainId in the message text, it's not enforced by the wallet.

### Benefits of EIP-712

1. **Cryptographic Domain Separation**: The domain is part of the signature algorithm, enforced by the wallet.

2. **Structured Wallet Display**: Wallets show clear, structured fields:
   ```
   Domain: Star World Order DAO
   Chain: Monad (143)
   
   Vote:
     proposalId: "SWO-042"
     choice: 1 (Yes)
     voter: 0x1234...
     snapshotBlock: 12345678
     deadline: 1704567890
   ```

3. **ChainId Protection**: Chain replay attacks are cryptographically prevented.

4. **Industry Standard**: Used by Snapshot, Uniswap, OpenSea, and all major DeFi protocols.

---

## What Changed

### EIP-712 Domain Definition

```typescript
{
  name: 'Star World Order DAO',
  version: '1',
  chainId: 143, // Monad Mainnet (or 10143 for testnet)
  verifyingContract: '0x0000000000000000000000000000000000000001' // Sentinel for off-chain voting
}
```

### Vote Type Definition

```typescript
{
  Vote: [
    { name: 'proposalId', type: 'string' },
    { name: 'choice', type: 'uint8' },  // 0=No, 1=Yes, 2=Abstain
    { name: 'voter', type: 'address' },
    { name: 'snapshotBlock', type: 'uint256' },
    { name: 'nonce', type: 'string' },
    { name: 'deadline', type: 'uint256' }
  ]
}
```

### Client-Side Signing

**Before (EIP-191):**
```typescript
import { useSignMessage } from 'wagmi';

const { signMessageAsync } = useSignMessage();

const signature = await signMessageAsync({
  message: voteMessage, // Long text string
});
```

**After (EIP-712):**
```typescript
import { useSignTypedData } from 'wagmi';

const { signTypedDataAsync } = useSignTypedData();

const signature = await signTypedDataAsync({
  domain: {
    name: 'Star World Order DAO',
    version: '1',
    chainId: 143,
    verifyingContract: '0x0000000000000000000000000000000000000001',
  },
  types: {
    Vote: [
      { name: 'proposalId', type: 'string' },
      { name: 'choice', type: 'uint8' },
      { name: 'voter', type: 'address' },
      { name: 'snapshotBlock', type: 'uint256' },
      { name: 'nonce', type: 'string' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  primaryType: 'Vote',
  message: {
    proposalId: 'SWO-123',
    choice: 1,
    voter: '0x...',
    snapshotBlock: 1000n,
    nonce: 'server-nonce',
    deadline: 1704567890n,
  },
});
```

### Server-Side Verification

**Before:**
```typescript
import { verifyMessage } from 'viem';

const isValid = await verifyMessage({
  address: voterAddress,
  message: reconstructedMessage,
  signature,
});
```

**After:**
```typescript
import { verifyTypedData } from 'viem';

const isValid = await verifyTypedData({
  address: voterAddress,
  domain: EIP712_DOMAIN,
  types: EIP712_TYPES,
  primaryType: 'Vote',
  message: reconstructedTypedData,
  signature,
});
```

---

## Security Improvements

### 1. Cryptographic Domain Separation

**Problem**: With EIP-191, any site can create a message with `Domain: starworldorder.com` in the text.

**Solution**: With EIP-712, the domain is part of the hash algorithm:
```typescript
hashTypedData({
  domain: { name: 'Star World Order DAO', chainId: 143, ... },
  // ...
})
```

A different domain produces a completely different hash, even with identical message content.

### 2. ChainId Enforcement

**Problem**: EIP-191 messages could theoretically be replayed on different chains.

**Solution**: EIP-712 includes chainId in the signature:
```typescript
domain: {
  chainId: 143, // Monad Mainnet
}
```

The same signature is invalid on a different chain (e.g., chainId 10143 testnet).

### 3. Strict Input Validation

All inputs are validated before processing:

```typescript
// Choice validation
function validateChoice(choice: number): boolean {
  return [0, 1, 2].includes(choice);
}

// Proposal ID validation
function validateProposalId(id: string): boolean {
  return /^(SWO-\d{3,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(id);
}

// Address validation
function normalizeAddress(address: string): string | null {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  return address.toLowerCase();
}
```

### 4. Version Tracking

Database tracks which signature version was used:

```sql
ALTER TABLE governance_votes ADD COLUMN signature_version TEXT DEFAULT 'eip191';
ALTER TABLE governance_votes ADD COLUMN signature_typed_data TEXT;
```

This allows safe schema evolution and backward compatibility.

---

## Implementation Details

### Files Modified

1. **lib/voteSignature.ts** - Core EIP-712 implementation
   - Added EIP-712 domain and type definitions
   - Added `constructVoteTypedData()` function
   - Added `verifyEIP712VoteSignature()` function
   - Added strict validation functions
   - Kept EIP-191 functions for backward compatibility

2. **lib/db.ts** - Database schema
   - Added `signature_version` column
   - Added `signature_typed_data` column
   - Updated `castGovernanceVote()` to handle both formats

3. **app/api/governance/route.ts** - Server-side API
   - Added strict input validation
   - Added EIP-712 signature verification
   - Added chainId verification
   - Kept EIP-191 verification for existing votes

4. **app/dao/DAOContent.tsx** - Client-side UI
   - Replaced `useSignMessage` with `useSignTypedData`
   - Updated vote submission to use EIP-712

5. **lib/hooks/useGovernance.ts** - React hook
   - Updated vote function signature to support both formats

### Key Functions

#### `createEIP712VoteSignatureRequest()`

Creates the EIP-712 typed data for client-side signing:

```typescript
export function createEIP712VoteSignatureRequest(
  proposalId: string,
  choice: VoteChoice | number,
  voterAddress: string,
  nonce: string,
  snapshotBlock: number,
  chainId: number = 143
): {
  domain: TypedDataDomain;
  types: typeof EIP712_VOTE_TYPES;
  primaryType: 'Vote';
  message: VoteTypedData;
  nonce: string;
}
```

#### `verifyEIP712VoteSignature()`

Verifies an EIP-712 signature on the server:

```typescript
export async function verifyEIP712VoteSignature(
  voterAddress: string,
  voteData: VoteTypedData,
  signature: `0x${string}`,
  chainId: number = 143
): Promise<boolean>
```

#### `verifyVoteSignatureComprehensive()`

Comprehensive verification supporting both EIP-712 and EIP-191:

```typescript
export async function verifyVoteSignatureComprehensive(
  voterAddress: string,
  proposalId: string,
  choice: number,
  signatureData: {
    signature: string;
    version: 'eip712' | 'eip191';
    nonce: string;
    snapshotBlock: number;
    chainId?: number;
    typedData?: VoteTypedData; // EIP-712
    message?: string; // EIP-191
  }
): Promise<{ valid: boolean; error?: string }>
```

---

## Migration Strategy

### Phase 1: Deploy EIP-712 (Current)

1. ✅ EIP-712 is the new default for all new votes
2. ✅ EIP-191 verification maintained for existing votes
3. ✅ Database tracks which version each vote used

### Phase 2: Monitor (Next 1-2 months)

1. Monitor for any EIP-712 signing issues
2. Collect feedback on wallet UX
3. Verify all wallets properly support EIP-712

### Phase 3: Full Cutover (Future)

1. After sufficient testing, deprecate EIP-191 for new votes
2. Keep EIP-191 verification for historical votes
3. Display "Legacy" badge on old EIP-191 votes

### Backward Compatibility

```typescript
// Database query returns signature_version
const vote = {
  signature: '0x...',
  signature_version: 'eip191', // or 'eip712'
  signature_message: '...', // Only for eip191
  signature_typed_data: '...', // Only for eip712
};

// Verification routes based on version
if (vote.signature_version === 'eip712') {
  await verifyEIP712VoteSignature(...);
} else {
  await verifyVoteSignature(...); // EIP-191
}
```

---

## Testing

### Validation Test Suite

Run the validation tests:

```bash
npx tsx scripts/test-eip712-validation.ts
```

Tests cover:
- ✅ Choice validation (0, 1, 2 accepted; others rejected)
- ✅ Proposal ID validation (SWO-XXX and UUID formats)
- ✅ Address validation (format and normalization)
- ✅ EIP-712 domain configuration
- ✅ Typed data construction
- ✅ Invalid input rejection

### Manual Testing Checklist

- [ ] Vote on a proposal with MetaMask
- [ ] Verify wallet shows structured EIP-712 data
- [ ] Verify vote is recorded with `signature_version='eip712'`
- [ ] Verify signature can be verified server-side
- [ ] Test on both mainnet (chainId 143) and testnet (chainId 10143)
- [ ] Verify old EIP-191 votes still display correctly
- [ ] Test vote changing (24-hour window)
- [ ] Test rejection of invalid choices (not 0, 1, or 2)
- [ ] Test rejection of invalid proposal IDs
- [ ] Test rejection of invalid addresses

### Integration Testing

1. **Create a Test Proposal**:
   ```typescript
   const proposal = await createGovernanceProposal({
     title: 'EIP-712 Test Proposal',
     description: 'Testing new signature format',
     proposerAddress: '0x...',
     votingDurationWeeks: 1,
     category: 'technical',
   });
   ```

2. **Vote with EIP-712**:
   - Connect wallet
   - Click vote button
   - Verify wallet shows structured data
   - Sign and submit

3. **Verify Signature**:
   ```bash
   # Check database
   sqlite3 data/swo.db "SELECT signature_version, signature_typed_data FROM governance_votes WHERE proposal_id = 'SWO-XXX';"
   ```

---

## Troubleshooting

### "User rejected signature"

**Cause**: User cancelled the signature request in their wallet.

**Solution**: This is normal behavior. The vote was not recorded.

### "Invalid signature"

**Causes**:
1. Wrong chainId used
2. Nonce expired (10-minute window)
3. Message/typed data doesn't match server reconstruction

**Solutions**:
1. Verify `NEXT_PUBLIC_MONAD_CHAIN_ID` matches network
2. Request new nonce if session expired
3. Check server logs for mismatch details

### "Invalid choice value"

**Cause**: Client sent a choice value other than 0, 1, or 2.

**Solution**: Update client code to only send valid choices.

### Wallet doesn't show structured data

**Causes**:
1. Wallet doesn't support EIP-712 (very rare)
2. Wrong data format sent to wallet

**Solutions**:
1. Update wallet to latest version
2. Check browser console for errors
3. Fall back to EIP-191 if needed

### ChainId mismatch

**Cause**: Signing with wrong network selected in wallet.

**Solution**: Switch wallet to correct network:
- Mainnet: ChainId 143
- Testnet: ChainId 10143

---

## References

- [EIP-712 Specification](https://eips.ethereum.org/EIPS/eip-712)
- [Viem signTypedData](https://viem.sh/docs/actions/wallet/signTypedData)
- [Viem verifyTypedData](https://viem.sh/docs/utilities/verifyTypedData)
- [Wagmi useSignTypedData](https://wagmi.sh/react/hooks/useSignTypedData)
- [Original Security Review](SECURITY_FIX_SUMMARY.md)

---

## Questions?

For questions or issues with the EIP-712 migration:

1. Check this documentation
2. Run validation tests
3. Check server logs for detailed error messages
4. Review the implementation in `lib/voteSignature.ts`

---

**Last Updated**: January 6, 2026
**Version**: 1.0.0
