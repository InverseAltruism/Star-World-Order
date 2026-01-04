'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { STAR_SKRUMPEY_IDS, getSkrumpeyImageUrl, STAR_TRAIT_VARIANTS, StarTraitVariant } from '@/lib/starSkrumpey';
import { STAR_CONSTELLATION_MAP } from '@/data/starConstellationData';

/**
 * Get variant color for styling
 */
function getVariantColor(variant?: string): string {
  const colors: Record<string, string> = {
    // Common traits
    aether: '#87CEEB',
    spectra: '#40E0D0',
    solveil: '#FFD93D',
    nebulu: '#9966ff',
    chroma: '#DDA0DD',
    // Uncommon traits
    rose: '#FFB6C1',
    monflare: '#BF5FFF',
    // Rare traits
    auracore: '#FFB347',
    parallel: '#00CED1',
    // Legendary
    prime: '#FFD700',
  };
  return colors[variant?.toLowerCase() || ''] || '#9966ff';
}

/**
 * Get rarity label for constellation
 */
function getRarityLabel(variant?: string): { label: string; color: string } {
  const rarities: Record<string, { label: string; color: string }> = {
    aether: { label: 'Common', color: '#87CEEB' },
    spectra: { label: 'Common', color: '#40E0D0' },
    solveil: { label: 'Common', color: '#FFD93D' },
    nebulu: { label: 'Common', color: '#9966ff' },
    chroma: { label: 'Common', color: '#DDA0DD' },
    rose: { label: 'Uncommon', color: '#FFB6C1' },
    monflare: { label: 'Uncommon', color: '#BF5FFF' },
    auracore: { label: 'Rare', color: '#FFB347' },
    parallel: { label: 'Rare', color: '#00CED1' },
    prime: { label: 'Legendary', color: '#FFD700' },
  };
  return rarities[variant?.toLowerCase() || ''] || { label: 'Unknown', color: '#9966ff' };
}

/**
 * Star Skrumpey data interface (from database)
 */
interface StarSkrumpeyData {
  tokenId: number;
  name: string;
  constellation: string;
  imageUrl: string;
  aura?: string;
  background?: string;
  eyes?: string;
  form?: string;
  mood?: string;
}

/**
 * Helper function to extract attribute value from IPFS metadata
 */
function getAttributeValue(attributes: unknown, traitType: string): string | undefined {
  if (!attributes || !Array.isArray(attributes)) return undefined;
  const attr = attributes.find(
    (a: { trait_type?: string; value?: string }) => 
      a.trait_type?.toLowerCase() === traitType.toLowerCase()
  );
  return attr?.value;
}

/**
 * Detail Modal Component - Shows full NFT details
 */
