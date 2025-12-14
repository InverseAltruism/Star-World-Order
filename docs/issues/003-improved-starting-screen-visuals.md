# Issue #3: Improved Starting Screen Visuals

## 🎮 Feature Overview

Enhance the current loading/starting screen experience to create a more immersive, nostalgic gaming feel. The current implementation has a "cozy gaming setup" with a TV, N64-style console, and cartridge insertion mechanic, but there are several areas for improvement:

- Static elements need animation
- The "cozy setup" lacks environmental detail
- Boot sequence could be more authentic
- Overall retro pixel art vibe needs strengthening

## 🎯 Goals

1. **Enhanced Animations** - Make every element feel alive
2. **Richer Environment** - Add room ambiance, lighting, decorations
3. **Authentic Boot Sequence** - More realistic console startup
4. **Cohesive Pixel Art Style** - Consistent retro gaming aesthetic
5. **Performance** - Smooth 60fps animations on all devices
6. **Mobile Support** - Responsive and touch-friendly

## 🖼️ Current State Analysis

### What Works Well
- Cartridge insertion mechanic is engaging
- Basic N64-style console design
- CRT scanline effect
- Phase-based animation sequence
- Skip button for returning users

### Areas for Improvement

| Element | Current State | Desired State |
|---------|---------------|---------------|
| **Room Environment** | Just desk + TV | Full bedroom/gaming room with ambiance |
| **Console Details** | Basic shape | Detailed N64 with controller, cables |
| **TV Effects** | Basic on/off | CRT warm-up, static, flicker |
| **Lighting** | None | Ambient glow, lamp, moonlight |
| **Decorations** | Minimal | Posters, shelf, collectibles, plants |
| **Sound** | None | Ambient + SFX (optional) |
| **Boot Sequence** | Generic | Authentic console boot screens |
| **Animations** | Limited | Everything subtly animated |

## 🏗️ Design Specification

### Room Environment Layers

```
┌──────────────────────────────────────────────────────────────┐
│                        ROOM LAYOUT                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────┐              ┌─────────────────────┐          │
│   │ WINDOW  │              │      POSTER         │          │
│   │ (moon)  │              │   (pixel art)       │          │
│   └─────────┘              └─────────────────────┘          │
│                                                              │
│         ┌───────────────────────────────────────┐           │
│         │           CRT TV MONITOR              │           │
│         │  ┌─────────────────────────────────┐  │           │
│         │  │         SCREEN AREA             │  │           │
│         │  │                                 │  │           │
│         │  └─────────────────────────────────┘  │           │
│         │            [TV STAND]                 │           │
│         └───────────────────────────────────────┘           │
│                                                              │
│                  ┌─────────────────┐                        │
│   ┌───────┐     │   N64 CONSOLE   │      ┌───────┐         │
│   │ LAMP  │     │   [CARTRIDGE]   │      │ PLANT │         │
│   └───────┘     └─────────────────┘      └───────┘         │
│                                                              │
│   ══════════════════════════════════════════════════════    │
│                      WOODEN DESK                             │
│   ══════════════════════════════════════════════════════    │
│                                                              │
│        ┌─────────────┐                                      │
│        │ CONTROLLER  │           ┌──────────┐               │
│        │   (N64)     │           │ SNACKS   │               │
│        └─────────────┘           └──────────┘               │
│                                                              │
│   ░░░░░░░░░░░░░░░░░░░░░ RUG ░░░░░░░░░░░░░░░░░░░░░░░        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Animation Layers

1. **Background Layer** (Static)
   - Wall texture with subtle grain
   - Floor/carpet pattern

2. **Environment Layer** (Subtle Animation)
   - Window with moonlight rays
   - Ambient particles (dust motes)
   - Wall poster(s)

3. **Desk Layer** (Medium Animation)
   - Wooden desk surface with wood grain
   - Desk lamp with warm glow (pulsing)
   - Small decorations (bobblehead, figure)
   - Snacks/drinks

4. **Console Layer** (Main Animation)
   - N64-style console with accurate details
   - LED indicators (blinking)
   - Controller on desk
   - Cables running to TV

5. **TV Layer** (Dynamic Animation)
   - CRT monitor with bezel
   - Power button/LED
   - Screen with multiple states:
     - Off (dark with reflection)
     - Power-on (horizontal line, flicker)
     - Static (brief)
     - Boot logo (animated)
     - Game content

6. **Cartridge Layer** (Interactive)
   - Floating cartridge before insertion
   - Insertion animation
   - Slot acceptance animation

7. **Overlay Layer** (Effects)
   - CRT scanlines
   - Screen glow bleeding
   - Vignette corners
   - Ambient lighting overlay

## 💻 Implementation

### Enhanced CSS: `globals.css` additions

```css
/* ============================================
   LOADING SCREEN - ENHANCED ANIMATIONS
   ============================================ */

