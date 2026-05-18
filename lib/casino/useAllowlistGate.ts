// useAllowlistGate — chain-aware pre-bet access check for [SWO_CASINO_ALLOWLIST_UI_GATE].
//
// Before submitting a bet, each game UI calls this hook once with the active
// game contract address + the connected wallet address. The hook does three
// on-chain reads:
//
//   1. `game.allowlist()` → resolves the soft-launch allowlist contract.
//       When this is the zero address the game has no allowlist set
//       (current testnet posture) and the gate short-circuits to
//       `passthrough`.
//   2. `allowlist.allowlistEnabled()` → owner-flippable kill-switch on
//       the allowlist itself. When `false` (post-soft-launch steady
//       state) the gate is `passthrough`.
//   3. `allowlist.isAllowed(player)` → per-address access flag. Only
//       consulted when (1) is non-zero AND (2) is true. `true` →
//       passthrough; `false` → blocked.
//
// When the gate is `blocked`, the UI MUST render an "Allowlist required"
// banner instead of triggering `useWriteContract`/`signMessage`. The
// rationale is twofold: (a) the on-chain `placeBet` would revert with
// `NotAllowed()` anyway, wasting the user's gas estimation round-trip;
// (b) surfacing the block pre-sign avoids a confusing MetaMask prompt
// that a non-allowlisted player has no way to satisfy.

'use client';

import { useReadContract } from 'wagmi';
import type { Abi, Address } from 'viem';

/** Sentinel returned by `game.allowlist()` when the game has no allowlist set. */
export const ZERO_ADDRESS: Address =
  '0x0000000000000000000000000000000000000000';

/**
 * Minimal allowlist ABI fragment. We re-declare only the two read methods
 * the hook calls — pulling the full artefact would balloon the client
 * bundle and the surface here is intentionally narrow.
 */
export const ALLOWLIST_READ_ABI = [
  {
    type: 'function',
    name: 'allowlistEnabled',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'isAllowed',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const satisfies Abi;

/**
 * Subset of a game-contract ABI required by `useAllowlistGate` — every game
 * (CosmicFlip, GravityDice, ConstellationClimb) exposes the public storage
 * getter `allowlist() returns (address)` via Solidity's auto-generated
 * accessor.
 */
export const GAME_ALLOWLIST_READ_ABI = [
  {
    type: 'function',
    name: 'allowlist',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const satisfies Abi;

export type AllowlistGateStatus = 'loading' | 'passthrough' | 'blocked';

export type AllowlistGateReason =
  | 'loading'
  | 'no-allowlist'
  | 'disabled'
  | 'allowed'
  | 'denied';

export interface AllowlistGateState {
  status: AllowlistGateStatus;
  /**
   * Resolved on-chain allowlist contract address. `null` when the game has
   * no allowlist set (gate (1)) or the resolve is still pending.
   */
  allowlistAddress: Address | null;
  /** Human-readable reason — useful for telemetry & test assertions. */
  reason: AllowlistGateReason;
}

export interface UseAllowlistGateOptions {
  /** Address of the live game contract (CosmicFlip / GravityDice / etc). */
  gameAddress?: Address;
  /** Connected wallet address — when undefined the gate stays `loading`. */
  player?: Address;
  /** Active chain id; forwarded to wagmi reads to pin the network. */
  chainId?: number;
  /**
   * When `false`, the hook skips all reads and returns `passthrough` so
   * callers can disable the gate during e.g. SSR or when the wallet is
   * disconnected. Defaults to `true`.
   */
  enabled?: boolean;
}

/**
 * Pre-bet allowlist access check. See file header for the staged read
 * pipeline and the acceptance criteria for
 * [SWO_CASINO_ALLOWLIST_UI_GATE].
 */
export function useAllowlistGate(
  opts: UseAllowlistGateOptions,
): AllowlistGateState {
  const { gameAddress, player, chainId, enabled = true } = opts;

  const baseEnabled = enabled && Boolean(gameAddress);

  const allowlistRead = useReadContract({
    address: gameAddress,
    abi: GAME_ALLOWLIST_READ_ABI,
    functionName: 'allowlist',
    chainId,
    query: { enabled: baseEnabled },
  });

  const resolvedAllowlist =
    (allowlistRead.data as Address | undefined) ?? undefined;
  const hasAllowlist =
    Boolean(resolvedAllowlist) &&
    (resolvedAllowlist as string).toLowerCase() !==
      ZERO_ADDRESS.toLowerCase();

  const enabledRead = useReadContract({
    address: hasAllowlist ? (resolvedAllowlist as Address) : undefined,
    abi: ALLOWLIST_READ_ABI,
    functionName: 'allowlistEnabled',
    chainId,
    query: { enabled: baseEnabled && hasAllowlist },
  });

  const allowlistOn = enabledRead.data === true;

  const allowedRead = useReadContract({
    address: hasAllowlist ? (resolvedAllowlist as Address) : undefined,
    abi: ALLOWLIST_READ_ABI,
    functionName: 'isAllowed',
    args: player ? [player] : undefined,
    chainId,
    query: {
      enabled:
        baseEnabled && hasAllowlist && allowlistOn && Boolean(player),
    },
  });

  if (!enabled) {
    return {
      status: 'passthrough',
      allowlistAddress: null,
      reason: 'no-allowlist',
    };
  }

  if (!gameAddress) {
    return {
      status: 'loading',
      allowlistAddress: null,
      reason: 'loading',
    };
  }

  if (allowlistRead.isLoading || allowlistRead.data === undefined) {
    return {
      status: 'loading',
      allowlistAddress: null,
      reason: 'loading',
    };
  }

  if (!hasAllowlist) {
    return {
      status: 'passthrough',
      allowlistAddress: null,
      reason: 'no-allowlist',
    };
  }

  if (enabledRead.isLoading || enabledRead.data === undefined) {
    return {
      status: 'loading',
      allowlistAddress: resolvedAllowlist as Address,
      reason: 'loading',
    };
  }

  if (!allowlistOn) {
    return {
      status: 'passthrough',
      allowlistAddress: resolvedAllowlist as Address,
      reason: 'disabled',
    };
  }

  if (!player) {
    // Allowlist is on but we don't know who the player is. Stay loading —
    // the UI surface is typically already in a "Connect wallet" state and
    // the gate decision happens once the wallet is wired up.
    return {
      status: 'loading',
      allowlistAddress: resolvedAllowlist as Address,
      reason: 'loading',
    };
  }

  if (allowedRead.isLoading || allowedRead.data === undefined) {
    return {
      status: 'loading',
      allowlistAddress: resolvedAllowlist as Address,
      reason: 'loading',
    };
  }

  return allowedRead.data === true
    ? {
        status: 'passthrough',
        allowlistAddress: resolvedAllowlist as Address,
        reason: 'allowed',
      }
    : {
        status: 'blocked',
        allowlistAddress: resolvedAllowlist as Address,
        reason: 'denied',
      };
}
