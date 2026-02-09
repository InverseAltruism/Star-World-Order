'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getSkrumpeyImageUrl, STAR_SKRUMPEY_IDS, CONSTELLATION_RARITY } from '@/lib/starSkrumpey';
import { useDAOAccess } from '@/lib/hooks/useDAOAccess';
import { useAccount } from 'wagmi';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';

// Max supply constant
const MAX_STAR_SKRUMPEY_SUPPLY = STAR_SKRUMPEY_IDS.length;

/**
 * Friend status type
 */
type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';

/**
 * Member data interface from API
 */
interface MemberData {
  address: string;
  tokenIds: number[];
  starVariants: string[];
  count: number;
  displayName?: string;
  bio?: string;
  level: number;
  lastSeen?: string;
  displayedBadges?: string[];
  avatarTokenId?: number; // User's selected avatar token ID from profile
}

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
 * Get variant color - returns solid color for CSS color property
 * Each constellation type has a distinct color; rare traits have additional glow effects
 */
function getVariantColor(variant?: string): string {
  const colors: Record<string, string> = {
    // Common traits
    aether: '#87CEEB',      // Light blue
    spectra: '#40E0D0',     // Turquoise (primary from gradient)
    solveil: '#FFD93D',     // Bright warm yellow (solar/sun-like)
    nebulu: '#9966ff',      // Purple
    chroma: '#DDA0DD',      // Light purple (primary from gradient)
    rose: '#FFB6C1',        // Pink
    // Rare traits - more distinctive colors
    monflare: '#BF5FFF',    // Bright purple/magenta glow
    auracore: '#FFB347',    // Warm golden-orange (distinct from solveil)
    parallel: '#00CED1',    // Dark cyan (blue-green primary)
    prime: '#FFD700',       // Pure gold for legendary
  };
  return colors[variant || ''] || '#ffd700';
}

/**
 * Get variant gradient - returns gradient or solid color for background
 * Rare traits have special gradients to make them stand out
 */
function getVariantGradient(variant?: string): string {
  const gradients: Record<string, string> = {
    spectra: 'linear-gradient(90deg, #40E0D0, #87CEEB, #9966ff, #ffd700)', // Gradient: Turquoise -> light blue -> purple -> yellow
    chroma: 'linear-gradient(180deg, #DDA0DD, #9966ff)', // Light purple to darker purple gradient
    // Rare trait gradients
    monflare: 'linear-gradient(135deg, #9933FF, #BF5FFF, #E066FF)', // Purple glow gradient
    auracore: 'linear-gradient(135deg, #FF8C00, #FFB347, #FFD700)', // Golden glow gradient
    parallel: 'linear-gradient(90deg, #20B2AA, #00CED1, #4169E1)', // Blue-green to blue gradient
    prime: 'linear-gradient(135deg, #FFD700, #FFF8DC, #FFD700, #DAA520)', // Legendary gold shimmer
  };
  return gradients[variant || ''] || getVariantColor(variant);
}

/**
 * Check if variant has a gradient (including rare traits)
 */
function isGradientVariant(variant?: string): boolean {
  return variant === 'spectra' || variant === 'chroma' || 
         variant === 'parallel' || variant === 'monflare' || 
         variant === 'auracore' || variant === 'prime';
}

/**
 * Check if variant is a rare trait (for special styling)
 */
function isRareVariant(variant?: string): boolean {
  return variant === 'monflare' || variant === 'auracore' || 
         variant === 'parallel' || variant === 'prime';
}

/**
 * Get text style for variant - handles both solid colors and gradients
 * Rare variants get gradient text with glow effects
 */
function getVariantTextStyle(variant?: string): React.CSSProperties {
  if (isGradientVariant(variant)) {
    const baseStyle: React.CSSProperties = {
      display: 'inline-block', // Required for gradient text to render properly
      background: getVariantGradient(variant),
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      color: 'transparent', // Fallback for non-webkit browsers
    };
    // Add text shadow glow for rare variants
    if (isRareVariant(variant)) {
      const glowColor = getVariantColor(variant);
      return {
        ...baseStyle,
        textShadow: `0 0 10px ${glowColor}80, 0 0 20px ${glowColor}40`,
        filter: 'brightness(1.1)',
      };
    }
    return baseStyle;
  }
  return { color: getVariantColor(variant) };
}

