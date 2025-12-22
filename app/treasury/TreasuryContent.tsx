'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getSkrumpeyImageUrl } from '@/lib/starSkrumpey';

// Treasury wallet address
const TREASURY_ADDRESS = '0xa209cfb0c8abdf5e3e3e7f4628214bdb597d55af';

interface NFTHolding {
  tokenId: string;
  name: string;
  collectionName: string;
  contractAddress: string;
  imageUrl?: string;
  quantity: number;
  isStarSkrumpey: boolean;
  constellation?: string;
  isVerified: boolean;
}

interface TreasuryData {
  address: string;
  monBalance: string;
  monBalanceFormatted: string;
  nftHoldings: NFTHolding[];
  nftCount: number;
  collectionCount: number;
  starSkrumpeyCount: number;
  estimatedValueMON: string;
  lastUpdated: string;
}

/**
 * Get variant color for constellation
 */
function getVariantColor(variant?: string): string {
  const colors: Record<string, string> = {
    aether: '#87CEEB',
    spectra: '#40E0D0',
    solveil: '#FFD93D',
    nebulu: '#9966ff',
    chroma: '#DDA0DD',
    rose: '#FFB6C1',
    monflare: '#BF5FFF',
    auracore: '#FFB347',
    parallel: '#00CED1',
    prime: '#FFD700',
  };
  return colors[variant || ''] || '#ffd700';
}

/**
 * Truncate address for display
 */
function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Animated star component for decoration
 */
function AnimatedStar({ delay = 0 }: { delay?: number }) {
  return (
    <div 
      className="absolute text-2xl animate-pixel-float opacity-60"
      style={{ 
        animationDelay: `${delay}s`,
        filter: 'drop-shadow(0 0 10px rgba(255, 215, 0, 0.5))'
      }}
    >
      ⭐
    </div>
  );
}

/**
 * NFT Card Component - displays a single NFT
 * Handles both Star Skrumpeys (with constellation) and other NFT collections
 */
function NFTCard({ nft }: { nft: NFTHolding }) {
  const [imageError, setImageError] = useState(false);
  // Use the image from BlockVision API, or fall back to Skrumpey URL for Star Skrumpeys
  // Validate tokenId is a valid number before using getSkrumpeyImageUrl
  const tokenIdNum = parseInt(nft.tokenId, 10);
  const validTokenId = !isNaN(tokenIdNum) && tokenIdNum > 0;
  const imageUrl = nft.imageUrl || (nft.isStarSkrumpey && validTokenId ? getSkrumpeyImageUrl(tokenIdNum) : null);
  const borderColor = nft.isStarSkrumpey ? getVariantColor(nft.constellation) : '#9966ff';
  
  return (
    <div 
      className="pixel-card p-3 text-center smooth-transition hover-lift cursor-pointer group"
      style={{
        boxShadow: `0 0 15px ${borderColor}20`,
      }}
    >
      {/* NFT Image */}
      <div 
        className="w-20 h-20 mx-auto mb-2 rounded-lg overflow-hidden border-2 relative"
        style={{ 
          borderColor: borderColor,
          boxShadow: `0 0 10px ${borderColor}40`
        }}
      >
        {!imageError && imageUrl ? (
          <img
            src={imageUrl}
            alt={nft.name || `NFT #${nft.tokenId}`}
            className="w-full h-full object-cover group-hover:scale-110 smooth-transition"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#9966ff]/30 to-[#ffd700]/30 text-3xl">
            {nft.isStarSkrumpey ? '🐸' : '🎨'}
          </div>
        )}
        {/* Star badge for Star Skrumpeys */}
        {nft.isStarSkrumpey && (
          <div className="absolute -top-1 -right-1 text-xs animate-pixel-pulse">⭐</div>
        )}
        {/* Verified badge for verified collections */}
        {!nft.isStarSkrumpey && nft.isVerified && (
          <div className="absolute -top-1 -right-1 text-xs">✓</div>
        )}
        {/* Quantity badge if > 1 */}
        {nft.quantity > 1 && (
          <div className="absolute -bottom-1 -right-1 text-[8px] bg-[#9966ff] px-1 rounded">
            x{nft.quantity}
          </div>
        )}
      </div>
      
      {/* Token ID or Name */}
      <p className="text-[#e8b923] text-xs font-bold mb-1 truncate">
        {nft.name || `#${nft.tokenId}`}
      </p>
      
      {/* Constellation for Star Skrumpeys */}
      {nft.isStarSkrumpey && nft.constellation && (
        <p 
          className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded inline-block"
          style={{ 
            color: getVariantColor(nft.constellation),
            backgroundColor: `${getVariantColor(nft.constellation)}15`,
            border: `1px solid ${getVariantColor(nft.constellation)}40`,
          }}
        >
          {nft.constellation}
        </p>
      )}
      
      {/* Collection name for other NFTs */}
      {!nft.isStarSkrumpey && (
        <p className="text-[9px] text-gray-500 truncate px-1">
          {nft.collectionName}
        </p>
      )}
    </div>
  );
}

