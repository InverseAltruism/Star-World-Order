# Star Forge - Casino Game Documentation

## Overview

Star Forge is a provably fair 5x5 constellation grid game on Monad blockchain. Players bet MON tokens to reveal a random 5x5 grid of stars, and win based on the constellation patterns formed.

## Game Mechanics

### How It Works
1. **Select Tier** - Choose Bronze (45 MON), Silver (225 MON), or Gold (450 MON)
2. **Spin** - Click to commit your bet and start the game
3. **Reveal** - Watch the slot machine-style animation reveal your constellation
4. **Win** - Match patterns to win up to 10x your bet, or hit the Supernova jackpot!

### Constellation Patterns (Highest to Lowest)

| Pattern | Emoji | Description | Multiplier |
|---------|-------|-------------|------------|
| Supernova | 💥 | All 25 stars filled | JACKPOT |
| Galaxy | 🌌 | 20+ stars | 10x |
| Big Dipper | ✨ | 7-star ladle pattern | 7x |
| Orion | 🏹 | Diagonal with belt | 5x |
| Cassiopeia | 👑 | W-shaped pattern | 5x |
| Crux | ✝️ | Cross/plus pattern | 3x |
| Line | ➖ | 5 in a row/column/diagonal | 2x |
| Binary | ⭐ | 2+ adjacent stars | 1.3x |
| Void | 🌑 | No pattern | 0x |

### Tier System

| Tier | Entry Fee | Max Payout | Treasury Required |
|------|-----------|------------|-------------------|
| Bronze | 45 MON | 450 MON | 4,500 MON |
| Silver | 225 MON | 2,250 MON | 22,500 MON |
| Gold | 450 MON | 4,500 MON | 45,000 MON |

## Provably Fair System

Star Forge uses commit-reveal randomness:

1. **Commit Phase**: Server generates a secret seed and commits its hash
2. **Client Seed**: Player's browser generates a random client seed
3. **Reveal**: Seeds are combined to generate the grid deterministically
4. **Verification**: Anyone can verify by hashing the server seed

### Fee Distribution

**Standard Players:**
- 88% → Prize Pool
- 5% → Jackpot Pool
- 7% → Treasury (house edge)

**Star Skrumpey Holders:**
- 88% → Prize Pool
- 5% → Jackpot Pool
- 4% → Treasury
- 3% → Player bonus (better RTP!)

## Technical Architecture

### Frontend
- `/app/starforge/page.tsx` - Page entry point
- `/app/starforge/StarForgeContent.tsx` - Main game component with slot machine animations

### Backend API
- `POST /api/starforge/commit` - Create game commitment
- `POST /api/starforge/reveal` - Reveal game result
- `GET /api/starforge/stats` - Get statistics and recent games
- `GET /api/starforge/verify` - Verify past game fairness

### Library
- `/lib/starforge/rng.ts` - Random number generation
- `/lib/starforge/patterns.ts` - Pattern matching
- `/lib/starforge/economics.ts` - Fee calculations

### Smart Contract
- `/contracts/StarForge.sol` - On-chain game logic (Monad compatible)

## Remaining Work

### High Priority
- [ ] Integrate with deployed smart contract for real MON transactions
- [ ] Add wallet transaction signing for bets
- [ ] Implement proper server seed storage (Redis)
- [ ] Add sound effects for spinning and wins

### Medium Priority
- [ ] Add game history page for players
- [ ] Implement leaderboard
- [ ] Add progressive jackpot display animation
- [ ] Mobile gesture support (swipe to spin)

### Low Priority
- [ ] Add more constellation patterns
- [ ] Seasonal/themed variations
- [ ] Tournament mode
- [ ] Achievement badges

## Security Considerations

1. **Rate Limiting**: Max 10 games per minute per wallet
2. **Server Seed**: Must be stored securely (not in database)
3. **Treasury Lock**: Tiers auto-disable if treasury balance insufficient
4. **Reentrancy Guard**: Smart contract protected
5. **Pausable**: Contract can be paused in emergencies

## Deployment Notes

### Contract Deployment
```bash
# Compile contract
npm run compile

# Deploy to Monad (requires configured deployer wallet)
# Contract address should be added to lib/config.ts
```

### Environment Variables
```
STARFORGE_CONTRACT_ADDRESS=0x...
REDIS_URL=redis://... (for server seed storage)
```

---

*Built for Star World Order DAO* ⭐
