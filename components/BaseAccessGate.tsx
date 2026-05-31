'use client';

import Image from 'next/image';
import WalletConnect from './WalletConnect';
import DemoMode from './DemoMode';
import { useDemoMode } from '@/lib/contexts/DemoModeContext';

/**
 * Presentational access-gate shell shared by AccessGate (Star-trait, DAO) and
 * SkrumpeyAccessGate (any Skrumpey, community). The access state is passed in by
 * the thin wrappers — they own the hook choice, since "holds a Star" and "holds
 * any Skrumpey" are different questions with different caching. Everything else
 * (loading screen, locked screen, dev/demo bypass + indicators) is identical and
 * lives here; only the cosmetic copy/imagery varies by `variant`.
 */

type Variant = 'star' | 'skrumpey';

const VARIANTS: Record<Variant, {
  loadingEmoji: string;
  loadingText: string;
  image: { src: string; alt: string; dropShadow: string };
  step2: React.ReactNode;
  step3: string;
  notDetected: string;
  findCta: string;
  grantedFooter: string;
}> = {
  star: {
    loadingEmoji: '⭐',
    loadingText: 'VERIFYING STAR STATUS...',
    image: { src: '/skr_str_mon2.png', alt: 'Star Skrumpey', dropShadow: 'drop-shadow(rgba(255, 215, 0, 0.25) 0px 0px 8px)' },
    step2: <>Acquire a Skrumpey NFT with the <span className="text-[#ffd700]">★ STAR trait</span></>,
    step3: 'Return here and the stars will welcome you',
    notDetected: '✦ NO STAR SKRUMPEY DETECTED ✦',
    findCta: 'FIND A STAR SKRUMPEY',
    grantedFooter: '🐸 + ⭐ = ACCESS GRANTED',
  },
  skrumpey: {
    loadingEmoji: '🐸',
    loadingText: 'VERIFYING SKRUMPEY STATUS...',
    image: { src: '/purple_skrumpey.png', alt: 'Purple Skrumpey frog mascot', dropShadow: 'drop-shadow(rgba(68, 255, 136, 0.5) 0px 0px 10px)' },
    step2: <>Acquire a <span className="text-[#ffd700]">Skrumpey NFT</span></>,
    step3: 'Return here and join the community!',
    notDetected: '✦ NO SKRUMPEY DETECTED ✦',
    findCta: 'FIND A SKRUMPEY',
    grantedFooter: '🐸 = ACCESS GRANTED',
  },
};

interface BaseAccessGateProps {
  children: React.ReactNode;
  variant: Variant;
  hasAccess: boolean;
  isLoading: boolean;
  isConnected: boolean;
  title?: string;
  message?: string;
}

