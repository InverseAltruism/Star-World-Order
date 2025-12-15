# CLAUDE.md - Star World Order Technical Reference

This file contains comprehensive technical information for AI agents and developers working on the Star World Order codebase.

---

## Project Overview

**Star World Order (SWO)** is a Sub-DAO for Star Skrumpey holders on Monad blockchain.

- **Website**: https://starworldorder.com
- **Twitter**: https://x.com/StrWorldOrder
- **Parent Project**: https://x.com/skrumpeys
- **Repository**: https://github.com/InverseAltruism/Star-World-Order

Star World Order is an exclusive DAO realm for holders of Skrumpey NFTs with the Star constellation trait. It features a retro N64-inspired UI with synthwave aesthetics, DAO governance, OTC marketplace, NFT staking, and a community hangout hub.

---

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Frontend** | Next.js | 16 |
| **UI Framework** | React | 19 |
| **Language** | TypeScript | 5.9+ |
| **Styling** | Tailwind CSS | 4 |
| **Theme** | Synthwave/Retro | Custom |
| **Web3 Library** | Wagmi | 3 |
| **Ethereum Client** | Viem | 2 |
| **Smart Contracts** | Solidity | 0.8.20 |
| **Contract Library** | OpenZeppelin | 5.x |
| **Database** | SQLite | (better-sqlite3) |
| **Blockchain** | Monad | Chain ID: 143 |
| **Font** | Press Start 2P | Retro Pixel Font |

---

## Environment Modes

Star World Order supports two environment modes for feature control:

```bash
NEXT_PUBLIC_ENV_MODE=dev   # All features unlocked
NEXT_PUBLIC_ENV_MODE=prod  # DAO, Exchange locked with 🔒
```

### Mode Detection

**Auto-detection** (if `NEXT_PUBLIC_ENV_MODE` is not set):
- `localhost` or `192.168.x.x` → automatically uses `dev` mode
- `starworldorder.com` → automatically uses `prod` mode
- Unknown domains → defaults to `prod` for safety

### Use Cases

| Mode | Features | Use Case |
|------|----------|----------|
| `dev` | All features unlocked | Local development, testing |
| `prod` | DAO, Exchange, Enter the Order locked with 🔒 | Production deployment |

**Implementation**: See `lib/config.ts`

---

## Branch Workflow

| Branch | Purpose | Port | Deployment |
|--------|---------|------|------------|
| `main` | Production | 3080 | https://starworldorder.com |
| `dev` | Development/Testing | 3081 | Internal testing environment |

### Development Workflow

1. **Create PR** targeting `dev` branch
2. **Review & Merge** PR to `dev`
3. **Test on DEV** environment (port 3081)
4. **Promote to PROD**: Merge `dev` → `main`
5. **Deploy to PROD**: Rebuild and restart service (port 3080)

**Important**: All pull requests should target the `dev` branch. Direct PRs to `main` will be rejected.

---

## Server Setup (NUC)

Star World Order is deployed on a NUC (Next Unit of Computing) server with the following structure:

```
/opt/star_world_order/
├── DEV/                    # dev branch (port 3081)
│   ├── Star-World-Order/   # git repository
│   └── node_modules/
├── PROD/                   # main branch (port 3080)
│   ├── Star-World-Order/   # git repository
│   └── node_modules/
├── deploy-dev.sh           # DEV deployment script
├── deploy-prod.sh          # PROD deployment script
├── health-check.sh         # Health check script
└── logs/
    ├── dev.log
    └── prod.log
```

### Systemd Service

Service name: `star-world`

```bash
# Service management
sudo systemctl status star-world    # Check service status
sudo systemctl restart star-world   # Restart service
sudo systemctl start star-world     # Start service
sudo systemctl stop star-world      # Stop service

# View logs
sudo journalctl -u star-world -f    # Follow live logs
sudo journalctl -u star-world -n 100  # Last 100 lines
```

### Aliases

Convenient aliases for server operations:

```bash
swo-health          # Run health check
swo-deploy-dev      # Deploy to DEV environment
swo-deploy-prod     # Deploy to PROD environment
swo-logs            # View live PROD logs
swo-status          # Check service status
swo-restart         # Restart PROD service
```

---

## Monad Network Configuration

