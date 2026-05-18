'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import AccessGate from '@/components/AccessGate';

// ============================================================================
// Types
// ============================================================================

interface GameInfo {
  id: string;
  name: string;
  description: string;
  emoji: string;
  status: 'live' | 'coming_soon' | 'maintenance';
  path: string;
  minBet: string;
  maxWin: string;
  rtp: string;
  color: string;
  glowColor: string;
}

interface CasinoStats {
  totalGamesPlayed: number;
  totalWagered: string;
  totalPaidOut: string;
  activeJackpots: { tier: string; amount: string }[];
}

// ============================================================================
// Constants
// ============================================================================

const GAMES: GameInfo[] = [
  {
    id: 'starforge',
    name: 'Star Forge Slots',
    description: 'Match constellation patterns on a 5x5 grid. Hit all 25 stars for the JACKPOT!',
    emoji: '⭐',
    status: 'live',
    path: '/casino/slots',
    minBet: '45 MON',
    maxWin: '4,500 MON',
    rtp: '88-91%',
    color: '#ffd700',
    glowColor: 'rgba(255, 215, 0, 0.5)',
  },
  {
    id: 'coinflip',
    name: 'Cosmic Flip',
    description: 'Classic heads or tails with 2x payout. Simple, fast, and provably fair.',
    emoji: '🪙',
    status: 'coming_soon',
    path: '/casino/coinflip',
    minBet: '10 MON',
    maxWin: '1,000 MON',
    rtp: '98%',
    color: '#00ffff',
    glowColor: 'rgba(0, 255, 255, 0.5)',
  },
  {
    id: 'roulette',
    name: 'Nebula Roulette',
    description: 'Spin the cosmic wheel. Bet on numbers, colors, or sectors for big wins.',
    emoji: '🎡',
    status: 'coming_soon',
    path: '/casino/roulette',
    minBet: '25 MON',
    maxWin: '8,750 MON',
    rtp: '97.3%',
    color: '#ff00ff',
    glowColor: 'rgba(255, 0, 255, 0.5)',
  },
  {
    id: 'dice',
    name: 'Gravity Dice',
    description: 'Roll the dice and predict high or low. Adjustable odds for risk takers.',
    emoji: '🎲',
    status: 'coming_soon',
    path: '/casino/dice',
    minBet: '5 MON',
    maxWin: '500 MON',
    rtp: '99%',
    color: '#44ff88',
    glowColor: 'rgba(68, 255, 136, 0.5)',
  },
];

// ============================================================================
// Neon Sign Component
// ============================================================================

function NeonSign({ text, color }: { text: string; color: string }) {
  return (
    <div className="relative inline-block">
      <span
        className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-wider animate-neon-flicker"
        style={{
          color: color,
          textShadow: `
            0 0 5px ${color},
            0 0 10px ${color},
            0 0 20px ${color},
            0 0 40px ${color},
            0 0 80px ${color}
          `,
          fontFamily: "'Press Start 2P', cursive",
        }}
      >
        {text}
      </span>
    </div>
  );
}

// ============================================================================
// Game Card Component
// ============================================================================

interface GameCardProps {
  game: GameInfo;
}