/**
 * Treasury Value Chart Component
 * Shows treasury value over 1D/1W
 */
function TreasuryChart({ 
  currentValue, 
  isLoading 
}: { 
  currentValue: string;
  isLoading: boolean;
}) {
  const [timeRange, setTimeRange] = useState<'1D' | '1W'>('1D');
  
  // Generate mock data for chart (will be replaced with real historical data)
  // TODO: Replace with real historical treasury data from blockchain or database
  // Using seeded random for consistent rendering across rerenders
  const generateChartData = React.useMemo(() => {
    const baseValue = parseFloat(currentValue) || 0;
    const points = timeRange === '1D' ? 24 : 7;
    const variance = baseValue * 0.05 || 0.1; // 5% variance or minimum 0.1
    
    // Use deterministic values based on index for consistency
    return Array.from({ length: points }, (_, i) => {
      // Create a slight upward trend with deterministic variation
      const trend = (i / points) * variance * 0.5;
      const variation = Math.sin(i * 0.5) * variance * 0.3;
      return Math.max(0, baseValue - variance + trend + variation);
    });
  }, [currentValue, timeRange]);
  
  const data = generateChartData;
  const minValue = Math.min(...data) * 0.95;
  const maxValue = Math.max(...data) * 1.05;
  const range = maxValue - minValue || 1;
  
  // Chart dimensions
  const chartWidth = 400;
  const chartHeight = 150;
  const padding = { top: 15, right: 15, bottom: 30, left: 50 };
  
  // Generate SVG path
  const generatePath = () => {
    if (data.length < 2) return '';
    
    const effectiveWidth = chartWidth - padding.left - padding.right;
    const effectiveHeight = chartHeight - padding.top - padding.bottom;
    
    const points = data.map((value, index) => {
      const x = padding.left + (index / (data.length - 1)) * effectiveWidth;
      const y = padding.top + effectiveHeight - ((value - minValue) / range) * effectiveHeight;
      return { x, y };
    });
    
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    
    return path;
  };
  
  // Generate area path for gradient fill
  const generateAreaPath = () => {
    if (data.length < 2) return '';
    
    const effectiveWidth = chartWidth - padding.left - padding.right;
    const effectiveHeight = chartHeight - padding.top - padding.bottom;
    const bottomY = padding.top + effectiveHeight;
    
    const points = data.map((value, index) => {
      const x = padding.left + (index / (data.length - 1)) * effectiveWidth;
      const y = padding.top + effectiveHeight - ((value - minValue) / range) * effectiveHeight;
      return { x, y };
    });
    
    let path = `M ${points[0].x} ${bottomY}`;
    path += ` L ${points[0].x} ${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    
    path += ` L ${points[points.length - 1].x} ${bottomY}`;
    path += ' Z';
    
    return path;
  };

  return (
    <div className="pixel-card p-4 animate-slide-in-up animate-delay-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-[#d4a500] text-xs sm:text-sm tracking-wider mb-1">
            📈 TREASURY VALUE
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-white text-xl sm:text-2xl font-bold text-[#44ff88]">
              {isLoading ? '...' : `${parseFloat(currentValue).toFixed(2)} MON`}
            </span>
          </div>
        </div>
        
        {/* Time Range Toggle */}
        <div className="flex gap-1">
          {(['1D', '1W'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeRange(tf)}
              className={`px-3 py-1 text-[10px] sm:text-xs rounded border-2 smooth-transition ${
                timeRange === tf
                  ? 'bg-[#44ff88]/20 border-[#44ff88] text-[#44ff88]'
                  : 'bg-transparent border-[#2a2a4e] text-gray-500 hover:border-[#44ff88]/50'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      
      {/* Chart */}
      <div className="relative w-full" style={{ maxWidth: '100%', aspectRatio: '2.5 / 1' }}>
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-2xl animate-spin">💎</div>
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
            <g fill="#666" fontSize="9" fontFamily="monospace">
              <text x={padding.left - 5} y={padding.top + 4} textAnchor="end">
                {maxValue.toFixed(1)}
              </text>
              <text x={padding.left - 5} y={chartHeight - padding.bottom + 4} textAnchor="end">
                {minValue.toFixed(1)}
              </text>
            </g>
            
            {/* Gradient definition */}
            <defs>
              <linearGradient id="treasuryGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#44ff88" stopOpacity="0.4"/>
                <stop offset="100%" stopColor="#44ff88" stopOpacity="0"/>
              </linearGradient>
            </defs>
            
            {/* Area fill */}
            <path
              d={generateAreaPath()}
              fill="url(#treasuryGradient)"
            />
            
            {/* Line */}
            <path
              d={generatePath()}
              fill="none"
              stroke="#44ff88"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0 0 4px #44ff88)' }}
            />
            
            {/* Current value dot */}
            {data.length > 0 && (
              <circle
                cx={chartWidth - padding.right}
                cy={padding.top + (chartHeight - padding.top - padding.bottom) - 
                   ((data[data.length - 1] - minValue) / range) * 
                   (chartHeight - padding.top - padding.bottom)}
                r="4"
                fill="#44ff88"
                style={{ filter: 'drop-shadow(0 0 6px #44ff88)' }}
              />
            )}
          </svg>
        )}
      </div>
      
      {/* Chart Legend */}
      <div className="flex justify-center gap-4 mt-2 text-[10px] text-gray-500">
        <span>
          {timeRange === '1D' ? 'LAST 24 HOURS' : 'LAST 7 DAYS'}
        </span>
      </div>
    </div>
  );
}

