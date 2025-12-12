# Monad Testnet Deployment Guide

This guide covers testing and deploying Star World Order contracts on the Monad Testnet.

## Monad Network Information

### Mainnet
| Property | Value |
|----------|-------|
| Chain ID | 143 (0x8f) |
| Currency | MON |
| Block Gas Limit | 200,000,000 |
| RPC URL | https://rpc.monad.xyz |
| Explorer | https://monadscan.com |

### Testnet
| Property | Value |
|----------|-------|
| Chain ID | 10143 (0x279f) |
| Currency | MON (testnet) |
| RPC URL | https://testnet-rpc.monad.xyz |
| Explorer | https://testnet.monadscan.com |
| Faucet | https://faucet.monad.xyz |

## Getting Started

### 1. Configure Environment for Testnet

Copy `.env.example` to `.env.local` and update for testnet:

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```bash
# Switch to testnet
NEXT_PUBLIC_MONAD_CHAIN_ID=10143
NEXT_PUBLIC_MONAD_RPC_URL=https://testnet-rpc.monad.xyz

# Enable dev access for testing (optional)
NEXT_PUBLIC_DEV_ACCESS_ENABLED=true
```

### 2. Get Testnet MON Tokens

1. Go to [Monad Faucet](https://faucet.monad.xyz)
2. Connect your wallet or enter your address
3. Request testnet MON tokens
4. Wait for tokens to arrive (usually within seconds)

### 3. Install Foundry (for contract deployment)

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### 4. Deploy Contracts

#### Deploy Marketplace Contract

```bash
# Set your deployer private key
export DEPLOYER_PRIVATE_KEY=0x...
export DAO_TREASURY_ADDRESS=0x...  # Your treasury address

# Deploy to testnet
forge create --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY \
  contracts/StarSkrumpeyMarketplace.sol:StarSkrumpeyMarketplace \
  --constructor-args \
    0x0000000000000000000000000000000000000000 \  # Test NFT contract (deploy your own)
    $DAO_TREASURY_ADDRESS \
    250  # 2.5% fee
```

#### Deploy Staking Contract

```bash
forge create --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY \
  contracts/StarSkrumpeyStaking.sol:StarSkrumpeyStaking \
  --constructor-args \
    0x0000000000000000000000000000000000000000 \  # Test NFT contract
    $DAO_TREASURY_ADDRESS \
    1000000000000000 \  # 0.001 MON per second reward rate
    86400  # 1 day cooldown
```

#### Deploy Governor Contract

```bash
forge create --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY \
  contracts/StarWorldOrderGovernor.sol:StarWorldOrderGovernor \
  --constructor-args \
    0x0000000000000000000000000000000000000000 \  # Test NFT contract
    5000 \   # Voting period (~5 hours on Monad)
    100 \    # Voting delay (~6 minutes)
    1 \      # Quorum threshold
    1        # Proposal threshold
```

### 5. Verify Contracts

```bash
forge verify-contract \
  --chain-id 10143 \
  --compiler-version v0.8.20 \
  $DEPLOYED_ADDRESS \
  contracts/StarSkrumpeyMarketplace.sol:StarSkrumpeyMarketplace \
  --verifier-url https://testnet.monadscan.com/api
```

### 6. Update Environment

After deployment, update `.env.local` with the deployed contract addresses:

```bash
NEXT_PUBLIC_MARKETPLACE_CONTRACT=0x...
NEXT_PUBLIC_GOVERNANCE_CONTRACT=0x...
NEXT_PUBLIC_STAKING_CONTRACT=0x...
NEXT_PUBLIC_DAO_TREASURY_ADDRESS=0x...
```

## Contract Testing with Node.js

You can also interact with contracts using ethers.js:

```javascript
const { ethers } = require('ethers');

// Connect to Monad Testnet
const provider = new ethers.JsonRpcProvider('https://testnet-rpc.monad.xyz');

// Create wallet from private key
const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);

// Check balance
const balance = await provider.getBalance(wallet.address);
console.log('Balance:', ethers.formatEther(balance), 'MON');
```

## Frontend Testing

1. Start the development server:
```bash
npm run dev
```

2. Open [http://localhost:3000](http://localhost:3000)

3. Connect your wallet (MetaMask, etc.)

4. Switch to Monad Testnet in your wallet:
   - Network Name: Monad Testnet
   - RPC URL: https://testnet-rpc.monad.xyz
   - Chain ID: 10143
   - Currency Symbol: MON
   - Block Explorer: https://testnet.monadscan.com

## Troubleshooting

### RPC Connection Issues
- Try alternative RPC endpoint: `https://monad-testnet.drpc.org`
- Check if your IP is rate-limited

### Insufficient Gas
- Get more testnet MON from the faucet
- Reduce gas limit if transaction fails

### Contract Deployment Fails
- Ensure you have enough MON for deployment
- Check constructor arguments match expected types
- Verify OpenZeppelin contracts version compatibility

## Security Notes

- **Never use testnet wallets with mainnet funds**
- **Never commit private keys to version control**
- **Use environment variables for sensitive data**
- **Test thoroughly before mainnet deployment**

## Resources

- [Monad Documentation](https://docs.monad.xyz)
- [Monad Testnet Faucet](https://faucet.monad.xyz)
- [Monad Discord](https://discord.gg/monad)
- [Foundry Book](https://book.getfoundry.sh/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
