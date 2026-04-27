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
const CompanionHUD = dynamic(
  () => import('@/components/sanctuary/overlays/CompanionHUD'),
  { ssr: false },
);
const CompanionMenu = dynamic(
  () => import('@/components/sanctuary/overlays/CompanionMenu'),
  { ssr: false },
);
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
const JournalOverlay = dynamic(
  () => import('@/components/sanctuary/overlays/JournalOverlay'),
  { ssr: false },
);
const TraitsOverlay = dynamic(
  () => import('@/components/sanctuary/overlays/TraitsOverlay'),
  { ssr: false },
);
const WelcomeDialog = dynamic(
  () => import('@/components/sanctuary/overlays/WelcomeDialog'),
  { ssr: false },
);
const CompanionChatOverlay = dynamic(
  () => import('@/components/sanctuary/overlays/CompanionChatOverlay'),
  { ssr: false },
);
const LevelUpCelebration = dynamic(
  () => import('@/components/sanctuary/overlays/LevelUpCelebration'),
  { ssr: false },
);
const OnboardingOverlay = dynamic(
  () => import('@/components/sanctuary/overlays/OnboardingOverlay'),
  { ssr: false },
);
const NoSkrumpeyGate = dynamic(
  () => import('@/components/sanctuary/overlays/NoSkrumpeyGate'),
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
  const [refreshKey, setRefreshKey] = useState(0);
  const handleSceneReady = useCallback(() => {}, []);
  const handleInteracted = useCallback(() => setRefreshKey((k) => k + 1), []);

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
  }, [address, refreshKey]);

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
        <CompanionHUD walletAddress={address} />
        <CompanionMenu walletAddress={address} tokenId={activeTokenId} onInteracted={handleInteracted} />
        <QuestDialog walletAddress={address} tokenId={activeTokenId} />
        <MinigameDialog walletAddress={address} tokenId={activeTokenId} />
        <QuestBoard walletAddress={address} tokenId={activeTokenId} />
        <QuestTracker walletAddress={address} tokenId={activeTokenId} />
        <ShopDialog walletAddress={address} tokenId={activeTokenId} />
        <JournalOverlay walletAddress={address} tokenId={activeTokenId} />
        <TraitsOverlay walletAddress={address} tokenId={activeTokenId} />
        <WelcomeDialog walletAddress={address} />
        <CompanionChatOverlay walletAddress={address} tokenId={activeTokenId} />
        <OnboardingOverlay walletAddress={address} tokenId={activeTokenId} />
        <NoSkrumpeyGate
          walletAddress={address}
          tokenId={activeTokenId}
          onCompanionSelected={(id) => setActiveTokenId(id)}
        />
        <AudioBootstrap />
        <LevelUpCelebration />
      </div>

      <div className="text-xs text-gray-500 px-2">
        Move with WASD or arrow keys. Click your companion to pet, feed, or talk. Click an NPC to interact. Press <kbd>C</kbd> to chat with your companion, <kbd>J</kbd> for journal, <kbd>T</kbd> for traits. V3 is in active development.
      </div>
    </div>
  );
}
