// CoinflipContent — Cosmic Flip surface for the SWO Cosmic Casino.
//
// Ported from BunnyBagz `apps/web/src/app/play/coinflip/page.tsx` and
// rewired onto the SWO casino primitives that already landed in this
// repo (`BetPanel`, `TrustStrip`) plus the new `FairnessProof` card.
//
// Lifecycle:
//   1. The page resolves the deployed `CosmicFlip` address from
//      `lib/casino/addresses.ts` for the active chain.
//   2. If the wallet is on a chain we don't ship to (chain ≠ 10143/143),
//      the primary CTA flips to "Switch to Monad" and uses
//      `useSwitchChain` to nudge the wallet.
//   3. `placeBet(side, clientSeed, commit)` is broadcast via
//      `useWriteContract` — `clientSeed` is generated locally and the
//      `commit` is supplied as an env override or a placeholder zero
//      hash until the seed-claim endpoint lands.
//   4. `useWatchContractEvent('BetSettled')` flips the UI to Won/Lost
//      and updates the FairnessProof card with the revealed server seed.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWatchContractEvent,
  useWriteContract,
} from 'wagmi';
import { parseEther, type Address, type Hex } from 'viem';

import { BetPanel } from '@/components/casino/BetPanel';
import { FairnessProof } from '@/components/casino/FairnessProof';
import { TrustStrip } from '@/components/casino/TrustStrip';
import { getCasinoAddresses } from '@/lib/casino/addresses';

const MONAD_MAINNET_CHAIN_ID = 143;
const MONAD_TESTNET_CHAIN_ID = 10143;
const SUPPORTED_CHAIN_IDS: ReadonlyArray<number> = [
  MONAD_MAINNET_CHAIN_ID,
  MONAD_TESTNET_CHAIN_ID,
];

const PAYOUT_MULTIPLIER = 1.98;

const ZERO_BYTES32: Hex =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

