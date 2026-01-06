# Snapshot.org Integration Guide for Star World Order

## Overview

Star World Order uses a **hybrid governance model** that combines:

1. **Web2 Database Voting** (Primary) - Fast, free, instant results
2. **Snapshot.org Verification** (Optional) - Decentralized proof and transparency

This guide explains how to set up and use Snapshot.org with Star World Order's existing governance system.

---

## Why Hybrid Governance?

### Web2 Database Voting (What We Have)

| Feature | Benefit |
|---------|---------|
| **Zero Gas Fees** | Free voting for all members |
| **Instant Results** | No blockchain confirmation wait |
| **Vote Changing** | 24-hour window to reconsider |
| **Rich Features** | Categories, quorum rules, defeat reasons |
| **Fast Development** | Easy to iterate and improve |

### Snapshot.org (What We Add)

| Feature | Benefit |
|---------|---------|
| **Cryptographic Proof** | Votes signed with wallet |
| **IPFS Storage** | Decentralized, immutable record |
| **Public Verifiability** | Anyone can verify results |
| **Industry Standard** | Used by major DAOs |
| **Cross-Reference** | Verify database votes match |

---

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Star World Order DAO                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐              ┌─────────────────────────┐   │
│  │   User Wallet   │              │     Monad Blockchain     │   │
│  │   (MetaMask)    │              │  (Star Skrumpey NFTs)    │   │
│  └────────┬────────┘              └────────────┬────────────┘   │
│           │                                     │                │
│           │ Vote                               │ NFT Balance     │
│           │                                     │ (Voting Power)  │
│           ▼                                     ▼                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 SWO Governance API                       │    │
│  │              (app/api/governance/route.ts)              │    │
│  └─────────────────┬───────────────────────┬───────────────┘    │
│                    │                       │                     │
│                    ▼                       ▼                     │
│  ┌─────────────────────────┐   ┌───────────────────────────┐    │
│  │   SQLite Database       │   │    Snapshot.org Hub       │    │
│  │   (Primary Storage)     │   │  (Optional Verification)  │    │
│  │                         │   │                           │    │
│  │ • Proposals             │   │ • Signed Votes            │    │
│  │ • Votes (instant)       │   │ • IPFS Storage            │    │
│  │ • Vote Changes          │   │ • Public GraphQL API      │    │
│  │ • Categories            │   │                           │    │
│  │ • Quorum Logic          │   │                           │    │
│  └─────────────────────────┘   └───────────────────────────┘    │
│                    │                       │                     │
│                    └───────────┬───────────┘                     │
│                                │                                 │
│                                ▼                                 │
│                    ┌───────────────────────┐                     │
│                    │   Vote Verification   │                     │
│                    │  (Cross-Reference)    │                     │
│                    └───────────────────────┘                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Setting Up Snapshot Space

### Step 1: Create Snapshot Space

