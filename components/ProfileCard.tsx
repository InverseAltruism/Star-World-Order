'use client';

import { useState, useEffect } from 'react';
import { useDAOAccess } from '@/lib/hooks/useDAOAccess';
import { STAR_TRAIT_VARIANTS, StarTraitVariant, getSkrumpeyImageUrl } from '@/lib/starSkrumpey';
import SocialConnect from './SocialConnect';

/**
 * Profile Avatar Component with fallback
 */
function ProfileAvatar({ tokenId }: { tokenId: number }) {
  const [imageError, setImageError] = useState(false);
  const imageUrl = getSkrumpeyImageUrl(tokenId);

  if (imageError) {
    return (
      <div className="w-20 h-20 bg-gradient-to-br from-[#9966ff] to-[#ffd700] rounded-lg flex items-center justify-center text-3xl">
        🐸
      </div>
    );
  }

  return (
    <div className="w-20 h-20 rounded-lg overflow-hidden border-2 border-[#ffd700]">
      <img
        src={imageUrl}
        alt={`Skrumpey #${tokenId}`}
        className="w-full h-full object-cover"
        onError={() => setImageError(true)}
      />
    </div>
  );
}

/**
 * NFT Image Component with loading and error states
 */
function NFTImage({ tokenId, hasStar, name }: { tokenId: number; hasStar: boolean; name: string }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const imageUrl = getSkrumpeyImageUrl(tokenId);

  return (
    <div className={`w-full aspect-square rounded-lg mb-3 overflow-hidden relative smooth-transition hover-lift ${
      hasStar 
        ? 'bg-gradient-to-br from-[#9966ff]/30 to-[#ffd700]/30' 
        : 'bg-[#0a0a15]'
    }`}>
      {/* Show placeholder while loading or on error */}
      {(!imageLoaded || imageError) && (
        <div className="absolute inset-0 flex items-center justify-center text-4xl">
          <span className="animate-pixel-float" style={{ animationDelay: `${tokenId % 3 * 0.3}s` }}>
            🐸
          </span>
        </div>
      )}
      
      {/* Actual NFT image */}
      {!imageError && (
        <img
          src={imageUrl}
          alt={name}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          loading="lazy"
        />
      )}
    </div>
  );
}

/**
 * Profile Card Component
 * Displays user's Skrumpey NFTs in a retro pixel art style
 * Star Skrumpeys are highlighted with special effects
 */