### Mainnet (Chain ID: 143)

| Property | Value |
|----------|-------|
| **Chain ID** | 143 (0x8f) |
| **Currency** | MON |
| **Block Gas Limit** | 200,000,000 |
| **RPC (Primary)** | https://rpc.monad.xyz |
| **Explorer** | https://monadscan.com |
| **Alt Explorer** | https://monadvision.com |

**RPC Endpoints** (Fallbacks):
```
https://rpc.monad.xyz
https://rpc1.monad.xyz
https://rpc2.monad.xyz
https://rpc3.monad.xyz
https://rpc4.monad.xyz
https://rpc-mainnet.monadinfra.com
https://monad-mainnet.drpc.org
https://monad-mainnet.api.onfinality.io/public
https://monad-mainnet-rpc.spidernode.net
```

### Testnet (Chain ID: 10143)

| Property | Value |
|----------|-------|
| **Chain ID** | 10143 (0x279f) |
| **Currency** | MON (testnet) |
| **RPC** | https://testnet-rpc.monad.xyz |
| **RPC (Alt)** | https://monad-testnet.drpc.org |
| **Explorer** | https://testnet.monadscan.com |
| **Faucet** | https://faucet.monad.xyz |

**Implementation**: See `lib/wagmi.ts`

---

## Contract Addresses

| Contract | Address | Status |
|----------|---------|--------|
| **Skrumpeys NFT** | `0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0` | ✅ Live on Mainnet |
| **StarSkrumpeyMarketplace** | Not Yet Deployed | Pending Deployment |
| **StarSkrumpeyStaking** | Not Yet Deployed | Pending Deployment |
| **StarWorldOrderGovernor** | Not Yet Deployed | Pending Deployment |
| **Multicall3** | `0xcA11bde05977b3631167028862bE2a173976CA11` | ✅ Live on Mainnet |

### Skrumpeys NFT Contract

- **Address**: `0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0`
- **Explorer**: https://monadscan.com/address/0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0
- **Total Supply**: ~3333 NFTs
- **Star Skrumpeys**: 343 NFTs with Star constellation trait
- **Standard**: ERC-721 Enumerable

---

## Smart Contracts Overview

### StarSkrumpeyMarketplace.sol

**Location**: `contracts/StarSkrumpeyMarketplace.sol`

OTC peer-to-peer NFT marketplace exclusively for Star Skrumpey trading.

#### Features

| Feature | Description |
|---------|-------------|
| **Fixed-Price Listings** | Sellers set exact MON price |
| **Trustless Trades** | Atomic NFT ↔ MON swaps |
| **DAO Fee** | Configurable fee (default 2.5%) to treasury |
| **Pausable** | Emergency pause functionality |
| **ReentrancyGuard** | Protected against reentrancy attacks |

#### Key Functions

```solidity
// Create a listing - requires prior NFT approval
function createListing(uint256 tokenId, uint256 price) external returns (uint256 listingId);

// Buy a listed NFT - send exact MON amount
function buyListing(uint256 listingId) external payable;

// Cancel your own listing
function cancelListing(uint256 listingId) external;

// View functions
function getListing(uint256 listingId) external view returns (Listing memory);
function isTokenListed(uint256 tokenId) external view returns (bool);
function calculateFees(uint256 price) external view returns (uint256 daoFee, uint256 sellerProceeds);
```

#### Events

```solidity
event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 indexed tokenId, uint256 price);
event ListingPurchased(uint256 indexed listingId, address indexed buyer, address indexed seller, uint256 tokenId, uint256 price, uint256 daoFee, uint256 sellerProceeds);
event ListingCancelled(uint256 indexed listingId, address indexed seller, uint256 indexed tokenId);
```

---

### StarSkrumpeyStaking.sol

**Location**: `contracts/StarSkrumpeyStaking.sol`

NFT staking system for earning STAR tokens with time-based multipliers.

#### Features

| Feature | Description |
|---------|-------------|
| **Base Rate** | 1 NFT = rewards per second (configurable rate) |
| **Time Multipliers** | Longer stakes = higher rewards |
| **Multiple Staking** | Stake multiple NFTs simultaneously |
| **Emergency Unstake** | 10% penalty for emergency withdrawals |
| **ReentrancyGuard** | Protected against reentrancy attacks |

