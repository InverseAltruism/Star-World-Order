# CLAUDE.md - Star World Order Technical Reference

> **For AI Agents**: This file is optimized for Claude and other AI coding assistants. Start with the Quick Reference section for common tasks, then consult detailed sections as needed.

---

## 🚀 Quick Reference for AI Agents

### Essential Commands

```bash
# Development
npm run dev              # Start dev server (port 3000)
npm run build            # Build for production
npm run start            # Start production server

# Validation (RUN BEFORE COMMITTING)
npm run type-check       # TypeScript validation
npm run lint             # ESLint checks

# Database
npm run db:init          # Initialize SQLite database
npm run db:fetch-metadata # Fetch NFT metadata to DB

# Contracts
npm run compile          # Compile Solidity contracts

# Testing
npm run test:network     # Test Monad RPC connection
```

### Critical File Locations

| Purpose | File(s) |
|---------|---------|
| **Environment config** | `lib/config.ts` |
| **Database operations** | `lib/db.ts` |
| **Star Skrumpey logic** | `lib/starSkrumpey.ts` |
| **RPC client with fallback** | `lib/rpcClient.ts` |
| **Wagmi/chain config** | `lib/wagmi.ts` |
| **API routes** | `app/api/*/route.ts` |
| **React components** | `components/*.tsx` |
| **Page components** | `app/*/page.tsx` |
| **Environment variables** | `.env.example` (template) |

### PR Workflow

⚠️ **All PRs must target `dev` branch, NOT `main`.**

```bash
git checkout dev
git checkout -b feature/your-feature
# Make changes
npm run type-check && npm run lint && npm run build
# Commit and push your feature branch
```

### When Modifying Code

1. **Always run validation**: `npm run type-check && npm run lint`
2. **Test build**: `npm run build`
3. **Use existing patterns**: Check similar files for conventions
4. **Preserve existing tests**: Don't remove working test infrastructure

---

## 🔧 Common Task Patterns

### Adding a New API Endpoint

1. Create file at `app/api/{endpoint}/route.ts`
2. Export async functions: `GET`, `POST`, `PATCH`, `DELETE`
3. Use `NextRequest` and return `NextResponse.json()`

```typescript
// app/api/example/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const param = searchParams.get('param');
  
  return NextResponse.json({ success: true, data: param });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  // Process body
  return NextResponse.json({ success: true });
}
```

### Adding a New Database Table

1. Add schema in `lib/db.ts` initialization section
2. Add CRUD functions in `lib/db.ts`
3. Create indexes for frequently queried columns

```typescript
// In lib/db.ts - Add to initDatabase() function
db.exec(`
  CREATE TABLE IF NOT EXISTS user_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_user_activity_wallet ON user_activity(wallet_address);
`);
```

### Adding a New React Component

1. Create file in `components/` directory
2. Use TypeScript functional components
3. Use Tailwind CSS for styling
4. Follow synthwave color scheme

```typescript
// components/NewComponent.tsx
'use client';

interface NewComponentProps {
  title: string;
  onAction?: () => void;
}

export default function NewComponent({ title, onAction }: NewComponentProps) {
  return (
    <div className="bg-black/80 border border-[#00f7ff]/30 rounded-lg p-4">
      <h2 className="text-[#00f7ff] font-['Press_Start_2P'] text-sm">{title}</h2>
      {onAction && (
        <button 
          onClick={onAction}
          className="mt-2 px-4 py-2 bg-[#00f7ff]/20 hover:bg-[#00f7ff]/30 
                     border border-[#00f7ff] text-[#00f7ff] rounded"
        >
          Action
        </button>
      )}
    </div>
  );
}
```

### Working with Web3/Blockchain

Use Wagmi hooks for blockchain interactions:

```typescript
import { useAccount, useReadContract, useWriteContract } from 'wagmi';

// Read from contract
const { data, isLoading } = useReadContract({
  address: CONTRACT_ADDRESS,
  abi: CONTRACT_ABI,
  functionName: 'balanceOf',
  args: [userAddress],
});

// Write to contract
const { writeContract } = useWriteContract();
writeContract({
  address: CONTRACT_ADDRESS,
  abi: CONTRACT_ABI,
  functionName: 'transfer',
  args: [recipient, amount],
});
```

---

## ⚠️ Anti-Patterns to Avoid

### ❌ DON'T: Fetch NFT metadata from IPFS directly
```typescript
// ❌ WRONG - Slow and unreliable
const metadata = await fetch(`https://ipfs.io/ipfs/bafybei.../${tokenId}`);
```

### ✅ DO: Use database batch lookup
```typescript
// ✅ CORRECT - Fast O(1) lookup
import { getStarSkrumpeyMetadataBatch } from '@/lib/db';
const metadataMap = getStarSkrumpeyMetadataBatch(tokenIds);
```

### ❌ DON'T: Make sequential RPC calls
```typescript
// ❌ WRONG - Rate limiting risk
for (const id of tokenIds) {
  await client.readContract({ functionName: 'ownerOf', args: [id] });
}
```

### ✅ DO: Use multicall batching
```typescript
// ✅ CORRECT - Single batched call
import { checkStarOwnershipBatched } from '@/lib/starSkrumpey';
const ownedStars = await checkStarOwnershipBatched(address);
```

### ❌ DON'T: Hardcode RPC endpoints
```typescript
// ❌ WRONG - No fallback
const client = createPublicClient({ transport: http('https://rpc.monad.xyz') });
```

### ✅ DO: Use resilient RPC client
```typescript
// ✅ CORRECT - Has fallback and retry logic
import { getResilientClient } from '@/lib/rpcClient';
const client = getResilientClient();
```

---

## 🎨 Styling Conventions

### Color Palette (Synthwave Theme)

```css
/* Primary colors - use these in Tailwind */
--neon-cyan: #00f7ff      /* text-[#00f7ff], border-[#00f7ff] */
--neon-magenta: #ff00ff   /* text-[#ff00ff] */
--neon-gold: #ffd700      /* text-[#ffd700] */
--deep-purple: #1a0033    /* bg-[#1a0033] */
--dark-navy: #0a0015      /* bg-[#0a0015] */
```

### Typography

- **Headings**: `font-['Press_Start_2P']` (retro pixel font)
- **Body text**: Default system font stack
- **Sizes**: Use Tailwind's `text-xs`, `text-sm`, `text-base`, etc.

### Component Styling Pattern

```tsx
// Standard card/panel styling
<div className="bg-black/80 backdrop-blur-md border border-[#00f7ff]/30 rounded-lg p-4 shadow-[0_0_15px_rgba(0,247,255,0.3)]">
  {/* content */}
</div>

// Neon glow button
<button className="px-4 py-2 bg-[#00f7ff]/20 hover:bg-[#00f7ff]/30 border border-[#00f7ff] text-[#00f7ff] rounded transition-all hover:shadow-[0_0_10px_#00f7ff]">
  Button Text
</button>
```

---

## Project Overview

**Star World Order (SWO)** is a Sub-DAO for Star Skrumpey holders on Monad blockchain.

| Property | Value |
|----------|-------|
| **Website** | https://starworldorder.com |
| **Twitter** | https://x.com/StrWorldOrder |
| **Parent Project** | https://x.com/skrumpeys |
| **Repository** | https://github.com/InverseAltruism/Star-World-Order |

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
| **Discord Bot** | discord.js | TypeScript + Viem |
| **Font** | Press Start 2P | Retro Pixel Font |

---

## Environment Modes

Star World Order supports two environment modes for feature control:

```bash
NEXT_PUBLIC_ENV_MODE=dev   # All features unlocked
NEXT_PUBLIC_ENV_MODE=prod  # DAO, Exchange hidden from navigation
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
| `prod` | DAO, Exchange hidden from navigation | Production deployment |

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

## Discord Role Verification Bot

The SWO Discord bot automatically assigns holder tier roles based on Star Skrumpey NFT ownership on Monad blockchain.

### Bot Overview

| Property | Value |
|----------|-------|
| **Location** | `/opt/star_world_order/SWO_bot/` |
| **Process Manager** | pm2 (process name: `swo-bot`) |
| **Sync Interval** | Every 5 minutes |
| **Technology** | TypeScript, discord.js v14, viem (with multicall), better-sqlite3 |
| **Bot Name** | SWO Role bot#5472 |

### Holder Tier Roles

The bot assigns Discord roles based on the number of Star Skrumpey NFTs owned:

| Role | Requirement | Discord Role ID Env Var |
|------|-------------|------------------------|
| 👑 COSMIC EMPEROR | 10+ Stars | `COSMIC_EMPEROR_ROLE_ID` |
| ⚔️ STAR LORD | 5-9 Stars | `STAR_LORD_ROLE_ID` |
| 🛡️ COSMIC WARDEN | 2-4 Stars | `COSMIC_WARDEN_ROLE_ID` |
| ⭐ STAR FORGED | 1 Star | `STAR_FORGED_ROLE_ID` |

### Slash Commands

The bot supports the following slash commands:

| Command | Description |
|---------|-------------|
| `/verify` | Force a verification check on your wallet. Use this if you just linked your wallet or bought a Star and want your role updated immediately instead of waiting for the 5-minute auto-sync. |
| `/status` | View your current verification status including your linked wallet address, how many Stars you hold, and your current tier. |
| `/tiers` | Display all holder tier requirements and see what roles are available based on Star count. |
| `/link <wallet>` | Link your wallet directly through Discord. Enter your wallet address, send 1 MON to the verification address shown, then click "Verify Transaction". No website needed. |
| `/unlink` | Disconnect your wallet from Discord and remove your holder roles. Use this if you want to link a different wallet. |

### Environment Variables

Configuration is stored in `.env.bot` file:

```bash
# Discord Bot Configuration
DISCORD_BOT_TOKEN=your-bot-token-here
DISCORD_GUILD_ID=your-guild-id-here
DISCORD_CLIENT_ID=your-client-id-here

# Discord Role IDs
COSMIC_EMPEROR_ROLE_ID=role-id-for-cosmic-emperor
STAR_LORD_ROLE_ID=role-id-for-star-lord
COSMIC_WARDEN_ROLE_ID=role-id-for-cosmic-warden
STAR_FORGED_ROLE_ID=role-id-for-star-forged

# Database and RPC
DB_PATH=/opt/swo/data/swo.db
MONAD_RPC=https://rpc.monad.xyz

# Wallet Verification via MON Transfer
VERIFICATION_ADDRESS=0xYourVerificationAddress
VERIFICATION_AMOUNT=1
```