/* Room Background with Atmosphere */
.swo-room-bg {
  position: absolute;
  inset: 0;
  background: 
    /* Vignette corners */
    radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%),
    /* Wall gradient */
    linear-gradient(180deg, 
      #0d0d1a 0%, 
      #12122a 40%, 
      #1a1a3a 70%,
      #0a0a15 100%
    );
}

/* Moonlight Effect */
.swo-moonlight {
  position: absolute;
  top: 10%;
  left: 5%;
  width: 150px;
  height: 200px;
  background: radial-gradient(
    ellipse at top,
    rgba(200, 200, 255, 0.1) 0%,
    rgba(100, 100, 200, 0.05) 40%,
    transparent 70%
  );
  animation: moonlight-sway 8s ease-in-out infinite;
  pointer-events: none;
}

@keyframes moonlight-sway {
  0%, 100% { opacity: 0.8; transform: translateX(0) skewX(-5deg); }
  50% { opacity: 1; transform: translateX(10px) skewX(-3deg); }
}

/* Window with Moon */
.swo-window {
  position: absolute;
  top: 8%;
  left: 8%;
  width: 80px;
  height: 100px;
  background: linear-gradient(180deg, #1a1a3a 0%, #2a2a5a 100%);
  border: 4px solid #3a3a5e;
  border-radius: 2px;
  overflow: hidden;
  box-shadow: 
    inset 0 0 20px rgba(100, 100, 200, 0.3),
    0 0 30px rgba(100, 100, 200, 0.1);
}

.swo-window::before {
  content: '🌙';
  position: absolute;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 24px;
  animation: moon-glow 4s ease-in-out infinite;
}

@keyframes moon-glow {
  0%, 100% { 
    text-shadow: 0 0 10px rgba(255, 255, 200, 0.5);
    transform: translateX(-50%) scale(1);
  }
  50% { 
    text-shadow: 0 0 20px rgba(255, 255, 200, 0.8);
    transform: translateX(-50%) scale(1.05);
  }
}

/* Window bars */
.swo-window::after {
  content: '';
  position: absolute;
  inset: 0;
  background: 
    linear-gradient(90deg, transparent 48%, #2a2a4e 48%, #2a2a4e 52%, transparent 52%),
    linear-gradient(0deg, transparent 48%, #2a2a4e 48%, #2a2a4e 52%, transparent 52%);
  pointer-events: none;
}

/* Wall Poster */
.swo-poster {
  position: absolute;
  top: 5%;
  right: 15%;
  width: 100px;
  height: 130px;
  background: linear-gradient(135deg, #2a2a4e 0%, #1a1a3a 100%);
  border: 3px solid #4a4a6e;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  box-shadow: 
    5px 5px 0 rgba(0,0,0,0.3),
    inset 0 0 10px rgba(0,0,0,0.2);
  animation: poster-sway 6s ease-in-out infinite;
}

@keyframes poster-sway {
  0%, 100% { transform: rotate(-1deg); }
  50% { transform: rotate(1deg); }
}

/* Desk Lamp with Glow */
.swo-desk-lamp {
  position: absolute;
  bottom: 45%;
  left: 10%;
  width: 40px;
  height: 60px;
  z-index: 5;
}

.swo-lamp-shade {
  width: 40px;
  height: 25px;
  background: linear-gradient(135deg, #ffd700 0%, #cc9900 100%);
  border-radius: 50% 50% 0 0 / 100% 100% 0 0;
  position: relative;
  box-shadow: 
    0 -5px 30px rgba(255, 200, 100, 0.5),
    0 -10px 60px rgba(255, 200, 100, 0.3);
  animation: lamp-pulse 3s ease-in-out infinite;
}

@keyframes lamp-pulse {
  0%, 100% { 
    box-shadow: 
      0 -5px 30px rgba(255, 200, 100, 0.5),
      0 -10px 60px rgba(255, 200, 100, 0.3);
  }
  50% { 
    box-shadow: 
      0 -8px 40px rgba(255, 200, 100, 0.7),
      0 -15px 80px rgba(255, 200, 100, 0.4);
  }
}

.swo-lamp-arm {
  width: 4px;
  height: 35px;
  background: linear-gradient(90deg, #666 0%, #888 50%, #666 100%);
  margin: 0 auto;
}

.swo-lamp-base {
  width: 30px;
  height: 8px;
  background: linear-gradient(90deg, #444 0%, #666 50%, #444 100%);
  margin: 0 auto;
  border-radius: 2px;
}

/* Ambient Light from Lamp */
.swo-ambient-lamp-light {
  position: absolute;
  bottom: 30%;
  left: 0;
  width: 200px;
  height: 300px;
  background: radial-gradient(
    ellipse at 20% 20%,
    rgba(255, 200, 100, 0.15) 0%,
    rgba(255, 200, 100, 0.05) 40%,
    transparent 70%
  );
  pointer-events: none;
  animation: ambient-flicker 4s ease-in-out infinite;
}

@keyframes ambient-flicker {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.9; }
  75% { opacity: 0.95; }
}

/* Floating Dust Particles */
.swo-dust-particles {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.swo-dust {
  position: absolute;
  width: 2px;
  height: 2px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  animation: dust-float 15s linear infinite;
}

.swo-dust:nth-child(1) { left: 10%; animation-delay: 0s; animation-duration: 12s; }
.swo-dust:nth-child(2) { left: 25%; animation-delay: 2s; animation-duration: 14s; }
.swo-dust:nth-child(3) { left: 40%; animation-delay: 4s; animation-duration: 16s; }
.swo-dust:nth-child(4) { left: 55%; animation-delay: 1s; animation-duration: 13s; }
.swo-dust:nth-child(5) { left: 70%; animation-delay: 3s; animation-duration: 15s; }
.swo-dust:nth-child(6) { left: 85%; animation-delay: 5s; animation-duration: 11s; }

@keyframes dust-float {
  0% { 
    transform: translateY(100vh) rotate(0deg); 
    opacity: 0;
  }
  10% { opacity: 0.5; }
  90% { opacity: 0.5; }
  100% { 
    transform: translateY(-20vh) rotate(360deg); 
    opacity: 0;
  }
}

/* Plant Decoration */
.swo-plant {
  position: absolute;
  bottom: 38%;
  right: 12%;
  font-size: 32px;
  animation: plant-sway 5s ease-in-out infinite;
  filter: drop-shadow(0 0 5px rgba(68, 255, 136, 0.3));
}

@keyframes plant-sway {
  0%, 100% { transform: rotate(-2deg); }
  50% { transform: rotate(2deg); }
}

/* Enhanced TV with Better Effects */
.swo-tv {
  position: relative;
  z-index: 10;
}

.swo-tv-body {
  background: linear-gradient(180deg, #2a2a3e 0%, #1a1a2e 50%, #0a0a15 100%);
  border: 4px solid #3a3a5e;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 
    0 10px 30px rgba(0,0,0,0.5),
    inset 0 1px 0 rgba(255,255,255,0.1);
}

/* TV Screen with CRT Curvature */
.swo-tv-screen {
  position: relative;
  background: #000;
  border: 3px solid #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
  /* Slight curvature effect */
  box-shadow: 
    inset 0 0 50px rgba(0,0,0,0.8),
    inset 0 0 100px rgba(0,0,0,0.5);
}

/* Screen Off - Glass Reflection */
.swo-screen-off {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(20, 20, 40, 0.95) 0%,
    rgba(10, 10, 20, 0.98) 100%
  );
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 5;
}

.swo-screen-off.visible {
  opacity: 1;
}

.swo-screen-reflection {
  position: absolute;
  top: 10%;
  left: 10%;
  width: 60%;
  height: 30%;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.08) 0%,
    transparent 60%
  );
  border-radius: 50%;
  transform: rotate(-15deg);
}

/* Screen Power On Animation */
.swo-screen-poweron {
  position: absolute;
  inset: 0;
  background: white;
  opacity: 0;
  z-index: 10;
  pointer-events: none;
}

.swo-screen-poweron.active {
  animation: screen-poweron 0.8s ease-out forwards;
}

@keyframes screen-poweron {
  0% { 
    opacity: 0;
    transform: scaleY(0.01);
  }
  20% {
    opacity: 1;
    transform: scaleY(0.01);
  }
  40% {
    transform: scaleY(0.02) scaleX(0.8);
  }
  60% {
    transform: scaleY(0.5) scaleX(0.9);
  }
  80% {
    transform: scaleY(1) scaleX(1);
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: scaleY(1) scaleX(1);
  }
}

/* CRT Effect Overlay */
.swo-screen-crt {
  position: absolute;
  inset: 0;
  background: 
    /* Scanlines */
    repeating-linear-gradient(
      0deg,
      rgba(0, 0, 0, 0.15) 0px,
      rgba(0, 0, 0, 0.15) 1px,
      transparent 1px,
      transparent 2px
    ),
    /* RGB subpixels simulation */
    repeating-linear-gradient(
      90deg,
      rgba(255, 0, 0, 0.02) 0px,
      rgba(255, 0, 0, 0.02) 1px,
      rgba(0, 255, 0, 0.02) 1px,
      rgba(0, 255, 0, 0.02) 2px,
      rgba(0, 0, 255, 0.02) 2px,
      rgba(0, 0, 255, 0.02) 3px
    );
  pointer-events: none;
  animation: crt-flicker 0.15s infinite;
  z-index: 20;
}

@keyframes crt-flicker {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 0.85; }
}

/* Screen Glow (when on) */
.swo-tv.on .swo-tv-screen::after {
  content: '';
  position: absolute;
  inset: -20px;
  background: radial-gradient(
    ellipse at center,
    rgba(100, 100, 200, 0.15) 0%,
    transparent 70%
  );
  pointer-events: none;
  z-index: -1;
}

/* Enhanced Console Details */
.swo-n64-console {
  position: relative;
  margin-top: 15px;
}

.swo-n64-body {
  background: linear-gradient(180deg, #2a2a3e 0%, #1a1a2e 100%);
  border: 3px solid #3a3a5e;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 15px;
  box-shadow: 
    0 5px 15px rgba(0,0,0,0.4),
    inset 0 1px 0 rgba(255,255,255,0.1);
}

/* Power LED Animation */
.swo-n64-power.on::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 8px;
  transform: translateY(-50%);
  width: 6px;
  height: 6px;
  background: #44ff88;
  border-radius: 50%;
  box-shadow: 0 0 10px #44ff88, 0 0 20px rgba(68, 255, 136, 0.5);
  animation: led-pulse 2s ease-in-out infinite;
}

@keyframes led-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 10px #44ff88, 0 0 20px rgba(68, 255, 136, 0.5); }
  50% { opacity: 0.7; box-shadow: 0 0 5px #44ff88, 0 0 10px rgba(68, 255, 136, 0.3); }
}

/* Controller with Cable */
.swo-controller {
  position: absolute;
  bottom: 15%;
  left: 20%;
  font-size: 28px;
  z-index: 5;
  animation: controller-idle 4s ease-in-out infinite;
}

.swo-controller::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  width: 3px;
  height: 80px;
  background: linear-gradient(
    180deg,
    #333 0%,
    #222 50%,
    #333 100%
  );
  transform-origin: top center;
  animation: cable-sway 3s ease-in-out infinite;
  z-index: -1;
}

@keyframes controller-idle {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(1deg); }
  75% { transform: rotate(-1deg); }
}

@keyframes cable-sway {
  0%, 100% { transform: rotate(-5deg) scaleY(1); }
  50% { transform: rotate(5deg) scaleY(1.02); }
}

/* Snacks/Drinks */
.swo-snacks {
  position: absolute;
  bottom: 42%;
  right: 20%;
  display: flex;
  gap: 8px;
  z-index: 5;
}

.swo-snack {
  font-size: 20px;
  animation: snack-wiggle 5s ease-in-out infinite;
}

.swo-snack:nth-child(2) { animation-delay: 1s; }
.swo-snack:nth-child(3) { animation-delay: 2s; }

@keyframes snack-wiggle {
  0%, 100% { transform: rotate(0deg); }
  10% { transform: rotate(3deg); }
  20% { transform: rotate(-3deg); }
  30% { transform: rotate(0deg); }
}

/* Enhanced Cartridge Animation */
.swo-cartridge-wrapper {
  transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}

.swo-cartridge-wrapper.waiting {
  animation: cartridge-hover 2s ease-in-out infinite;
}

.swo-cartridge-wrapper.inserting {
  animation: cartridge-insert 0.8s ease-out forwards;
}

@keyframes cartridge-hover {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-8px) rotate(1deg); }
}

