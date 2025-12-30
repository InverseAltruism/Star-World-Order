'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount } from 'wagmi';
import WalletConnect from '@/components/WalletConnect';
import Image from 'next/image';

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
  discord_bonus_enabled: number;
  userEntry?: RaffleEntry | null;
}

interface RaffleEntry {
  id: number;
  raffle_id: string;
  wallet_address: string;
  tier: string;
  entries_count: number;
  discord_bonus: number;
  star_count: number;
  entered_at: string;
  display_name?: string;
}

interface RaffleStats {
  participants: number;
  totalTickets: number;
}

interface UserTier {
  tier: string;
  entries: number;
  name: string;
  minStars: number;
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
function WinAnimation({ onClose }: { onClose: () => void }) {
  const [stars, setStars] = useState<Array<{ id: number; x: number; y: number; size: number; delay: number }>>([]);
  
  useEffect(() => {
    // Generate flying stars
    const newStars = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 20 + 10,
      delay: Math.random() * 2,
    }));
    setStars(newStars);
  }, []);
  
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90" onClick={onClose}>
      {/* Flying stars */}
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute animate-fly-star"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            fontSize: `${star.size}px`,
            animationDelay: `${star.delay}s`,
          }}
        >
          ⭐
        </div>
      ))}
      
      {/* Main content */}
      <div className="relative z-10 text-center animate-bounce-in">
        <div className="text-8xl mb-8 animate-spin-slow">🏆</div>
        <h1 className="text-5xl sm:text-7xl font-bold text-[#ffd700] mb-4 pixel-glow-gold animate-pulse">
          YOU WON!
        </h1>
        <p className="text-2xl text-[#44ff88] mb-8">
          🌟 Congratulations, Star Champion! 🌟
        </p>
        <p className="text-gray-400 text-sm">Click anywhere to continue</p>
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
            transform: translate(${Math.random() > 0.5 ? '' : '-'}${Math.random() * 200 + 100}px, ${Math.random() > 0.5 ? '' : '-'}${Math.random() * 200 + 100}px) rotate(720deg) scale(0);
            opacity: 0;
          }
        }
        .animate-fly-star {
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
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90" onClick={onClose}>
      {/* Falling stars (sad) */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute animate-fall-star"
            style={{
              left: `${Math.random() * 100}%`,
              top: `-20px`,
              fontSize: `${Math.random() * 15 + 10}px`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${Math.random() * 2 + 3}s`,
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

// Entry Confirmation Animation
function EntryConfirmation({ entries, tier, onClose }: { entries: number; tier: string; onClose: () => void }) {
  const style = TIER_STYLES[tier] || TIER_STYLES.star_forged;
  
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 animate-fade-in" onClick={onClose}>
      <div 
        className="text-center p-8 rounded-xl border-2 animate-scale-in"
        style={{ 
          backgroundColor: style.bgColor, 
          borderColor: style.borderColor,
          boxShadow: style.glow,
        }}
      >
        <div className="text-6xl mb-4 animate-bounce">🎟️</div>
        <h2 className="text-2xl font-bold mb-2" style={{ color: style.color }}>
          YOU&apos;RE IN!
        </h2>
        <p className="text-white text-lg mb-2">
          +{entries} Ticket{entries > 1 ? 's' : ''} Added
        </p>
        <p className="text-gray-400 text-sm">
          {TIER_STYLES[tier] ? tier.replace('_', ' ').toUpperCase() : 'STAR FORGED'}
        </p>
      </div>
      
      <style jsx>{`
        @keyframes scale-in {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scale-in 0.3s ease-out forwards;
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out forwards;
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

// Main Raffle Content Component
export default function RaffleContent() {
  const { address, isConnected } = useAccount();
  
  // State
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [activeRaffle, setActiveRaffle] = useState<Raffle | null>(null);
  const [entries, setEntries] = useState<RaffleEntry[]>([]);
  const [stats, setStats] = useState<RaffleStats>({ participants: 0, totalTickets: 0 });
  const [userEntry, setUserEntry] = useState<RaffleEntry | null>(null);
  const [userTier, setUserTier] = useState<UserTier | null>(null);
  const [holderTiers, setHolderTiers] = useState<HolderTiers | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEntering, setIsEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Animation states
  const [showWinAnimation, setShowWinAnimation] = useState(false);
  const [showLoseAnimation, setShowLoseAnimation] = useState(false);
  const [showEntryConfirmation, setShowEntryConfirmation] = useState(false);
  const [entryConfirmData, setEntryConfirmData] = useState<{ entries: number; tier: string } | null>(null);
  
  // Fetch active raffle
  const fetchRaffle = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // First, get all active raffles
      const activeRes = await fetch(`/api/raffle?type=active${address ? `&address=${address}` : ''}`);
      const activeData = await activeRes.json();
      
      if (activeData.success && activeData.raffles.length > 0) {
        // Get the first active raffle details
        const raffleId = activeData.raffles[0].id;
        const detailRes = await fetch(`/api/raffle?id=${raffleId}${address ? `&address=${address}` : ''}`);
        const detailData = await detailRes.json();
        
        if (detailData.success) {
          setActiveRaffle(detailData.raffle);
          setEntries(detailData.entries || []);
          setStats(detailData.stats || { participants: 0, totalTickets: 0 });
          setUserEntry(detailData.userEntry);
          setUserTier(detailData.userTier);
          setHolderTiers(detailData.holderTiers);
          
          // Check for winner animation (only show once)
          if (detailData.raffle.status === 'drawn' && address && !detailData.hasViewedResult) {
            const isWinner = detailData.raffle.winner_address?.toLowerCase() === address.toLowerCase();
            
            // Check if user entered this raffle
            const didEnter = detailData.userEntry !== null;
            
            if (didEnter) {
              if (isWinner) {
                setShowWinAnimation(true);
              } else {
                setShowLoseAnimation(true);
              }
              
              // Mark as viewed
              await fetch('/api/raffle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'markViewed',
                  walletAddress: address,
                  raffleId,
                }),
              });
            }
          }
        }
      } else {
        // No active raffle, fetch past raffles
        const pastRes = await fetch(`/api/raffle?type=past${address ? `&address=${address}` : ''}`);
        const pastData = await pastRes.json();
        
        if (pastData.success) {
          setRaffles(pastData.raffles || []);
          setHolderTiers(pastData.holderTiers);
        }
        
        setActiveRaffle(null);
      }
    } catch (err) {
      console.error('Error fetching raffle:', err);
      setError('Failed to load raffle');
    } finally {
      setIsLoading(false);
    }
  }, [address]);
  
  useEffect(() => {
    fetchRaffle();
  }, [fetchRaffle]);
  
  // Enter raffle
  const handleEnterRaffle = async (discordBonus = false) => {
    if (!address || !activeRaffle) return;
    
    setIsEntering(true);
    setError(null);
    
    try {
      const res = await fetch('/api/raffle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'enter',
          walletAddress: address,
          raffleId: activeRaffle.id,
          discordBonus,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setUserEntry(data.entry);
        setEntryConfirmData({ entries: data.entry.entries_count, tier: data.entry.tier });
        setShowEntryConfirmation(true);
        
        // Refresh data
        await fetchRaffle();
      } else {
        setError(data.error || 'Failed to enter raffle');
      }
    } catch (err) {
      setError('Failed to enter raffle');
      console.error(err);
    } finally {
      setIsEntering(false);
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
          <p className="text-gray-400 text-sm">Loading raffle...</p>
        </div>
      </div>
    );
  }
  
  // No active raffle
  if (!activeRaffle) {
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
          <p className="text-gray-500 text-xs mb-6">
            Check back soon for the next cosmic drawing!
          </p>
          
          {/* Past raffles */}
          {raffles.length > 0 && (
            <div className="mt-8">
              <h3 className="text-[#ffd700] text-sm mb-4">PAST RAFFLES</h3>
              <div className="space-y-3">
                {raffles.map((raffle) => (
                  <div 
                    key={raffle.id}
                    className="bg-[#0a0a15] p-4 rounded-lg border border-[#2a2a4e]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white text-sm">{raffle.name}</span>
                      <span className={`text-xs ${raffle.status === 'drawn' ? 'text-[#44ff88]' : 'text-gray-500'}`}>
                        {raffle.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-gray-400 text-[10px]">{raffle.prize_description}</p>
                    {raffle.winner_address && (
                      <p className="text-[#ffd700] text-[10px] mt-2">
                        Winner: {raffle.winner_address.slice(0, 6)}...{raffle.winner_address.slice(-4)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </>
    );
  }
  
  // Active raffle display
  return (
    <>
      {/* Animations */}
      {showWinAnimation && <WinAnimation onClose={() => setShowWinAnimation(false)} />}
      {showLoseAnimation && <LoseAnimation onClose={() => setShowLoseAnimation(false)} />}
      {showEntryConfirmation && entryConfirmData && (
        <EntryConfirmation 
          entries={entryConfirmData.entries} 
          tier={entryConfirmData.tier}
          onClose={() => setShowEntryConfirmation(false)}
        />
      )}
      
      {/* Header */}
      <div className="text-center mb-8">
        <div className="text-5xl mb-4">🎰</div>
        <h1 className="text-[#ffd700] text-2xl tracking-wider mb-2">COSMIC RAFFLE</h1>
        <p className="text-gray-400 text-xs">
          Exclusive prizes for Star Skrumpey holders
        </p>
      </div>
      
      {/* Main Raffle Card */}
      <div className="pixel-card p-6 mb-6">
        {/* Raffle Name & Status */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[#ffd700] text-lg">{activeRaffle.name}</h2>
          <span className={`px-3 py-1 rounded text-xs font-bold ${
            activeRaffle.status === 'active' ? 'bg-[#44ff88]/20 text-[#44ff88]' :
            activeRaffle.status === 'drawn' ? 'bg-[#ffd700]/20 text-[#ffd700]' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {activeRaffle.status.toUpperCase()}
          </span>
        </div>
        
        {/* Prize Display */}
        <div className="bg-[#0a0a15] rounded-lg p-4 mb-4 border border-[#ffd700]/30">
          <div className="flex items-start gap-4">
            {activeRaffle.prize_image_url ? (
              <div className="relative w-20 h-20 flex-shrink-0">
                <Image
                  src={activeRaffle.prize_image_url}
                  alt="Prize"
                  fill
                  className="object-cover rounded-lg"
                />
              </div>
            ) : (
              <div className="w-20 h-20 flex-shrink-0 bg-[#1a1a2e] rounded-lg flex items-center justify-center text-3xl">
                🎁
              </div>
            )}
            <div>
              <p className="text-[#ffd700] text-xs mb-1">PRIZE</p>
              <p className="text-white text-sm">{activeRaffle.prize_description}</p>
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
          </div>
        )}
        
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-[#0a0a15] rounded-lg p-3 text-center">
            <p className="text-[#9966ff] text-2xl font-bold">{stats.participants}</p>
            <p className="text-gray-500 text-[10px]">PARTICIPANTS</p>
          </div>
          <div className="bg-[#0a0a15] rounded-lg p-3 text-center">
            <p className="text-[#00ffff] text-2xl font-bold">{stats.totalTickets}</p>
            <p className="text-gray-500 text-[10px]">TOTAL TICKETS</p>
          </div>
        </div>
        
        {/* Entry Section */}
        {activeRaffle.status === 'active' && (
          <div className="border-t border-[#2a2a4e] pt-4">
            {!isConnected ? (
              <div className="text-center">
                <p className="text-gray-400 text-xs mb-3">Connect your wallet to enter</p>
                <WalletConnect />
              </div>
            ) : userEntry ? (
              <div className="text-center">
                <div className="bg-[#44ff88]/10 border border-[#44ff88] rounded-lg p-4 mb-3">
                  <p className="text-[#44ff88] text-sm mb-2">✅ You&apos;re Entered!</p>
                  <div className="flex items-center justify-center gap-2">
                    <TierBadge tier={userEntry.tier} />
                    <span className="text-white text-xs">
                      {userEntry.entries_count} Ticket{userEntry.entries_count > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                
                {/* Discord bonus option */}
                {activeRaffle.discord_bonus_enabled && !userEntry.discord_bonus && (
                  <button
                    onClick={() => handleEnterRaffle(true)}
                    disabled={isEntering}
                    className="pixel-btn text-xs w-full"
                  >
                    {isEntering ? 'UPDATING...' : '🎮 JOIN DISCORD FOR +1 ENTRY'}
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center">
                {userTier ? (
                  <>
                    <div className="mb-3">
                      <p className="text-gray-400 text-xs mb-2">Your Tier:</p>
                      <TierBadge tier={userTier.tier} />
                      <p className="text-white text-sm mt-1">
                        {userTier.entries} {userTier.entries > 1 ? 'Entries' : 'Entry'}
                      </p>
                    </div>
                    <button
                      onClick={() => handleEnterRaffle(false)}
                      disabled={isEntering}
                      className="pixel-btn pixel-btn-gold text-xs w-full mb-2"
                    >
                      {isEntering ? 'ENTERING...' : '🎟️ ENTER RAFFLE'}
                    </button>
                    
                    {activeRaffle.discord_bonus_enabled && (
                      <button
                        onClick={() => handleEnterRaffle(true)}
                        disabled={isEntering}
                        className="pixel-btn text-xs w-full"
                      >
                        {isEntering ? 'ENTERING...' : '🎮 ENTER + JOIN DISCORD (+1 ENTRY)'}
                      </button>
                    )}
                  </>
                ) : (
                  <div className="text-center">
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
                  </div>
                )}
              </div>
            )}
            
            {error && (
              <p className="text-[#ff4466] text-xs text-center mt-3">{error}</p>
            )}
          </div>
        )}
      </div>
      
      {/* Tier Info */}
      <div className="pixel-card p-6 mb-6">
        <h2 className="text-[#9966ff] text-sm tracking-wider mb-4 text-center">🏆 HOLDER TIERS</h2>
        {tierInfoDisplay}
        <p className="text-gray-500 text-[10px] text-center mt-4">
          More Star Skrumpeys = More entries per raffle!
        </p>
      </div>
      
      {/* Current Entries */}
      <div className="pixel-card p-6">
        <h2 className="text-[#00ffff] text-sm tracking-wider mb-4">
          📜 CURRENT ENTRIES ({entries.length})
        </h2>
        
        {entries.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-4">
            No entries yet. Be the first to enter!
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {entries.map((entry) => (
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
        )}
      </div>
      
      {/* Description */}
      {activeRaffle.description && (
        <div className="mt-6 text-center">
          <p className="text-gray-500 text-xs">{activeRaffle.description}</p>
        </div>
      )}
    </>
  );
}
