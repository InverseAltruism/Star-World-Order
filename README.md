# ⭐ STAR WORLD ORDER ⭐

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ✦ 𓆩 INSERT CARTRIDGE TO BEGIN 𓆪 ✦                          ║
║                                                              ║
║              🐸 + ⭐ = ACCESS GRANTED                         ║
║                                                              ║
║         chosen by the stars • the order is forming           ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

## What is Star World Order?

**Star World Order (SWO)** — also known as **The Cosmic Mandate** — is an exclusive Sub-DAO for holders of Star Skrumpey NFTs on the Monad blockchain.

✦ chosen by the stars ✦

Star World Order combines retro N64 aesthetics with modern Web3 governance. Think of it as plugging in a cosmic cartridge: only those holding a Skrumpey with the rare **Star constellation trait** can access the DAO.

These 333 pixel art creatures are your key to the cosmic realm. No Star? The order awaits your return.

## 🔒 Access

To enter the Star World Order, you need:

- **A Skrumpey NFT with the Star constellation trait** (333 exist)

Regular Skrumpey holders cannot access DAO features. The Star trait is your cosmic key.

```
┌─────────────────────────────────────┐
│         ★ STAR SKRUMPEY ★           │
│                                     │
│            🐸 + ⭐                   │
│                                     │
│   your key to the cosmic realm      │
└─────────────────────────────────────┘
```

Star trait variants: `aether`, `spectra`, `solveil`, `nebulu`, `chroma`, `rose`, `monflare`, `auracore`, `parallel`, `prime`

### 🌐 IPFS Data Sources

Star Skrumpey metadata and images are stored on IPFS:

**Metadata JSON:**
- CID: `bafybeibs4foulw6giemwwxwye2qtc3bd2lx34va6c3lpkjvsweevxudsjm`
- URL Pattern: `https://ipfs-proxy.magiceden.dev/ipfs/bafybeibs4foulw6giemwwxwye2qtc3bd2lx34va6c3lpkjvsweevxudsjm/{tokenId}`

**NFT Images:**
- CID: `bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu`
- URL Pattern: `https://ipfs-proxy.magiceden.dev/ipfs/bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu/{tokenId}.png`

**Example Metadata (Token #3189):**
```json
{
  "attributes": [
    { "value": "aroma", "trait_type": "aura" },
    { "value": "flora", "trait_type": "background" },
    { "value": "parallel", "trait_type": "constellation" },
    { "value": "dork", "trait_type": "eyes" },
    { "value": "super sayain", "trait_type": "form" },
    { "value": "drool", "trait_type": "mood" }
  ],
  "description": "A collection of 3,333 pixel art pfpNFTs capturing Monad's spirit. Created by melo.",
  "image": "ipfs://bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu/3189.png",
  "name": "SKRUMP #3189"
}
```

### 🌟 Constellation Rarity Distribution

| Constellation | Count | Rarity |
|---------------|-------|--------|
| aether | 52 | Common |
| spectra | 52 | Common |
| solveil | 46 | Uncommon |
| nebulu | 44 | Uncommon |
| chroma | 42 | Uncommon |
| rose | 36 | Rare |
| monflare | 27 | Rare |
| auracore | 23 | Epic |
| parallel | 10 | Legendary |
| prime | 1 | Mythic (1 of 1) |

## ✨ Features

### 🏛️ DAO Governance
- **Proposals & Voting** - Create and vote on governance proposals
- **Weighted Voting** - Voting power = √STAR + NFT count for fairness
- **Treasury Management** - Community-controlled DAO treasury
- **Star Council Forum** - Discussion threads and community conversations

### 🔄 Cosmic Exchange (OTC Marketplace)
- **Peer-to-Peer Trading** - Trustless NFT marketplace for Star Skrumpeys
- **Fixed-Price Listings** - Set your own MON price
- **DAO Fee** - 2.5% supports treasury
- **Filter & Sort** - Find listings by price, variant, token ID

### ⭐ STAR Staking
- **Earn STAR Tokens** - 1 NFT = rewards per second (configurable)
- **Time Multipliers** - Longer stakes = higher rewards (up to 200%)
- **Multiple Staking** - Stake all your Star Skrumpeys at once
- **No Lock Period** - Instant unstaking available

### 🎮 Hangout Hub
- **Retro Gaming Lobby** - N64-inspired social space
- **Chat Bubbles** - Messages appear above avatars
- **Voice Chat** - Real-time voice communication
- **Online Presence** - See who's in the cosmic realm

## 📜 Smart Contracts

Star World Order uses custom Solidity contracts optimized for Monad's high-performance EVM. All contracts are open source and available in this repository.

### StarSkrumpeyMarketplace.sol

OTC peer-to-peer marketplace for Star Skrumpey trading.

**Features:**
- Fixed-price listings with MON
- Atomic trustless swaps
- 2.5% DAO treasury fee
- Emergency pause controls
- ReentrancyGuard protection

**Location:** [`contracts/StarSkrumpeyMarketplace.sol`](contracts/StarSkrumpeyMarketplace.sol)

### StarSkrumpeyStaking.sol

NFT staking system for earning STAR tokens.

**Features:**
- Configurable rewards per second
- Time-based multipliers (1 week to 1 year)
- Multiple NFT staking
- Emergency unstake with penalty

**Location:** [`contracts/StarSkrumpeyStaking.sol`](contracts/StarSkrumpeyStaking.sol)

### StarWorldOrderGovernor.sol

DAO governance with proposal creation and voting.

**Features:**
- NFT-weighted voting (1 Star Skrumpey = 1 Vote)
- Square root STAR weighting for fairness
- Configurable voting period, delay, quorum
- Proposal lifecycle management

**Location:** [`contracts/StarWorldOrderGovernor.sol`](contracts/StarWorldOrderGovernor.sol)

## 🔗 Links

- **Website**: https://starworldorder.com
- **Twitter**: https://x.com/StrWorldOrder
- **Skrumpeys**: https://x.com/skrumpeys
- **Monad Explorer**: https://monadscan.com
- **GitHub**: https://github.com/InverseAltruism/Star-World-Order

## 🛠️ Tech Stack

- **Blockchain**: Monad (Chain ID: 143)
- **Frontend**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS 4, Synthwave theme
- **Web3**: Wagmi 3, Viem 2
- **Contracts**: Solidity 0.8.20, OpenZeppelin 5.x
- **Database**: SQLite (better-sqlite3)
- **Font**: Press Start 2P (Retro Pixel)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2025 Star World Order Contributors

---

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ✦ 𓆩 STAR WORLD ORDER 𓆪 ✦                                   ║
║                                                              ║
║   chosen by the stars • the order is forming • @skrumpeys    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

**For Developers**: See [`CLAUDE.md`](CLAUDE.md) for comprehensive technical documentation including deployment, database schemas, API endpoints, and more.