### Wallet Verification Methods

Users can link their wallet to Discord in two ways:

1. **Website OAuth** (existing): Connect Discord at https://starworldorder.com/profile
2. **Discord `/link` command** (new): Verify wallet ownership by sending MON

**`/link` Command Flow:**
```
User runs /link 0xTheirWallet
↓
Bot shows verification address and amount (1 MON)
↓
User sends MON from their wallet to verification address
↓
User clicks "Verify Transaction" button
↓
Bot checks blockchain for matching transaction
↓
If found: Wallet linked to social_connections table + roles assigned
```

### `/link` Command Security Features

The wallet verification system implements multiple security measures:

| Security Feature | Description |
|------------------|-------------|
| **Timestamp Validation** | Only accepts transactions that occurred AFTER the verification request was initiated (prevents replay attacks) |
| **Exact Wallet Match** | Transaction must be FROM the exact wallet the user is trying to verify |
| **One-to-One Mapping** | Each wallet can only be linked to one Discord account |
| **One Discord Per Wallet** | Each Discord account can only have one wallet linked |
| **10-Minute Session Timeout** | Verification sessions expire after 10 minutes |
| **Ephemeral Responses** | All bot responses are private to the user (only they can see verification instructions) |
| **SQL Injection Protection** | All database queries use parameterized statements |
| **In-Memory Session Storage** | Pending verifications stored in Map, automatically cleaned up on timeout or completion |

### How It Works

1. **Discord Connection Lookup**: Reads Discord-connected wallets from the `social_connections` table (where `platform='discord'`)
2. **NFT Ownership Check**: Uses viem multicall to check ownership of all 333 Star Skrumpey token IDs in a single RPC call (~150ms per wallet)
3. **Role Assignment**: Assigns the appropriate tier role based on Star count
4. **Role Cleanup**: Automatically removes old tier roles when assigning new ones (prevents users from having multiple tier roles)
5. **Periodic Sync**: Runs every 5 minutes to keep roles up-to-date
6. **Role Removal**: If a user sells their Star Skrumpeys, the next sync cycle removes their holder role

**Example Flow**:
```
User connects Discord → Wallet stored in social_connections table
↓
Bot queries multicall for all 333 Star token IDs
↓
Count Stars owned by wallet
↓
Assign appropriate tier role (remove old tier roles first)
```

### Automatic Role Sync

The bot automatically syncs holder roles without manual intervention:

**Sync Process:**
- **Frequency**: Every 5 minutes (configurable via `SYNC_INTERVAL_MS`)
- **On-Chain Verification**: Checks Star Skrumpey ownership via multicall in real-time
- **Automatic Updates**: Roles update when users buy or sell Stars
- **Role Removal**: If a user sells their Stars, they lose their holder role on the next sync cycle
- **Force Sync**: Users can use `/verify` to force an immediate role update without waiting

**How Sync Works:**
1. Bot queries `social_connections` table for all Discord-linked wallets
2. For each wallet, uses multicall to check ownership of all 333 Star token IDs
3. Calculates appropriate tier based on Star count
4. Updates Discord roles (removes old tier, assigns new tier, or removes all if no Stars)
5. Logs all role changes with emoji indicators

### wallet_verifications Table

Tracks pending and confirmed wallet verifications via `/link`:

```sql
CREATE TABLE IF NOT EXISTS wallet_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_user_id TEXT NOT NULL,
  discord_username TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  verification_amount TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired', 'cancelled')),
  tx_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  confirmed_at DATETIME
);
```

**Implementation Details**: See `docs/DISCORD_BOT_WALLET_VERIFICATION.md`

### PM2 Startup Command

The bot is started with pm2 using the following command:

```bash
pm2 start /usr/bin/bash \
  --name swo-bot \
  --cwd /opt/star_world_order/SWO_bot \
  -- -lc 'export NODE_OPTIONS="--unhandled-rejections=strict"; npx ts-node index.ts'
```

**Configuration Details:**
- **Process Name**: `swo-bot` (use with `pm2 restart swo-bot`, `pm2 logs swo-bot`, etc.)
- **Working Directory**: `/opt/star_world_order/SWO_bot/`
- **Runtime**: TypeScript via ts-node (no compilation needed)
- **Error Handling**: `--unhandled-rejections=strict` ensures all promise rejections are caught
- **Shell**: Bash with login shell configuration (`-lc`)

### Bot Architecture Overview

The bot is structured with the following key components:

**In-Memory Storage:**
- `Map<string, PendingVerification>` - Tracks active `/link` sessions
- Maps Discord user ID to verification data (wallet, timestamp, expected amount)
- Automatically cleaned up after 10-minute timeout or successful verification

**Database Tables:**
| Table | Access | Purpose |
|-------|--------|---------|
| `social_connections` | Read/Write | Stores Discord ↔ Wallet links (same as website OAuth) |
| `wallet_verifications` | Write | Audit log of all verification attempts |
| `user_profiles` | Read (Optional) | Enhanced logging with display names |

**Blockchain Interaction:**
- Uses viem `multicall` for efficient batch ownership checks
- Single RPC call checks all 333 Star token IDs per wallet
- ~150ms per wallet on Monad RPC
- Checks last 100 blocks for verification transactions
- Validates transaction sender, recipient, amount, and timestamp

### PM2 Commands

Manage the Discord bot using pm2:

```bash
# Check bot status
pm2 status

# View real-time logs
pm2 logs swo-bot

# Restart the bot
pm2 restart swo-bot

# Stop the bot
pm2 stop swo-bot

# Start the bot (if stopped)
pm2 start swo-bot

# View detailed info
pm2 info swo-bot
```

### RPC Usage

The bot is optimized to minimize RPC usage:

- **Per Sync Cycle**: ~1 multicall request per Discord-connected wallet
- **Example with 12 wallets**: 12 RPC requests every 5 minutes
- **Daily Total**: ~3,456 requests/day (12 wallets × 12 syncs/hour × 24 hours)
- **Well within limits**: Public Monad RPC can handle this easily

**Why Multicall?**
- Instead of 333 separate RPC calls per wallet (checking each Star token individually)
- Uses a single batched multicall to check all 333 tokens at once
- Reduces RPC usage by ~99.7%

### Database Dependencies

The bot integrates with the main SWO database:

| Table | Usage |
|-------|-------|
| `social_connections` | Reads Discord user IDs linked to wallet addresses (where `platform='discord'`) |
| `user_profiles` | (Optional) Can read display names for enhanced logging |

**SQL Query Example**:
```sql
SELECT wallet_address, platform_user_id, platform_username 
FROM social_connections 
WHERE platform = 'discord';
```

### Star Skrumpey Token IDs

The bot uses the same list of 333 Star Skrumpey token IDs as the main application:
- **Source File**: `constellation_token_ids.csv` or `constellation_token_ids.txt`
- **Application Reference**: `lib/starSkrumpey.ts` - `STAR_SKRUMPEY_IDS` constant
- **Total Count**: 333 tokens

### Bot Troubleshooting

Common issues and solutions when working with the Discord bot:

**"Transaction Not Found" Error:**
- **Symptom**: User clicks "Verify Transaction" but bot can't find the transfer
- **Solutions**:
  - Wait for transaction to confirm on blockchain (check on monadscan.com)
  - Ensure sending FROM the correct wallet (not TO it)
  - Ensure sending TO the verification address (check VERIFICATION_ADDRESS in .env.bot)
  - Transaction must be within last 100 blocks (~5-10 minutes on Monad)
  - Transaction must occur AFTER starting verification (prevents replay attacks)

**"Configuration Error" Message:**
- **Symptom**: Bot shows "Configuration Error" when user runs `/link`
- **Solution**: Check that `VERIFICATION_ADDRESS` is set in `.env.bot` file

**Roles Not Updating:**
- **Symptom**: User has Stars but doesn't get holder role
- **Solutions**:
  - Check bot has "Manage Roles" permission in Discord server settings
  - Check bot's role is ABOVE holder tier roles in server role hierarchy
  - Verify role IDs in `.env.bot` match Discord server role IDs
  - Check bot logs: `pm2 logs swo-bot` for errors

**Database Errors:**
- **Symptom**: Bot crashes with SQLite errors
- **Solutions**:
  - Check bot has write permissions on `DB_PATH` directory
  - Check database file isn't locked by another process
  - Check disk space on server (`df -h`)
  - Try restarting bot: `pm2 restart swo-bot`

**Commands Not Showing in Discord:**
- **Symptom**: Slash commands don't appear when user types `/`
- **Solutions**:
  - Wait 5-10 minutes for Discord to sync commands globally
  - Check `DISCORD_CLIENT_ID` is correct in `.env.bot`
  - Check `DISCORD_GUILD_ID` matches your Discord server
  - Restart bot to re-register commands: `pm2 restart swo-bot`
  - Check bot logs for command registration errors

**RPC Rate Limiting:**
- **Symptom**: Bot logs show RPC errors or timeouts
- **Solutions**:
  - Switch to alternative Monad RPC endpoint in `MONAD_RPC`
  - Increase `SYNC_INTERVAL_MS` to reduce request frequency
  - Check Monad RPC status at status.monad.xyz

### Implementation Reference

For detailed implementation guide and complete code examples, see:
- **Full Documentation**: `docs/DISCORD_BOT_WALLET_VERIFICATION.md`
- **Bot Source Code**: `/opt/star_world_order/SWO_bot/index.ts` (on server, outside repository)

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
- **Star Skrumpeys**: 333 NFTs with Star constellation trait
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

## Star Skrumpey Token IDs (333 total)

Star Skrumpeys are Skrumpey NFTs with the Star constellation trait. The following 333 token IDs have been identified:

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

**Database Location**: `/opt/swo/data/swo.db` (shared PROD database, backed up daily to `/opt/swo/backups/`)

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

### star_skrumpey_metadata

**⚠️ IMPORTANT: PRIMARY SOURCE OF TRUTH FOR NFT METADATA**

