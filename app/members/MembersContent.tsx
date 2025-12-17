'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getSkrumpeyImageUrl, STAR_TRAIT_VARIANTS, StarTraitVariant, STAR_SKRUMPEY_IDS } from '@/lib/starSkrumpey';
import { getUserStarBalance, formatStarAmount } from '@/lib/starPoints';

// ============================================================
// MARKETPLACE DATA TYPES
// ============================================================

interface FloorPricePoint {
  timestamp: number;
  price: number;
}

interface ConstellationFloor {
  constellation: string;
  floorPrice: number;
  count: number;
  listedCount: number;
}

interface SaleActivity {
  tokenId: number;
  price: number;
  seller: string;
  buyer: string;
  timestamp: number;
  txHash: string;
  constellation?: string;
}

interface MarketplaceData {
  overallFloor: number;
  constellationFloors: ConstellationFloor[];
  floorChartHourly: FloorPricePoint[];
  floorChartDaily: FloorPricePoint[];
  topSales: SaleActivity[];
  recentSales: SaleActivity[];
  totalListed: number;
  totalUnlisted: number;
  lastUpdated: string;
}

// Max supply constant
const MAX_STAR_SKRUMPEY_SUPPLY = STAR_SKRUMPEY_IDS.length;

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
  { id: 'star_seeker', name: 'Star Seeker', description: 'Hold at least 1 Star Skrumpey', icon: '⭐', color: '#ffd700' },
  { id: 'constellation_keeper', name: 'Constellation Keeper', description: 'Hold 3 or more Star Skrumpeys', icon: '🌟', color: '#00ffff' },
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
  if (holdingsCount >= 3) return '#00ffff'; // Cyan - Constellation Keeper
  return '#9966ff'; // Purple - Star Seeker
}

/**
 * Get level title based on Star Skrumpey holdings count
 * 
 * Title thresholds (based on holdings):
 * - 10+ holdings: COSMIC EMPEROR (highest honor)
 * - 5+ holdings: STAR LORD (veteran collector)
 * - 3+ holdings: CONSTELLATION KEEPER (dedicated member)
 * - 1+ holdings: STAR SEEKER (entry level)
 */
