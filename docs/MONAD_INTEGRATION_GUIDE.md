# StarForgeV3 Monad Integration & Testing Guide

This guide details the step-by-step process for deploying `StarForgeV3` to Monad (Testnet/Mainnet), integrating VRF, and performing end-to-end validation.

## 1. Environment Setup

### Prerequisites
- **Node.js** v18+
- **Hardhat** or **Foundry**
- **Wallet** with MON (Monad native token)
- **RPC URL**: `https://testnet-rpc.monad.xyz` (Example - check official docs for latest)

### Configuration
Ensure your `hardhat.config.ts` or `foundry.toml` is configured for Monad.

```typescript
// hardhat.config.ts
const config: HardhatUserConfig = {
  networks: {
    monad: {
      url: "https://testnet-rpc.monad.xyz", // Replace with official RPC
      chainId: 143, // Replace with official Chain ID
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};
```

## 2. VRF Integration (Gelato vs Chainlink)

The `StarForgeV3` contract uses a generic `IVRFCoordinator` interface. You must deploy an adapter or use a provider that matches this signature.

### Option A: Gelato VRF (Recommended for Speed/UX)
Gelato VRF provides fast, reliable randomness which is crucial for the "instant" feel of the game.

1.  **Install Gelato SDK**:
    ```bash
    npm install @gelatonetwork/vrf-contracts
    ```

2.  **Deploy Adapter**:
    Since `StarForgeV3` expects `requestRandomness(bytes)`, and Gelato uses `requestRandomness(uint256, bool)`, you may need a small adapter or update the interface.
    
    *Recommendation*: Update `StarForgeV3` to use Gelato's interface directly or deploy this adapter:

    ```solidity
    // VRFAdapter.sol
    contract VRFAdapter is IVRFCoordinator {
        IGelatoVRF public immutable gelatoVRF;
        address public operator;
        
        constructor(address _gelato) {
            gelatoVRF = IGelatoVRF(_gelato);
            operator = msg.sender;
        }

        function requestRandomness(bytes memory data) external returns (uint256) {
            require(msg.sender == operator, "Only operator");
            // Decode data or generate salt
            uint256 salt = uint256(keccak256(data)); 
            // Request randomness
            gelatoVRF.requestRandomness(salt);
            // Return 0 or a request ID if Gelato provides one immediately
            return uint256(keccak256(abi.encode(salt))); 
        }
        
        // Callback handling...
    }
    ```

### Option B: Chainlink VRF
If Chainlink is live on Monad, it offers robust security.

1.  **Create Subscription**: Go to VRF Manager, create subscription, fund with LINK.
2.  **Deploy Adapter**: Similar to Gelato, map the `requestRandomness` call to `requestRandomWords`.

## 3. Deployment Checklist

1.  **Deploy Mock VRF (Testnet only)**:
    If real VRF isn't available, deploy a mock coordinator that auto-fulfills requests.
    
2.  **Deploy StarForgeV3**:
    ```bash
    npx hardhat run scripts/deploy_starforge.ts --network monad
    ```

3.  **Configuration**:
    - `setDaoTreasury(treasuryAddress)`
    - `setVRFCoordinator(vrfAddress)`
    - `registerStarSkrumpeys([ids...], true)`
    - `fundTreasury(0)` (Bronze)
    - `fundTreasury(1)` (Silver)
    - `fundTreasury(2)` (Gold)
    - `seedJackpot(0)`...
    - `setVRFEnabled(true)`
    - `setTierStatus(0, true, false)`...

## 4. End-to-End Testing Script

Use this script to verify the full game loop on Testnet.

```typescript
// scripts/e2e_test.ts
import { ethers } from "hardhat";

async function main() {
  const [player] = await ethers.getSigners();
  const starforge = await ethers.getContractAt("StarForgeV3", "DEPLOYED_ADDRESS");
  
  console.log("1. Committing Game...");
  const serverSeed = ethers.utils.randomBytes(32);
  const serverSeedHash = ethers.utils.keccak256(
    ethers.utils.solidityPack(["bytes32", "bytes32"], [
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes("STARFORGE_V3")), 
      serverSeed
    ])
  );
  
  const tx = await starforge.commitGame(0, serverSeedHash, 0, { value: ethers.utils.parseEther("45") });
  const receipt = await tx.wait();
  
  const gameId = receipt.events?.find(e => e.event === "GameCommitted")?.args?.gameId;
  console.log(`   Game ID: ${gameId}`);
  
  console.log("2. Waiting for VRF...");
  // In real implementation, wait for VRFFulfilled event
  await new Promise(r => setTimeout(r, 30000)); // Wait 30s
  
  console.log("3. Revealing Game...");
  const revealTx = await starforge.revealGame(gameId, serverSeed);
  const revealReceipt = await revealTx.wait();
  
  const outcome = revealReceipt.events?.find(e => e.event === "GameRevealed");
  console.log(`   Outcome: Pattern ${outcome.args.patternId}, Payout ${ethers.utils.formatEther(outcome.args.payout)} MON`);
  
  console.log("✅ Test Complete");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

## 5. Security Validation

Before mainnet:
1.  **Solvency Check**: Call `getSolvencyStatus()` after stress testing.
2.  **Rate Limit**: Try spamming 15 games in 1 minute (should fail after 10).
3.  **Refunds**: Commit, wait 24h, try `requestRefund()`.

## 6. Mainnet Launch

1.  **Verify Contract**: `npx hardhat verify ...`
2.  **Transfer Ownership**: Move `DEFAULT_ADMIN_ROLE` to a multi-sig (Safe).
3.  **Monitor**: Set up OpenZeppelin Defender or similar to watch `TreasuryTransferFailed` events.

---
**Status**: Ready for Testnet
Current Date and Time (UTC - YYYY-MM-DD HH:MM:SS formatted): 2026-01-08 14:27:27
Current User's Login: InverseAltruism
