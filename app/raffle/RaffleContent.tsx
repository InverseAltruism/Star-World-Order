'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount } from 'wagmi';
import WalletConnect from '@/components/WalletConnect';
import Image from 'next/image';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';

// Types
interface HolderTierInfo {
  minStars: number;
  entries: number;
  name: string;
}

interface HolderTiers {
  cosmic_emperor: HolderTierInfo;
  star_lord: HolderTierInfo;
  cosmic_warden: HolderTierInfo;
  star_forged: HolderTierInfo;
}

interface Raffle {
  id: string;
  name: string;
  description: string;
  prize_description: string;
  prize_image_url: string | null;
  status: 'active' | 'ended' | 'drawn' | 'cancelled';
  created_by: string;
  start_time: string;
  end_time: string;
  winner_address: string | null;
  winner_drawn_at: string | null;
  winner_draw_seed: string | null;
  discord_bonus_enabled: number;
  require_x: number;
  require_discord: number;
  tweet_url: string | null;
  is_public: number;
  userEntry?: RaffleEntry | null;
}

interface RaffleEntry {
  id: number;
  raffle_id: string;
  wallet_address: string;
  tier: string;
  entries_count: number;
  discord_bonus: number;
  engagement_bonus: number;
  star_count: number;
  entered_at: string;
  display_name?: string;
}

interface SocialConnections {
  hasDiscord: boolean;
  hasX: boolean;
  discord?: { username: string; platform_user_id: string };
  x?: { username: string; platform_user_id: string };
}

interface RaffleStats {
  participants: number;
  totalTickets: number;
}

interface UserTier {
  tier: string;
  entries: number;
  name: string;
  minStars?: number;
  breakdown?: string;
  regularSkrumpeys?: number;
  starBonus?: number;
  totalSkrumpeys?: number;
}

// Tier colors and styles
const TIER_STYLES: Record<string, { color: string; bgColor: string; borderColor: string; glow: string }> = {
  cosmic_emperor: {
    color: '#ffd700',
    bgColor: 'rgba(255, 215, 0, 0.15)',
    borderColor: '#ffd700',
    glow: '0 0 20px rgba(255, 215, 0, 0.4)',
  },
  star_lord: {
    color: '#ff00ff',
    bgColor: 'rgba(255, 0, 255, 0.15)',
    borderColor: '#ff00ff',
    glow: '0 0 20px rgba(255, 0, 255, 0.4)',
  },
  cosmic_warden: {
    color: '#00ffff',
    bgColor: 'rgba(0, 255, 255, 0.15)',
    borderColor: '#00ffff',
    glow: '0 0 20px rgba(0, 255, 255, 0.4)',
  },
  star_forged: {
    color: '#9966ff',
    bgColor: 'rgba(153, 102, 255, 0.15)',
    borderColor: '#9966ff',
    glow: '0 0 20px rgba(153, 102, 255, 0.4)',
  },
  skrumpey_holder: {
    color: '#44ff88',
    bgColor: 'rgba(68, 255, 136, 0.15)',
    borderColor: '#44ff88',
    glow: '0 0 20px rgba(68, 255, 136, 0.4)',
  },
};

// Format time remaining
function formatTimeRemaining(endTime: string): string {
  const end = new Date(endTime).getTime();
  const now = Date.now();
  const diff = end - now;
  
  if (diff <= 0) return 'ENDED';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// Countdown Timer Component
function CountdownTimer({ endTime }: { endTime: string }) {
  const [timeLeft, setTimeLeft] = useState(formatTimeRemaining(endTime));
  const [isUrgent, setIsUrgent] = useState(false);
  
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = formatTimeRemaining(endTime);
      setTimeLeft(remaining);
      
      // Check if less than 1 hour remaining
      const diff = new Date(endTime).getTime() - Date.now();
      setIsUrgent(diff > 0 && diff < 3600000);
    }, 1000);
    
    return () => clearInterval(timer);
  }, [endTime]);
  
  return (
    <div className={`text-2xl sm:text-3xl font-bold tracking-wider ${isUrgent ? 'text-[#ff4466] animate-pulse' : 'text-[#ffd700]'}`}>
      {timeLeft}
    </div>
  );
}

