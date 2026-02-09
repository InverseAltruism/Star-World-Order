'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAccount } from 'wagmi';
import WalletConnect from '@/components/WalletConnect';
import AccessGate from '@/components/AccessGate';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';

// ============================================================================
// Types
// ============================================================================

type Tier = 'bronze' | 'silver' | 'gold';
type GamePhase = 'idle' | 'committing' | 'spinning' | 'revealing' | 'result';
type PatternType = 'supernova' | 'galaxy' | 'big_dipper' | 'orion' | 'cassiopeia' | 'crux' | 'line' | 'binary' | 'void';

interface GameState {
  gameId: string | null;
  phase: GamePhase;
  tier: Tier;
  grid: boolean[][];
  pattern: PatternType | null;
  multiplier: number;
  payout: string;
  isJackpot: boolean;
  serverSeedHash: string | null;
  serverSeed: string | null;
  clientSeed: string | null;
}

interface JackpotInfo {
  tier: string;
  poolAmount: string;
  poolAmountFormatted: string;
}

interface TreasuryInfo {
  tier: string;
  balance: string;
  balanceFormatted: string;
  totalGames: number;
}

interface RecentGame {
  id: string;
  playerAddress: string;
  tier: string;
  pattern: string;
  multiplier: number;
  payout: string;
  payoutFormatted: string;
  isStarHolder: boolean;
  completedAt: string;
}

// ============================================================================
// Constants
// ============================================================================

const TIER_CONFIG: Record<Tier, { name: string; entryFee: string; color: string; maxWin: string }> = {
  bronze: { name: 'Bronze', entryFee: '45', color: '#cd7f32', maxWin: '450' },
  silver: { name: 'Silver', entryFee: '225', color: '#c0c0c0', maxWin: '2,250' },
  gold: { name: 'Gold', entryFee: '450', color: '#ffd700', maxWin: '4,500' },
};

const PATTERN_INFO: Record<PatternType, { name: string; emoji: string; description: string; multiplier: string; color: string }> = {
  supernova: { name: 'SUPERNOVA', emoji: '💥', description: 'All 25 stars!', multiplier: 'JACKPOT', color: '#ff00ff' },
  galaxy: { name: 'GALAXY', emoji: '🌌', description: '20+ stars filled', multiplier: '10x', color: '#9966ff' },
  big_dipper: { name: 'BIG DIPPER', emoji: '✨', description: '7-star ladle pattern', multiplier: '7x', color: '#00ffff' },
  orion: { name: 'ORION', emoji: '🏹', description: 'The Hunter constellation', multiplier: '5x', color: '#44ff88' },
  cassiopeia: { name: 'CASSIOPEIA', emoji: '👑', description: 'W-shaped pattern', multiplier: '5x', color: '#ff6ec7' },
  crux: { name: 'CRUX', emoji: '✝️', description: 'Cross pattern', multiplier: '3x', color: '#ffd700' },
  line: { name: 'LINE', emoji: '➖', description: '5 in a row', multiplier: '2x', color: '#4488ff' },
  binary: { name: 'BINARY', emoji: '⭐', description: '2+ adjacent stars', multiplier: '1.3x', color: '#aaaaaa' },
  void: { name: 'VOID', emoji: '🌑', description: 'No pattern', multiplier: '0x', color: '#666666' },
};

// Initial empty 5x5 grid
const createEmptyGrid = (): boolean[][] => 
  Array(5).fill(null).map(() => Array(5).fill(false));

// ============================================================================
// Slot Reel Component - Individual Column that spins
// ============================================================================

interface SlotReelProps {
  columnIndex: number;
  finalValues: boolean[];
  isSpinning: boolean;
  spinDelay: number;
  revealDelay: number;
  isRevealed: boolean;
}