// Trimmed ABI fragment — only the surface CoinflipContent calls. The
// full ABI lives under `contracts/casino/out/CosmicFlip.sol/CosmicFlip.json`
// once Foundry artifacts are regenerated; this fragment keeps the bundle
// lean and the wagmi types happy without pulling the JSON at build time.
export const COSMIC_FLIP_ABI = [
  {
    type: 'function',
    name: 'placeBet',
    stateMutability: 'payable',
    inputs: [
      { name: 'side', type: 'uint8' },
      { name: 'clientSeed', type: 'bytes32' },
      { name: 'serverCommit', type: 'bytes32' },
    ],
    outputs: [{ name: 'betId', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'BetSettled',
    inputs: [
      { name: 'betId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'outcome', type: 'uint8', indexed: false },
      { name: 'won', type: 'bool', indexed: false },
      { name: 'payout', type: 'uint256', indexed: false },
      { name: 'serverReveal', type: 'bytes32', indexed: false },
    ],
    anonymous: false,
  },
] as const;

type Side = 'heads' | 'tails';

function randomClientSeed(): Hex {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    return ('0x' +
      Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')) as Hex;
  }
  return ZERO_BYTES32;
}

function resolveCommitFromEnv(): Hex | null {
  const raw = process.env.NEXT_PUBLIC_COSMIC_FLIP_COMMIT;
  if (!raw) return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) return null;
  return raw as Hex;
}

function profitOnWin(stake: string, unit: string): string | undefined {
  const n = parseFloat(stake || '0');
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const profit = n * PAYOUT_MULTIPLIER - n;
  const trimmed = parseFloat(profit.toFixed(6)).toString();
  return `${trimmed} ${unit}`;
}

export default function CoinflipContent() {
  const [side, setSide] = useState<Side>('heads');
  const [stake, setStake] = useState('0.01');
  const [lastStake, setLastStake] = useState<string | undefined>(undefined);
  const [clientSeed, setClientSeed] = useState<Hex | null>(null);
  const [serverReveal, setServerReveal] = useState<Hex | null>(null);
  const [outcome, setOutcome] = useState<'won' | 'lost' | null>(null);
  const [betError, setBetError] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const activeChainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { writeContract, data: txHash, isPending: signing, error: writeError } =
    useWriteContract();

  // Default to Monad mainnet when no chain has been resolved yet (pre-
  // connect). The chain gate is keyed on `isConnected`, so this default
  // never trips the wrong-chain CTA on the first paint.
  const targetChainId = isConnected ? activeChainId : MONAD_MAINNET_CHAIN_ID;
  const onSupportedChain = SUPPORTED_CHAIN_IDS.includes(targetChainId);
  const onWrongChain = isConnected && !onSupportedChain;

  const addresses = useMemo(
    () => getCasinoAddresses(targetChainId),
    [targetChainId],
  );
  const cosmicFlipAddress: Address | undefined = addresses?.cosmicFlip;

  const serverCommit = useMemo(() => resolveCommitFromEnv(), []);

  useWatchContractEvent({
    address: cosmicFlipAddress,
    abi: COSMIC_FLIP_ABI,
    eventName: 'BetSettled',
    enabled: Boolean(cosmicFlipAddress && isConnected),
    onLogs(logs) {
      for (const log of logs) {
        const args = (log as unknown as { args?: Record<string, unknown> }).args;
        if (!args) continue;
        if (args.player && address && (args.player as string).toLowerCase() !== address.toLowerCase()) {
          continue;
        }
        if (typeof args.won === 'boolean') {
          setOutcome(args.won ? 'won' : 'lost');
        }
        if (typeof args.serverReveal === 'string') {
          setServerReveal(args.serverReveal as Hex);
        }
      }
    },
  });

  const placeBet = useCallback(() => {
    if (!cosmicFlipAddress) return;
    setBetError(null);
    const commit = serverCommit ?? ZERO_BYTES32;
    if (commit === ZERO_BYTES32) {
      setBetError(
        'Server commit not configured — set NEXT_PUBLIC_COSMIC_FLIP_COMMIT to enable bets.',
      );
      return;
    }
    const seed = randomClientSeed();
    setClientSeed(seed);
    setLastStake(stake);
    setOutcome(null);
    setServerReveal(null);
    writeContract({
      address: cosmicFlipAddress,
      abi: COSMIC_FLIP_ABI,
      functionName: 'placeBet',
      args: [side === 'heads' ? 0 : 1, seed, commit],
      value: parseEther(stake || '0'),
      chainId: targetChainId,
    });
  }, [
    cosmicFlipAddress,
    serverCommit,
    stake,
    side,
    targetChainId,
    writeContract,
  ]);

  // Refocus the side picker when the user changes pick mid-stream.
  useEffect(() => {
    if (outcome) setOutcome(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side]);

  const canFlip =
    isConnected && !onWrongChain && Boolean(cosmicFlipAddress) && !signing;

  const ctaSpec = (() => {
    if (!isConnected) {
      return { label: 'Connect wallet', onClick: () => {}, disabled: true };
    }
    if (onWrongChain) {
      return {
        label: switching ? 'Switching network…' : 'Switch to Monad',
        onClick: () =>
          switchChain({ chainId: MONAD_MAINNET_CHAIN_ID }),
        disabled: switching,
      };
    }
    if (!cosmicFlipAddress) {
      return {
        label: 'Cosmic Flip not deployed yet',
        onClick: () => {},
        disabled: true,
      };
    }
    if (signing) {
      return {
        label: 'Confirm in wallet…',
        onClick: () => {},
        disabled: true,
      };
    }
    return {
      label: `Flip for ${stake} MON`,
      onClick: placeBet,
      disabled: false,
    };
  })();

  const liveMessage = (() => {
    if (outcome === 'won') return `You won ${stake} MON on ${side}.`;
    if (outcome === 'lost') return `You lost ${stake} MON on ${side}.`;
    return '';
  })();

  const sideSelector = (
    <div style={sideRowStyle} data-testid="coinflip-side-selector">
      {(['heads', 'tails'] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setSide(s)}
          aria-pressed={side === s}
          className="swo-casino-hit-44"
          style={side === s ? sideSelectedStyle : sideStyle}
          data-testid={`coinflip-side-${s}`}
        >
          {s}
        </button>
      ))}
    </div>
  );

  const extras = (
    <>
      {betError && (
        <p style={errorStyle} data-testid="coinflip-bet-error">
          {betError}
        </p>
      )}
      {writeError && (
        <p style={errorStyle} data-testid="coinflip-write-error">
          {writeError.message}
        </p>
      )}
      {txHash && (
        <p style={txStyle} data-testid="coinflip-tx-receipt">
          Tx submitted: <code>{txHash.slice(0, 14)}…</code>
        </p>
      )}
      {outcome && (
        <p
          style={outcome === 'won' ? wonStyle : lostStyle}
          data-testid={`coinflip-outcome-${outcome}`}
        >
          {outcome === 'won' ? 'Won' : 'Lost'} — {side} settled
        </p>
      )}
    </>
  );

  return (
    <div style={pageStyle} data-testid="coinflip-page">
      <header style={headerStyle}>
        <h1 style={titleStyle}>Cosmic Flip</h1>
        <span style={chainHintStyle} data-testid="coinflip-chain-hint">
          {targetChainId === MONAD_TESTNET_CHAIN_ID ? 'Monad Testnet' : 'Monad'} · 1.98×
        </span>
      </header>

      <TrustStrip />

      <BetPanel
        testIdPrefix="coinflip"
        ariaLabel="Coinflip controls"
        multiplier="1.98×"
        sideSelector={sideSelector}
        stakeUnit="MON"
        stake={stake}
        onStakeChange={setStake}
        lastStake={lastStake}
        chipMax="0.1"
        profitOnWin={profitOnWin(stake, 'MON')}
        liveMessage={liveMessage}
        cta={ctaSpec}
        onPanelEnter={canFlip ? placeBet : undefined}
        extras={extras}
      />

      <FairnessProof
        testIdPrefix="coinflip"
        serverCommit={serverCommit}
        clientSeed={clientSeed}
        serverReveal={serverReveal}
        txHash={txHash ?? null}
        explorerTxUrl={
          targetChainId === MONAD_TESTNET_CHAIN_ID
            ? 'https://testnet.monadscan.com/tx/'
            : 'https://monadscan.com/tx/'
        }
      />
    </div>
  );
}

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  color: 'var(--swo-casino-fg, #e8e8e8)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '1.5rem',
  color: 'var(--swo-casino-brand-gold, #ffd700)',
};

