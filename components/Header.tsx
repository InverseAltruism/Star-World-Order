'use client';

import Link from 'next/link';
import WalletConnect from './WalletConnect';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-[#0d0d1a]/95 backdrop-blur-sm">
      {/* Top pixel border */}
      <div className="h-1 bg-gradient-to-r from-[#9966ff] via-[#ffd700] to-[#9966ff]" />
      
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
          <div className="relative">
            <span className="text-2xl animate-pixel-float inline-block">⭐</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[#ffd700] text-xs tracking-wider pixel-glow-gold">
              SWO
            </span>
            <span className="text-[#9966ff] text-[8px] hidden sm:block tracking-wide">
              STAR WORLD ORDER
            </span>
          </div>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-3 md:gap-5">
          <Link 
            href="/dao" 
            className="text-[10px] text-gray-300 hover:text-[#ffd700] transition-colors uppercase tracking-wider"
          >
            DAO
          </Link>
          <Link 
            href="/profile" 
            className="text-[10px] text-gray-300 hover:text-[#ffd700] transition-colors uppercase tracking-wider hidden sm:block"
          >
            Profile
          </Link>
          <Link 
            href="/marketplace" 
            className="text-[10px] text-gray-300 hover:text-[#ff00ff] transition-colors uppercase tracking-wider hidden md:block"
          >
            Exchange
          </Link>
          <WalletConnect />
        </nav>
      </div>
      
      {/* Bottom pixel border */}
      <div className="h-[2px] bg-[#2a2a4e]" />
    </header>
  );
}