Stores cached IPFS metadata for all 333 Star Skrumpey NFTs. This table contains the **correct constellation data** and should be used instead of making IPFS requests.

```sql
CREATE TABLE IF NOT EXISTS star_skrumpey_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  constellation TEXT,        -- CRITICAL: This is the CORRECT constellation type
  aura TEXT,
  background TEXT,
  eyes TEXT,
  form TEXT,
  mood TEXT,
  attributes_json TEXT,      -- Full attributes array from IPFS
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_star_skrumpey_metadata_token ON star_skrumpey_metadata(token_id);
CREATE INDEX idx_star_skrumpey_metadata_constellation ON star_skrumpey_metadata(constellation);
```

**Why Use Database Instead of IPFS?**
- ✅ **Performance**: O(1) local lookup vs network request
- ✅ **Reliability**: No IPFS gateway timeouts or rate limits
- ✅ **Accuracy**: Pre-validated data from IPFS, cached locally
- ✅ **Efficiency**: Batch lookups using `getStarSkrumpeyMetadataBatch()`

**Available Database Functions** (from `lib/db.ts`):

```typescript
// Single token lookup
getStarSkrumpeyMetadata(tokenId: number): StarSkrumpeyMetadata | null

// Batch lookup (use this for multiple tokens!)
getStarSkrumpeyMetadataBatch(tokenIds: number[]): Map<number, StarSkrumpeyMetadata>

// Get all 333 Star Skrumpeys
getAllStarSkrumpeyMetadata(): StarSkrumpeyMetadata[]

// Insert/update metadata
upsertStarSkrumpeyMetadata(data: {...}): StarSkrumpeyMetadata

// Get constellation distribution stats
getConstellationDistribution(): Record<string, number>
```

**Example Usage**:

```typescript
// ❌ WRONG: Don't fetch from IPFS for every token
for (const tokenId of tokenIds) {
  const metadata = await fetch(`https://ipfs.../\${tokenId}`);
}

// ✅ CORRECT: Use database batch lookup
import { getStarSkrumpeyMetadataBatch } from '@/lib/db';
const metadataMap = getStarSkrumpeyMetadataBatch(tokenIds);
const constellation = metadataMap.get(tokenId)?.constellation;
```

**Repopulating Metadata**:
```bash
npm run db:fetch-metadata  # Fetches all 333 Star Skrumpeys from IPFS and stores in DB
```

**Implementation**: See `lib/db.ts`

---

### user_xp

Stores experience points and level for each user.

```sql
CREATE TABLE IF NOT EXISTS user_xp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL UNIQUE,
  total_xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_xp_wallet ON user_xp(wallet_address);
CREATE INDEX idx_user_xp_level ON user_xp(level DESC);
```

**Level Calculation Formula**:
```typescript
// Level = floor(sqrt(XP / 100)) + 1
// Level 1: 0-99 XP
// Level 2: 100-399 XP
// Level 3: 400-899 XP
// Level 4: 900-1599 XP
// etc.
function calculateLevelFromXP(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}
```

### quests

Quest definitions for the quest system.

```sql
CREATE TABLE IF NOT EXISTS quests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  xp_reward INTEGER NOT NULL DEFAULT 100,
  quest_type TEXT NOT NULL CHECK (quest_type IN ('daily', 'weekly', 'one_time', 'urgent')),
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('social', 'trading', 'governance', 'community', 'general')),
  requirements_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  icon TEXT DEFAULT '⭐',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME
);

CREATE INDEX idx_quests_type ON quests(quest_type, is_active);
CREATE INDEX idx_quests_priority ON quests(priority DESC, is_active);
```

**Quest Types**:
| Type | Description |
|------|-------------|
| `urgent` | High-priority quests shown prominently (e.g., "Follow on X") |
| `one_time` | Quests that can only be completed once per user |
| `daily` | Quests that reset daily |
| `weekly` | Quests that reset weekly |

### user_quests

User quest progress tracking.

```sql
CREATE TABLE IF NOT EXISTS user_quests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'in_progress', 'completed', 'claimed')),
  progress INTEGER NOT NULL DEFAULT 0,
  started_at DATETIME,
  completed_at DATETIME,
  claimed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, quest_id),
  FOREIGN KEY (quest_id) REFERENCES quests(id)
);

CREATE INDEX idx_user_quests_wallet ON user_quests(wallet_address, status);
CREATE INDEX idx_user_quests_quest ON user_quests(quest_id, status);
```

**Quest Status Flow**:
```
available → in_progress → completed → claimed
```

### notifications

Stores user notifications for quests, achievements, system alerts, etc. **Supports global notifications** by using `wallet_address = 'global'`.

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,  -- Use 'global' for notifications visible to all users
  type TEXT NOT NULL CHECK (type IN ('quest', 'achievement', 'system', 'social', 'governance')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  icon TEXT DEFAULT '🔔',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_wallet ON notifications(wallet_address, is_read, created_at DESC);
CREATE INDEX idx_notifications_type ON notifications(type, created_at DESC);
```

**Notification Types**:
| Type | Description |
|------|-------------|
| `quest` | New quest available, quest rewards |
| `achievement` | Badge unlocked |
| `system` | Important announcements |
| `social` | Community activity |
| `governance` | DAO proposals and votes |

**Global Notifications**:
- Set `wallet_address = 'global'` to create notifications visible to ALL users
- User queries automatically include both user-specific AND global notifications
- Global notifications bypass user notification settings
- Useful for important announcements, system-wide updates, emergency alerts

**Example Usage**:
```typescript
// Create global notification (visible to everyone)
createNotification('GLOBAL', {
  type: 'system',
  title: 'Maintenance Notice',
  message: 'Scheduled maintenance tonight at 10 PM UTC',
  icon: '⚠️'
});

// Create user-specific notification
createNotification('0x1234...', {
  type: 'quest',
  title: 'Quest Completed!',
  message: 'You earned 100 XP',
});
```

### notification_settings

User preferences for notification types.

```sql
CREATE TABLE IF NOT EXISTS notification_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL UNIQUE,
  quest_notifications INTEGER NOT NULL DEFAULT 1,
  achievement_notifications INTEGER NOT NULL DEFAULT 1,
  system_notifications INTEGER NOT NULL DEFAULT 1,
  social_notifications INTEGER NOT NULL DEFAULT 1,
  governance_notifications INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notification_settings_wallet ON notification_settings(wallet_address);
```

### friends

Stores friend relationships between users.

```sql
CREATE TABLE IF NOT EXISTS friends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_address TEXT NOT NULL,
  friend_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_address, friend_address)
);

CREATE INDEX idx_friends_user ON friends(user_address, status);
CREATE INDEX idx_friends_friend ON friends(friend_address, status);
```

**Friend Status**:
| Status | Description |
|--------|-------------|
| `pending` | Friend request sent, awaiting response |
| `accepted` | Mutual friends |
| `blocked` | User has blocked this person |

### direct_messages

Stores private messages between users.

```sql
CREATE TABLE IF NOT EXISTS direct_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_address TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dm_sender ON direct_messages(sender_address, created_at DESC);
CREATE INDEX idx_dm_recipient ON direct_messages(recipient_address, is_read, created_at DESC);
CREATE INDEX idx_dm_conversation ON direct_messages(sender_address, recipient_address, created_at DESC);
```

**Available Database Functions** (from `lib/db.ts`):

```typescript
// XP Functions
getUserXP(walletAddress: string): UserXP
addUserXP(walletAddress: string, xpAmount: number): UserXP
getXPProgress(totalXP: number): { currentLevelXP, requiredForNextLevel, percentage, level }
getXPLeaderboard(limit: number): Array<UserXP & { rank: number }>

// Quest Functions
getActiveQuests(): Quest[]
getQuestsByType(questType: string): Quest[]
getUrgentQuests(): Quest[]
getQuestById(questId: string): Quest | null
getUserQuests(walletAddress: string): UserQuest[]
getQuestsWithProgress(walletAddress: string): Array<Quest & { userProgress, canClaim }>
startQuest(walletAddress: string, questId: string): UserQuest
completeQuest(walletAddress: string, questId: string): UserQuest | null
claimQuestReward(walletAddress: string, questId: string): { success, xpClaimed, error? }

// Notification Functions
createNotification(walletAddress: string, data: { type, title, message, link?, icon? }): Notification
getNotifications(walletAddress: string, options?: { unreadOnly?, limit?, offset? }): Notification[]
getUnreadNotificationCount(walletAddress: string): number
markNotificationRead(notificationId: number): void
markAllNotificationsRead(walletAddress: string): void
deleteNotification(notificationId: number): void
cleanupOldNotifications(): void
getNotificationSettings(walletAddress: string): NotificationSettings | null
updateNotificationSettings(walletAddress: string, settings: { ...NotificationFlags }): NotificationSettings

// Friends Functions
sendFriendRequest(userAddress: string, friendAddress: string): Friend | null
acceptFriendRequest(userAddress: string, friendAddress: string): Friend | null
declineFriendRequest(userAddress: string, friendAddress: string): boolean
removeFriend(userAddress: string, friendAddress: string): boolean
blockUser(userAddress: string, blockAddress: string): Friend | null
getFriends(userAddress: string): FriendWithProfile[]
getPendingFriendRequests(userAddress: string): FriendWithProfile[]
getOutgoingFriendRequests(userAddress: string): FriendWithProfile[]
areFriends(userAddress: string, otherAddress: string): boolean
getFriendshipStatus(userAddress: string, otherAddress: string): { status, friend? }
getPendingFriendRequestCount(userAddress: string): number

// Direct Message Functions
sendDirectMessage(senderAddress: string, recipientAddress: string, message: string): DirectMessage | null
getConversation(userAddress: string, otherAddress: string, limit?, offset?): DirectMessageWithProfile[]
getConversations(userAddress: string): Conversation[]
markMessagesAsRead(recipientAddress: string, senderAddress: string): void
markMessageAsRead(messageId: number): void
getUnreadMessageCount(userAddress: string): number
deleteMessage(messageId: number, senderAddress: string): boolean

// Database Backup
createDatabaseBackup(backupDir?: string): string
listDatabaseBackups(backupDir?: string): Array<{ filename, path, timestamp, size }>
cleanupOldBackups(keepCount?: number, backupDir?: string): number

// Raffle Functions
getRaffleById(raffleId: string): Raffle | null
getRaffles(status?: string): Raffle[]
getActiveRaffles(): Raffle[]
getUpcomingRaffles(): Raffle[]
getPastRaffles(): Raffle[]
createRaffle(data: {...}): Raffle
enterRaffle(data: { raffleId, walletAddress, starCount, discordBonus?, engagementBonus? }): RaffleEntry
getRaffleEntry(raffleId: string, walletAddress: string): RaffleEntry | null
getRaffleEntries(raffleId: string): RaffleEntryWithProfile[]
getRaffleTotalEntries(raffleId: string): { participants: number; totalTickets: number }
drawRaffleWinner(raffleId: string, blockHash: string): { success, winner?, seed?, error? }
endRaffle(raffleId: string): boolean
cancelRaffle(raffleId: string): boolean
hasViewedRaffleResult(raffleId: string, walletAddress: string): boolean
markRaffleResultViewed(raffleId: string, walletAddress: string): void
getUserRaffleEntries(walletAddress: string): UserRaffleHistory[]
calculateHolderTier(starCount: number): HolderTier

// Admin Functions
getAllUsersWithSocialConnections(options?: { limit?, offset?, search? }): UserWithSocialData[]
getUserCount(): number
getAllNotifications(options?: { limit?, offset?, type? }): Notification[]
getNotificationCount(): number
updateNotification(notificationId: number, data: { title?, message?, type?, icon?, link? }): Notification | null
getDatabaseStats(): DatabaseStats
cleanupChatMessages(olderThanHours?: number): number
cleanupOnlinePresence(olderThanMinutes?: number): number
cleanupDirectMessages(olderThanDays?: number): number
cleanupRaffleResultViews(olderThanDays?: number): number
getDrawnRaffles(limit?: number): Raffle[]
```

