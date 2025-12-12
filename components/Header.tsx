'use client';

import WalletConnect from './WalletConnect';

export default function Header() {
  return (
    <header className="border-b border-gray-800 bg-black/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            ⭐ SWO
          </div>
          <span className="text-gray-400 text-sm hidden sm:block">Star World Order</span>
        </div>
        <nav className="flex items-center gap-6">
          <a href="#about" className="text-gray-300 hover:text-white transition-colors">
            About
          </a>
          <a href="#skrumpeys" className="text-gray-300 hover:text-white transition-colors">
            Skrumpeys
          </a>
          <WalletConnect />
        </nav>
      </div>
    </header>
  );
}
