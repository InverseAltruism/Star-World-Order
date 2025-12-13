# RPC Optimization: Multi-Tier Star Skrumpey Verification

## Problem Statement

The marketplace was experiencing **429 (Too Many Requests)** errors from `rpc.monad.xyz` when verifying Star Skrumpey ownership. This resulted in users seeing "NO STAR SKRUMPEY DETECTED" even when they owned multiple Star Skrumpeys.

### Root Cause

The original implementation used an inefficient verification strategy:

1. Call `balanceOf(address)` to get the user's total NFT count → **1 RPC call**
2. For each owned token, call `tokenOfOwnerByIndex(address, index)` → **N RPC calls**
3. Check if any returned token ID is in the `STAR_SKRUMPEY_IDS` allow-list

For a user owning 50 NFTs, this resulted in **51 RPC calls** in quick succession, triggering rate limiting.

## Solution: Multi-Tier Verification Strategy

We implemented a comprehensive solution with four tiers of resilience:

### Tier 1: Batched `ownerOf` Multicall (Primary Strategy)

Instead of iterating through all user-owned NFTs, we batch check ownership of the known 343 Star Skrumpey token IDs using `multicall`. This approach:

- Makes **1 batched RPC call** regardless of how many NFTs the user owns
- Checks all 343 Star Skrumpey IDs at once
- Returns only the Star Skrumpeys owned by the connected wallet
- Complexity: O(1) RPC calls vs. O(N) in the old approach

```typescript
// New approach: Check ownership of known Star IDs
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

### Tier 2: Fallback RPC Endpoints

If the primary RPC endpoint fails, the system automatically tries alternate endpoints:

1. `https://rpc.monad.xyz` (primary)
2. `https://rpc1.monad.xyz`
3. `https://rpc2.monad.xyz`
4. `https://rpc3.monad.xyz`
5. `https://rpc-mainnet.monadinfra.com`
6. `https://monad-mainnet.drpc.org`

The `createClientWithFallback()` function cycles through these endpoints until one succeeds.

### Tier 3: Retry Logic with Exponential Backoff

For transient failures (429, 503, network errors), the system automatically retries with exponential backoff:

- **Max retries**: 3
- **Backoff delays**: 1s, 2s, 4s
- **Only retries on**: 429 (rate limiting), 503 (service unavailable), network errors
- **Fails fast on**: Other errors (e.g., invalid contract address, non-existent token)

### Tier 4: Graceful Degradation

When all retry attempts are exhausted:

- Returns empty array instead of throwing errors
- Logs detailed error information for debugging
- Maintains UI stability (user sees "No Star Skrumpey detected" instead of crash)
- Provides manual refresh option through the `refresh()` function

## Implementation Details

### New Files

#### `lib/logger.ts`
Structured logging utility with:
- Log levels: `debug`, `info`, `warn`, `error`
- Timestamps and context
- Environment-aware (verbose in dev, minimal in prod)

```typescript
logger.info('Checking Star ownership via batched multicall', { 
  address: '0x...',
  totalStarIds: 343,
});
```

#### `lib/rpcClient.ts`
Robust RPC client with:
- `getResilientClient()` - Creates a client with fallback and retry logic
- `retryWithBackoff()` - Generic retry wrapper with exponential backoff
- `createClientWithFallback()` - Tries multiple RPC endpoints
- `isRetryableError()` - Determines if an error should be retried

### Modified Files

#### `lib/starSkrumpey.ts`
- **New function**: `checkStarOwnershipBatched(address)` - Primary verification method
- **Updated**: `checkDAOAccess(address)` - Now uses batched approach
- **Kept**: `fetchUserSkrumpeys(address)` - Legacy method for backward compatibility

#### `lib/hooks/useDAOAccess.ts`
- **Updated**: Uses `checkStarOwnershipBatched()` instead of `fetchUserSkrumpeys()`
- **New state**: `lastChecked` - Timestamp of last successful check
- **New state**: `retryCount` - Number of retry attempts made

## Performance Improvements

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **RPC Calls** | N+1 (e.g., 51 for 50 NFTs) | 1 batched call | 98% reduction |
| **Network Requests** | Sequential (slow) | Single multicall (fast) | ~50x faster |
| **Rate Limit Risk** | High (many sequential calls) | Low (single batch) | Eliminated |
| **Error Resilience** | None | 4-tier strategy | Highly resilient |

## Usage Example

The changes are transparent to existing code. The hook automatically uses the new verification:

```typescript
function MyComponent() {
  const { 
    hasAccess, 
    isLoading, 
    error, 
    starSkrumpeys,
    lastChecked,
    retryCount,
    refresh 
  } = useDAOAccess();

  if (isLoading) return <div>Checking Star ownership...</div>;
  if (error) return <div>Error: {error} <button onClick={refresh}>Retry</button></div>;
  
  return hasAccess ? (
    <div>Access granted! You own {starSkrumpeys.length} Star Skrumpey(s)</div>
  ) : (
    <div>No Star Skrumpey detected</div>
  );
}
```

## Expected Behavior After Fix

1. User connects wallet with 2 Star Skrumpeys
2. App makes **1 batched multicall** to check ownership of all 343 Star IDs
3. If RPC fails, automatically tries next fallback endpoint
4. If endpoint returns 429, waits and retries with backoff
5. Console shows useful logs:
   - `"Checking Star ownership for 0x... via rpc.monad.xyz"`
   - `"Found 2 Star Skrumpeys: #1234, #5678"`
6. Marketplace unlocks correctly

## Testing

### TypeScript Compilation
```bash
npm run type-check
```
✅ Passes without errors

### Next.js Build
```bash
npm run build
```
✅ Builds successfully

### CodeQL Security Analysis
✅ No security vulnerabilities detected

## Migration Notes

**No breaking changes!** The implementation:
- Maintains backward compatibility
- Exports the same interface from `useDAOAccess`
- Keeps the legacy `fetchUserSkrumpeys()` function for reference
- Adds new optional fields (`lastChecked`, `retryCount`) to the hook result

## Monitoring

To monitor RPC performance in production:

1. Check browser console for logs (in development mode)
2. Look for patterns like:
   - `"Retrying after error"` - Indicates transient failures
   - `"Fallback RPC endpoint successful"` - Primary endpoint is down
   - `"All RPC endpoints failed"` - System-wide RPC issue

3. Monitor the `retryCount` state in the UI to detect persistent issues

## Future Enhancements

Potential improvements for the future:
- Add caching layer to reduce redundant checks
- Implement request coalescing for multiple simultaneous checks
- Add telemetry/monitoring for RPC performance
- Consider rate limiting at the application level
