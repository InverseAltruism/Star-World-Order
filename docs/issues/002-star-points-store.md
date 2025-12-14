# Issue #2: STAR Points Store/Shop

## 🛒 Feature Overview

Create a **STAR Points Store** where Star Skrumpey holders can exchange their accumulated STAR points (earned from staking) for exclusive rewards including:
- Whitelist (WL) spots for upcoming mints
- NFTs and digital collectibles
- Physical merchandise
- Special access passes
- Community perks

The store must support two distribution mechanisms:
1. **FCFS (First Come First Served)** - Instant purchase
2. **Lottery** - Random selection from entrants

## 🎯 Goals

- Provide utility for STAR points beyond governance voting
- Create engaging distribution mechanisms (FCFS + Lottery)
- Build easy-to-use admin interface for item management
- Ensure fair and transparent distribution
- Track purchase/redemption history

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      STAR POINTS STORE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │   STORE FRONT   │    │  DISTRIBUTION   │    │    ADMIN    │ │
│  │                 │    │     ENGINE      │    │  DASHBOARD  │ │
│  │ • Browse Items  │    │                 │    │             │ │
│  │ • Item Details  │    │ • FCFS Queue    │    │ • Create    │ │
│  │ • Purchase Flow │    │ • Lottery Draw  │    │ • Edit      │ │
│  │ • History       │    │ • Claim System  │    │ • Manage    │ │
│  └─────────────────┘    └─────────────────┘    └─────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    DATABASE LAYER                           ││
│  │                                                             ││
│  │  • store_items        - Item catalog                        ││
│  │  • store_purchases    - FCFS purchase records               ││
│  │  • lottery_entries    - Lottery participation               ││
│  │  • lottery_results    - Winner selection history            ││
│  │  • redemptions        - Physical item fulfillment           ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 📊 Database Schema

### `store_items` Table

```sql
CREATE TABLE IF NOT EXISTS store_items (
  id TEXT PRIMARY KEY,
  
  -- Basic Info
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  category TEXT NOT NULL CHECK (category IN ('whitelist', 'nft', 'merchandise', 'access', 'other')),
  
  -- Pricing
  price_star INTEGER NOT NULL,  -- Cost in STAR points
  
  -- Distribution Method
  distribution_type TEXT NOT NULL CHECK (distribution_type IN ('fcfs', 'lottery')),
  
  -- Stock/Availability
  total_supply INTEGER NOT NULL,          -- Total available
  remaining_supply INTEGER NOT NULL,       -- Current stock
  max_per_wallet INTEGER DEFAULT 1,        -- Limit per user
  
  -- Lottery-specific fields (nullable for FCFS)
  lottery_start_time DATETIME,             -- When entries open
  lottery_end_time DATETIME,               -- When entries close
  lottery_draw_time DATETIME,              -- When winners selected
  lottery_winners_count INTEGER,           -- How many winners
  
  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'ended', 'sold_out')),
  
  -- Requirements (optional)
  min_nft_count INTEGER DEFAULT 0,         -- Minimum NFTs owned
  min_star_balance INTEGER DEFAULT 0,      -- Minimum STAR balance
  required_variant TEXT,                   -- Specific star variant required
  
  -- Metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL                 -- Admin wallet address
);
```

### `store_purchases` Table (FCFS)

