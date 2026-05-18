'use client';

// CasinoAccessGate — chain-aware wrapper around the Star Skrumpey access
// gate for the SWO Cosmic Casino. Branches on the live `wagmi.useChainId()`
// reading three ways:
//
//   • Monad mainnet (143)      → enforce the full <AccessGate> (Skrumpey
//                                ownership check, unchanged from the rest
//                                of the dapp).
//   • Monad testnet (10143)    → BYPASS the Skrumpey check entirely so QA
//                                can exercise the casino flows without
//                                holding a Star Skrumpey NFT. Children
//                                render directly; no AccessGate ever
//                                mounts on this branch.
//   • Any other chain          → render <ChainGate> with the "Switch to
//                                Monad mainnet" CTA. We deliberately do
//                                NOT mount <AccessGate> on the wrong-chain
//                                branch so the user sees the network CTA
//                                first (per acceptance: wrong-chain shows
//                                ChainGate, not AccessGate).
//
// Cites task row [SWO_CASINO_TESTNET_OPEN_ACCESS] (PROJECT:SWO, P1 — depends
// on D11). The testnet:mainnet chain-id ratio is 10143 / 143 ≈ 70.93×, i.e.
// the two chains differ by ~71× in their numeric chain id — this is the
// signal we branch on, no env flag is involved so the rule survives both
// `next build` and `next start` in any environment.
//
// `chainIdOverride` is a test hook so unit tests can drive the branch
// without standing up a `WagmiProvider`. Production callers should leave
// it undefined.

import type { ReactNode } from 'react';
import { useChainId } from 'wagmi';
import AccessGate from '@/components/AccessGate';
import {
  ChainGate,
  MONAD_MAINNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
  SUPPORTED_CHAIN_IDS,
} from './ChainGate';

export type CasinoAccessGateProps = {
  children: ReactNode;
  /** Optional custom title for the locked screen (mainnet branch only). */
  title?: string;
  /** Optional custom message for the locked screen (mainnet branch only). */
  message?: string;
  /**
   * Test hook: when set, replaces the default `useChainId()` read so unit
   * tests can drive the branch deterministically. Production code should
   * leave this undefined.
   */
  chainIdOverride?: number;
};

export default function CasinoAccessGate({
  children,
  title,
  message,
  chainIdOverride,
}: CasinoAccessGateProps) {
  const wagmiChainId = useChainId();
  const effectiveChainId = chainIdOverride ?? wagmiChainId;

  // Wrong chain — surface ChainGate, NOT the Skrumpey AccessGate. Users
  // need to pick the right network before we can even decide whether
  // they hold a Star Skrumpey.
  if (!SUPPORTED_CHAIN_IDS.includes(effectiveChainId)) {
    return (
      <ChainGate
        chainIdOverride={effectiveChainId}
        targetChainId={MONAD_MAINNET_CHAIN_ID}
      >
        {children}
      </ChainGate>
    );
  }

  // Monad testnet — QA bypass. Skrumpey ownership is NOT required.
  if (effectiveChainId === MONAD_TESTNET_CHAIN_ID) {
    return <>{children}</>;
  }

  // Monad mainnet — production rules apply.
  return (
    <AccessGate title={title} message={message}>
      {children}
    </AccessGate>
  );
}