#### Time-Based Multipliers

| Lock Duration | Multiplier | APY Boost |
|--------------|------------|-----------|
| 1 week | 110% | +10% |
| 1 month | 130% | +30% |
| 3 months | 150% | +50% |
| 6 months | 175% | +75% |
| 1 year | 200% | +100% |

#### Key Functions

```solidity
// Stake a single NFT
function stake(uint256 tokenId, uint256 lockDuration) external;

// Stake multiple NFTs at once
function stakeMultiple(uint256[] calldata tokenIds, uint256 lockDuration) external;

// Request unstake (starts cooldown period if applicable)
function requestUnstake(uint256 tokenId) external;

// Unstake after cooldown
function unstake(uint256 tokenId) external;

// Emergency unstake with 10% penalty
function emergencyUnstake(uint256 tokenId) external;

// Claim accumulated rewards
function claimRewards() external;

// View pending rewards
function getPendingRewards(address user) external view returns (uint256);
```

---

### StarWorldOrderGovernor.sol

**Location**: `contracts/StarWorldOrderGovernor.sol`

DAO governance contract for proposal creation, voting, and execution.

#### Features

| Feature | Description |
|---------|-------------|
| **NFT-Based Voting** | 1 Star Skrumpey = 1 Vote |
| **Proposal Lifecycle** | Pending → Active → Defeated/Succeeded → Executed/Cancelled |
| **Configurable Parameters** | Voting period, delay, quorum, proposal threshold |
| **Timelock** | Optional timelock for execution delay |
| **Square Root Weighting** | √STAR + NFT count for fair voting power |

#### Proposal States

1. **Pending** - Proposal created, voting hasn't started
2. **Active** - Currently accepting votes
3. **Defeated** - Failed to reach quorum or more votes against
4. **Succeeded** - Passed the vote
5. **Executed** - Implemented by the DAO
6. **Cancelled** - Cancelled before execution

#### Key Functions

```solidity
// Create a new proposal
function propose(
    address[] memory targets,
    uint256[] memory values,
    bytes[] memory calldatas,
    string memory description
) external returns (uint256 proposalId);

// Cast a vote
function castVote(uint256 proposalId, uint8 support) external returns (uint256 balance);

// Cast a vote with reason
function castVoteWithReason(uint256 proposalId, uint8 support, string calldata reason) external returns (uint256 balance);

// Execute a proposal
function execute(
    address[] memory targets,
    uint256[] memory values,
    bytes[] memory calldatas,
    bytes32 descriptionHash
) external payable returns (uint256 proposalId);

// Cancel a proposal
function cancel(
    address[] memory targets,
    uint256[] memory values,
    bytes[] memory calldatas,
    bytes32 descriptionHash
) external returns (uint256 proposalId);
```

#### Voting Power Calculation

```typescript
// Voting Power = √(STAR Balance) + NFT Count
const votingPower = Math.sqrt(starBalance) + nftCount;
```

This ensures:
- **Early supporters** are rewarded for loyalty (accumulated STAR)
- **Late joiners** remain competitive (NFT count still matters)
- **Whale prevention** - Square root prevents STAR hoarding dominance

---

## Star Skrumpey Token IDs (343 total)

Star Skrumpeys are Skrumpey NFTs with the Star constellation trait. The following 343 token IDs have been identified:

```
3, 17, 20, 23, 38, 40, 60, 84, 96, 106, 108, 118, 120, 141, 149, 164, 180, 191, 204, 206,
211, 226, 258, 270, 271, 274, 294, 332, 338, 339, 341, 346, 357, 362, 368, 406, 421, 431,
439, 442, 456, 461, 511, 533, 547, 558, 562, 563, 567, 588, 594, 596, 627, 629, 643, 650,
652, 659, 672, 675, 680, 693, 701, 704, 705, 709, 710, 714, 717, 726, 753, 759, 760, 762,
775, 794, 800, 803, 804, 806, 807, 829, 841, 845, 850, 854, 857, 870, 877, 880, 888, 890,
893, 905, 909, 918, 933, 950, 951, 960, 962, 984, 988, 1003, 1015, 1022, 1043, 1048, 1049,
1052, 1059, 1075, 1096, 1101, 1103, 1108, 1118, 1132, 1139, 1142, 1152, 1163, 1197, 1202,
1210, 1222, 1228, 1235, 1250, 1284, 1287, 1310, 1342, 1358, 1362, 1369, 1370, 1374, 1377,
1407, 1417, 1419, 1429, 1459, 1461, 1475, 1487, 1495, 1507, 1516, 1517, 1522, 1537, 1540,
1547, 1548, 1557, 1564, 1578, 1594, 1601, 1603, 1604, 1612, 1617, 1634, 1636, 1651, 1655,
1672, 1681, 1700, 1702, 1716, 1756, 1766, 1782, 1791, 1795, 1799, 1804, 1807, 1814, 1824,
1830, 1841, 1864, 1868, 1874, 1917, 1931, 1942, 1947, 1968, 1978, 1987, 1988, 1993, 2010,
2041, 2043, 2058, 2064, 2081, 2084, 2093, 2128, 2131, 2137, 2146, 2165, 2183, 2185, 2198,
2201, 2207, 2210, 2239, 2240, 2242, 2258, 2260, 2276, 2278, 2281, 2289, 2294, 2295, 2317,
2325, 2346, 2356, 2397, 2402, 2421, 2446, 2454, 2460, 2464, 2466, 2470, 2480, 2489, 2497,
2526, 2528, 2536, 2537, 2548, 2558, 2563, 2574, 2585, 2596, 2597, 2599, 2610, 2614, 2620,
2634, 2635, 2645, 2660, 2667, 2682, 2689, 2694, 2722, 2729, 2730, 2754, 2756, 2763, 2781,
2785, 2789, 2825, 2835, 2842, 2844, 2858, 2862, 2867, 2876, 2891, 2901, 2935, 2958, 2970,
2985, 2987, 2992, 2999, 3022, 3035, 3056, 3073, 3083, 3096, 3101, 3117, 3134, 3144, 3146,
3159, 3166, 3169, 3176, 3189, 3199, 3205, 3206, 3211, 3219, 3221, 3222, 3227, 3258, 3263,
3266, 3267, 3268, 3271, 3279, 3284, 3288, 3294, 3295, 3298, 3311, 3319, 3329, 3332
```

**Storage Location**: `lib/starSkrumpey.ts` as `STAR_SKRUMPEY_IDS` array

**Lookup Performance**: O(1) using Set data structure

---

## Star Trait Variants

Star Skrumpeys can have one of the following constellation variants:

| Variant | Description |
|---------|-------------|
| **aether** | Ethereal cosmic energy |
| **spectra** | Spectral light patterns |
| **solveil** | Solar essence |
| **nebulu** | Nebula-infused |
| **chroma** | Chromatic brilliance |
| **rose** | Rose-tinted stardust |
| **monflare** | Monad flare energy |
| **auracore** | Core aura manifestation |
| **parallel** | Parallel dimension aligned |
| **prime** | Prime constellation |

**Implementation**: See `lib/starSkrumpey.ts` - `STAR_TRAIT_VARIANTS` array

---

## Database Schema (SQLite)

**Database Location**: `data/swo.db`

### chat_messages

Stores Hangout Hub chat history.

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_address TEXT NOT NULL,
  sender_display_name TEXT,
  message TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'chat' CHECK (message_type IN ('chat', 'system', 'emote')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_created_at ON chat_messages(created_at DESC);
```

### online_presence

Tracks online users and their last message for chat bubbles.

```sql
CREATE TABLE IF NOT EXISTS online_presence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL UNIQUE,
  display_name TEXT,
  nft_token_id INTEGER,
  star_variant TEXT,
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'away', 'busy')),
  last_message TEXT,
  last_message_at DATETIME,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_presence_last_seen ON online_presence(last_seen DESC);
CREATE INDEX idx_presence_wallet ON online_presence(wallet_address);
```

### voice_sessions

Voice chat room sessions.

```sql
CREATE TABLE IF NOT EXISTS voice_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_name TEXT NOT NULL,
  creator_address TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME
);