### raffles

Stores raffle definitions and state.

```sql
CREATE TABLE IF NOT EXISTS raffles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  prize_description TEXT NOT NULL,
  prize_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'drawn', 'cancelled')),
  created_by TEXT NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  winner_address TEXT,
  winner_drawn_at DATETIME,
  winner_draw_seed TEXT,
  discord_bonus_enabled INTEGER NOT NULL DEFAULT 0,
  require_x INTEGER NOT NULL DEFAULT 0,
  require_discord INTEGER NOT NULL DEFAULT 0,
  tweet_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_raffles_status ON raffles(status, end_time);
```

**Raffle Status Flow**:
```
active → ended/drawn/cancelled
```

### raffle_entries

Stores user entries for each raffle.

```sql
CREATE TABLE IF NOT EXISTS raffle_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raffle_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  tier TEXT NOT NULL,
  entries_count INTEGER NOT NULL,
  discord_bonus INTEGER NOT NULL DEFAULT 0,
  engagement_bonus INTEGER NOT NULL DEFAULT 0,
  star_count INTEGER NOT NULL,
  entered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (raffle_id) REFERENCES raffles(id),
  UNIQUE(raffle_id, wallet_address)
);

CREATE INDEX idx_raffle_entries_raffle ON raffle_entries(raffle_id);
CREATE INDEX idx_raffle_entries_wallet ON raffle_entries(wallet_address);
```

### Holder Tiers

Entry counts are based on how many Star Skrumpeys a user holds:

| Tier | Stars Required | Entries |
|------|----------------|---------|
| **Cosmic Emperor** | 10+ | 4 |
| **Star Lord** | 5-9 | 3 |
| **Cosmic Warden** | 2-4 | 2 |
| **Star Forged** | 1 | 1 |

### Verifiable Randomness

Winner selection uses cryptographically verifiable randomness:

1. **Seed Generation**: `${blockHash}-${raffleId}-${timestamp}-${entryCount}`
2. **Hash**: SHA-256 of the seed string
3. **Selection**: First 4 bytes converted to 32-bit unsigned integer
4. **Winner Index**: `hashNumber % totalWeightedEntries`

This ensures:
- ✅ **Deterministic**: Same seed always produces same winner
- ✅ **Verifiable**: Anyone can verify the hash calculation
- ✅ **Transparent**: Seed is stored and displayed publicly

**Verification Example:**
```javascript
const crypto = require('crypto');

// Given a stored seed like: "0xabc123...-raffle-123456-1735600000000-5"
const seedString = "blockHash-raffleId-timestamp-entryCount";
const hashBuffer = crypto.createHash('sha256').update(seedString).digest();
const hashNumber = hashBuffer.readUInt32BE(0);
const winnerIndex = hashNumber % totalWeightedEntries;
// Winner is the entry at winnerIndex in the weighted entry pool
```

### Auto-Draw Mechanism

Raffles are automatically drawn when their end time passes. This is implemented via **lazy auto-draw** on API requests:

**Implementation** (`app/api/raffle/route.ts`):

```typescript
// Called at the start of every GET /api/raffle request
async function autoDrawEndedRaffles(): Promise<void> {
  // Get raffles that: status='active', end_time <= now, no winner yet
  const rafflesToDraw = getRafflesNeedingDraw();
  
  // Get latest block hash for randomness
  const block = await client.getBlock({ blockTag: 'latest' });
  const blockHash = block.hash || `fallback-${Date.now()}`;
  
  // Draw each raffle
  for (const raffle of rafflesToDraw) {
    drawRaffleWinner(raffle.id, blockHash);
  }
}
```

**When Auto-Draw Runs:**
- Every time a user visits `/raffle` page (triggers GET request)
- Every time API fetches raffle data
- No cron job needed - draws happen on-demand

**Fallback Randomness:**
If RPC block fetch fails, a fallback seed is used: `fallback-${Date.now()}-${Math.random().toString(36)}`

### Winner Animation System

When a raffle is drawn, participants see a one-time animation:

**Animation Types:**
| Animation | Shown To | Trigger |
|-----------|----------|---------|
| **WinAnimation** | Winner only | First visit to raffle page after draw |
| **LoseAnimation** | Non-winning participants | First visit to raffle page after draw |
| **EntryConfirmation** | User who just entered | Immediately after successful entry |

**Animation Flow:**
1. User visits `/raffle` page
2. `fetchRaffles()` checks both active AND past raffles
3. For drawn raffles where user participated:
   - Check `raffle_result_views` table if user has viewed
   - If not viewed → show Win or Lose animation
   - Mark as viewed via `markViewed` API action
4. Animation only shows once per raffle per user

**Database Table** (`raffle_result_views`):
```sql
CREATE TABLE raffle_result_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raffle_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(raffle_id, wallet_address)
);
```

**Implementation** (`app/raffle/RaffleContent.tsx`):
- `checkAndShowResultAnimation()` - Helper to check and trigger animation
- Checks past raffles first (most common case)
- Checks active raffles as fallback (edge case)
- Only shows one animation per page load

### Social Requirements

Raffles can optionally require social connections:

| Field | Type | Description |
|-------|------|-------------|
| `require_x` | INTEGER (0/1) | Require X (Twitter) connection |
| `require_discord` | INTEGER (0/1) | Require Discord connection |
| `discord_bonus_enabled` | INTEGER (0/1) | +1 entry for Discord members (deprecated) |

**Checking Requirements** (API side):
```typescript
const socialConnections = checkSocialConnections(walletAddress);

if (raffle.require_x && !socialConnections.hasX) {
  // Block entry
}
if (raffle.require_discord && !socialConnections.hasDiscord) {
  // Block entry
}
```

**UI Display:**
- Requirements section only shows if `require_x === 1` or `require_discord === 1`
- Green checkmark ✓ if connected, red X if not
- Link to profile settings to connect accounts

### Engagement Bonus (Like & RT)

Users can earn +1 bonus entry by liking and retweeting the raffle announcement:

**Flow:**
1. Admin sets `tweet_url` when creating raffle
2. User clicks tweet link, likes & retweets
3. User clicks "CLAIM +1 ENTRY FOR LIKE & RT"
4. Entry is updated with `engagement_bonus = 1`

**Honor System:**
- Entries are tracked with timestamps
- Admin can export CSV and manually verify via Twitter
- Fraudulent claims can be disqualified before winner announcement

