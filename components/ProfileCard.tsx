'use client';

import { useDAOAccess } from '@/lib/hooks/useDAOAccess';

/**
 * Profile Card Component
 * Displays user's Skrumpey NFTs in a retro pixel art style
 * Star Skrumpeys are highlighted with special effects
 */
export default function ProfileCard() {
  const { address, ownedSkrumpeys, starSkrumpeys, isConnected } = useDAOAccess();

  // Mock NFT data for display (will be replaced with real data when API is available)
  const mockSkrumpeys = [
    { id: 42, name: 'Skrumpey #42', hasStar: true, rarity: 'Legendary' },
    { id: 137, name: 'Skrumpey #137', hasStar: true, rarity: 'Epic' },
    { id: 256, name: 'Skrumpey #256', hasStar: false, rarity: 'Rare' },
    { id: 888, name: 'Skrumpey #888', hasStar: false, rarity: 'Common' },
  ];

  // Use mock data for demo, real data when available
  const displaySkrumpeys = ownedSkrumpeys.length > 0 
    ? ownedSkrumpeys.map(id => {
        const hasStar = starSkrumpeys.includes(id);
        return {
          id,
          name: `Skrumpey #${id}`,
          hasStar,
          rarity: hasStar ? 'Star' : 'Common'
        };
      })
    : mockSkrumpeys;

  if (!isConnected) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Player Stats Box */}
      <div className="pixel-card p-6">
        <div className="flex items-center gap-4 mb-4">
          {/* Avatar */}
          <div className="relative">
            <div className="w-16 h-16 bg-gradient-to-br from-[#9966ff] to-[#ffd700] rounded-lg flex items-center justify-center text-3xl animate-pixel-float">
              🐸
            </div>
            {starSkrumpeys.length > 0 && (
              <div className="absolute -top-2 -right-2 text-xl animate-pixel-pulse">⭐</div>
            )}
          </div>
          
          {/* Player Info */}
          <div className="flex-1">
            <p className="text-[#ffd700] text-xs tracking-wide mb-1">STAR BEARER</p>
            <p className="text-gray-400 text-[8px] font-mono break-all">
              {address?.slice(0, 10)}...{address?.slice(-8)}
            </p>
          </div>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 border-t-2 border-[#2a2a4e] pt-4">
          <div className="text-center">
            <p className="text-[#ffd700] text-lg">{displaySkrumpeys.length}</p>
            <p className="text-gray-500 text-[6px] tracking-wide">SKRUMPEYS</p>
          </div>
          <div className="text-center border-x-2 border-[#2a2a4e]">
            <p className="text-[#ff00ff] text-lg">{displaySkrumpeys.filter(s => s.hasStar).length}</p>
            <p className="text-gray-500 text-[6px] tracking-wide">STAR TRAIT</p>
          </div>
          <div className="text-center">
            <p className="text-[#44ff88] text-lg">LVL 1</p>
            <p className="text-gray-500 text-[6px] tracking-wide">RANK</p>
          </div>
        </div>
      </div>

      {/* NFT Collection */}
      <div className="pixel-card p-6">
        <h3 className="text-[#ffd700] text-xs tracking-wider mb-4 text-center">
          ★ YOUR COLLECTION ★
        </h3>
        
        <div className="grid grid-cols-2 gap-4">
          {displaySkrumpeys.map((nft) => (
            <div 
              key={nft.id}
              className={`relative p-4 rounded-lg border-2 transition-all duration-300 hover:scale-105 ${
                nft.hasStar 
                  ? 'border-[#ffd700] bg-gradient-to-br from-[#1a1a2e] to-[#2a1a4a] shadow-[0_0_20px_rgba(255,215,0,0.3)]' 
                  : 'border-[#2a2a4e] bg-[#1a1a2e]'
              }`}
            >
              {/* Star badge */}
              {nft.hasStar && (
                <div className="absolute -top-2 -right-2 text-xl animate-pixel-pulse z-10">
                  ⭐
                </div>
              )}
              
              {/* NFT Image placeholder */}
              <div className={`w-full aspect-square rounded-lg mb-3 flex items-center justify-center text-4xl ${
                nft.hasStar 
                  ? 'bg-gradient-to-br from-[#9966ff]/30 to-[#ffd700]/30' 
                  : 'bg-[#0a0a15]'
              }`}>
                <span className="animate-pixel-float" style={{ animationDelay: `${nft.id % 3 * 0.3}s` }}>
                  🐸
                </span>
              </div>
              
              {/* NFT Info */}
              <p className={`text-[8px] font-bold tracking-wide ${
                nft.hasStar ? 'text-[#ffd700]' : 'text-gray-300'
              }`}>
                {nft.name}
              </p>
              <p className={`text-[6px] ${
                nft.hasStar ? 'text-[#ff00ff]' : 'text-gray-500'
              }`}>
                {nft.rarity}
              </p>
            </div>
          ))}
        </div>
        
        {/* Empty state */}
        {displaySkrumpeys.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 text-[10px]">No Skrumpeys found in this wallet</p>
          </div>
        )}
      </div>

      {/* Achievement Badges Placeholder */}
      <div className="pixel-card p-6">
        <h3 className="text-[#9966ff] text-xs tracking-wider mb-4 text-center">
          ✦ ACHIEVEMENTS ✦
        </h3>
        <div className="flex justify-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#ffd700]/20 border-2 border-[#ffd700] flex items-center justify-center text-xl"
               title="Star Bearer">
            ⭐
          </div>
          <div className="w-12 h-12 rounded-full bg-[#9966ff]/20 border-2 border-[#9966ff]/50 flex items-center justify-center text-xl opacity-50"
               title="Locked">
            🔒
          </div>
          <div className="w-12 h-12 rounded-full bg-[#44ff88]/20 border-2 border-[#44ff88]/50 flex items-center justify-center text-xl opacity-50"
               title="Locked">
            🔒
          </div>
        </div>
        <p className="text-gray-600 text-[6px] text-center mt-3">
          MORE BADGES COMING SOON
        </p>
      </div>
    </div>
  );
}
