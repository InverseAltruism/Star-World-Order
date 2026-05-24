'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, lazy } from 'react';

const SanctuaryV2 = lazy(() => import('./SanctuaryV2'));
const CompanionView = lazy(() => import('./CompanionView'));

function SanctuarySwitch() {
  const searchParams = useSearchParams();
  const world = searchParams.get('world');

  // V2 is the only sanctuary experience now. The Companion view is the
  // default landing — clicking "Sanctuary" lands here. The Phaser world hub
  // (walk around, chat, minigames, expeditions, shop) is reached via
  // ?world=1, which the in-page "Enter Sanctuary" CTA sets. No env flag
  // gates this, so V2 is the default everywhere including PROD.
  //
  // Legacy deep links (?v=2, ?v=3) degrade gracefully to the same default.
  // The V1 surface (SanctuaryContent) and the V3 tile engine were removed in
  // the V2 consolidation; CompanionView still owns the wallet-gate +
  // companion picker internally (it renders <SanctuaryContent embedded /> for
  // the disconnected / no-companion states until that is extracted).
  if (world === '1') return <SanctuaryV2 />;
  return <CompanionView />;
}

export default function SanctuaryRouter() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <span className="text-[#00f7ff] font-['Press_Start_2P'] text-xs animate-pulse">
          Loading Sanctuary...
        </span>
      </div>
    }>
      <SanctuarySwitch />
    </Suspense>
  );
}