const chainHintStyle: CSSProperties = {
  fontSize: '0.8rem',
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.6))',
  fontVariantNumeric: 'tabular-nums',
};

const sideRowStyle: CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
};

const sideStyle: CSSProperties = {
  flex: 1,
  minHeight: 44,
  padding: '0.85rem 1rem',
  borderRadius: 12,
  border: '1px solid var(--swo-casino-border, rgba(255,255,255,0.16))',
  background: 'var(--swo-casino-elevated, rgba(255,255,255,0.06))',
  color: 'var(--swo-casino-fg, #e8e8e8)',
  fontWeight: 600,
  textTransform: 'capitalize',
  cursor: 'pointer',
};

const sideSelectedStyle: CSSProperties = {
  ...sideStyle,
  border: '2px solid var(--swo-casino-brand-gold, #ffd700)',
  background: 'var(--swo-casino-brand-gold, #ffd700)',
  color: 'var(--swo-casino-brand-ink, #0a0a1a)',
};

const errorStyle: CSSProperties = {
  margin: 0,
  color: 'var(--swo-casino-danger-fg, #ff6b6b)',
  fontSize: '0.8rem',
};

const txStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.75rem',
  color: 'var(--swo-casino-fg-muted, rgba(232,232,232,0.6))',
};

const wonStyle: CSSProperties = {
  margin: 0,
  padding: '0.5rem 0.75rem',
  borderRadius: 10,
  fontSize: '0.95rem',
  fontWeight: 700,
  color: 'var(--swo-casino-brand-ink, #0a0a1a)',
  background: 'var(--swo-casino-brand-gold, #ffd700)',
};

const lostStyle: CSSProperties = {
  margin: 0,
  padding: '0.5rem 0.75rem',
  borderRadius: 10,
  fontSize: '0.95rem',
  fontWeight: 700,
  color: 'var(--swo-casino-fg-strong, #ffffff)',
  background: 'rgba(255,107,107,0.18)',
  border: '1px solid rgba(255,107,107,0.4)',
};
