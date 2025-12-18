# GitHub Codespaces Setup for Star World Order

This guide explains how to set up and optimize GitHub Codespaces for developing the Star World Order (SWO) project.

## 🚀 Quick Start

### Option 1: Create Codespace from GitHub UI

1. Go to [github.com/InverseAltruism/Star-World-Order](https://github.com/InverseAltruism/Star-World-Order)
2. Click the green **Code** button
3. Select the **Codespaces** tab
4. Click **Create codespace on dev** (or your target branch)
5. Wait for the environment to build (2-3 minutes on first launch)
6. Start developing!

### Option 2: Create via GitHub CLI

```bash
# Install GitHub CLI if needed
# https://cli.github.com/

# Create a codespace
gh codespace create --repo InverseAltruism/Star-World-Order --branch dev

# Open in VS Code desktop
gh codespace code
```

---

## 📋 What's Pre-Configured

The `.devcontainer/devcontainer.json` file automatically sets up:

### Runtime Environment
- **Node.js 22** (LTS) - Required for Next.js 16
- **npm** - Package manager
- **Git** - Version control

### VS Code Extensions
| Extension | Purpose |
|-----------|---------|
| ESLint | Code linting |
| Prettier | Code formatting |
| Tailwind CSS IntelliSense | CSS class autocomplete |
| Solidity | Smart contract syntax highlighting |
| Solidity Visual Auditor | Contract security analysis |
| SQLite | Database browser |
| GitLens | Git history visualization |

### Port Forwarding
| Port | Purpose |
|------|---------|
| 3000 | Next.js dev server (default) |
| 3080 | Production environment (if running) |
| 3081 | DEV environment (if running) |

### Environment Variables (Auto-configured)
```bash
NEXT_PUBLIC_ENV_MODE=dev              # Unlocks all features
NEXT_PUBLIC_MONAD_CHAIN_ID=143        # Monad Mainnet
NEXT_PUBLIC_MONAD_RPC_URL=https://rpc.monad.xyz
NEXT_PUBLIC_SKRUMPEY_CONTRACT=0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0
NEXT_PUBLIC_DAO_FEE_BPS=250           # 2.5% DAO fee
NEXT_PUBLIC_DEV_ACCESS_ENABLED=true   # Bypass NFT ownership check
```

---

## 🛠️ Getting Started After Launch

Once your Codespace is running:

### 1. Start Development Server
```bash
npm run dev
```
This starts Next.js on port 3000. Click the popup to open in browser.

### 2. Available Commands
```bash
npm run dev           # Start dev server (port 3000)
npm run build         # Build for production
npm run start         # Start production server
npm run lint          # Run ESLint
npm run type-check    # TypeScript type validation
npm run compile       # Compile Solidity contracts
npm run db:init       # Initialize SQLite database
npm run test:network  # Test Monad RPC connection
```

### 3. Access the App
After `npm run dev`:
- Click the **Ports** tab in VS Code
- Click the globe icon 🌐 next to port 3000
- Or use the popup notification

---

## ⚙️ Configuration Options

### Customizing Your Codespace

#### Add Secret Environment Variables

For sensitive data (OAuth, API keys), use GitHub Codespaces Secrets:

1. Go to **Settings** → **Codespaces** in your GitHub account
2. Add repository secrets:

| Secret Name | Description |
|-------------|-------------|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect integration |
| `NEXT_PUBLIC_X_CLIENT_ID` | X (Twitter) OAuth |
| `X_CLIENT_SECRET` | X OAuth secret |
| `NEXT_PUBLIC_DISCORD_CLIENT_ID` | Discord OAuth |
| `DISCORD_CLIENT_SECRET` | Discord OAuth secret |

#### Create Personal `.env.local`

For local overrides, create `.env.local` in the workspace:

```bash
# Create from template
cp .env.example .env.local

# Edit as needed
code .env.local
```

---

## 🏗️ Project Structure Overview

```
Star-World-Order/
├── .devcontainer/          # Codespaces configuration
│   └── devcontainer.json   # Container settings
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── dao/               # DAO governance page
│   ├── exchange/          # OTC marketplace
│   ├── hangout/           # Community hub
│   ├── marketplace/       # NFT marketplace
│   ├── members/           # Member profiles
│   ├── profile/           # User profile
│   └── page.tsx           # Home page
├── components/             # React components
├── contracts/              # Solidity smart contracts
├── data/                   # SQLite database + data
├── docs/                   # Documentation
├── lib/                    # Utility libraries
│   ├── config.ts          # Environment config
│   ├── db.ts              # Database functions
│   ├── starSkrumpey.ts    # NFT access control
│   └── wagmi.ts           # Web3 configuration
├── scripts/                # Build & utility scripts
├── CLAUDE.md              # AI agent reference
├── CONTRIBUTING.md        # Contribution guide
├── DEPLOYMENT.md          # Deployment guide
└── README.md              # Project overview
```

---

## 🔑 Key Development Patterns

### Star Skrumpey Access Control

The app requires holding a "Star Skrumpey" NFT for DAO access. In Codespaces, this is bypassed with:

```bash
NEXT_PUBLIC_DEV_ACCESS_ENABLED=true
```

This lets you develop without owning an NFT.

### Demo Mode Testing

To test different wallet experiences:
1. Click **🎮 DEMO MODE** in the header
2. Enter a wallet address that holds Star Skrumpeys
3. Browse as that user (read-only)

Known Star holders for testing:
- Check `lib/starSkrumpey.ts` for token ID list
- Use Monadscan to find current owners

### Database Development

The SQLite database is auto-initialized. To reset:

```bash
rm data/swo.db
npm run db:init
```

To browse the database:
1. Install SQLite extension (pre-installed)
2. Open `data/swo.db` in VS Code
3. Run SQL queries directly

---

## 🔧 Troubleshooting

### Codespace Won't Start

1. **Check Node.js version**: Must be 20+ (preferably 22)
2. **Clear cache**: Delete `.next/` folder
3. **Reinstall deps**: `rm -rf node_modules && npm install`

### Port 3000 Not Opening

1. Check **Ports** tab for visibility
2. Change port visibility to "Public" if needed
3. Restart dev server: `npm run dev`

### RPC Rate Limiting

The app uses fallback RPCs. If issues persist:
```bash
# Test connection
npm run test:network

# Check lib/rpcClient.ts for endpoint list
```

### Build Errors

```bash
# Type check first
npm run type-check

# Then build
npm run build

# Check for missing env vars
cat .env.local
```

### Database Locked

```bash
# Stop all processes
pkill -f node

# Reinitialize
rm data/swo.db
npm run db:init
```

---

## 🌟 Best Practices for SWO Development

### 1. Branch Workflow
- Always branch from `dev`, not `main`
- PRs must target `dev` first
- `main` is for production only

### 2. Code Style
- TypeScript strict mode enabled
- Use Tailwind CSS (no CSS modules)
- Follow existing component patterns

### 3. Web3 Testing
- Use Demo Mode for quick testing
- Test with MetaMask + Monad network
- Check contract interactions on Monadscan

### 4. Before Committing
```bash
npm run type-check    # TypeScript validation
npm run lint          # ESLint checks
npm run build         # Ensure build succeeds
```

---

## 📚 Additional Resources

| Resource | Link |
|----------|------|
| Monad Docs | https://docs.monad.xyz |
| Monad Explorer | https://monadscan.com |
| Wagmi Docs | https://wagmi.sh |
| Viem Docs | https://viem.sh |
| Next.js Docs | https://nextjs.org/docs |
| Tailwind CSS | https://tailwindcss.com |

---

## 🔒 Security Notes

- **Never commit secrets** to `.env.local` or code
- Use GitHub Codespaces Secrets for sensitive data
- The `NEXT_PUBLIC_DEV_ACCESS_ENABLED` flag only works in development
- All PRs are automatically scanned for secrets

---

## 💡 Optimizing Codespace Performance

### Recommended Machine Size
- **4-core, 8GB RAM** - Good for development
- **8-core, 16GB RAM** - Better for heavy testing

### Speed Tips
1. Use VS Code web (browser) for simple edits
2. Use VS Code desktop for complex work
3. Prebuild codespaces for faster startup (repo admin setting)
4. Keep `node_modules` cached between sessions

### Enabling Prebuilds (Repo Admins)

1. Go to repo **Settings** → **Codespaces**
2. Enable **Prebuild configuration**
3. Select branches: `main`, `dev`
4. Choose trigger: On push or scheduled

---

*Happy coding in the cosmic realm! ⭐🐸*