@keyframes cartridge-insert {
  0% { 
    transform: translateY(0) rotate(0deg); 
    opacity: 1;
  }
  50% { 
    transform: translateY(30px) rotate(0deg); 
  }
  100% { 
    transform: translateY(40px) rotate(0deg); 
    opacity: 0;
  }
}

/* Cartridge Glow Effect */
.swo-cartridge::before {
  content: '';
  position: absolute;
  inset: -5px;
  background: radial-gradient(
    ellipse at center,
    rgba(255, 215, 0, 0.3) 0%,
    transparent 70%
  );
  opacity: 0;
  animation: cartridge-glow 2s ease-in-out infinite;
  pointer-events: none;
}

.swo-cartridge-wrapper.waiting .swo-cartridge::before {
  opacity: 1;
}

@keyframes cartridge-glow {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.1); }
}

/* Boot Sequence Logo Animation */
.swo-pixel-star {
  animation: boot-star-spin 2s ease-out forwards;
}

@keyframes boot-star-spin {
  0% { 
    transform: scale(0) rotate(-180deg); 
    opacity: 0;
  }
  50% { 
    transform: scale(1.2) rotate(0deg); 
    opacity: 1;
  }
  100% { 
    transform: scale(1) rotate(0deg); 
    opacity: 1;
  }
}