**Implementation Files:**
- `app/raffle/RaffleContent.tsx` - UI for raffle cards and animations
- `app/api/raffle/route.ts` - API endpoints and auto-draw
- `lib/db.ts` - Database functions (3500+ lines, raffle section starts ~line 2900)

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/metadata` | GET | Get NFT metadata by tokenId(s) - **uses database first, IPFS fallback** |
| `/api/treasury` | GET | Get treasury wallet data including MON balance and all NFT holdings (uses **Magic Eden API** with SQLite cache, floor prices show "Coming soon ~DN") |

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
| `/api/members` | GET | Get all Star Skrumpey holders with profiles (5-min cache) |
| `/api/holder-stats` | GET | Get holder count history for charts |
| `/api/cron/refresh-holders` | GET | Cron endpoint to refresh holder data (requires `CRON_SECRET`) |
| `/api/quests` | GET | Get quests with optional user progress (params: `address`, `type`, `urgentOnly`) |
| `/api/quests` | POST | Start, complete, or claim a quest (body: `walletAddress`, `questId`, `action`) |
| `/api/user-xp` | GET | Get user's XP and level (params: `address`, `leaderboard`, `limit`) |
| `/api/user-xp` | POST | Add XP to user (body: `walletAddress`, `xpAmount`, `reason`) |
| `/api/notifications` | GET | Get notifications for user (params: `address`, `unreadOnly`, `limit`, `settings`) - **includes global notifications** |
| `/api/notifications` | POST | Create notification or update settings (body: `walletAddress` (or 'GLOBAL' for all users), `type`, `title`, `message`) |
| `/api/notifications` | PATCH | Mark notification(s) as read (body: `walletAddress`, `action`, `notificationId`) |
| `/api/notifications` | DELETE | Delete a notification (params: `id`) |
| `/api/notifications/test` | GET | Get usage info for test endpoint |
| `/api/notifications/test` | POST | Create test notifications (body: `walletAddress`, `testType`) |
| `/api/friends` | GET | Get friends list, pending requests, or friendship status |
| `/api/friends` | POST | Send/accept/decline friend request, remove/block user |
| `/api/messages` | GET | Get conversations or specific conversation messages |
| `/api/messages` | POST | Send a direct message |
| `/api/messages` | PATCH | Mark messages as read |
| `/api/messages` | DELETE | Delete a message (sender only) |
| `/api/raffle` | GET | Get raffles (params: `type=active\|upcoming\|past\|all`, `id`, `address`, `export=csv`) |
| `/api/raffle` | POST | Enter raffle or admin actions (body: `action`, `walletAddress`, `raffleId`, etc.) |
| `/api/governance` | GET | Get proposals, votes, and Snapshot status (params: `action`, `id`, `state`, `category`, `address`) |
| `/api/governance` | POST | Create proposals, cast votes, change votes, cancel proposals |
| `/api/floor-prices` | GET | **Public API**: Get floor prices for all Monad NFT collections |
| `/api/cron/refresh-floor-prices` | GET | Cron endpoint to refresh floor prices (requires `CRON_SECRET`) |

### Governance API

The governance API provides DAO voting functionality with optional Snapshot.org verification.

**GET /api/governance**

Query parameters:
- `action`: Action to perform
  - `proposals`: Get all proposals (supports `state` and `category` filters)
  - `proposal`: Get single proposal by `id`
  - `votes`: Get votes for proposal by `id`
  - `hasVoted`: Check if address has voted (requires `id` and `address`)
  - `userVote`: Get user's vote (requires `id` and `address`)
  - `canChangeVote`: Check if vote can be changed (requires `id`)
  - `canCancel`: Check if proposer can cancel (requires `id` and `address`)
  - `snapshotStatus`: Get Snapshot.org configuration status
  - `verifySnapshot`: Verify database votes against Snapshot (requires `id`)

**POST /api/governance**

Actions:
- `createProposal`: Create new proposal (body: `title`, `description`, `proposerAddress`, `votingDurationWeeks`, `category`)
- `vote`: Cast a vote (body: `proposalId`, `voterAddress`, `support` (0/1/2), `votingPower`, `reason`)
- `changeVote`: Change existing vote within 24h window (body: `proposalId`, `voterAddress`, `newSupport`, `reason`)
- `cancelProposal`: Cancel proposal as proposer (body: `proposalId`, `userAddress`)
- `updateState`: Update proposal state (body: `proposalId`, `newState`, `defeatReason`)

**Three-Way Voting:**
- `0` = No (Against)
- `1` = Yes (For)
- `2` = Abstain

### Floor Prices API (SWO Product)

This is a **public API product** offered by Star World Order that serves NFT floor prices for Monad collections.

> **⚠️ NOTE:** Magic Eden and OpenSea do not provide public APIs for Monad floor prices. Floor price data must be **manually entered by admins** via the database or admin panel. The API serves whatever data has been manually entered.

**GET /api/floor-prices**

Query parameters:
- `contract` (optional): Filter by specific contract address
- `limit` (optional): Limit results (default: 100, max: 500)
- `sortBy` (optional): Sort field - `floor_price`, `volume`, `volume_total`, `sales`, `holders`, `listed`, `name` (default: `floor_price`)
- `sortOrder` (optional): Sort order - `asc`, `desc` (default: `desc`)
- `verified` (optional): Filter to verified collections only - `true`, `false`

**Example Usage:**

```bash
# Get all collections sorted by floor price
curl https://starworldorder.com/api/floor-prices

# Get specific collection by contract
curl "https://starworldorder.com/api/floor-prices?contract=0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0"

# Get top 10 by 24h volume
curl "https://starworldorder.com/api/floor-prices?limit=10&sortBy=volume"

# Get verified collections only
curl "https://starworldorder.com/api/floor-prices?verified=true"
```

**Response Format:**

```json
{
  "success": true,
  "data": {
    "collections": [
      {
        "contractAddress": "0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0",
        "name": "Skrumpeys",
        "symbol": "SKRUMP",
        "imageUrl": "https://...",
        "floorPriceMON": 5.25,
        "floorPriceUSD": 26.25,
        "listedCount": 142,
        "volume24h": 1250.5,
        "volumeTotal": 45000.0,
        "salesCount24h": 85,
        "holdersCount": 1200,
        "source": "manual",
        "isVerified": true,
        "updatedAt": "2024-12-30T01:00:00.000Z"
      }
    ],
    "totalCollections": 150,
    "lastUpdated": "2024-12-30T01:00:00.000Z",
    "nextUpdate": "2024-12-30T01:15:00.000Z",
    "cacheTTLSeconds": 900
  }
}
```

**Features:**
- ✅ **SQLite persistence** - Data stored in database
- ✅ **CORS enabled** - Can be called from any domain
- ✅ **No API key required** - Free public access
- ✅ **15-minute cache** - In-memory caching for performance

**Data Entry:**

Floor price data must be manually entered into the `nft_floor_prices` database table. Use the `upsertFloorPrice()` function from `lib/floorPrices.ts` or direct SQL:

```sql
INSERT INTO nft_floor_prices (contract_address, name, floor_price_mon, source)
VALUES ('0x...', 'Collection Name', 5.25, 'manual');
```

### Raffle API

The Cosmic Raffle system allows Star Skrumpey holders to participate in exclusive giveaways.

**GET /api/raffle**

Query parameters:
- `type`: `active` | `upcoming` | `past` | `all` | `history` (default: `all`)
- `id`: Get specific raffle by ID
- `address`: User's wallet address (for entry status)
- `export`: `csv` to download participant list (admin only)

**Example Response:**

```json
{
  "success": true,
  "raffles": [
    {
      "id": "raffle-1234567890-abc123",
      "name": "Cosmic Giveaway #1",
      "description": "Win a Star Skrumpey NFT!",
      "prize_description": "1 Star Skrumpey NFT",
      "prize_image_url": "https://...",
      "status": "active",
      "start_time": "2024-12-30T00:00:00.000Z",
      "end_time": "2025-01-06T23:59:59.000Z",
      "winner_address": null,
      "discord_bonus_enabled": true,
      "require_x": false,
      "require_discord": false,
      "tweet_url": "https://x.com/StrWorldOrder/status/..."
    }
  ],
  "holderTiers": {
    "cosmic_emperor": { "minStars": 10, "entries": 4 },
    "star_lord": { "minStars": 5, "entries": 3 },
    "cosmic_warden": { "minStars": 2, "entries": 2 },
    "star_forged": { "minStars": 1, "entries": 1 }
  }
}
```

**POST /api/raffle**

Actions:
- `enter`: Enter a raffle (requires `walletAddress`, `raffleId`)
- `create`: Create new raffle (admin only)
- `draw`: Draw winner (admin only)
- `end`: End raffle without drawing (admin only)
- `cancel`: Cancel raffle (admin only)
- `markViewed`: Mark raffle result as viewed

**Enter Raffle Example:**

```json
{
  "action": "enter",
  "walletAddress": "0x...",
  "raffleId": "raffle-1234567890-abc123",
  "discordBonus": false,
  "engagementBonus": true
}
```

**Bonus Entry Options:**
- **Discord Bonus** (+1): For Discord server members
- **Engagement Bonus** (+1): For users who like & retweet the raffle announcement tweet

**Like & RT Verification:**

The engagement bonus uses an **honor-based system** where users claim their bonus after completing the social action. This approach is standard in the NFT space because:

1. **Twitter/X API Limitations**: Twitter's API access is restricted and expensive
2. **Manual Verification**: Admins can export CSV and manually verify claims via Twitter's web interface
3. **Community Trust**: Works well for smaller, community-focused giveaways
4. **Simplicity**: No complex integrations required

**Verification Process:**
1. User clicks the tweet link and likes/retweets
2. User clicks "CLAIM +1 ENTRY FOR LIKE & RT"
3. Claim is recorded with timestamp
4. Admin can download CSV export to manually verify claims if needed
5. Fraudulent claims can be disqualified before winner announcement

**Social Requirements:**
Raffles can require users to have connected:
- X (Twitter) account (`require_x: true`)
- Discord account (`require_discord: true`)

Users must connect these accounts in their profile settings before entering.

### Friends API

**GET /api/friends**

Query parameters:
- `address` (required): User's wallet address
- `type`: `all` (default) | `pending` | `outgoing` | `status`
- `otherAddress`: Required for `type=status` - check friendship status with this address

**POST /api/friends**

Body:
```json
{
  "walletAddress": "0x...",
  "targetAddress": "0x...",
  "action": "send" | "accept" | "decline" | "remove" | "block"
}
```

### Direct Messages API

**GET /api/messages**

Query parameters:
- `address` (required): User's wallet address
- `type`: `conversations` (default) | `conversation` | `unread`
- `otherAddress`: Required for `type=conversation`
- `limit`: Number of messages (default 50)
- `offset`: Pagination offset

**POST /api/messages**

Body:
```json
{
  "senderAddress": "0x...",
  "recipientAddress": "0x...",
  "message": "Hello!"
}
```

### Testing Notifications

The `/api/notifications/test` endpoint allows you to create test notifications for any wallet address.

**Example usage:**

```bash
# Create all types of test notifications
curl -X POST http://localhost:3000/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "0x1234...", "testType": "all"}'

# Create a specific type of notification
curl -X POST http://localhost:3000/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "0x1234...", "testType": "quest"}'
```

**Available test types:** `all`, `quest`, `achievement`, `system`, `social`, `governance`

Notifications have two statuses:
- **Unread** (`is_read = 0`): Shows with a colored dot indicator
- **Read** (`is_read = 1`): No indicator, dimmed appearance

Click on a notification to mark it as read, or use "Mark all read" to clear all unread notifications.

**Base URL**: `https://starworldorder.com` (production)

### Admin API

The Admin API provides administrative functions for site management. All endpoints require admin authentication via signed message.

**Authentication:**
All admin endpoints require the `x-admin-auth` header with format: `address:timestamp:signature`

**GET /api/admin**

Query parameters:
- `action`: Action to perform
  - `health` (default): Get system health status and cache statistics
  - `notifications`: Get notifications for a specific wallet (requires `wallet` param)
  - `allNotifications`: Get all notification history (params: `limit`, `offset`, `type`)
  - `users`: Get all users with social connections (params: `limit`, `offset`, `search`)
  - `dbStats`: Get database statistics
  - `drawnRaffles`: Get drawn raffles with winners (params: `limit`)

