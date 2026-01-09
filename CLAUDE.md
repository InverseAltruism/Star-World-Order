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

Create file at `app/api/{endpoint}/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const param = searchParams.get('param');
    
    if (!param) {
      return NextResponse.json({ error: 'Missing param' }, { status: 400 });
    }
    
    return NextResponse.json({ success: true, data: param });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### Adding a New Database Table

Add schema in `lib/db.ts` initDatabase() function:

```typescript
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

| ❌ DON'T | ✅ DO INSTEAD |
|----------|---------------|
| Fetch NFT metadata from IPFS directly | Use `getStarSkrumpeyMetadataBatch()` from `lib/db` |
| Make sequential RPC calls in loops | Use `checkStarOwnershipBatched()` from `lib/starSkrumpey` |
| Hardcode RPC endpoints | Use `getResilientClient()` from `lib/rpcClient` |
| Create PRs targeting `main` | Target `dev` branch |
| Commit without running validation | Run `npm run type-check && npm run lint && npm run build` |
| Use `any` type in TypeScript | Define proper interfaces |

---

## 🎨 Styling Conventions

### Color Palette (Synthwave Theme)

```css
--neon-cyan: #00f7ff      /* text-[#00f7ff], border-[#00f7ff] */
--neon-magenta: #ff00ff   /* text-[#ff00ff] */
--neon-gold: #ffd700      /* text-[#ffd700] */
--deep-purple: #1a0033    /* bg-[#1a0033] */
--dark-navy: #0a0015      /* bg-[#0a0015] */
```

### Typography & Component Patterns

- **Headings**: `font-['Press_Start_2P']` (retro pixel font)
- **Body text**: Default system font stack

```tsx
// Standard card/panel
<div className="bg-black/80 backdrop-blur-md border border-[#00f7ff]/30 rounded-lg p-4 shadow-[0_0_15px_rgba(0,247,255,0.3)]">

// Neon glow button
<button className="px-4 py-2 bg-[#00f7ff]/20 hover:bg-[#00f7ff]/30 border border-[#00f7ff] text-[#00f7ff] rounded transition-all hover:shadow-[0_0_10px_#00f7ff]">
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

Features: Retro N64-inspired UI with synthwave aesthetics, DAO governance, OTC marketplace, NFT staking, and community hangout hub.

---

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Frontend** | Next.js | 16 |
| **UI Framework** | React | 19 |
| **Language** | TypeScript | 5.9+ |
| **Styling** | Tailwind CSS | 4 |
| **Web3 Library** | Wagmi | 3 |
| **Ethereum Client** | Viem | 2 |
| **Smart Contracts** | Solidity | 0.8.20 |
| **Contract Library** | OpenZeppelin | 5.x |
| **Database** | SQLite | better-sqlite3 |
| **Blockchain** | Monad | Chain ID: 143 |
| **Discord Bot** | discord.js | TypeScript + Viem |

---

## Environment Modes

```bash
NEXT_PUBLIC_ENV_MODE=dev   # All features unlocked
NEXT_PUBLIC_ENV_MODE=prod  # DAO, Exchange hidden from navigation
```

**Auto-detection** (if not set): `localhost`/`192.168.x.x` → `dev`, `starworldorder.com` → `prod`, unknown → `prod`

---

## Branch Workflow

| Branch | Purpose | Port | Deployment |
|--------|---------|------|------------|
| `main` | Production | 3080 | https://starworldorder.com |
| `dev` | Development/Testing | 3081 | Internal testing |

**Workflow**: Create PR → `dev` → Test → Merge `dev` → `main` → Deploy

---

## Server Setup (NUC)

```
/opt/star_world_order/
├── DEV/                    # dev branch (port 3081)
├── PROD/                   # main branch (port 3080)
├── SWO_bot/                # Discord bot
├── deploy-dev.sh, deploy-prod.sh, health-check.sh
└── logs/