function GameCard({ game }: GameCardProps) {
  const isLive = game.status === 'live';
  const isComingSoon = game.status === 'coming_soon';

  return (
    <div
      className={`
        relative overflow-hidden rounded-xl border-2 transition-all duration-300
        ${isLive 
          ? 'border-[#ffd700]/50 hover:border-[#ffd700] hover:scale-[1.02] cursor-pointer' 
          : 'border-[#2a2a4e] opacity-70 cursor-not-allowed'
        }
        bg-gradient-to-br from-[#1a1a2e] to-[#0d0d1a]
      `}
      style={{
        boxShadow: isLive ? `0 0 30px ${game.glowColor}` : 'none',
      }}
    >
      {/* Status Badge */}
      <div className="absolute top-3 right-3 z-10">
        {isLive ? (
          <span className="px-2 py-1 text-[10px] font-bold bg-[#44ff88]/20 text-[#44ff88] rounded border border-[#44ff88]/50 animate-pulse">
            🎮 LIVE
          </span>
        ) : isComingSoon ? (
          <span className="px-2 py-1 text-[10px] font-bold bg-[#9966ff]/20 text-[#9966ff] rounded border border-[#9966ff]/50">
            🔮 COMING SOON
          </span>
        ) : (
          <span className="px-2 py-1 text-[10px] font-bold bg-[#ff4466]/20 text-[#ff4466] rounded border border-[#ff4466]/50">
            🔧 MAINTENANCE
          </span>
        )}
      </div>

      {/* Card Content */}
      {isLive ? (
        <Link href={game.path} className="block p-6">
          <CardInner game={game} />
        </Link>
      ) : (
        <div className="p-6">
          <CardInner game={game} />
        </div>
      )}

      {/* Decorative corner accents */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2" style={{ borderColor: game.color + '40' }} />
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2" style={{ borderColor: game.color + '40' }} />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2" style={{ borderColor: game.color + '40' }} />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2" style={{ borderColor: game.color + '40' }} />
    </div>
  );
}

function CardInner({ game }: { game: GameInfo }) {
  return (
    <>
      {/* Game Icon */}
      <div className="text-center mb-4">
        <span className="text-5xl" style={{ filter: `drop-shadow(0 0 10px ${game.glowColor})` }}>
          {game.emoji}
        </span>
      </div>

      {/* Game Name */}
      <h3
        className="text-lg font-bold text-center mb-2 tracking-wide"
        style={{ color: game.color }}
      >
        {game.name}
      </h3>

      {/* Description */}
      <p className="text-gray-400 text-xs text-center mb-4 min-h-[40px]">
        {game.description}
      </p>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 text-center border-t border-[#2a2a4e] pt-4">
        <div>
          <p className="text-[10px] text-gray-500">MIN BET</p>
          <p className="text-xs font-bold text-white">{game.minBet}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500">MAX WIN</p>
          <p className="text-xs font-bold" style={{ color: game.color }}>{game.maxWin}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500">RTP</p>
          <p className="text-xs font-bold text-[#44ff88]">{game.rtp}</p>
        </div>
      </div>

      {/* Play Button for live games */}
      {game.status === 'live' && (
        <div className="mt-4 text-center">
          <span
            className="inline-block px-6 py-2 rounded-lg font-bold text-sm transition-all"
            style={{
              backgroundColor: game.color + '20',
              color: game.color,
              border: `2px solid ${game.color}`,
            }}
          >
            PLAY NOW →
          </span>
        </div>
      )}
    </>
  );
}

// ============================================================================
// Jackpot Ticker Component
// ============================================================================

interface JackpotTickerProps {
  jackpots: { tier: string; amount: string }[];
}

function JackpotTicker({ jackpots }: JackpotTickerProps) {
  if (jackpots.length === 0) return null;

  return (
    <div className="bg-[#1a0033]/80 border-y-2 border-[#ff00ff]/30 py-3 mb-8 overflow-hidden">
      <div className="animate-scroll-left whitespace-nowrap">
        {[...jackpots, ...jackpots].map((jp, idx) => (
          <span key={idx} className="inline-flex items-center mx-8">
            <span className="text-[#ff00ff] text-xs">💰</span>
            <span className="text-white text-xs mx-2 font-bold">
              {jp.tier.toUpperCase()} JACKPOT:
            </span>
            <span className="text-[#ffd700] text-sm font-bold animate-pulse">
              {jp.amount}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Casino Stats Component
// ============================================================================

interface CasinoStatsBarProps {
  stats: CasinoStats | null;
}

function CasinoStatsBar({ stats }: CasinoStatsBarProps) {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      <div className="text-center p-4 bg-[#1a1a2e]/50 rounded-lg border border-[#2a2a4e]">
        <p className="text-[10px] text-gray-500 mb-1">TOTAL GAMES</p>
        <p className="text-xl font-bold text-[#00ffff]">
          {stats.totalGamesPlayed.toLocaleString()}
        </p>
      </div>
      <div className="text-center p-4 bg-[#1a1a2e]/50 rounded-lg border border-[#2a2a4e]">
        <p className="text-[10px] text-gray-500 mb-1">TOTAL WAGERED</p>
        <p className="text-xl font-bold text-[#9966ff]">{stats.totalWagered}</p>
      </div>
      <div className="text-center p-4 bg-[#1a1a2e]/50 rounded-lg border border-[#2a2a4e]">
        <p className="text-[10px] text-gray-500 mb-1">TOTAL PAID OUT</p>
        <p className="text-xl font-bold text-[#44ff88]">{stats.totalPaidOut}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Entrance Animation Component
// ============================================================================

function CasinoEntrance({ onEnter }: { onEnter: () => void }) {
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAnimating(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isAnimating) {
      const enterTimer = setTimeout(onEnter, 500);
      return () => clearTimeout(enterTimer);
    }
  }, [isAnimating, onEnter]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <div className={`text-center transition-all duration-1000 ${isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-110'}`}>
        {/* Casino doors opening animation */}
        <div className="relative">
          <div className="flex">
            <div 
              className={`w-32 h-48 bg-gradient-to-r from-[#1a0033] to-[#2a0044] border-4 border-[#ffd700] transition-transform duration-1000 ${isAnimating ? 'translate-x-0' : '-translate-x-full'}`}
              style={{ transformOrigin: 'left center' }}
            >
              <div className="h-full flex items-center justify-center">
                <span className="text-[#ffd700] text-4xl">★</span>
              </div>
            </div>
            <div 
              className={`w-32 h-48 bg-gradient-to-l from-[#1a0033] to-[#2a0044] border-4 border-[#ffd700] transition-transform duration-1000 ${isAnimating ? 'translate-x-0' : 'translate-x-full'}`}
              style={{ transformOrigin: 'right center' }}
            >
              <div className="h-full flex items-center justify-center">
                <span className="text-[#ffd700] text-4xl">★</span>
              </div>
            </div>
          </div>
        </div>
        
        <p className="mt-8 text-[#9966ff] text-sm animate-pulse tracking-wider">
          ENTERING THE COSMIC CASINO...
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Main Casino Content Component
// ============================================================================

export default function CasinoContent() {
  const { isConnected } = useAccount();
  const [showEntrance, setShowEntrance] = useState(true);
  const [stats, setStats] = useState<CasinoStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch casino stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/starforge/stats');
      const data = await res.json();
      
      if (data.success) {
        setStats({
          totalGamesPlayed: data.stats?.totalGames || 0,
          totalWagered: data.stats?.totalWageredFormatted || '0 MON',
          totalPaidOut: data.stats?.totalPaidOutFormatted || '0 MON',
          activeJackpots: data.jackpots?.map((j: { tier: string; poolAmountFormatted: string }) => ({
            tier: j.tier,
            amount: j.poolAmountFormatted,
          })) || [],
        });
      }
    } catch (err) {
      console.error('Failed to fetch casino stats:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleEntranceComplete = useCallback(() => {
    setShowEntrance(false);
  }, []);

  // Show entrance animation on first visit
  if (showEntrance) {
    return <CasinoEntrance onEnter={handleEntranceComplete} />;
  }

  return (
    <div className="min-h-screen py-8 px-4">
      {/* Casino Header */}
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          {/* Neon Casino Sign */}
          <div className="mb-4">
            <NeonSign text="COSMIC CASINO" color="#ff00ff" />
          </div>
          
          <p className="text-[#9966ff] text-sm tracking-wider mb-2">
            ✦ PROVABLY FAIR GAMING ON MONAD ✦
          </p>
          <p className="text-gray-500 text-xs">
            All games use on-chain randomness for guaranteed fairness
          </p>
        </div>

        {/* Jackpot Ticker */}
        <JackpotTicker jackpots={stats?.activeJackpots || []} />

        <AccessGate
          title="CASINO ACCESS RESTRICTED"
          message="Only Star Skrumpey holders may enter the Cosmic Casino."
        >
          {/* Casino Stats */}
          <CasinoStatsBar stats={stats} />

          {/* Games Grid */}
          <div className="mb-8">
            <h2 className="text-[#ffd700] text-lg font-bold tracking-wider mb-4 text-center">
              🎰 SELECT YOUR GAME 🎰
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {GAMES.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          </div>

          {/* Info Section */}
          <div className="pixel-card p-6 text-center">
            <h3 className="text-[#00ffff] text-sm font-bold mb-4 tracking-wider">
              🔒 PROVABLY FAIR GAMING
            </h3>
            <p className="text-gray-400 text-xs mb-4 max-w-2xl mx-auto">
              All Cosmic Casino games use commit-reveal randomness with combined server and client seeds.
              Every result can be independently verified on-chain. Star Skrumpey holders enjoy
              reduced house edge (4% vs 7%) and better RTP (91% vs 88%).
            </p>
            <div className="flex justify-center gap-6 text-[10px]">
              <span className="text-gray-500">
                Standard RTP: <span className="text-[#44ff88]">88%</span>
              </span>
              <span className="text-gray-500">
                Star Holder RTP: <span className="text-[#ffd700]">91%</span>
              </span>
              <span className="text-gray-500">
                Chainlink VRF: <span className="text-[#00ffff]">Coming Soon</span>
              </span>
            </div>
          </div>
        </AccessGate>
      </div>

      {/* CSS Animations */}
      <style jsx global>{`
        @keyframes neon-flicker {
          0%, 19%, 21%, 23%, 25%, 54%, 56%, 100% {
            opacity: 1;
          }
          20%, 24%, 55% {
            opacity: 0.8;
          }
        }
        .animate-neon-flicker {
          animation: neon-flicker 2s infinite;
        }
        
        @keyframes scroll-left {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-scroll-left {
          animation: scroll-left 20s linear infinite;
        }
      `}</style>
    </div>
  );
}
