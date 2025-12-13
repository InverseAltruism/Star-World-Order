'use client';

import Link from 'next/link';
import WalletConnect from './WalletConnect';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-[#0d0d1a]/95 backdrop-blur-sm smooth-transition">
      {/* Top pixel border */}
      <div className="h-1 bg-gradient-to-r from-[#9966ff] via-[#ffd700] to-[#9966ff]" />
      
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 smooth-transition hover:opacity-90 hover:scale-105">
          <div className="relative">
            <span className="text-2xl animate-pixel-float inline-block hover-lift smooth-transition">⭐</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[#ffd700] text-sm tracking-wider pixel-glow-gold">
              SWO
            </span>
            <span className="text-[#9966ff] text-[10px] hidden sm:block tracking-wide">
              STAR WORLD ORDER
            </span>
          </div>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-3 md:gap-5">
          <Link 
            href="/dao" 
            className="text-[14px] text-gray-300 hover:text-[#ffd700] uppercase tracking-wider relative group"
            style={{ 
              transition: 'color 0.3s ease',
              willChange: 'color'
            }}
          >
            DAO
            <span 
              className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#ffd700] group-hover:w-full" 
              style={{ 
                transition: 'width 0.3s ease',
                willChange: 'width'
              }}
            />
          </Link>
          <Link 
            href="/hangout" 
            className="text-[14px] text-gray-300 hover:text-[#44ff88] uppercase tracking-wider relative group"
            style={{ 
              transition: 'color 0.3s ease',
              willChange: 'color'
            }}
          >
            Hangout
            <span 
              className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#44ff88] group-hover:w-full" 
              style={{ 
                transition: 'width 0.3s ease',
                willChange: 'width'
              }}
            />
          </Link>
          <Link 
            href="/profile" 
            className="text-[14px] text-gray-300 hover:text-[#ffd700] uppercase tracking-wider hidden sm:block relative group"
            style={{ 
              transition: 'color 0.3s ease',
              willChange: 'color'
            }}
          >
            Profile
            <span 
              className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#ffd700] group-hover:w-full" 
              style={{ 
                transition: 'width 0.3s ease',
                willChange: 'width'
              }}
            />
          </Link>
          <Link 
            href="/marketplace" 
            className="text-[14px] text-gray-300 hover:text-[#ff00ff] uppercase tracking-wider hidden md:block relative group"
            style={{ 
              transition: 'color 0.3s ease',
              willChange: 'color'
            }}
          >
            Exchange
            <span 
              className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#ff00ff] group-hover:w-full" 
              style={{ 
                transition: 'width 0.3s ease',
                willChange: 'width'
              }}
            />
          </Link>
          <WalletConnect />
        </nav>
      </div>
      
      {/* Bottom pixel border */}
      <div className="h-[2px] bg-[#2a2a4e]" />
    </header>
  );
}