/**
 * Get level color based on Star Skrumpey holdings count
 */
function getLevelColor(holdingsCount: number): string {
  if (holdingsCount >= 10) return '#ffd700'; // Gold - Cosmic Emperor
  if (holdingsCount >= 5) return '#ff00ff'; // Magenta - Star Lord
  if (holdingsCount >= 2) return '#00ffff'; // Cyan - Cosmic Warden
  return '#9966ff'; // Purple - Star Forged
}

/**
 * Get level title based on Star Skrumpey holdings count
 * 
 * Title thresholds (based on holdings):
 * - 10+ holdings: COSMIC EMPEROR (highest honor)
 * - 5+ holdings: STAR LORD (veteran collector)
 * - 2+ holdings: COSMIC WARDEN (dedicated member)
 * - 1+ holdings: STAR FORGED (entry level)
 */
function getLevelTitle(holdingsCount: number): string {
  if (holdingsCount >= 10) return 'COSMIC EMPEROR';
  if (holdingsCount >= 5) return 'STAR LORD';
  if (holdingsCount >= 2) return 'COSMIC WARDEN';
  return 'STAR FORGED';
}

/**
 * Truncate address for display
 */
function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

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
    
    const fetchStatus = async () => {
      setIsLoadingFriendStatus(true);
      try {
        const res = await fetch(`/api/friends?address=${currentUserAddress}&type=status&otherAddress=${member.address}`);
        const data = await res.json();
        if (data.success) {
          setFriendStatus(data.status);
        }
      } catch (error) {
        console.error('Failed to fetch friend status:', error);
      } finally {
        setIsLoadingFriendStatus(false);
      }
    };
    
    fetchStatus();
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

// ============================================================
// HOLDER CHART TYPES AND COMPONENTS
// ============================================================

interface HolderStatsData {
  constellation: string;
  currentHolders: number;
  history: Array<{
    timestamp: number;
    holderCount: number;
  }>;
  lastUpdated: string;
}

// All constellation options for dropdown
const CONSTELLATION_OPTIONS = [
  { value: 'all', label: 'All Constellations' },
  { value: 'aether', label: 'Aether' },
  { value: 'spectra', label: 'Spectra' },
  { value: 'solveil', label: 'Solveil' },
  { value: 'nebulu', label: 'Nebulu' },
  { value: 'chroma', label: 'Chroma' },
  { value: 'rose', label: 'Rose' },
  { value: 'monflare', label: 'Monflare' },
  { value: 'auracore', label: 'Auracore' },
  { value: 'parallel', label: 'Parallel' },
  { value: 'prime', label: 'Prime' },
] as const;

/**
 * Holder Chart - Displays Star Skrumpey holder count over time
 * Features:
 * - 1H / 1D / 1W time range toggle
 * - Constellation filter (All or specific)
 * - SVG line chart with gradient fill
 * - Zoom in/out capability
 * - Real-time data from database
 */
