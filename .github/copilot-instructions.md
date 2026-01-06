# Copilot Instructions for Star World Order

> **GitHub Copilot Coding Agent Configuration**
> This file provides comprehensive guidance for the GitHub Copilot coding agent when working on this repository.

---

## 🚀 Quick Start for AI Agents

### Essential Commands (Run These First!)

```bash
# ALWAYS run these validation commands before committing:
npm run type-check       # TypeScript validation (MUST PASS)
npm run lint             # ESLint checks (MUST PASS)
npm run build            # Production build (MUST SUCCEED)

# Development
npm run dev              # Start dev server on port 3000

# Database
npm run db:init          # Initialize SQLite database
mkdir -p data            # Ensure data directory exists

# Testing
npm run test:network     # Test Monad RPC connection
```

### Critical Rules

1. ⚠️ **All PRs must target the `dev` branch, NOT `main`**
2. Always run `npm run type-check && npm run lint` before committing
3. Use existing patterns from similar files - this codebase has established conventions
4. Never fetch NFT metadata from IPFS directly - use `lib/db.ts` functions instead
5. Never make sequential RPC calls - use multicall batching from `lib/starSkrumpey.ts`

---

## 📋 Project Overview

**Star World Order (SWO)** is a Sub-DAO for Star Skrumpey NFT holders on the Monad blockchain.

| Feature | Description |
|---------|-------------|
| **DAO Governance** | Proposals, voting, treasury management |
| **OTC Marketplace** | Peer-to-peer NFT trading |
| **NFT Staking** | Earn STAR tokens with time multipliers |
| **Hangout Hub** | Retro gaming social space with chat |
| **Cosmic Raffle** | Exclusive giveaways for holders |
| **Member Directory** | Holder leaderboard and profiles |

### Design Theme
- **Retro N64-inspired UI** with synthwave aesthetics
- **CRT monitor** visual effects with scanlines
- **Neon glow** effects on interactive elements
- **Press Start 2P** pixel font for headings

---

## 🛠️ Tech Stack

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

---

## 📁 Project Structure

```
Star-World-Order/
├── app/                    # Next.js App Router pages
│   ├── api/               # API route handlers (REST endpoints)
│   │   ├── admin/         # Admin dashboard API
│   │   ├── chat/          # Chat API
│   │   ├── friends/       # Friends system API
│   │   ├── messages/      # Direct messaging API
│   │   ├── notifications/ # Notifications API
│   │   ├── profile/       # User profile API
│   │   ├── quests/        # Quest system API
│   │   ├── raffle/        # Raffle system API
│   │   ├── treasury/      # Treasury API
│   │   └── user-xp/       # XP system API
│   ├── dao/               # DAO governance page
│   ├── hangout/           # Social hangout hub
│   ├── marketplace/       # OTC marketplace
│   ├── members/           # Member directory
│   ├── profile/           # User profile page
│   ├── raffle/            # Cosmic raffle page
│   ├── treasury/          # Treasury analytics
│   └── page.tsx           # Home page (N64 boot screen)
│
├── components/            # React components
│   ├── Header.tsx         # Navigation header
│   ├── WalletConnect.tsx  # Wallet connection
│   ├── AccessGate.tsx     # NFT gating wrapper
│   ├── ProfileCard.tsx    # User profile card
│   └── NotificationBell.tsx # Notification system
│
├── lib/                   # Utility libraries
│   ├── config.ts          # Environment configuration
│   ├── db.ts              # SQLite database operations (3500+ lines)
│   ├── starSkrumpey.ts    # Star NFT verification
│   ├── rpcClient.ts       # Resilient RPC with fallback
│   ├── wagmi.ts           # Chain configuration
│   ├── magiceden.ts       # Magic Eden API for NFTs
│   ├── blockvision.ts     # BlockVision API (floor prices)
│   └── contexts/          # React contexts (DemoMode, DAOAccess)
│
├── contracts/             # Solidity smart contracts
│   ├── StarSkrumpeyMarketplace.sol
│   ├── StarSkrumpeyStaking.sol
│   └── StarWorldOrderGovernor.sol
│
├── docs/                  # Additional documentation
├── public/                # Static assets
├── data/                  # SQLite database storage
└── scripts/               # Build and utility scripts
```

---

## 🎨 Styling Guide

### Color Palette (Synthwave Theme)