function DetailModal({
  nft,
  onClose,
}: {
  nft: StarSkrumpeyData;
  onClose: () => void;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [useGif, setUseGif] = useState(false);
  const imageUrl = nft.imageUrl || getSkrumpeyImageUrl(nft.tokenId, useGif);
  const rarity = getRarityLabel(nft.constellation);

  const handleImageError = () => {
    if (!useGif) {
      setImageLoaded(false);
      setUseGif(true);
    }
  };

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // All traits
  const traits = [
    { name: 'Constellation', value: nft.constellation || 'Unknown' },
    { name: 'Aura', value: nft.aura || 'Unknown' },
    { name: 'Background', value: nft.background || 'Unknown' },
    { name: 'Eyes', value: nft.eyes || 'Unknown' },
    { name: 'Form', value: nft.form || 'Unknown' },
    { name: 'Mood', value: nft.mood || 'Unknown' },
  ];

  return (
    <div 
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-2 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="pixel-card p-4 sm:p-6 max-w-lg w-full animate-slide-in-up overflow-y-auto max-h-[90vh] sm:max-h-[90vh] relative"
        onClick={e => e.stopPropagation()}
      >
        {/* Fixed Close Button - Always visible */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 sm:top-3 sm:right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white rounded-lg hover:bg-[#2a2a4e] bg-[#1a1a2e]/80 z-10 text-lg sm:text-xl"
        >
          ×
        </button>
        
        {/* Header */}
        <div className="flex items-start justify-between mb-3 sm:mb-4 pr-8">
          <div className="flex-1 min-w-0">
            <h3 className="text-[#ffd700] text-sm sm:text-lg tracking-wider truncate">
              {nft.name || `Star Skrumpey #${nft.tokenId}`}
            </h3>
            <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-1">
              <span 
                className="px-2 py-0.5 rounded text-[8px] sm:text-[10px] font-bold uppercase"
                style={{ 
                  backgroundColor: `${getVariantColor(nft.constellation)}20`,
                  color: getVariantColor(nft.constellation),
                }}
              >
                {nft.constellation || 'Unknown'}
              </span>
              <span 
                className="px-2 py-0.5 rounded text-[8px] sm:text-[10px] font-bold"
                style={{ 
                  backgroundColor: `${rarity.color}20`,
                  color: rarity.color,
                }}
              >
                {rarity.label}
              </span>
            </div>
          </div>
        </div>

        {/* Image */}
        <div className="relative aspect-square rounded-lg overflow-hidden mb-3 sm:mb-4 bg-[#0a0a15]">
          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a15]">
              <div className="text-3xl sm:text-4xl animate-spin">⭐</div>
            </div>
          )}
          <Image
            src={imageUrl}
            alt={nft.name || `Star Skrumpey #${nft.tokenId}`}
            fill
            className={`object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImageLoaded(true)}
            onError={handleImageError}
            unoptimized
          />
          
          {/* Glow effect based on constellation */}
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              boxShadow: `inset 0 0 40px ${getVariantColor(nft.constellation)}30`,
            }}
          />
        </div>

        {/* Traits Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2 mb-3 sm:mb-4">
          {traits.map((trait) => (
            <div 
              key={trait.name}
              className="bg-[#0a0a15] rounded-lg p-2 sm:p-3 border border-[#2a2a4e]"
            >
              <p className="text-gray-500 text-[8px] sm:text-[10px] uppercase mb-0.5 sm:mb-1">{trait.name}</p>
              <p 
                className="text-xs sm:text-sm font-bold capitalize truncate"
                style={{ 
                  color: trait.name === 'Constellation' ? getVariantColor(trait.value) : '#fff' 
                }}
              >
                {trait.value}
              </p>
            </div>
          ))}
        </div>

        {/* Token ID and links */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-[9px] sm:text-[10px] text-gray-500 border-t border-[#2a2a4e] pt-3 sm:pt-4 gap-2">
          <span>Token ID: #{nft.tokenId}</span>
          <div className="flex items-center gap-3">
            <a
              href={`https://magiceden.io/item-details/monad/0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0/${nft.tokenId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#ff6ec7] hover:text-[#ff99d0]"
            >
              View on ME ↗
            </a>
            <a
              href={`https://monadscan.com/token/0xb0dad798c80e40dd6b8e8545074c6a5b7b97d2c0?a=${nft.tokenId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00ffff] hover:text-[#44ffff]"
            >
              Explorer ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * NFT Card Component
 */
function NFTCard({
  nft,
  onClick,
}: {
  nft: StarSkrumpeyData;
  onClick: () => void;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [useGif, setUseGif] = useState(false);
  const imageUrl = nft.imageUrl || getSkrumpeyImageUrl(nft.tokenId, useGif);

  const handleImageError = () => {
    if (!useGif) {
      setImageLoaded(false);
      setUseGif(true);
    }
  };

  return (
    <div
      onClick={onClick}
      className="pixel-card p-2 cursor-pointer hover-lift smooth-transition group"
      style={{
        borderColor: `${getVariantColor(nft.constellation)}40`,
      }}
    >
      {/* Image container */}
      <div className="relative aspect-square rounded-lg overflow-hidden bg-[#0a0a15] mb-2">
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-2xl animate-spin">⭐</div>
          </div>
        )}
        <Image
          src={imageUrl}
          alt={nft.name || `Star Skrumpey #${nft.tokenId}`}
          fill
          className={`object-cover transition-all duration-300 group-hover:scale-110 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setImageLoaded(true)}
          onError={handleImageError}
          unoptimized
        />
        
        {/* Hover glow */}
        <div 
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{
            boxShadow: `inset 0 0 30px ${getVariantColor(nft.constellation)}50`,
          }}
        />
      </div>

      {/* Info */}
      <div className="text-center">
        <p className="text-gray-300 text-[10px] truncate">#{nft.tokenId}</p>
        <p 
          className="text-[10px] font-bold capitalize"
          style={{ color: getVariantColor(nft.constellation) }}
        >
          {nft.constellation || 'Unknown'}
        </p>
      </div>
    </div>
  );
}

/**
 * Gallery Content Component
 */
export default function GalleryContent() {
  const [allNFTs, setAllNFTs] = useState<StarSkrumpeyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNFT, setSelectedNFT] = useState<StarSkrumpeyData | null>(null);
  
  // Filters
  const [selectedConstellation, setSelectedConstellation] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'id' | 'constellation'>('id');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 48;

  // Fetch all Star Skrumpey metadata
  const fetchMetadata = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch all metadata in batches concurrently
      const batchSize = 50; // API limit
      const batches: number[][] = [];
      
      for (let i = 0; i < STAR_SKRUMPEY_IDS.length; i += batchSize) {
        batches.push(STAR_SKRUMPEY_IDS.slice(i, i + batchSize));
      }
      
      // Fetch all batches concurrently
      const results = await Promise.allSettled(
        batches.map(batchIds =>
          fetch(`/api/metadata?tokenIds=${batchIds.join(',')}`).then(res => res.json())
        )
      );
      
      const allData: StarSkrumpeyData[] = [];
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success && result.value.metadata) {
          // The API returns metadata as an object keyed by tokenId, not an array
          const metadataObj = result.value.metadata as Record<string, Record<string, unknown>>;
          const parsed = Object.values(metadataObj).map((m) => ({
            tokenId: m.tokenId as number,
            name: m.name as string || `Star Skrumpey #${m.tokenId}`,
            constellation: m.constellation as string || STAR_CONSTELLATION_MAP[m.tokenId as number] || 'Unknown',
            imageUrl: m.image as string || getSkrumpeyImageUrl(m.tokenId as number, false),
            aura: getAttributeValue(m.attributes, 'aura'),
            background: getAttributeValue(m.attributes, 'background'),
            eyes: getAttributeValue(m.attributes, 'eyes'),
            form: getAttributeValue(m.attributes, 'form'),
            mood: getAttributeValue(m.attributes, 'mood'),
          }));
          allData.push(...parsed);
        }
      }
      
      // If API fails or returns empty, use local data
      if (allData.length === 0) {
        const localData = STAR_SKRUMPEY_IDS.map(id => ({
          tokenId: id,
          name: `Star Skrumpey #${id}`,
          constellation: STAR_CONSTELLATION_MAP[id] || 'Unknown',
          imageUrl: getSkrumpeyImageUrl(id, false),
        }));
        setAllNFTs(localData);
      } else {
        setAllNFTs(allData);
      }
    } catch (error) {
      console.error('Failed to fetch metadata:', error);
      // Fallback to local constellation map
      const localData = STAR_SKRUMPEY_IDS.map(id => ({
        tokenId: id,
        name: `Star Skrumpey #${id}`,
        constellation: STAR_CONSTELLATION_MAP[id] || 'Unknown',
        imageUrl: getSkrumpeyImageUrl(id, false),
      }));
      setAllNFTs(localData);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  // Filtered and sorted NFTs
  const filteredNFTs = useMemo(() => {
    let result = [...allNFTs];
    
    // Filter by constellation
    if (selectedConstellation !== 'all') {
      result = result.filter(nft => 
        nft.constellation?.toLowerCase() === selectedConstellation.toLowerCase()
      );
    }
    
    // Filter by search query (token ID)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(nft => 
        nft.tokenId.toString().includes(query) ||
        nft.name?.toLowerCase().includes(query) ||
        nft.constellation?.toLowerCase().includes(query)
      );
    }
    
    // Sort
    if (sortBy === 'id') {
      result.sort((a, b) => a.tokenId - b.tokenId);
    } else if (sortBy === 'constellation') {
      result.sort((a, b) => (a.constellation || '').localeCompare(b.constellation || ''));
    }
    
    return result;
  }, [allNFTs, selectedConstellation, searchQuery, sortBy]);

  // Paginated NFTs
  const paginatedNFTs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredNFTs.slice(start, start + itemsPerPage);
  }, [filteredNFTs, currentPage]);

  const totalPages = Math.ceil(filteredNFTs.length / itemsPerPage);

  // Constellation stats
  const constellationStats = useMemo(() => {
    const stats: Record<string, number> = {};
    allNFTs.forEach(nft => {
      const c = nft.constellation || 'Unknown';
      stats[c] = (stats[c] || 0) + 1;
    });
    return stats;
  }, [allNFTs]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedConstellation, searchQuery]);

  if (isLoading) {
    return (
      <div className="text-center py-20">
        <div className="text-6xl mb-6 animate-spin">⭐</div>
        <h2 className="text-[#ffd700] text-xl tracking-wider animate-pixel-pulse">
          LOADING GALLERY...
        </h2>
        <p className="text-gray-500 text-xs mt-2">
          Fetching {STAR_SKRUMPEY_IDS.length} Star Skrumpeys
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8 animate-slide-in-up">
        <div className="text-5xl mb-4">⭐</div>
        <h1 className="text-[#ffd700] text-2xl tracking-wider mb-2">
          STAR SKRUMPEY GALLERY
        </h1>
        <p className="text-gray-400 text-sm">
          Explore all {STAR_SKRUMPEY_IDS.length} Star Skrumpeys and their unique traits
        </p>
      </div>

      {/* Stats Bar */}
      <div className="pixel-card p-3 sm:p-4 mb-4 sm:mb-6 animate-slide-in-up animate-delay-1">
        <div className="flex flex-wrap justify-center gap-1.5 sm:gap-4">
          {STAR_TRAIT_VARIANTS.map((variant) => {
            const count = constellationStats[variant] || 0;
            const isSelected = selectedConstellation === variant;
            return (
              <button
                key={variant}
                onClick={() => setSelectedConstellation(isSelected ? 'all' : variant)}
                className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg transition-all ${
                  isSelected 
                    ? 'scale-105 sm:scale-110' 
                    : 'hover:scale-105 opacity-70 hover:opacity-100'
                }`}
                style={{ 
                  backgroundColor: isSelected ? `${getVariantColor(variant)}30` : 'transparent',
                  borderWidth: 2,
                  borderColor: isSelected ? getVariantColor(variant) : 'transparent',
                }}
              >
                <span 
                  className="text-[9px] sm:text-xs font-bold capitalize"
                  style={{ color: getVariantColor(variant) }}
                >
                  {variant}
                </span>
                <span className="text-gray-500 text-[8px] sm:text-[10px] hidden xs:inline">
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="pixel-card p-3 sm:p-4 mb-4 sm:mb-6 animate-slide-in-up animate-delay-2">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
          {/* Search */}
          <div className="flex-1 min-w-0 sm:min-w-[200px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID or constellation..."
              className="w-full bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-3 py-2 text-xs text-white focus:border-[#ffd700] focus:outline-none smooth-transition"
            />
          </div>

          {/* Sort and Clear - Row on mobile */}
          <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-xs">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'id' | 'constellation')}
                className="bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-2 sm:px-3 py-2 text-xs text-white cursor-pointer"
              >
                <option value="id">Token ID</option>
                <option value="constellation">Constellation</option>
              </select>
            </div>

            {/* Clear filters */}
            {(selectedConstellation !== 'all' || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedConstellation('all');
                  setSearchQuery('');
                }}
                className="text-[#ff4466] text-xs hover:text-[#ff6688] whitespace-nowrap"
              >
                ✕ Clear
              </button>
            )}

            {/* Results count */}
            <span className="text-gray-500 text-xs hidden sm:inline">
              {filteredNFTs.length} results
            </span>
          </div>
          
          {/* Results count - mobile only */}
          <span className="text-gray-500 text-xs text-center sm:hidden">
            {filteredNFTs.length} results found
          </span>
        </div>
      </div>

      {/* NFT Grid - More responsive columns */}
      <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-3 mb-6 animate-slide-in-up animate-delay-3 px-1 sm:px-0">
        {paginatedNFTs.map((nft, index) => (
          <div 
            key={nft.tokenId}
            className="animate-slide-in-up"
            style={{ animationDelay: `${Math.min(index * 0.02, 0.5)}s` }}
          >
            <NFTCard
              nft={nft}
              onClick={() => setSelectedNFT(nft)}
            />
          </div>
        ))}
      </div>

      {/* No results */}
      {filteredNFTs.length === 0 && (
        <div className="pixel-card p-8 text-center">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-gray-400 text-sm">No Star Skrumpeys found</p>
          <p className="text-gray-500 text-xs mt-2">Try adjusting your filters</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2 mb-8 px-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="pixel-btn text-[10px] sm:text-xs !px-2 sm:!px-3 !py-1 disabled:opacity-50"
          >
            ←
          </button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-[10px] sm:text-xs font-bold transition-all ${
                    currentPage === pageNum
                      ? 'bg-[#ffd700]/20 text-[#ffd700] border-2 border-[#ffd700]'
                      : 'bg-[#1a1a2e] text-gray-400 border-2 border-[#2a2a4e] hover:border-[#ffd700]/50'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="pixel-btn text-[10px] sm:text-xs !px-2 sm:!px-3 !py-1 disabled:opacity-50"
          >
            →
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {selectedNFT && (
        <DetailModal
          nft={selectedNFT}
          onClose={() => setSelectedNFT(null)}
        />
      )}
    </div>
  );
}