/opt/swo/
├── data/swo.db             # PROD database
├── data/swo-test.db        # Test database
├── backups/                # Daily backups
└── scripts/, logs/
```

### Systemd Service & Aliases

```bash
# Service management
sudo systemctl status star-world
sudo systemctl restart star-world
sudo journalctl -u star-world -f

# Aliases
swo-health, swo-deploy-dev, swo-deploy-prod, swo-logs, swo-status, swo-restart
```

---

## Discord Role Verification Bot

| Property | Value |
|----------|-------|
| **Location** | `/opt/star_world_order/SWO_bot/` |
| **Process Manager** | pm2 (`swo-bot`) |
| **Sync Interval** | Every 5 minutes |

### Holder Tier Roles

| Role | Requirement | Env Var |
|------|-------------|---------|
| 👑 COSMIC EMPEROR | 10+ Stars | `COSMIC_EMPEROR_ROLE_ID` |
| ⚔️ STAR LORD | 5-9 Stars | `STAR_LORD_ROLE_ID` |
| 🛡️ COSMIC WARDEN | 2-4 Stars | `COSMIC_WARDEN_ROLE_ID` |
| ⭐ STAR FORGED | 1 Star | `STAR_FORGED_ROLE_ID` |

### Slash Commands

| Command | Description |
|---------|-------------|
| `/verify` | Force verification check |
| `/status` | View verification status |
| `/tiers` | Display tier requirements |
| `/link <wallet>` | Link wallet via MON transfer |
| `/unlink` | Disconnect wallet |

### `/link` Flow

1. User runs `/link 0xTheirWallet`
2. Bot shows verification address and amount (1 MON)
3. User sends MON from their wallet
4. User clicks "Verify Transaction"
5. Bot verifies and links wallet + assigns roles

### Bot Configuration (`.env.bot`)

```bash
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
DISCORD_CLIENT_ID=...
COSMIC_EMPEROR_ROLE_ID=...
STAR_LORD_ROLE_ID=...
COSMIC_WARDEN_ROLE_ID=...
STAR_FORGED_ROLE_ID=...
DB_PATH=/opt/swo/data/swo.db
MONAD_RPC=https://rpc.monad.xyz
VERIFICATION_ADDRESS=0x...
VERIFICATION_AMOUNT=1
```

### PM2 Commands

```bash
pm2 status          # Check status
pm2 logs swo-bot    # View logs
pm2 restart swo-bot # Restart
```

---

## Monad Network Configuration

### Mainnet (Chain ID: 143)

| Property | Value |
|----------|-------|
| **Chain ID** | 143 (0x8f) |
| **Currency** | MON |
| **RPC (Primary)** | https://rpc.monad.xyz |
| **Explorer** | https://monadscan.com |

**RPC Fallbacks**: `rpc1-4.monad.xyz`, `rpc-mainnet.monadinfra.com`, `monad-mainnet.drpc.org`

### Testnet (Chain ID: 10143)

RPC: `https://testnet-rpc.monad.xyz` | Explorer: `https://testnet.monadscan.com`

---

## Contract Addresses

| Contract | Address | Status |
|----------|---------|--------|
| **Skrumpeys NFT** | `0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0` | ✅ Live |
| **Multicall3** | `0xcA11bde05977b3631167028862bE2a173976CA11` | ✅ Live |
| **StarSkrumpeyMarketplace** | TBD | Pending |
| **StarSkrumpeyStaking** | TBD | Pending |
| **StarWorldOrderGovernor** | TBD | Pending |

---

## Smart Contracts Overview

### StarSkrumpeyMarketplace.sol

OTC peer-to-peer NFT marketplace for Star Skrumpey trading.

**Features**: Fixed-price listings, trustless atomic swaps, DAO fee (2.5%), pausable, reentrancy protected

```solidity
function createListing(uint256 tokenId, uint256 price) external returns (uint256 listingId);
function buyListing(uint256 listingId) external payable;
function cancelListing(uint256 listingId) external;
function getListing(uint256 listingId) external view returns (Listing memory);
function calculateFees(uint256 price) external view returns (uint256 daoFee, uint256 sellerProceeds);
```

