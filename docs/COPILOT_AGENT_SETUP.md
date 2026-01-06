# GitHub Copilot Coding Agent Setup Guide for Star World Order

This comprehensive guide explains how to maximize GitHub Copilot coding agent's potential when working with the Star World Order repository.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Setup Checklist](#quick-setup-checklist)
3. [Custom Instructions](#custom-instructions)
4. [Development Environment](#development-environment)
5. [Network Access Configuration](#network-access-configuration)
6. [MCP Server Configuration](#mcp-server-configuration)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Overview

GitHub Copilot coding agent can be assigned issues and autonomously work on code changes. To maximize its effectiveness with Star World Order, we've configured:

- **Custom Instructions** (`.github/copilot-instructions.md`) - Project-specific coding guidelines
- **Setup Steps** (`.github/workflows/copilot-setup-steps.yml`) - Environment configuration
- **Comprehensive Documentation** (`CLAUDE.md`) - Extensive technical reference

---

## Quick Setup Checklist

### Repository Settings (One-Time Setup)

Navigate to **GitHub Repository Settings** → **Copilot** → **Coding agent**

- [ ] ✅ Enable Copilot coding agent
- [ ] ✅ Enable firewall (recommended)
- [ ] ✅ Enable recommended allowlist
- [ ] ✅ Add custom allowlist domains (see [Network Access](#network-access-configuration))
- [ ] ✅ Configure MCP servers (optional, see [MCP Configuration](#mcp-server-configuration))

### Files Already Configured

- [x] `.github/copilot-instructions.md` - Agent instructions
- [x] `.github/workflows/copilot-setup-steps.yml` - Environment setup
- [x] `CLAUDE.md` - Comprehensive technical documentation
- [x] `CONTRIBUTING.md` - Contribution guidelines
- [x] `.env.example` - Environment variable template

---

## Custom Instructions

The agent reads `.github/copilot-instructions.md` for project-specific guidance. Key sections include:

### Essential Commands
```bash
npm run type-check       # MUST PASS before commit
npm run lint             # MUST PASS before commit
npm run build            # MUST SUCCEED before commit
```

### Critical Rules
1. **All PRs must target `dev` branch** (not `main`)
2. Use existing patterns from similar files
3. Never fetch NFT metadata from IPFS - use database
4. Never make sequential RPC calls - use multicall

### Styling Guidelines
- Synthwave color scheme (neon cyan, magenta, gold)
- Press Start 2P pixel font for headings
- Tailwind CSS utility classes

---

## Development Environment

The `.github/workflows/copilot-setup-steps.yml` configures:

1. **Node.js 20** with npm caching
2. **Dependencies** installed via `npm ci`
3. **Database directory** created (`data/`)
4. **Validation** runs type-check and lint
5. **Build verification** ensures code compiles

### Environment Variables

The agent should have access to development environment variables. For sensitive values, use GitHub Secrets.

Required for full functionality:
```bash
NEXT_PUBLIC_MONAD_CHAIN_ID=143
NEXT_PUBLIC_MONAD_RPC_URL=https://rpc.monad.xyz
NEXT_PUBLIC_SKRUMPEY_CONTRACT=0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0
```

---

## Network Access Configuration

### Recommended Settings

| Setting | Value | Reason |
|---------|-------|--------|
| Enable firewall | ✅ On | Security best practice |
| Recommended allowlist | ✅ On | Enables npm, GitHub |
| Custom allowlist | See below | Project-specific domains |

### Custom Allowlist Domains

Add these to the custom allowlist for full functionality:

```
# Monad Blockchain RPC
rpc.monad.xyz
rpc1.monad.xyz
rpc2.monad.xyz
rpc3.monad.xyz
rpc4.monad.xyz
monad-mainnet.drpc.org

# Block Explorer
monadscan.com
api.monadscan.com

# NFT APIs
api-mainnet.magiceden.dev
api.blockvision.org

# IPFS (NFT images)
ipfs-proxy.magiceden.dev
cloudflare-ipfs.com

# Fonts
fonts.googleapis.com
fonts.gstatic.com
```

**Full documentation**: See `docs/COPILOT_NETWORK_ALLOWLIST.md`

---

## MCP Server Configuration

### What is MCP?

Model Context Protocol (MCP) extends the agent's capabilities by connecting it to external data sources and tools.

### Recommended Configuration

Navigate to **Settings** → **Copilot** → **Coding agent** → **MCP configuration**

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/home/runner/work/Star-World-Order/Star-World-Order"
      ]
    }
  }
}
```

**Full documentation**: See `docs/MCP_CONFIGURATION.md`

---

## Best Practices

### Writing Good Issues for Copilot

When creating issues for the agent to work on:

1. **Be specific** - Describe the exact change needed
2. **Reference files** - Point to specific files or patterns
3. **Include examples** - Show expected input/output
4. **Set scope** - Clearly define what's in/out of scope

**Good Example:**
```markdown
## Task
Add a new API endpoint for fetching user achievements.

## Location
Create `app/api/achievements/route.ts`

## Requirements
- GET endpoint that accepts `?address=0x...` query param
- Return array of achievements from database
- Follow pattern in `app/api/quests/route.ts`

## Acceptance Criteria
- [ ] TypeScript types defined
- [ ] Error handling for missing address
- [ ] Returns JSON response
```

### Reviewing Copilot PRs

When reviewing PRs from the agent:

1. **Check validation** - Ensure type-check/lint/build passed
2. **Verify patterns** - Code should match existing conventions
3. **Test manually** - Run the code if it involves UI
4. **Check security** - Review for vulnerabilities

---

## Troubleshooting

### Agent Can't Access Files

**Symptom**: Agent reports "file not found" errors

**Solutions**:
1. Check file path is correct (use absolute paths)
2. Verify MCP filesystem server is configured
3. Ensure file exists in the repository

### Build Failures

**Symptom**: Agent's PR fails type-check or build

**Solutions**:
1. Review the specific error messages
2. Check for missing imports
3. Verify component props match types
4. Run locally: `npm run type-check && npm run build`

### RPC Connection Issues

**Symptom**: Agent can't connect to Monad RPC

**Solutions**:
1. Check network allowlist includes `rpc.monad.xyz`
2. Verify fallback RPCs are allowlisted
3. Test with `npm run test:network`

### Agent Creates PR Against Wrong Branch

**Symptom**: PR targets `main` instead of `dev`

**Solutions**:
1. The instructions clearly state `dev` is the target
2. Close the PR and reopen against `dev`
3. Add branch protection to prevent this

---

## Documentation Reference

| Document | Purpose |
|----------|---------|
| `.github/copilot-instructions.md` | Agent-specific instructions |
| `CLAUDE.md` | Comprehensive technical reference |
| `CONTRIBUTING.md` | Contribution guidelines |
| `README.md` | Project overview |
| `docs/MCP_CONFIGURATION.md` | MCP setup guide |
| `docs/COPILOT_NETWORK_ALLOWLIST.md` | Network domains |
| `.env.example` | Environment variables |

---

## Summary

To maximize Copilot coding agent's effectiveness:

1. ✅ **Custom instructions** are configured in `.github/copilot-instructions.md`
2. ✅ **Environment setup** is configured in `.github/workflows/copilot-setup-steps.yml`
3. ✅ **Documentation** is comprehensive in `CLAUDE.md`
4. ⬜ **Configure network allowlist** in repository settings
5. ⬜ **Configure MCP servers** (optional) in repository settings

The agent should now be able to:
- Understand the project structure and conventions
- Make code changes that follow existing patterns
- Run validation before committing
- Create PRs targeting the correct branch

---

**Questions?** Open an issue in the repository or check the documentation.
