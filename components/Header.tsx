'use client';

import Link from 'next/link';
import { useState } from 'react';
import WalletConnect from './WalletConnect';
import DemoMode from './DemoMode';
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
          {isProduction ? (
            <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
              <span className="text-[10px] leading-none">🔒</span>
              <span 
                className="text-[10px] text-gray-600 uppercase tracking-wider cursor-not-allowed leading-none"
                title="Locked in production"
              >
                DAO
              </span>
            </div>
          ) : (
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
          )}
          <Link 
            href="/members" 
            className="text-[10px] text-gray-300 hover:text-[#00ffff] uppercase tracking-wider relative group flex-shrink-0"
            style={{ 
              transition: 'color 0.3s ease',
              willChange: 'color'
            }}
          >
            MEMBERS
            <span 
              className="absolute bottom-0 left-0 w-0 h-[2px] bg-[#00ffff] group-hover:w-full" 
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
          {isProduction ? (
            <div className="hidden md:flex flex-col items-center gap-0.5 flex-shrink-0">
              <span className="text-[10px] leading-none">🔒</span>
              <span 
                className="text-[10px] text-gray-600 uppercase tracking-wider cursor-not-allowed leading-none"
                title="Locked in production"
              >
                EXCHANGE
              </span>
            </div>
          ) : (
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
          <div className="flex-shrink-0">
            <DemoMode />
          </div>
          <div className="flex-shrink-0">
            <WalletConnect />
          </div>
        </nav>

        {/* Mobile Navigation Menu */}
        <div className={`md:hidden fixed inset-0 top-[61px] bg-[#0d0d1a]/98 backdrop-blur-sm z-40 transition-all duration-300 overflow-y-auto ${mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          <nav className="flex flex-col items-center gap-4 p-6 pb-safe">
            {isProduction ? (
              <div className="flex flex-col items-center gap-1">
                <span className="text-sm leading-none">🔒</span>
                <span 
                  className="text-xs text-gray-600 uppercase tracking-wider cursor-not-allowed"
                  title="Locked in production"
                >
                  DAO
                </span>
              </div>
            ) : (
              <Link 
                href="/dao" 
                className="text-sm text-gray-300 hover:text-[#ffd700] uppercase tracking-wider"
                onClick={() => setMobileMenuOpen(false)}
              >
                DAO
              </Link>
            )}
            <Link 
              href="/members" 
              className="text-sm text-gray-300 hover:text-[#00ffff] uppercase tracking-wider"
              onClick={() => setMobileMenuOpen(false)}
            >
              MEMBERS
            </Link>
            <Link 
              href="/hangout" 
              className="text-sm text-gray-300 hover:text-[#44ff88] uppercase tracking-wider"
              onClick={() => setMobileMenuOpen(false)}
            >
              HANGOUT
            </Link>
            <Link 
              href="/profile" 
              className="text-sm text-gray-300 hover:text-[#ffd700] uppercase tracking-wider"
              onClick={() => setMobileMenuOpen(false)}
            >
              PROFILE
            </Link>
            {isProduction ? (
              <div className="flex flex-col items-center gap-1">
                <span className="text-sm leading-none">🔒</span>
                <span 
                  className="text-xs text-gray-600 uppercase tracking-wider cursor-not-allowed"
                  title="Locked in production"
                >
                  EXCHANGE
                </span>
              </div>
            ) : (
              <Link 
                href="/marketplace" 
                className="text-sm text-gray-300 hover:text-[#ff00ff] uppercase tracking-wider"
                onClick={() => setMobileMenuOpen(false)}
              >
                EXCHANGE
              </Link>
            )}
            <div className="flex flex-col items-center gap-3 pt-4 border-t-2 border-[#2a2a4e] w-full max-w-xs">
              <div className="w-full flex justify-center">
                <DemoMode />
              </div>
              <div className="w-full flex justify-center">
                <WalletConnect />
              </div>
            </div>
          </nav>
        </div>
      </div>
      
      {/* Bottom pixel border */}
      <div className="h-[2px] bg-[#2a2a4e]" />
    </header>
  );
}
