'use client';

import AccessGate from '@/components/AccessGate';
import ProfileCard from '@/components/ProfileCard';

export default function ProfileContent() {
  return (
    <>
      {/* Page Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="text-2xl animate-pixel-float">⭐</span>
          <h1 className="text-lg md:text-xl text-[#ffd700] pixel-glow-gold tracking-wider">
            STAR PROFILE
          </h1>
          <span className="text-2xl animate-pixel-float" style={{ animationDelay: '0.5s' }}>⭐</span>
        </div>
        <p className="text-[#9966ff] text-[10px] tracking-wide">
          ✦ YOUR COSMIC IDENTITY ✦
        </p>
      </div>

      {/* Access-gated content */}
      <AccessGate
        title="PROFILE LOCKED"
        message="Connect your wallet and hold a Star Skrumpey to view your cosmic profile."
      >
        <ProfileCard />
      </AccessGate>
    </>
  );
}