### StarSkrumpeyStaking.sol

NFT staking system with time-based multipliers.

| Lock Duration | Multiplier |
|--------------|------------|
| 1 week | 110% |
| 1 month | 130% |
| 3 months | 150% |
| 6 months | 175% |
| 1 year | 200% |

```solidity
function stake(uint256 tokenId, uint256 lockDuration) external;
function stakeMultiple(uint256[] calldata tokenIds, uint256 lockDuration) external;
function unstake(uint256 tokenId) external;
function emergencyUnstake(uint256 tokenId) external; // 10% penalty
function claimRewards() external;
function getPendingRewards(address user) external view returns (uint256);
```

### StarWorldOrderGovernor.sol

DAO governance: 1 Star Skrumpey = 1 Vote, three-way voting (Yes/No/Abstain)

**Proposal States**: Pending → Active → Defeated/Succeeded → Executed/Cancelled

```solidity
function propose(address[] memory targets, uint256[] memory values, bytes[] memory calldatas, string memory description) external returns (uint256);
function castVote(uint256 proposalId, uint8 support) external returns (uint256);
function castVoteWithReason(uint256 proposalId, uint8 support, string calldata reason) external returns (uint256);
function execute(...) external payable returns (uint256);
function cancel(...) external returns (uint256);
```

---

## Star Skrumpey Token IDs

- **Total**: 333 NFTs with Star constellation trait
- **Source**: `lib/starSkrumpey.ts` - `STAR_SKRUMPEY_IDS` array
- **Lookup**: O(1) using Set data structure
- **Variants**: aether, spectra, solveil, nebulu, chroma, rose, monflare, auracore, parallel, prime

---

## Database Schema (SQLite)

**Location**: `/opt/swo/data/swo.db` (PROD) | `/opt/swo/data/swo-test.db` (DEV)

### Core Tables

| Table | Purpose |
|-------|---------|
| `chat_messages` | Hangout Hub chat history |
| `online_presence` | Online users and status |
| `voice_sessions` | Voice chat sessions |
| `voice_participants` | Users in voice sessions |
| `social_connections` | Discord/X OAuth links |
| `user_profiles` | Display names, bios, avatars |
| `star_skrumpey_metadata` | **Primary NFT metadata source** |
| `user_xp` | Experience points and levels |
| `quests` | Quest definitions |
| `user_quests` | User quest progress |
| `notifications` | User notifications (`wallet_address='global'` for all) |
| `notification_settings` | User notification preferences |
| `friends` | Friend relationships |
| `direct_messages` | Private messages |
| `raffles` | Raffle definitions |
| `raffle_entries` | Raffle participation |

### star_skrumpey_metadata (PRIMARY NFT SOURCE)

⚠️ **Use database instead of IPFS for NFT metadata!**

```sql
CREATE TABLE star_skrumpey_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  constellation TEXT,  -- The CORRECT constellation type
  aura TEXT, background TEXT, eyes TEXT, form TEXT, mood TEXT,
  attributes_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Usage**:
```typescript
import { getStarSkrumpeyMetadataBatch } from '@/lib/db';
const metadataMap = getStarSkrumpeyMetadataBatch(tokenIds);
```

### user_xp

```sql
CREATE TABLE user_xp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL UNIQUE,
  total_xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Level Formula**: `Level = floor(sqrt(XP / 100)) + 1`

### notifications

```sql
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,  -- 'global' for all users
  type TEXT NOT NULL CHECK (type IN ('quest', 'achievement', 'system', 'social', 'governance')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  icon TEXT DEFAULT '🔔',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### quests & user_quests

```sql
CREATE TABLE quests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  xp_reward INTEGER NOT NULL DEFAULT 100,
  quest_type TEXT NOT NULL CHECK (quest_type IN ('daily', 'weekly', 'one_time', 'urgent')),
  category TEXT NOT NULL DEFAULT 'general',
  requirements_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  icon TEXT DEFAULT '⭐',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME
);

