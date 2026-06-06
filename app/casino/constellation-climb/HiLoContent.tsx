// HiLoContent — wagmi-wired wrapper around `<HiLoPanel />` for
// /casino/constellation-climb. All side-effecting state (wallet, chain,
// writeContract, session subscription) lives here so the presentational
// panel stays trivially testable.
//
// Scope: this file ships the openSession / playStep / cashOut wiring with
// the pre-bet allowlist gate from `[SWO_CASINO_ALLOWLIST_UI_GATE_HILO]`.
// Mirrors `CoinflipContent.tsx` and `DiceContent.tsx`. The fuller HiLo
// chrome (card-art reveal, refund expiry banner, fairness proof) is shipped
// under `[SWO_CASINO_HILO_UI]`.

'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWatchContractEvent,
  useWriteContract,
} from 'wagmi';
import { parseEther, type Address, type Hex } from 'viem';

import { getCasinoAddresses } from '@/lib/casino/addresses';
import { useAllowlistGate } from '@/lib/casino/useAllowlistGate';

import {
  HiLoPanel,
  MONAD_MAINNET_CHAIN_ID,
  type Direction,
  type SessionStatus,
} from './HiLoPanel';

const ZERO_BYTES32: Hex =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

// Trimmed ABI fragment for the three lifecycle calls + the events the
// surface watches. The fuller artefact lives at
// `services/casino-indexer/abis/CasinoHiLo.ts`.
export const CONSTELLATION_CLIMB_ABI = [
  {
    type: 'function',
    name: 'openSession',
    stateMutability: 'payable',
    inputs: [
      { name: 'clientSeed', type: 'bytes32' },
      { name: 'serverCommit', type: 'bytes32' },
    ],
    outputs: [{ name: 'sessionId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'playStep',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionId', type: 'uint256' },
      { name: 'direction', type: 'uint8' },
      { name: 'serverReveal', type: 'bytes32' },
      { name: 'nextCommit', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cashOut',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'event',
    name: 'SessionOpened',
    inputs: [
      { name: 'sessionId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'stake', type: 'uint256', indexed: false },
      { name: 'clientSeed', type: 'bytes32', indexed: false },
      { name: 'serverCommit', type: 'bytes32', indexed: false },
      { name: 'initialCard', type: 'uint8', indexed: false },
      { name: 'nonce', type: 'uint256', indexed: false },
      { name: 'blockOpened', type: 'uint64', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'StepPlayed',
    inputs: [
      { name: 'sessionId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'direction', type: 'uint8', indexed: false },
      { name: 'prevCard', type: 'uint8', indexed: false },
      { name: 'newCard', type: 'uint8', indexed: false },
      { name: 'won', type: 'bool', indexed: false },
      { name: 'newMultiplier', type: 'uint256', indexed: false },
      { name: 'serverReveal', type: 'bytes32', indexed: false },
      { name: 'nextCommit', type: 'bytes32', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'SessionCashedOut',
    inputs: [
      { name: 'sessionId', type: 'uint256', indexed: true },
      { name: 'player', type: 'address', indexed: true },
      { name: 'payout', type: 'uint256', indexed: false },
      { name: 'finalMultiplier', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
] as const;

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
  const raw = process.env.NEXT_PUBLIC_CONSTELLATION_CLIMB_COMMIT;
  if (!raw) return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) return null;
  return raw as Hex;
}

const WAD = 1_000_000_000_000_000_000n; // 1e18

export default function HiLoContent() {
  const [stake, setStake] = useState('0.01');
  const [direction, setDirection] = useState<Direction>('higher');
  const [lastStake, setLastStake] = useState<string | undefined>(undefined);
  const [sessionId, setSessionId] = useState<bigint | null>(null);
  const [currentCard, setCurrentCard] = useState<number | null>(null);
  const [multiplierWad, setMultiplierWad] = useState<bigint>(WAD);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle');
  const [betError, setBetError] = useState<string | null>(null);
  const [serverReveal, setServerReveal] = useState<Hex | null>(null);
  const [clientSeed, setClientSeed] = useState<Hex | null>(null);

  const { address, isConnected } = useAccount();
  const activeChainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const {
    writeContract,
    data: txHash,
    isPending: signing,
    error: writeError,
  } = useWriteContract();

  const addresses = useMemo(
    () => getCasinoAddresses(activeChainId ?? MONAD_MAINNET_CHAIN_ID),
    [activeChainId],
  );
  const constellationClimbAddress: Address | undefined =
    addresses?.constellationClimb;

  const serverCommit = useMemo(() => resolveCommitFromEnv(), []);

  // Pre-bet allowlist gate (see lib/casino/useAllowlistGate.ts). When the
  // gate is `blocked` we render "Allowlist required" via `betError` and
  // short-circuit all three lifecycle CTAs so no signing prompt is
  // triggered for a flow the contract would revert with `NotAllowed()`.
  const gate = useAllowlistGate({
    gameAddress: constellationClimbAddress,
    player: address,
    chainId: activeChainId,
    enabled: Boolean(constellationClimbAddress && isConnected),
  });
  const allowlistBlocked = gate.status === 'blocked';
  const effectiveBetError = allowlistBlocked
    ? 'Allowlist required'
    : betError;

  useWatchContractEvent({
    address: constellationClimbAddress,
    abi: CONSTELLATION_CLIMB_ABI,
    eventName: 'SessionOpened',
    enabled: Boolean(constellationClimbAddress && isConnected),
    onLogs(logs) {
      for (const log of logs) {
        const args = (log as unknown as { args?: Record<string, unknown> })
          .args;
        if (!args) continue;
        if (
          args.player &&
          address &&
          (args.player as string).toLowerCase() !== address.toLowerCase()
        ) {
          continue;
        }
        if (typeof args.sessionId === 'bigint') {
          setSessionId(args.sessionId);
        }
        if (typeof args.initialCard === 'number') {
          setCurrentCard(args.initialCard);
        }
        if (typeof args.clientSeed === 'string') {
          setClientSeed(args.clientSeed as Hex);
        }
        setServerReveal(null);
        setMultiplierWad(WAD);
        setSessionStatus('open');
      }
    },
  });

  useWatchContractEvent({
    address: constellationClimbAddress,
    abi: CONSTELLATION_CLIMB_ABI,
    eventName: 'StepPlayed',
    enabled: Boolean(constellationClimbAddress && isConnected),
    onLogs(logs) {
      for (const log of logs) {
        const args = (log as unknown as { args?: Record<string, unknown> })
          .args;
        if (!args) continue;
        if (
          args.player &&
          address &&
          (args.player as string).toLowerCase() !== address.toLowerCase()
        ) {
          continue;
        }
        if (typeof args.newCard === 'number') {
          setCurrentCard(args.newCard);
        }
        if (typeof args.newMultiplier === 'bigint') {
          setMultiplierWad(args.newMultiplier);
        }
        if (typeof args.serverReveal === 'string') {
          setServerReveal(args.serverReveal as Hex);
        }
        if (args.won === false) {
          setSessionStatus('lost');
        }
      }
    },
  });

  useWatchContractEvent({
    address: constellationClimbAddress,
    abi: CONSTELLATION_CLIMB_ABI,
    eventName: 'SessionCashedOut',
    enabled: Boolean(constellationClimbAddress && isConnected),
    onLogs(logs) {
      for (const log of logs) {
        const args = (log as unknown as { args?: Record<string, unknown> })
          .args;
        if (!args) continue;
        if (
          args.player &&
          address &&
          (args.player as string).toLowerCase() !== address.toLowerCase()
        ) {
          continue;
        }
        setSessionStatus('cashedOut');
      }
    },
  });

  const openSession = useCallback(() => {
    if (!constellationClimbAddress) return;
    // Allowlist gate: when the player is denied, do NOT call writeContract
    // — the wallet must never surface a signing prompt for a flow that the
    // contract will revert with `NotAllowed()`.
    if (allowlistBlocked) return;
    setBetError(null);
    const commit = serverCommit ?? ZERO_BYTES32;
    if (commit === ZERO_BYTES32) {
      setBetError(
        'Server commit not configured — set NEXT_PUBLIC_CONSTELLATION_CLIMB_COMMIT to enable sessions.',
      );
      return;
    }
    const seed = randomClientSeed();
    setLastStake(stake);
    setSessionStatus('idle');
    writeContract({
      address: constellationClimbAddress,
      abi: CONSTELLATION_CLIMB_ABI,
      functionName: 'openSession',
      args: [seed, commit],
      value: parseEther(stake || '0'),
      chainId: activeChainId,
    });
  }, [
    constellationClimbAddress,
    allowlistBlocked,
    serverCommit,
    stake,
    activeChainId,
    writeContract,
  ]);

  const step = useCallback(() => {
    if (!constellationClimbAddress) return;
    if (allowlistBlocked) return;
    if (sessionId === null) return;
    setBetError(null);
    const nextCommit = serverCommit ?? ZERO_BYTES32;
    writeContract({
      address: constellationClimbAddress,
      abi: CONSTELLATION_CLIMB_ABI,
      functionName: 'playStep',
      args: [sessionId, direction === 'higher' ? 0 : 1, ZERO_BYTES32, nextCommit],
      chainId: activeChainId,
    });
  }, [
    constellationClimbAddress,
    allowlistBlocked,
    sessionId,
    direction,
    serverCommit,
    activeChainId,
    writeContract,
  ]);

  const cashOut = useCallback(() => {
    if (!constellationClimbAddress) return;
    if (allowlistBlocked) return;
    if (sessionId === null) return;
    setBetError(null);
    writeContract({
      address: constellationClimbAddress,
      abi: CONSTELLATION_CLIMB_ABI,
      functionName: 'cashOut',
      args: [sessionId],
      chainId: activeChainId,
    });
  }, [
    constellationClimbAddress,
    allowlistBlocked,
    sessionId,
    activeChainId,
    writeContract,
  ]);

  return (
    <HiLoPanel
      stake={stake}
      onStakeChange={setStake}
      direction={direction}
      onDirectionChange={setDirection}
      lastStake={lastStake}
      isConnected={isConnected}
      activeChainId={activeChainId}
      onSwitchChain={() => switchChain({ chainId: MONAD_MAINNET_CHAIN_ID })}
      switching={switching}
      constellationClimbAddress={constellationClimbAddress}
      sessionStatus={sessionStatus}
      currentCard={currentCard}
      multiplierWad={multiplierWad}
      signing={signing}
      txHash={txHash ?? null}
      betError={effectiveBetError}
      writeError={writeError ?? null}
      allowlistBlocked={allowlistBlocked}
      onOpenSession={openSession}
      onStep={step}
      onCashOut={cashOut}
      serverReveal={serverReveal}
      clientSeed={clientSeed}
    />
  );
}