```css
/* Use these colors in Tailwind classes */
--neon-cyan: #00f7ff      /* text-[#00f7ff], border-[#00f7ff] */
--neon-magenta: #ff00ff   /* text-[#ff00ff] */
--neon-gold: #ffd700      /* text-[#ffd700] */
--deep-purple: #1a0033    /* bg-[#1a0033] */
--dark-navy: #0a0015      /* bg-[#0a0015] */
```

### Component Patterns

```tsx
// Standard card/panel styling
<div className="bg-black/80 backdrop-blur-md border border-[#00f7ff]/30 rounded-lg p-4 shadow-[0_0_15px_rgba(0,247,255,0.3)]">
  {/* content */}
</div>

// Neon glow button
<button className="px-4 py-2 bg-[#00f7ff]/20 hover:bg-[#00f7ff]/30 border border-[#00f7ff] text-[#00f7ff] rounded transition-all hover:shadow-[0_0_10px_#00f7ff]">
  Button Text
</button>

// Headings use pixel font
<h1 className="font-['Press_Start_2P'] text-[#00f7ff] text-xl">
  Title
</h1>
```

---

## 🔧 Common Task Patterns

### Adding a New API Endpoint

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

### Adding a Database Table

```typescript
// In lib/db.ts - Add to initDatabase() function
db.exec(`
  CREATE TABLE IF NOT EXISTS new_table (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_new_table_wallet ON new_table(wallet_address);
`);
```

### Web3/Blockchain Interactions

```typescript
// Use Wagmi hooks for blockchain interactions
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

## 📚 Key File Reference

| Purpose | File(s) |
|---------|---------|
| **Environment config** | `lib/config.ts` |
| **Database operations** | `lib/db.ts` |
| **Star Skrumpey verification** | `lib/starSkrumpey.ts` |
| **RPC client with fallback** | `lib/rpcClient.ts` |
| **Wagmi/chain config** | `lib/wagmi.ts` |
| **Magic Eden NFT API** | `lib/magiceden.ts` |
| **BlockVision floor prices** | `lib/blockvision.ts` |
| **API routes** | `app/api/*/route.ts` |
| **React components** | `components/*.tsx` |
| **Page components** | `app/*/page.tsx` |

---

## 🔍 Finding Information

| Need to... | Where to Look |
|------------|---------------|
| Understand the full codebase | `CLAUDE.md` (3000+ lines of documentation) |
| Database schema details | `CLAUDE.md` → "Database Schema (SQLite)" section |
| API endpoint documentation | `CLAUDE.md` → "API Endpoints" section |
| Deployment instructions | `CLAUDE.md` → "Deployment Commands" section |
| Contribution guidelines | `CONTRIBUTING.md` |
| Project overview | `README.md` |

---

## ✅ Pre-Commit Checklist

Before every commit, ensure:

- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes  
- [ ] `npm run build` succeeds
- [ ] PR targets `dev` branch (NOT `main`)
- [ ] New files follow existing patterns
- [ ] Database changes include proper indexes
- [ ] API endpoints return proper JSON responses
- [ ] Components use synthwave color scheme

---

## 🔗 External Resources

| Resource | URL |
|----------|-----|
| **Live Site** | https://starworldorder.com |
| **Twitter/X** | https://x.com/StrWorldOrder |
| **Monad Explorer** | https://monadscan.com |
| **Skrumpeys Contract** | `0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0` |
| **Magic Eden API** | https://api-mainnet.magiceden.dev |
| **BlockVision Docs** | https://docs.blockvision.org |

---

## 🌐 Network Access Requirements

The agent may need access to these domains for development:

### Package Registries
- `registry.npmjs.org` - NPM packages
- `npm.pkg.github.com` - GitHub packages

### Blockchain/Web3
- `rpc.monad.xyz` - Monad RPC (primary)
- `rpc1.monad.xyz`, `rpc2.monad.xyz` - Monad RPC (fallbacks)
- `monad-mainnet.drpc.org` - Monad RPC (fallback)
- `monadscan.com` - Block explorer

### APIs Used
- `api-mainnet.magiceden.dev` - NFT collections API
- `api.blockvision.org` - Floor prices API (optional)
- `ipfs-proxy.magiceden.dev` - IPFS proxy for NFT images

### OAuth Providers (if testing auth)
- `discord.com` - Discord OAuth
- `api.twitter.com` - X/Twitter OAuth

---

**Last Updated**: January 2025
**Repository**: https://github.com/InverseAltruism/Star-World-Order
