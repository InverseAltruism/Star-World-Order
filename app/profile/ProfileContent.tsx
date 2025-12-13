'use client';

import AccessGate from '@/components/AccessGate';
import ProfileCard from '@/components/ProfileCard';

export default function ProfileContent() {
  return (
    <>
      {/* Page Header */}
      <div className="text-center mb-8">
        <h1 className="text-lg md:text-xl text-[#ffd700] pixel-glow-gold tracking-wider mb-2">
          PROFILE
        </h1>
        <p className="text-[#9966ff] text-sm tracking-wide">
          Your Star identity
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
