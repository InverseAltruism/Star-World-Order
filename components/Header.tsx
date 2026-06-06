'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import WalletConnect from './WalletConnect';
import { isProdMode } from '@/lib/config';
import { DesktopNav, MobileNav } from './SiteNav';

export default function Header() {
  // Resolve env mode on the client only to avoid SSR/client hydration mismatch.
  const [isProduction, setIsProduction] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setIsProduction(isProdMode()), []);

  return (
    <header className="sticky top-0 z-50 bg-[#0d0d1a]/95 backdrop-blur-sm smooth-transition">
      <div className="h-1 bg-gradient-to-r from-[#9966ff] via-[#ffd700] to-[#9966ff]" />

      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 smooth-transition hover:opacity-90 hover:scale-105 flex-shrink-0">
          <Image
            src="/SWO_Star.png"
            alt="Star World Order logo"
            width={32}
            height={32}
            className="animate-pixel-float hover-lift"
            style={{ filter: 'drop-shadow(0 0 8px rgba(255, 215, 0, 0.6))' }}
          />
          <div className="flex flex-col leading-tight">
            <span className="text-[#ffd700] text-sm tracking-wider pixel-glow-gold" style={{ fontFamily: 'var(--font-display)' }}>
              SWO
            </span>
            <span className="text-[#9966ff] text-[10px] hidden sm:block tracking-wide">STAR WORLD ORDER</span>
          </div>
        </Link>

        {/* Desktop grouped dropdown nav + wallet */}
        <div className="hidden md:flex items-center gap-3">
          <DesktopNav isProd={isProduction} />
          <WalletConnect />
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="md:hidden flex flex-col gap-1 p-2 z-50"
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
        >
          <span className={`block w-6 h-0.5 bg-[#ffd700] transition-all ${mobileOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
          <span className={`block w-6 h-0.5 bg-[#ffd700] transition-all ${mobileOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-6 h-0.5 bg-[#ffd700] transition-all ${mobileOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
        </button>

        {/* Mobile sheet — z above the CRT overlays (9997/9998) */}
        <div
          className={`md:hidden fixed left-0 right-0 top-[60px] h-[calc(100vh-60px)] z-[9999] transition-all duration-300 overflow-y-auto ${
            mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          style={{ backgroundColor: '#0d0d1a' }}
        >
          <div className="absolute inset-0 border-t-4 border-[#9966ff] pointer-events-none" />
          <div className="flex flex-col items-center gap-2 p-6 pb-safe relative">
            <MobileNav isProd={isProduction} onNavigate={() => setMobileOpen(false)} />
            <div className="pt-4 mt-2 border-t-2 border-[#9966ff] w-full max-w-[360px] flex justify-center">
              <WalletConnect />
            </div>
          </div>
        </div>
      </div>

      <div className="h-[2px] bg-[#2a2a4e]" />
    </header>
  );
}