CREATE INDEX idx_voice_active ON voice_sessions(is_active, created_at DESC);
```

### voice_participants

Users in voice sessions with mute status.

```sql
CREATE TABLE IF NOT EXISTS voice_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  wallet_address TEXT NOT NULL,
  display_name TEXT,
  is_muted INTEGER NOT NULL DEFAULT 0,
  is_deafened INTEGER NOT NULL DEFAULT 0,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES voice_sessions(id)
);

CREATE INDEX idx_voice_participants_session ON voice_participants(session_id);
CREATE INDEX idx_voice_participants_wallet ON voice_participants(wallet_address);
```

### social_connections

Discord and X (Twitter) OAuth account links.

```sql
CREATE TABLE IF NOT EXISTS social_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('discord', 'x')),
  platform_user_id TEXT NOT NULL,
  platform_username TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at DATETIME,
  connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, platform)
);

CREATE INDEX idx_social_wallet ON social_connections(wallet_address);
CREATE INDEX idx_social_platform ON social_connections(platform, platform_user_id);
```

### user_profiles

User display names, bios, and avatar preferences.

```sql
CREATE TABLE IF NOT EXISTS user_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL UNIQUE,
  display_name TEXT,
  bio TEXT,
  avatar_token_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_profiles_wallet ON user_profiles(wallet_address);
```

**Implementation**: See `lib/db.ts`

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chat` | GET | Get recent chat messages (limit, offset) |
| `/api/chat` | POST | Send a new chat message |
| `/api/presence` | GET | Get online users |
| `/api/presence` | POST | Update user presence (heartbeat) |
| `/api/presence` | DELETE | Remove user presence (disconnect) |
| `/api/voice` | GET | Get active voice session |
| `/api/voice` | POST | Create/join voice session |
| `/api/voice` | PATCH | Update mute/deafen status |
| `/api/voice` | DELETE | Leave/end voice session |
| `/api/profile` | GET | Get user profile by wallet address |
| `/api/profile` | POST | Update user profile |
| `/api/social-connections` | GET | Get social connections for wallet |
| `/api/auth/x` | GET | X (Twitter) OAuth initiation |
| `/api/auth/callback/x` | GET | X OAuth callback handler |

**Base URL**: `https://starworldorder.com` (production)

---

## RPC Optimization Strategy

Star World Order uses a multi-tier resilience strategy for RPC calls to avoid rate limiting and ensure reliability:

### Tier 1: Batched Multicall

Uses Viem's `multicall` to batch ownership checks of all 343 Star Skrumpey token IDs in a single RPC call. This provides O(1) RPC complexity regardless of user's NFT count.

```typescript
// Check ownership of all 343 Star Skrumpeys in one call
const ownershipChecks = await client.multicall({
  contracts: STAR_SKRUMPEY_IDS.map(tokenId => ({
    address: SKRUMPEY_CONTRACT_ADDRESS,
    abi: ERC721_ABI,
    functionName: 'ownerOf',
    args: [BigInt(tokenId)],
  })),
  allowFailure: true,
});
```

### Tier 2: Fallback RPC Endpoints

Rotates through multiple RPC endpoints if primary fails:

```typescript
const RPC_ENDPOINTS = [
  'https://rpc.monad.xyz',           // Primary
  'https://rpc1.monad.xyz',          // Fallback 1
  'https://rpc2.monad.xyz',          // Fallback 2
  'https://rpc3.monad.xyz',          // Fallback 3
  'https://rpc-mainnet.monadinfra.com', // Fallback 4
  'https://monad-mainnet.drpc.org',  // Fallback 5
];
```

### Tier 3: Retry with Exponential Backoff

Retries failed requests with exponential backoff (1s, 2s, 4s):

```typescript
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
}
```

### Tier 4: Graceful Degradation

If all retries fail, returns empty array instead of crashing:

```typescript
try {
  return await checkStarOwnershipBatched(address);
} catch (error) {
  logger.error('All RPC strategies failed', { error });
  return []; // Graceful degradation
}
```

