'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getSkrumpeyImageUrl, STAR_SKRUMPEY_IDS } from '@/lib/starSkrumpey';
import { getLevelColor, getLevelTitle } from '@/lib/format';
import { useDAOAccess } from '@/lib/hooks/useDAOAccess';
import { useAccount } from 'wagmi';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';
import type { MemberData } from './shared';
import {
  getVariantColor,
  getVariantTextStyle,
  truncateAddress,
} from './shared';
import AnalyticsSection from './analytics/AnalyticsSection';

// Max supply constant
const MAX_STAR_SKRUMPEY_SUPPLY = STAR_SKRUMPEY_IDS.length;

/**
 * Friend status type
 */
type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';

/**
 * Achievement definitions for badge display
 */
interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

const ACHIEVEMENTS: Achievement[] = [
  { id: 'star_forged', name: 'Star Forged', description: 'Hold at least 1 Star Skrumpey', icon: '⭐', color: '#9966ff' },
  { id: 'cosmic_warden', name: 'Cosmic Warden', description: 'Hold 2 or more Star Skrumpeys', icon: '🌟', color: '#00ffff' },
  { id: 'star_lord', name: 'Star Lord', description: 'Hold 5 or more Star Skrumpeys', icon: '👑', color: '#ff00ff' },
  { id: 'cosmic_emperor', name: 'Cosmic Emperor', description: 'Hold 10 or more Star Skrumpeys', icon: '🏆', color: '#ffd700' },
  { id: 'gotta_catch_em_all', name: 'Gotta Catch Em All!', description: 'Collect all 9 constellation types', icon: '🔮', color: '#ff6ec7' },
  { id: 'prime_holder', name: 'The Prime', description: 'Hold the legendary Prime Star Skrumpey', icon: '💎', color: '#ffd700' },
  { id: 'constellation_explorer', name: 'Constellation Explorer', description: 'Collect 3+ constellation types', icon: '🔭', color: '#9966ff' },
  { id: 'cosmic_collector', name: 'Cosmic Collector', description: 'Collect 5+ constellation types', icon: '🌌', color: '#44ff88' },
  { id: 'constellation_master', name: 'Constellation Master', description: 'Hold 3+ of same constellation', icon: '✨', color: '#ff6ec7' },
];

/**
 * Member Avatar with NFT image fallback
 */
function MemberAvatar({ 
  tokenId, 
  variant, 
  size = 'md' 
}: { 
  tokenId?: number; 
  variant?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [imageError, setImageError] = useState(false);
  const imageUrl = tokenId ? getSkrumpeyImageUrl(tokenId) : null;
  
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-14 h-14',
    lg: 'w-20 h-20',
  };
  
  const fontSize = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  if (!imageUrl || imageError) {
    return (
      <div 
        className={`${sizeClasses[size]} rounded-lg bg-gradient-to-br from-[#9966ff]/30 to-[#ffd700]/30 flex items-center justify-center border-2 border-[#ffd700]/50 animate-pixel-float`}
        style={{ 
          boxShadow: `0 0 15px ${getVariantColor(variant)}40` 
        }}
      >
        <span className={fontSize[size]}>🐸</span>
      </div>
    );
  }

  return (
    <div 
      className={`${sizeClasses[size]} rounded-lg overflow-hidden border-2 border-[#ffd700] relative`}
      style={{ 
        boxShadow: `0 0 15px ${getVariantColor(variant)}40` 
      }}
    >
      <img
        src={imageUrl}
        alt={`Star Skrumpey #${tokenId}`}
        className="w-full h-full object-cover"
        onError={() => setImageError(true)}
      />
      <div className="absolute -top-1 -right-1 text-xs animate-pixel-pulse">⭐</div>
    </div>
  );
}

/**
 * Level Badge Component
 * Shows level number but colors based on holdings count
 */
function LevelBadge({ level, holdingsCount }: { level: number; holdingsCount: number }) {
  const color = getLevelColor(holdingsCount);
  
  return (
    <div 
      className="flex items-center gap-0.5 sm:gap-1 px-1 sm:px-2 py-0.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold border-2 animate-glow-pulse flex-shrink-0"
      style={{ 
        backgroundColor: `${color}20`,
        borderColor: `${color}80`,
        color,
        boxShadow: `0 0 10px ${color}40`,
      }}
    >
      <span className="text-[8px] sm:text-[10px]">LVL</span>
      <span>{level}</span>
    </div>
  );
}