**POST /api/admin**

Actions:
- `clearCache`: Clear all BlockVision and Treasury caches
- `createNotification`: Create a notification (body: `walletAddress` or 'GLOBAL', `type`, `title`, `message`, `link?`, `icon?`)
- `deleteNotification`: Delete a notification (body: `notificationId`)
- `updateNotification`: Update notification (body: `notificationId`, `title?`, `message?`, `type?`, `icon?`, `link?`)
- `markAllRead`: Mark all notifications as read (body: `walletAddress`)
- `cleanupNotifications`: Delete notifications older than 30 days
- `broadcastNotification`: Send to multiple wallets (body: `walletAddresses[]`, `type`, `title`, `message`)
- `cleanupChatMessages`: Delete chat messages (body: `olderThanHours`)
- `cleanupOnlinePresence`: Delete stale presence (body: `olderThanMinutes`)
- `cleanupDirectMessages`: Delete DMs (body: `olderThanDays`)
- `cleanupRaffleResultViews`: Delete raffle views (body: `olderThanDays`)

**Database Cleanup Functions:**

| Action | Default | Description |
|--------|---------|-------------|
| `cleanupChatMessages` | 24 hours | Deletes chat messages older than specified hours |
| `cleanupOnlinePresence` | 10 minutes | Deletes stale presence records |
| `cleanupDirectMessages` | 90 days | Deletes direct messages older than specified days |
| `cleanupRaffleResultViews` | 30 days | Deletes raffle result view records |

---

## Magic Eden API Integration

Star World Order uses Magic Eden's public Monad API for fetching NFT collection holdings.

### Overview

Magic Eden provides a free public API for Monad with no API key required:
- **User collections** - Get all NFT collections owned by a wallet
- **Collection metadata** - Names, images, verification status
- **Owned counts** - Number of NFTs owned per collection
- **Rate limit**: 180 requests per minute (free tier)

**Note**: Floor prices are not yet supported by Magic Eden for Monad. The UI displays "Coming soon ~DN" for floor price estimates.

### Why Magic Eden?

The previous RPC-based approach failed because:
1. **ERC721Enumerable Not Supported** - Most Monad NFT contracts don't implement ERC721Enumerable interface
2. **BlockVision API Quota Exhausted** - $200+/month costs exceeded
3. **Invalid Contract Addresses** - Some tracked addresses were malformed

Magic Eden solves these issues with:
- ✅ Works with any NFT contract (no interface requirements)
- ✅ Free tier with 180 QPM rate limit
- ✅ No API key required
- ✅ Collection-level data (faster than token-by-token)

### API Endpoints

**POST** `https://api-mainnet.magiceden.dev/v4/evm-public/collections/user-collections`

Request body:
```json
{
  "chain": "monad",
  "walletAddresses": ["0xa209cfb0c8abdf5e3e3e7f4628214bdb597d55af"]
}
```

Response:
```json
{
  "collections": [
    {
      "contract": "0xB0DAD798C80e40Dd6b8E8545074C6a5B7B97D2c0",
      "name": "Skrumpeys",
      "ownedCount": 25,
      "media": {
        "url": "https://..."
      },
      "verified": true
    }
  ]
}
```

### Caching Strategy

To minimize API usage:

1. **In-Memory Cache**: Collection data cached for 1 hour per address
2. **SQLite Cache**: Treasury NFT data cached for 24 hours
3. **Rate Limiting**: Exponential backoff on 429 errors (2s, 4s, 8s delays)
4. **Graceful Degradation**: Returns empty result after 3 retry attempts

**Implementation**: See `lib/magiceden.ts`

---

## BlockVision API Integration (Floor Prices Only)

Star World Order optionally uses BlockVision's Monad Indexing API for fetching collection floor prices.

### Overview

BlockVision provides indexed blockchain data through a REST API:
- **Collection floor prices** (for treasury value calculation)
- Token balances (optional fallback)
- Account activity and transactions (optional)

**Note**: NFT holdings are now fetched via Magic Eden API. BlockVision is only used for floor prices if API key is available. Floor prices are currently not available on Monad and display as "Coming soon ~DN".

### Configuration

Add to `.env.local`:

```bash
BLOCKVISION_API=your-api-key-here
BLOCKVISION_RPC=https://monad-mainnet.blockvision.org/v1/your-api-key  # Optional
BLOCKVISION_WEBSOCKET=wss://monad-mainnet.blockvision.org/v1/your-api-key  # Optional
```

### Rate Limits (Free Tier)

| Metric | Free Tier | Lite | Basic | Pro |
|--------|-----------|------|-------|-----|
| Compute Units/month | 10,000,000 | 100,000,000 | 600,000,000 | 1,500,000,000 |
| CU/second | 300 | 500 | 1,000 | 2,000 |
| Monad Indexing API | ✅ | ✅ | ✅ | ✅ |

### Compute Unit Costs

| API Method | Compute Units |
|-----------|---------------|
| Retrieve Account's NFTs | 300 |
| Retrieve Account's Token | 300 |
| Retrieve Account's Transactions | 200 |
| Retrieve Token Detail | 100 |
| Retrieve Collection Floor Price | ~100 |

### Available API Endpoints

BlockVision Monad Indexing API provides the following categories:

#### Account APIs
- **Account Tokens API** - Get token balances for a wallet
- **Account DeFi API** - Get DeFi positions
- **Account NFTs API** - Get all NFTs held by a wallet
- **Account Activity API** - Get recent account activities
- **Account Transactions API** - Get transaction history
- **Account Internal Transactions API** - Get internal transactions
- **Account Token Activities API** - Get ERC-20 transfer history
- **Account NFT Activities API** - Get NFT transfer history

#### Token APIs
- **Token Holders API** - Get holders of a specific token
- **Monad Holders API** - Get MON token holders
- **Token Detail API** - Get token metadata
- **Multiple Token Price API** - Get prices for multiple tokens
- **Token Trades API** - Get recent trades
- **Token Pools API** - Get liquidity pool info
- **Token OHLCV API** - Get price candlesticks
- **Token Market Data API** - Get market cap, volume, etc.

#### NFT APIs
- **NFT Collection Holders API** - Get holders of an NFT collection
- **Collection Floor Price API** - Get floor price for a collection

#### Contract APIs
- **Contract Detail API** - Get contract metadata
- **Contract Source Code API** - Get verified source code
- **Verified Contracts API** - List verified contracts
- **Token Gating API** - Check token gating requirements

### Collection Floor Price API

The floor price API is used to get real-time NFT floor prices for treasury value calculation.

**Endpoint**: `GET https://api.blockvision.org/v2/monad/collection/floor-price`

**Parameters**:
- `collectionAddress` (required): The NFT collection contract address

**Response**:
```json
{
  "code": 0,
  "message": "OK",
  "result": {
    "floorPrice": "5000.00",
    "floorPriceUSD": "25000.00",
    "collectionAddress": "0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0",
    "currency": "MON"
  }
}
```

### Account Transactions API

The account transactions API is used to fetch all transactions for a wallet address, including MON transfers.

**Endpoint**: `GET https://api.blockvision.org/v2/monad/account/transactions`

**Parameters**:
- `address` (required): Wallet address (42 chars with 0x prefix)
- `limit` (optional): Max results per page (default 20, max 50)
- `ascendingOrder` (optional): Sort order (default false for newest first)
- `cursor` (optional): Pagination cursor

**Response**:
```json
{
  "code": 0,
  "message": "OK",
  "result": {
    "data": [
      {
        "hash": "0x...",
        "blockHash": "0x...",
        "blockNumber": 12345,
        "timestamp": 1712345678901,
        "from": "0xSenderAddress",
        "to": "0xRecipientAddress",
        "value": "1000000000000000000",
        "transactionFee": 21000
      }
    ],
    "nextPageCursor": "cursor123...",
    "total": 47
  }
}
```

**Note**: The `value` field is in wei (1e18 wei = 1 MON). Use this API instead of `/collection/activities` when fetching general account transactions.

**Implementation**: See `lib/blockvision.ts` - `fetchAccountTransactions()` and `getTreasuryTransactionActivities()`

### Caching Strategy

To minimize API usage:

1. **In-Memory Cache**: NFT data is cached for 1 hour per address
2. **Treasury Cache**: Treasury data is cached for 1 hour
3. **Floor Price Cache**: Floor prices are cached for 1 hour
4. **Database Storage**: Historical data is stored in SQLite for charts

### API Response Format

```json
{
  "code": 0,
  "message": "OK",
  "result": {
    "data": [
      {
        "contractAddress": "0x...",
        "verified": true,
        "name": "Collection Name",
        "image": "https://...",
        "ercStandard": "ERC721",
        "items": [
          {
            "name": "NFT #123",
            "contractAddress": "0x...",
            "tokenId": "123",
            "image": "https://...",
            "qty": "1"
          }
        ]
      }
    ],
    "total": 5,
    "collectionTotal": 2
  }
}
```

### Implementation

See `lib/blockvision.ts` for the full implementation including:
- `fetchAccountNFTs()` - Fetch NFTs for a single page
- `fetchAllAccountNFTs()` - Fetch all NFTs with pagination
- `getTreasuryNFTHoldings()` - High-level function for treasury page
- `fetchCollectionFloorPrice()` - Fetch floor price for a single collection
- `fetchMultipleFloorPrices()` - Fetch floor prices for multiple collections
- `fetchAccountTransactions()` - Fetch account transaction history (MON transfers)
- `getTreasuryTransactionActivities()` - Get formatted transaction activities for treasury display
- Cache management functions

### Documentation

- BlockVision Docs: https://docs.blockvision.org
- Monad Indexing API: https://docs.blockvision.org/reference/monad-indexing-api
- Monad NFT API: https://docs.blockvision.org/reference/retrieve-monad-account-nfts
- NFT Floor Price API: https://docs.blockvision.org/blockvision/indexing-apis/nft-api/nft_floorprice

---

## Holder Data Refresh Mechanism

The holder data is cached and refreshed periodically to keep it fresh while avoiding excessive blockchain calls.

### How It Works

