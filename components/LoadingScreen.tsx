'use client';

import { useState, useEffect, useRef, CSSProperties } from 'react';

// ============================================
// Configuration Constants
// ============================================

// Animation timing (in milliseconds)
const ANIMATION_TIMING = {
  CARTRIDGE_INSERT_DURATION: 800,
  POWER_ON_DELAY: 1300,
  ZOOM_START_DELAY: 2100,
  BOOT_START_DELAY: 3600,
  LOADING_START_DELAY: 4100,
  DONE_DELAY: 6600,
  HIDE_DELAY: 7600,
} as const;

// Loading bar configuration
const LOADING_CONFIG = {
  PROGRESS_INCREMENT: 4,       // Percentage increase per tick
  INTERVAL_MS: 80,             // Milliseconds between ticks
} as const;

// Console hardware configuration
const CONSOLE_CONFIG = {
  VENT_COUNT: 8,               // Number of vent slots on console top
} as const;

// ============================================
// Helper Functions
// ============================================

// Safely access sessionStorage (SSR-safe)
const getSessionStorage = (key: string): string | null => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return sessionStorage.getItem(key);
    }
  } catch {
    // sessionStorage not available (SSR, privacy mode, etc.)
  }
  return null;
};

const setSessionStorage = (key: string, value: string): void => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.setItem(key, value);
    }
  } catch {
    // sessionStorage not available (SSR, privacy mode, etc.)
  }
};

// ============================================
// Component Styles
// ============================================

// Inline styles as fallback to ensure loading screen renders correctly
const loadingScreenStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  background: 'linear-gradient(135deg, #1a0a2e 0%, #0d0d1a 50%, #0a1628 100%)',
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
};

// ============================================
// Types
// ============================================

// Animation phases for the immersive experience
type Phase = 'waiting' | 'inserting' | 'inserted' | 'poweron' | 'zooming' | 'booting' | 'loading' | 'done';