```sql
CREATE TABLE IF NOT EXISTS store_purchases (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES store_items(id),
  buyer_address TEXT NOT NULL,
  
  quantity INTEGER NOT NULL DEFAULT 1,
  star_spent INTEGER NOT NULL,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'refunded')),
  
  -- For physical items
  shipping_info TEXT,  -- JSON: { name, address, etc. }
  fulfillment_status TEXT CHECK (fulfillment_status IN ('pending', 'shipped', 'delivered')),
  tracking_number TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `lottery_entries` Table

```sql
CREATE TABLE IF NOT EXISTS lottery_entries (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES store_items(id),
  entrant_address TEXT NOT NULL,
  
  star_spent INTEGER NOT NULL,  -- STAR committed for entry
  entry_count INTEGER NOT NULL DEFAULT 1,  -- Multiple entries allowed?
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(item_id, entrant_address)  -- One entry per user per lottery
);
```

### `lottery_results` Table

```sql
CREATE TABLE IF NOT EXISTS lottery_results (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES store_items(id),
  
  -- Winner info
  winner_address TEXT NOT NULL,
  entry_id TEXT REFERENCES lottery_entries(id),
  
  -- Selection metadata
  selection_index INTEGER NOT NULL,  -- 1st winner, 2nd winner, etc.
  random_seed TEXT NOT NULL,         -- Verifiable randomness
  
  -- Claim status
  claimed BOOLEAN DEFAULT FALSE,
  claimed_at DATETIME,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 📁 Folder Structure

```
app/
├── store/
│   ├── page.tsx                    # Store front page
│   ├── StoreContent.tsx            # Main store component
│   ├── [itemId]/
│   │   └── page.tsx                # Item detail page
│   └── admin/
│       ├── page.tsx                # Admin dashboard
│       ├── AdminContent.tsx        # Admin main component
│       ├── CreateItem.tsx          # Item creation form
│       └── ManageItem.tsx          # Edit/manage existing items
│
├── api/
│   └── store/
│       ├── items/
│       │   ├── route.ts            # GET all, POST create
│       │   └── [id]/
│       │       └── route.ts        # GET, PATCH, DELETE item
│       ├── purchase/
│       │   └── route.ts            # POST purchase (FCFS)
│       ├── lottery/
│       │   ├── enter/
│       │   │   └── route.ts        # POST enter lottery
│       │   ├── draw/
│       │   │   └── route.ts        # POST trigger draw (admin)
│       │   └── claim/
│       │       └── route.ts        # POST claim prize
│       └── history/
│           └── route.ts            # GET user purchase history
│
lib/
├── hooks/
│   └── useStore.ts                 # Store state and actions
└── store/
    ├── types.ts                    # TypeScript interfaces
    ├── db.ts                       # Database operations
    └── lottery.ts                  # Lottery logic
```

## 💻 Implementation

### Types: `lib/store/types.ts`

```typescript
export enum ItemCategory {
  Whitelist = 'whitelist',
  NFT = 'nft',
  Merchandise = 'merchandise',
  Access = 'access',
  Other = 'other',
}

export enum DistributionType {
  FCFS = 'fcfs',
  Lottery = 'lottery',
}

export enum ItemStatus {
  Draft = 'draft',
  Active = 'active',
  Paused = 'paused',
  Ended = 'ended',
  SoldOut = 'sold_out',
}

export enum PurchaseStatus {
  Completed = 'completed',
  Refunded = 'refunded',
}

export enum FulfillmentStatus {
  Pending = 'pending',
  Shipped = 'shipped',
  Delivered = 'delivered',
}

export interface StoreItem {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  category: ItemCategory;
  priceSTAR: number;
  distributionType: DistributionType;
  totalSupply: number;
  remainingSupply: number;
  maxPerWallet: number;
  
  // Lottery fields
  lotteryStartTime?: Date;
  lotteryEndTime?: Date;
  lotteryDrawTime?: Date;
  lotteryWinnersCount?: number;
  
  // Status
  status: ItemStatus;
  
  // Requirements
  minNFTCount: number;
  minSTARBalance: number;
  requiredVariant?: string;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface Purchase {
  id: string;
  itemId: string;
  buyerAddress: string;
  quantity: number;
  starSpent: number;
  status: PurchaseStatus;
  shippingInfo?: ShippingInfo;
  fulfillmentStatus?: FulfillmentStatus;
  trackingNumber?: string;
  createdAt: Date;
}

export interface ShippingInfo {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  email: string;
}

export interface LotteryEntry {
  id: string;
  itemId: string;
  entrantAddress: string;
  starSpent: number;
  entryCount: number;
  createdAt: Date;
}

export interface LotteryResult {
  id: string;
  itemId: string;
  winnerAddress: string;
  entryId: string;
  selectionIndex: number;
  randomSeed: string;
  claimed: boolean;
  claimedAt?: Date;
  createdAt: Date;
}

// API Request/Response types
export interface CreateItemRequest {
  name: string;
  description: string;
  imageUrl?: string;
  category: ItemCategory;
  priceSTAR: number;
  distributionType: DistributionType;
  totalSupply: number;
  maxPerWallet?: number;
  
  // Lottery options
  lotteryStartTime?: string;
  lotteryEndTime?: string;
  lotteryDrawTime?: string;
  lotteryWinnersCount?: number;
  
  // Requirements
  minNFTCount?: number;
  minSTARBalance?: number;
  requiredVariant?: string;
}

export interface PurchaseRequest {
  itemId: string;
  quantity?: number;
  shippingInfo?: ShippingInfo;
}

export interface LotteryEntryRequest {
  itemId: string;
}
```

### Store Hook: `lib/hooks/useStore.ts`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { 
  StoreItem, 
  Purchase, 
  LotteryEntry, 
  LotteryResult,
  ItemCategory,
  DistributionType,
  ItemStatus,
  CreateItemRequest,
  PurchaseRequest,
} from '@/lib/store/types';

