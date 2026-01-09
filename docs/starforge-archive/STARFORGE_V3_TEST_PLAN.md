# StarForgeV3 Testing Plan

## Overview
Comprehensive testing plan for StarForgeV3 smart contract security fixes before mainnet deployment.

---

## Unit Tests (Foundry/Hardhat)

### 1. Star Holder Accounting Tests

#### Test: `testStarHolderPrizePoolFunding`
```solidity
// Verify 91% allocated to prize pool for Star Holders
uint256 entryFee = 100 ether;
uint256 expectedPrizePool = 91 ether;
// Commit game as Star Holder
// Reveal with 0x multiplier (lose)
// Assert: tierConfig.prizePool increased by 91 ether
```

#### Test: `testStarHolderBonusPayout`
```solidity
// Verify bonus is paid from pre-funded prize pool
uint256 entryFee = 100 ether;
uint256 multiplier = 200; // 2x
uint256 expectedPayout = (88 ether * 2) + 3 ether; // 179 ether
// Assert: payout == 179 ether
// Assert: prizePool decreased by 179 ether (not more)
```

#### Test: `testStarHolderSolvencyOver1000Games`
```solidity
// Run 1000 games with Star Holders
// Mix of wins and losses at various multipliers
// Assert: contract remains solvent (surplus >= 0)
```

### 2. Jackpot VRF Validation Tests

#### Test: `testJackpotRequiresVRF`
```solidity
// Set vrfEnabled = false
// Commit game (no VRF requested)
// Attempt reveal with full grid (25 stars)
// Expect: JackpotRequiresVRF error
```

#### Test: `testJackpotWithVRF`
```solidity
// Set vrfEnabled = true
// Commit game (VRF requested)
// Fulfill VRF with value that generates full grid
// Reveal with matching grid
// Assert: Jackpot paid correctly
```

#### Test: `testJackpotGridValidation`
```solidity
// Commit with VRF
// Attempt reveal with partial grid (24 stars) but max multiplier
// Expect: InvalidJackpotGrid error
```

### 3. Payout Capping Tests

#### Test: `testPayoutCapAtPrizePool`
```solidity
// Set prize pool to 1000 ether
// Player wins 1200 ether
// Assert: payout == 1000 ether (capped)
// Assert: prizePool == 0 (fully drained)
// Assert: No revert (DoS prevented)
```

#### Test: `testPayoutCapAtMaxPayout`
```solidity
// Set maxPayout to 500 ether
// Player wins 1000 ether
// Assert: payout == 500 ether (capped at max)
```

#### Test: `testNormalPayoutUnaffected`
```solidity
// Prize pool = 10000 ether
// Player wins 100 ether
// Assert: payout == 100 ether (not capped)
```

### 4. Rate Limiting Tests

#### Test: `testRateLimitBasic`
```solidity
// Commit 10 games within 1 minute
// Attempt 11th game
// Expect: RateLimitExceeded error
```

#### Test: `testRateLimitExpiry`
```solidity
// Commit 10 games
// Wait 61 seconds
// Commit 11th game
// Assert: Success (oldest entry expired)
```

#### Test: `testRateLimitStorageEfficiency`
```solidity
// Measure gas cost of 11th game commit
// Assert: Circular buffer reuses slot (no new SSTORE)
```

### 5. Solvency Monitoring Tests

#### Test: `testGetSolvencyStatus`
```solidity
// Fund contract with 10000 ether
// Set prize pool to 5000 ether
// Set jackpot to 2000 ether
// Assert: totalAssets == 10000 ether
// Assert: totalLiabilities == 7000 ether
// Assert: surplus == 3000 ether
```

#### Test: `testSolvencyAfterWin`
```solidity
// Initial surplus = 5000 ether
// Player wins 1000 ether
// Assert: surplus decreased by 1000 ether
```

---

## Integration Tests (Testnet)

### Test Scenario 1: Standard Player Flow
1. Connect wallet to testnet
2. Commit Bronze tier game (45 MON)
3. Wait for VRF fulfillment
4. Reveal game with server seed
5. Verify payout calculation
6. Check solvency status after game