export default function BaseAccessGate({
  children,
  variant,
  hasAccess,
  isLoading,
  isConnected,
  title = 'ACCESS RESTRICTED',
  message = 'Only Skrumpey holders may enter.',
}: BaseAccessGateProps) {
  const v = VARIANTS[variant];
  const { isDemoMode } = useDemoMode();

  /**
   * Development Mode Access Bypass — only honored when NODE_ENV=development and
   * NEXT_PUBLIC_DEV_ACCESS_ENABLED=true. Production builds ignore it. Lets devs
   * view protected pages without a wallet or NFT.
   */
  const devModeActive = process.env.NODE_ENV === 'development' &&
    process.env.NEXT_PUBLIC_DEV_ACCESS_ENABLED === 'true';

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="pixel-card p-8 text-center max-w-md animate-slide-in-up">
          <div className="text-4xl mb-4 animate-pixel-float hover-lift smooth-transition">{v.loadingEmoji}</div>
          <p className="text-[#ffd700] text-xs tracking-wide animate-pixel-pulse animate-glow-pulse">
            {v.loadingText}
          </p>
          <div className="mt-4 w-32 h-2 bg-[#1a1a2e] mx-auto overflow-hidden border border-[#333]">
            <div className="h-full bg-gradient-to-r from-[#9966ff] to-[#ffd700] animate-pulse"
                 style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    );
  }

  // Locked screen for non-holders / disconnected wallets (unless dev bypass)
  if ((!isConnected || !hasAccess) && !devModeActive) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="pixel-card p-8 text-center max-w-lg relative animate-slide-in-up !overflow-visible">
          {/* Scanline effect */}
          <div className="absolute inset-0 bg-repeating-linear-gradient pointer-events-none opacity-10 overflow-hidden rounded-lg"
               style={{
                 background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.1), rgba(0,0,0,0.1) 1px, transparent 1px, transparent 2px)'
               }} />

          {/* Lock icon with glow */}
          <div className="relative mb-6 animate-slide-in-up animate-delay-1">
            <div className="text-6xl mb-2 animate-pixel-pulse animate-pixel-shake hover-lift smooth-transition">🔒</div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-[#ff4466]/20 blur-xl animate-pulse" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-[#ff4466] text-sm md:text-base mb-4 tracking-wider pixel-glow-gold"
              style={{ textShadow: '0 0 10px #ff4466, 0 0 20px #ff446640' }}>
            ★ {title} ★
          </h2>

          {/* Message */}
          <p className="text-gray-400 text-[10px] md:text-xs mb-6 leading-relaxed">
            {message}
          </p>

          {/* Pixel art divider */}
          <div className="flex items-center justify-center gap-2 mb-6 animate-slide-in-up animate-delay-3">
            <div className="w-8 h-[2px] bg-gradient-to-r from-transparent to-[#9966ff]" />
            <Image
              src={v.image.src}
              alt={v.image.alt}
              width={64}
              height={64}
              className="w-8 h-8 sm:w-12 sm:h-12 md:w-16 md:h-16 animate-pixel-float hover-lift cursor-pointer smooth-transition -mt-2"
              style={{ filter: v.image.dropShadow }}
            />
            <div className="w-8 h-[2px] bg-gradient-to-l from-transparent to-[#9966ff]" />
          </div>

          {/* Instructions box */}
          <div className="bg-[#0a0a15] border-2 border-[#2a2a4e] p-4 mb-6 rounded-lg animate-slide-in-up animate-delay-4">
            <p className="text-[#ffd700] text-[10px] mb-3 tracking-wide animate-glow-pulse">
              ✦ HOW TO GAIN ACCESS ✦
            </p>
            <div className="text-left space-y-2">
              <div className="flex items-start gap-2 animate-slide-in-left animate-delay-1 smooth-transition hover-lift">
                <span className="text-[#44ff88] text-xs">1.</span>
                <span className="text-gray-400 text-[8px]">
                  Connect your wallet to the Monad network
                </span>
              </div>
              <div className="flex items-start gap-2 animate-slide-in-left animate-delay-2 smooth-transition hover-lift">
                <span className="text-[#44ff88] text-xs">2.</span>
                <span className="text-gray-400 text-[8px]">{v.step2}</span>
              </div>
              <div className="flex items-start gap-2 animate-slide-in-left animate-delay-3 smooth-transition hover-lift">
                <span className="text-[#44ff88] text-xs">3.</span>
                <span className="text-gray-400 text-[8px]">{v.step3}</span>
              </div>
            </div>
          </div>

          {/* Connect wallet CTA */}
          {!isConnected ? (
            <div className="space-y-3 animate-slide-in-up animate-delay-5">
              <p className="text-[#9966ff] text-[8px] tracking-wide animate-glow-pulse">
                ✦ CONNECT YOUR WALLET ✦
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <WalletConnect />
                <DemoMode className="pixel-btn text-xs !px-4 !py-2" />
              </div>
            </div>
          ) : (
            <div className="space-y-3 animate-slide-in-up animate-delay-5">
              <p className="text-[#9966ff] text-[8px] tracking-wide animate-glow-pulse">
                {v.notDetected}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href="https://twitter.com/skrumpeys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pixel-btn text-[8px] inline-block smooth-transition hover-lift"
                >
                  {v.findCta}
                </a>
                <DemoMode className="pixel-btn text-xs !px-4 !py-2" />
              </div>
            </div>
          )}

          {/* Fun footer message */}
          <p className="text-gray-600 text-[6px] mt-6 tracking-wide">
            {v.grantedFooter}
          </p>
        </div>
      </div>
    );
  }

  // User has access — show protected content + dev/demo indicators
  return (
    <>
      {devModeActive && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-in-right">
          <div className="pixel-card p-3 bg-[#ff4466]/20 border-[#ff4466] backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="text-[#ff4466] text-xl animate-pixel-pulse">🛠️</span>
              <div>
                <p className="text-[#ff4466] text-[10px] font-bold">DEV MODE ACTIVE</p>
                <p className="text-gray-400 text-[8px]">Access bypass enabled</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isDemoMode && (
        <div className="fixed top-20 right-4 z-[1000] pointer-events-none">
          <div className="pixel-card p-3 bg-[#ffd700]/20 border-[#ffd700] backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="text-[#ffd700] text-xl">🎮</span>
              <div>
                <p className="text-[#ffd700] text-[10px] font-bold">DEMO MODE</p>
                <p className="text-gray-400 text-[8px]">Read-only preview</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