// Admin wallet addresses (should be in env/config)
const ADMIN_ADDRESSES = [
  '0x...', // Add admin addresses
];

export function useStore() {
  const { address } = useAccount();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [userPurchases, setUserPurchases] = useState<Purchase[]>([]);
  const [userLotteryEntries, setUserLotteryEntries] = useState<LotteryEntry[]>([]);
  const [userWins, setUserWins] = useState<LotteryResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [starBalance, setStarBalance] = useState(0);
  
  const isAdmin = address && ADMIN_ADDRESSES.includes(address.toLowerCase());
  
  // Fetch all store items
  const fetchItems = useCallback(async () => {
    try {
      const response = await fetch('/api/store/items');
      const data = await response.json();
      if (data.success) {
        setItems(data.items);
      }
    } catch (error) {
      console.error('Failed to fetch store items:', error);
    }
  }, []);
  
  // Fetch user's purchase history
  const fetchUserHistory = useCallback(async () => {
    if (!address) return;
    
    try {
      const response = await fetch(`/api/store/history?address=${address}`);
      const data = await response.json();
      if (data.success) {
        setUserPurchases(data.purchases);
        setUserLotteryEntries(data.lotteryEntries);
        setUserWins(data.wins);
      }
    } catch (error) {
      console.error('Failed to fetch user history:', error);
    }
  }, [address]);
  
  // Fetch user's STAR balance
  const fetchStarBalance = useCallback(async () => {
    if (!address) return;
    
    try {
      const response = await fetch(`/api/star/balance?address=${address}`);
      const data = await response.json();
      if (data.success) {
        setStarBalance(data.balance);
      }
    } catch (error) {
      console.error('Failed to fetch STAR balance:', error);
    }
  }, [address]);
  
  // Initial fetch
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchItems(),
        fetchUserHistory(),
        fetchStarBalance(),
      ]);
      setIsLoading(false);
    };
    
    init();
  }, [fetchItems, fetchUserHistory, fetchStarBalance]);
  
  // Purchase item (FCFS)
  const purchaseItem = useCallback(async (
    request: PurchaseRequest
  ): Promise<{ success: boolean; error?: string; purchase?: Purchase }> => {
    if (!address) return { success: false, error: 'Wallet not connected' };
    
    setIsPending(true);
    try {
      const response = await fetch('/api/store/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...request,
          buyerAddress: address,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        await Promise.all([fetchItems(), fetchUserHistory(), fetchStarBalance()]);
        return { success: true, purchase: data.purchase };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: 'Purchase failed' };
    } finally {
      setIsPending(false);
    }
  }, [address, fetchItems, fetchUserHistory, fetchStarBalance]);
  
  // Enter lottery
  const enterLottery = useCallback(async (
    itemId: string
  ): Promise<{ success: boolean; error?: string; entry?: LotteryEntry }> => {
    if (!address) return { success: false, error: 'Wallet not connected' };
    
    setIsPending(true);
    try {
      const response = await fetch('/api/store/lottery/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, entrantAddress: address }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        await Promise.all([fetchItems(), fetchUserHistory(), fetchStarBalance()]);
        return { success: true, entry: data.entry };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: 'Failed to enter lottery' };
    } finally {
      setIsPending(false);
    }
  }, [address, fetchItems, fetchUserHistory, fetchStarBalance]);
  
  // Claim lottery prize
  const claimPrize = useCallback(async (
    resultId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!address) return { success: false, error: 'Wallet not connected' };
    
    setIsPending(true);
    try {
      const response = await fetch('/api/store/lottery/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultId, winnerAddress: address }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        await fetchUserHistory();
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: 'Failed to claim prize' };
    } finally {
      setIsPending(false);
    }
  }, [address, fetchUserHistory]);
  
  // Admin: Create item
  const createItem = useCallback(async (
    request: CreateItemRequest
  ): Promise<{ success: boolean; error?: string; item?: StoreItem }> => {
    if (!address || !isAdmin) return { success: false, error: 'Unauthorized' };
    
    setIsPending(true);
    try {
      const response = await fetch('/api/store/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, createdBy: address }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        await fetchItems();
        return { success: true, item: data.item };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: 'Failed to create item' };
    } finally {
      setIsPending(false);
    }
  }, [address, isAdmin, fetchItems]);
  
  // Admin: Update item
  const updateItem = useCallback(async (
    itemId: string,
    updates: Partial<CreateItemRequest>
  ): Promise<{ success: boolean; error?: string }> => {
    if (!address || !isAdmin) return { success: false, error: 'Unauthorized' };
    
    setIsPending(true);
    try {
      const response = await fetch(`/api/store/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      
      const data = await response.json();
      
      if (data.success) {
        await fetchItems();
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: 'Failed to update item' };
    } finally {
      setIsPending(false);
    }
  }, [address, isAdmin, fetchItems]);
  
  // Admin: Trigger lottery draw
  const triggerLotteryDraw = useCallback(async (
    itemId: string
  ): Promise<{ success: boolean; error?: string; winners?: LotteryResult[] }> => {
    if (!address || !isAdmin) return { success: false, error: 'Unauthorized' };
    
    setIsPending(true);
    try {
      const response = await fetch('/api/store/lottery/draw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, adminAddress: address }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        await fetchItems();
        return { success: true, winners: data.winners };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: 'Failed to draw lottery' };
    } finally {
      setIsPending(false);
    }
  }, [address, isAdmin, fetchItems]);
  
  // Computed values
  const activeItems = items.filter(i => i.status === ItemStatus.Active);
  const fcfsItems = activeItems.filter(i => i.distributionType === DistributionType.FCFS);
  const lotteryItems = activeItems.filter(i => i.distributionType === DistributionType.Lottery);
  
  return {
    // State
    items,
    activeItems,
    fcfsItems,
    lotteryItems,
    userPurchases,
    userLotteryEntries,
    userWins,
    starBalance,
    isLoading,
    isPending,
    isAdmin,
    
    // Actions
    purchaseItem,
    enterLottery,
    claimPrize,
    createItem,
    updateItem,
    triggerLotteryDraw,
    refresh: fetchItems,
  };
}
```

### Lottery Logic: `lib/store/lottery.ts`

```typescript
import crypto from 'crypto';
import { LotteryEntry, LotteryResult } from './types';

/**
 * Verifiable random lottery selection
 * Uses block hash + timestamp + item ID for deterministic randomness
 */
export function selectLotteryWinners(
  entries: LotteryEntry[],
  winnersCount: number,
  itemId: string,
  blockHash?: string
): LotteryResult[] {
  if (entries.length === 0) return [];
  if (winnersCount <= 0) return [];
  
  // Generate random seed
  const seed = generateRandomSeed(itemId, blockHash);
  
  // Create weighted pool (if allowing multiple entries per user)
  const pool: { entry: LotteryEntry; index: number }[] = [];
  entries.forEach((entry, i) => {
    for (let j = 0; j < entry.entryCount; j++) {
      pool.push({ entry, index: i });
    }
  });
  
  // Shuffle pool using Fisher-Yates with seeded random
  const rng = createSeededRandom(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  
  // Select unique winners
  const winners: LotteryResult[] = [];
  const selectedAddresses = new Set<string>();
  
  for (const { entry } of pool) {
    if (winners.length >= winnersCount) break;
    if (selectedAddresses.has(entry.entrantAddress.toLowerCase())) continue;
    
    selectedAddresses.add(entry.entrantAddress.toLowerCase());
    
    winners.push({
      id: crypto.randomUUID(),
      itemId,
      winnerAddress: entry.entrantAddress,
      entryId: entry.id,
      selectionIndex: winners.length + 1,
      randomSeed: seed,
      claimed: false,
      createdAt: new Date(),
    });
  }
  
  return winners;
}

/**
 * Generate verifiable random seed
 */
function generateRandomSeed(itemId: string, blockHash?: string): string {
  const timestamp = Date.now().toString();
  const input = `${itemId}-${blockHash || 'local'}-${timestamp}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Create seeded random number generator
 */
function createSeededRandom(seed: string): () => number {
  // Simple seeded PRNG using the seed hash
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  
  return () => {
    hash = Math.sin(hash) * 10000;
    return hash - Math.floor(hash);
  };
}

/**
 * Verify lottery result was fair
 */
export function verifyLotteryResult(
  result: LotteryResult,
  entries: LotteryEntry[]
): boolean {
  // Re-run selection with same seed
  const itemId = result.itemId;
  
  // Extract block hash from seed (if stored)
  // For full verification, would need to store more metadata
  
  return true; // Simplified - implement full verification as needed
}
```

### Store Page Component: `app/store/StoreContent.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useStore } from '@/lib/hooks/useStore';
import AccessGate from '@/components/AccessGate';
import { 
  StoreItem, 
  ItemCategory, 
  DistributionType, 
  ItemStatus,
} from '@/lib/store/types';

// Item Card Component
function ItemCard({ 
  item, 
  onPurchase, 
  onEnterLottery,
  userStarBalance,
  isPending,
  hasEntered,
  hasPurchased,
}: { 
  item: StoreItem;
  onPurchase: () => void;
  onEnterLottery: () => void;
  userStarBalance: number;
  isPending: boolean;
  hasEntered: boolean;
  hasPurchased: boolean;
}) {
  const canAfford = userStarBalance >= item.priceSTAR;
  const isSoldOut = item.remainingSupply <= 0;
  const isLottery = item.distributionType === DistributionType.Lottery;
  
  const categoryIcons: Record<ItemCategory, string> = {
    [ItemCategory.Whitelist]: '📋',
    [ItemCategory.NFT]: '🎨',
    [ItemCategory.Merchandise]: '👕',
    [ItemCategory.Access]: '🔑',
    [ItemCategory.Other]: '✨',
  };
  
  return (
    <div className="pixel-card p-4 smooth-transition hover-lift animate-slide-in-up">
      {/* Image */}
      <div className="w-full h-40 bg-[#1a1a2e] rounded-lg mb-4 flex items-center justify-center border border-[#2a2a4e] overflow-hidden">
        {item.imageUrl ? (
          <img 
            src={item.imageUrl} 
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-4xl animate-pixel-float">
            {categoryIcons[item.category]}
          </span>
        )}
      </div>
      
      {/* Info */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">{categoryIcons[item.category]}</span>
          <h3 className="text-gray-200 text-sm font-bold truncate">{item.name}</h3>
        </div>
        <p className="text-gray-500 text-xs line-clamp-2 mb-2">{item.description}</p>
        
        {/* Distribution Type Badge */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[10px] px-2 py-0.5 rounded ${
            isLottery 
              ? 'bg-[#9966ff]/20 text-[#9966ff]' 
              : 'bg-[#44ff88]/20 text-[#44ff88]'
          }`}>
            {isLottery ? '🎲 LOTTERY' : '⚡ FCFS'}
          </span>
          
          {isLottery && item.lotteryEndTime && (
            <span className="text-[10px] text-gray-500">
              Ends: {new Date(item.lotteryEndTime).toLocaleDateString()}
            </span>
          )}
        </div>
        
        {/* Stock */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-500 text-[10px]">
            {isLottery ? 'Winners' : 'Available'}:
          </span>
          <span className={`text-xs font-bold ${
            isSoldOut ? 'text-[#ff4466]' : 'text-[#44ff88]'
          }`}>
            {isLottery ? item.lotteryWinnersCount : item.remainingSupply} / {item.totalSupply}
          </span>
        </div>
      </div>
      
      {/* Price and Action */}
      <div className="border-t border-[#2a2a4e] pt-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-gray-500 text-[10px]">PRICE</p>
            <p className="text-[#ffd700] text-sm font-bold">
              {item.priceSTAR.toLocaleString()} ⭐
            </p>
          </div>
          
          {!canAfford && (
            <span className="text-[#ff4466] text-[10px]">
              Not enough STAR
            </span>
          )}
        </div>
        
        {/* Action Button */}
        {isLottery ? (
          <button
            onClick={onEnterLottery}
            disabled={isPending || !canAfford || hasEntered}
            className="w-full pixel-btn pixel-btn-gold text-xs !py-2 smooth-transition disabled:opacity-50"
          >
            {hasEntered 
              ? '✅ ENTERED' 
              : isPending 
                ? '⏳ ENTERING...' 
                : '🎲 ENTER LOTTERY'}
          </button>
        ) : (
          <button
            onClick={onPurchase}
            disabled={isPending || !canAfford || isSoldOut || hasPurchased}
            className="w-full pixel-btn pixel-btn-gold text-xs !py-2 smooth-transition disabled:opacity-50"
          >
            {hasPurchased 
              ? '✅ PURCHASED' 
              : isSoldOut 
                ? '❌ SOLD OUT' 
                : isPending 
                  ? '⏳ BUYING...' 
                  : '💰 BUY NOW'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function StoreContent() {
  const {
    activeItems,
    fcfsItems,
    lotteryItems,
    userPurchases,
    userLotteryEntries,
    starBalance,
    isLoading,
    isPending,
    purchaseItem,
    enterLottery,
  } = useStore();
  
  const [activeTab, setActiveTab] = useState<'all' | 'fcfs' | 'lottery'>('all');
  
  const displayItems = activeTab === 'all' 
    ? activeItems 
    : activeTab === 'fcfs' 
      ? fcfsItems 
      : lotteryItems;
  
  const hasPurchased = (itemId: string) => 
    userPurchases.some(p => p.itemId === itemId);
  
  const hasEntered = (itemId: string) => 
    userLotteryEntries.some(e => e.itemId === itemId);
  
  return (
    <>
      {/* Header */}
      <div className="text-center mb-8 animate-slide-in-up">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="text-2xl animate-pixel-float">🛒</span>
          <h1 className="text-lg md:text-xl text-[#ffd700] pixel-glow-gold tracking-wider">
            STAR STORE
          </h1>
          <span className="text-2xl animate-pixel-float" style={{ animationDelay: '0.5s' }}>⭐</span>
        </div>
        <p className="text-[#9966ff] text-xs tracking-wide animate-glow-pulse">
          ✦ EXCHANGE YOUR STAR POINTS FOR EXCLUSIVE REWARDS ✦
        </p>
      </div>
      
      <AccessGate
        title="STORE LOCKED"
        message="Only Star Skrumpey holders may access the Star Store."
      >
        {/* Balance Display */}
        <div className="pixel-card p-4 mb-6 flex items-center justify-between animate-slide-in-up">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💰</span>
            <div>
              <p className="text-gray-500 text-[10px]">YOUR STAR BALANCE</p>
              <p className="text-[#ffd700] text-lg font-bold">
                {starBalance.toLocaleString()} ⭐
              </p>
            </div>
          </div>
          
          <div className="text-right">
            <p className="text-gray-500 text-[10px]">ITEMS AVAILABLE</p>
            <p className="text-[#44ff88] text-sm font-bold">{activeItems.length}</p>
          </div>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex justify-center gap-2 mb-6 animate-slide-in-up animate-delay-1">
          {[
            { id: 'all', label: 'ALL', count: activeItems.length },
            { id: 'fcfs', label: '⚡ FCFS', count: fcfsItems.length },
            { id: 'lottery', label: '🎲 LOTTERY', count: lotteryItems.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`pixel-btn text-xs !px-4 !py-2 smooth-transition ${
                activeTab === tab.id 
                  ? 'pixel-btn-gold' 
                  : '!bg-[#1a1a2e] !border-[#3a3a5e_#1a1a2e_#1a1a2e_#3a3a5e]'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        
        {/* Loading State */}
        {isLoading ? (
          <div className="pixel-card p-8 text-center animate-slide-in-up">
            <div className="text-4xl mb-4 animate-spin">⭐</div>
            <p className="text-[#ffd700] text-xs animate-pixel-pulse">LOADING STORE...</p>
          </div>
        ) : displayItems.length === 0 ? (
          /* Empty State */
          <div className="pixel-card p-8 text-center animate-slide-in-up">
            <div className="text-4xl mb-4 animate-pixel-float">🌌</div>
            <h3 className="text-[#ffd700] text-xs tracking-wider mb-2">NO ITEMS AVAILABLE</h3>
            <p className="text-gray-500 text-xs">
              Check back later for new rewards!
            </p>
          </div>
        ) : (
          /* Items Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onPurchase={() => purchaseItem({ itemId: item.id })}
                onEnterLottery={() => enterLottery(item.id)}
                userStarBalance={starBalance}
                isPending={isPending}
                hasEntered={hasEntered(item.id)}
                hasPurchased={hasPurchased(item.id)}
              />
            ))}
          </div>
        )}
        
        {/* Info Footer */}
        <div className="pixel-card p-4 mt-8 animate-slide-in-up animate-delay-6">
          <div className="flex items-start gap-3">
            <span className="text-xl">ℹ️</span>
            <div>
              <p className="text-[#9966ff] text-xs mb-1">HOW IT WORKS</p>
              <ul className="text-gray-500 text-[10px] space-y-1">
                <li>• <span className="text-[#44ff88]">FCFS</span> items are purchased instantly until sold out</li>
                <li>• <span className="text-[#9966ff]">LOTTERY</span> items require entry; winners selected at draw time</li>
                <li>• STAR points are deducted upon purchase/entry</li>
                <li>• Losing lottery entries are automatically refunded</li>
              </ul>
            </div>
          </div>
        </div>
      </AccessGate>
    </>
  );
}
```

## 🔐 Admin Interface

### Admin Dashboard: `app/store/admin/AdminContent.tsx`

The admin interface should include:

1. **Dashboard Overview**
   - Active items count
   - Total sales/entries
   - Revenue in STAR
   - Pending lotteries

2. **Item Management**
   - Create new item form
   - Edit existing items
   - Pause/activate items
   - Delete items (with confirmation)

3. **Lottery Management**
   - View entries per lottery
   - Manual draw trigger
   - Re-draw capability (for unclaimed prizes)
   - Export winner list

4. **Order Management** (for merchandise)
   - View orders by status
   - Update fulfillment status
   - Add tracking numbers
   - Export shipping data

## 📋 API Routes Summary

| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/api/store/items` | GET | List all items | Public |
| `/api/store/items` | POST | Create item | Admin |
| `/api/store/items/[id]` | GET | Get item details | Public |
| `/api/store/items/[id]` | PATCH | Update item | Admin |
| `/api/store/items/[id]` | DELETE | Delete item | Admin |
| `/api/store/purchase` | POST | Buy FCFS item | Holder |
| `/api/store/lottery/enter` | POST | Enter lottery | Holder |
| `/api/store/lottery/draw` | POST | Trigger draw | Admin |
| `/api/store/lottery/claim` | POST | Claim prize | Winner |
| `/api/store/history` | GET | User history | Holder |

## 🔒 Security Considerations

1. **Rate Limiting** - Prevent spam purchases/entries
2. **Signature Verification** - Require signed messages for purchases
3. **STAR Balance Verification** - Double-check balances server-side
4. **Admin Authorization** - Multi-sig for sensitive operations
5. **Lottery Fairness** - Use verifiable randomness (consider Chainlink VRF for on-chain)

## 📋 Staged Roadmap

### Stage 1: MVP (Week 1-2)
- [ ] Database schema implementation
- [ ] Basic store page with item listing
- [ ] FCFS purchase flow
- [ ] Purchase history

### Stage 2: Lottery System (Week 3)
- [ ] Lottery entry system
- [ ] Automated draw mechanism
- [ ] Winner notification
- [ ] Prize claiming

### Stage 3: Admin Interface (Week 4)
- [ ] Item creation form
- [ ] Item management (edit/delete)
- [ ] Lottery management
- [ ] Order tracking

### Stage 4: Polish (Week 5)
- [ ] Email notifications (optional)
- [ ] Discord notifications
- [ ] Mobile optimization
- [ ] Analytics dashboard

## 🏷️ Labels

- `feature`
- `store`
- `star-points`
- `lottery`
- `fcfs`
- `admin`

## 📅 Estimated Effort

- **MVP**: 2 weeks (1 developer)
- **Lottery**: 1 week
- **Admin**: 1 week
- **Polish**: 1 week

**Total**: 5 weeks for full implementation

---

*Spend your STAR wisely... ⭐*