### Test Scenario 2: Star Holder Flow
1. Register Star Skrumpey token IDs
2. Connect wallet with Star NFT
3. Commit game with starTokenId
4. Verify 4% treasury fee (not 7%)
5. Win with 2x multiplier
6. Verify bonus added correctly (88% * 2 + 3% = 179%)
7. Check prize pool decreased by exact payout

### Test Scenario 3: Jackpot Attempt Without VRF
1. Admin sets vrfEnabled = false
2. Player commits game
3. Attempt to reveal with full grid
4. Expect: JackpotRequiresVRF revert
5. Player calls requestRefund after 24 hours
6. Verify full refund received

### Test Scenario 4: Jackpot Win With VRF
1. Seed jackpot pool with 10000 MON
2. Player commits game (VRF enabled)
3. VRF returns value that generates full grid
4. Player reveals with correct grid
5. Verify full jackpot paid
6. Check jackpotPool == 0 after win

### Test Scenario 5: Prize Pool Depletion
1. Set prize pool to 1000 MON
2. Player wins 1500 MON (calculated payout)
3. Verify payout capped at 1000 MON
4. Verify no revert (DoS prevented)
5. Admin funds prize pool to restore

### Test Scenario 6: Rate Limiting
1. Single wallet commits 10 games rapidly
2. Attempt 11th game within 1 minute
3. Expect: RateLimitExceeded revert
4. Wait 61 seconds
5. Commit game successfully

### Test Scenario 7: Force Reveal Flow
1. Player commits game with VRF
2. VRF fulfills but player doesn't reveal
3. Wait 1 hour after fulfillment
4. Call forceReveal
5. Verify full refund received
6. Check totalPendingEntryFees decreased

---

## Stress Tests

### Stress Test 1: 1000 Games Simulation
```javascript
// Mix of:
// - 70% losses (0x multiplier)
// - 20% small wins (1-3x)
// - 8% medium wins (4-6x)
// - 2% big wins (7-10x)
// - 50% Star Holders, 50% standard players

for (let i = 0; i < 1000; i++) {
  // Commit game
  // Fulfill VRF
  // Reveal with outcome
  // Record solvency after each game
}

// Assert:
// - Contract remains solvent throughout
// - Prize pool never goes negative
// - No unexpected reverts
```

### Stress Test 2: Concurrent Jackpot Attempts
```javascript
// 10 players simultaneously attempt jackpot
// Only 1 should succeed (first reveal)
// Others should get InsufficientJackpotPool

// Verify:
// - No double payout
// - Jackpot pool == 0 after winner
// - Other players refunded correctly
```

### Stress Test 3: Prize Pool Recovery
```javascript
// Drain prize pool to 0 via wins
// Continue playing (new games fund pool)
// Verify pool recovers over time
// Track house edge accumulation
```

---

## Security Audit Focus Areas

### 1. Economic Model Validation
- Verify house edge math (4% for Stars, 7% for standard)
- Confirm RTP calculations (91% + 5% = 96% for Stars)
- Validate long-term solvency under various scenarios
- Check edge cases (all Stars vs all standard players)

### 2. VRF Integration Security
- Review VRF coordinator callback security
- Verify grid generation from VRF randomness
- Check for VRF manipulation vectors
- Validate fulfill randomness access control

### 3. Reentrancy Vectors
- External calls to daoTreasury
- External calls to player (payout transfer)
- Verify nonReentrant modifier on critical functions
- Check state changes before external calls

### 4. Access Control
- Admin functions properly gated
- VRF_ROLE correctly assigned
- OPERATOR_ROLE permissions appropriate
- Emergency withdrawal timelock functioning

### 5. Integer Overflow/Underflow
- Prize pool arithmetic
- Payout calculations
- Rate limit timestamp handling
- Basis point calculations

### 6. DoS Vectors
- Rate limiting effectiveness
- Prize pool depletion handling
- Failed treasury transfers
- VRF timeout handling

---

## Pre-Mainnet Checklist

### Contract Validation
- [ ] All unit tests pass (100% coverage on critical paths)
- [ ] Integration tests pass on testnet
- [ ] Stress tests complete without issues
- [ ] Gas optimization verified (rate limiting)
- [ ] Contract size under limit (14,797 bytes ✅)

