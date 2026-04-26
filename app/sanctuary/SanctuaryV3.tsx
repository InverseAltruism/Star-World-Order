'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAccount } from 'wagmi';
import type { PhaserGameV3Ref } from '@/components/sanctuary-v3/PhaserGameV3';

const PhaserGameV3 = dynamic(
  () => import('@/components/sanctuary-v3/PhaserGameV3'),
  { ssr: false },
);

// Reuse the V2 React overlays — V3 ships the same game logic.
const QuestDialog = dynamic(
  () => import('@/components/sanctuary/overlays/QuestDialog'),
  { ssr: false },
);
const MinigameDialog = dynamic(
  () => import('@/components/sanctuary/overlays/MinigameDialog'),
  { ssr: false },
);
const QuestBoard = dynamic(
  () => import('@/components/sanctuary/overlays/QuestBoard'),
  { ssr: false },
);
const QuestTracker = dynamic(
  () => import('@/components/sanctuary/overlays/QuestTracker'),
  { ssr: false },
);
const ShopDialog = dynamic(
  () => import('@/components/sanctuary/overlays/ShopDialog'),
  { ssr: false },
);
const OnboardingOverlay = dynamic(
  () => import('@/components/sanctuary/overlays/OnboardingOverlay'),
  { ssr: false },
);
const AudioBootstrap = dynamic(
  () => import('@/components/sanctuary/AudioBootstrap'),
  { ssr: false },
);

export default function SanctuaryV3() {
  const gameRef = useRef<PhaserGameV3Ref | null>(null);
  const { address, isConnected } = useAccount();
  const [activeTokenId, setActiveTokenId] = useState<number | null>(null);
  const handleSceneReady = useCallback(() => {}, []);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sanctuary/companion?address=${address}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.companion) {
          setActiveTokenId(data.companion.token_id);
        }
      } catch {
        // Non-critical
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-black/80 border border-[#9966ff]/30 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-['Press_Start_2P'] text-xs text-[#9966ff]">
            SANCTUARY V3
          </span>
          <span className="text-[#ffd700] text-xs opacity-70">
            tile-based · Forgotten Memories baseline
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {isConnected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[#44ff88] inline-block" />
              <span className="text-[#44ff88] font-mono">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
            </>
          ) : (
            <span className="text-gray-500">Wallet not connected</span>
          )}
        </div>
      </div>

      <div className="relative bg-black/80 border border-[#9966ff]/30 rounded-lg overflow-hidden shadow-[0_0_15px_rgba(153,102,255,0.15)]">
        <PhaserGameV3 ref={gameRef} onSceneReady={handleSceneReady} />
        <QuestDialog walletAddress={address} tokenId={null} />
        <MinigameDialog walletAddress={address} tokenId={null} />
        <QuestBoard walletAddress={address} tokenId={null} />
        <QuestTracker walletAddress={address} tokenId={null} />
        <ShopDialog walletAddress={address} tokenId={null} />
        <OnboardingOverlay walletAddress={address} tokenId={activeTokenId} />
        <AudioBootstrap />
      </div>

      <div className="text-xs text-gray-500 px-2">
        Move with WASD or arrow keys. Click an NPC to interact. V3 is in active development.
      </div>
    </div>
  );
}