export default function LoadingScreen() {
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [phase, setPhase] = useState<Phase>('waiting');
  const [showLoading, setShowLoading] = useState(true);
  const loadingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Check if user has already seen loading screen this session
    const hasSeenLoading = getSessionStorage('swo-loading-seen');
    if (hasSeenLoading) {
      setShowLoading(false);
      return;
    }
  }, []);

  // Handle cartridge insertion - triggers the full animation sequence
  const handleInsertCartridge = () => {
    if (phase !== 'waiting') return;
    
    setPhase('inserting');
    
    // Cartridge slides into slot
    setTimeout(() => setPhase('inserted'), ANIMATION_TIMING.CARTRIDGE_INSERT_DURATION);
    
    // Power on with screen flicker
    setTimeout(() => setPhase('poweron'), ANIMATION_TIMING.POWER_ON_DELAY);
    
    // Start zooming into the screen
    setTimeout(() => setPhase('zooming'), ANIMATION_TIMING.ZOOM_START_DELAY);
    
    // Boot sequence starts inside screen
    setTimeout(() => setPhase('booting'), ANIMATION_TIMING.BOOT_START_DELAY);
    
    // Loading progress bar starts filling
    setTimeout(() => {
      setPhase('loading');
      loadingIntervalRef.current = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev >= 100) {
            if (loadingIntervalRef.current) {
              clearInterval(loadingIntervalRef.current);
              loadingIntervalRef.current = null;
            }
            return 100;
          }
          return prev + LOADING_CONFIG.PROGRESS_INCREMENT;
        });
      }, LOADING_CONFIG.INTERVAL_MS);
    }, ANIMATION_TIMING.LOADING_START_DELAY);
    
    // Done - fade out
    setTimeout(() => {
      setPhase('done');
      setSessionStorage('swo-loading-seen', 'true');
    }, ANIMATION_TIMING.DONE_DELAY);
    
    // Hide loading screen completely
    setTimeout(() => setShowLoading(false), ANIMATION_TIMING.HIDE_DELAY);
  };

  // Skip loading screen
  const handleSkip = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (loadingIntervalRef.current) {
      clearInterval(loadingIntervalRef.current);
    }
    setSessionStorage('swo-loading-seen', 'true');
    setShowLoading(false);
  };

  useEffect(() => {
    return () => {
      if (loadingIntervalRef.current) {
        clearInterval(loadingIntervalRef.current);
      }
    };
  }, []);

  if (!showLoading) {
    return null;
  }

  const isZoomingOrBeyond = phase === 'zooming' || phase === 'booting' || phase === 'loading' || phase === 'done';
  const showGameContent = phase === 'booting' || phase === 'loading' || phase === 'done';

  return (
    <div 
      className="swo-loading-screen"
      style={loadingScreenStyle}
      data-phase={phase}
      role="application"
      aria-label="Nintendo-style loading experience"
    >
      {/* Ambient background effects */}
      <div className="swo-ambient-stars" />
      
      {/* CRT scanlines overlay */}
      <div className="swo-scanlines" />
      
      {/* Main scene container that zooms */}
      <div className={`swo-scene ${isZoomingOrBeyond ? 'zoomed' : ''}`}>
        
        {/* The Retro Console */}
        <div className="swo-console">
          {/* Console body */}
          <div className="swo-console-body">
            {/* Top vents */}
            <div className="swo-console-vents">
              {[...Array(CONSOLE_CONFIG.VENT_COUNT)].map((_, i) => (
                <div key={i} className="swo-vent-slot" />
              ))}
            </div>
            
            {/* Cartridge slot */}
            <div className="swo-cartridge-slot">
              <div className="swo-slot-inner" />
              <div className="swo-slot-label">GAME PAK</div>
            </div>
            
            {/* Power LED */}
            <div className={`swo-power-led ${phase !== 'waiting' && phase !== 'inserting' ? 'on' : ''}`} />
            
            {/* Console branding */}
            <div className="swo-console-brand">
              <span className="swo-brand-star">★</span>
              <span className="swo-brand-text">STAR-64</span>
            </div>
          </div>
          
          {/* The Screen/Monitor */}
          <div className={`swo-monitor ${phase !== 'waiting' && phase !== 'inserting' ? 'on' : ''}`}>
            <div className="swo-monitor-frame">
              <div className="swo-screen">
                {/* Screen off state */}
                <div className={`swo-screen-off ${phase === 'waiting' || phase === 'inserting' ? 'visible' : ''}`}>
                  <div className="swo-screen-reflection" />
                </div>
                
                {/* Screen power on flicker */}
                <div className={`swo-screen-poweron ${phase === 'poweron' ? 'active' : ''}`} />
                
                {/* Game content inside screen */}
                <div className={`swo-game-content ${showGameContent ? 'visible' : ''}`}>
                  {/* Pixel star logo */}
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
                  
                  <p className="swo-game-text">LOADING STAR WORLD...</p>
                </div>
                
                {/* CRT screen effect */}
                <div className="swo-screen-crt" />
              </div>
            </div>
            {/* Monitor stand */}
            <div className="swo-monitor-stand" />
            <div className="swo-monitor-base" />
          </div>
        </div>
        
        {/* The Cartridge - hovers above slot until clicked */}
        <div 
          className={`swo-cartridge-wrapper ${phase}`}
          onClick={phase === 'waiting' ? handleInsertCartridge : undefined}
          onKeyDown={(e) => e.key === 'Enter' && phase === 'waiting' && handleInsertCartridge()}
          role={phase === 'waiting' ? 'button' : undefined}
          tabIndex={phase === 'waiting' ? 0 : -1}
          aria-label={phase === 'waiting' ? 'Click to insert cartridge' : undefined}
        >
          <div className="swo-cartridge">
            <div className="swo-cartridge-top" />
            <div className="swo-cartridge-label">
              <div className="swo-cartridge-star">★</div>
              <div className="swo-cartridge-title">STAR</div>
              <div className="swo-cartridge-title">WORLD</div>
              <div className="swo-cartridge-title">ORDER</div>
            </div>
            <div className="swo-cartridge-bottom">
              <div className="swo-cartridge-pins" />
            </div>
          </div>
          
          {/* Prompt to insert */}
          {phase === 'waiting' && (
            <div className="swo-insert-prompt">
              <span className="swo-prompt-arrow">▼</span>
              <span className="swo-prompt-text">CLICK TO INSERT</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Skip button */}
      <button 
        className="swo-skip-btn"
        onClick={handleSkip}
        onKeyDown={(e) => e.key === 'Enter' && handleSkip(e)}
        aria-label="Skip loading animation"
      >
        SKIP ▸▸
      </button>
      
      {/* Instructions at bottom */}
      {phase === 'waiting' && (
        <div className="swo-instructions">
          <p>INSERT THE ★ CARTRIDGE TO BEGIN YOUR JOURNEY</p>
        </div>
      )}
    </div>
  );
}