function SlotReel({ columnIndex, finalValues, isSpinning, spinDelay, revealDelay, isRevealed }: SlotReelProps) {
  const [displayValues, setDisplayValues] = useState<boolean[]>(Array(5).fill(false));
  const [isColumnSpinning, setIsColumnSpinning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Start spinning after delay
  useEffect(() => {
    if (isSpinning && !isRevealed) {
      const timeout = setTimeout(() => {
        setIsColumnSpinning(true);
      }, spinDelay);
      
      return () => clearTimeout(timeout);
    }
  }, [isSpinning, spinDelay, isRevealed]);
  
  // Spin animation - rapidly change values
  useEffect(() => {
    if (isColumnSpinning && !isRevealed) {
      intervalRef.current = setInterval(() => {
        setDisplayValues(prev => 
          prev.map(() => Math.random() > 0.5)
        );
      }, 50);
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [isColumnSpinning, isRevealed]);
  
  // Stop spinning and reveal after delay
  useEffect(() => {
    if (isRevealed) {
      const timeout = setTimeout(() => {
        setIsColumnSpinning(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        // Final reveal with slight bounce animation
        setDisplayValues(finalValues);
      }, revealDelay);
      
      return () => clearTimeout(timeout);
    }
  }, [isRevealed, revealDelay, finalValues]);
  
  // Reset when not spinning
  useEffect(() => {
    if (!isSpinning && !isRevealed) {
      setIsColumnSpinning(false);
      setDisplayValues(Array(5).fill(false));
    }
  }, [isSpinning, isRevealed]);
  
  return (
    <div className="flex flex-col gap-2">
      {displayValues.map((hasStar, rowIndex) => (
        <div 
          key={rowIndex}
          className={`
            w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 
            flex items-center justify-center
            rounded-lg border-2 transition-all duration-200
            ${isColumnSpinning 
              ? 'border-[#9966ff]/50 bg-[#1a1a2e] animate-pulse' 
              : hasStar 
                ? 'border-[#ffd700] bg-[#ffd700]/20 shadow-[0_0_20px_rgba(255,215,0,0.5)]' 
                : 'border-[#2a2a4e] bg-[#0a0a15]'
            }
          `}
        >
          <span 
            className={`
              text-2xl sm:text-3xl transition-all duration-300
              ${isColumnSpinning ? 'animate-bounce opacity-50' : ''}
              ${hasStar && !isColumnSpinning ? 'animate-pulse' : ''}
            `}
          >
            {hasStar ? '⭐' : '·'}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Slot Machine Grid Component
// ============================================================================

interface SlotMachineGridProps {
  grid: boolean[][];
  isSpinning: boolean;
  isRevealed: boolean;
  winningPattern: PatternType | null;
}

function SlotMachineGrid({ grid, isSpinning, isRevealed, winningPattern }: SlotMachineGridProps) {
  // Transpose grid to get columns (for slot machine effect - columns spin independently)
  const columns = useMemo(() => {
    const cols: boolean[][] = [];
    for (let col = 0; col < 5; col++) {
      cols.push(grid.map(row => row[col]));
    }
    return cols;
  }, [grid]);
  
  return (
    <div className="relative">
      {/* Slot machine frame */}
      <div 
        className={`
          relative p-4 sm:p-6 rounded-xl border-4 
          ${winningPattern && winningPattern !== 'void' 
            ? 'border-[#ffd700] shadow-[0_0_40px_rgba(255,215,0,0.5)]' 
            : 'border-[#3a3a5e]'
          }
          bg-gradient-to-b from-[#1a1a2e] to-[#0d0d1a]
          transition-all duration-500
        `}
      >
        {/* Top chrome bar */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#2a2a4e] rounded border border-[#4a4a6e]">
          <span className="text-[10px] text-[#ffd700] tracking-wider">★ STAR FORGE ★</span>
        </div>
        
        {/* Grid of reels */}
        <div className="flex gap-2 sm:gap-3 justify-center">
          {columns.map((column, colIndex) => (
            <SlotReel
              key={colIndex}
              columnIndex={colIndex}
              finalValues={column}
              isSpinning={isSpinning}
              spinDelay={colIndex * 100} // Stagger start
              revealDelay={colIndex * 300} // Stagger reveal
              isRevealed={isRevealed}
            />
          ))}
        </div>
        
        {/* Bottom chrome bar with star counter */}
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#2a2a4e] rounded border border-[#4a4a6e]">
          <span className="text-[10px] text-gray-400">
            STARS: <span className="text-[#ffd700]">{grid.flat().filter(Boolean).length}</span>/25
          </span>
        </div>
      </div>
      
      {/* Scanning line effect during spin */}
      {isSpinning && !isRevealed && (
        <div 
          className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl"
          style={{ 
            background: 'linear-gradient(180deg, transparent 0%, rgba(153, 102, 255, 0.1) 50%, transparent 100%)',
            animation: 'scanLine 0.5s linear infinite'
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Tier Selector Component
// ============================================================================

interface TierSelectorProps {
  selectedTier: Tier;
  onTierChange: (tier: Tier) => void;
  disabled: boolean;
}

function TierSelector({ selectedTier, onTierChange, disabled }: TierSelectorProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center">
      {(Object.keys(TIER_CONFIG) as Tier[]).map((tier) => {
        const config = TIER_CONFIG[tier];
        const isSelected = selectedTier === tier;
        
        return (
          <button
            key={tier}
            onClick={() => onTierChange(tier)}
            disabled={disabled}
            className={`
              px-4 py-3 rounded-lg border-2 transition-all duration-200
              ${isSelected 
                ? 'scale-105 shadow-lg' 
                : 'opacity-70 hover:opacity-100 hover:scale-102'
              }
              ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
            `}
            style={{
              borderColor: isSelected ? config.color : '#2a2a4e',
              backgroundColor: isSelected ? `${config.color}20` : '#0a0a15',
              boxShadow: isSelected ? `0 0 20px ${config.color}40` : 'none',
            }}
          >
            <div className="text-xs font-bold" style={{ color: config.color }}>
              {config.name.toUpperCase()}
            </div>
            <div className="text-white text-sm font-bold mt-1">
              {config.entryFee} MON
            </div>
            <div className="text-gray-500 text-[10px] mt-1">
              Max Win: {config.maxWin} MON
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Win Animation Overlay
// ============================================================================

interface WinAnimationProps {
  pattern: PatternType;
  multiplier: number;
  payout: string;
  isJackpot: boolean;
  onClose: () => void;
}

function WinAnimation({ pattern, multiplier, payout, isJackpot, onClose }: WinAnimationProps) {
  const patternInfo = PATTERN_INFO[pattern];
  
  // Generate flying stars
  const [stars] = useState(() => 
    Array.from({ length: isJackpot ? 100 : 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 24 + 12,
      delay: Math.random() * 2,
      duration: Math.random() * 2 + 2,
    }))
  );
  
  useEffect(() => {
    // Auto-close after animation
    const timer = setTimeout(onClose, isJackpot ? 8000 : 5000);
    return () => clearTimeout(timer);
  }, [onClose, isJackpot]);
  
  return (
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 overflow-hidden cursor-pointer"
      onClick={onClose}
    >
      {/* Flying stars */}
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute animate-star-fly"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            fontSize: `${star.size}px`,
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.duration}s`,
          }}
        >
          ⭐
        </div>
      ))}
      
      {/* Main content */}
      <div className="relative z-10 text-center animate-bounce-in max-w-md mx-4 p-8 rounded-xl border-4"
        style={{ 
          borderColor: patternInfo.color,
          backgroundColor: `${patternInfo.color}20`,
          boxShadow: `0 0 60px ${patternInfo.color}60`,
        }}
      >
        {/* Pattern emoji */}
        <div className={`text-7xl mb-4 ${isJackpot ? 'animate-spin-slow' : 'animate-bounce'}`}>
          {patternInfo.emoji}
        </div>
        
        {/* Pattern name */}
        <h1 
          className="text-3xl sm:text-4xl font-bold mb-2"
          style={{ color: patternInfo.color, textShadow: `0 0 20px ${patternInfo.color}` }}
        >
          {patternInfo.name}!
        </h1>
        
        {/* Description */}
        <p className="text-gray-300 text-sm mb-4">{patternInfo.description}</p>
        
        {/* Multiplier */}
        <div className="text-2xl font-bold text-white mb-4">
          {isJackpot ? (
            <span className="text-[#ff00ff] animate-pulse">🎰 JACKPOT! 🎰</span>
          ) : (
            <span style={{ color: patternInfo.color }}>{patternInfo.multiplier}</span>
          )}
        </div>
        
        {/* Payout */}
        {parseFloat(payout) > 0 && (
          <div className="bg-black/50 rounded-lg p-4 mb-4">
            <p className="text-gray-400 text-xs mb-1">YOUR WINNINGS</p>
            <p className="text-[#ffd700] text-2xl font-bold">
              +{(parseFloat(payout) / 1e18).toFixed(2)} MON
            </p>
          </div>
        )}
        
        <p className="text-gray-500 text-xs">Click anywhere to continue</p>
      </div>
      
      <style jsx>{`
        @keyframes star-fly {
          0% { transform: scale(0) rotate(0deg); opacity: 0; }
          20% { opacity: 1; transform: scale(1); }
          100% { transform: scale(0) rotate(720deg) translateY(-200px); opacity: 0; }
        }
        .animate-star-fly {
          animation: star-fly ease-out infinite;
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

// ============================================================================
// Loss Animation Overlay
// ============================================================================

function LossAnimation({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  
  return (
    <div 
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 overflow-hidden cursor-pointer"
      onClick={onClose}
    >
      {/* Main content */}
      <div className="relative z-10 text-center animate-fade-in">
        <div className="text-6xl mb-4 animate-wobble">🌑</div>
        <h2 className="text-2xl text-gray-400 mb-2">The Void...</h2>
        <p className="text-gray-500 text-sm mb-4">No constellation formed</p>
        <p className="text-[#9966ff] text-xs">Try again for better luck!</p>
        <p className="text-gray-600 text-xs mt-4">Click to continue</p>
      </div>
      
      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
        @keyframes wobble {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-5deg); }
          75% { transform: rotate(5deg); }
        }
        .animate-wobble {
          animation: wobble 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Pattern Guide Component
// ============================================================================

function PatternGuide() {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="pixel-card p-4">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <h3 className="text-[#ffd700] text-xs tracking-wider">📜 CONSTELLATION GUIDE</h3>
        <span className="text-gray-400">{isExpanded ? '▼' : '▶'}</span>
      </button>
      
      {isExpanded && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.entries(PATTERN_INFO) as [PatternType, typeof PATTERN_INFO[PatternType]][]).map(([key, info]) => (
            <div 
              key={key}
              className="p-3 rounded-lg bg-[#0a0a15] border border-[#2a2a4e] flex items-center gap-3"
            >
              <span className="text-2xl">{info.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold" style={{ color: info.color }}>
                    {info.name}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 bg-black/50 rounded" style={{ color: info.color }}>
                    {info.multiplier}
                  </span>
                </div>
                <p className="text-gray-500 text-[10px] truncate">{info.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Recent Games Component
// ============================================================================

interface RecentGamesProps {
  games: RecentGame[];
}

function RecentGames({ games }: RecentGamesProps) {
  if (games.length === 0) return null;
  
  return (
    <div className="pixel-card p-4">
      <h3 className="text-[#9966ff] text-xs tracking-wider mb-4">🎰 RECENT WINS</h3>
      
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {games.filter(g => g.pattern !== 'void').slice(0, 10).map((game) => {
          const patternInfo = PATTERN_INFO[game.pattern as PatternType];
          return (
            <div 
              key={game.id}
              className="flex items-center justify-between p-2 rounded bg-[#0a0a15] border border-[#2a2a4e]"
            >
              <div className="flex items-center gap-2">
                <span>{patternInfo?.emoji || '⭐'}</span>
                <span className="text-gray-400 text-xs font-mono">
                  {game.playerAddress.slice(0, 6)}...{game.playerAddress.slice(-4)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded" style={{ 
                  backgroundColor: `${TIER_CONFIG[game.tier as Tier]?.color || '#aaa'}20`,
                  color: TIER_CONFIG[game.tier as Tier]?.color || '#aaa'
                }}>
                  {game.tier.toUpperCase()}
                </span>
                <span className="text-[#ffd700] text-xs font-bold">
                  {game.payoutFormatted}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Jackpot Display Component
// ============================================================================

interface JackpotDisplayProps {
  jackpots: JackpotInfo[];
  selectedTier: Tier;
}

function JackpotDisplay({ jackpots, selectedTier }: JackpotDisplayProps) {
  const selectedJackpot = jackpots.find(j => j.tier === selectedTier);
  
  return (
    <div className="text-center mb-6">
      <p className="text-gray-500 text-[10px] tracking-wider mb-1">🎰 SUPERNOVA JACKPOT 🎰</p>
      <div className="text-3xl sm:text-4xl font-bold text-[#ff00ff] animate-pulse">
        {selectedJackpot?.poolAmountFormatted || '0 MON'}
      </div>
      <p className="text-gray-600 text-[10px] mt-1">Fill all 25 stars to win!</p>
    </div>
  );
}

// ============================================================================
// Main StarForge Component
// ============================================================================

export default function StarForgeContent() {
  const { address, isConnected } = useAccount();
  
  // Game state
  const [gameState, setGameState] = useState<GameState>({
    gameId: null,
    phase: 'idle',
    tier: 'bronze',
    grid: createEmptyGrid(),
    pattern: null,
    multiplier: 0,
    payout: '0',
    isJackpot: false,
    serverSeedHash: null,
    serverSeed: null,
    clientSeed: null,
  });
  
  // Stats
  const [jackpots, setJackpots] = useState<JackpotInfo[]>([]);
  const [treasury, setTreasury] = useState<TreasuryInfo[]>([]);
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Animation states
  const [showWinAnimation, setShowWinAnimation] = useState(false);
  const [showLossAnimation, setShowLossAnimation] = useState(false);
  
  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/starforge/stats${address ? `?playerAddress=${address}` : ''}`);
      const data = await res.json();
      
      if (data.success) {
        setJackpots(data.jackpots || []);
        setTreasury(data.treasury || []);
        setRecentGames(data.recentGames || []);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setIsLoading(false);
    }
  }, [address]);
  
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);
  
  // Generate client seed
  const generateClientSeed = useCallback((): string => {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2);
    const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent.slice(0, 20) : '';
    return `${timestamp}-${random}-${userAgent}`;
  }, []);
  
  // Start game (commit phase)
  const handleSpin = useCallback(async () => {
    if (!address || gameState.phase !== 'idle') return;
    
    setError(null);
    setGameState(prev => ({ ...prev, phase: 'committing' }));
    
    try {
      const walletAuthHeader = await getWalletAuthHeader(address);
      if (!walletAuthHeader) {
        throw new Error('Wallet authentication signature required');
      }

      // Step 1: Commit game to server
      const commitRes = await fetch('/api/starforge/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-auth': walletAuthHeader,
        },
        body: JSON.stringify({
          playerAddress: address,
          tier: gameState.tier,
        }),
      });
      
      const commitData = await commitRes.json();
      
      if (!commitData.success) {
        throw new Error(commitData.error || 'Failed to commit game');
      }
      
      // Start spinning animation
      setGameState(prev => ({
        ...prev,
        phase: 'spinning',
        gameId: commitData.gameId,
        serverSeedHash: commitData.serverSeedHash,
      }));
      
      // Generate client seed and reveal after delay
      const clientSeed = generateClientSeed();
      
      // Spin for a bit before revealing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setGameState(prev => ({ ...prev, phase: 'revealing' }));
      
      // Step 2: Reveal game result
      const revealRes = await fetch('/api/starforge/reveal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-auth': walletAuthHeader,
        },
        body: JSON.stringify({
          gameId: commitData.gameId,
          clientSeed,
        }),
      });
      
      const revealData = await revealRes.json();
      
      if (!revealData.success) {
        throw new Error(revealData.error || 'Failed to reveal game');
      }
      
      // Convert grid to 2D array
      const gridArray = revealData.result.gridArray;
      const grid2D: boolean[][] = [];
      for (let row = 0; row < 5; row++) {
        grid2D.push(gridArray.slice(row * 5, (row + 1) * 5));
      }
      
      // Update game state with results
      setGameState(prev => ({
        ...prev,
        phase: 'result',
        grid: grid2D,
        pattern: revealData.result.pattern as PatternType,
        multiplier: revealData.result.multiplier,
        payout: revealData.result.payout,
        isJackpot: revealData.result.isJackpot,
        serverSeed: revealData.result.serverSeed,
        clientSeed: revealData.result.clientSeed,
      }));
      
      // Show appropriate animation
      setTimeout(() => {
        if (revealData.result.pattern === 'void') {
          setShowLossAnimation(true);
        } else {
          setShowWinAnimation(true);
        }
      }, 2000); // After reveal animation completes
      
      // Refresh stats
      fetchStats();
      
    } catch (err) {
      console.error('Game error:', err);
      setError(err instanceof Error ? err.message : 'Game failed');
      setGameState(prev => ({ ...prev, phase: 'idle' }));
    }
  }, [address, gameState.phase, gameState.tier, generateClientSeed, fetchStats]);
  
  // Reset game
  const handleReset = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      phase: 'idle',
      gameId: null,
      grid: createEmptyGrid(),
      pattern: null,
      multiplier: 0,
      payout: '0',
      isJackpot: false,
      serverSeedHash: null,
      serverSeed: null,
      clientSeed: null,
    }));
    setShowWinAnimation(false);
    setShowLossAnimation(false);
    setError(null);
  }, []);
  
  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin-slow">⭐</div>
          <p className="text-gray-400 text-sm">Loading Star Forge...</p>
        </div>
      </div>
    );
  }
  
  return (
    <>
      {/* Win/Loss Animations */}
      {showWinAnimation && gameState.pattern && gameState.pattern !== 'void' && (
        <WinAnimation
          pattern={gameState.pattern}
          multiplier={gameState.multiplier}
          payout={gameState.payout}
          isJackpot={gameState.isJackpot}
          onClose={() => setShowWinAnimation(false)}
        />
      )}
      
      {showLossAnimation && (
        <LossAnimation onClose={() => setShowLossAnimation(false)} />
      )}
      
      {/* Header */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-3xl animate-star-rotate">⭐</span>
          <h1 className="text-xl sm:text-2xl text-[#ffd700] pixel-glow-gold tracking-wider">
            STAR FORGE
          </h1>
          <span className="text-3xl animate-star-rotate" style={{ animationDelay: '0.5s' }}>⭐</span>
        </div>
        <p className="text-[#9966ff] text-xs tracking-wide">
          ✦ PROVABLY FAIR CONSTELLATION GAME ✦
        </p>
        <p className="text-gray-500 text-[10px] mt-1">
          Match star patterns to win up to 10x your bet!
        </p>
      </div>
      
      <AccessGate
        title="STAR FORGE LOCKED"
        message="Only Star Skrumpey holders may play Star Forge."
      >
        {/* Jackpot Display */}
        <JackpotDisplay jackpots={jackpots} selectedTier={gameState.tier} />
        
        {/* Main Game Area */}
        <div className="pixel-card p-4 sm:p-6 mb-6">
          {/* Tier Selector */}
          <div className="mb-6">
            <p className="text-center text-gray-500 text-[10px] mb-3 tracking-wider">SELECT TIER</p>
            <TierSelector 
              selectedTier={gameState.tier}
              onTierChange={(tier) => setGameState(prev => ({ ...prev, tier }))}
              disabled={gameState.phase !== 'idle'}
            />
          </div>
          
          {/* Slot Machine Grid */}
          <div className="flex justify-center mb-6">
            <SlotMachineGrid
              grid={gameState.grid}
              isSpinning={gameState.phase === 'spinning' || gameState.phase === 'committing'}
              isRevealed={gameState.phase === 'result' || gameState.phase === 'revealing'}
              winningPattern={gameState.pattern}
            />
          </div>
          
          {/* Result Display */}
          {gameState.phase === 'result' && gameState.pattern && (
            <div className="text-center mb-6">
              <div 
                className="inline-block px-4 py-2 rounded-lg border-2"
                style={{
                  borderColor: PATTERN_INFO[gameState.pattern].color,
                  backgroundColor: `${PATTERN_INFO[gameState.pattern].color}20`,
                }}
              >
                <span className="text-xl mr-2">{PATTERN_INFO[gameState.pattern].emoji}</span>
                <span className="font-bold" style={{ color: PATTERN_INFO[gameState.pattern].color }}>
                  {PATTERN_INFO[gameState.pattern].name}
                </span>
                <span className="text-white ml-2">
                  {gameState.isJackpot ? 'JACKPOT!' : PATTERN_INFO[gameState.pattern].multiplier}
                </span>
              </div>
              {parseFloat(gameState.payout) > 0 && (
                <p className="text-[#ffd700] text-lg font-bold mt-2">
                  +{(parseFloat(gameState.payout) / 1e18).toFixed(2)} MON
                </p>
              )}
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="flex justify-center gap-4">
            {gameState.phase === 'idle' ? (
              <button
                onClick={handleSpin}
                disabled={!isConnected}
                className="pixel-btn pixel-btn-gold text-sm px-8 py-3"
              >
                {!isConnected 
                  ? '🔒 CONNECT WALLET' 
                  : `🎰 SPIN (${TIER_CONFIG[gameState.tier].entryFee} MON)`
                }
              </button>
            ) : gameState.phase === 'result' ? (
              <button
                onClick={handleReset}
                className="pixel-btn text-sm px-8 py-3"
              >
                🔄 PLAY AGAIN
              </button>
            ) : (
              <div className="text-center">
                <div className="text-2xl animate-spin mb-2">⭐</div>
                <p className="text-[#9966ff] text-xs animate-pulse">
                  {gameState.phase === 'committing' && 'Generating stars...'}
                  {gameState.phase === 'spinning' && 'Forging constellation...'}
                  {gameState.phase === 'revealing' && 'Revealing pattern...'}
                </p>
              </div>
            )}
          </div>
          
          {/* Error Display */}
          {error && (
            <div className="text-center mt-4">
              <p className="text-[#ff4466] text-xs">{error}</p>
            </div>
          )}
          
          {/* Provably Fair Info */}
          {gameState.serverSeedHash && (
            <div className="mt-6 pt-4 border-t border-[#2a2a4e]">
              <details className="text-left">
                <summary className="cursor-pointer text-[#00ffff] text-[10px] hover:text-[#44ffff] transition-colors">
                  🔒 VERIFY FAIRNESS
                </summary>
                <div className="mt-2 bg-[#0a0a15] rounded p-3 border border-[#2a2a4e] text-[10px]">
                  <div className="mb-2">
                    <span className="text-gray-500">Server Seed Hash:</span>
                    <p className="text-[#00ffff] font-mono break-all">{gameState.serverSeedHash}</p>
                  </div>
                  {gameState.serverSeed && (
                    <div className="mb-2">
                      <span className="text-gray-500">Server Seed (revealed):</span>
                      <p className="text-[#44ff88] font-mono break-all">{gameState.serverSeed}</p>
                    </div>
                  )}
                  {gameState.clientSeed && (
                    <div className="mb-2">
                      <span className="text-gray-500">Client Seed:</span>
                      <p className="text-[#ffd700] font-mono break-all">{gameState.clientSeed}</p>
                    </div>
                  )}
                  <p className="text-gray-600 text-[8px] mt-2">
                    The grid is generated by combining server + client seeds. 
                    You can verify by hashing the server seed and checking it matches the hash shown before spin.
                  </p>
                </div>
              </details>
            </div>
          )}
        </div>
        
        {/* Pattern Guide */}
        <div className="mb-6">
          <PatternGuide />
        </div>
        
        {/* Recent Games */}
        <div className="mb-6">
          <RecentGames games={recentGames} />
        </div>
        
        {/* Game Info Footer */}
        <div className="pixel-card p-4 text-center">
          <p className="text-gray-500 text-[10px] mb-2">
            🎮 Star Forge uses commit-reveal randomness for provably fair results.
          </p>
          <div className="flex justify-center gap-4 text-[10px]">
            <span className="text-gray-400">
              RTP: <span className="text-[#44ff88]">88%</span> (Star holders: <span className="text-[#ffd700]">91%</span>)
            </span>
            <span className="text-gray-400">
              House Edge: <span className="text-[#ff4466]">7%</span> (Star holders: <span className="text-[#44ff88]">4%</span>)
            </span>
          </div>
        </div>
      </AccessGate>
      
      {/* CSS for scan line animation */}
      <style jsx global>{`
        @keyframes scanLine {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
    </>
  );
}