function HolderChart() {
  const [timeRange, setTimeRange] = useState<'1H' | '1D' | '1W'>('1D');
  const [constellation, setConstellation] = useState<string>('all');
  const [statsData, setStatsData] = useState<HolderStatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Fetch holder stats data
  const fetchHolderStats = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(
        `/api/holder-stats?constellation=${constellation}&timeRange=${timeRange}`
      );
      const data = await response.json();
      
      if (data.success) {
        setStatsData(data.data);
      } else {
        setError(data.error || 'Failed to load holder stats');
      }
    } catch (err) {
      setError('Failed to load holder data');
      console.error('Failed to fetch holder stats:', err);
    } finally {
      setIsLoading(false);
    }
  }, [constellation, timeRange]);

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchHolderStats();
  }, [fetchHolderStats]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(fetchHolderStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchHolderStats]);

  // Chart dimensions - use aspect ratio 2:1 for better proportions
  const baseChartWidth = 400;
  const baseChartHeight = 200;
  const chartWidth = baseChartWidth * zoomLevel;
  const chartHeight = baseChartHeight * zoomLevel;
  const padding = { top: 20, right: 20, bottom: 40, left: 45 };
  
  // Calculate chart data
  const history = statsData?.history || [];
  const holderCounts = history.map(d => d.holderCount);
  const minCount = holderCounts.length > 0 ? Math.max(0, Math.min(...holderCounts) - 2) : 0;
  const maxCount = holderCounts.length > 0 ? Math.max(...holderCounts) + 2 : 10;
  const countRange = maxCount - minCount || 1;
  
  // Generate time labels for horizontal axis with proper date formatting
  const generateTimeLabels = () => {
    if (history.length < 2) return [];
    
    const labels: Array<{ x: number; label: string }> = [];
    const effectiveWidth = chartWidth - padding.left - padding.right;
    
    // Get number of labels based on time range
    const labelCount = zoomLevel >= 1.5 ? 7 : 5;
    
    for (let i = 0; i < labelCount; i++) {
      const dataIndex = Math.floor((i / (labelCount - 1)) * (history.length - 1));
      const timestamp = history[dataIndex]?.timestamp;
      
      if (timestamp) {
        const date = new Date(timestamp);
        let label: string;
        
        if (timeRange === '1H') {
          // For 1H time range: show hours and minutes
          label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (timeRange === '1D') {
          // For 1D time range: show month/day with time
          label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        } else {
          // For 1W time range: show full date
          label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
        
        labels.push({
          x: padding.left + (i / (labelCount - 1)) * effectiveWidth,
          label
        });
      }
    }
    
    return labels;
  };
  
  // Generate SVG path for the line
  const generatePath = () => {
    if (history.length < 2) return '';
    
    const effectiveWidth = chartWidth - padding.left - padding.right;
    const effectiveHeight = chartHeight - padding.top - padding.bottom;
    
    const points = history.map((point, index) => {
      const x = padding.left + (index / (history.length - 1)) * effectiveWidth;
      const y = padding.top + effectiveHeight - ((point.holderCount - minCount) / countRange) * effectiveHeight;
      return { x, y };
    });
    
    // Create smooth curve
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      path += ` Q ${prev.x} ${curr.y} ${midX} ${(prev.y + curr.y) / 2}`;
    }
    if (points.length > 1) {
      const last = points[points.length - 1];
      path += ` L ${last.x} ${last.y}`;
    }
    
    return path;
  };
  
  // Generate area fill path
  const generateAreaPath = () => {
    if (history.length < 2) return '';
    
    const effectiveWidth = chartWidth - padding.left - padding.right;
    const effectiveHeight = chartHeight - padding.top - padding.bottom;
    const bottomY = padding.top + effectiveHeight;
    
    const points = history.map((point, index) => {
      const x = padding.left + (index / (history.length - 1)) * effectiveWidth;
      const y = padding.top + effectiveHeight - ((point.holderCount - minCount) / countRange) * effectiveHeight;
      return { x, y };
    });
    
    let path = `M ${points[0].x} ${bottomY}`;
    path += ` L ${points[0].x} ${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      path += ` Q ${prev.x} ${curr.y} ${midX} ${(prev.y + curr.y) / 2}`;
    }
    
    if (points.length > 1) {
      const last = points[points.length - 1];
      path += ` L ${last.x} ${last.y}`;
      path += ` L ${last.x} ${bottomY}`;
    }
    path += ' Z';
    
    return path;
  };

  // Get color for selected constellation
  const chartColor = constellation === 'all' ? '#ffd700' : getVariantColor(constellation);
  const currentHolders = statsData?.currentHolders || 0;
  const timeLabels = generateTimeLabels();
  
  // Zoom handlers
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.5, 2.5));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.5, 1));

  return (
    <div className="pixel-card p-5 animate-slide-in-up">
      {/* Header with Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-[#ffd700] text-sm sm:text-base tracking-wider mb-1">
            👥 STAR SKRUMPEY HOLDERS
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-white text-2xl sm:text-3xl font-bold" style={{ color: chartColor }}>
              {isLoading ? '...' : currentHolders}
            </span>
            <span className="text-gray-500 text-xs">
              {constellation === 'all' ? 'UNIQUE HOLDERS' : `${constellation.toUpperCase()} HOLDERS`}
            </span>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Constellation Dropdown */}
          <select
            value={constellation}
            onChange={(e) => setConstellation(e.target.value)}
            className="bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-2 py-1 text-xs text-white focus:border-[#ffd700] focus:outline-none cursor-pointer smooth-transition"
          >
            {CONSTELLATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          
          {/* Time Range Toggle */}
          <div className="flex gap-1">
            {(['1H', '1D', '1W'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeRange(tf)}
                className={`px-3 py-1 text-xs rounded border-2 smooth-transition ${
                  timeRange === tf
                    ? 'bg-[#ffd700]/20 border-[#ffd700] text-[#ffd700]'
                    : 'bg-transparent border-[#2a2a4e] text-gray-500 hover:border-[#ffd700]/50'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          
          {/* Zoom Controls */}
          <div className="flex gap-1 ml-2">
            <button
              onClick={handleZoomOut}
              disabled={zoomLevel <= 1}
              className="px-2 py-1 text-xs rounded border-2 border-[#2a2a4e] text-gray-400 hover:border-[#ffd700]/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed smooth-transition"
              title="Zoom Out"
            >
              −
            </button>
            <button
              onClick={handleZoomIn}
              disabled={zoomLevel >= 2.5}
              className="px-2 py-1 text-xs rounded border-2 border-[#2a2a4e] text-gray-400 hover:border-[#ffd700]/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed smooth-transition"
              title="Zoom In"
            >
              +
            </button>
          </div>
        </div>
      </div>
      
      {/* Chart Container with horizontal scroll for zoom */}
      <div 
        className="relative w-full overflow-x-auto scrollbar-pixel" 
        style={{ maxWidth: '100%' }}
      >
        <div style={{ width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%', aspectRatio: '2 / 1', minWidth: '300px' }}>
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-3xl animate-spin">⭐</div>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-[#ff4466] text-sm mb-2">{error}</p>
              <button 
                onClick={fetchHolderStats}
                className="text-[#ffd700] text-sm underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          ) : history.length < 2 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-4xl mb-2">📊</div>
              <p className="text-gray-500 text-sm text-center">
                Collecting data... First chart will appear
                <br />
                after multiple snapshots are recorded.
              </p>
            </div>
          ) : (
            <svg 
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-full"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Grid lines */}
              <g stroke="#2a2a4e" strokeWidth="0.5">
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                  <line
                    key={ratio}
                    x1={padding.left}
                    y1={padding.top + (chartHeight - padding.top - padding.bottom) * ratio}
                    x2={chartWidth - padding.right}
                    y2={padding.top + (chartHeight - padding.top - padding.bottom) * ratio}
                  />
                ))}
              </g>
              
              {/* Y-axis labels */}
              <g fill="#888" fontSize="11" fontFamily="monospace">
                <text x={padding.left - 8} y={padding.top + 4} textAnchor="end">
                  {maxCount}
                </text>
                <text x={padding.left - 8} y={chartHeight - padding.bottom + 4} textAnchor="end">
                  {minCount}
                </text>
              </g>
              
              {/* X-axis time labels */}
              <g fill="#888" fontSize="10" fontFamily="monospace">
                {timeLabels.map((item, index) => (
                  <text 
                    key={index} 
                    x={item.x} 
                    y={chartHeight - padding.bottom + 20} 
                    textAnchor="middle"
                  >
                    {item.label}
                  </text>
                ))}
              </g>
              
              {/* Gradient definition */}
              <defs>
                <linearGradient id={`holderGradient-${constellation}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={chartColor} stopOpacity="0.4"/>
                  <stop offset="100%" stopColor={chartColor} stopOpacity="0"/>
                </linearGradient>
              </defs>
              
              {/* Area fill */}
              <path
                d={generateAreaPath()}
                fill={`url(#holderGradient-${constellation})`}
              />
              
              {/* Line */}
              <path
                d={generatePath()}
                fill="none"
                stroke={chartColor}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: `drop-shadow(0 0 4px ${chartColor})` }}
              />
              
              {/* Current value dot */}
              {history.length > 0 && (
                <circle
                  cx={chartWidth - padding.right}
                  cy={padding.top + (chartHeight - padding.top - padding.bottom) - 
                     ((history[history.length - 1].holderCount - minCount) / countRange) * 
                     (chartHeight - padding.top - padding.bottom)}
                  r="5"
                  fill={chartColor}
                  style={{ filter: `drop-shadow(0 0 6px ${chartColor})` }}
                />
              )}
            </svg>
          )}
        </div>
      </div>
      
      {/* Chart Info */}
      <div className="flex justify-between items-center mt-3 text-xs text-gray-500">
        <span>
          {timeRange === '1H' && 'Last 24 hours (hourly data)'}
          {timeRange === '1D' && 'Last 30 days (daily data)'}
          {timeRange === '1W' && 'Last 90 days (weekly data)'}
        </span>
        {statsData?.lastUpdated && !isLoading && (
          <span>
            Updated {new Date(statsData.lastUpdated).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Constellation Distribution Component
 * Shows the correct distribution of all 333 Star Skrumpeys by constellation type
 * Uses static CONSTELLATION_RARITY data from lib/starSkrumpey.ts which is the authoritative source
 */
function ConstellationDistribution({ 
  isLoading 
}: { 
  isLoading: boolean; 
}) {
  // Use the correct static constellation rarity data from CONSTELLATION_RARITY
  // See lib/starSkrumpey.ts for the authoritative source of these counts
  const sortedData = React.useMemo(() => {
    return Object.entries(CONSTELLATION_RARITY)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, []);
  
  const total = 333; // Total Star Skrumpeys
  
  // Chart dimensions
  const size = 240;
  const center = size / 2;
  const radius = 90;
  const innerRadius = 55;
  
  // Generate donut segments
  const segments = React.useMemo(() => {
    let currentAngle = -90; // Start from top
    return sortedData.map(({ name, count }) => {
      const angle = (count / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle = endAngle;
      
      // Calculate arc path
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;
      
      const x1 = center + radius * Math.cos(startRad);
      const y1 = center + radius * Math.sin(startRad);
      const x2 = center + radius * Math.cos(endRad);
      const y2 = center + radius * Math.sin(endRad);
      
      const ix1 = center + innerRadius * Math.cos(startRad);
      const iy1 = center + innerRadius * Math.sin(startRad);
      const ix2 = center + innerRadius * Math.cos(endRad);
      const iy2 = center + innerRadius * Math.sin(endRad);
      
      const largeArc = angle > 180 ? 1 : 0;
      
      const path = `
        M ${ix1} ${iy1}
        L ${x1} ${y1}
        A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}
        L ${ix2} ${iy2}
        A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1}
        Z
      `;
      
      return {
        name,
        count,
        percentage: ((count / total) * 100).toFixed(1),
        path,
        color: getVariantColor(name),
      };
    });
  }, [sortedData]);

  return (
    <div className="pixel-card p-5 animate-slide-in-up">
      <h3 className="text-[#9966ff] text-sm sm:text-base tracking-wider mb-4">
        🌌 CONSTELLATION DISTRIBUTION
      </h3>
      <p className="text-gray-500 text-[10px] mb-4">
        Distribution of all 333 Star Skrumpeys across constellation types
      </p>
      
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-3xl animate-spin">⭐</div>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row items-center gap-8">
          {/* Donut Chart */}
          <div className="relative flex-shrink-0">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              {segments.map((seg) => (
                <path
                  key={seg.name}
                  d={seg.path}
                  fill={seg.color}
                  stroke="#0a0a15"
                  strokeWidth="2"
                  style={{ 
                    filter: `drop-shadow(0 0 6px ${seg.color}40)`,
                    cursor: 'pointer',
                  }}
                  className="transition-all duration-200 hover:opacity-80 hover:scale-[1.02] origin-center"
                >
                  <title>{seg.name}: {seg.count} ({seg.percentage}%)</title>
                </path>
              ))}
              {/* Center text */}
              <text
                x={center}
                y={center - 10}
                textAnchor="middle"
                fill="#ffd700"
                fontSize="28"
                fontWeight="bold"
              >
                {total}
              </text>
              <text
                x={center}
                y={center + 12}
                textAnchor="middle"
                fill="#666"
                fontSize="11"
              >
                TOTAL STARS
              </text>
            </svg>
          </div>
          
          {/* Legend - Improved Grid Layout */}
          <div className="flex-1 w-full">
            <div className="grid grid-cols-2 gap-3">
              {sortedData.map(({ name, count }) => {
                const percentage = ((count / total) * 100).toFixed(1);
                const isRare = isRareVariant(name);
                return (
                  <div 
                    key={name} 
                    className={`flex items-center gap-3 p-2 rounded-lg bg-[#0a0a15]/50 border border-[#2a2a4e]/50 ${isRare ? 'ring-1 ring-[#ffd700]/30' : ''}`}
                  >
                    <div 
                      className="w-5 h-5 rounded flex-shrink-0"
                      style={{ 
                        backgroundColor: getVariantColor(name),
                        boxShadow: `0 0 8px ${getVariantColor(name)}40`,
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span 
                          className="text-xs font-bold capitalize"
                          style={getVariantTextStyle(name)}
                        >
                          {name}
                        </span>
                        {isRare && <span className="text-[8px]">✨</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm font-bold">{count}</span>
                        <span className="text-gray-500 text-[10px]">({percentage}%)</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Holder tier configuration using rank names
const HOLDER_TIERS = [
  { rank: 'COSMIC EMPEROR', icon: '🏆', min: 10, max: Infinity, color: '#ffd700', description: '10+ Star Skrumpeys' },
  { rank: 'STAR LORD', icon: '👑', min: 5, max: 9, color: '#ff00ff', description: '5-9 Star Skrumpeys' },
  { rank: 'COSMIC WARDEN', icon: '🌟', min: 2, max: 4, color: '#00ffff', description: '2-4 Star Skrumpeys' },
  { rank: 'STAR FORGED', icon: '⭐', min: 1, max: 1, color: '#9966ff', description: '1 Star Skrumpey' },
] as const;

/**
 * Holder Tier Breakdown
 * Shows how many members are in each rank tier (Cosmic Emperor, Star Lord, etc.)
 */
function HolderTierBreakdown({ 
  members, 
  isLoading 
}: { 
  members: MemberData[]; 
  isLoading: boolean; 
}) {
  // Calculate tier counts
  const tierCounts = React.useMemo(() => {
    return HOLDER_TIERS.map(tier => {
      const count = members.filter(m => m.count >= tier.min && m.count <= tier.max).length;
      return { ...tier, count };
    });
  }, [members]);
  
  const maxCount = Math.max(...tierCounts.map(t => t.count), 1);
  const totalHolders = members.length;
  
  return (
    <div className="pixel-card p-5 animate-slide-in-up">
      <h3 className="text-[#44ff88] text-sm sm:text-base tracking-wider mb-5">
        👑 HOLDER TIER BREAKDOWN
      </h3>
      
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-3xl animate-spin">👑</div>
        </div>
      ) : (
        <div className="space-y-4">
          {tierCounts.map((tier) => {
            const percentage = totalHolders > 0 ? ((tier.count / totalHolders) * 100).toFixed(1) : '0';
            return (
              <div key={tier.rank} className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{tier.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span 
                        className="text-sm font-bold truncate"
                        style={{ color: tier.color }}
                      >
                        {tier.rank}
                      </span>
                      <span className="text-white text-sm font-bold flex-shrink-0">
                        {tier.count} <span className="text-gray-500 text-xs">({percentage}%)</span>
                      </span>
                    </div>
                    <p className="text-gray-500 text-xs">{tier.description}</p>
                  </div>
                </div>
                <div className="h-3 bg-[#1a1a2e] rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-500"
                    style={{ 
                      width: `${(tier.count / maxCount) * 100}%`,
                      backgroundColor: tier.color,
                      boxShadow: `0 0 10px ${tier.color}50`,
                      minWidth: tier.count > 0 ? '8px' : '0',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {/* Tier Info */}
      {!isLoading && (
        <div className="mt-5 pt-4 border-t border-[#2a2a4e] text-xs text-gray-500">
          <p className="text-center">
            Total: {totalHolders} holders across all tiers
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Top Holders Mini Leaderboard
 * Shows top 5 holders with their NFT counts
 * Clicking on a holder opens their wallet on Monadvision
 */
function TopHoldersMini({ 
  members, 
  isLoading 
}: { 
  members: MemberData[]; 
  isLoading: boolean; 
}) {
  const topHolders = members.slice(0, 5);
  
  // Generate Monadvision URL for a wallet address
  const getMonadvisionUrl = (address: string) => {
    return `https://monadvision.com/address/${address}`;
  };
  
  return (
    <div className="pixel-card p-4 animate-slide-in-up">
      <h3 className="text-[#ffd700] text-xs sm:text-sm tracking-wider mb-2">
        👑 TOP HOLDERS
      </h3>
      <p className="text-gray-500 text-[9px] mb-4">
        Click to view on Monadvision
      </p>
      
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-2xl animate-spin">👑</div>
        </div>
      ) : (
        <div className="space-y-2">
          {topHolders.map((member, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
            return (
              <a 
                key={member.address}
                href={getMonadvisionUrl(member.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 py-2 px-3 rounded bg-[#0a0a15]/50 hover:bg-[#1a1a2e] hover:border-[#ffd700]/30 border border-transparent transition-all cursor-pointer group"
              >
                <span className="text-sm">{medal}</span>
                <span className="text-gray-300 text-[10px] truncate flex-1 group-hover:text-[#ffd700] transition-colors">
                  {member.displayName || truncateAddress(member.address)}
                </span>
                <span className="text-[#ffd700] text-xs font-bold">
                  {member.count}⭐
                </span>
                <span className="text-gray-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                  ↗
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Analytics Section - Collapsible section containing detailed analytics
 * Hidden by default, users can click to expand and view charts/distributions
 */
function AnalyticsSection({ 
  members, 
  isLoading 
}: { 
  members: MemberData[]; 
  isLoading: boolean; 
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="mb-6">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full pixel-card p-4 flex items-center justify-between cursor-pointer hover:bg-[#1a1a2e]/50 smooth-transition group"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">📊</span>
          <h2 className="text-[#ffd700] text-sm sm:text-base tracking-wider">
            ANALYTICS
          </h2>
          <span className="text-gray-500 text-xs">
            ({isExpanded ? 'click to hide' : 'click to view'})
          </span>
        </div>
        <span 
          className={`text-xl text-gray-400 smooth-transition transform ${isExpanded ? 'rotate-180' : ''}`}
        >
          ▼
        </span>
      </button>
      
      {/* Collapsible Content */}
      <div 
        className={`overflow-hidden smooth-transition ${
          isExpanded ? 'max-h-[3000px] opacity-100 mt-4' : 'max-h-0 opacity-0'
        }`}
      >
        {/* Holder Chart - Full Width */}
        <div className="mb-4">
          <HolderChart />
        </div>
        
        {/* Constellation Distribution - Full Width */}
        <div className="mb-4">
          <ConstellationDistribution isLoading={isLoading} />
        </div>
        
        {/* Holder Tier Breakdown - Full Width */}
        <div className="mb-4">
          <HolderTierBreakdown members={members} isLoading={isLoading} />
        </div>
        
        {/* Top Holders in full width below */}
        <div className="mt-4">
          <TopHoldersMini members={members} isLoading={isLoading} />
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