/**
 * Star Variants Display
 */
function StarVariantsDisplay({ variants }: { variants: string[] }) {
  if (variants.length === 0) return null;
  
  return (
    <div className="flex flex-wrap gap-1">
      {variants.slice(0, 3).map((variant) => (
        <span 
          key={variant}
          className="text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5 rounded uppercase tracking-wider border"
          style={{ 
            ...getVariantTextStyle(variant),
            borderColor: `${getVariantColor(variant)}60`,
            backgroundColor: `${getVariantColor(variant)}15`,
          }}
        >
          {variant}
        </span>
      ))}
      {variants.length > 3 && (
        <span className="text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5 rounded text-gray-500 border border-gray-600">
          +{variants.length - 3}
        </span>
      )}
    </div>
  );
}

/**
 * Member Card Component
 */
function MemberCard({ 
  member, 
  rank,
  onClick,
}: { 
  member: MemberData; 
  rank: number;
  onClick: () => void;
}) {
  // Use avatar from profile if set, otherwise fall back to first token
  const primaryTokenId = member.avatarTokenId || member.tokenIds[0];
  const primaryVariant = member.starVariants[0];
  const levelTitle = getLevelTitle(member.count);
  
  // Determine card style based on rank
  const isTop3 = rank <= 3;
  const rankColors: Record<number, string> = {
    1: '#ffd700', // Gold
    2: '#c0c0c0', // Silver
    3: '#cd7f32', // Bronze
  };
  
  return (
    <div 
      onClick={onClick}
      className={`pixel-card p-3 sm:p-4 cursor-pointer smooth-transition hover-lift animate-slide-in-up ${
        isTop3 ? 'border-2' : ''
      }`}
      style={{
        animationDelay: `${Math.min(rank * 0.05, 0.5)}s`,
        borderColor: isTop3 ? rankColors[rank] : undefined,
        boxShadow: isTop3 ? `0 0 20px ${rankColors[rank]}30` : undefined,
      }}
    >
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Rank Badge */}
        <div 
          className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0"
          style={{
            backgroundColor: isTop3 ? `${rankColors[rank]}30` : '#1a1a2e',
            color: isTop3 ? rankColors[rank] : '#666',
            border: `2px solid ${isTop3 ? rankColors[rank] : '#2a2a4e'}`,
          }}
        >
          {rank === 1 && '👑'}
          {rank === 2 && '🥈'}
          {rank === 3 && '🥉'}
          {rank > 3 && (rank <= 99 ? `#${rank}` : rank)}
        </div>
        
        {/* Avatar */}
        <div className="hidden xs:block sm:block">
          <MemberAvatar 
            tokenId={primaryTokenId} 
            variant={primaryVariant}
            size="md"
          />
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 sm:gap-2 mb-1 flex-wrap">
            <p className="text-[#ffd700] text-xs sm:text-sm font-bold truncate">
              {member.displayName || truncateAddress(member.address)}
            </p>
            <LevelBadge level={member.level} holdingsCount={member.count} />
            {/* Displayed Badges */}
            {member.displayedBadges && member.displayedBadges.length > 0 && (
              <div className="flex gap-1">
                {member.displayedBadges.slice(0, 3).map(badgeId => {
                  const badge = ACHIEVEMENTS.find(a => a.id === badgeId);
                  if (!badge) return null;
                  return (
                    <div 
                      key={badgeId}
                      className="w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-xs border"
                      style={{ 
                        backgroundColor: `${badge.color}20`,
                        borderColor: `${badge.color}60`,
                      }}
                      title={badge.name}
                    >
                      {badge.icon}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          <p className="text-gray-500 text-[9px] sm:text-[10px] font-mono mb-1 truncate">
            {truncateAddress(member.address)}
          </p>
          
          <p 
            className="text-[9px] sm:text-[10px] uppercase tracking-wider truncate"
            style={{ color: getLevelColor(member.count) }}
          >
            {levelTitle}
          </p>
        </div>
        
        {/* Holdings */}
        <div className="text-right flex-shrink-0">
          <div className="flex items-center gap-0.5 sm:gap-1 mb-1">
            <span className="text-[#ffd700] text-base sm:text-lg font-bold">{member.count}</span>
            <span className="text-base sm:text-xl">⭐</span>
          </div>
          <p className="text-gray-500 text-[8px] sm:text-[10px] hidden sm:block">
            STAR {member.count === 1 ? 'SKRUMPEY' : 'SKRUMPEYS'}
          </p>
        </div>
      </div>
      
      {/* Variants row */}
      {member.starVariants.length > 0 && (
        <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-[#2a2a4e]">
          <StarVariantsDisplay variants={member.starVariants} />
        </div>
      )}
    </div>
  );
}

/**
 * Member Detail Modal
 */
function MemberDetailModal({
  member,
  onClose,
}: {
  member: MemberData;
  onClose: () => void;
}) {
  const { address: currentUserAddress, isConnected } = useAccount();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none');
  const [isLoadingFriendStatus, setIsLoadingFriendStatus] = useState(false);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  
  // Use avatar from profile if set, otherwise fall back to first token
  const primaryTokenId = member.avatarTokenId || member.tokenIds[0];
  const imageUrl = primaryTokenId ? getSkrumpeyImageUrl(primaryTokenId) : null;
  const levelTitle = getLevelTitle(member.count);
  
  // Check if this is the current user
  const isCurrentUser = currentUserAddress?.toLowerCase() === member.address.toLowerCase();
  
  // Fetch friend status
  useEffect(() => {
    if (!currentUserAddress || isCurrentUser) return;
    
    let cancelled = false;
    const fetchStatus = async () => {
      setIsLoadingFriendStatus(true);
      try {
        const res = await fetch(`/api/friends?address=${currentUserAddress}&type=status&otherAddress=${member.address}`);
        const data = await res.json();
        if (!cancelled && data.success) {
          setFriendStatus(data.status);
        }
      } catch (error) {
        console.error('Failed to fetch friend status:', error);
      } finally {
        if (!cancelled) setIsLoadingFriendStatus(false);
      }
    };

    fetchStatus();
    return () => {
      cancelled = true;
    };
  }, [currentUserAddress, member.address, isCurrentUser]);
  
  // Send friend request handler
  const handleSendFriendRequest = async () => {
    if (!currentUserAddress || isSendingRequest) return;
    
    setIsSendingRequest(true);
    try {
      const walletAuthHeader = await getWalletAuthHeader(currentUserAddress);
      if (!walletAuthHeader) {
        return;
      }

      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-auth': walletAuthHeader,
        },
        body: JSON.stringify({
          walletAddress: currentUserAddress,
          targetAddress: member.address,
          action: 'send',
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setFriendStatus('pending_sent');
      }
    } catch (error) {
      console.error('Failed to send friend request:', error);
    } finally {
      setIsSendingRequest(false);
    }
  };
  
  // Accept friend request handler
  const handleAcceptRequest = async () => {
    if (!currentUserAddress || isSendingRequest) return;
    
    setIsSendingRequest(true);
    try {
      const walletAuthHeader = await getWalletAuthHeader(currentUserAddress);
      if (!walletAuthHeader) {
        return;
      }

      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-auth': walletAuthHeader,
        },
        body: JSON.stringify({
          walletAddress: currentUserAddress,
          targetAddress: member.address,
          action: 'accept',
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setFriendStatus('accepted');
      }
    } catch (error) {
      console.error('Failed to accept friend request:', error);
    } finally {
      setIsSendingRequest(false);
    }
  };
  
  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in overflow-hidden"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      
      {/* Modal - with overscroll containment to prevent background scroll on mobile */}
      <div 
        className="relative z-10 w-full max-w-lg pixel-card p-6 animate-slide-in-up max-h-[90vh] overflow-y-auto overscroll-contain touch-pan-y scrollbar-pixel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white rounded-lg hover:bg-[#2a2a4e] smooth-transition"
        >
          ✕
        </button>

        {/* Avatar Section */}
        <div className="text-center mb-6">
          <div className="w-24 h-24 mx-auto mb-4 rounded-lg overflow-hidden border-3 border-[#ffd700] relative"
            style={{ boxShadow: '0 0 30px rgba(255, 215, 0, 0.4)' }}
          >
            {(!imageLoaded || imageError || !imageUrl) && (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#9966ff]/30 to-[#ffd700]/30 text-5xl">
                🐸
              </div>
            )}
            {imageUrl && !imageError && (
              <img
                src={imageUrl}
                alt={`Star Skrumpey #${primaryTokenId}`}
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            )}
          </div>
          
          <h2 className="text-[#ffd700] text-lg font-bold mb-1 animate-glow-pulse">
            {member.displayName || truncateAddress(member.address)}
          </h2>
          
          <p className="text-gray-400 text-xs font-mono mb-2">
            {member.address}
          </p>
          
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <LevelBadge level={member.level} holdingsCount={member.count} />
            <span 
              className="text-xs uppercase tracking-wider"
              style={{ color: getLevelColor(member.count) }}
            >
              {levelTitle}
            </span>
          </div>
          
          {/* Displayed Badges */}
          {member.displayedBadges && member.displayedBadges.length > 0 && (
            <div className="flex justify-center gap-2 mt-3">
              {member.displayedBadges.map(badgeId => {
                const badge = ACHIEVEMENTS.find(a => a.id === badgeId);
                if (!badge) return null;
                return (
                  <div 
                    key={badgeId}
                    className="flex flex-col items-center"
                    title={badge.description}
                  >
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-lg border-2"
                      style={{ 
                        backgroundColor: `${badge.color}20`,
                        borderColor: badge.color,
                        boxShadow: `0 0 10px ${badge.color}40`,
                      }}
                    >
                      {badge.icon}
                    </div>
                    <p className="text-[8px] mt-1" style={{ color: badge.color }}>
                      {badge.name.split(' ')[0] || badge.name}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Action Buttons - Only show for other users */}
          {isConnected && !isCurrentUser && (
            <div className="flex justify-center gap-3 mt-4">
              {/* Friend Request Button */}
              {isLoadingFriendStatus ? (
                <span className="text-gray-500 text-xs">Loading...</span>
              ) : friendStatus === 'none' ? (
                <button
                  onClick={handleSendFriendRequest}
                  disabled={isSendingRequest}
                  className="pixel-btn text-[10px] !px-4 !py-2 disabled:opacity-50"
                >
                  {isSendingRequest ? '...' : '👋 Add Friend'}
                </button>
              ) : friendStatus === 'pending_sent' ? (
                <span className="text-[#ffd700] text-xs bg-[#ffd700]/20 px-3 py-2 rounded border border-[#ffd700]/50">
                  ⏳ Request Sent
                </span>
              ) : friendStatus === 'pending_received' ? (
                <button
                  onClick={handleAcceptRequest}
                  disabled={isSendingRequest}
                  className="pixel-btn pixel-btn-gold text-[10px] !px-4 !py-2 disabled:opacity-50"
                >
                  {isSendingRequest ? '...' : '✓ Accept Request'}
                </button>
              ) : friendStatus === 'accepted' ? (
                <span className="text-[#44ff88] text-xs bg-[#44ff88]/20 px-3 py-2 rounded border border-[#44ff88]/50">
                  ✓ Friends
                </span>
              ) : null}
              
              {/* Message Button - Always show for non-blocked users */}
              {friendStatus !== 'blocked' && (
                <a
                  href={`/profile?tab=messages&chat=${member.address}`}
                  className="pixel-btn text-[10px] !px-4 !py-2"
                >
                  💬 Message
                </a>
              )}
            </div>
          )}
        </div>
        
        {/* Bio */}
        {member.bio && (
          <div className="mb-6 p-3 bg-[#0a0a15] rounded-lg border border-[#2a2a4e]">
            <p className="text-gray-400 text-xs italic leading-relaxed">&ldquo;{member.bio}&rdquo;</p>
          </div>
        )}
        
        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="text-center p-3 bg-[#0a0a15] rounded-lg border border-[#ffd700]/30">
            <p className="text-[#ffd700] text-xl font-bold">{member.count}</p>
            <p className="text-gray-500 text-[10px]">HOLDINGS</p>
          </div>
          <div className="text-center p-3 bg-[#0a0a15] rounded-lg border border-[#9966ff]/30">
            <p className="text-[#9966ff] text-xl font-bold">{member.starVariants.length}</p>
            <p className="text-gray-500 text-[10px]">VARIANTS</p>
          </div>
          <div className="text-center p-3 bg-[#0a0a15] rounded-lg border border-[#44ff88]/30">
            <p className="text-[#44ff88] text-xl font-bold">{member.level}</p>
            <p className="text-gray-500 text-[10px]">LEVEL</p>
          </div>
        </div>
        
        {/* Star Variants */}
        {member.starVariants.length > 0 && (
          <div className="mb-6">
            <h4 className="text-[#9966ff] text-xs tracking-wider mb-2">CONSTELLATION VARIANTS</h4>
            <div className="flex flex-wrap gap-2">
              {member.starVariants.map((variant) => (
                <span 
                  key={variant}
                  className="px-3 py-1 rounded-lg text-xs uppercase tracking-wider border"
                  style={{ 
                    ...getVariantTextStyle(variant),
                    borderColor: getVariantColor(variant),
                    backgroundColor: `${getVariantColor(variant)}20`,
                  }}
                >
                  {variant}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Token IDs */}
        <div>
          <h4 className="text-[#9966ff] text-xs tracking-wider mb-2">
            OWNED TOKEN IDS ({member.tokenIds.length})
          </h4>
          <div className="flex flex-wrap gap-1 max-h-[100px] overflow-y-auto scrollbar-pixel">
            {member.tokenIds.slice(0, 20).map((tokenId) => (
              <span 
                key={tokenId}
                className="px-2 py-1 bg-[#1a1a2e] rounded text-[10px] text-gray-400 border border-[#2a2a4e]"
              >
                #{tokenId}
              </span>
            ))}
            {member.tokenIds.length > 20 && (
              <span className="px-2 py-1 bg-[#1a1a2e] rounded text-[10px] text-[#ffd700] border border-[#2a2a4e]">
                +{member.tokenIds.length - 20} more
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Stats Overview Component
 */
function StatsOverview({
  totalMembers,
  totalStarSkrumpeys,
  isLoading,
}: {
  totalMembers: number;
  totalStarSkrumpeys: number;
  isLoading: boolean;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
      <div className="pixel-card p-3 md:p-4 text-center animate-slide-in-up animate-delay-1">
        <p className="text-[#ffd700] text-xl sm:text-2xl font-bold animate-glow-pulse">
          {isLoading ? '...' : totalMembers}
        </p>
        <p className="text-gray-500 text-[8px] sm:text-[10px] tracking-wider">TOTAL HOLDERS</p>
      </div>
      <div className="pixel-card p-3 md:p-4 text-center animate-slide-in-up animate-delay-2">
        <p className="text-[#9966ff] text-xl sm:text-2xl font-bold animate-glow-pulse">
          {isLoading ? '...' : totalStarSkrumpeys}
        </p>
        <p className="text-gray-500 text-[8px] sm:text-[10px] tracking-wider leading-tight">STAR SKRUMPEYS</p>
      </div>
      <div className="pixel-card p-3 md:p-4 text-center animate-slide-in-up animate-delay-3">
        <p className="text-[#44ff88] text-xl sm:text-2xl font-bold">{MAX_STAR_SKRUMPEY_SUPPLY}</p>
        <p className="text-gray-500 text-[8px] sm:text-[10px] tracking-wider">MAX SUPPLY</p>
      </div>
      <div className="pixel-card p-3 md:p-4 text-center animate-slide-in-up animate-delay-4">
        <p className="text-[#00ffff] text-xl sm:text-2xl font-bold">
          {isLoading ? '...' : totalMembers > 0 ? (totalStarSkrumpeys / totalMembers).toFixed(1) : '0'}
        </p>
        <p className="text-gray-500 text-[8px] sm:text-[10px] tracking-wider leading-tight">AVG PER HOLDER</p>
      </div>
    </div>
  );
}

/**
 * Search and Filter Component
 */
function SearchFilter({
  searchTerm,
  onSearchChange,
  sortBy,
  onSortChange,
}: {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  sortBy: 'holdings' | 'level' | 'address';
  onSortChange: (value: 'holdings' | 'level' | 'address') => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6 animate-slide-in-up animate-delay-5">
      {/* Search Input */}
      <div className="flex-1">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search address or name..."
          className="w-full bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-3 sm:px-4 py-2 text-white text-xs sm:text-sm focus:border-[#ffd700] focus:outline-none smooth-transition"
        />
      </div>
      
      {/* Sort Dropdown */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-gray-500 text-[10px] sm:text-xs whitespace-nowrap">SORT BY:</span>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as 'holdings' | 'level' | 'address')}
          className="bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-2 sm:px-3 py-2 text-white text-[10px] sm:text-xs focus:border-[#ffd700] focus:outline-none cursor-pointer smooth-transition flex-1 sm:flex-initial min-w-0"
        >
          <option value="holdings">Holdings</option>
          <option value="level">Level</option>
          <option value="address">Address</option>
        </select>
      </div>
    </div>
  );
}

/**
 * Main Members Content Component
 */
export default function MembersContent() {
  const { isConnected } = useDAOAccess();
  const [members, setMembers] = useState<MemberData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'holdings' | 'level' | 'address'>('holdings');
  const [totalMembers, setTotalMembers] = useState(0);
  const [totalStarSkrumpeys, setTotalStarSkrumpeys] = useState(0);

  // Fetch members from API
  const fetchMembers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/members');
      const data = await response.json();
      
      if (data.success) {
        setMembers(data.members);
        setTotalMembers(data.totalMembers);
        setTotalStarSkrumpeys(data.totalStarSkrumpeys);
      } else {
        setError(data.error || 'Failed to load members');
      }
    } catch (err) {
      setError('Failed to connect to server');
      console.error('Failed to fetch members:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Filter and sort members
  const filteredMembers = members
    .filter((member) => {
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return (
        member.address.toLowerCase().includes(search) ||
        member.displayName?.toLowerCase().includes(search) ||
        member.starVariants.some(v => v.toLowerCase().includes(search))
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'holdings':
          return b.count - a.count;
        case 'level':
          return b.level - a.level || b.count - a.count;
        case 'address':
          return a.address.localeCompare(b.address);
        default:
          return 0;
      }
    });

  return (
    <>
      {/* Page Header */}
      <div className="text-center mb-8 animate-slide-in-up px-4">
        <h1 className="text-base sm:text-lg md:text-xl text-[#ffd700] pixel-glow-gold tracking-wider mb-2 whitespace-nowrap">
          STAR HOLDERS
        </h1>
        <p className="text-xs sm:text-sm text-[#9966ff] tracking-wide animate-glow-pulse">
          the real ones
        </p>
      </div>

      {/* Stats Overview */}
      <StatsOverview 
        totalMembers={totalMembers}
        totalStarSkrumpeys={totalStarSkrumpeys}
        isLoading={isLoading}
      />

      {/* Analytics Section - Collapsible (includes Holder Chart) */}
      <AnalyticsSection members={members} isLoading={isLoading} />

      {/* Divider */}
      <div className="pixel-divider mb-6" />

      {/* Members Section Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-[#ffd700] text-sm sm:text-base tracking-wider">
          👤 LEADERBOARD
        </h2>
        
        {/* CSV Export Button */}
        {!isLoading && members.length > 0 && (
          <div className="relative group">
            <button
              onClick={() => {
                // Generate CSV content
                const csvRows = [
                  // Header row
                  ['Rank', 'Wallet Address', 'Display Name', 'Holdings Count', 'Level', 'Tier', 'Star Variants', 'Token IDs'].join(','),
                  // Data rows
                  ...members.map((member, index) => {
                    const tier = member.count >= 10 ? 'Cosmic Emperor' : 
                                 member.count >= 5 ? 'Star Lord' : 
                                 member.count >= 2 ? 'Cosmic Warden' : 'Star Forged';
                    return [
                      index + 1,
                      member.address,
                      `"${(member.displayName || '').replace(/"/g, '""')}"`,
                      member.count,
                      member.level,
                      tier,
                      `"${member.starVariants.join(', ')}"`,
                      `"${member.tokenIds.join(', ')}"`,
                    ].join(',');
                  }),
                ];
                const csvContent = csvRows.join('\n');
                
                // Create download
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', `star-skrumpey-holders-${new Date().toISOString().split('T')[0]}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              }}
              className="pixel-btn text-[10px] sm:text-xs flex items-center gap-2 !py-2 !px-3"
              title="Download holder data as CSV"
            >
              <span>📊</span>
              <span className="hidden sm:inline">EXPORT CSV</span>
              <span className="sm:hidden">CSV</span>
            </button>
            
            {/* Tooltip */}
            <div className="absolute top-full right-0 mt-2 w-64 p-3 bg-[#1a1a2e] border border-[#9966ff]/50 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible smooth-transition z-20 pointer-events-none">
              <p className="text-[#ffd700] text-xs font-bold mb-1">📊 Export Holder Data</p>
              <p className="text-gray-400 text-[10px] leading-relaxed">
                Download a CSV file containing all {members.length} Star Skrumpey holder wallets, their holdings count, tier rankings, constellation variants, and token IDs. Perfect for airdrops, snapshot tools, or community analysis.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Search and Filter */}
      <SearchFilter
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      {/* Error State */}
      {error && (
        <div className="pixel-card p-6 text-center mb-6 animate-slide-in-up">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-[#ff4466] text-sm mb-4">{error}</p>
          <button 
            onClick={fetchMembers}
            className="pixel-btn pixel-btn-gold text-xs smooth-transition hover-lift"
          >
            TRY AGAIN
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="pixel-card p-8 text-center animate-slide-in-up">
          <div className="text-4xl mb-4 animate-spin">⭐</div>
          <p className="text-[#ffd700] text-xs animate-pixel-pulse">SCANNING THE COSMOS...</p>
          <p className="text-gray-500 text-[10px] mt-2">Loading Star Skrumpey holders from blockchain</p>
        </div>
      )}

      {/* Members List */}
      {!isLoading && !error && (
        <div className="space-y-3">
          {filteredMembers.length === 0 ? (
            <div className="pixel-card p-8 text-center animate-slide-in-up">
              <div className="text-4xl mb-4 animate-pixel-float">🔍</div>
              <p className="text-gray-400 text-sm">
                {searchTerm ? 'No members found matching your search' : 'No Star Skrumpey holders found'}
              </p>
            </div>
          ) : (
            filteredMembers.map((member, index) => (
              <MemberCard
                key={member.address}
                member={member}
                rank={index + 1}
                onClick={() => setSelectedMember(member)}
              />
            ))
          )}
        </div>
      )}

      {/* Results count */}
      {!isLoading && !error && filteredMembers.length > 0 && (
        <div className="text-center mt-6 animate-slide-in-up">
          <p className="text-gray-500 text-xs">
            Showing {filteredMembers.length} of {totalMembers} holders
          </p>
        </div>
      )}

      {/* Member Detail Modal */}
      {selectedMember && (
        <MemberDetailModal 
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}

      {/* Info Section */}
      <div className="pixel-card p-4 mt-8 bg-[#0a0a15] animate-slide-in-up">
        <p className="text-[#9966ff] text-xs tracking-wide mb-2">RANKING SYSTEM</p>
        <ul className="text-gray-400 text-[10px] space-y-1">
          <li>• <span className="text-[#ffd700]">COSMIC EMPEROR</span> - 10+ Star Skrumpeys</li>
          <li>• <span className="text-[#ff00ff]">STAR LORD</span> - 5+ Star Skrumpeys</li>
          <li>• <span className="text-[#00ffff]">COSMIC WARDEN</span> - 2+ Star Skrumpeys</li>
          <li>• <span className="text-[#9966ff]">STAR FORGED</span> - 1+ Star Skrumpeys</li>
        </ul>
      </div>
    </>
  );
}