**Implementation**: See `lib/rpcClient.ts` and `lib/starSkrumpey.ts`

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `lib/config.ts` | Environment mode detection (dev/prod) |
| `lib/starSkrumpey.ts` | Star trait verification, token IDs, ownership checks |
| `lib/wagmi.ts` | Wagmi/Viem chain configuration for Monad |
| `lib/rpcClient.ts` | RPC fallback and retry logic |
| `lib/db.ts` | SQLite database operations and queries |
| `lib/logger.ts` | Logging utility for debugging |
| `lib/contexts/DemoModeContext.tsx` | Demo mode state management |
| `lib/contexts/DAOAccessContext.tsx` | DAO access state management |
| `components/AccessGate.tsx` | Access control wrapper component |
| `components/DemoMode.tsx` | Demo mode modal and UI |
| `components/Header.tsx` | Navigation header with feature locks |
| `app/page.tsx` | Home page with N64 loading screen |
| `app/dao/page.tsx` | DAO governance page |
| `app/exchange/page.tsx` | OTC marketplace page |
| `app/staking/page.tsx` | NFT staking page |
| `app/hangout/page.tsx` | Hangout Hub lobby |

---

## Environment Variables (.env.local)

```bash
# Environment Mode
NEXT_PUBLIC_ENV_MODE=dev|prod

# Monad Configuration
NEXT_PUBLIC_MONAD_CHAIN_ID=143
NEXT_PUBLIC_MONAD_RPC_URL=https://rpc.monad.xyz

# Contract Addresses
NEXT_PUBLIC_SKRUMPEY_CONTRACT=0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0
NEXT_PUBLIC_MARKETPLACE_CONTRACT=         # TBD
NEXT_PUBLIC_STAKING_CONTRACT=             # TBD
NEXT_PUBLIC_GOVERNOR_CONTRACT=            # TBD

# DAO Configuration
NEXT_PUBLIC_DAO_TREASURY_ADDRESS=         # TBD
NEXT_PUBLIC_DAO_FEE_BPS=250              # 2.5% fee

# WalletConnect (optional)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# OAuth (optional)
NEXT_PUBLIC_X_CLIENT_ID=
X_CLIENT_SECRET=
NEXT_PUBLIC_DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=

# Development
NEXT_PUBLIC_DEV_ACCESS_ENABLED=true|false

# Database
DATABASE_URL=file:./data/swo.db
```

**Example**: See `.env.example` in repository root

---

## Development Commands

```bash
# Development server
npm run dev              # Start dev server on port 3000

# Build
npm run build            # Build for production
npm run start            # Start production server

# Type checking
npm run type-check       # Run TypeScript type checks

# Linting
npm run lint             # Run ESLint

# Contracts
npm run compile          # Compile Solidity contracts

# Database
npm run db:init          # Initialize SQLite database

# Testing
npm run test:network     # Test network connection to Monad
```

---

## Deployment Commands

### DEV Environment (port 3081)

```bash
# Navigate to DEV directory
cd /opt/star_world_order/DEV/Star-World-Order

# Pull latest from dev branch
git pull origin dev

# Install dependencies
npm install

# Build with dev mode
NEXT_PUBLIC_ENV_MODE=dev npm run build

# Start on port 3081
npm start -- -p 3081

# Or use convenience script
cd /opt/star_world_order
./deploy-dev.sh
```

### PROD Environment (port 3080)

```bash
# Navigate to PROD directory
cd /opt/star_world_order/PROD/Star-World-Order

# Pull latest from main branch
git pull origin main

# Install dependencies
npm install

# Build with prod mode
NEXT_PUBLIC_ENV_MODE=prod npm run build

# Restart systemd service
sudo systemctl restart star-world

# Or use convenience script
cd /opt/star_world_order
./deploy-prod.sh
```

### Deployment Scripts

**deploy-dev.sh**:
```bash
#!/bin/bash
cd /opt/star_world_order/DEV/Star-World-Order
git pull origin dev
npm install
NEXT_PUBLIC_ENV_MODE=dev npm run build
pm2 restart swo-dev || pm2 start npm --name "swo-dev" -- start -- -p 3081
```

**deploy-prod.sh**:
```bash
#!/bin/bash
cd /opt/star_world_order/PROD/Star-World-Order
git pull origin main
npm install
NEXT_PUBLIC_ENV_MODE=prod npm run build
sudo systemctl restart star-world
```

---

## Access Control

### Star Skrumpey Verification

Access to DAO features requires holding a Star Skrumpey (Skrumpey NFT with Star constellation trait).

**Verification Flow**:

1. User connects wallet
2. App calls `checkStarOwnershipBatched(address)` to verify ownership
3. Function checks ownership of all 343 Star Skrumpey token IDs via multicall
4. If user owns at least one Star Skrumpey, grant DAO access
5. If not, show access denied message with link to marketplace

**Implementation**: See `lib/starSkrumpey.ts` - `checkStarOwnershipBatched()`

### Development Override

For development testing without holding a Star Skrumpey:

```bash
# In .env.local
NEXT_PUBLIC_DEV_ACCESS_ENABLED=true
```

**Note**: This only works in development mode. Production builds always enforce Star Skrumpey ownership.

---

## Demo Mode

Demo Mode allows visitors to preview the app without connecting a wallet.

### How It Works

1. Click **🎮 DEMO MODE** button in header
2. Enter any wallet address that holds Star Skrumpeys
3. Browse the app with that wallet's NFT data (read-only)
4. Click **EXIT DEMO** to return to normal mode

### Features in Demo Mode

- ✅ View profiles and NFT collections
- ✅ See feature unlocks based on NFT holdings
- ✅ Browse the marketplace
- ❌ Username changes (disabled)
- ❌ Trading or transfers (disabled)
- ❌ Any write operations (disabled)

**Implementation**: See `lib/contexts/DemoModeContext.tsx`

---

## Design Philosophy

Star World Order features an N64-inspired retro gaming aesthetic:

### Visual Elements

- **Cozy Gaming Setup** - CRT TV, N64 console, wooden desk
- **Synthwave Colors** - Deep navy/purple with neon cyan, magenta, gold accents
- **Neon Glow Effects** - Soft bloom on buttons and cards
- **CRT Scanlines** - Authentic retro screen feel
- **Press Start 2P Font** - Classic gaming typography
- **Cartridge Loading** - Insert the SWO cartridge to boot up

### Color Palette

```css
--neon-cyan: #00f7ff
--neon-magenta: #ff00ff
--neon-gold: #ffd700
--deep-purple: #1a0033
--dark-navy: #0a0015
```

**Implementation**: See `tailwind.config.ts` and global styles

---

## Contributing

### Workflow

1. Fork the repository
2. Create feature branch: `git checkout -b feature/cosmic-feature`
3. Make changes and commit: `git commit -m 'Add cosmic feature'`
4. Push to branch: `git push origin feature/cosmic-feature`
5. Open Pull Request targeting `dev` branch

### Code Style

- TypeScript strict mode enabled
- React functional components with hooks
- Tailwind CSS for styling (no CSS modules)
- ESLint for code linting
- Consistent file naming (kebab-case)

### Testing

- Type check before committing: `npm run type-check`
- Lint before committing: `npm run lint`
- Test network connectivity: `npm run test:network`

---

## Troubleshooting

### RPC Rate Limiting

**Symptom**: "Rate limit exceeded" errors

**Solution**: The batched multicall strategy should prevent this. If still occurring:
1. Check RPC endpoint health: `npm run test:network`
2. Try switching to fallback RPC in `.env.local`
3. Increase retry delay in `lib/rpcClient.ts`

### Database Locked

**Symptom**: "database is locked" errors

**Solution**:
1. Ensure only one process is accessing the database
2. Check for zombie processes: `ps aux | grep node`
3. Restart the service: `sudo systemctl restart star-world`

### Build Failures

**Symptom**: Build errors during deployment

**Solution**:
1. Clear Next.js cache: `rm -rf .next`
2. Clear node_modules: `rm -rf node_modules && npm install`
3. Check Node.js version: `node -v` (should be 20+)

### Contract Not Found

**Symptom**: "Contract not found" or "Invalid address" errors

**Solution**:
1. Verify `NEXT_PUBLIC_SKRUMPEY_CONTRACT` is set in `.env.local`
2. Check contract address on explorer: https://monadscan.com
3. Ensure using correct network (Mainnet vs Testnet)

---

## License

ISC License - See LICENSE file for details

---

**Last Updated**: December 15, 2024

**Repository**: https://github.com/InverseAltruism/Star-World-Order

**For AI Agents**: This file contains complete technical documentation for the Star World Order codebase. Use it as a reference when making changes, debugging issues, or implementing new features.
