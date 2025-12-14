'use client';

import { useDAOAccess } from '@/lib/hooks/useDAOAccess';
import WalletConnect from './WalletConnect';
import DemoMode from './DemoMode';
import { useDemoMode } from '@/lib/contexts/DemoModeContext';

interface AccessGateProps {
  children: React.ReactNode;
  /** Optional custom title for the locked screen */
  title?: string;
  /** Optional custom message for the locked screen */
  message?: string;
}

/**
 * Access Gate Component
 * Wraps protected content and only shows it to Star Skrumpey holders.
 * Non-holders see a fun, retro game-style "locked" screen.
 */
export default function AccessGate({ 
  children, 
  title = 'ACCESS RESTRICTED',
  message = 'Only Star Skrumpey holders may enter this realm.'
}: AccessGateProps) {
  const { hasAccess, isLoading, isConnected } = useDAOAccess();
  const { isDemoMode } = useDemoMode();
  
  /**
   * Development Mode Access Bypass
   * 
   * When enabled, this allows viewing all protected pages without:
   * - Connecting a wallet
   * - Holding a Star Skrumpey NFT
   * 
   * HOW TO ENABLE DEV MODE:
   * 1. Copy .env.example to .env.local
   * 2. Add or uncomment: NEXT_PUBLIC_DEV_ACCESS_ENABLED=true
   * 3. Restart the dev server (npm run dev)
   * 
   * IMPORTANT: This only works when NODE_ENV=development (npm run dev)
   * Production builds (npm run build && npm start) ignore this setting
   */
  const devModeActive = process.env.NODE_ENV === 'development' && 
    process.env.NEXT_PUBLIC_DEV_ACCESS_ENABLED === 'true';

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="pixel-card p-8 text-center max-w-md animate-slide-in-up">
          <div className="text-4xl mb-4 animate-pixel-float hover-lift smooth-transition">⭐</div>
          <p className="text-[#ffd700] text-xs tracking-wide animate-pixel-pulse animate-glow-pulse">
            VERIFYING STAR STATUS...
          </p>
          <div className="mt-4 w-32 h-2 bg-[#1a1a2e] mx-auto overflow-hidden border border-[#333]">
            <div className="h-full bg-gradient-to-r from-[#9966ff] to-[#ffd700] animate-pulse" 
                 style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    );
  }

  // Show locked screen for non-holders or disconnected wallets
  // EXCEPTION: In dev mode with NEXT_PUBLIC_DEV_ACCESS_ENABLED=true, bypass all access checks
  // This allows developers to view and test all pages without needing a wallet or NFT
  if ((!isConnected || !hasAccess) && !devModeActive) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="pixel-card p-8 text-center max-w-lg relative overflow-hidden animate-slide-in-up">
          {/* Scanline effect */}
          <div className="absolute inset-0 bg-repeating-linear-gradient pointer-events-none opacity-10"
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
          
          {/* Title with pixel styling */}
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
            <span className="text-[#ffd700] text-lg animate-pixel-float animate-star-rotate">⭐</span>
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
                <span className="text-gray-400 text-[8px]">
                  Acquire a Skrumpey NFT with the <span className="text-[#ffd700]">★ STAR trait</span>
                </span>
              </div>
              <div className="flex items-start gap-2 animate-slide-in-left animate-delay-3 smooth-transition hover-lift">
                <span className="text-[#44ff88] text-xs">3.</span>
                <span className="text-gray-400 text-[8px]">
                  Return here and the stars will welcome you
                </span>
              </div>
            </div>
          </div>
          
          {/* Connect wallet CTA */}
          {!isConnected ? (
            <div className="space-y-3 animate-slide-in-up animate-delay-5">
              <p className="text-[#9966ff] text-[8px] tracking-wide animate-glow-pulse">
                ✦ CONNECT THY WALLET ✦
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <WalletConnect />
                <DemoMode className="pixel-btn text-xs !px-4 !py-2" />
              </div>
            </div>
          ) : (
            <div className="space-y-3 animate-slide-in-up animate-delay-5">
              <p className="text-[#9966ff] text-[8px] tracking-wide animate-glow-pulse">
                ✦ NO STAR SKRUMPEY DETECTED ✦
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a 
                  href="https://twitter.com/skrumpeys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="pixel-btn text-[8px] inline-block smooth-transition hover-lift"
                >
                  FIND A STAR SKRUMPEY
                </a>
                <DemoMode className="pixel-btn text-xs !px-4 !py-2" />
              </div>
            </div>
          )}
          
          {/* Fun footer message */}
          <p className="text-gray-600 text-[6px] mt-6 tracking-wide">
            🐸 + ⭐ = ACCESS GRANTED
          </p>
        </div>
      </div>
    );
  }

  // User has access - show protected content
  return (
    <>
      {/* Dev Mode Indicator */}
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
      
      {/* Demo Mode Indicator */}
      {isDemoMode && (
        <div className="fixed top-20 right-4 z-[1000] pointer-events-none">
          <div className="pixel-card p-3 bg-[#ffd700]/20 border-[#ffd700] backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="text-[#ffd700] text-xl animate-pixel-pulse">🎮</span>
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
