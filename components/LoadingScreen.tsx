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

// Pre-generated floating star positions for the room ambience
const FLOATING_STARS = [
  { left: '8%', top: '15%', size: 3, delay: '0s' },
  { left: '15%', top: '35%', size: 2, delay: '0.5s' },
  { left: '22%', top: '60%', size: 4, delay: '1s' },
  { left: '5%', top: '75%', size: 2, delay: '1.5s' },
  { left: '85%', top: '20%', size: 3, delay: '0.3s' },
  { left: '92%', top: '45%', size: 2, delay: '0.8s' },
  { left: '78%', top: '70%', size: 4, delay: '1.2s' },
  { left: '95%', top: '85%', size: 2, delay: '0.6s' },
];

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
      aria-label="Cozy gaming room experience"
    >
      {/* ===== COZY ROOM ENVIRONMENT ===== */}
      
      {/* Room background with warm gradient */}
      <div className="swo-room-bg" />
      
      {/* Floating ambient stars */}
      <div className="swo-floating-stars">
        {FLOATING_STARS.map((star, i) => (
          <div
            key={i}
            className="swo-float-star"
            style={{
              left: star.left,
              top: star.top,
              width: `${star.size}px`,
              height: `${star.size}px`,
              animationDelay: star.delay,
            }}
          />
        ))}
      </div>
      
      {/* CRT scanlines overlay */}
      <div className="swo-scanlines" />
      
      {/* ===== THE DESK SCENE ===== */}
      <div className="swo-room-container">
        
        {/* Left side - cozy decorations */}
        <div className="swo-room-left">
          {/* Window with starry night */}
          <div className="swo-window">
            <div className="swo-window-frame">
              <div className="swo-window-glass">
                <div className="swo-window-stars" />
                <div className="swo-window-moon" />
              </div>
            </div>
            <div className="swo-window-sill" />
          </div>
          
          {/* Floating text - mysterious vibe */}
          <div className="swo-cosmic-text">
            <span className="swo-cosmic-line">✦ 𓆩 𝒄𝒐𝒔𝒎𝒊𝒄 𝒎𝒂𝒏𝒅𝒂𝒕𝒆 𓆪 ✦</span>
          </div>
          
          {/* Pixel plant */}
          <div className="swo-plant">
            <div className="swo-plant-pot" />
            <div className="swo-plant-stem" />
            <div className="swo-plant-leaf swo-plant-leaf-1" />
            <div className="swo-plant-leaf swo-plant-leaf-2" />
            <div className="swo-plant-leaf swo-plant-leaf-3" />
          </div>
        </div>
        
        {/* ===== CENTER-RIGHT: DESK WITH SETUP ===== */}
        <div className="swo-desk-area">
          {/* The desk surface */}
          <div className="swo-desk">
            {/* Desk lamp */}
            <div className="swo-lamp">
              <div className="swo-lamp-shade" />
              <div className="swo-lamp-light" />
              <div className="swo-lamp-arm" />
              <div className="swo-lamp-base" />
            </div>
            
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
                    <span className="swo-prompt-text">INSERT CARTRIDGE</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Coffee mug on desk */}
            <div className="swo-mug">
              <div className="swo-mug-body">
                <span className="swo-mug-star">★</span>
              </div>
              <div className="swo-mug-handle" />
              <div className="swo-mug-steam" />
            </div>
            
            {/* Desk surface highlight */}
            <div className="swo-desk-surface" />
          </div>
          
          {/* Desk legs */}
          <div className="swo-desk-legs">
            <div className="swo-desk-leg" />
            <div className="swo-desk-leg" />
          </div>
        </div>
        
        {/* Right side - poster */}
        <div className="swo-room-right">
          <div className="swo-poster">
            <div className="swo-poster-inner">
              <span className="swo-poster-star">⭐</span>
              <span className="swo-poster-text">SWO</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Floor */}
      <div className="swo-floor" />
      
      {/* Skip button */}
      <button 
        className="swo-skip-btn"
        onClick={handleSkip}
        onKeyDown={(e) => e.key === 'Enter' && handleSkip(e)}
        aria-label="Skip loading animation"
      >
        SKIP ▸▸
      </button>
      
      {/* Instructions at bottom - mysterious vibe */}
      {phase === 'waiting' && (
        <div className="swo-instructions">
          <p>✦ INSERT THE ★ CARTRIDGE ✦ the stars are calling ✦</p>
        </div>
      )}
    </div>
  );
}