1. **On-Demand Cache**: `/api/members` and `/api/holder-stats` cache data for 5 minutes
2. **Periodic Refresh**: `/api/cron/refresh-holders` endpoint can be called every 4 hours to proactively refresh data
3. **Historical Snapshots**: Holder counts are recorded in the `holder_snapshots` table for chart visualization

### Cron Setup (Server)

Add a systemd timer or cron job to call the refresh endpoint every 4 hours:

**Systemd Timer (`/etc/systemd/system/swo-refresh-holders.timer`):**

```ini
[Unit]
Description=Refresh Star World Order holder data every 4 hours

[Timer]
OnBootSec=5min
OnUnitActiveSec=4h
Persistent=true

[Install]
WantedBy=timers.target
```

**Systemd Service (`/etc/systemd/system/swo-refresh-holders.service`):**

```ini
[Unit]
Description=Star World Order holder data refresh

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -s -H "Authorization: Bearer ${CRON_SECRET}" http://localhost:3080/api/cron/refresh-holders
```

**Enable the timer:**

```bash
sudo systemctl enable --now swo-refresh-holders.timer
```

**Or use a simple cron job:**

```bash
# Add to /etc/crontab or user's crontab
0 */4 * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3080/api/cron/refresh-holders
```

### Environment Variables

```bash
# Add to .env.local
CRON_SECRET=your-secure-random-secret-here
```

### API Response

```json
{
  "success": true,
  "message": "Holder data refreshed successfully",
  "data": {
    "totalHolders": 189,
    "uniqueWallets": 189,
    "constellationCounts": {
      "aether": 45,
      "spectra": 42,
      ...
    },
    "snapshotsRecorded": 11,
    "timestamp": "2024-12-18T12:00:00.000Z"
  }
}
```

---

## Database Backup

The database includes built-in backup functionality to protect user data.

### Backup Functions

```typescript
import { createDatabaseBackup, listDatabaseBackups, cleanupOldBackups } from '@/lib/db';

// Create a backup
const backupPath = createDatabaseBackup();
// Returns: /path/to/data/backups/swo-backup-2024-12-26T12-00-00-000Z.db

// List all backups
const backups = listDatabaseBackups();
// Returns: [{ filename, path, timestamp, size }, ...]

// Clean up old backups (keep last 7)
const deletedCount = cleanupOldBackups(7);
```

### Backup Location

Backups are stored in `data/backups/` directory with timestamped filenames:
```
data/backups/
├── swo-backup-2024-12-26T00-00-00-000Z.db
├── swo-backup-2024-12-25T00-00-00-000Z.db
└── ...
```

### Recommended Backup Strategy

1. **Daily Backups**: Create a daily backup via cron job
2. **Retention**: Keep 7 days of backups
3. **Off-site**: Copy backups to external storage periodically

**Cron Job Example**:
```bash
# Daily backup at midnight
0 0 * * * node -e "require('./lib/db').createDatabaseBackup(); require('./lib/db').cleanupOldBackups(7);"
```

### What Gets Backed Up

The SQLite backup includes all user data:
- User profiles and display names
- Social connections (Discord, X)
- Chat history
- Quest progress and completions
- User XP and levels
- Voice session history
- Holder snapshots for charts

---

## Database Environments

Star World Order uses a dual database setup for production and testing environments:

| Environment | Database Path | Used By |
|-------------|---------------|---------|
| **PROD** | `/opt/swo/data/swo.db` | `main` branch (port 3080) |
| **Test** | `/opt/swo/data/swo-test.db` | `dev` branch (port 3081) |

### Environment Configuration

Each environment has its own `.env.local` file with the appropriate database path:

**PROD Environment** (`/opt/star_world_order/PROD/Star-World-Order/.env.local`):
```bash
DATABASE_URL=file:/opt/swo/data/swo.db
```

**DEV Environment** (`/opt/star_world_order/DEV/Star-World-Order/.env.local`):
```bash
DATABASE_URL=file:/opt/swo/data/swo-test.db
```

This separation ensures:
- ✅ **Production data protection** - Testing doesn't affect live data
- ✅ **Realistic testing** - Test DB populated with production data snapshots
- ✅ **Safe development** - Developers can experiment without risk

---

## Database Sync (PROD → Test)

The test database is periodically synchronized from production to keep test data realistic.

### Sync Script

**Location**: `/opt/swo/scripts/sync-prod-to-test.sh`

```bash
#!/bin/bash
PROD_DB="/opt/swo/data/swo.db"
TEST_DB="/opt/swo/data/swo-test.db"

sqlite3 "$PROD_DB" ".backup '$TEST_DB'"
echo "$(date): Synced PROD to Test DB" >> /opt/swo/logs/db-sync.log
```

### Sync Schedule

| Schedule | Description |
|----------|-------------|
| **Automated** | Every Sunday at 3:00 AM |
| **Cron Schedule** | `0 3 * * 0` |
| **Manual Trigger** | `/opt/swo/scripts/sync-prod-to-test.sh` |

### Sync Operations

**Manual Sync**:
```bash
# Run the sync script manually
/opt/swo/scripts/sync-prod-to-test.sh

# View sync log
cat /opt/swo/logs/db-sync.log

# View recent syncs
tail -20 /opt/swo/logs/db-sync.log
```

**What Gets Synced**:
- All user data (profiles, XP, quests)
- Chat and message history
- Social connections
- NFT holdings cache
- All database tables

**Important**: The sync overwrites the entire test database with production data.

---

## Cron Jobs

Star World Order uses several automated cron jobs for maintenance and data refresh:

| Schedule | Command | Description |
|----------|---------|-------------|
| `*/30 * * * *` | `/opt/star_world_order/health-check.sh` | Health check every 30 minutes |
| `0 3 * * *` | `/opt/swo/backup-db.sh` | Daily database backup at 3:00 AM |
| `0 3 * * 0` | `/opt/swo/scripts/sync-prod-to-test.sh` | Weekly PROD→Test sync (Sundays at 3:00 AM) |

### Cron Management

**View Current Crontab**:
```bash
crontab -l
```

**Edit Crontab**:
```bash
crontab -e
```

**Example Crontab Configuration**:
```bash
# Star World Order Automation
# Health check every 30 minutes
*/30 * * * * /opt/star_world_order/health-check.sh

# Daily database backup at 3 AM
0 3 * * * /opt/swo/backup-db.sh

# Weekly production to test database sync (Sundays at 3 AM)
0 3 * * 0 /opt/swo/scripts/sync-prod-to-test.sh
```

### Cron Logs

Each script logs to its respective log file:

| Script | Log Location |
|--------|-------------|
| Health Check | `/opt/star_world_order/logs/health.log` |
| Database Backup | `/opt/swo/logs/backup.log` |
| Database Sync | `/opt/swo/logs/db-sync.log` |

**View Logs**:
```bash
# Health check log
tail -f /opt/star_world_order/logs/health.log

# Backup log
tail -f /opt/swo/logs/backup.log

# Sync log
tail -f /opt/swo/logs/db-sync.log
```

---

## Server Directory Structure

The complete server directory structure for Star World Order:

```
/opt/star_world_order/
├── DEV/                    # dev branch (port 3081)
│   ├── Star-World-Order/   # git repository
│   └── node_modules/
├── PROD/                   # main branch (port 3080)
│   ├── Star-World-Order/   # git repository
│   └── node_modules/
├── SWO_bot/                # Discord Role Verification Bot
│   ├── index.ts            # Main bot code
│   ├── .env.bot            # Bot configuration
│   ├── package.json
│   └── node_modules/
├── constellation_token_ids.csv  # Source of truth for Star IDs
├── constellation_token_ids.txt  # Source of truth for Star IDs (text format)
├── deploy-dev.sh           # DEV deployment script
├── deploy-prod.sh          # PROD deployment script
├── health-check.sh         # Health check script
└── logs/
    ├── dev.log
    ├── prod.log
    └── health.log

/opt/swo/
├── data/
│   ├── swo.db              # PROD database (shared, backed up daily)
│   └── swo-test.db         # Test database (for DEV environment)
├── backups/                # Daily database backups
│   ├── swo-backup-2024-01-01T03-00-00-000Z.db
│   └── ...
├── scripts/
│   └── sync-prod-to-test.sh  # PROD→Test database sync script
├── logs/
│   ├── backup.log          # Database backup log
│   └── db-sync.log         # Database sync log
└── backup-db.sh            # Daily backup script
```

### Key Locations

| Path | Purpose |
|------|---------|
| `/opt/star_world_order/` | Application deployment directory |
| `/opt/swo/data/` | Database storage (shared between environments) |
| `/opt/swo/backups/` | Daily database backups |
| `/opt/swo/scripts/` | Automation and maintenance scripts |
| `/opt/swo/logs/` | Database operation logs |

---

## RPC Optimization Strategy

Star World Order uses a multi-tier resilience strategy for RPC calls to avoid rate limiting and ensure reliability:

### Tier 1: Batched Multicall

Uses Viem's `multicall` to batch ownership checks of all 333 Star Skrumpey token IDs in a single RPC call. This provides O(1) RPC complexity regardless of user's NFT count.

