'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSkrumpeyImageUrl, STAR_TRAIT_VARIANTS, StarTraitVariant } from '@/lib/starSkrumpey';
import { getUserStarBalance, formatStarAmount } from '@/lib/starPoints';

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
}

/**
 * Get variant color for styling
 */
function getVariantColor(variant?: string): string {
  const colors: Record<string, string> = {
    aether: '#00ffff',
    spectra: '#ff00ff',
    solveil: '#ffd700',
    nebulu: '#9966ff',
    chroma: '#ff6ec7',
    rose: '#ff69b4',
    monflare: '#ff4500',
    auracore: '#44ff88',
    parallel: '#00bfff',
    prime: '#ffd700',
  };
  return colors[variant || ''] || '#ffd700';
}

/**
 * Get level color based on level number
 */
function getLevelColor(level: number): string {
  if (level >= 10) return '#ffd700'; // Gold
  if (level >= 7) return '#ff00ff'; // Magenta
  if (level >= 5) return '#00ffff'; // Cyan
  if (level >= 3) return '#44ff88'; // Green
  return '#9966ff'; // Purple
}

/**
 * Get level title based on level number
 */
function getLevelTitle(level: number): string {
  if (level >= 10) return 'COSMIC EMPEROR';
  if (level >= 8) return 'STAR LORD';
  if (level >= 6) return 'CONSTELLATION MASTER';
  if (level >= 4) return 'NEBULA GUARDIAN';
  if (level >= 2) return 'STELLAR INITIATE';
  return 'STAR BEARER';
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
 */
function LevelBadge({ level }: { level: number }) {
  const color = getLevelColor(level);
  
  return (
    <div 
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border-2 animate-glow-pulse"
      style={{ 
        backgroundColor: `${color}20`,
        borderColor: `${color}80`,
        color,
        boxShadow: `0 0 10px ${color}40`,
      }}
    >
      <span className="text-[10px]">LVL</span>
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
          className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider border"
          style={{ 
            color: getVariantColor(variant),
            borderColor: `${getVariantColor(variant)}60`,
            backgroundColor: `${getVariantColor(variant)}15`,
          }}
        >
          {variant}
        </span>
      ))}
      {variants.length > 3 && (
        <span className="text-[9px] px-1.5 py-0.5 rounded text-gray-500 border border-gray-600">
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
  const levelTitle = getLevelTitle(member.level);
  
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
      className={`pixel-card p-4 cursor-pointer smooth-transition hover-lift animate-slide-in-up ${
        isTop3 ? 'border-2' : ''
      }`}
      style={{
        animationDelay: `${Math.min(rank * 0.05, 0.5)}s`,
        borderColor: isTop3 ? rankColors[rank] : undefined,
        boxShadow: isTop3 ? `0 0 20px ${rankColors[rank]}30` : undefined,
      }}
    >
      <div className="flex items-center gap-4">
        {/* Rank Badge */}
        <div 
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
          style={{
            backgroundColor: isTop3 ? `${rankColors[rank]}30` : '#1a1a2e',
            color: isTop3 ? rankColors[rank] : '#666',
            border: `2px solid ${isTop3 ? rankColors[rank] : '#2a2a4e'}`,
          }}
        >
          {rank === 1 && '👑'}
          {rank === 2 && '🥈'}
          {rank === 3 && '🥉'}
          {rank > 3 && `#${rank}`}
        </div>
        
        {/* Avatar */}
        <MemberAvatar 
          tokenId={primaryTokenId} 
          variant={primaryVariant}
          size="md"
        />
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[#ffd700] text-sm font-bold truncate">
              {member.displayName || truncateAddress(member.address)}
            </p>
            <LevelBadge level={member.level} />
          </div>
          
          <p className="text-gray-500 text-[10px] font-mono mb-1">
            {truncateAddress(member.address)}
          </p>
          
          <p 
            className="text-[10px] uppercase tracking-wider"
            style={{ color: getLevelColor(member.level) }}
          >
            {levelTitle}
          </p>
        </div>
        
        {/* Holdings */}
        <div className="text-right flex-shrink-0">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[#ffd700] text-lg font-bold">{member.count}</span>
            <span className="text-xl">⭐</span>
          </div>
          <p className="text-gray-500 text-[10px]">
            STAR {member.count === 1 ? 'SKRUMPEY' : 'SKRUMPEYS'}
          </p>
        </div>
      </div>
      
      {/* Variants row */}
      {member.starVariants.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[#2a2a4e]">
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
  const levelTitle = getLevelTitle(member.level);
  
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
          
          <div className="flex items-center justify-center gap-3">
            <LevelBadge level={member.level} />
            <span 
              className="text-xs uppercase tracking-wider"
              style={{ color: getLevelColor(member.level) }}
            >
              {levelTitle}
            </span>
          </div>
        </div>
        
        {/* Bio */}
        {member.bio && (
          <div className="mb-6 p-3 bg-[#0a0a15] rounded-lg border border-[#2a2a4e]">
            <p className="text-gray-400 text-xs italic leading-relaxed">&quot;{member.bio}&quot;</p>
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
                    color: getVariantColor(variant),
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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div className="pixel-card p-4 text-center animate-slide-in-up animate-delay-1">
        <p className="text-[#ffd700] text-2xl font-bold animate-glow-pulse">
          {isLoading ? '...' : totalMembers}
        </p>
        <p className="text-gray-500 text-[10px] tracking-wider">TOTAL HOLDERS</p>
      </div>
      <div className="pixel-card p-4 text-center animate-slide-in-up animate-delay-2">
        <p className="text-[#9966ff] text-2xl font-bold animate-glow-pulse">
          {isLoading ? '...' : totalStarSkrumpeys}
        </p>
        <p className="text-gray-500 text-[10px] tracking-wider">STAR SKRUMPEYS</p>
      </div>
      <div className="pixel-card p-4 text-center animate-slide-in-up animate-delay-3">
        <p className="text-[#44ff88] text-2xl font-bold">343</p>
        <p className="text-gray-500 text-[10px] tracking-wider">MAX SUPPLY</p>
      </div>
      <div className="pixel-card p-4 text-center animate-slide-in-up animate-delay-4">
        <p className="text-[#00ffff] text-2xl font-bold">
          {isLoading ? '...' : totalMembers > 0 ? (totalStarSkrumpeys / totalMembers).toFixed(1) : '0'}
        </p>
        <p className="text-gray-500 text-[10px] tracking-wider">AVG PER HOLDER</p>
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
    <div className="flex flex-col sm:flex-row gap-4 mb-6 animate-slide-in-up animate-delay-5">
      {/* Search Input */}
      <div className="flex-1">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by address or name..."
          className="w-full bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-4 py-2 text-white text-sm focus:border-[#ffd700] focus:outline-none smooth-transition"
        />
      </div>
      
      {/* Sort Dropdown */}
      <div className="flex items-center gap-2">
        <span className="text-gray-500 text-xs">SORT BY:</span>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as 'holdings' | 'level' | 'address')}
          className="bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-3 py-2 text-white text-xs focus:border-[#ffd700] focus:outline-none cursor-pointer smooth-transition"
        >
          <option value="holdings">Holdings (High to Low)</option>
          <option value="level">Level (High to Low)</option>
          <option value="address">Address (A-Z)</option>
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
      <div className="text-center mb-8 animate-slide-in-up">
        <h1 className="text-lg md:text-xl text-[#ffd700] pixel-glow-gold tracking-wider mb-2">
          STAR BEARERS
        </h1>
        <p className="text-[#9966ff] text-sm tracking-wide animate-glow-pulse">
          The Order&apos;s Cosmic Assembly
        </p>
      </div>

      {/* Stats Overview */}
      <StatsOverview 
        totalMembers={totalMembers}
        totalStarSkrumpeys={totalStarSkrumpeys}
        isLoading={isLoading}
      />

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
        <p className="text-[#9966ff] text-xs tracking-wide mb-2">LEVEL SYSTEM</p>
        <ul className="text-gray-400 text-[10px] space-y-1">
          <li>• Level scales with Star Skrumpey holdings and STAR points</li>
          <li>• Higher levels unlock exclusive titles and bragging rights</li>
          <li>• Stake your NFTs to earn STAR and increase your level</li>
          <li>• Formula: Level = 1 + √(Holdings × 10 + √STAR)</li>
        </ul>
      </div>
    </>
  );
}