CREATE TABLE user_quests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'in_progress', 'completed', 'claimed')),
  progress INTEGER NOT NULL DEFAULT 0,
  started_at DATETIME,
  completed_at DATETIME,
  claimed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, quest_id)
);
```

### raffles & raffle_entries

```sql
CREATE TABLE raffles (
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

CREATE TABLE raffle_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raffle_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  tier TEXT NOT NULL,
  entries_count INTEGER NOT NULL,
  discord_bonus INTEGER NOT NULL DEFAULT 0,
  engagement_bonus INTEGER NOT NULL DEFAULT 0,
  star_count INTEGER NOT NULL,
  entered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(raffle_id, wallet_address)
);
```

**Holder Tiers**: Cosmic Emperor (10+) = 4 entries, Star Lord (5-9) = 3, Cosmic Warden (2-4) = 2, Star Forged (1) = 1

**Verifiable Randomness**: SHA-256 of `${blockHash}-${raffleId}-${timestamp}-${entryCount}`

### social_connections

```sql
CREATE TABLE social_connections (
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
```

### friends & direct_messages

```sql
CREATE TABLE friends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_address TEXT NOT NULL,
  friend_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_address, friend_address)
);

CREATE TABLE direct_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_address TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Key Database Functions (lib/db.ts)

**Metadata**: `getStarSkrumpeyMetadata()`, `getStarSkrumpeyMetadataBatch()`, `getAllStarSkrumpeyMetadata()`, `getConstellationDistribution()`

**XP**: `getUserXP()`, `addUserXP()`, `getXPProgress()`, `getXPLeaderboard()`

**Quests**: `getActiveQuests()`, `getQuestsByType()`, `getUrgentQuests()`, `startQuest()`, `completeQuest()`, `claimQuestReward()`, `getQuestsWithProgress()`

**Notifications**: `createNotification()`, `getNotifications()`, `markNotificationRead()`, `markAllNotificationsRead()`, `getUnreadNotificationCount()`, `getNotificationSettings()`, `updateNotificationSettings()`

**Friends**: `sendFriendRequest()`, `acceptFriendRequest()`, `declineFriendRequest()`, `getFriends()`, `getPendingFriendRequests()`, `areFriends()`, `blockUser()`, `removeFriend()`

**Messages**: `sendDirectMessage()`, `getConversation()`, `getConversations()`, `markMessagesAsRead()`, `getUnreadMessageCount()`, `deleteMessage()`

**Raffles**: `createRaffle()`, `enterRaffle()`, `drawRaffleWinner()`, `getRaffleEntries()`, `getRaffleTotalEntries()`, `getUserRaffleEntries()`, `hasViewedRaffleResult()`, `markRaffleResultViewed()`

**Admin**: `getAllUsersWithSocialConnections()`, `getUserCount()`, `getDatabaseStats()`, `getAllNotifications()`, `cleanupChatMessages()`, `cleanupOnlinePresence()`, `cleanupDirectMessages()`

**Backup**: `createDatabaseBackup()`, `listDatabaseBackups()`, `cleanupOldBackups()`

---

## API Endpoints

### Core APIs

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/metadata` | GET | NFT metadata (DB first, IPFS fallback) |
| `/api/treasury` | GET | Treasury data (Magic Eden + cache) |
| `/api/chat` | GET, POST | Chat messages |
| `/api/presence` | GET, POST, DELETE | Online presence |
| `/api/voice` | GET, POST, PATCH, DELETE | Voice sessions |
| `/api/profile` | GET, POST | User profiles |
| `/api/social-connections` | GET | Social connections |
| `/api/members` | GET | Star holders with profiles (5-min cache) |
| `/api/holder-stats` | GET | Holder count history |

### Feature APIs

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/quests` | GET, POST | Quest system |
| `/api/user-xp` | GET, POST | XP and levels |
| `/api/notifications` | GET, POST, PATCH, DELETE | Notifications |
| `/api/friends` | GET, POST | Friend system |
| `/api/messages` | GET, POST, PATCH, DELETE | Direct messages |
| `/api/raffle` | GET, POST | Raffle system |
| `/api/governance` | GET, POST | DAO voting |
| `/api/floor-prices` | GET | Public NFT floor prices |
| `/api/admin` | GET, POST | Admin functions |

