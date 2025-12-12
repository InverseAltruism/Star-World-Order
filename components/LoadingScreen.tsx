'use client';

import { useState, useEffect, CSSProperties } from 'react';

// Inline styles as fallback to ensure loading screen renders correctly
const loadingScreenStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  background: '#000',
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  overflow: 'hidden',
};

export default function LoadingScreen() {
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [phase, setPhase] = useState<'cartridge' | 'boot' | 'loading' | 'done'>('cartridge');
  const [showLoading, setShowLoading] = useState(true);

  useEffect(() => {
    // Check if user has already seen loading screen this session
    const hasSeenLoading = sessionStorage.getItem('swo-loading-seen');
    if (hasSeenLoading) {
      setShowLoading(false);
      return;
    }

    // Phase 1: Cartridge insertion animation (1.5s)
    const cartridgeTimer = setTimeout(() => {
      setPhase('boot');
    }, 1500);

    // Phase 2: Boot/screen click on (1s after cartridge)
    const bootTimer = setTimeout(() => {
      setPhase('loading');
    }, 2500);

    // Phase 3: Loading progress (incremental over 2s)
    const loadingInterval = setInterval(() => {
      setLoadingProgress((prev) => {
        if (prev >= 100) {
          clearInterval(loadingInterval);
          return 100;
        }
        return prev + 5;
      });
    }, 100);

    // Phase 4: Complete and fade out
    const doneTimer = setTimeout(() => {
      setPhase('done');
      sessionStorage.setItem('swo-loading-seen', 'true');
    }, 4500);

    // Final cleanup - hide loading screen
    const hideTimer = setTimeout(() => {
      setShowLoading(false);
    }, 5500);

    return () => {
      clearTimeout(cartridgeTimer);
      clearTimeout(bootTimer);
      clearTimeout(doneTimer);
      clearTimeout(hideTimer);
      clearInterval(loadingInterval);
    };
  }, []);

  // Skip loading screen
  const handleSkip = () => {
    sessionStorage.setItem('swo-loading-seen', 'true');
    setShowLoading(false);
  };

  if (!showLoading) {
    return null;
  }

  return (
    <div 
      className="swo-loading-screen"
      style={loadingScreenStyle}
      data-phase={phase}
      onClick={handleSkip}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleSkip()}
      aria-label="Loading screen - click to skip"
    >
      {/* CRT scanlines overlay */}
      <div className="swo-scanlines" />
      
      {/* Cartridge insertion phase */}
      <div className={`swo-cartridge-container ${phase === 'cartridge' ? 'inserting' : 'inserted'}`}>
        <div className="swo-cartridge">
          <div className="swo-cartridge-label">
            <span className="swo-cartridge-star">★</span>
            <span className="swo-cartridge-text">STAR</span>
            <span className="swo-cartridge-text">WORLD</span>
            <span className="swo-cartridge-text">ORDER</span>
          </div>
          <div className="swo-cartridge-bottom" />
        </div>
      </div>

      {/* Boot screen / Main content */}
      <div className={`swo-boot-screen ${phase !== 'cartridge' ? 'active' : ''}`}>
        {/* Screen flicker effect on boot */}
        <div className={`swo-screen-flicker ${phase === 'boot' ? 'flickering' : ''}`} />
        
        {/* Logo and loading content */}
        <div className={`swo-loading-content ${phase === 'loading' || phase === 'done' ? 'visible' : ''}`}>
          {/* Pixel star animation */}
          <div className="swo-pixel-star-container">
            <div className="swo-pixel-star" />
          </div>
          
          {/* Title */}
          <h1 className="swo-loading-title">
            <span className="swo-title-star">★</span> STAR WORLD ORDER
          </h1>
          <p className="swo-loading-subtitle">SKRUMPEY DAO ON MONAD</p>
          
          {/* Loading bar */}
          <div className="swo-loading-bar-container">
            <div className="swo-loading-bar">
              <div 
                className="swo-loading-bar-fill" 
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <span className="swo-loading-percentage">{loadingProgress}%</span>
          </div>
          
          <p className="swo-loading-hint">CLICK ANYWHERE TO SKIP</p>
        </div>
      </div>
    </div>
  );
}