/**
 * Transaction Item Component
 */
function TransactionItem({ 
  type, 
  amount, 
  description, 
  date 
}: { 
  type: 'in' | 'out';
  amount: string;
  description: string;
  date: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#2a2a4e] last:border-0 smooth-transition hover:bg-[#1a1a2e]/50 hover:px-2 group">
      <div className="flex items-center gap-3">
        <div 
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${
            type === 'in' 
              ? 'bg-[#44ff88]/20 text-[#44ff88]' 
              : 'bg-[#ff4466]/20 text-[#ff4466]'
          } group-hover:scale-110 smooth-transition`}
        >
          {type === 'in' ? '↓' : '↑'}
        </div>
        <div>
          <p className="text-gray-300 text-xs">{description}</p>
          <p className="text-gray-600 text-[10px]">{date}</p>
        </div>
      </div>
      <p className={`text-sm font-bold ${type === 'in' ? 'text-[#44ff88]' : 'text-[#ff4466]'}`}>
        {type === 'in' ? '+' : '-'}{amount}
      </p>
    </div>
  );
}

/**
 * Main Treasury Content Component
 */
export default function TreasuryContent() {
  const [treasuryData, setTreasuryData] = useState<TreasuryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch treasury data
  const fetchTreasuryData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/treasury');
      const data = await response.json();
      
      if (data.success) {
        setTreasuryData(data.data);
      } else {
        setError(data.error || 'Failed to load treasury data');
      }
    } catch (err) {
      setError('Failed to connect to server');
      console.error('Failed to fetch treasury:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchTreasuryData();
  }, [fetchTreasuryData]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const interval = setInterval(fetchTreasuryData, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchTreasuryData]);

  // TODO: Replace with real transaction data from blockchain indexer or Monad explorer API
  // These are placeholder transactions for UI demonstration
  const recentTransactions = [
    { type: 'in' as const, amount: '500 MON', description: 'Marketplace Fees', date: '2 days ago' },
    { type: 'out' as const, amount: '200 MON', description: 'Dev Payment', date: '5 days ago' },
    { type: 'in' as const, amount: '337 MON', description: 'Royalties', date: '1 week ago' },
    { type: 'in' as const, amount: '150 MON', description: 'Community Donation', date: '2 weeks ago' },
  ];

  return (
    <>
      {/* Page Header */}
      <div className="text-center mb-8 animate-slide-in-up px-4 relative">
        {/* Floating stars decoration */}
        <div className="absolute left-4 top-0 hidden md:block">
          <AnimatedStar delay={0} />
        </div>
        <div className="absolute right-4 top-2 hidden md:block">
          <AnimatedStar delay={0.5} />
        </div>
        
        <div className="text-4xl mb-4 animate-pixel-float">💎</div>
        <h1 className="text-base sm:text-lg md:text-xl text-[#e8b923] tracking-wider mb-2">
          THE WAR CHEST
        </h1>
        <p className="text-xs sm:text-sm text-[#9966ff] tracking-wide animate-glow-pulse">
          stack or get stacked on
        </p>
      </div>

      {/* Error State */}
      {error && (
        <div className="pixel-card p-6 text-center mb-6 animate-slide-in-up">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-[#ff4466] text-sm mb-4">{error}</p>
          <button 
            onClick={fetchTreasuryData}
            className="pixel-btn pixel-btn-gold text-xs smooth-transition hover-lift"
          >
            TRY AGAIN
          </button>
        </div>
      )}

      {/* Main Balance Card */}
      <div className="pixel-card p-6 text-center mb-6 animate-slide-in-up relative overflow-hidden">
        {/* Background glow effect */}
        <div 
          className="absolute inset-0 opacity-20"
          style={{
            background: 'radial-gradient(circle at center, #ffd700 0%, transparent 70%)',
          }}
        />
        
        <div className="relative z-10">
          <p className="text-gray-500 text-xs mb-2 tracking-wider">TOTAL HOLDINGS</p>
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-4xl animate-pixel-pulse">💎</span>
            <p className="text-[#e8b923] text-3xl sm:text-4xl md:text-5xl font-bold animate-glow-pulse">
              {isLoading ? '...' : `${treasuryData?.monBalanceFormatted || '0'}`}
            </p>
            <span className="text-[#e8b923] text-xl sm:text-2xl">MON</span>
          </div>
          
          {/* Treasury address */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <p className="text-gray-500 text-[10px] font-mono">
              {truncateAddress(TREASURY_ADDRESS)}
            </p>
            <a 
              href={`https://monadscan.com/address/${TREASURY_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#9966ff] text-[10px] hover:text-[#e8b923] smooth-transition"
            >
              ↗
            </a>
          </div>
          
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
            <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#e8b923]/30 smooth-transition hover-lift">
              <p className="text-[#e8b923] text-lg sm:text-xl font-bold">
                {isLoading ? '...' : treasuryData?.monBalanceFormatted || '0'}
              </p>
              <p className="text-gray-500 text-[10px]">MON BALANCE</p>
            </div>
            <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#9966ff]/30 smooth-transition hover-lift">
              <p className="text-[#9966ff] text-lg sm:text-xl font-bold">
                {isLoading ? '...' : treasuryData?.nftCount || 0}
              </p>
              <p className="text-gray-500 text-[10px]">NFTs HELD</p>
            </div>
            <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#44ff88]/30 smooth-transition hover-lift">
              <p className="text-[#44ff88] text-lg sm:text-xl font-bold">
                {isLoading ? '...' : treasuryData?.collectionCount || 0}
              </p>
              <p className="text-gray-500 text-[10px]">COLLECTIONS</p>
            </div>
          </div>
        </div>
      </div>

      {/* Treasury Value Chart */}
      <TreasuryChart 
        currentValue={treasuryData?.monBalanceFormatted || '0'} 
        isLoading={isLoading}
      />

      {/* NFT Holdings Section */}
      {treasuryData && treasuryData.nftHoldings.length > 0 && (
        <div className="pixel-card p-6 mb-6 animate-slide-in-up animate-delay-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <h3 className="text-[#9966ff] text-xs sm:text-sm tracking-wider">
              🎨 NFT HOLDINGS ({treasuryData.nftCount})
            </h3>
            {treasuryData.starSkrumpeyCount > 0 && (
              <span className="text-[10px] text-[#e8b923]">
                ⭐ {treasuryData.starSkrumpeyCount} Star Skrumpey{treasuryData.starSkrumpeyCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {treasuryData.nftHoldings.map((nft, index) => (
              <NFTCard key={`${nft.contractAddress}-${nft.tokenId}-${index}`} nft={nft} />
            ))}
          </div>
        </div>
      )}

      {/* No NFTs message */}
      {treasuryData && treasuryData.nftHoldings.length === 0 && !isLoading && (
        <div className="pixel-card p-6 text-center mb-6 animate-slide-in-up animate-delay-3">
          <div className="text-4xl mb-3 animate-pixel-float">🎨</div>
          <p className="text-gray-400 text-sm">No NFTs in treasury yet</p>
          <p className="text-gray-600 text-xs mt-1">Treasury is accumulating MON</p>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="pixel-card p-6 mb-6 animate-slide-in-up animate-delay-4">
        <h3 className="text-[#9966ff] text-xs sm:text-sm tracking-wider mb-4">
          📜 RECENT MOVES
        </h3>
        
        <div className="space-y-1">
          {recentTransactions.map((tx, i) => (
            <TransactionItem key={i} {...tx} />
          ))}
        </div>
        
        <a 
          href={`https://monadscan.com/address/${TREASURY_ADDRESS}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full mt-4 pixel-btn text-xs text-center smooth-transition hover-lift"
        >
          FULL HISTORY ON EXPLORER ↗
        </a>
      </div>

      {/* Treasury Info */}
      <div className="pixel-card p-4 bg-[#0a0a15] animate-slide-in-up animate-delay-5">
        <p className="text-[#d4a500] text-xs tracking-wide mb-2">⭐ HOW WE STACK</p>
        <ul className="text-gray-400 text-[10px] space-y-1">
          <li>• <span className="text-[#44ff88]">2.5%</span> cut from Exchange trades</li>
          <li>• Donations from the real ones</li>
        </ul>
        
        <div className="mt-4 pt-4 border-t border-[#2a2a4e]">
          <p className="text-[#9966ff] text-xs tracking-wide mb-2">🏛️ THE RULES</p>
          <p className="text-gray-500 text-[10px]">
            Every spend needs DAO approval. Star holders vote on how we deploy capital.
            No moves without consensus.
          </p>
        </div>
      </div>

      {/* Last Updated */}
      {treasuryData?.lastUpdated && (
        <div className="text-center mt-6">
          <p className="text-gray-600 text-[10px]">
            Last updated: {new Date(treasuryData.lastUpdated).toLocaleString()}
          </p>
        </div>
      )}
    </>
  );
}