// Win Animation Component
// Win Animation Component - shown when winner visits raffle page after draw
function WinAnimation({ raffleName, prizeName, onClose }: { raffleName?: string; prizeName?: string; onClose: () => void }) {
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
function LoseAnimation({ onClose }: { onClose: () => void }) {
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
function EntryConfirmation({ entries, tier, raffleName, onClose }: { entries: number; tier: string; raffleName: string; onClose: () => void }) {
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

// Tier Badge Component
function TierBadge({ tier, small = false }: { tier: string; small?: boolean }) {
  const style = TIER_STYLES[tier] || TIER_STYLES.star_forged;
  const tierName = tier.replace('_', ' ').toUpperCase();
  
  return (
    <span 
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${small ? 'text-[8px]' : ''}`}
      style={{ 
        color: style.color, 
        backgroundColor: style.bgColor,
        border: `1px solid ${style.borderColor}`,
      }}
    >
      {tierName}
    </span>
  );
}

/**
 * Check if user is missing required social connections for a raffle
 */
function getMissingSocialRequirements(
  raffle: Raffle, 
  socialConnections: SocialConnections | null
): { missesX: boolean; missesDiscord: boolean; hasMissing: boolean; message: string } {
  const missesX = raffle.require_x === 1 && !socialConnections?.hasX;
  const missesDiscord = raffle.require_discord === 1 && !socialConnections?.hasDiscord;
  const hasMissing = missesX || missesDiscord;
  
  let message = '';
  if (missesX) {
    message += 'Connect your X (Twitter) account';
  }
  if (missesX && missesDiscord) {
    message += ' and ';
  }
  if (missesDiscord) {
    message += 'Connect your Discord account';
  }
  if (hasMissing) {
    message += ' to enter this raffle.';
  }
  
  return { missesX, missesDiscord, hasMissing, message };
}

// Main Raffle Content Component
export default function RaffleContent() {
  const { address, isConnected } = useAccount();
  
  // Types for extended raffle data
  interface ActiveRaffleData {
    raffle: Raffle;
    entries: RaffleEntry[];
    stats: RaffleStats;
    userEntry: RaffleEntry | null;
    socialConnections: SocialConnections | null;
    userTier: UserTier | null;
  }
  
  // State - now supporting multiple active raffles
  const [activeRaffles, setActiveRaffles] = useState<ActiveRaffleData[]>([]);
  const [pastRaffles, setPastRaffles] = useState<Raffle[]>([]);
  const [userTier, setUserTier] = useState<UserTier | null>(null);
  const [holderTiers, setHolderTiers] = useState<HolderTiers | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [enteringRaffleId, setEnteringRaffleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userSocialConnections, setUserSocialConnections] = useState<SocialConnections | null>(null);
  
  // Tab state for switching between Active Raffles and History
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  
  // Animation states
  const [showWinAnimation, setShowWinAnimation] = useState(false);
  const [showLoseAnimation, setShowLoseAnimation] = useState(false);
  const [showEntryConfirmation, setShowEntryConfirmation] = useState(false);
  const [entryConfirmData, setEntryConfirmData] = useState<{ entries: number; tier: string; raffleName: string } | null>(null);
  const [winAnimationData, setWinAnimationData] = useState<{ raffleName: string; prizeName: string } | null>(null);
  const [showTierBreakdown, setShowTierBreakdown] = useState(false);
  
  /**
   * Helper function to check and show win/lose animation for a drawn raffle
   * Returns true if animation was triggered (to avoid showing multiple animations)
   */
  const checkAndShowResultAnimation = async (
    raffleData: { raffle: Raffle; userEntry: RaffleEntry | null; hasViewedResult: boolean },
    userAddress: string
  ): Promise<boolean> => {
    // Only show animation for drawn raffles the user entered and hasn't viewed yet
    if (raffleData.raffle.status !== 'drawn' || !raffleData.userEntry || raffleData.hasViewedResult) {
      return false;
    }
    
    const isWinner = raffleData.raffle.winner_address?.toLowerCase() === userAddress.toLowerCase();
    
    if (isWinner) {
      setWinAnimationData({
        raffleName: raffleData.raffle.name,
        prizeName: raffleData.raffle.prize_description,
      });
      setShowWinAnimation(true);
    } else {
      setShowLoseAnimation(true);
    }
    
    // Mark as viewed so animation only shows once
    const walletAuthHeader = await getWalletAuthHeader(userAddress);
    if (!walletAuthHeader) {
      return true;
    }

    await fetch('/api/raffle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-auth': walletAuthHeader,
      },
      body: JSON.stringify({
        action: 'markViewed',
        walletAddress: userAddress,
        raffleId: raffleData.raffle.id,
      }),
    });
    
    return true;
  };

  // Fetch ALL active and past raffles
  const fetchIdRef = useRef(0);
  const fetchRaffles = useCallback(async () => {
    // Request-id guard: if a newer fetchRaffles starts (e.g. wallet switch), the
    // older one's results are discarded instead of clobbering fresh state.
    const myId = ++fetchIdRef.current;
    const isStale = () => fetchIdRef.current !== myId;
    try {
      setIsLoading(true);

      // Fetch both active and past raffles
      const [activeRes, pastRes] = await Promise.all([
        fetch(`/api/raffle?type=active${address ? `&address=${address}` : ''}`),
        fetch(`/api/raffle?type=past${address ? `&address=${address}` : ''}`),
      ]);

      const activeData = await activeRes.json();
      const pastData = await pastRes.json();
      if (isStale()) return;

      // Track if we've shown an animation to avoid showing multiple
      let animationShown = false;

      // Always set past raffles for the History tab
      if (pastData.success) {
        setPastRaffles(pastData.raffles || []);
        setHolderTiers(pastData.holderTiers);

        // Check past (drawn) raffles for win/lose animation. Fetch the details for
        // all drawn-with-entry raffles in PARALLEL, then walk them in order and
        // show the first eligible animation.
        if (address && pastData.raffles) {
          const drawn = (pastData.raffles as Raffle[]).filter(
            (r) => r.status === 'drawn' && r.userEntry
          );
          const details = await Promise.all(
            drawn.map((r) => fetch(`/api/raffle?id=${r.id}&address=${address}`).then((res) => res.json()))
          );
          if (isStale()) return;
          for (const detailData of details) {
            if (detailData.success && !animationShown) {
              animationShown = await checkAndShowResultAnimation(
                {
                  raffle: detailData.raffle,
                  userEntry: detailData.userEntry,
                  hasViewedResult: detailData.hasViewedResult,
                },
                address
              );
              if (animationShown) break;
            }
          }
        }
      }

      if (activeData.success && activeData.raffles.length > 0) {
        // Fetch detailed data for ALL active raffles in parallel
        const raffleDetailsPromises = activeData.raffles.map(async (raffle: Raffle) => {
          const detailRes = await fetch(`/api/raffle?id=${raffle.id}${address ? `&address=${address}` : ''}`);
          const detailData = await detailRes.json();

          if (detailData.success) {
            // Store social connections for later use
            if (detailData.socialConnections) {
              setUserSocialConnections(detailData.socialConnections);
            }

            // Check for winner animation (edge case: drawn but still briefly "active")
            if (!animationShown && address) {
              animationShown = await checkAndShowResultAnimation(
                {
                  raffle: detailData.raffle,
                  userEntry: detailData.userEntry,
                  hasViewedResult: detailData.hasViewedResult,
                },
                address
              );
            }

            return {
              raffle: detailData.raffle,
              entries: detailData.entries || [],
              stats: detailData.stats || { participants: 0, totalTickets: 0 },
              userEntry: detailData.userEntry,
              socialConnections: detailData.socialConnections,
              userTier: detailData.userTier,
              holderTiers: detailData.holderTiers,
            } as ActiveRaffleData & { holderTiers?: typeof holderTiers };
          }
          return null;
        });

        const raffleDetails = (await Promise.all(raffleDetailsPromises)).filter(
          (r): r is ActiveRaffleData & { holderTiers?: typeof holderTiers } => r !== null
        );
        if (isStale()) return;
        setActiveRaffles(raffleDetails);

        // Reuse the first raffle's ALREADY-FETCHED detail for the user's tier
        // (was a redundant extra round-trip).
        if (raffleDetails.length > 0) {
          const first = raffleDetails[0];
          setUserTier(first.userTier);
          if (first.holderTiers) setHolderTiers(first.holderTiers);
        }
      } else if (!isStale()) {
        setActiveRaffles([]);
      }
    } catch (err) {
      console.error('Error fetching raffles:', err);
      if (!isStale()) setError('Failed to load raffles');
    } finally {
      if (!isStale()) setIsLoading(false);
    }
  }, [address]);
  
  useEffect(() => {
    fetchRaffles();
  }, [fetchRaffles]);
  
  // Enter a specific raffle with optional engagement bonus
  const handleEnterRaffle = async (raffleId: string, raffleName: string, engagementBonus = false) => {
    if (!address) return;
    
    setEnteringRaffleId(raffleId);
    setError(null);
    
    try {
      const walletAuthHeader = await getWalletAuthHeader(address);
      if (!walletAuthHeader) {
        setError('Wallet signature required to enter raffle');
        return;
      }

      const res = await fetch('/api/raffle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-auth': walletAuthHeader,
        },
        body: JSON.stringify({
          action: 'enter',
          walletAddress: address,
          raffleId,
          engagementBonus,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setEntryConfirmData({ entries: data.entry.entries_count, tier: data.entry.tier, raffleName });
        setShowEntryConfirmation(true);
        
        // Refresh data
        await fetchRaffles();
      } else {
        setError(data.error || 'Failed to enter raffle');
      }
    } catch (err) {
      setError('Failed to enter raffle');
      console.error(err);
    } finally {
      setEnteringRaffleId(null);
    }
  };
  
  // Memoized tier info display
  const tierInfoDisplay = useMemo(() => {
    if (!holderTiers) return null;
    
    const tiers = [
      { key: 'cosmic_emperor', ...holderTiers.cosmic_emperor },
      { key: 'star_lord', ...holderTiers.star_lord },
      { key: 'cosmic_warden', ...holderTiers.cosmic_warden },
      { key: 'star_forged', ...holderTiers.star_forged },
    ];
    
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tiers.map((tier) => {
          const style = TIER_STYLES[tier.key];
          return (
            <div 
              key={tier.key}
              className="p-3 rounded-lg text-center"
              style={{ backgroundColor: style.bgColor, border: `1px solid ${style.borderColor}` }}
            >
              <div className="text-[10px] font-bold mb-1" style={{ color: style.color }}>
                {tier.name.toUpperCase()}
              </div>
              <div className="text-white text-xs">
                {tier.minStars}+ Stars = {tier.entries} {tier.entries > 1 ? 'Entries' : 'Entry'}
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [holderTiers]);
  
  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-bounce">🎰</div>
          <p className="text-gray-400 text-sm">Loading raffles...</p>
        </div>
      </div>
    );
  }
  
  // No active raffles
  if (activeRaffles.length === 0) {
    return (
      <>
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🎰</div>
          <h1 className="text-[#ffd700] text-2xl tracking-wider mb-2">COSMIC RAFFLE</h1>
          <p className="text-gray-400 text-xs">
            Exclusive raffles for Star Skrumpey holders
          </p>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex gap-2 justify-center mb-6">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
              activeTab === 'active'
                ? 'bg-[#ffd700]/20 border-[#ffd700] text-[#ffd700]'
                : 'bg-[#1a1a2e] border-[#2a2a4e] text-gray-400 hover:border-[#ffd700]/50'
            }`}
          >
            🎟️ ACTIVE RAFFLES
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
              activeTab === 'history'
                ? 'bg-[#9966ff]/20 border-[#9966ff] text-[#9966ff]'
                : 'bg-[#1a1a2e] border-[#2a2a4e] text-gray-400 hover:border-[#9966ff]/50'
            }`}
          >
            📜 HISTORY
          </button>
        </div>
        
        {/* Active Tab Content */}
        {activeTab === 'active' && (
          <>
            {/* Tier info */}
            <div className="pixel-card p-6 mb-6">
              <h2 className="text-[#9966ff] text-sm tracking-wider mb-4 text-center">🏆 HOLDER TIERS</h2>
              {tierInfoDisplay}
              <p className="text-gray-500 text-[10px] text-center mt-4">
                More Star Skrumpeys = More entries per raffle!
              </p>
            </div>
            
            {/* No raffle message */}
            <div className="pixel-card p-8 text-center">
              <div className="text-4xl mb-4">😴</div>
              <h2 className="text-gray-400 text-lg mb-2">No Active Raffles</h2>
              <p className="text-gray-500 text-xs">
                Check back soon for the next cosmic drawing!
              </p>
            </div>
          </>
        )}
        
        {/* History Tab Content */}
        {activeTab === 'history' && (
          <>
            {/* Verifiable Randomness Explanation */}
            <div className="pixel-card p-6 mb-6 border-2 border-[#00ffff]/30">
              <h2 className="text-[#00ffff] text-sm tracking-wider mb-3 text-center">
                🔐 VERIFIABLE RANDOM SELECTION
              </h2>
              <div className="text-gray-400 text-[10px] space-y-2">
                <p>
                  Our raffle system uses <span className="text-[#00ffff]">cryptographically verifiable randomness</span> to ensure fair winner selection. Here&apos;s how it works:
                </p>
                <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e]">
                  <p className="text-[#ffd700] text-[9px] mb-2">SEED GENERATION:</p>
                  <p className="font-mono text-[8px] text-gray-500 break-all">
                    seed = blockHash + raffleId + timestamp + entryCount
                  </p>
                </div>
                <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e]">
                  <p className="text-[#ffd700] text-[9px] mb-2">WINNER SELECTION:</p>
                  <p className="font-mono text-[8px] text-gray-500">
                    1. SHA-256 hash of seed string<br/>
                    2. First 4 bytes → 32-bit number<br/>
                    3. winnerIndex = number % totalTickets
                  </p>
                </div>
                <p className="text-[#44ff88] text-[9px] mt-2">
                  ✓ Anyone can verify by reproducing the hash calculation with the published seed!
                </p>
              </div>
            </div>
            
            {/* Past Raffles List */}
            <div className="pixel-card p-6">
              <h2 className="text-[#9966ff] text-sm tracking-wider mb-4 text-center">
                📜 PAST RAFFLES
              </h2>
              
              {pastRaffles.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-4xl mb-4 opacity-50">📜</div>
                  <p className="text-gray-500 text-xs">No past raffles yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pastRaffles.map((raffle) => (
                    <div 
                      key={raffle.id}
                      className={`p-4 rounded-lg border-2 ${
                        raffle.status === 'drawn' 
                          ? 'bg-[#ffd700]/5 border-[#ffd700]/30' 
                          : 'bg-[#0a0a15] border-[#2a2a4e]'
                      }`}
                    >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-white text-sm font-bold">{raffle.name}</h3>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Public/SWO Label */}
                        {raffle.is_public === 1 ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#00ffff]/20 text-[#00ffff] border border-[#00ffff]/30">
                            PUBLIC
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#9966ff]/20 text-[#9966ff] border border-[#9966ff]/30">
                            SWO
                          </span>
                        )}
                        {/* Status Badge */}
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          raffle.status === 'drawn' ? 'bg-[#44ff88]/20 text-[#44ff88]' :
                          raffle.status === 'ended' ? 'bg-[#9966ff]/20 text-[#9966ff]' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {raffle.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-gray-400 text-[10px] mb-3">{raffle.prize_description}</p>
                    
                    {/* Winner Info */}
                    {raffle.status === 'drawn' && raffle.winner_address && (
                        <div className="bg-[#ffd700]/10 rounded p-3 mb-3 border border-[#ffd700]/20">
                          <p className="text-[#ffd700] text-[10px] mb-1">🏆 WINNER</p>
                          <p className="text-white text-xs font-mono">
                            {raffle.winner_address.slice(0, 8)}...{raffle.winner_address.slice(-6)}
                          </p>
                        </div>
                      )}
                      
                      {/* Verification Seed */}
                      {raffle.winner_draw_seed && (
                        <details className="text-left">
                          <summary className="cursor-pointer text-[#00ffff] text-[9px] hover:text-[#44ffff] transition-colors">
                            🔒 View Verification Seed
                          </summary>
                          <div className="mt-2 bg-black/30 rounded p-2 border border-[#00ffff]/20">
                            <p className="text-[#00ffff] text-[7px] font-mono break-all">
                              {raffle.winner_draw_seed}
                            </p>
                            {raffle.winner_drawn_at && (
                              <p className="text-gray-500 text-[8px] mt-1">
                                Drawn: {new Date(raffle.winner_drawn_at).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </details>
                      )}
                      
                      {/* Raffle timing */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#2a2a4e]">
                        <p className="text-gray-600 text-[8px]">
                          Ended: {new Date(raffle.end_time).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </>
    );
  }
  
  // Active raffles display - now shows multiple raffles
  return (
    <>
      {/* Animations */}
      {showWinAnimation && (
        <WinAnimation 
          raffleName={winAnimationData?.raffleName}
          prizeName={winAnimationData?.prizeName}
          onClose={() => setShowWinAnimation(false)} 
        />
      )}
      {showLoseAnimation && <LoseAnimation onClose={() => setShowLoseAnimation(false)} />}
      {showEntryConfirmation && entryConfirmData && (
        <EntryConfirmation 
          entries={entryConfirmData.entries} 
          tier={entryConfirmData.tier}
          raffleName={entryConfirmData.raffleName}
          onClose={() => setShowEntryConfirmation(false)}
        />
      )}
      
      {/* Header */}
      <div className="text-center mb-6 sm:mb-8">
        <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">🎰</div>
        <h1 className="text-[#ffd700] text-xl sm:text-2xl tracking-wider mb-2">COSMIC RAFFLE</h1>
        <p className="text-gray-400 text-[10px] sm:text-xs">
          Exclusive prizes for Star Skrumpey holders
        </p>
      </div>
      
      {/* Tab Navigation - More compact on mobile */}
      <div className="flex gap-2 justify-center mb-4 sm:mb-6 px-2">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-bold border-2 transition-all ${
            activeTab === 'active'
              ? 'bg-[#ffd700]/20 border-[#ffd700] text-[#ffd700]'
              : 'bg-[#1a1a2e] border-[#2a2a4e] text-gray-400 hover:border-[#ffd700]/50'
          }`}
        >
          🎟️ <span className="hidden xs:inline">ACTIVE </span>RAFFLES {activeRaffles.length > 0 && `(${activeRaffles.length})`}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-bold border-2 transition-all ${
            activeTab === 'history'
              ? 'bg-[#9966ff]/20 border-[#9966ff] text-[#9966ff]'
              : 'bg-[#1a1a2e] border-[#2a2a4e] text-gray-400 hover:border-[#9966ff]/50'
          }`}
        >
          📜 HISTORY
        </button>
      </div>
      
      {/* Active Raffles Tab */}
      {activeTab === 'active' && (
        <>
          {activeRaffles.length > 1 && (
            <p className="text-[#ff6ec7] text-xs text-center mb-4">
              🎉 {activeRaffles.length} Active Raffles!
            </p>
          )}
      {activeRaffles.map((raffleData) => {
        const activeRaffle = raffleData.raffle;
        return (
      <div key={activeRaffle.id} className="pixel-card p-4 sm:p-6 mb-4 sm:mb-6">
        {/* Raffle Name & Status */}
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-[#ffd700] text-base sm:text-lg truncate pr-2">{activeRaffle.name}</h2>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Public/SWO Label */}
            {activeRaffle.is_public === 1 ? (
              <span className="px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-bold bg-[#00ffff]/20 text-[#00ffff] border border-[#00ffff]/30">
                PUBLIC
              </span>
            ) : (
              <span className="px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-bold bg-[#9966ff]/20 text-[#9966ff] border border-[#9966ff]/30">
                SWO
              </span>
            )}
            {/* Status Badge */}
            <span className={`px-2 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-bold ${
              activeRaffle.status === 'active' ? 'bg-[#44ff88]/20 text-[#44ff88]' :
              activeRaffle.status === 'drawn' ? 'bg-[#ffd700]/20 text-[#ffd700]' :
              'bg-gray-500/20 text-gray-400'
            }`}>
              {activeRaffle.status.toUpperCase()}
            </span>
          </div>
        </div>
        
        {/* Public Raffle Explainer */}
        {activeRaffle.is_public === 1 && (
          <div className="bg-[#00ffff]/10 border border-[#00ffff]/30 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
            <div className="flex items-start gap-2">
              <span className="text-[#00ffff] text-lg sm:text-xl flex-shrink-0">ℹ️</span>
              <div className="flex-1">
                <p className="text-[#00ffff] text-xs sm:text-sm font-bold mb-2">PUBLIC RAFFLE ENTRY RULES</p>
                <div className="space-y-1.5 text-[10px] sm:text-xs text-gray-300">
                  <p>• <span className="text-[#44ff88] font-semibold">Each Skrumpey</span> = <span className="text-[#ffd700]">1 Entry</span></p>
                  <p>• <span className="text-[#ffd700] font-semibold">Star Holders</span> = <span className="text-[#ffd700]">+5 Bonus</span> + <span className="text-[#9966ff]">Tier Perk</span></p>
                  <p className="text-gray-500 text-[9px] italic mt-1">Example: 4 Skrumpey + 1 Star (Star Forged) = 4 + 6 = 10 entries</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Prize Display */}
        <div className="bg-[#0a0a15] rounded-lg p-3 sm:p-4 mb-3 sm:mb-4 border border-[#ffd700]/30">
          <div className="flex items-start gap-3 sm:gap-4">
            {activeRaffle.prize_image_url ? (
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0">
                <Image
                  src={activeRaffle.prize_image_url}
                  alt="Prize"
                  fill
                  className="object-cover rounded-lg"
                  sizes="80px"
                />
              </div>
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0 bg-[#1a1a2e] rounded-lg flex items-center justify-center text-2xl sm:text-3xl">
                🎁
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[#ffd700] text-[10px] sm:text-xs mb-1">PRIZE</p>
              <p className="text-white text-xs sm:text-sm">{activeRaffle.prize_description}</p>
              {/* Additional Info (description) - smaller font, below prize */}
              {activeRaffle.description && (
                <p className="text-gray-500 text-[9px] sm:text-[10px] mt-2 italic line-clamp-2">{activeRaffle.description}</p>
              )}
            </div>
          </div>
        </div>
        
        {/* Timer */}
        {activeRaffle.status === 'active' && (
          <div className="text-center mb-4">
            <p className="text-gray-500 text-xs mb-1">TIME REMAINING</p>
            <CountdownTimer endTime={activeRaffle.end_time} />
          </div>
        )}
        
        {/* Winner Display (for drawn raffles) */}
        {activeRaffle.status === 'drawn' && activeRaffle.winner_address && (
          <div className="bg-[#ffd700]/10 border border-[#ffd700] rounded-lg p-4 mb-4 text-center">
            <p className="text-[#ffd700] text-xs mb-2">🏆 WINNER 🏆</p>
            <p className="text-white text-lg font-bold">
              {activeRaffle.winner_address.slice(0, 6)}...{activeRaffle.winner_address.slice(-4)}
            </p>
            {address && activeRaffle.winner_address.toLowerCase() === address.toLowerCase() && (
              <p className="text-[#44ff88] text-sm mt-2 animate-pulse">
                That&apos;s YOU! Congratulations! 🎉
              </p>
            )}
            
            {/* Verifiable Randomness Section */}
            {activeRaffle.winner_draw_seed && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-[#00ffff] text-[10px] hover:text-[#44ffff] transition-colors">
                  🔒 VERIFY FAIR SELECTION
                </summary>
                <div className="mt-2 bg-black/30 rounded p-3 border border-[#00ffff]/30">
                  <p className="text-gray-400 text-[9px] mb-2">
                    Winner was selected using verifiable randomness (SHA-256 hash):
                  </p>
                  <div className="bg-black/50 rounded p-2 mb-2">
                    <p className="text-[#00ffff] text-[8px] font-mono break-all">
                      {activeRaffle.winner_draw_seed}
                    </p>
                  </div>
                  <p className="text-gray-500 text-[8px]">
                    ℹ️ This seed combines block hash + raffle ID + timestamp + entry count. 
                    The first 4 bytes of the SHA-256 hash determine the winning ticket index.
                  </p>
                  {activeRaffle.winner_drawn_at && (
                    <p className="text-gray-600 text-[8px] mt-1">
                      Drawn: {new Date(activeRaffle.winner_drawn_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </details>
            )}
          </div>
        )}
        
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-[#0a0a15] rounded-lg p-3 text-center">
            <p className="text-[#9966ff] text-2xl font-bold">{raffleData.stats.participants}</p>
            <p className="text-gray-500 text-[10px]">PARTICIPANTS</p>
          </div>
          <div className="bg-[#0a0a15] rounded-lg p-3 text-center">
            <p className="text-[#00ffff] text-2xl font-bold">{raffleData.stats.totalTickets}</p>
            <p className="text-gray-500 text-[10px]">TOTAL TICKETS</p>
          </div>
        </div>
        
        {/* Social Requirements */}
        {(activeRaffle.require_x === 1 || activeRaffle.require_discord === 1) && (
          <div className="bg-[#ff4466]/10 border border-[#ff4466]/30 rounded-lg p-3 mb-4">
            <p className="text-[#ff4466] text-[10px] mb-2">⚠️ REQUIREMENTS TO ENTER:</p>
            <div className="flex gap-2 flex-wrap">
              {activeRaffle.require_x === 1 && (
                <span className={`text-[9px] px-2 py-1 rounded border ${
                  userSocialConnections?.hasX 
                    ? 'bg-[#44ff88]/20 border-[#44ff88] text-[#44ff88]' 
                    : 'bg-black/50 border-gray-600 text-gray-300'
                }`}>
                  {userSocialConnections?.hasX ? '✓' : '✗'} X (Twitter) Connected
                </span>
              )}
              {activeRaffle.require_discord === 1 && (
                <span className={`text-[9px] px-2 py-1 rounded border ${
                  userSocialConnections?.hasDiscord 
                    ? 'bg-[#44ff88]/20 border-[#44ff88] text-[#44ff88]' 
                    : 'bg-[#5865F2]/20 border-[#5865F2] text-[#7289DA]'
                }`}>
                  {userSocialConnections?.hasDiscord ? '✓' : '✗'} Discord Connected
                </span>
              )}
            </div>
            {isConnected && ((activeRaffle.require_x === 1 && !userSocialConnections?.hasX) || (activeRaffle.require_discord === 1 && !userSocialConnections?.hasDiscord)) && (
              <a 
                href="/profile?tab=settings"
                className="text-[#00ffff] text-[9px] hover:underline mt-2 inline-block"
              >
                → Connect in Profile Settings
              </a>
            )}
          </div>
        )}
        
        {/* Entry Section */}
        {activeRaffle.status === 'active' && (
          <div className="border-t border-[#2a2a4e] pt-4">
            {!isConnected ? (
              <div className="text-center">
                <p className="text-gray-400 text-xs mb-3">Connect your wallet to enter</p>
                <WalletConnect />
              </div>
            ) : raffleData.userEntry ? (
              <div className="text-center">
                <div className="bg-[#44ff88]/10 border border-[#44ff88] rounded-lg p-4">
                  <p className="text-[#44ff88] text-sm mb-2">✅ You&apos;re Entered!</p>
                  <div className="flex items-center justify-center gap-2">
                    <TierBadge tier={raffleData.userEntry.tier} />
                    <span className="text-white text-xs">
                      {raffleData.userEntry.entries_count} Ticket{raffleData.userEntry.entries_count > 1 ? 's' : ''}
                    </span>
                  </div>
                  {/* Show bonuses applied - only Like & RT bonus now */}
                  {raffleData.userEntry.engagement_bonus > 0 && (
                    <div className="flex gap-2 justify-center mt-2">
                      <span className="text-[8px] px-1.5 py-0.5 bg-[#44ff88]/20 text-[#44ff88] rounded">
                        +{raffleData.userEntry.engagement_bonus} Like & RT
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Engagement bonus option (Like & RT) */}
                {activeRaffle.tweet_url && !raffleData.userEntry.engagement_bonus && (
                  <div className="mt-3 p-3 bg-[#44ff88]/10 border border-[#44ff88]/30 rounded-lg">
                    <p className="text-[#44ff88] text-[10px] mb-2">🔥 BONUS ENTRY AVAILABLE!</p>
                    <a 
                      href={activeRaffle.tweet_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#00ffff] text-xs hover:underline block mb-2"
                    >
                      1. Like & Retweet this tweet →
                    </a>
                    <button
                      onClick={() => handleEnterRaffle(activeRaffle.id, activeRaffle.name, true)}
                      disabled={enteringRaffleId === activeRaffle.id}
                      className="pixel-btn text-xs w-full"
                    >
                      {enteringRaffleId === activeRaffle.id ? 'UPDATING...' : '2. CLAIM +1 ENTRY FOR LIKE & RT'}
                    </button>
                    <p className="text-[#ff6ec7] text-[9px] mt-2 italic">
                      ⚠️ Entries will be checked manually. If you claim this bonus without liking &amp; retweeting, your entry may be disqualified.
                    </p>
                  </div>
                )}
                

              </div>
            ) : (
              <div className="text-center">
                {/* Check social requirements first */}
                {(() => {
                  const socialReqs = getMissingSocialRequirements(activeRaffle, userSocialConnections);
                  if (socialReqs.hasMissing) {
                    return (
                      <div className="bg-[#ff4466]/10 border border-[#ff4466]/30 rounded-lg p-4">
                        <p className="text-[#ff4466] text-sm mb-2">⚠️ Social Connection Required</p>
                        <p className="text-gray-400 text-xs mb-3">
                          {socialReqs.message}
                        </p>
                        <a 
                          href="/profile?tab=settings"
                          className="pixel-btn text-xs"
                        >
                          GO TO PROFILE SETTINGS
                        </a>
                      </div>
                    );
                  }
                  return null;
                })()}
                {!getMissingSocialRequirements(activeRaffle, userSocialConnections).hasMissing && raffleData.userTier ? (
                  <>
                    <div className="mb-3">
                      {/* Clickable Tier Card */}
                      <button 
                        onClick={() => setShowTierBreakdown(!showTierBreakdown)}
                        className="w-full p-2.5 bg-[#0a0a15]/80 border border-[#2a2a4e] hover:border-[#00ffff]/50 rounded-lg transition-all cursor-pointer group"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-gray-500 text-[10px] group-hover:text-[#00ffff] transition-colors">
                            📊 Your Entries
                          </span>
                          <span className="text-gray-500 text-[9px] group-hover:text-[#00ffff] transition-colors">
                            {showTierBreakdown ? '▲ hide' : '▼ details'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <TierBadge tier={raffleData.userTier.tier} />
                          <p className="text-white text-lg font-bold">
                            {raffleData.userTier.entries} <span className="text-xs font-normal text-gray-400">{raffleData.userTier.entries > 1 ? 'entries' : 'entry'}</span>
                          </p>
                        </div>
                      </button>
                      
                      {/* Tier Breakdown Panel */}
                      {showTierBreakdown && (
                        <div className="mt-2 p-3 bg-[#0a0a15] border border-[#00ffff]/30 rounded-lg text-[10px]">
                          <p className="text-[#00ffff] font-bold mb-2">📊 ENTRY CALCULATION</p>
                          
                          {activeRaffle.is_public === 1 ? (
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-gray-300">
                                <span>🐸 Total Skrumpeys:</span>
                                <span className="text-white font-bold">{raffleData.userTier.totalSkrumpeys ?? '-'}</span>
                              </div>
                              {raffleData.userTier.starBonus !== undefined && (
                                <>
                                  <div className="flex justify-between text-gray-300">
                                    <span>⭐ Star Skrumpeys:</span>
                                    <span className="text-[#ffd700] font-bold">
                                      {(raffleData.userTier.totalSkrumpeys ?? 0) - (raffleData.userTier.regularSkrumpeys ?? 0)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-gray-300">
                                    <span>🐸 Regular Skrumpeys:</span>
                                    <span className="text-white font-bold">{raffleData.userTier.regularSkrumpeys ?? 0}</span>
                                  </div>
                                  <div className="border-t border-[#2a2a4e] my-2 pt-2">
                                    <p className="text-gray-400 mb-1">Calculation:</p>
                                    <p className="text-gray-300">
                                      {raffleData.userTier.regularSkrumpeys ?? 0} regular × 1 = <span className="text-[#44ff88]">{raffleData.userTier.regularSkrumpeys ?? 0}</span>
                                    </p>
                                    <p className="text-gray-300">
                                      Star bonus (5 + {raffleData.userTier.starBonus - 5} tier) = <span className="text-[#ffd700]">{raffleData.userTier.starBonus}</span>
                                    </p>
                                    <p className="text-white font-bold mt-1">
                                      Total: {raffleData.userTier.regularSkrumpeys ?? 0} + {raffleData.userTier.starBonus} = {raffleData.userTier.entries}
                                    </p>
                                  </div>
                                </>
                              )}
                              {raffleData.userTier.starBonus === undefined && (
                                <div className="border-t border-[#2a2a4e] my-2 pt-2">
                                  <p className="text-gray-300">
                                    {raffleData.userTier.regularSkrumpeys ?? raffleData.userTier.entries} Skrumpey × 1 = <span className="text-[#44ff88]">{raffleData.userTier.entries}</span> entries
                                  </p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <p className="text-gray-300">Star-only raffle: {raffleData.userTier.entries} entries from {raffleData.userTier.name} tier</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleEnterRaffle(activeRaffle.id, activeRaffle.name, false)}
                      disabled={enteringRaffleId === activeRaffle.id}
                      className="pixel-btn pixel-btn-gold text-xs w-full mb-2"
                    >
                      {enteringRaffleId === activeRaffle.id ? 'ENTERING...' : '🎟️ ENTER RAFFLE'}
                    </button>
                    
                    {/* Engagement bonus (Like & RT) at entry time */}
                    {activeRaffle.tweet_url && (
                      <div className="mt-3 p-3 bg-[#0a0a15] border border-[#44ff88]/30 rounded-lg">
                        <p className="text-[#44ff88] text-[10px] mb-2">🔥 GET +1 BONUS ENTRY!</p>
                        <a 
                          href={activeRaffle.tweet_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#00ffff] text-xs hover:underline block mb-2"
                        >
                          1. Like & Retweet this tweet →
                        </a>
                        <button
                          onClick={() => handleEnterRaffle(activeRaffle.id, activeRaffle.name, true)}
                          disabled={enteringRaffleId === activeRaffle.id}
                          className="pixel-btn text-xs w-full"
                        >
                          {enteringRaffleId === activeRaffle.id ? 'ENTERING...' : '2. ENTER + CLAIM LIKE & RT BONUS'}
                        </button>
                        <p className="text-[#ff6ec7] text-[9px] mt-2 italic">
                          ⚠️ Entries will be checked manually. If you claim this bonus without liking &amp; retweeting, your entry may be disqualified.
                        </p>
                      </div>
                    )}
                    

                  </>
                ) : !getMissingSocialRequirements(activeRaffle, userSocialConnections).hasMissing ? (
                  <div className="text-center">
                    {activeRaffle.is_public === 1 ? (
                      <>
                        <p className="text-[#ff4466] text-xs mb-2">
                          You must own at least 1 Skrumpey to enter
                        </p>
                        <a 
                          href="https://magiceden.io/collections/monad/skrumpeys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pixel-btn text-xs"
                        >
                          GET A SKRUMPEY
                        </a>
                      </>
                    ) : (
                      <>
                        <p className="text-[#ff4466] text-xs mb-2">
                          You must own at least 1 Star Skrumpey to enter
                        </p>
                        <a 
                          href="https://magiceden.io/collections/monad/skrumpeys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pixel-btn text-xs"
                        >
                          GET A STAR SKRUMPEY
                        </a>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            )}
            
            {error && (
              <p className="text-[#ff4466] text-xs text-center mt-3">{error}</p>
            )}
          </div>
        )}
        
        {/* Entries List (collapsible for each raffle) */}
        {raffleData.entries.length > 0 && (
          <div className="mt-4 border-t border-[#2a2a4e] pt-4">
            <details className="group">
              <summary className="cursor-pointer text-[#00ffff] text-xs tracking-wider mb-2 flex items-center gap-2">
                <span className="transition-transform group-open:rotate-90">▶</span>
                📜 ENTRIES ({raffleData.entries.length})
              </summary>
              <div className="space-y-2 max-h-40 overflow-y-auto mt-2">
                {raffleData.entries.map((entry) => (
                  <div 
                    key={entry.id}
                    className={`flex items-center justify-between p-2 rounded-lg ${
                      address && entry.wallet_address.toLowerCase() === address.toLowerCase()
                        ? 'bg-[#ffd700]/10 border border-[#ffd700]/30'
                        : 'bg-[#0a0a15]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs font-mono">
                        {entry.display_name || `${entry.wallet_address.slice(0, 6)}...${entry.wallet_address.slice(-4)}`}
                      </span>
                      <TierBadge tier={entry.tier} small />
                    </div>
                    <span className="text-white text-xs">
                      {entry.entries_count} 🎟️
                    </span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
        );
      })}
      
      {/* Tier Info - in active tab */}
      <div className="pixel-card p-6 mb-6">
        <h2 className="text-[#9966ff] text-sm tracking-wider mb-4 text-center">🏆 HOLDER TIERS</h2>
        {tierInfoDisplay}
        <p className="text-gray-500 text-[10px] text-center mt-4">
          More Star Skrumpeys = More entries per raffle!
        </p>
        
        {/* Public Raffle Explainer */}
        {activeRaffles.some(r => r.raffle.is_public === 1) && (
          <div className="mt-6 pt-6 border-t border-[#2a2a4e]">
            <div className="bg-[#00ffff]/10 border border-[#00ffff]/30 rounded-lg p-4">
              <p className="text-[#00ffff] text-xs font-bold mb-2 text-center">ℹ️ PUBLIC RAFFLE ENTRY RULES</p>
              <div className="space-y-1.5 text-[10px] text-gray-300">
                <p className="text-center">• <span className="text-[#44ff88] font-semibold">Each Skrumpey</span> = <span className="text-[#ffd700]">1 Entry</span></p>
                <p className="text-center">• <span className="text-[#ffd700] font-semibold">Star Holders</span> = <span className="text-[#ffd700]">+5 Bonus</span> + <span className="text-[#9966ff]">Tier Perk</span></p>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* No active raffles message */}
      {activeRaffles.length === 0 && (
        <div className="pixel-card p-8 text-center">
          <div className="text-4xl mb-4">😴</div>
          <h2 className="text-gray-400 text-lg mb-2">No Active Raffles</h2>
          <p className="text-gray-500 text-xs">
            Check back soon for the next cosmic drawing!
          </p>
        </div>
      )}
        </>
      )}
      
      {/* History Tab */}
      {activeTab === 'history' && (
        <>
          {/* Verifiable Randomness Explanation */}
          <div className="pixel-card p-6 mb-6 border-2 border-[#00ffff]/30">
            <h2 className="text-[#00ffff] text-sm tracking-wider mb-3 text-center">
              🔐 VERIFIABLE RANDOM SELECTION
            </h2>
            <div className="text-gray-400 text-[10px] space-y-2">
              <p>
                Our raffle system uses <span className="text-[#00ffff]">cryptographically verifiable randomness</span> to ensure fair winner selection. Here&apos;s how it works:
              </p>
              <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e]">
                <p className="text-[#ffd700] text-[9px] mb-2">SEED GENERATION:</p>
                <p className="font-mono text-[8px] text-gray-500 break-all">
                  seed = blockHash + raffleId + timestamp + entryCount
                </p>
              </div>
              <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e]">
                <p className="text-[#ffd700] text-[9px] mb-2">WINNER SELECTION:</p>
                <p className="font-mono text-[8px] text-gray-500">
                  1. SHA-256 hash of seed string<br/>
                  2. First 4 bytes → 32-bit number<br/>
                  3. winnerIndex = number % totalTickets
                </p>
              </div>
              <p className="text-[#44ff88] text-[9px] mt-2">
                ✓ Anyone can verify by reproducing the hash calculation with the published seed!
              </p>
            </div>
          </div>
          
          {/* Past Raffles List */}
          <div className="pixel-card p-6">
            <h2 className="text-[#9966ff] text-sm tracking-wider mb-4 text-center">
              📜 PAST RAFFLES
            </h2>
            
            {pastRaffles.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4 opacity-50">📜</div>
                <p className="text-gray-500 text-xs">No past raffles yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pastRaffles.map((raffle) => (
                  <div 
                    key={raffle.id}
                    className={`p-4 rounded-lg border-2 ${
                      raffle.status === 'drawn' 
                        ? 'bg-[#ffd700]/5 border-[#ffd700]/30' 
                        : 'bg-[#0a0a15] border-[#2a2a4e]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-white text-sm font-bold">{raffle.name}</h3>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Public/SWO Label */}
                        {raffle.is_public === 1 ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#00ffff]/20 text-[#00ffff] border border-[#00ffff]/30">
                            PUBLIC
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#9966ff]/20 text-[#9966ff] border border-[#9966ff]/30">
                            SWO
                          </span>
                        )}
                        {/* Status Badge */}
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          raffle.status === 'drawn' ? 'bg-[#44ff88]/20 text-[#44ff88]' :
                          raffle.status === 'ended' ? 'bg-[#9966ff]/20 text-[#9966ff]' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {raffle.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-gray-400 text-[10px] mb-3">{raffle.prize_description}</p>
                    
                    {/* Winner Info */}
                    {raffle.status === 'drawn' && raffle.winner_address && (
                      <div className="bg-[#ffd700]/10 rounded p-3 mb-3 border border-[#ffd700]/20">
                        <p className="text-[#ffd700] text-[10px] mb-1">🏆 WINNER</p>
                        <p className="text-white text-xs font-mono">
                          {raffle.winner_address.slice(0, 8)}...{raffle.winner_address.slice(-6)}
                        </p>
                        {address && raffle.winner_address.toLowerCase() === address.toLowerCase() && (
                          <p className="text-[#44ff88] text-[9px] mt-1 animate-pulse">
                            That&apos;s you! 🎉
                          </p>
                        )}
                      </div>
                    )}
                    
                    {/* Verification Seed */}
                    {raffle.winner_draw_seed && (
                      <details className="text-left">
                        <summary className="cursor-pointer text-[#00ffff] text-[9px] hover:text-[#44ffff] transition-colors">
                          🔒 View Verification Seed
                        </summary>
                        <div className="mt-2 bg-black/30 rounded p-2 border border-[#00ffff]/20">
                          <p className="text-[#00ffff] text-[7px] font-mono break-all">
                            {raffle.winner_draw_seed}
                          </p>
                          {raffle.winner_drawn_at && (
                            <p className="text-gray-500 text-[8px] mt-1">
                              Drawn: {new Date(raffle.winner_drawn_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </details>
                    )}
                    
                    {/* Raffle timing */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#2a2a4e]">
                      <p className="text-gray-600 text-[8px]">
                        Ended: {new Date(raffle.end_time).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
