'use client';

import { useEffect, useState } from 'react';
import EventBus from '@/components/sanctuary/EventBus';

interface LevelUpPayload {
  tokenId: number;
  levelBefore: number;
  levelAfter: number;
}

export default function LevelUpCelebration() {
  const [payload, setPayload] = useState<LevelUpPayload | null>(null);
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');

  useEffect(() => {
    const onLevelUp = (data: LevelUpPayload) => {
      setPayload(data);
      setPhase('enter');
    };
    EventBus.on('companion-level-up', onLevelUp);
    return () => {
      EventBus.off('companion-level-up', onLevelUp);
    };
  }, []);

  useEffect(() => {
    if (!payload) return;
    const t1 = setTimeout(() => setPhase('hold'), 50);
    const t2 = setTimeout(() => setPhase('exit'), 2200);
    const t3 = setTimeout(() => setPayload(null), 2800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [payload]);

  if (!payload) return null;

  const active = phase === 'enter' || phase === 'hold';
  const scale = phase === 'enter' ? 'scale-50' : phase === 'exit' ? 'scale-125' : 'scale-100';
  const opacity = active ? 'opacity-100' : 'opacity-0';

  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
      <div
        className={`transition-all duration-500 ease-out ${scale} ${opacity}`}
        role="status"
        aria-live="polite"
      >
        <div className="relative">
          <div className="absolute inset-0 rounded-full blur-3xl bg-[#ffd700]/40 animate-pulse" />
          <div className="relative bg-black/90 border-2 border-[#ffd700] rounded-lg px-6 py-5 shadow-[0_0_40px_rgba(255,215,0,0.6)] text-center">
            <div className="text-3xl mb-1">✨🏆✨</div>
            <div className="text-[#ffd700] font-['Press_Start_2P'] text-[10px] uppercase tracking-widest mb-1">
              Level Up!
            </div>
            <div className="text-white font-['Press_Start_2P'] text-[14px]">
              T{payload.levelBefore} → T{payload.levelAfter}
            </div>
            <div className="text-[#ffd700]/80 text-[7px] mt-2 font-['Press_Start_2P'] uppercase">
              Skrumpey #{payload.tokenId}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