/* Loading Title Typewriter Effect */
.swo-loading-title {
  overflow: hidden;
  animation: title-reveal 1s steps(20) forwards;
}

@keyframes title-reveal {
  0% { width: 0; }
  100% { width: 100%; }
}

/* Enhanced Loading Bar */
.swo-loading-bar-fill {
  background: linear-gradient(
    90deg,
    #ffd700 0%,
    #ffee88 50%,
    #ffd700 100%
  );
  box-shadow: 
    0 0 10px rgba(255, 215, 0, 0.5),
    0 0 20px rgba(255, 215, 0, 0.3);
  animation: loading-shimmer 1s linear infinite;
}

@keyframes loading-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* Zoom Transition Enhancement */
.swo-scene.zoomed {
  animation: scene-zoom 1.5s ease-in-out forwards;
}

@keyframes scene-zoom {
  0% { 
    transform: scale(1) translateY(0); 
    filter: blur(0);
  }
  50% { 
    transform: scale(2) translateY(-20%); 
    filter: blur(2px);
  }
  100% { 
    transform: scale(4) translateY(-30%); 
    filter: blur(0);
  }
}

/* Responsive Adjustments */
@media (max-width: 768px) {
  .swo-window,
  .swo-poster,
  .swo-desk-lamp,
  .swo-plant,
  .swo-snacks {
    display: none; /* Simplify for mobile */
  }
  
  .swo-gaming-setup {
    transform: scale(0.8);
  }
}

