# Copilot Coding Agent Network Allowlist for Star World Order

This document lists all network domains that GitHub Copilot coding agent may need access to when working on the Star World Order repository.

---

## Overview

GitHub Copilot coding agent operates in a sandboxed environment with limited internet access. To enable full functionality, certain domains should be allowlisted in the repository's Copilot settings.

**Settings Location**: GitHub Repository → Settings → Copilot → Coding agent → Internet access → Custom allowlist

---

## Required Domains (Essential)

### Package Registries

| Domain | Purpose |
|--------|---------|
| `registry.npmjs.org` | NPM package installation |
| `npm.pkg.github.com` | GitHub Packages |
| `nodejs.org` | Node.js binaries |

### GitHub Services

| Domain | Purpose |
|--------|---------|
| `github.com` | Repository operations |
| `api.github.com` | GitHub API |
| `raw.githubusercontent.com` | Raw file access |
| `objects.githubusercontent.com` | Git objects |

---

## Recommended Domains (Web3/Blockchain)

### Monad Blockchain RPC

| Domain | Purpose | Priority |
|--------|---------|----------|
| `rpc.monad.xyz` | Primary RPC endpoint | High |
| `rpc1.monad.xyz` | Fallback RPC | Medium |
| `rpc2.monad.xyz` | Fallback RPC | Medium |
| `rpc3.monad.xyz` | Fallback RPC | Medium |
| `rpc4.monad.xyz` | Fallback RPC | Medium |
| `rpc-mainnet.monadinfra.com` | Alternative RPC | Low |
| `monad-mainnet.drpc.org` | Alternative RPC | Low |
| `monad-mainnet.api.onfinality.io` | Alternative RPC | Low |
| `monad-mainnet-rpc.spidernode.net` | Alternative RPC | Low |

### Monad Testnet (Development)

| Domain | Purpose |
|--------|---------|
| `testnet-rpc.monad.xyz` | Testnet RPC |
| `monad-testnet.drpc.org` | Testnet RPC (fallback) |

### Block Explorers

| Domain | Purpose |
|--------|---------|
| `monadscan.com` | Monad block explorer |
| `api.monadscan.com` | Explorer API |
| `testnet.monadscan.com` | Testnet explorer |
| `monadvision.com` | Alternative explorer |

---

## Recommended Domains (External APIs)

### NFT Data APIs

| Domain | Purpose | Used For |
|--------|---------|----------|
| `api-mainnet.magiceden.dev` | Magic Eden API | NFT collections, holdings |
| `api.blockvision.org` | BlockVision API | Floor prices |

### IPFS Gateways (NFT Metadata)

| Domain | Purpose |
|--------|---------|
| `ipfs-proxy.magiceden.dev` | Magic Eden IPFS proxy |
| `cloudflare-ipfs.com` | Cloudflare IPFS gateway |
| `ipfs.io` | Public IPFS gateway |

---

## Optional Domains (OAuth/Social)

### Discord OAuth (if testing auth)

| Domain | Purpose |
|--------|---------|
| `discord.com` | Discord OAuth |
| `cdn.discordapp.com` | Discord CDN |

### X/Twitter OAuth (if testing auth)

| Domain | Purpose |
|--------|---------|
| `api.twitter.com` | Twitter API |
| `twitter.com` | Twitter OAuth |
| `api.x.com` | X API |

---

## Optional Domains (Documentation/CDN)

### CDN and Assets

| Domain | Purpose |
|--------|---------|
| `fonts.googleapis.com` | Google Fonts (Press Start 2P) |
| `fonts.gstatic.com` | Font files |
| `unpkg.com` | NPM CDN |
| `cdn.jsdelivr.net` | jsDelivr CDN |

### Documentation

| Domain | Purpose |
|--------|---------|
| `docs.blockvision.org` | BlockVision docs |
| `modelcontextprotocol.io` | MCP documentation |
| `wagmi.sh` | Wagmi documentation |
| `viem.sh` | Viem documentation |
| `nextjs.org` | Next.js documentation |
| `tailwindcss.com` | Tailwind CSS documentation |

---

## Complete Allowlist (Copy-Paste Ready)

For the GitHub Copilot coding agent custom allowlist, add these domains:

```
# Package Registries
registry.npmjs.org
npm.pkg.github.com
nodejs.org

# Monad RPC (Primary)
rpc.monad.xyz
rpc1.monad.xyz
rpc2.monad.xyz
rpc3.monad.xyz
rpc4.monad.xyz

# Monad RPC (Alternative)
rpc-mainnet.monadinfra.com
monad-mainnet.drpc.org

# Block Explorers
monadscan.com
api.monadscan.com

# NFT APIs
api-mainnet.magiceden.dev
api.blockvision.org

# IPFS Gateways
ipfs-proxy.magiceden.dev
cloudflare-ipfs.com

# Fonts
fonts.googleapis.com
fonts.gstatic.com
```

---

## Minimal Allowlist (Core Functionality Only)

If you want to limit network access, use this minimal set:

```
registry.npmjs.org
rpc.monad.xyz
api-mainnet.magiceden.dev
```

---

## Security Considerations

1. **RPC Endpoints**: The agent needs RPC access to test blockchain interactions
2. **API Keys**: Never expose API keys in allowlist - use environment variables
3. **OAuth Domains**: Only allowlist if you're testing OAuth functionality
4. **CDN Access**: Fonts and CDN are nice-to-have but not essential

---

## Testing Network Access

After configuring the allowlist, verify access by:

1. Creating a test issue and assigning to Copilot
2. Ask the agent to run `npm run test:network`
3. Check that RPC connections succeed
4. Verify build completes with external resources

---

## Recommended Settings Summary

| Setting | Recommended Value |
|---------|-------------------|
| Enable firewall | ✅ On (Recommended) |
| Recommended allowlist | ✅ On |
| Custom allowlist | Add domains above |

---

**Note**: The recommended allowlist from GitHub already includes common package registries. The custom allowlist should focus on project-specific domains like Monad RPC and Magic Eden API.
