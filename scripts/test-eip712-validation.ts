/**
 * Test script for EIP-712 validation functions
 * 
 * This script validates that:
 * 1. Choice validation works correctly
 * 2. Proposal ID validation accepts valid formats
 * 3. Address validation and normalization works
 * 4. EIP-712 typed data construction is correct
 * 
 * Run with: npx tsx scripts/test-eip712-validation.ts
 */

import {
  validateChoice,
  validateProposalId,
  normalizeAddress,
  validateAddress,
  constructVoteTypedData,
  getEIP712Domain,
  VALID_CHOICES,
} from '../lib/voteSignature';

// Test colors
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function log(message: string, color: string = RESET) {
  console.log(`${color}${message}${RESET}`);
}

function assert(condition: boolean, message: string) {
  if (condition) {
    log(`✓ ${message}`, GREEN);
  } else {
    log(`✗ ${message}`, RED);
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('\n=== EIP-712 Validation Tests ===\n');

// Test 1: Choice Validation
log('Test 1: Choice Validation', YELLOW);
assert(validateChoice(0), 'validateChoice(0) should return true');
assert(validateChoice(1), 'validateChoice(1) should return true');
assert(validateChoice(2), 'validateChoice(2) should return true');
assert(!validateChoice(3), 'validateChoice(3) should return false');
assert(!validateChoice(-1), 'validateChoice(-1) should return false');
assert(!validateChoice('yes' as any), 'validateChoice("yes") should return false');
log('');

// Test 2: Proposal ID Validation
log('Test 2: Proposal ID Validation', YELLOW);
assert(validateProposalId('SWO-001'), 'SWO-001 should be valid');
assert(validateProposalId('SWO-123'), 'SWO-123 should be valid');
assert(validateProposalId('SWO-9999'), 'SWO-9999 should be valid');
assert(
  validateProposalId('550e8400-e29b-41d4-a716-446655440000'),
  'UUID format should be valid'
);
assert(!validateProposalId('SWO-1'), 'SWO-1 should be invalid (too short)');
assert(!validateProposalId('SWO-XX'), 'SWO-XX should be invalid (not a number)');
assert(!validateProposalId('invalid-id'), 'invalid-id should be invalid');
assert(!validateProposalId(''), 'Empty string should be invalid');
log('');

// Test 3: Address Validation
log('Test 3: Address Validation', YELLOW);
const validAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
const invalidAddress = '0xinvalid';

const normalized = normalizeAddress(validAddress);
assert(normalized !== null, 'Valid address should normalize');
assert(normalized === validAddress.toLowerCase(), 'Address should be lowercase');
assert(normalizeAddress(invalidAddress) === null, 'Invalid address should return null');

try {
  validateAddress(validAddress);
  log('✓ validateAddress() accepts valid address', GREEN);
} catch (e) {
  log('✗ validateAddress() should accept valid address', RED);
  throw e;
}

try {
  validateAddress(invalidAddress);
  log('✗ validateAddress() should throw on invalid address', RED);
  throw new Error('Expected validateAddress to throw');
} catch (e) {
  if ((e as Error).message.includes('Invalid Ethereum address')) {
    log('✓ validateAddress() throws on invalid address', GREEN);
  } else {
    throw e;
  }
}
log('');

// Test 4: EIP-712 Domain
log('Test 4: EIP-712 Domain', YELLOW);
const domain = getEIP712Domain(143);
assert(domain.name === 'Star World Order DAO', 'Domain name should be correct');
assert(domain.version === '1', 'Domain version should be 1');
assert(domain.chainId === BigInt(143), 'ChainId should be 143 (Monad mainnet)');
assert(
  domain.verifyingContract === '0x0000000000000000000000000000000000000001',
  'Verifying contract should be sentinel address'
);
log('');

// Test 5: Typed Data Construction
log('Test 5: EIP-712 Typed Data Construction', YELLOW);
const proposalId = 'SWO-123';
const choice = 1; // Yes
const voter = validAddress;
const nonce = 'test-nonce-12345';
const snapshotBlock = 1000;

try {
  const typedData = constructVoteTypedData(
    proposalId,
    choice,
    voter,
    nonce,
    snapshotBlock,
    143
  );

  assert(typedData.proposalId === proposalId, 'Proposal ID should match');
  assert(typedData.choice === choice, 'Choice should match');
  assert(typedData.voter.toLowerCase() === voter.toLowerCase(), 'Voter should match');
  assert(typedData.snapshotBlock === BigInt(snapshotBlock), 'Snapshot block should match');
  assert(typedData.nonce === nonce, 'Nonce should match');
  assert(typeof typedData.deadline === 'bigint', 'Deadline should be bigint');
  assert(typedData.deadline > BigInt(Math.floor(Date.now() / 1000)), 'Deadline should be in future');

  log('✓ EIP-712 typed data constructed correctly', GREEN);
} catch (e) {
  log(`✗ Failed to construct typed data: ${(e as Error).message}`, RED);
  throw e;
}
log('');

// Test 6: Invalid Input Rejection
log('Test 6: Invalid Input Rejection', YELLOW);

try {
  constructVoteTypedData('invalid-id', 1, voter, nonce, snapshotBlock);
  log('✗ Should reject invalid proposal ID', RED);
  throw new Error('Expected error for invalid proposal ID');
} catch (e) {
  if ((e as Error).message.includes('Invalid proposal ID')) {
    log('✓ Rejects invalid proposal ID', GREEN);
  } else {
    throw e;
  }
}

try {
  constructVoteTypedData(proposalId, 3 as any, voter, nonce, snapshotBlock);
  log('✗ Should reject invalid choice', RED);
  throw new Error('Expected error for invalid choice');
} catch (e) {
  if ((e as Error).message.includes('Invalid vote choice')) {
    log('✓ Rejects invalid choice', GREEN);
  } else {
    throw e;
  }
}

try {
  constructVoteTypedData(proposalId, 1, 'invalid-address', nonce, snapshotBlock);
  log('✗ Should reject invalid address', RED);
  throw new Error('Expected error for invalid address');
} catch (e) {
  if ((e as Error).message.includes('Invalid Ethereum address')) {
    log('✓ Rejects invalid address', GREEN);
  } else {
    throw e;
  }
}
log('');

// Summary
log('=== All Tests Passed! ===', GREEN);
console.log('\nValidation Summary:');
console.log('✓ Choice validation: 0, 1, 2 accepted; others rejected');
console.log('✓ Proposal ID validation: SWO-XXX and UUID formats accepted');
console.log('✓ Address validation: Valid ETH addresses normalized to lowercase');
console.log('✓ EIP-712 domain configured correctly');
console.log('✓ Typed data construction works with valid inputs');
console.log('✓ Invalid inputs are properly rejected\n');

process.exit(0);