@media (max-width: 480px) {
  .swo-gaming-setup {
    transform: scale(0.6);
  }
}
```

### Enhanced Component: `LoadingScreen.tsx` updates

```typescript
// Add new elements to the component

// Dust particles component
const DustParticles = () => (
  <div className="swo-dust-particles">
    {[...Array(6)].map((_, i) => (
      <div key={i} className="swo-dust" />
    ))}
  </div>
);

// Window with moon
const Window = () => (
  <div className="swo-window">
    <div className="swo-moonlight" />
  </div>
);

// Desk lamp
const DeskLamp = () => (
  <div className="swo-desk-lamp">
    <div className="swo-lamp-shade" />
    <div className="swo-lamp-arm" />
    <div className="swo-lamp-base" />
  </div>
);

// Wall poster
const WallPoster = () => (
  <div className="swo-poster">
    ⭐
  </div>
);

// Plant decoration
const Plant = () => (
  <div className="swo-plant">🪴</div>
);

// Snacks
const Snacks = () => (
  <div className="swo-snacks">
    <span className="swo-snack">🥤</span>
    <span className="swo-snack">🍿</span>
    <span className="swo-snack">🎮</span>
  </div>
);

// In the render, add these components:
return (
  <div className="swo-loading-screen" style={loadingScreenStyle} data-phase={phase}>
    {/* Room background */}
    <div className="swo-room-bg" />
    
    {/* Ambient elements */}
    <Window />
    <div className="swo-moonlight" />
    <WallPoster />
    <DustParticles />
    <div className="swo-ambient-lamp-light" />
    
    {/* Scanlines */}
    <div className="swo-scanlines" />
    
    {/* Gaming setup */}
    <div className={`swo-gaming-setup ${isZoomingOrBeyond ? 'swo-setup-zooming' : ''}`}>
      <DeskLamp />
      <Plant />
      <Snacks />
      
      {/* ... rest of existing elements ... */}
    </div>
    
    {/* ... rest of component ... */}
  </div>
);
```

## 🎵 Optional: Sound Effects

Consider adding ambient sounds for immersion:

```typescript
// Sound configuration
const SOUNDS = {
  ambient: '/sounds/retro-ambient.mp3',      // Low background hum
  cartridgeInsert: '/sounds/cartridge.mp3',  // Click sound
  powerOn: '/sounds/poweron.mp3',            // CRT power on buzz
  bootJingle: '/sounds/boot.mp3',            // Short boot melody
};