```typescript
// Check ownership of all 333 Star Skrumpeys in one call
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
| `lib/magiceden.ts` | **Magic Eden API integration for NFT collections (PRIMARY)** |
| `lib/rpcNftFetcher.ts` | ~~Direct RPC NFT fetcher~~ (DEPRECATED - ERC721Enumerable not supported) |
| `lib/blockvision.ts` | BlockVision API integration (optional: floor prices only) |
| `lib/floorPrices.ts` | **NFT Floor Price Aggregator API** - Magic Eden + OpenSea floor prices |
| `lib/db.ts` | SQLite database operations including treasury NFT cache and global notifications |
| `lib/logger.ts` | Logging utility for debugging |
| `lib/contexts/DemoModeContext.tsx` | Demo mode state management |
| `lib/contexts/DAOAccessContext.tsx` | DAO access state management |
| `components/AccessGate.tsx` | Access control wrapper component |
| `components/DemoMode.tsx` | Demo mode modal and UI |
| `components/Header.tsx` | Navigation header |
| `components/NotificationBell.tsx` | Bell icon with unread count badge and dropdown (includes global notifications) |
| `components/MessageIcon.tsx` | DM icon with unread count badge and conversation dropdown |
| `components/ProfileCard.tsx` | Profile with tabbed sections (Settings, Friends, Messages, Collection, Achievements, Quests) |
| `app/page.tsx` | Home page with N64 loading screen |
| `app/dao/page.tsx` | DAO governance page (Governance, Forum, Staking tabs) |
| `app/exchange/page.tsx` | OTC marketplace page |
| `app/staking/page.tsx` | NFT staking page |
| `app/hangout/page.tsx` | Hangout Hub lobby |
| `app/treasury/page.tsx` | Treasury page with NFT holdings and analytics |
| `app/treasury/TreasuryContent.tsx` | Treasury client component with charts (Portfolio, Collection breakdown) |
| `app/api/treasury/route.ts` | **Treasury API with Magic Eden NFT fetching and SQLite cache** |
| `app/members/page.tsx` | Members page with holder analytics |
| `app/members/MembersContent.tsx` | Members client component with friend requests and messaging from member profiles |
| `app/admin_xyz/AdminContent.tsx` | **Admin Dashboard** with tabbed interface: Health, Notifications (create, history, edit), Users (database viewer), Raffles (create, winners, manage), Database (stats and cleanup tools) |
| `app/api/admin/route.ts` | **Admin API** - Cache management, notification CRUD, user database, cleanup tools |
| `app/api/quests/route.ts` | Quest system API endpoints |
| `app/api/user-xp/route.ts` | User XP API endpoints |
| `app/api/notifications/route.ts` | Notification system API endpoints (supports global notifications) |
| `app/api/friends/route.ts` | Friends system API endpoints |
| `app/api/messages/route.ts` | Direct messaging API endpoints |
| `app/api/floor-prices/route.ts` | **Public Floor Prices API** - Monad NFT floor prices |
| `app/api/cron/refresh-floor-prices/route.ts` | Cron job to refresh floor prices every 15 min |
| `app/raffle/page.tsx` | **Cosmic Raffle page** - Entry point for raffle system |
| `app/raffle/RaffleContent.tsx` | Raffle client component with animations and entry management |
| `app/api/raffle/route.ts` | **Raffle API** - Create, enter, draw winner, admin actions |

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

# Snapshot.org Integration (optional)
NEXT_PUBLIC_SNAPSHOT_SPACE=               # e.g., starworldorder.eth
NEXT_PUBLIC_SNAPSHOT_HUB=https://hub.snapshot.org

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

# BlockVision API (for Treasury NFT fetching)
BLOCKVISION_API=your-api-key-here
BLOCKVISION_RPC=https://monad-mainnet.blockvision.org/v1/your-api-key  # Optional
BLOCKVISION_WEBSOCKET=wss://monad-mainnet.blockvision.org/v1/your-api-key  # Optional

# OpenSea API (optional, for floor prices)
OPENSEA_API_KEY=your-opensea-api-key  # Optional - enhances floor price data
```

**Example**: See `.env.example` in repository root

---

## Snapshot.org Integration

Star World Order uses a **hybrid governance model**:

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Primary** | SQLite Database | Fast, free, instant voting |
| **Verification** | Snapshot.org | Decentralized proof (optional) |

### Why Hybrid?

- **Web2 Database**: Zero gas fees, instant results, vote changing (24h window)
- **Snapshot.org**: Cryptographic signatures, IPFS storage, public verifiability

### Configuration

Set in `.env.local`:
```bash
NEXT_PUBLIC_SNAPSHOT_SPACE=starworldorder.eth  # Your Snapshot space ID
NEXT_PUBLIC_SNAPSHOT_HUB=https://hub.snapshot.org
```

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/governance?action=snapshotStatus` | Check if Snapshot is configured |
| `GET /api/governance?action=verifySnapshot&id={proposalId}` | Verify database votes against Snapshot |

### Implementation Files

| File | Purpose |
|------|---------|
| `lib/snapshot.ts` | Snapshot API client and verification |
| `docs/SNAPSHOT_SETUP.md` | Full setup guide |

### Features

- **Vote Verification**: Cross-reference database votes with Snapshot
- **"Verify" Link**: UI shows Snapshot link on proposal cards (when configured)
- **GraphQL API**: Query proposals, votes, voting power from Snapshot Hub

**Full Documentation**: See `docs/SNAPSHOT_SETUP.md`

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
3. Function checks ownership of all 333 Star Skrumpey token IDs via multicall
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

## Demo Mode (Currently Disabled)

> ⚠️ **STATUS: DISABLED** - Demo Mode is currently disabled in the UI. The code has been commented out but preserved for potential future use. The only way for members to login is via wallet connect.

Demo Mode was designed to allow visitors to preview the app without connecting a wallet.

### How It Worked

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

### Re-enabling Demo Mode

To re-enable Demo Mode in the future:

1. Uncomment the import in `components/Header.tsx`:
   ```typescript
   import DemoMode from './DemoMode';
   ```

2. Uncomment the DemoMode component in the header navigation:
   ```tsx
   {!isLandingPage && (
     <div className="flex-shrink-0">
       <DemoMode />
     </div>
   )}
   ```

**Implementation Files**:
- `lib/contexts/DemoModeContext.tsx` - Context provider and hooks
- `components/DemoMode.tsx` - UI component (preserved)

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

## 📋 AI Agent Task Checklist

Use this checklist when working on tasks:

### Before Starting
- [ ] Read relevant sections of this CLAUDE.md
- [ ] Understand the file structure (`app/`, `lib/`, `components/`)
- [ ] Check existing patterns in similar files
- [ ] Review `.env.example` for required environment variables

### During Development
- [ ] Use TypeScript with proper types
- [ ] Follow Tailwind CSS conventions (synthwave theme)
- [ ] Use existing utility functions from `lib/`
- [ ] Add error handling for async operations
- [ ] Use Wagmi hooks for blockchain interactions

### Before Committing
- [ ] Run `npm run type-check` (must pass)
- [ ] Run `npm run lint` (must pass)
- [ ] Run `npm run build` (must succeed)
- [ ] Test changes manually if applicable
- [ ] Update documentation if adding new features

### PR Guidelines
- [ ] Target the `dev` branch (NOT `main`)
- [ ] Write clear commit messages
- [ ] Describe changes in PR description

---

## 🗂️ Directory Structure Quick Reference

```
Star-World-Order/
├── app/                    # Next.js App Router pages
│   ├── api/               # API route handlers
│   │   ├── admin/         # Admin API
│   │   ├── chat/          # Chat API
│   │   ├── friends/       # Friends API
│   │   ├── messages/      # DM API
│   │   ├── notifications/ # Notifications API
│   │   ├── profile/       # Profile API
│   │   ├── quests/        # Quest system API
│   │   ├── raffle/        # Raffle system API
│   │   ├── treasury/      # Treasury API
│   │   └── user-xp/       # XP system API
│   ├── admin_xyz/         # Admin dashboard page
│   ├── dao/               # DAO governance page
│   ├── gallery/           # NFT gallery page
│   ├── hangout/           # Hangout hub page
│   ├── marketplace/       # OTC marketplace page
│   ├── members/           # Members list page
│   ├── profile/           # Profile page
│   ├── raffle/            # Raffle page
│   ├── treasury/          # Treasury page
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   └── providers.tsx      # React context providers
│
├── components/            # React components
│   ├── AccessGate.tsx     # Access control wrapper
│   ├── Header.tsx         # Navigation header
│   ├── ProfileCard.tsx    # User profile card
│   ├── WalletConnect.tsx  # Wallet connection
│   └── ...
│
├── lib/                   # Utility libraries
│   ├── config.ts          # Environment detection
│   ├── db.ts              # SQLite database (3500+ lines)
│   ├── starSkrumpey.ts    # Star NFT verification
│   ├── rpcClient.ts       # RPC with fallback
│   ├── wagmi.ts           # Chain configuration
│   ├── magiceden.ts       # Magic Eden API
│   ├── blockvision.ts     # BlockVision API
│   ├── contexts/          # React contexts
│   └── hooks/             # Custom React hooks
│
├── contracts/             # Solidity smart contracts
│   ├── StarSkrumpeyMarketplace.sol
│   ├── StarSkrumpeyStaking.sol
│   └── StarWorldOrderGovernor.sol
│
├── scripts/               # Build/utility scripts
│   ├── compile-contracts.js
│   ├── init-db.sql
│   └── test-connection.js
│
├── docs/                  # Additional documentation
├── public/                # Static assets
├── data/                  # SQLite database storage
└── [config files]         # package.json, tsconfig, etc.
```

---

## 🔍 Finding Information in This File

This document is organized by topic. Use these section headers to navigate:

| Need to... | Go to Section |
|------------|---------------|
| Run common commands | "🚀 Quick Reference for AI Agents" |
| Add new API endpoint | "🔧 Common Task Patterns" |
| Add database table | "🔧 Common Task Patterns" |
| Add React component | "🔧 Common Task Patterns" |
| Style with Tailwind | "🎨 Styling Conventions" |
| Avoid common mistakes | "⚠️ Anti-Patterns to Avoid" |
| Understand database schema | "Database Schema (SQLite)" |
| Work with API endpoints | "API Endpoints" |
| Deploy changes | "Deployment Commands" |
| Debug issues | "Troubleshooting" |

---

**Last Updated**: January 2, 2025

**Repository**: https://github.com/InverseAltruism/Star-World-Order

---

## 📝 Notes for AI Agents

### Context Management
- This file is large (~3000 lines). Focus on relevant sections for your task.
- The Quick Reference section contains the most commonly needed information.
- Database schema details are in the "Database Schema (SQLite)" section.
- API endpoint documentation is in the "API Endpoints" section.

### Key Patterns to Remember
1. **Always use `dev` branch** for PRs
2. **Use database for NFT metadata** instead of IPFS
3. **Use multicall for RPC** to avoid rate limiting
4. **Use resilient RPC client** from `lib/rpcClient.ts`
5. **Follow synthwave theme** for UI components

### When Stuck
- Check similar existing files for patterns
- Review the anti-patterns section
- Look at `lib/db.ts` for database operations
- Check `lib/starSkrumpey.ts` for NFT-related operations
- Review API routes in `app/api/` for endpoint patterns