1. Go to [snapshot.org](https://snapshot.org)
2. Connect your wallet (must hold Star Skrumpey NFT)
3. Click "Create Space"
4. Choose an ENS name or use existing domain

**Recommended Space Settings:**

| Setting | Value |
|---------|-------|
| Name | Star World Order |
| Symbol | SWO |
| Network | Monad (Chain ID: 143) |
| Avatar | SWO Logo |
| Description | Star World Order DAO - Governance for Star Skrumpey holders |

### Step 2: Configure Voting Strategy

For ERC-721 NFT-based voting (Star Skrumpey NFTs):

```json
{
  "name": "erc721",
  "network": "143",
  "params": {
    "address": "0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0",
    "symbol": "SKRUMP"
  }
}
```

**Alternative: Custom Strategy for Star Trait Only**

If you want only Star constellation NFTs to have voting power:

```json
{
  "name": "erc721-with-tokenid-range",
  "network": "143",
  "params": {
    "address": "0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0",
    "symbol": "STAR",
    "tokenIds": [3, 17, 20, 23, 38, 40, ...]
  }
}
```

> **Note**: Custom strategies may require creating a custom Snapshot strategy plugin.

### Step 3: Configure Voting Options

| Setting | Recommended Value |
|---------|------------------|
| Voting Type | Single Choice |
| Voting Delay | 0 (immediate) |
| Voting Period | 604800 (7 days in seconds) |
| Quorum Type | Threshold |
| Quorum | 10 (minimum votes required) |

**Default Choices:**
1. For
2. Against
3. Abstain

### Step 4: Set Proposal Requirements

| Setting | Recommended Value |
|---------|------------------|
| Minimum Score to Create | 1 (must hold at least 1 Star Skrumpey) |
| Only Members | No (anyone with NFT can participate) |

---

## Environment Configuration

Add these to your `.env.local`:

```bash
# Snapshot Configuration
# Your Snapshot space ENS name or ID
NEXT_PUBLIC_SNAPSHOT_SPACE=starworldorder.eth

# Snapshot Hub URL (default is production)
NEXT_PUBLIC_SNAPSHOT_HUB=https://hub.snapshot.org
```

---

## Using the Snapshot Integration

### Check if Snapshot is Configured

```typescript
import { isSnapshotConfigured, getSnapshotSpaceUrl } from '@/lib/snapshot';

if (isSnapshotConfigured()) {
  console.log('Snapshot is ready!');
  console.log('Space URL:', getSnapshotSpaceUrl());
}
```

### Fetch Proposals from Snapshot

```typescript
import { getSnapshotProposals } from '@/lib/snapshot';

// Get all active proposals
const activeProposals = await getSnapshotProposals({ state: 'active' });

// Get all closed proposals
const closedProposals = await getSnapshotProposals({ state: 'closed' });
```

### Verify Database Votes Against Snapshot

```typescript
import { verifyVotesWithSnapshot } from '@/lib/snapshot';

// Get your database results
const databaseResults = {
  yes: 42,
  no: 12,
  abstain: 8,
};

// Verify against Snapshot
const verification = await verifyVotesWithSnapshot(
  'proposal-id-from-snapshot',
  databaseResults
);

if (verification.matches) {
  console.log('✅ Votes verified! Database matches Snapshot.');
} else {
  console.log('⚠️ Discrepancies found:', verification.discrepancies);
}
```

### Get User's Voting Power

```typescript
import { getSnapshotVotingPower } from '@/lib/snapshot';

const votingPower = await getSnapshotVotingPower(
  '0x1234...', // wallet address
  'proposal-id'
);

console.log(`User has ${votingPower} votes`);
```

---

## Workflow: Synchronized Voting

When a user votes in SWO, you can optionally sync to Snapshot:

### Option A: Database First (Recommended)

1. User votes via SWO UI
2. Vote recorded in database (instant)
3. Optionally show "Verify on Snapshot" link
4. User can verify their vote exists on Snapshot

```typescript
// After database vote is recorded
const proposal = getGovernanceProposalById(proposalId);
const snapshotUrl = getSnapshotProposalUrl(proposal.snapshot_proposal_id);

// Show verification link
return {
  success: true,
  message: 'Vote recorded!',
  verifyUrl: snapshotUrl,
};
```

### Option B: Dual Recording

1. User votes via SWO UI
2. Vote recorded in database
3. Also submit signed vote to Snapshot
4. Cross-reference results for verification

> **Note**: Option B requires wallet signing on client-side. 
> The `@snapshot-labs/snapshot.js` library can be used for this.

---

## UI Components

### Snapshot Verification Badge

Add to proposal cards:

```tsx
import { isSnapshotConfigured, getSnapshotProposalUrl } from '@/lib/snapshot';

function SnapshotVerifyButton({ proposalId }: { proposalId: string }) {
  if (!isSnapshotConfigured()) return null;
  
  return (
    <a
      href={getSnapshotProposalUrl(proposalId)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-xs text-[#9966ff] hover:text-[#ffd700]"
    >
      🔍 Verify on Snapshot
    </a>
  );
}
```

### Verification Status Component

```tsx
import { verifyVotesWithSnapshot } from '@/lib/snapshot';

function VoteVerificationStatus({ proposalId, databaseResults }) {
  const [verification, setVerification] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const handleVerify = async () => {
    setLoading(true);
    const result = await verifyVotesWithSnapshot(proposalId, databaseResults);
    setVerification(result);
    setLoading(false);
  };
  
  return (
    <div className="p-4 bg-[#0a0a15] rounded-lg">
      <button
        onClick={handleVerify}
        disabled={loading}
        className="pixel-btn text-xs"
      >
        {loading ? '⏳ Verifying...' : '🔍 Verify Votes'}
      </button>
      
      {verification && (
        <div className={`mt-3 p-3 rounded ${
          verification.matches 
            ? 'bg-[#44ff88]/10 border border-[#44ff88]/30' 
            : 'bg-[#ffd700]/10 border border-[#ffd700]/30'
        }`}>
          {verification.matches ? (
            <p className="text-[#44ff88] text-xs">
              ✅ Verified! Database matches Snapshot.
            </p>
          ) : (
            <div className="text-[#ffd700] text-xs">
              <p>⚠️ Discrepancies found:</p>
              <ul className="list-disc ml-4 mt-1">
                {verification.discrepancies.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Advanced: Creating Proposals on Snapshot

### Using snapshot.js SDK

Install the official Snapshot SDK:

```bash
npm install @snapshot-labs/snapshot.js
```

Example (client-side with wallet):

```typescript
import snapshot from '@snapshot-labs/snapshot.js';
import { useWalletClient } from 'wagmi';

const hub = 'https://hub.snapshot.org';
const client = new snapshot.Client712(hub);

async function createSnapshotProposal(
  walletClient,
  title: string,
  body: string,
  votingPeriodDays: number = 7
) {
  const now = Math.floor(Date.now() / 1000);
  const endTime = now + (votingPeriodDays * 24 * 60 * 60);
  
  const receipt = await client.proposal(walletClient, walletClient.account.address, {
    space: 'starworldorder.eth',
    type: 'single-choice',
    title,
    body,
    choices: ['For', 'Against', 'Abstain'],
    start: now,
    end: endTime,
    snapshot: 0, // Latest block
    plugins: JSON.stringify({}),
    app: 'star-world-order',
    discussion: '',
  });
  
  return receipt;
}
```

---

## Troubleshooting

### "Space not found"

- Verify `NEXT_PUBLIC_SNAPSHOT_SPACE` is correct
- Check if space exists at `https://snapshot.org/#/{your-space-id}`
- Ensure the space is published and not in draft mode

### "Network not supported"

- Snapshot may not fully support Monad yet
- Consider using Ethereum mainnet for testing
- Custom network configurations may require Snapshot team assistance

### "Voting power is 0"

- User may not hold the required NFTs
- Check NFT contract address in strategy configuration
- Verify the user's wallet is connected to correct network

### Vote counts don't match

- Timing difference: Snapshot updates may lag
- Rounding differences: Snapshot uses floating point
- Duplicate votes: User may have voted on both systems differently

---

## Security Considerations

### Database Votes

- ✅ Tied to wallet address
- ✅ NFT ownership verified on-chain
- ✅ Vote history permanently recorded
- ⚠️ Centralized storage (must trust SWO infrastructure)

### Snapshot Votes

- ✅ Cryptographically signed by wallet
- ✅ Stored on IPFS (decentralized)
- ✅ Publicly verifiable by anyone
- ✅ No trust in SWO infrastructure required

### Hybrid Approach

By offering both systems:
1. **Normal users**: Use fast, free database voting
2. **Paranoid users**: Can verify on Snapshot
3. **Transparency**: Anyone can audit the results
4. **Trust minimization**: Database can be checked against Snapshot

---

## API Reference

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_SNAPSHOT_SPACE` | Snapshot space ID (ENS or custom) | `''` |
| `NEXT_PUBLIC_SNAPSHOT_HUB` | Snapshot Hub URL | `https://hub.snapshot.org` |

### Functions

| Function | Description |
|----------|-------------|
| `isSnapshotConfigured()` | Check if Snapshot is set up |
| `getSnapshotSpace()` | Get space configuration |
| `getSnapshotProposals(options)` | List proposals |
| `getSnapshotProposal(id)` | Get single proposal |
| `getSnapshotVotes(proposalId, options)` | Get votes for proposal |
| `getSnapshotVotingPower(voter, proposal)` | Get user's voting power |
| `verifyVotesWithSnapshot(id, dbResults)` | Cross-verify votes |
| `getSnapshotSpaceUrl()` | Get URL to space |
| `getSnapshotProposalUrl(id)` | Get URL to proposal |

---

## Resources

- [Snapshot Documentation](https://docs.snapshot.box/)
- [Snapshot GitHub](https://github.com/snapshot-labs)
- [Voting Strategies](https://docs.snapshot.box/user-guides/voting-strategies)
- [NFT Voting Guide](https://docs.snapshot.box/user-guides/spaces/space-handbook/nft-voting)
- [snapshot.js SDK](https://github.com/snapshot-labs/snapshot.js)

---

## Migration Plan

### Phase 1: Setup (Current)
- [x] Create `lib/snapshot.ts` with API functions
- [x] Add environment variables
- [x] Document integration

### Phase 2: Read-Only Integration
- [ ] Add "Verify on Snapshot" links to UI
- [ ] Display Snapshot proposal status if available
- [ ] Show verification badge for matched votes

### Phase 3: Full Integration (Optional)
- [ ] Create Snapshot space
- [ ] Configure voting strategy
- [ ] Add dual-voting option (vote on both systems)
- [ ] Implement vote comparison dashboard

---

*Last Updated: January 2025*
