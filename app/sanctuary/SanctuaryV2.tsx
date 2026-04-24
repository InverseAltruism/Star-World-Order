'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import type { PhaserGameRef } from '@/components/sanctuary/PhaserGame';
import { useAccount } from 'wagmi';

const PhaserGame = dynamic(
  () => import('@/components/sanctuary/PhaserGame'),
  { ssr: false }
);

const CompanionHUD = dynamic(
  () => import('@/components/sanctuary/overlays/CompanionHUD'),
  { ssr: false }
);

const CompanionMenu = dynamic(
  () => import('@/components/sanctuary/overlays/CompanionMenu'),
  { ssr: false }
);

const MultiplayerBridge = dynamic(
  () => import('@/components/sanctuary/overlays/MultiplayerBridge'),
  { ssr: false }
);

const ChatInput = dynamic(
  () => import('@/components/sanctuary/overlays/ChatInput'),
  { ssr: false }
);

const ChatBubble = dynamic(
  () => import('@/components/sanctuary/overlays/ChatBubble'),
  { ssr: false }
);

const QuestDialog = dynamic(
  () => import('@/components/sanctuary/overlays/QuestDialog'),
  { ssr: false }
);

const QuestBoard = dynamic(
  () => import('@/components/sanctuary/overlays/QuestBoard'),
  { ssr: false }
);

const QuestTracker = dynamic(
  () => import('@/components/sanctuary/overlays/QuestTracker'),
  { ssr: false }
);

const JournalOverlay = dynamic(
  () => import('@/components/sanctuary/overlays/JournalOverlay'),
  { ssr: false }
);

const TraitsOverlay = dynamic(
  () => import('@/components/sanctuary/overlays/TraitsOverlay'),
  { ssr: false }
);

const WelcomeDialog = dynamic(
  () => import('@/components/sanctuary/overlays/WelcomeDialog'),
  { ssr: false }
);

const DevMapEditor = dynamic(
  () => import('@/components/sanctuary/DevMapEditor'),
  { ssr: false }
);

export default function SanctuaryV2() {
  const gameRef = useRef<PhaserGameRef | null>(null);
  const searchParams = useSearchParams();
  const editMode = searchParams.get('edit') === '1';
  const { address, isConnected } = useAccount();
  const [activeTokenId, setActiveTokenId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;

    async function fetchActiveCompanion() {
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
    }

    fetchActiveCompanion();
    return () => { cancelled = true; };
  }, [address, refreshKey]);

  const handleInteracted = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleSceneReady = useCallback(() => {
    // Future: send wallet data to Phaser scene via EventBus
  }, []);

  return (
    <div className="space-y-4">
      {/* Wallet auth bar */}
      <div className="flex items-center justify-between bg-black/80 border border-[#00f7ff]/30 rounded-lg px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-['Press_Start_2P'] text-xs text-[#00f7ff]">
            SANCTUARY V2
          </span>
          <span className="text-[#9966ff] text-xs opacity-60">ALPHA</span>
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

      {/* Phaser canvas with HUD overlay */}
      <div className="relative bg-black/80 border border-[#00f7ff]/30 rounded-lg overflow-hidden shadow-[0_0_15px_rgba(0,247,255,0.15)]">
        <PhaserGame ref={gameRef} onSceneReady={handleSceneReady} />
        <CompanionHUD walletAddress={address} />
        <CompanionMenu walletAddress={address} tokenId={activeTokenId} onInteracted={handleInteracted} />
        {address && (
          <MultiplayerBridge
            wallet={address}
            displayName={address.slice(0, 6)}
            companionTokenId={activeTokenId ?? -1}
          />
        )}
        <QuestDialog walletAddress={address} tokenId={activeTokenId} />
        <QuestBoard walletAddress={address} tokenId={activeTokenId} />
        <QuestTracker walletAddress={address} tokenId={activeTokenId} />
        <JournalOverlay walletAddress={address} tokenId={activeTokenId} />
        <TraitsOverlay walletAddress={address} tokenId={activeTokenId} />
        <WelcomeDialog walletAddress={address} />
        <ChatBubble />
        <ChatInput />
        {editMode && <DevMapEditor />}
      </div>
    </div>
  );
}
