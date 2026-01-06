# Copilot Instructions for Star World Order

This file provides guidance for GitHub Copilot coding agent when working on this repository.

## Project Overview

Star World Order (SWO) is a Sub-DAO for Star Skrumpey holders on the Monad blockchain. It features:
- Retro N64-inspired UI with synthwave aesthetics
- DAO governance
- OTC marketplace
- NFT staking
- Community hangout hub

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript 5.9+
- **Styling**: Tailwind CSS 4 (synthwave/retro theme)
- **Web3**: Wagmi 3, Viem 2
- **Smart Contracts**: Solidity 0.8.20, OpenZeppelin 5.x
- **Database**: SQLite (better-sqlite3)
- **Blockchain**: Monad (Chain ID: 143)

## Essential Commands

```bash
# Development
npm run dev              # Start dev server (port 3000)
npm run build            # Build for production

# Validation (ALWAYS RUN BEFORE COMMITTING)
npm run type-check       # TypeScript validation
npm run lint             # ESLint checks

# Database
npm run db:init          # Initialize SQLite database

# Testing
npm run test:network     # Test Monad RPC connection
```

## PR Workflow

⚠️ **All PRs must target `dev` branch, NOT `main`.**

## Project Structure

- `app/` - Next.js App Router pages and API routes
- `app/api/` - API route handlers
- `components/` - React components
- `lib/` - Utility libraries (db.ts, config.ts, wagmi.ts, etc.)
- `contracts/` - Solidity smart contracts
- `public/` - Static assets
- `data/` - SQLite database storage

## Coding Standards

### TypeScript
- Use TypeScript for all new files
- Use functional components with hooks
- Handle loading and error states properly

### React Components
- Place components in `components/` directory
- Use `'use client'` directive for client-side components
- Follow existing naming conventions

### Styling
- Use Tailwind CSS utility classes
- Follow the synthwave color scheme:
  - Neon cyan: `#00f7ff`
  - Neon magenta: `#ff00ff`
  - Neon gold: `#ffd700`
  - Deep purple: `#1a0033`
  - Dark navy: `#0a0015`
- Use `font-['Press_Start_2P']` for headings (retro pixel font)

### API Routes
- Create files at `app/api/{endpoint}/route.ts`
- Export async functions: `GET`, `POST`, `PATCH`, `DELETE`
- Use `NextRequest` and return `NextResponse.json()`

### Database
- Use `lib/db.ts` for all database operations
- Add schema in the initDatabase() function
- Create indexes for frequently queried columns

### Web3/Blockchain
- Use Wagmi hooks for blockchain interactions
- Use `lib/rpcClient.ts` for resilient RPC connections with fallback
- Use `lib/starSkrumpey.ts` for Star NFT verification
- Use multicall batching for multiple RPC calls (avoid sequential calls)

## Anti-Patterns to Avoid

1. **DON'T** fetch NFT metadata from IPFS directly - use database batch lookup from `lib/db.ts`
2. **DON'T** make sequential RPC calls - use multicall batching
3. **DON'T** hardcode RPC endpoints - use `lib/rpcClient.ts` with fallback logic
4. **DON'T** target `main` branch for PRs - always target `dev` branch

## Testing Changes

Before committing:
1. Run `npm run type-check` - must pass
2. Run `npm run lint` - must pass
3. Run `npm run build` - must succeed
4. Test changes manually if applicable

## Additional Documentation

For detailed documentation, refer to:
- `CLAUDE.md` - Comprehensive technical reference
- `CONTRIBUTING.md` - Contribution guidelines
- `README.md` - Project overview
