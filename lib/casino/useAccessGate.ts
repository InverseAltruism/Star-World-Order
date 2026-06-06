// useAccessGate — chain-aware access decision for the SWO Cosmic Casino.
//
// Acceptance contract for [SWO_CASINO_TESTNET_OPEN_ACCESS] (PROJECT:SWO, P0):
//
//   chainId === 10143 (Monad testnet)
//       → { allowed: true, reason: 'testnet-open', copy: ... }
//       The Skrumpey ownership requirement is BYPASSED so QA + operator
//       smoke flows can place bets without a holder wallet. We do NOT
//       consult the holder snapshot on this branch — even an outright
//       error from `useDAOAccess` must not down-rank a testnet caller.
//
//   chainId === 143 (Monad mainnet)
//       → branches on the holder snapshot (`useDAOAccess` by default,
//         injectable via `holderOverride` for unit tests):
//           - isLoading        → { allowed:false, reason:'mainnet-loading'    }
//           - !isConnected     → { allowed:false, reason:'mainnet-disconnected' }
//           - !hasAccess       → { allowed:false, reason:'mainnet-no-holder'  }
//           - hasAccess        → { allowed:true,  reason:'mainnet-holder'    }
//
//   anything else (Ethereum mainnet 1, Polygon 137, undefined, …)
//       → { allowed: false, reason: 'wrong-chain', copy: ... }
//
// The hook is pure with respect to its inputs: identical
// `{ chainId, holderOverride }` always produces the same state, so the
// upstream `CasinoAccessGate` wrapper can rely on referential stability
// of the `reason` discriminator for testid / data-attribute wiring.
//
// `holderOverride` is a test hook so unit tests can drive the mainnet
// branch without standing up `DAOAccessProvider` + `WagmiProvider`.
// Production callers should leave it undefined; the hook then reads
// `DAOAccessContext` via a context-safe variant that does not throw
// when the provider is absent (testnet pages that bypass the gate
// entirely should not be forced to mount the holder context).

'use client';

import { useContext } from 'react';
import { DAOAccessContext } from '@/lib/contexts/DAOAccessContext';

export const MONAD_MAINNET_CHAIN_ID = 143;
export const MONAD_TESTNET_CHAIN_ID = 10143;

export type AccessGateReason =
  | 'testnet-open'
  | 'mainnet-holder'
  | 'mainnet-no-holder'
  | 'mainnet-disconnected'
  | 'mainnet-loading'
  | 'wrong-chain';

export interface AccessGateState {
  /** Final decision: should protected children render? */
  allowed: boolean;
  /** Discriminator — useful for telemetry, data-attrs, and test assertions. */
  reason: AccessGateReason;
  /** Human-readable explanatory copy for the locked / loading screen. */
  copy: string;
}

/**
 * Minimal slice of `DAOAccessContext` the gate cares about. The mainnet
 * branch only needs three booleans; full token lists / refresh handles
 * stay out of this surface so tests can inject a tiny literal.
 */
export interface HolderSnapshot {
  hasAccess: boolean;
  isLoading: boolean;
  isConnected: boolean;
}

export interface UseAccessGateOptions {
  /** Active EVM chain id (e.g. from `wagmi.useChainId()`). */
  chainId: number;
  /**
   * Test-only injection. When set, the hook uses this snapshot for the
   * mainnet branch INSTEAD of reading `DAOAccessContext`. Production
   * callers should leave this undefined.
   */
  holderOverride?: HolderSnapshot;
}

const COPY_TESTNET_OPEN =
  'Testnet open access — Skrumpey ownership is not required on Monad testnet.';
const COPY_MAINNET_LOADING = 'Verifying Star Skrumpey ownership…';
const COPY_MAINNET_DISCONNECTED =
  'Connect a wallet that holds a Star Skrumpey to enter the Cosmic Casino.';
const COPY_MAINNET_NO_HOLDER =
  'Only Star Skrumpey holders may enter the Cosmic Casino.';
const COPY_MAINNET_HOLDER = 'Star Skrumpey detected — welcome to the casino.';
const COPY_WRONG_CHAIN =
  'Wrong network — switch to Monad mainnet to access the casino.';

/**
 * Chain-aware access decision. See file header for the per-branch
 * contract and the rationale behind the testnet bypass.
 */
export function useAccessGate(
  opts: UseAccessGateOptions,
): AccessGateState {
  const { chainId, holderOverride } = opts;

  // Read context UNCONDITIONALLY to satisfy the rules of hooks. We use
  // `useContext` directly (not the throwing `useDAOAccess` wrapper) so
  // callers that bypass the gate entirely — e.g. testnet smoke pages —
  // are not forced to mount `DAOAccessProvider`.
  const daoCtx = useContext(DAOAccessContext);

  // (1) Testnet bypass — short-circuit BEFORE consulting any holder
  // signal. The bypass must hold even if the holder check is broken.
  if (chainId === MONAD_TESTNET_CHAIN_ID) {
    return {
      allowed: true,
      reason: 'testnet-open',
      copy: COPY_TESTNET_OPEN,
    };
  }

  // (2) Mainnet — branch on the holder snapshot.
  if (chainId === MONAD_MAINNET_CHAIN_ID) {
    const holder: HolderSnapshot | undefined =
      holderOverride ??
      (daoCtx
        ? {
            hasAccess: daoCtx.hasAccess,
            isLoading: daoCtx.isLoading,
            isConnected: daoCtx.isConnected,
          }
        : undefined);

    if (!holder) {
      // No provider AND no override — treat as still resolving so the
      // caller renders the loading state instead of locking the user
      // out. This is the safest behaviour for mid-mount transitions.
      return {
        allowed: false,
        reason: 'mainnet-loading',
        copy: COPY_MAINNET_LOADING,
      };
    }

    if (holder.isLoading) {
      return {
        allowed: false,
        reason: 'mainnet-loading',
        copy: COPY_MAINNET_LOADING,
      };
    }
    if (!holder.isConnected) {
      return {
        allowed: false,
        reason: 'mainnet-disconnected',
        copy: COPY_MAINNET_DISCONNECTED,
      };
    }
    if (!holder.hasAccess) {
      return {
        allowed: false,
        reason: 'mainnet-no-holder',
        copy: COPY_MAINNET_NO_HOLDER,
      };
    }
    return {
      allowed: true,
      reason: 'mainnet-holder',
      copy: COPY_MAINNET_HOLDER,
    };
  }

  // (3) Any other chain — wrong network. We deliberately do NOT
  // consult the holder snapshot here: the user has to pick the right
  // network before a holder check can mean anything.
  return {
    allowed: false,
    reason: 'wrong-chain',
    copy: COPY_WRONG_CHAIN,
  };
}