export default function ProfileCard() {
  const { address, ownedSkrumpeys, starSkrumpeys, isConnected } = useDAOAccess();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Load profile on mount
  useEffect(() => {
    if (address) {
      fetch(`/api/profile?address=${address}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.profile) {
            setDisplayName(data.profile.display_name || '');
            setBio(data.profile.bio || '');
          }
        })
        .catch(console.error);
    }
  }, [address]);

  const handleSaveProfile = async () => {
    if (!address) return;
    
    setIsSavingProfile(true);
    setProfileError(null);
    setProfileSuccess(false);
    
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          displayName: displayName.trim(),
          bio: bio.trim(),
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setProfileSuccess(true);
        setIsEditingProfile(false);
        setTimeout(() => setProfileSuccess(false), 3000);
      } else {
        setProfileError(data.error || 'Failed to save profile');
      }
    } catch (error) {
      setProfileError('Network error. Please try again.');
      console.error('Failed to save profile:', error);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Convert owned tokens to display format
  const displaySkrumpeys = ownedSkrumpeys.map(token => ({
    id: token.tokenId,
    name: `Skrumpey #${token.tokenId}`,
    hasStar: token.hasStar,
    rarity: token.hasStar ? (token.starVariant || 'Star').charAt(0).toUpperCase() + (token.starVariant || 'star').slice(1) : 'Common',
    starVariant: token.starVariant,
  }));

  // Show demo data if no real NFTs found - uses variants from STAR_TRAIT_VARIANTS
  const showDemoData = displaySkrumpeys.length === 0;
  const demoSkrumpeys = showDemoData ? [
    { 
      id: 42, 
      name: 'Skrumpey #42', 
      hasStar: true, 
      rarity: STAR_TRAIT_VARIANTS[0].charAt(0).toUpperCase() + STAR_TRAIT_VARIANTS[0].slice(1), 
      starVariant: STAR_TRAIT_VARIANTS[0] as StarTraitVariant 
    },
    { 
      id: 137, 
      name: 'Skrumpey #137', 
      hasStar: true, 
      rarity: STAR_TRAIT_VARIANTS[1].charAt(0).toUpperCase() + STAR_TRAIT_VARIANTS[1].slice(1), 
      starVariant: STAR_TRAIT_VARIANTS[1] as StarTraitVariant 
    },
    { id: 256, name: 'Skrumpey #256', hasStar: false, rarity: 'Common', starVariant: undefined },
    { id: 888, name: 'Skrumpey #888', hasStar: false, rarity: 'Common', starVariant: undefined },
  ] : [];

  const finalDisplaySkrumpeys = showDemoData ? demoSkrumpeys : displaySkrumpeys;

  if (!isConnected) {
    return null;
  }

  // Get color for star variant
  const getVariantColor = (variant?: string): string => {
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
  };

  return (
    <div className="space-y-6">
      {/* Player Stats Box with Profile Picture */}
      <div className="pixel-card p-6 animate-slide-in-up">
        <div className="flex items-center gap-4 mb-4">
          {/* Avatar - Use first Star Skrumpey as profile picture */}
          <div className="relative">
            {starSkrumpeys.length > 0 ? (
              <ProfileAvatar tokenId={starSkrumpeys[0].tokenId} />
            ) : (
              <div className="w-20 h-20 bg-gradient-to-br from-[#9966ff] to-[#ffd700] rounded-lg flex items-center justify-center text-3xl">
                🐸
              </div>
            )}
          </div>
          
          {/* Player Info */}
          <div className="flex-1">
            <p className="text-[#ffd700] text-lg tracking-wide mb-1">
              {displayName || 'Star Bearer'}
            </p>
            <p className="text-gray-400 text-xs font-mono break-all">
              {address?.slice(0, 10)}...{address?.slice(-8)}
            </p>
            {starSkrumpeys.length > 0 && (
              <p className="text-[#9966ff] text-xs mt-1">
                {starSkrumpeys.length} Star Skrumpey{starSkrumpeys.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 border-t-2 border-[#2a2a4e] pt-4">
          <div className="text-center smooth-transition hover-lift animate-slide-in-up animate-delay-1">
            <p className="text-[#ffd700] text-lg">{finalDisplaySkrumpeys.length}</p>
            <p className="text-gray-500 text-xs tracking-wide">SKRUMPEYS</p>
          </div>
          <div className="text-center border-x-2 border-[#2a2a4e] smooth-transition hover-lift animate-slide-in-up animate-delay-2">
            <p className="text-[#ff00ff] text-lg">{finalDisplaySkrumpeys.filter(s => s.hasStar).length}</p>
            <p className="text-gray-500 text-xs tracking-wide">STAR TRAIT</p>
          </div>
          <div className="text-center smooth-transition hover-lift animate-slide-in-up animate-delay-3">
            <p className="text-[#44ff88] text-lg">LVL 1</p>
            <p className="text-gray-500 text-xs tracking-wide">RANK</p>
          </div>
        </div>
      </div>

      {/* Profile Edit Box */}
      <div className="pixel-card p-6 animate-slide-in-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[#9966ff] text-sm tracking-wider">
            PROFILE SETTINGS
          </h3>
          {!isEditingProfile && (
            <button
              onClick={() => setIsEditingProfile(true)}
              className="pixel-btn text-[10px] !px-3 !py-1"
            >
              EDIT
            </button>
          )}
        </div>
        
        {isEditingProfile ? (
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-[10px] block mb-2">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name (3-20 characters)"
                maxLength={20}
                className="w-full bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-3 py-2 text-white text-[11px] focus:border-[#ffd700] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-gray-400 text-[10px] block mb-2">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us about yourself (max 200 characters)"
                maxLength={200}
                rows={3}
                className="w-full bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-3 py-2 text-white text-[11px] focus:border-[#ffd700] focus:outline-none resize-none"
              />
              <p className="text-gray-600 text-xs mt-1">{bio.length}/200 characters</p>
            </div>
            
            {profileError && (
              <p className="text-[#ff4466] text-[10px] bg-[#ff4466]/10 px-3 py-2 rounded">
                ⚠️ {profileError}
              </p>
            )}
            
            <div className="flex gap-2">
              <button
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                className="pixel-btn pixel-btn-gold text-[10px] !px-4 disabled:opacity-50"
              >
                {isSavingProfile ? 'SAVING...' : 'SAVE'}
              </button>
              <button
                onClick={() => {
                  setIsEditingProfile(false);
                  setProfileError(null);
                }}
                className="pixel-btn text-[10px] !px-4"
              >
                CANCEL
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div>
              <p className="text-gray-500 text-[9px]">Display Name</p>
              <p className="text-white text-[11px]">{displayName || 'Not set'}</p>
            </div>
            {bio && (
              <div>
                <p className="text-gray-500 text-[9px]">Bio</p>
                <p className="text-gray-300 text-[10px] leading-relaxed">{bio}</p>
              </div>
            )}
            {profileSuccess && (
              <p className="text-[#44ff88] text-[10px] bg-[#44ff88]/10 px-3 py-2 rounded">
                ✓ Profile saved successfully!
              </p>
            )}
          </div>
        )}
      </div>

      {/* Star Trait Legend */}
      {starSkrumpeys.length > 0 && (
        <div className="pixel-card p-4 animate-slide-in-up animate-delay-4">
          <h3 className="text-[#ffd700] text-sm tracking-wider mb-3 text-center animate-glow-pulse">
            STAR CONSTELLATIONS
          </h3>
          <div className="flex flex-wrap justify-center gap-2">
            {STAR_TRAIT_VARIANTS.map((variant, index) => {
              const hasVariant = starSkrumpeys.some(s => s.starVariant === variant);
              return (
                <div 
                  key={variant}
                  className={`px-2 py-1 rounded text-xs border smooth-transition hover-lift ${
                    hasVariant 
                      ? 'border-[#ffd700] bg-[#ffd700]/20' 
                      : 'border-[#2a2a4e] bg-[#1a1a2e] opacity-40'
                  }`}
                  style={{ 
                    color: hasVariant ? getVariantColor(variant) : '#666',
                    animationDelay: `${index * 0.05}s`
                  }}
                >
                  {variant.toUpperCase()}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Demo Data Notice */}
      {showDemoData && (
        <div className="text-center">
          <p className="text-gray-500 text-xs bg-[#1a1a2e] inline-block px-3 py-1 rounded border border-[#2a2a4e]">
            📋 Showing demo data - Connect wallet with Skrumpeys to see your collection
          </p>
        </div>
      )}

      {/* NFT Collection */}
      <div className="pixel-card p-6 animate-slide-in-up animate-delay-5">
        <h3 className="text-[#ffd700] text-sm tracking-wider mb-4 text-center animate-glow-pulse">
          YOUR COLLECTION
        </h3>
        
        <div className="grid grid-cols-2 gap-4">
          {finalDisplaySkrumpeys.map((nft, index) => (
            <div 
              key={nft.id}
              className={`relative p-4 rounded-lg border-2 smooth-transition hover:scale-105 cursor-pointer animate-slide-in-up animate-delay-${(index % 6) + 1} ${
                nft.hasStar 
                  ? 'border-[#ffd700] bg-gradient-to-br from-[#1a1a2e] to-[#2a1a4a] shadow-[0_0_20px_rgba(255,215,0,0.3)] hover:shadow-[0_0_30px_rgba(255,215,0,0.5)]' 
                  : 'border-[#2a2a4e] bg-[#1a1a2e] hover:border-[#3a3a5e]'
              }`}
            >
              {/* Star badge */}
              {nft.hasStar && (
                <div className="absolute -top-2 -right-2 text-xl animate-pixel-pulse animate-star-rotate z-10">
                  ⭐
                </div>
              )}
              
              {/* NFT Image */}
              <NFTImage 
                tokenId={nft.id} 
                hasStar={nft.hasStar}
                name={nft.name}
              />
              
              {/* NFT Info */}
              <p className={`text-[10px] font-bold tracking-wide ${
                nft.hasStar ? 'text-[#ffd700]' : 'text-gray-300'
              }`}>
                {nft.name}
              </p>
              <p className="text-xs" style={{ color: nft.hasStar ? getVariantColor(nft.starVariant) : '#666' }}>
                {nft.rarity}
              </p>
            </div>
          ))}
        </div>
        
        {/* Empty state */}
        {finalDisplaySkrumpeys.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 text-[10px]">No Skrumpeys found in this wallet</p>
          </div>
        )}
      </div>

      {/* Achievement Badges Placeholder */}
      <div className="pixel-card p-6">
        <h3 className="text-[#9966ff] text-sm tracking-wider mb-4 text-center">
          ACHIEVEMENTS
        </h3>
        <div className="flex justify-center gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${
            starSkrumpeys.length > 0 
              ? 'bg-[#ffd700]/20 border-2 border-[#ffd700]' 
              : 'bg-[#333]/20 border-2 border-[#333]/50 opacity-50'
          }`}
               title={starSkrumpeys.length > 0 ? "Star Bearer" : "Locked - Hold a Star Skrumpey"}>
            {starSkrumpeys.length > 0 ? '⭐' : '🔒'}
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
        <p className="text-gray-600 text-xs text-center mt-3">
          MORE BADGES COMING SOON
        </p>
      </div>

      {/* Social Connections - Moved below Profile Settings */}
      <SocialConnect />
    </div>
  );
}
