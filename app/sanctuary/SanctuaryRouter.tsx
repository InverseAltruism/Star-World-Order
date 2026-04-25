'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, lazy } from 'react';

const SanctuaryContent = lazy(() => import('./SanctuaryContent'));
const SanctuaryV2 = lazy(() => import('./SanctuaryV2'));
const SanctuaryV3 = lazy(() => import('./SanctuaryV3'));

function SanctuarySwitch() {
  const searchParams = useSearchParams();
  const v = searchParams.get('v');
  const v2Flag = process.env.NEXT_PUBLIC_SANCTUARY_V2 === 'true';

  if (v === '3') return <SanctuaryV3 />;
  if (v === '2' || v2Flag) return <SanctuaryV2 />;

  return <SanctuaryContent />;
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
