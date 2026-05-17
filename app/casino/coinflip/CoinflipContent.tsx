// CoinflipContent — wagmi-backed wrapper around <CoinflipPanel>.
//
// Ported from BunnyBagz `apps/web/src/app/play/coinflip/page.tsx` to
// SWO's `/casino/coinflip` route. The BB original drags in a stack of
// optional rails (CoinSpin, MascotFrame, LiveActivityFeed, …) that
// don't exist in this repo; this port keeps only the pieces the task
// calls out: BetPanel + TrustStrip + FairnessProof + chain gate.
//
// Wire contract:
//   1. Reads the CosmicFlip address from the chain-keyed deployment
//      registry (`lib/casino/addresses.ts`).
//   2. Fetches a fresh server commit from `/api/seed/claim` before
//      each bet — if that endpoint isn't deployed yet the bet aborts
//      with a visible error rather than burning gas on a zero commit.
//   3. Calls `CosmicFlip.placeBet(sideEnum, clientSeed, serverCommit)`
//      via `writeContract`.
//   4. Listens for the `BetSettled` event via `useWatchContractEvent`,
//      filters to the current player, and surfaces Won/Lost in the
//      <CoinflipPanel> via the `settledSide` + `settledPayout` props.
//   5. Acceptance (d): chain-gate fires whenever wagmi reports a
//      chainId outside the Monad mainnet/testnet pair (143 / 10143).

'use client';

import { useCallback, useState } from 'react';
import { formatEther, parseEther, type Hex } from 'viem';
import {
  useAccount,
  useConnect,
  useSwitchChain,
  useWatchContractEvent,
  useWriteContract,
} from 'wagmi';

import { TrustStrip } from '@/components/casino/TrustStrip';
import { getCasinoAddresses } from '@/lib/casino/addresses';
import { monad } from '@/lib/wagmi';

import {
  ALLOWED_CHAIN_IDS,
  CoinflipPanel,
  type CoinflipSide,
} from './CoinflipPanel';

// Minimal ABI: only the two members this page actually touches. Avoids
// pulling in `contracts/casino/out/CosmicFlip.sol/CosmicFlip.json`,
// which (a) isn't committed in every environment and (b) drags in the
// full ~40KB artifact for two members. The full ABI is still consumed
// by the bankroll/admin surfaces that need it.
const COSMIC_FLIP_ABI = [
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
  },
] as const;

const ZERO_BYTES32: Hex =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

function randomClientSeed(): Hex {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    return ('0x' +
      Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')) as Hex;
  }
  return ZERO_BYTES32;
}

async function claimFreshCommit(): Promise<Hex | null> {
  try {
    const r = await fetch('/api/seed/claim', { method: 'POST' });
    if (!r.ok) return null;
    const j = (await r.json()) as { commit?: Hex };
    return j.commit ?? null;
  } catch {
    return null;
  }
}

function chainNameFor(chainId: number): string {
  if (chainId === 10143) return 'Monad Testnet';
  if (chainId === 143) return 'Monad';
  return `chain ${chainId}`;
}

export default function CoinflipContent() {
  const [side, setSide] = useState<CoinflipSide>('heads');
  const [stake, setStake] = useState('0.01');
  const [lastStake, setLastStake] = useState<string | undefined>(undefined);
  const [clientSeed, setClientSeed] = useState<Hex | null>(null);
  const [serverCommit, setServerCommit] = useState<Hex | null>(null);
  const [settledSide, setSettledSide] = useState<CoinflipSide | null>(null);
  const [settledPayout, setSettledPayout] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const {
    writeContract,
    data: txHash,
    isPending: signing,
    error: writeError,
  } = useWriteContract();

  const onAllowedChain =
    chainId != null &&
    (ALLOWED_CHAIN_IDS as readonly number[]).includes(chainId);
  const needsConnect = !isConnected;
  const chainGate =
    isConnected && !onAllowedChain
      ? {
          chainName: chainNameFor(monad.id),
          onSwitch: () => switchChain({ chainId: monad.id }),
          switching,
        }
      : null;

  const addresses = getCasinoAddresses(monad.id);
  const cosmicFlipAddress = addresses?.cosmicFlip ?? null;

  // Subscribe to BetSettled. Filter to the current player so other
  // bettors' settlements don't repaint our UI.
  useWatchContractEvent({
    address: cosmicFlipAddress ?? undefined,
    abi: COSMIC_FLIP_ABI,
    eventName: 'BetSettled',
    chainId: monad.id,
    enabled: Boolean(cosmicFlipAddress && address),
    onLogs(logs) {
      for (const log of logs as Array<{
        args?: {
          player?: `0x${string}`;
          outcome?: number;
          payout?: bigint;
        };
      }>) {
        const args = log.args;
        if (!args || !args.player || !address) continue;
        if (args.player.toLowerCase() !== address.toLowerCase()) continue;
        const outcomeSide: CoinflipSide =
          (args.outcome ?? 0) === 0 ? 'heads' : 'tails';
        setSettledSide(outcomeSide);
        if (args.payout != null) {
          setSettledPayout(
            parseFloat(formatEther(args.payout)).toFixed(6).replace(/0+$/, '').replace(/\.$/, ''),
          );
        }
      }
    },
  });

  const placeBet = useCallback(async () => {
    if (!cosmicFlipAddress) {
      setError('Coinflip is not deployed on this chain yet.');
      return;
    }
    setError(null);
    setSettledSide(null);
    setSettledPayout(null);
    const fresh = await claimFreshCommit();
    if (!fresh) {
      setError(
        'Could not claim a fresh server commit. Try again in a moment.',
      );
      return;
    }
    const seed = randomClientSeed();
    setClientSeed(seed);
    setServerCommit(fresh);
    setLastStake(stake);
    const sideEnum = side === 'heads' ? 0 : 1;
    writeContract({
      address: cosmicFlipAddress,
      abi: COSMIC_FLIP_ABI,
      functionName: 'placeBet',
      args: [sideEnum, seed, fresh],
      value: parseEther(stake || '0'),
      chainId: monad.id,
    });
  }, [cosmicFlipAddress, side, stake, writeContract]);

  const onConnect = useCallback(() => {
    const connector = connectors[0];
    if (!connector) return;
    connect({ connector });
  }, [connect, connectors]);

  const ctaDisabled = !cosmicFlipAddress;
  // Derive the user-visible error: prefer the local claim/deploy error,
  // then fall back to wagmi's writeContract error. Avoids a
  // setState-in-effect cascade for surfacing write errors.
  const displayError = error ?? (writeError ? writeError.message : null);

  return (
    <CoinflipPanel
      side={side}
      onSideChange={setSide}
      stake={stake}
      onStakeChange={setStake}
      lastStake={lastStake}
      chainGate={chainGate}
      needsConnect={needsConnect}
      onConnect={onConnect}
      busy={signing}
      onPlaceBet={placeBet}
      ctaDisabled={ctaDisabled}
      ctaLabelOverride={
        !cosmicFlipAddress ? 'Coinflip not deployed' : undefined
      }
      settledSide={settledSide}
      settledPayout={settledPayout}
      error={displayError}
      txHash={txHash ?? null}
      serverCommit={serverCommit}
      clientSeed={clientSeed}
      trustStrip={<TrustStrip />}
    />
  );
}
