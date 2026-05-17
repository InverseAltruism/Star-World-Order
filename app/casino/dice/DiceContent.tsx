// DiceContent — wagmi-wired wrapper around `<DicePanel />` for /casino/dice.
// All side-effecting state (wallet, chain, writeContract, BetSettled
// subscription) lives here so the presentational panel stays trivially
// testable.
//
// Lifecycle:
//   1. Resolve `GravityDice` address for the active chain.
//   2. If wagmi reports a chain outside {143, 10143}, surface a "Switch to
//      Monad" CTA via `useSwitchChain`.
//   3. `placeBet(rollUnder, clientSeed, serverCommit)` is broadcast through
//      `useWriteContract`. `clientSeed` is generated locally; `serverCommit`
//      is read from `NEXT_PUBLIC_GRAVITY_DICE_COMMIT` (or a placeholder zero
//      hash while the seed-claim API lands).
//   4. `useWatchContractEvent('BetSettled')` flips the surface to Won/Lost
//      and populates FairnessProof with the revealed server seed.

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

import {
  DicePanel,
  MONAD_MAINNET_CHAIN_ID,
  type Outcome,
} from './DicePanel';

const ZERO_BYTES32: Hex =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

// Trimmed ABI fragment — only the surface the page calls. Pulling the full
// JSON artefact at build time would balloon the bundle.
export const GRAVITY_DICE_ABI = [
  {
    type: 'function',
    name: 'placeBet',
    stateMutability: 'payable',
    inputs: [
      { name: 'rollUnder', type: 'uint8' },
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
      { name: 'roll', type: 'uint8', indexed: false },
      { name: 'won', type: 'bool', indexed: false },
      { name: 'payout', type: 'uint256', indexed: false },
      { name: 'serverReveal', type: 'bytes32', indexed: false },
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
  const raw = process.env.NEXT_PUBLIC_GRAVITY_DICE_COMMIT;
  if (!raw) return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) return null;
  return raw as Hex;
}

export default function DiceContent() {
  const [rollUnder, setRollUnder] = useState<number>(50);
  const [stake, setStake] = useState('0.01');
  const [lastStake, setLastStake] = useState<string | undefined>(undefined);
  const [clientSeed, setClientSeed] = useState<Hex | null>(null);
  const [serverReveal, setServerReveal] = useState<Hex | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [betError, setBetError] = useState<string | null>(null);

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
  const gravityDiceAddress: Address | undefined = addresses?.gravityDice;

  const serverCommit = useMemo(() => resolveCommitFromEnv(), []);

  useWatchContractEvent({
    address: gravityDiceAddress,
    abi: GRAVITY_DICE_ABI,
    eventName: 'BetSettled',
    enabled: Boolean(gravityDiceAddress && isConnected),
    onLogs(logs) {
      for (const log of logs) {
        const args = (log as unknown as { args?: Record<string, unknown> }).args;
        if (!args) continue;
        if (
          args.player &&
          address &&
          (args.player as string).toLowerCase() !== address.toLowerCase()
        ) {
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
    if (!gravityDiceAddress) return;
    setBetError(null);
    const commit = serverCommit ?? ZERO_BYTES32;
    if (commit === ZERO_BYTES32) {
      setBetError(
        'Server commit not configured — set NEXT_PUBLIC_GRAVITY_DICE_COMMIT to enable bets.',
      );
      return;
    }
    const seed = randomClientSeed();
    setClientSeed(seed);
    setLastStake(stake);
    setOutcome(null);
    setServerReveal(null);
    writeContract({
      address: gravityDiceAddress,
      abi: GRAVITY_DICE_ABI,
      functionName: 'placeBet',
      args: [rollUnder, seed, commit],
      value: parseEther(stake || '0'),
      chainId: activeChainId,
    });
  }, [
    gravityDiceAddress,
    serverCommit,
    stake,
    rollUnder,
    activeChainId,
    writeContract,
  ]);

  return (
    <DicePanel
      rollUnder={rollUnder}
      onRollUnderChange={setRollUnder}
      stake={stake}
      onStakeChange={setStake}
      lastStake={lastStake}
      isConnected={isConnected}
      activeChainId={activeChainId}
      onSwitchChain={() => switchChain({ chainId: MONAD_MAINNET_CHAIN_ID })}
      switching={switching}
      gravityDiceAddress={gravityDiceAddress}
      signing={signing}
      txHash={txHash ?? null}
      betError={betError}
      writeError={writeError ?? null}
      onPlaceBet={placeBet}
      outcome={outcome}
      serverReveal={serverReveal}
      clientSeed={clientSeed}
    />
  );
}
