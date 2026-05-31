'use client';

// Raffle result overlays — full-screen win/lose animations + entry confirmation.
// Pure presentational (props + local state only); extracted from RaffleContent.
import { useState, useEffect } from 'react';
import { TIER_STYLES } from './tierStyles';

// Win Animation Component
// Win Animation Component - shown when winner visits raffle page after draw
export function WinAnimation({ raffleName, prizeName, onClose }: { raffleName?: string; prizeName?: string; onClose: () => void }) {
  const [stars, setStars] = useState<Array<{ 
    id: number; 
    x: number; 
    y: number; 
    size: number; 
    delay: number;
    dirX: number;
    dirY: number;
  }>>([]);
  
  useEffect(() => {
    // Generate flying stars with pre-calculated directions
    const newStars = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 20 + 10,
      delay: Math.random() * 2,
      dirX: (Math.random() - 0.5) * 400, // -200 to 200
      dirY: (Math.random() - 0.5) * 400, // -200 to 200
    }));
    setStars(newStars);
  }, []);
  
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 overflow-hidden" onClick={onClose}>
      {/* Flying stars - using CSS custom properties for animation */}
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute star-fly-animation"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            fontSize: `${star.size}px`,
            animationDelay: `${star.delay}s`,
            // Use CSS custom properties for animation targets
            '--tx': `${star.dirX}px`,
            '--ty': `${star.dirY}px`,
          } as React.CSSProperties}
        >
          ⭐
        </div>
      ))}
      
      {/* Main content */}
      <div className="relative z-10 text-center animate-bounce-in max-w-md mx-4">
        <div className="text-8xl mb-6 animate-spin-slow">🏆</div>
        <h1 className="text-4xl sm:text-6xl font-bold text-[#ffd700] mb-4 pixel-glow-gold animate-pulse">
          YOU WON!
        </h1>
        {raffleName && (
          <p className="text-xl sm:text-2xl text-[#ff6ec7] mb-2">
            {raffleName}
          </p>
        )}
        {prizeName && (
          <div className="bg-[#ffd700]/20 border-2 border-[#ffd700] rounded-lg p-4 mb-4 mx-4">
            <p className="text-[#ffd700] text-sm mb-1">🎁 YOUR PRIZE</p>
            <p className="text-white text-lg font-bold">{prizeName}</p>
          </div>
        )}
        <p className="text-xl text-[#44ff88] mb-6">
          🌟 Congratulations, Star Champion! 🌟
        </p>
        <p className="text-gray-400 text-xs mb-2 italic">
          Prizes will be sent manually. We&apos;ll reach out if we need any info from you.
        </p>
        <p className="text-gray-500 text-sm">Click anywhere to continue</p>
      </div>
      
      <style jsx>{`
        @keyframes fly-star {
          0% {
            transform: translate(0, 0) rotate(0deg) scale(0);
            opacity: 0;
          }
          20% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            transform: translate(var(--tx, 100px), var(--ty, 100px)) rotate(720deg) scale(0);
            opacity: 0;
          }
        }
        .star-fly-animation {
          animation: fly-star 3s ease-out infinite;
        }
        @keyframes bounce-in {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-bounce-in {
          animation: bounce-in 0.5s ease-out forwards;
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
    </div>
  );
}

// Lose Animation Component
export function LoseAnimation({ onClose }: { onClose: () => void }) {
  // Pre-calculate star positions and properties
  const [fallingStars] = useState(() => 
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: Math.random() * 15 + 10,
      delay: Math.random() * 3,
      duration: Math.random() * 2 + 3,
    }))
  );

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 overflow-hidden" onClick={onClose}>
      {/* Falling stars (sad) */}
      <div className="absolute inset-0 overflow-hidden">
        {fallingStars.map((star) => (
          <div
            key={star.id}
            className="absolute animate-fall-star"
            style={{
              left: `${star.left}%`,
              top: `-20px`,
              fontSize: `${star.size}px`,
              animationDelay: `${star.delay}s`,
              animationDuration: `${star.duration}s`,
              opacity: 0.5,
            }}
          >
            ⭐
          </div>
        ))}
      </div>
      
      {/* Main content */}
      <div className="relative z-10 text-center animate-fade-in">
        <div className="text-8xl mb-8 animate-wobble">😢</div>
        <h1 className="text-4xl sm:text-6xl font-bold text-[#9966ff] mb-4">
          Not This Time...
        </h1>
        <p className="text-xl text-gray-400 mb-4">
          The stars weren&apos;t aligned this round
        </p>
        <p className="text-[#ffd700] text-lg mb-8">
          ✨ Keep entering for more chances! ✨
        </p>
        <p className="text-gray-500 text-sm">Click anywhere to continue</p>
      </div>
      
      <style jsx>{`
        @keyframes fall-star {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 0.5;
          }
          100% {
            transform: translateY(100vh) rotate(360deg);
            opacity: 0;
          }
        }
        .animate-fall-star {
          animation: fall-star linear infinite;
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
        @keyframes wobble {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-10deg); }
          75% { transform: rotate(10deg); }
        }
        .animate-wobble {
          animation: wobble 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// Animation configuration constants
const ENTRY_ANIMATION_DURATION_MS = 4000;

// Entry Confirmation Animation with lottery-style flying tickets
export function EntryConfirmation({ entries, tier, raffleName, onClose }: { entries: number; tier: string; raffleName: string; onClose: () => void }) {
  const style = TIER_STYLES[tier] || TIER_STYLES.star_forged;
  
  // Generate flying tickets based on entry count
  // Tickets fly outward from center to random positions
  const [flyingTickets] = useState(() => 
    Array.from({ length: Math.min(entries * 3, 30) }, (_, i) => {
      const startX = 50 + (Math.random() - 0.5) * 20; // Start near center
      const startY = 110; // Start from below
      const endX = Math.random() * 100;
      const endY = Math.random() * 40; // End in upper half
      return {
        id: i,
        startX,
        startY,
        // Calculate displacement (can be negative for flying left/up)
        deltaX: endX - startX,
        deltaY: endY - startY,
        rotation: Math.random() * 720 - 360,
        delay: Math.random() * 0.5,
        duration: 0.8 + Math.random() * 0.4,
        size: 16 + Math.random() * 16,
      };
    })
  );
  
  // Sparkle effects
  const [sparkles] = useState(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 2,
      size: 8 + Math.random() * 12,
    }))
  );
  
  useEffect(() => {
    const timer = setTimeout(onClose, ENTRY_ANIMATION_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onClose]);
  
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 animate-fade-in overflow-hidden" onClick={onClose}>
      {/* Flying tickets animation */}
      {flyingTickets.map((ticket) => (
        <div
          key={ticket.id}
          className="absolute ticket-fly-animation pointer-events-none"
          style={{
            left: `${ticket.startX}%`,
            top: `${ticket.startY}%`,
            fontSize: `${ticket.size}px`,
            '--endX': `${ticket.deltaX}vw`,
            '--endY': `${ticket.deltaY}vh`,
            '--rotation': `${ticket.rotation}deg`,
            animationDelay: `${ticket.delay}s`,
            animationDuration: `${ticket.duration}s`,
          } as React.CSSProperties}
        >
          🎟️
        </div>
      ))}
      
      {/* Sparkle effects */}
      {sparkles.map((sparkle) => (
        <div
          key={sparkle.id}
          className="absolute sparkle-animation pointer-events-none"
          style={{
            left: `${sparkle.x}%`,
            top: `${sparkle.y}%`,
            fontSize: `${sparkle.size}px`,
            animationDelay: `${sparkle.delay}s`,
          }}
        >
          ✨
        </div>
      ))}
      
      {/* Main content card */}
      <div 
        className="text-center p-8 rounded-xl border-2 animate-scale-in max-w-sm mx-4 relative z-10"
        style={{ 
          backgroundColor: style.bgColor, 
          borderColor: style.borderColor,
          boxShadow: `${style.glow}, 0 0 60px ${style.borderColor}40`,
        }}
      >
        {/* Animated ticket stack */}
        <div className="relative h-20 mb-4">
          <div className="ticket-stack-animation">
            {Array.from({ length: Math.min(entries, 4) }, (_, i) => (
              <span 
                key={i} 
                className="absolute text-5xl ticket-drop-animation"
                style={{ 
                  left: '50%',
                  transform: 'translateX(-50%)',
                  animationDelay: `${i * 0.15}s`,
                  top: `${i * 4}px`,
                  opacity: 1 - (i * 0.15),
                }}
              >
                🎟️
              </span>
            ))}
          </div>
        </div>
        
        <h2 className="text-2xl font-bold mb-2 animate-pulse" style={{ color: style.color }}>
          YOU&apos;RE IN!
        </h2>
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-3xl font-bold text-white ticket-count-animation">+{entries}</span>
          <span className="text-white text-lg">Ticket{entries > 1 ? 's' : ''}</span>
        </div>
        <p className="text-gray-400 text-sm mb-1">
          {TIER_STYLES[tier] ? tier.replace('_', ' ').toUpperCase() : 'STAR FORGED'}
        </p>
        <p className="text-[#ff6ec7] text-xs">
          for &quot;{raffleName}&quot;
        </p>
        <p className="text-gray-500 text-[10px] mt-4">Click anywhere to continue</p>
      </div>
      
      <style jsx>{`
        @keyframes scale-in {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scale-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out forwards;
        }
        @keyframes ticket-fly {
          0% {
            transform: translate(0, 0) rotate(0deg) scale(0);
            opacity: 0;
          }
          20% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            transform: translate(var(--endX), var(--endY)) rotate(var(--rotation)) scale(0.5);
            opacity: 0;
          }
        }
        .ticket-fly-animation {
          animation: ticket-fly ease-out forwards;
        }
        @keyframes sparkle {
          0%, 100% { opacity: 0; transform: scale(0); }
          50% { opacity: 1; transform: scale(1); }
        }
        .sparkle-animation {
          animation: sparkle 1.5s ease-in-out infinite;
        }
        @keyframes ticket-drop {
          0% { transform: translateX(-50%) translateY(-30px) rotate(-10deg); opacity: 0; }
          60% { transform: translateX(-50%) translateY(5px) rotate(5deg); opacity: 1; }
          100% { transform: translateX(-50%) translateY(0) rotate(0deg); opacity: 1; }
        }
        .ticket-drop-animation {
          animation: ticket-drop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes count-pop {
          0% { transform: scale(0); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        .ticket-count-animation {
          animation: count-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s forwards;
          transform: scale(0);
        }
      `}</style>
    </div>
  );
}
