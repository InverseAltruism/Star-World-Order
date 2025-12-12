'use client';

import AccessGate from '@/components/AccessGate';

export default function MarketplaceContent() {
  return (
    <>
      {/* Page Header */}
      <div className="text-center mb-8 animate-slide-in-up">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="text-2xl animate-pixel-float hover-lift smooth-transition">🔄</span>
          <h1 className="text-lg md:text-xl text-[#ffd700] pixel-glow-gold tracking-wider">
            COSMIC EXCHANGE
          </h1>
          <span className="text-2xl animate-pixel-float hover-lift smooth-transition" style={{ animationDelay: '0.5s' }}>⭐</span>
        </div>
        <p className="text-[#9966ff] text-[10px] tracking-wide animate-glow-pulse">
          ✦ OTC MARKETPLACE FOR STAR SKRUMPEYS ✦
        </p>
      </div>

      {/* Access-gated content */}
      <AccessGate
        title="MARKETPLACE LOCKED"
        message="Only Star Skrumpey holders may access the Cosmic Exchange."
      >
        {/* Coming Soon Content */}
        <div className="max-w-2xl mx-auto">
          <div className="pixel-card p-8 text-center animate-slide-in-up animate-delay-1">
            {/* Construction Icon */}
            <div className="relative mb-6">
              <div className="text-6xl mb-4 animate-pixel-float hover-lift smooth-transition">🚀</div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-[#9966ff]/20 blur-xl animate-pulse" />
              </div>
            </div>
            
            {/* Status */}
            <div className="inline-block px-4 py-2 bg-[#ffd700]/20 border-2 border-[#ffd700]/50 rounded-lg mb-6">
              <p className="text-[#ffd700] text-xs tracking-wider animate-pixel-pulse">
                ⚡ PHASE 2 ⚡
              </p>
            </div>
            
            {/* Title */}
            <h2 className="text-[#ff00ff] text-sm md:text-base mb-4 tracking-wider">
              COMING SOON™
            </h2>
            
            {/* Description */}
            <p className="text-gray-400 text-[10px] mb-8 leading-relaxed max-w-md mx-auto">
              The Cosmic Exchange will enable peer-to-peer trading of Star Skrumpeys. 
              Create listings, make offers, and trade amongst the stars in our OTC marketplace.
            </p>
            
            {/* Feature Preview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              {[
                { icon: '📋', label: 'CREATE LISTINGS', desc: 'List your Star Skrumpeys for sale' },
                { icon: '💰', label: 'MAKE OFFERS', desc: 'Bid on other listings' },
                { icon: '🤝', label: 'SECURE TRADES', desc: 'Trustless escrow system' },
              ].map((feature, i) => (
                <div key={i} className={`bg-[#0a0a15] p-4 rounded-lg border border-[#2a2a4e] smooth-transition hover-lift animate-slide-in-up animate-delay-${i + 2}`}>
                  <div className="text-2xl mb-2 animate-pixel-float" style={{ animationDelay: `${i * 0.2}s` }}>{feature.icon}</div>
                  <p className="text-[#ffd700] text-[8px] mb-1">{feature.label}</p>
                  <p className="text-gray-500 text-[6px]">{feature.desc}</p>
                </div>
              ))}
            </div>
            
            {/* Notify Me Button */}
            <div className="space-y-3 animate-slide-in-up animate-delay-5">
              <p className="text-gray-500 text-[8px]">
                Want to be notified when the exchange launches?
              </p>
              <a 
                href="https://twitter.com/skrumpeys" 
                target="_blank" 
                rel="noopener noreferrer"
                className="pixel-btn pixel-btn-gold text-[8px] inline-block smooth-transition hover-lift"
              >
                FOLLOW @SKRUMPEYS
              </a>
            </div>
            
            {/* Progress */}
            <div className="mt-8 pt-6 border-t-2 border-[#2a2a4e]">
              <p className="text-[#9966ff] text-[8px] mb-2">DEVELOPMENT PROGRESS</p>
              <div className="w-full h-3 bg-[#1a1a2e] rounded overflow-hidden border border-[#333]">
                <div 
                  className="h-full bg-gradient-to-r from-[#9966ff] to-[#ffd700] transition-all duration-1000"
                  style={{ width: '15%' }}
                />
              </div>
              <p className="text-gray-600 text-[6px] mt-2">
                📐 Design Phase - 15% Complete
              </p>
            </div>
          </div>
          
          {/* Roadmap Preview */}
          <div className="pixel-card p-6 mt-6 animate-slide-in-up animate-delay-6">
            <h3 className="text-[#ffd700] text-xs tracking-wider mb-4 text-center animate-glow-pulse">
              ★ MARKETPLACE ROADMAP ★
            </h3>
            <div className="space-y-3">
              {[
                { phase: 'Phase 2.1', title: 'Core Infrastructure', status: 'in-progress' },
                { phase: 'Phase 2.2', title: 'Listing & Bidding UI', status: 'upcoming' },
                { phase: 'Phase 2.3', title: 'Escrow Smart Contracts', status: 'upcoming' },
                { phase: 'Phase 2.4', title: 'Beta Launch', status: 'upcoming' },
              ].map((item, i) => (
                <div key={i} className={`flex items-center gap-3 smooth-transition hover-lift animate-slide-in-left animate-delay-${i + 1}`}>
                  <div className={`w-3 h-3 rounded-full ${
                    item.status === 'in-progress' ? 'bg-[#ffd700] animate-pulse' :
                    item.status === 'complete' ? 'bg-[#44ff88]' :
                    'bg-[#333]'
                  }`} />
                  <div className="flex-1">
                    <span className="text-[#9966ff] text-[8px]">{item.phase}</span>
                    <span className="text-gray-400 text-[8px] ml-2">{item.title}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AccessGate>
    </>
  );
}