### Configuration Validation
- [ ] Entry fees correct (45/225/450 MON)
- [ ] Max payouts set appropriately
- [ ] Min treasury requirements funded
- [ ] VRF Coordinator address verified
- [ ] DAO Treasury address set
- [ ] Star token IDs registered

### Security Validation
- [ ] Professional audit completed
- [ ] All critical findings resolved
- [ ] Solvency monitoring active
- [ ] Emergency procedures documented
- [ ] Multisig for admin role (recommended)

### Operational Readiness
- [ ] Prize pools funded (above min requirements)
- [ ] Jackpots seeded (optional but recommended)
- [ ] Tiers activated
- [ ] VRF enabled and tested
- [ ] Frontend updated (no getStarTokens calls)
- [ ] Indexer deployed (The Graph/Goldsky)
- [ ] Monitoring alerts configured
- [ ] Emergency contact list prepared

### Documentation
- [ ] Contract documentation complete
- [ ] Security fixes documented
- [ ] Operator manual created
- [ ] Player FAQ prepared
- [ ] Emergency procedures documented

---

## Monitoring Post-Launch

### Real-Time Alerts
1. **Solvency Monitor**
   - Alert if surplus < 10% of liabilities
   - Critical alert if surplus < 0 (insolvent)

2. **Prize Pool Monitor**
   - Alert if any tier pool < 50% of min requirement
   - Warning if pool < 80% of min requirement

3. **Jackpot Monitor**
   - Alert on jackpot win
   - Track jackpot accumulation rate

4. **VRF Monitor**
   - Alert on VRF request failure
   - Alert if fulfillment timeout exceeded
   - Track fulfillment latency

5. **Rate Limit Monitor**
   - Track rate limit hits
   - Alert on potential bot activity

### Daily Checks
- Review solvency status
- Check prize pool levels
- Verify jackpot accumulation
- Review game statistics
- Check for failed treasury transfers
- Monitor accumulated fees

### Weekly Reviews
- Analyze win/loss ratios
- Validate house edge performance
- Review Star Holder vs standard ratios
- Check for unusual patterns
- Verify contract upgrades (if proxy)

---

## Emergency Response Procedures

### Scenario 1: Insolvency Detected
1. Call `pause()` immediately
2. Check `getSolvencyStatus()`
3. Identify deficit amount
4. Call `fundTreasury()` for affected tier
5. Verify solvency restored
6. Call `unpause()`
7. Post-mortem analysis

### Scenario 2: VRF Coordinator Failure
1. Users wait for REVEAL_TIMEOUT (1 hour)
2. Users can call `forceReveal()` for full refund
3. Admin updates VRF coordinator via `setVRFCoordinator()`
4. Test new coordinator
5. Resume operations

### Scenario 3: Treasury Transfer Failures
1. Fees accumulate in `accumulatedTreasuryFees`
2. Admin updates treasury address via `setDaoTreasury()`
3. Admin calls `withdrawAccumulatedFees()`
4. Verify transfer succeeds

### Scenario 4: Prize Pool Drain
1. Monitor alerts trigger at 50% min requirement
2. Admin prepares funding
3. Call `fundTreasury()` before pool reaches 0
4. If pool reaches 0, payouts auto-cap (no DoS)
5. Fund pool ASAP to restore normal operations

---

## Test Execution Log Template

```markdown
## Test Session: [Date]
**Tester**: [Name]
**Network**: [Monad Testnet/Mainnet]
**Contract**: StarForgeV3 @ [Address]

### Tests Executed
- [ ] Star Holder accounting (10 games)
- [ ] Jackpot VRF requirement
- [ ] Payout capping
- [ ] Rate limiting
- [ ] Solvency monitoring
- [ ] Force reveal flow

### Results
[Pass/Fail for each test]

### Issues Found
[List any issues]

### Gas Costs
- Commit game: [gas]
- Reveal game: [gas]
- Force reveal: [gas]

### Solvency Status
- Start: [surplus]
- End: [surplus]
- Change: [delta]

### Notes
[Any observations]
```

---

**Version**: 1.0  
**Date**: January 8, 2026  
**Status**: Ready for execution