function getLevelTitle(holdingsCount: number): string {
  if (holdingsCount >= 10) return 'COSMIC EMPEROR';
  if (holdingsCount >= 5) return 'STAR LORD';
  if (holdingsCount >= 3) return 'CONSTELLATION KEEPER';
  return 'STAR SEEKER';
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
  const primaryTokenId = member.tokenIds[0];
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
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const primaryTokenId = member.tokenIds[0];
  const imageUrl = primaryTokenId ? getSkrumpeyImageUrl(primaryTokenId) : null;
  const levelTitle = getLevelTitle(member.count);
  
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      
      {/* Modal */}
      <div 
        className="relative z-10 w-full max-w-lg pixel-card p-6 animate-slide-in-up max-h-[90vh] overflow-y-auto scrollbar-pixel"
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
// MARKETPLACE ANALYTICS COMPONENTS
// ============================================================

/**
 * Floor Price Chart - Pure CSS/SVG implementation
 * Displays smoothed floor price over time with 1H/1D toggle
 */
function FloorPriceChart({
  hourlyData,
  dailyData,
  isLoading,
}: {
  hourlyData: FloorPricePoint[];
  dailyData: FloorPricePoint[];
  isLoading: boolean;
}) {
  const [timeframe, setTimeframe] = useState<'1H' | '1D'>('1H');
  
  const data = timeframe === '1H' ? hourlyData : dailyData;
  
  // Calculate chart dimensions and data
  const chartWidth = 100; // percentage
  const chartHeight = 120;
  const padding = { top: 10, right: 10, bottom: 20, left: 40 };
  
  // Get min/max for scaling
  const prices = data.map(d => d.price).filter(p => p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) * 0.95 : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) * 1.05 : 1;
  const priceRange = maxPrice - minPrice || 1;
  
  // Generate SVG path
  const generatePath = () => {
    if (data.length < 2) return '';
    
    const effectiveWidth = 300 - padding.left - padding.right;
    const effectiveHeight = chartHeight - padding.top - padding.bottom;
    
    const points = data.map((point, index) => {
      const x = padding.left + (index / (data.length - 1)) * effectiveWidth;
      const y = padding.top + effectiveHeight - ((point.price - minPrice) / priceRange) * effectiveHeight;
      return { x, y };
    });
    
    // Create smooth curve using quadratic bezier
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
    if (data.length < 2) return '';
    
    const effectiveWidth = 300 - padding.left - padding.right;
    const effectiveHeight = chartHeight - padding.top - padding.bottom;
    const bottomY = padding.top + effectiveHeight;
    
    const points = data.map((point, index) => {
      const x = padding.left + (index / (data.length - 1)) * effectiveWidth;
      const y = padding.top + effectiveHeight - ((point.price - minPrice) / priceRange) * effectiveHeight;
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
  
  const currentFloor = prices.length > 0 ? prices[prices.length - 1] : 0;
  const priceChange = prices.length >= 2 
    ? ((prices[prices.length - 1] - prices[0]) / prices[0] * 100) 
    : 0;

  return (
    <div className="pixel-card p-4 mb-6 animate-slide-in-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[#ffd700] text-xs sm:text-sm tracking-wider mb-1">
            ⭐ STAR SKRUMPEY FLOOR
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-white text-lg sm:text-xl font-bold">
              {isLoading ? '...' : currentFloor > 0 ? `${currentFloor.toFixed(2)} MON` : 'N/A'}
            </span>
            {!isLoading && priceChange !== 0 && (
              <span className={`text-xs px-2 py-0.5 rounded ${
                priceChange >= 0 ? 'text-[#44ff88] bg-[#44ff88]/20' : 'text-[#ff4466] bg-[#ff4466]/20'
              }`}>
                {priceChange >= 0 ? '↑' : '↓'} {Math.abs(priceChange).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        
        {/* Timeframe Toggle */}
        <div className="flex gap-1">
          {(['1H', '1D'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 text-[10px] sm:text-xs rounded border-2 smooth-transition ${
                timeframe === tf
                  ? 'bg-[#ffd700]/20 border-[#ffd700] text-[#ffd700]'
                  : 'bg-transparent border-[#2a2a4e] text-gray-500 hover:border-[#ffd700]/50'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      
      {/* Chart */}
      <div className="relative w-full" style={{ height: chartHeight }}>
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-2xl animate-spin">⭐</div>
          </div>
        ) : data.length < 2 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-500 text-xs">No chart data available yet</p>
          </div>
        ) : (
          <svg 
            viewBox="0 0 300 120" 
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            {/* Grid lines */}
            <g stroke="#2a2a4e" strokeWidth="0.5">
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                <line
                  key={ratio}
                  x1={padding.left}
                  y1={padding.top + (chartHeight - padding.top - padding.bottom) * ratio}
                  x2={300 - padding.right}
                  y2={padding.top + (chartHeight - padding.top - padding.bottom) * ratio}
                />
              ))}
            </g>
            
            {/* Y-axis labels */}
            <g fill="#666" fontSize="8" fontFamily="'Press Start 2P', monospace">
              <text x={padding.left - 5} y={padding.top + 4} textAnchor="end">
                {maxPrice.toFixed(1)}
              </text>
              <text x={padding.left - 5} y={chartHeight - padding.bottom + 4} textAnchor="end">
                {minPrice.toFixed(1)}
              </text>
            </g>
            
            {/* Gradient definition */}
            <defs>
              <linearGradient id="floorGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffd700" stopOpacity="0.4"/>
                <stop offset="100%" stopColor="#ffd700" stopOpacity="0"/>
              </linearGradient>
            </defs>
            
            {/* Area fill */}
            <path
              d={generateAreaPath()}
              fill="url(#floorGradient)"
            />
            
            {/* Line */}
            <path
              d={generatePath()}
              fill="none"
              stroke="#ffd700"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0 0 4px #ffd700)' }}
            />
            
            {/* Current price dot */}
            {data.length > 0 && (
              <circle
                cx={300 - padding.right}
                cy={padding.top + (chartHeight - padding.top - padding.bottom) - 
                   ((data[data.length - 1].price - minPrice) / priceRange) * 
                   (chartHeight - padding.top - padding.bottom)}
                r="4"
                fill="#ffd700"
                style={{ filter: 'drop-shadow(0 0 6px #ffd700)' }}
              />
            )}
          </svg>
        )}
      </div>
      
      {/* Time labels */}
      {data.length >= 2 && !isLoading && (
        <div className="flex justify-between mt-1 px-10 text-gray-500 text-[8px]">
          <span>{timeframe === '1H' ? '24h ago' : '30d ago'}</span>
          <span>NOW</span>
        </div>
      )}
    </div>
  );
}

/**
 * Constellation Floor Prices Grid
 */
function ConstellationFloorGrid({
  floors,
  isLoading,
}: {
  floors: ConstellationFloor[];
  isLoading: boolean;
}) {
  // Sort by floor price descending (most expensive first), 0 prices at end
  const sortedFloors = useMemo(() => {
    return [...floors].sort((a, b) => {
      if (a.floorPrice === 0 && b.floorPrice === 0) return 0;
      if (a.floorPrice === 0) return 1;
      if (b.floorPrice === 0) return -1;
      return b.floorPrice - a.floorPrice;
    });
  }, [floors]);

  return (
    <div className="pixel-card p-4 mb-6 animate-slide-in-up animate-delay-1">
      <h3 className="text-[#9966ff] text-xs sm:text-sm tracking-wider mb-4">
        🌟 FLOOR BY CONSTELLATION
      </h3>
      
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="text-2xl animate-spin">⭐</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {sortedFloors.map((floor) => (
            <div
              key={floor.constellation}
              className="bg-[#0a0a15] rounded-lg p-2 sm:p-3 border border-[#2a2a4e] hover:border-[#ffd700]/50 smooth-transition"
            >
              <div className="flex items-center gap-1 mb-1">
                <span 
                  className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider truncate"
                  style={{ color: getVariantColor(floor.constellation) }}
                >
                  {floor.constellation}
                </span>
              </div>
              <div className="text-white text-xs sm:text-sm font-bold">
                {floor.floorPrice > 0 ? `${floor.floorPrice.toFixed(2)}` : '-'}
                {floor.floorPrice > 0 && <span className="text-[8px] text-gray-500 ml-1">MON</span>}
              </div>
              <div className="text-gray-500 text-[8px] mt-1">
                {floor.listedCount}/{floor.count} listed
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Highest Sales Ever - Top Sales Display
 */
function HighestSalesSection({
  sales,
  isLoading,
}: {
  sales: SaleActivity[];
  isLoading: boolean;
}) {
  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="pixel-card p-4 mb-6 animate-slide-in-up animate-delay-2">
      <h3 className="text-[#44ff88] text-xs sm:text-sm tracking-wider mb-4">
        👑 HIGHEST SALES EVER
      </h3>
      
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="text-2xl animate-spin">⭐</div>
        </div>
      ) : sales.length === 0 ? (
        <div className="text-center py-6">
          <div className="text-3xl mb-2">📊</div>
          <p className="text-gray-500 text-xs">No sales data available yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sales.slice(0, 5).map((sale, index) => (
            <div
              key={`${sale.txHash}-${index}`}
              className="flex items-center gap-3 bg-[#0a0a15] rounded-lg p-2 sm:p-3 border border-[#2a2a4e] hover:border-[#44ff88]/50 smooth-transition"
            >
              {/* Rank Badge */}
              <div 
                className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold flex-shrink-0 ${
                  index === 0 ? 'bg-[#ffd700]/20 text-[#ffd700] border-2 border-[#ffd700]' :
                  index === 1 ? 'bg-[#c0c0c0]/20 text-[#c0c0c0] border-2 border-[#c0c0c0]' :
                  index === 2 ? 'bg-[#cd7f32]/20 text-[#cd7f32] border-2 border-[#cd7f32]' :
                  'bg-[#2a2a4e] text-gray-400 border-2 border-[#3a3a5e]'
                }`}
              >
                {index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
              </div>
              
              {/* Token Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white text-xs sm:text-sm font-bold">
                    #{sale.tokenId}
                  </span>
                  {sale.constellation && (
                    <span 
                      className="text-[8px] px-1.5 py-0.5 rounded uppercase"
                      style={{ 
                        color: getVariantColor(sale.constellation),
                        backgroundColor: `${getVariantColor(sale.constellation)}20`,
                      }}
                    >
                      {sale.constellation}
                    </span>
                  )}
                </div>
                <div className="text-gray-500 text-[8px] sm:text-[10px] truncate">
                  {formatAddress(sale.seller)} → {formatAddress(sale.buyer)}
                </div>
              </div>
              
              {/* Price & Date */}
              <div className="text-right flex-shrink-0">
                <div className="text-[#44ff88] text-xs sm:text-sm font-bold">
                  {sale.price.toFixed(2)} MON
                </div>
                <div className="text-gray-500 text-[8px]">
                  {formatDate(sale.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Listed vs Unlisted Stats
 */
function ListedStatsSection({
  totalListed,
  totalUnlisted,
  isLoading,
}: {
  totalListed: number;
  totalUnlisted: number;
  isLoading: boolean;
}) {
  const total = totalListed + totalUnlisted;
  const listedPercent = total > 0 ? (totalListed / total) * 100 : 0;

  return (
    <div className="pixel-card p-4 mb-6 animate-slide-in-up animate-delay-3">
      <h3 className="text-[#00ffff] text-xs sm:text-sm tracking-wider mb-4">
        📋 MARKET ACTIVITY
      </h3>
      
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <div className="text-2xl animate-spin">⭐</div>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-[#0a0a15] rounded-lg p-3 text-center border border-[#44ff88]/30">
              <div className="text-[#44ff88] text-lg sm:text-xl font-bold">{totalListed}</div>
              <div className="text-gray-500 text-[8px] sm:text-[10px]">LISTED</div>
            </div>
            <div className="bg-[#0a0a15] rounded-lg p-3 text-center border border-[#9966ff]/30">
              <div className="text-[#9966ff] text-lg sm:text-xl font-bold">{totalUnlisted}</div>
              <div className="text-gray-500 text-[8px] sm:text-[10px]">UNLISTED</div>
            </div>
            <div className="bg-[#0a0a15] rounded-lg p-3 text-center border border-[#ffd700]/30">
              <div className="text-[#ffd700] text-lg sm:text-xl font-bold">{listedPercent.toFixed(1)}%</div>
              <div className="text-gray-500 text-[8px] sm:text-[10px]">ON MARKET</div>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="relative h-4 bg-[#0a0a15] rounded-full overflow-hidden border border-[#2a2a4e]">
            <div 
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#44ff88] to-[#00ffff] transition-all duration-500"
              style={{ width: `${listedPercent}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white text-[8px] font-bold mix-blend-difference">
                {totalListed} / {total} ON MARKET
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Marketplace Analytics Dashboard
 */
function MarketplaceAnalytics() {
  const [marketData, setMarketData] = useState<MarketplaceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarketData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/marketplace');
      const data = await response.json();
      
      if (data.success) {
        setMarketData(data.data);
      } else {
        setError(data.error || 'Failed to load market data');
      }
    } catch (err) {
      setError('Failed to connect to marketplace');
      console.error('Failed to fetch market data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarketData();
    // Refresh every 2 minutes
    const interval = setInterval(fetchMarketData, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchMarketData]);

  return (
    <div className="mb-8">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[#ffd700] text-sm sm:text-base tracking-wider">
          📈 MARKET ANALYTICS
        </h2>
        {marketData?.lastUpdated && !isLoading && (
          <span className="text-gray-500 text-[8px] sm:text-[10px]">
            Updated {new Date(marketData.lastUpdated).toLocaleTimeString()}
          </span>
        )}
      </div>
      
      {/* Error State */}
      {error && (
        <div className="pixel-card p-4 mb-6 text-center">
          <p className="text-[#ff4466] text-xs mb-2">{error}</p>
          <button 
            onClick={fetchMarketData}
            className="text-[#ffd700] text-xs underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}
      
      {/* Floor Price Chart */}
      <FloorPriceChart
        hourlyData={marketData?.floorChartHourly || []}
        dailyData={marketData?.floorChartDaily || []}
        isLoading={isLoading}
      />
      
      {/* Constellation Floors */}
      <ConstellationFloorGrid
        floors={marketData?.constellationFloors || []}
        isLoading={isLoading}
      />
      
      {/* Two Column Layout for Sales and Listed Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Highest Sales */}
        <HighestSalesSection
          sales={marketData?.topSales || []}
          isLoading={isLoading}
        />
        
        {/* Listed Stats */}
        <ListedStatsSection
          totalListed={marketData?.totalListed || 0}
          totalUnlisted={marketData?.totalUnlisted || 0}
          isLoading={isLoading}
        />
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
          STAR BEARERS
        </h1>
        <p className="text-xs sm:text-sm text-[#9966ff] tracking-wide animate-glow-pulse">
          The Order{"'"}s Cosmic Assembly
        </p>
      </div>

      {/* Stats Overview */}
      <StatsOverview 
        totalMembers={totalMembers}
        totalStarSkrumpeys={totalStarSkrumpeys}
        isLoading={isLoading}
      />

      {/* Marketplace Analytics Section */}
      <MarketplaceAnalytics />

      {/* Divider */}
      <div className="pixel-divider mb-6" />

      {/* Members Section Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[#ffd700] text-sm sm:text-base tracking-wider">
          👤 STAR BEARERS LEADERBOARD
        </h2>
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
          <li>• <span className="text-[#00ffff]">CONSTELLATION KEEPER</span> - 3+ Star Skrumpeys</li>
          <li>• <span className="text-[#9966ff]">STAR SEEKER</span> - 1+ Star Skrumpeys</li>
        </ul>
      </div>
    </>
  );
}