// Simple sound manager
class SoundManager {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private muted: boolean = false;
  
  preload() {
    Object.entries(SOUNDS).forEach(([key, url]) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      this.sounds.set(key, audio);
    });
  }
  
  play(soundKey: string) {
    if (this.muted) return;
    const sound = this.sounds.get(soundKey);
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(() => {}); // Ignore autoplay errors
    }
  }
  
  setMuted(muted: boolean) {
    this.muted = muted;
  }
}
```

## 📋 Implementation Checklist

### Phase 1: Environment Enhancement (Week 1)
- [ ] Add window with moonlight effect
- [ ] Add wall poster decoration
- [ ] Create desk lamp with glow
- [ ] Add plant decoration
- [ ] Implement dust particles
- [ ] Add ambient lighting overlay
- [ ] Add snacks/drinks on desk

### Phase 2: Animation Polish (Week 2)
- [ ] Enhance cartridge hover animation
- [ ] Improve cartridge insertion animation
- [ ] Better TV power-on sequence
- [ ] Add CRT warm-up effect
- [ ] Implement screen static/flicker
- [ ] Polish boot logo animation
- [ ] Add loading bar shimmer effect

### Phase 3: Console Details (Week 3)
- [ ] Improve N64 console design
- [ ] Add LED pulse animations
- [ ] Create controller with cable
- [ ] Add cable sway animation
- [ ] Improve cartridge slot detail
- [ ] Add subtle breathing effects

### Phase 4: Zoom & Transition (Week 4)
- [ ] Polish zoom into screen transition
- [ ] Add motion blur during zoom
- [ ] Smooth fade of environment elements
- [ ] Optimize performance for transition

### Phase 5: Polish & Sound (Week 5)
- [ ] Add optional sound effects
- [ ] Implement mute toggle
- [ ] Mobile optimization
- [ ] Performance testing
- [ ] Cross-browser testing
- [ ] Accessibility review

## 🎨 Asset Requirements

### Images (Optional)
- `wall-texture.png` - Subtle wall pattern
- `floor-wood.png` - Wood floor texture
- `rug-pattern.png` - Decorative rug

### Sounds (Optional)
- `ambient.mp3` - Soft background hum (~30s loop)
- `cartridge-insert.mp3` - Click/thunk sound (~0.5s)
- `power-on.mp3` - CRT power buzz (~1s)
- `boot-jingle.mp3` - Short musical sting (~2s)

## 🏷️ Labels

- `enhancement`
- `ui`
- `animation`
- `loading-screen`
- `pixel-art`
- `polish`

## 📅 Estimated Effort

- **Environment**: 1 week
- **Animations**: 1 week  
- **Console Details**: 1 week
- **Transitions**: 1 week
- **Polish**: 1 week

**Total**: 5 weeks for full enhancement

## 📝 Additional Notes

### Performance Considerations
- Use `will-change` CSS property sparingly
- Prefer CSS animations over JavaScript where possible
- Consider reduced motion preferences: `@media (prefers-reduced-motion: reduce)`
- Test on low-end devices

### Accessibility
- Ensure skip button is always visible and accessible
- Add `aria-label` to interactive elements
- Respect `prefers-reduced-motion` setting
- Maintain keyboard navigation

### Future Enhancements
- WebGL-powered effects for higher-end devices
- Multiple room themes (bedroom, living room, arcade)
- Seasonal decorations
- Interactive elements (click on decorations)
- Custom cartridge labels based on user's NFT

---

*Boot up the nostalgia... 🎮*
