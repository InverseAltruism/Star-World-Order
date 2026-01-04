'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import WalletConnect from './WalletConnect';
// Demo Mode is disabled for now - keeping imports for future use
// import DemoMode from './DemoMode';
import NotificationBell from './NotificationBell';
import { isProdMode } from '@/lib/config';

export default function Header() {
  const isProduction = isProdMode();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-[#0d0d1a]/95 backdrop-blur-sm smooth-transition">
      {/* Top pixel border */}
      <div className="h-1 bg-gradient-to-r from-[#9966ff] via-[#ffd700] to-[#9966ff]" />
      
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 smooth-transition hover:opacity-90 hover:scale-105 flex-shrink-0">
          <div className="relative">
            <Image 
              src="/SWO_Star.png" 
              alt="Star World Order logo" 
              width={32} 
              height={32} 
              className="animate-pixel-float hover-lift smooth-transition"
              style={{ filter: 'drop-shadow(0 0 8px rgba(255, 215, 0, 0.6))' }}
            />
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

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden flex flex-col gap-1 p-2 z-50"
          aria-label="Toggle mobile menu"
        >
          <span className={`block w-6 h-0.5 bg-[#ffd700] transition-all ${mobileMenuOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
          <span className={`block w-6 h-0.5 bg-[#ffd700] transition-all ${mobileMenuOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-6 h-0.5 bg-[#ffd700] transition-all ${mobileMenuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
        </button>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-2 md:gap-3">
          {/* DAO link - always visible */}
          <Link 
            href="/dao" 
            className="text-[10px] text-gray-300 hover:text-[#ffd700] uppercase tracking-wider relative group flex-shrink-0"
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
            href="/gallery" 
            className="text-[10px] text-gray-300 hover:text-[#9966ff] uppercase tracking-wider relative group flex-shrink-0"
            style={{ 
              transition: 'color 0.3s ease',
              willChange: 'color'
            }}
          >
            GALLERY
            <span 
              className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#9966ff] group-hover:w-full" 
              style={{ 
                transition: 'width 0.3s ease',
                willChange: 'width'
              }}
            />
          </Link>
          <Link 
            href="/hangout" 
            className="text-[10px] text-gray-300 hover:text-[#44ff88] uppercase tracking-wider relative group flex-shrink-0"
            style={{ 
              transition: 'color 0.3s ease',
              willChange: 'color'
            }}
          >
            HANGOUT
            <span 
              className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#44ff88] group-hover:w-full" 
              style={{ 
                transition: 'width 0.3s ease',
                willChange: 'width'
              }}
            />
          </Link>
          <Link 
            href="/raffle" 
            className="text-[10px] text-gray-300 hover:text-[#ff6ec7] uppercase tracking-wider relative group flex-shrink-0"
            style={{ 
              transition: 'color 0.3s ease',
              willChange: 'color'
            }}
          >
            RAFFLE
            <span 
              className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#ff6ec7] group-hover:w-full" 
              style={{ 
                transition: 'width 0.3s ease',
                willChange: 'width'
              }}
            />
          </Link>
          <Link 
            href="/profile" 
            className="text-[10px] text-gray-300 hover:text-[#ffd700] uppercase tracking-wider hidden sm:block relative group flex-shrink-0"
            style={{ 
              transition: 'color 0.3s ease',
              willChange: 'color'
            }}
          >
            PROFILE
            <span 
              className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#ffd700] group-hover:w-full" 
              style={{ 
                transition: 'width 0.3s ease',
                willChange: 'width'
              }}
            />
          </Link>
          {/* Exchange link - hidden on PROD, shown on DEV */}
          {!isProduction && (
            <Link 
              href="/marketplace" 
              className="text-[10px] text-gray-300 hover:text-[#ff00ff] uppercase tracking-wider hidden md:block relative group flex-shrink-0"
              style={{ 
                transition: 'color 0.3s ease',
                willChange: 'color'
              }}
            >
              EXCHANGE
              <span 
                className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#ff00ff] group-hover:w-full" 
                style={{ 
                  transition: 'width 0.3s ease',
                  willChange: 'width'
                }}
              />
            </Link>
          )}
          {/* Wallet Connect with integrated Notification Bell */}
          <div className="flex-shrink-0">
            <WalletConnect />
          </div>
        </nav>

        {/* Mobile Navigation Menu - z-index must be above body::after (9997) and body::before (9998) overlays */}
        <div 
          className={`md:hidden fixed left-0 right-0 top-[57px] h-[calc(100vh-57px)] z-[9999] transition-all duration-300 overflow-y-auto ${mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          style={{ backgroundColor: '#0d0d1a' }}
        >
          {/* Neon border effect for visibility */}
          <div className="absolute inset-0 border-t-4 border-[#9966ff] pointer-events-none" />
          
          <nav className="flex flex-col items-center gap-4 p-6 pb-safe relative">
            {/* DAO link - always visible */}
            <Link 
              href="/dao" 
              className="text-sm text-white hover:text-[#ffd700] uppercase tracking-wider font-semibold transition-all hover:scale-105 py-2 px-4"
              style={{ textShadow: '0 0 10px rgba(255, 215, 0, 0.5)' }}
              onClick={() => setMobileMenuOpen(false)}
            >
              DAO
            </Link>
            <Link 
              href="/gallery" 
              className="text-sm text-white hover:text-[#9966ff] uppercase tracking-wider font-semibold transition-all hover:scale-105 py-2 px-4"
              style={{ textShadow: '0 0 10px rgba(153, 102, 255, 0.5)' }}
              onClick={() => setMobileMenuOpen(false)}
            >
              GALLERY
            </Link>
            <Link 
              href="/hangout" 
              className="text-sm text-white hover:text-[#44ff88] uppercase tracking-wider font-semibold transition-all hover:scale-105 py-2 px-4"
              style={{ textShadow: '0 0 10px rgba(68, 255, 136, 0.5)' }}
              onClick={() => setMobileMenuOpen(false)}
            >
              HANGOUT
            </Link>
            <Link 
              href="/raffle" 
              className="text-sm text-white hover:text-[#ff6ec7] uppercase tracking-wider font-semibold transition-all hover:scale-105 py-2 px-4"
              style={{ textShadow: '0 0 10px rgba(255, 110, 199, 0.5)' }}
              onClick={() => setMobileMenuOpen(false)}
            >
              RAFFLE
            </Link>
            <Link 
              href="/profile" 
              className="text-sm text-white hover:text-[#ffd700] uppercase tracking-wider font-semibold transition-all hover:scale-105 py-2 px-4"
              style={{ textShadow: '0 0 10px rgba(255, 215, 0, 0.5)' }}
              onClick={() => setMobileMenuOpen(false)}
            >
              PROFILE
            </Link>
            {/* Exchange link - hidden on PROD, shown on DEV */}
            {!isProduction && (
              <Link 
                href="/marketplace" 
                className="text-sm text-white hover:text-[#ff00ff] uppercase tracking-wider font-semibold transition-all hover:scale-105 py-2 px-4"
                style={{ textShadow: '0 0 10px rgba(255, 0, 255, 0.5)' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                EXCHANGE
              </Link>
            )}
            <div className="flex flex-col items-center gap-3 pt-4 border-t-2 border-[#9966ff] w-full max-w-xs" style={{ boxShadow: '0 -2px 15px rgba(153, 102, 255, 0.2)' }}>
              <a 
                href="https://docs.google.com/forms/d/e/1FAIpQLSc9n6RI4pVW4REBiw2FG2EFiJydNwshS6KgxcAXWEu00IAp3A/viewform?usp=dialog"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white hover:text-[#ffd700] uppercase tracking-wider font-semibold transition-all hover:scale-105 py-2 flex items-center gap-2"
                style={{ textShadow: '0 0 10px rgba(255, 215, 0, 0.5)' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                📝 FEEDBACK / BUGS
              </a>
            </div>
          </nav>
        </div>
      </div>
      
      {/* Bottom pixel border */}
      <div className="h-[2px] bg-[#2a2a4e]" />
    </header>
  );
}
