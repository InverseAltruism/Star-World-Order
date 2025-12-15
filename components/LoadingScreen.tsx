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
  PROGRESS_INCREMENT: 3,       // Percentage increase per tick
  INTERVAL_MS: 70,             // Milliseconds between ticks
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
  background: 'linear-gradient(180deg, #0a0a1a 0%, #12122a 50%, #0f0f23 100%)',
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
      aria-label="Cozy retro gaming setup"
    >
      {/* Room background with subtle glow */}
      <div className="swo-room-bg" />
      
      {/* Ambient stars in the background */}
      <div className="swo-ambient-stars" />
      
      {/* CRT scanlines overlay */}
      <div className="swo-scanlines" />
      
      {/* ===== COZY ROOM AMBIANCE ELEMENTS ===== */}
      <div className={`swo-cozy-ambient ${isZoomingOrBeyond ? 'swo-element-hidden' : ''}`} aria-hidden="true">
        {/* Floating dust particles in the light */}
        <div className="swo-dust-particles">
          <span className="swo-dust" style={{ left: '15%', animationDelay: '0s' }} />
          <span className="swo-dust" style={{ left: '25%', animationDelay: '2s' }} />
          <span className="swo-dust" style={{ left: '35%', animationDelay: '1s' }} />
          <span className="swo-dust" style={{ left: '45%', animationDelay: '3s' }} />
          <span className="swo-dust" style={{ left: '55%', animationDelay: '0.5s' }} />
          <span className="swo-dust" style={{ left: '65%', animationDelay: '2.5s' }} />
          <span className="swo-dust" style={{ left: '75%', animationDelay: '1.5s' }} />
          <span className="swo-dust" style={{ left: '85%', animationDelay: '3.5s' }} />
        </div>
      </div>
      
      {/* ===== COZY GAMING DESK SETUP ===== */}
      <div className={`swo-gaming-setup ${isZoomingOrBeyond ? 'swo-setup-zooming' : ''}`}>
        <div className={`swo-rug ${isZoomingOrBeyond ? 'swo-element-hidden' : ''}`} aria-hidden="true" />
        
        {/* Main scene container that zooms into the TV screen */}
        <div className={`swo-scene ${isZoomingOrBeyond ? 'zoomed' : ''}`}>
          
          {/* The CRT TV/Monitor - sits on top */}
          <div className={`swo-tv ${phase !== 'waiting' && phase !== 'inserting' ? 'on' : ''}`}>
            <div className="swo-tv-body">
              {/* TV Screen */}
              <div className="swo-tv-screen">
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
                  
                  {/* Title - mysterious style */}
                  <h1 className="swo-loading-title">
                    <span className="swo-title-star">⭐</span> STAR WORLD ORDER
                  </h1>
                  <p className="swo-loading-subtitle">✦ chosen by the stars ✦</p>
                  
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
                  
                  <p className="swo-game-text">the order is forming...</p>
                </div>
                
                {/* CRT screen effect */}
                <div className="swo-screen-crt" />
              </div>
              
              {/* TV Controls/Details */}
              <div className="swo-tv-controls">
                <div className="swo-tv-brand">STAR-64</div>
                <div className={`swo-tv-led ${phase !== 'waiting' && phase !== 'inserting' ? 'on' : ''}`} />
              </div>
            </div>
            
            {/* TV Stand */}
            <div className="swo-tv-stand" />
          </div>
          
          {/* The N64-style Console - sits below TV, on the desk */}
          <div className="swo-n64-console">
            {/* Console top with cartridge slot */}
            <div className="swo-n64-top">
              <div className="swo-n64-slot">
                <div className="swo-n64-slot-inner" />
              </div>
              {/* Console ridges/vents on left side */}
              <div className="swo-n64-ridges">
                <div className="swo-n64-ridge" />
                <div className="swo-n64-ridge" />
                <div className="swo-n64-ridge" />
              </div>
            </div>
            
            {/* Console body */}
            <div className="swo-n64-body">
              {/* Power button */}
              <div className={`swo-n64-power ${phase !== 'waiting' && phase !== 'inserting' ? 'on' : ''}`}>
                <span>POWER</span>
              </div>
              {/* Reset button */}
              <div className="swo-n64-reset">
                <span>RESET</span>
              </div>
              {/* N64 Logo area */}
              <div className="swo-n64-logo">
                <span className="swo-n64-star">★</span>
                <span>64</span>
              </div>
            </div>
            
            {/* Controller ports */}
            <div className="swo-n64-ports">
              <div className="swo-n64-port" />
              <div className="swo-n64-port" />
            </div>
            
            {/* The Cartridge - hovers above console slot until clicked */}
            <div 
              className={`swo-cartridge-wrapper ${phase}`}
              onClick={phase === 'waiting' ? handleInsertCartridge : undefined}
              onKeyDown={(e) => e.key === 'Enter' && phase === 'waiting' && handleInsertCartridge()}
              role={phase === 'waiting' ? 'button' : undefined}
              tabIndex={phase === 'waiting' ? 0 : -1}
              aria-label={phase === 'waiting' ? 'Click to insert cartridge' : undefined}
            >
              <div className="swo-cartridge">
                {/* Cartridge grip/top with ridges */}
                <div className="swo-cartridge-grip">
                  <div className="swo-cartridge-ridges">
                    <div className="swo-cart-ridge" />
                    <div className="swo-cart-ridge" />
                    <div className="swo-cart-ridge" />
                  </div>
                </div>
                {/* Cartridge label - SWO branding with star */}
                <div className="swo-cartridge-label">
                  <div className="swo-cartridge-star">★</div>
                  <div className="swo-cartridge-text">
                    <span>SWO</span>
                  </div>
                </div>
                {/* Cartridge bottom/connector pins */}
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
        </div>
        
        {/* The Wooden Desk - hidden during zoom */}
        <div className={`swo-desk ${isZoomingOrBeyond ? 'swo-element-hidden' : ''}`}>
          <div className="swo-desk-top" />
          <div className="swo-desk-front" />
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
          <p>✦ INSERT THE CARTRIDGE ✦ the stars are calling ✦</p>
        </div>
      )}
    </div>
  );
}