### Auth & Cron APIs

| Endpoint | Description |
|----------|-------------|
| `/api/auth/x` | X OAuth initiation |
| `/api/auth/callback/x` | X OAuth callback |
| `/api/cron/refresh-holders` | Refresh holder data (requires `CRON_SECRET`) |
| `/api/cron/refresh-floor-prices` | Refresh floor prices |

### Governance API Details

**GET params**: `action` = `proposals|proposal|votes|hasVoted|userVote|canChangeVote|canCancel|snapshotStatus|verifySnapshot`

**POST actions**: `createProposal`, `vote`, `changeVote`, `cancelProposal`, `updateState`

**Voting values**: `0` = No, `1` = Yes, `2` = Abstain

### Raffle API Details

**GET params**: `type` = `active|upcoming|past|all|history`, `id`, `address`, `export=csv`

**POST actions**: `enter`, `create`, `draw`, `end`, `cancel`, `markViewed`

### Admin API Details

**GET actions**: `health`, `notifications`, `allNotifications`, `users`, `dbStats`, `drawnRaffles`

**POST actions**: `clearCache`, `createNotification`, `deleteNotification`, `updateNotification`, `broadcastNotification`, cleanup functions

**Auth**: Requires `x-admin-auth` header with format `address:timestamp:signature`

---

## Magic Eden API Integration

Uses Magic Eden's public Monad API (no API key required, 180 QPM limit).

**Endpoint**: `POST https://api-mainnet.magiceden.dev/v4/evm-public/collections/user-collections`

```json
{ "chain": "monad", "walletAddresses": ["0x..."] }
```

**Caching**: In-memory 1hr/address, SQLite 24hr for treasury, exponential backoff on 429s

---

## BlockVision API (Optional)

Used for floor prices only. NFT holdings use Magic Eden.

```bash
BLOCKVISION_API=your-api-key-here
```

---

## RPC Optimization Strategy

1. **Batched Multicall**: Check all 333 Star IDs in one call
2. **Fallback Endpoints**: Rotate through multiple RPCs
3. **Exponential Backoff**: Retry with 1s, 2s, 4s delays
4. **Graceful Degradation**: Return empty array on total failure

```typescript
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

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `lib/config.ts` | Environment mode detection |
| `lib/starSkrumpey.ts` | Star verification, token IDs, ownership |
| `lib/wagmi.ts` | Chain configuration |
| `lib/rpcClient.ts` | RPC fallback and retry |
| `lib/magiceden.ts` | Magic Eden API |
| `lib/blockvision.ts` | BlockVision API (floor prices) |
| `lib/db.ts` | Database operations (3500+ lines) |
| `components/Header.tsx` | Navigation |
| `components/AccessGate.tsx` | NFT gating |
| `components/ProfileCard.tsx` | Profile UI |
| `app/page.tsx` | Home (N64 boot) |
| `app/dao/page.tsx` | DAO governance |
| `app/hangout/page.tsx` | Hangout Hub |
| `app/treasury/page.tsx` | Treasury |
| `app/raffle/page.tsx` | Cosmic Raffle |
| `app/admin_xyz/AdminContent.tsx` | Admin Dashboard |

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
NEXT_PUBLIC_MARKETPLACE_CONTRACT=
NEXT_PUBLIC_STAKING_CONTRACT=
NEXT_PUBLIC_GOVERNOR_CONTRACT=

# DAO Configuration
NEXT_PUBLIC_DAO_TREASURY_ADDRESS=
NEXT_PUBLIC_DAO_FEE_BPS=250

# Snapshot.org (optional)
NEXT_PUBLIC_SNAPSHOT_SPACE=
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

# BlockVision (optional)
BLOCKVISION_API=

# Cron
CRON_SECRET=
```

---

## Snapshot.org Integration

