'use client';

import { useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
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

export default function SanctuaryV2() {
  const gameRef = useRef<PhaserGameRef | null>(null);
  const { address, isConnected } = useAccount();

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
      </div>
    </div>
  );
}