**Hybrid model**: SQLite for fast/free voting, Snapshot for decentralized verification (optional)

```bash
NEXT_PUBLIC_SNAPSHOT_SPACE=starworldorder.eth
NEXT_PUBLIC_SNAPSHOT_HUB=https://hub.snapshot.org
```

See `docs/SNAPSHOT_SETUP.md` for full setup.

---

## Deployment Commands

### DEV (port 3081)

```bash
cd /opt/star_world_order/DEV/Star-World-Order
git pull origin dev && npm install
NEXT_PUBLIC_ENV_MODE=dev npm run build
npm start -- -p 3081
# Or: ./deploy-dev.sh
```

### PROD (port 3080)

```bash
cd /opt/star_world_order/PROD/Star-World-Order
git pull origin main && npm install
NEXT_PUBLIC_ENV_MODE=prod npm run build
sudo systemctl restart star-world
# Or: ./deploy-prod.sh
```

---

## Access Control

### Star Skrumpey Verification

1. User connects wallet
2. `checkStarOwnershipBatched(address)` checks all 333 Star token IDs
3. If owns ≥1 Star → grant access
4. If not → show access denied + marketplace link

**Dev Override**: Set `NEXT_PUBLIC_DEV_ACCESS_ENABLED=true` in `.env.local`

---

## Cron Jobs

| Schedule | Command | Description |
|----------|---------|-------------|
| `*/30 * * * *` | `health-check.sh` | Health check |
| `0 3 * * *` | `backup-db.sh` | Daily backup |
| `0 3 * * 0` | `sync-prod-to-test.sh` | Weekly sync |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| RPC rate limiting | Batched multicall should prevent; check endpoint health, try fallback |
| Database locked | One process at a time; check zombies; restart service |
| Build failures | Clear `.next` and `node_modules`; check Node.js 20+ |
| Contract not found | Verify env vars; check explorer; confirm network |
| Bot roles not updating | Check bot permissions; verify role hierarchy; check role IDs |
| Bot transaction not found | Wait for confirmation; check wallet direction; must occur after /link |

---

## 📋 AI Agent Task Checklist

### Before Starting
- [ ] Read relevant CLAUDE.md sections
- [ ] Check existing patterns in similar files
- [ ] Review `.env.example`

### During Development
- [ ] Use TypeScript with proper types
- [ ] Follow synthwave theme
- [ ] Use existing utilities from `lib/`
- [ ] Add error handling
- [ ] Use Wagmi hooks for blockchain

### Before Committing
- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] PR targets `dev` branch

---

## 🗂️ Directory Structure

```
Star-World-Order/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── admin/, chat/, friends/, messages/
│   │   ├── notifications/, profile/, quests/
│   │   ├── raffle/, treasury/, user-xp/, governance/
│   ├── admin_xyz/, dao/, gallery/, hangout/
│   ├── marketplace/, members/, profile/, raffle/, treasury/
│   ├── globals.css, layout.tsx, page.tsx, providers.tsx
├── components/            # React components
├── lib/                   # Utilities
│   ├── config.ts, db.ts, starSkrumpey.ts
│   ├── rpcClient.ts, wagmi.ts, magiceden.ts
│   ├── blockvision.ts, contexts/, hooks/
├── contracts/             # Solidity contracts
├── scripts/, docs/, public/, data/
```

---

## 📝 Notes for AI Agents

### Key Patterns
1. **Always use `dev` branch** for PRs
2. **Use database for NFT metadata** instead of IPFS
3. **Use multicall for RPC** to avoid rate limiting
4. **Use resilient RPC client** from `lib/rpcClient.ts`
5. **Follow synthwave theme** for UI components

### When Stuck
- Check similar existing files for patterns
- Review anti-patterns section
- Look at `lib/db.ts` for database operations
- Check `lib/starSkrumpey.ts` for NFT operations
- Review API routes in `app/api/` for endpoint patterns

---

**Last Updated**: January 9, 2025

**Repository**: https://github.com/InverseAltruism/Star-World-Order
