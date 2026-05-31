'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDAOAccess } from '@/lib/hooks/useDAOAccess';
import { useDemoMode } from '@/lib/contexts/DemoModeContext';
import { STAR_TRAIT_VARIANTS, StarTraitVariant } from '@/lib/starSkrumpey';
import { STAR_CONSTELLATION_MAP } from '@/data/starConstellationData';
import { getWalletAuthHeader } from '@/lib/clientWalletAuth';
import SkrumpeyImage, { useSkrumpeyImage } from './SkrumpeyImage';
import { useAuthHeaders } from './profile/hooks/useAuthHeaders';
import { useProfileEdit } from './profile/hooks/useProfileEdit';
import { useFriends } from './profile/hooks/useFriends';
import { useMessages } from './profile/hooks/useMessages';
import { useNotifications } from './profile/hooks/useNotifications';
import { useRaffleHistory } from './profile/hooks/useRaffleHistory';
import MessagesTab from './profile/tabs/MessagesTab';
import AchievementsTab from './profile/tabs/AchievementsTab';
import SettingsTab from './profile/tabs/SettingsTab';
import FriendsTab from './profile/tabs/FriendsTab';
import CollectionTab from './profile/tabs/CollectionTab';
import RafflesTab from './profile/tabs/RafflesTab';
import { ACHIEVEMENTS, type Achievement, type AchievementCheckData } from './profile/achievements';
import type { SkrumpeyDisplayData } from './profile/types';
import { getVariantTextStyle } from '@/lib/skrumpeyVariantStyles';

/**
 * Calculate level number based on holdings and STAR points (used internally for
 * achievement checks only — not displayed).
 */
function calculateLevel(starCount: number, starPoints: number = 0): number {
  const nftContribution = starCount * 10;
  const pointsContribution = Math.sqrt(starPoints);
  return 1 + Math.floor(Math.sqrt(nftContribution + pointsContribution));
}

/**
 * Skrumpey Inspect Modal - Shows detailed view of an NFT
 */
function SkrumpeyInspectModal({
  skrumpey,
  onClose,
}: {
  skrumpey: SkrumpeyDisplayData;
  onClose: () => void;
}) {
  const { imageUrl, imageLoaded, imageError, setImageLoaded, handleImageError } =
    useSkrumpeyImage(skrumpey.id);

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 animate-slide-in-up overflow-hidden"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      
      {/* Modal Content - Scrollable on mobile with overscroll containment */}
      <div 
        className="relative z-10 w-full max-w-md pixel-card p-4 sm:p-6 animate-slide-in-up max-h-[90vh] overflow-y-auto overscroll-contain touch-pan-y"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button - Always visible with background */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 sm:top-3 sm:right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white rounded-lg hover:bg-[#2a2a4e] bg-[#1a1a2e]/80 smooth-transition z-10"
          title="Close (ESC)"
        >
          ✕
        </button>

        {/* Star Badge */}
        {skrumpey.hasStar && (
          <div className="absolute top-0 right-8 sm:-top-3 sm:-right-3 text-2xl sm:text-3xl animate-pixel-pulse animate-star-rotate z-20">
            ⭐
          </div>
        )}

        {/* Large NFT Image - Smaller on mobile */}
        <div className={`w-full max-w-[280px] sm:max-w-none mx-auto aspect-square rounded-lg mb-3 sm:mb-4 overflow-hidden relative ${
          skrumpey.hasStar 
            ? 'bg-gradient-to-br from-[#9966ff]/30 to-[#ffd700]/30 border-2 border-[#ffd700] shadow-[0_0_30px_rgba(255,215,0,0.4)]' 
            : 'bg-[#0a0a15] border-2 border-[#2a2a4e]'
        }`}>
          {/* Placeholder */}
          {(!imageLoaded || imageError) && (
            <div className="absolute inset-0 flex items-center justify-center text-6xl sm:text-8xl">
              <span className="animate-pixel-float">🐸</span>
            </div>
          )}
          
          {/* NFT Image */}
          {!imageError && (
            <img
              src={imageUrl}
              alt={skrumpey.name}
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setImageLoaded(true)}
              onError={handleImageError}
            />
          )}
        </div>

        {/* NFT Details */}
        <div className="space-y-2 sm:space-y-3">
          {/* Name and ID */}
          <div className="text-center">
            <h3 className={`text-lg sm:text-xl font-bold tracking-wide mb-1 ${
              skrumpey.hasStar ? 'text-[#ffd700] animate-glow-pulse' : 'text-white'
            }`}>
              {skrumpey.name}
            </h3>
            <p className="text-gray-500 text-[10px] sm:text-xs">Token ID: #{skrumpey.id}</p>
          </div>

          {/* Rarity / Star Variant */}
          <div className="flex justify-center">
            <div 
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold border-2 ${
                skrumpey.hasStar 
                  ? 'border-[#ffd700] bg-[#ffd700]/20' 
                  : 'border-[#2a2a4e] bg-[#1a1a2e]'
              }`}
              style={skrumpey.hasStar ? getVariantTextStyle(skrumpey.starVariant) : { color: '#888' }}
            >
              {skrumpey.rarity}
            </div>
          </div>

          {/* Star Info */}
          {skrumpey.hasStar && (
            <div className="bg-[#0a0a15] rounded-lg p-2 sm:p-3 border border-[#2a2a4e]">
              <p className="text-[#ffd700] text-[10px] sm:text-xs text-center mb-1 sm:mb-2">✦ STAR SKRUMPEY ✦</p>
              <p className="text-gray-400 text-[9px] sm:text-[10px] text-center leading-relaxed">
                This Skrumpey holds the power of the {skrumpey.starVariant?.toUpperCase() || 'UNKNOWN'} constellation, 
                granting exclusive access to the Star World Order DAO.
              </p>
            </div>
          )}

        </div>
      </div>
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
  const { isDemoMode } = useDemoMode();
  const [selectedSkrumpey, setSelectedSkrumpey] = useState<SkrumpeyDisplayData | null>(null);
  const [tokenMetadata, setTokenMetadata] = useState<Record<number, { constellation?: StarTraitVariant }>>({});
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);

  // Tab navigation state - includes all sections
  const [activeSection, setActiveSection] = useState<'settings' | 'friends' | 'messages' | 'collection' | 'achievements' | 'raffles'>('settings');

  // Close modal handler
  const closeModal = useCallback(() => {
    setSelectedSkrumpey(null);
  }, []);

  const getAuthenticatedJsonHeaders = useAuthHeaders(address);

  // Profile-edit cluster (display name / bio / badges / avatar + load + saves)
  const {
    displayName,
    setDisplayName,
    bio,
    setBio,
    isEditingProfile,
    setIsEditingProfile,
    isSavingProfile,
    profileError,
    setProfileError,
    profileSuccess,
    selectedBadges,
    setSelectedBadges,
    isEditingBadges,
    setIsEditingBadges,
    avatarTokenId,
    showAvatarPicker,
    setShowAvatarPicker,
    isSavingAvatar,
    handleSaveProfile,
    handleSaveAvatar,
    handleSaveBadges,
  } = useProfileEdit(address, isDemoMode, getAuthenticatedJsonHeaders);

  // Friends system (state + fetch + actions)
  const {
    friends,
    pendingRequests,
    isLoadingFriends,
    fetchFriends,
    handleFriendAction,
  } = useFriends(address);

  // Messaging system (state + fetch + send + selected-chat effect)
  const {
    conversations,
    selectedChat,
    setSelectedChat,
    chatMessages,
    isLoadingMessages,
    newMessage,
    setNewMessage,
    isSendingMessage,
    fetchConversations,
    handleSendMessage,
  } = useMessages(address);

  // All notifications (state + fetch)
  const {
    allNotifications,
    isLoadingNotifications,
    fetchAllNotifications,
  } = useNotifications(address);

  // Raffle history (state + fetch + tab-badge mount effect)
  const {
    raffleHistory,
    isLoadingRaffles,
    unviewedWonCount,
    fetchRaffleHistory,
  } = useRaffleHistory(address, getAuthenticatedJsonHeaders);

  // Load data when section changes
  useEffect(() => {
    if (!address) return;
    
    switch (activeSection) {
      case 'friends':
        fetchFriends();
        break;
      case 'messages':
        fetchConversations();
        fetchAllNotifications();
        break;
      case 'raffles':
        // Fetch raffle history and mark as viewed when user clicks on raffles tab
        fetchRaffleHistory(true);
        break;
    }
  }, [activeSection, address, fetchFriends, fetchConversations, fetchAllNotifications, fetchRaffleHistory]);

  // Check URL params for tab and chat selection
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      const chat = params.get('chat');
      
      if (tab === 'settings' || tab === 'friends' || tab === 'messages' || tab === 'collection' || tab === 'achievements' || tab === 'raffles') {
        setActiveSection(tab);
      }
      if (chat) {
        setSelectedChat(chat);
        setActiveSection('messages');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch metadata for owned tokens to get real constellation data
  useEffect(() => {
    if (starSkrumpeys.length === 0) return;
    let cancelled = false;
    const tokenIds = starSkrumpeys.map(t => t.tokenId).join(',');
    fetch(`/api/metadata?tokenIds=${tokenIds}`)
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        if (cancelled) return;
        if (data.success && data.metadata && typeof data.metadata === 'object') {
          const metaMap: Record<number, { constellation?: StarTraitVariant }> = {};
          for (const [id, meta] of Object.entries(data.metadata)) {
            // Validate the metadata structure before using
            if (meta && typeof meta === 'object' && 'constellation' in meta) {
              const constellation = (meta as Record<string, unknown>).constellation;
              if (typeof constellation === 'string' || constellation === undefined) {
                metaMap[parseInt(id, 10)] = { constellation: constellation as StarTraitVariant | undefined };
              }
            }
          }
          setTokenMetadata(metaMap);
        }
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [starSkrumpeys]);

  // Get the token ID to display as avatar
  // Priority: 1) User selected avatar, 2) First Star Skrumpey
  const displayAvatarTokenId = useMemo(() => {
    // If user has selected an avatar, use it
    if (avatarTokenId !== null) {
      // Verify they still own this token
      const stillOwns = starSkrumpeys.some(s => s.tokenId === avatarTokenId);
      if (stillOwns) {
        return avatarTokenId;
      }
    }
    // Fallback to first Star Skrumpey
    return starSkrumpeys.length > 0 ? starSkrumpeys[0].tokenId : null;
  }, [avatarTokenId, starSkrumpeys]);

  // Convert owned tokens to display format
  // Priority: 1) Fetched IPFS metadata (most accurate), 2) Token data from context, 3) Static constellation map (fallback)
  const displaySkrumpeys = ownedSkrumpeys.map(token => {
    // Prefer fetched IPFS metadata as the primary source of truth
    // Fall back to token data from context, then static map
    const starVariant = tokenMetadata[token.tokenId]?.constellation || token.starVariant || STAR_CONSTELLATION_MAP[token.tokenId];
    
    return {
      id: token.tokenId,
      name: `Skrumpey #${token.tokenId}`,
      hasStar: token.hasStar,
      rarity: token.hasStar ? (starVariant || 'Star').charAt(0).toUpperCase() + (starVariant || 'star').slice(1) : 'Common',
      starVariant,
    };
  });

  // Show demo data if no real NFTs found - shows all constellation variants for testing
  const showDemoData = displaySkrumpeys.length === 0;
  const demoSkrumpeys = showDemoData ? STAR_TRAIT_VARIANTS.map((variant, index) => ({
    id: 3000 + index,
    name: `Skrumpey #${3000 + index}`,
    hasStar: true,
    rarity: variant.charAt(0).toUpperCase() + variant.slice(1),
    starVariant: variant as StarTraitVariant,
  })) : [];

  const finalDisplaySkrumpeys = showDemoData ? demoSkrumpeys : displaySkrumpeys;

  // Calculate achievement check data
  const uniqueConstellations = [...new Set(
    displaySkrumpeys
      .filter(s => s.hasStar && s.starVariant)
      .map(s => s.starVariant as string)
  )];
  
  // Count how many of each constellation the user has
  const constellationCounts: Record<string, number> = {};
  displaySkrumpeys
    .filter(s => s.hasStar && s.starVariant)
    .forEach(s => {
      const variant = s.starVariant as string;
      constellationCounts[variant] = (constellationCounts[variant] || 0) + 1;
    });
  
  const hasPrime = uniqueConstellations.includes('prime');
  const level = calculateLevel(starSkrumpeys.length);
  
  const achievementCheckData: AchievementCheckData = {
    starCount: starSkrumpeys.length,
    uniqueConstellations,
    constellationCounts,
    hasPrime,
    level,
  };
  
  // Get unlocked achievements
  const unlockedAchievements = ACHIEVEMENTS.filter(a => a.check(achievementCheckData));
  
  // Toggle badge selection
  const toggleBadge = (badgeId: string) => {
    setSelectedBadges(prev => {
      if (prev.includes(badgeId)) {
        return prev.filter(id => id !== badgeId);
      }
      // Limit to 3 displayed badges
      if (prev.length >= 3) {
        return [...prev.slice(1), badgeId];
      }
      return [...prev, badgeId];
    });
  };

  // Get button text for badge display button
  const getBadgeButtonText = (): string => {
    if (isDemoMode && !isEditingBadges) {
      return '🔒 DISPLAY';
    }
    return isEditingBadges ? 'DONE' : 'DISPLAY';
  };

  if (!isConnected) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Player Stats Box with Profile Picture */}
      <div className="pixel-card p-4 sm:p-6 animate-slide-in-up relative">
        {/* Displayed Badges - Top Right */}
        {selectedBadges.length > 0 && (
          <div className="absolute top-3 right-3 flex gap-2">
            {selectedBadges.slice(0, 3).map(badgeId => {
              const badge = ACHIEVEMENTS.find(a => a.id === badgeId);
              if (!badge) return null;
              return (
                <div 
                  key={badgeId}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 animate-pixel-pulse"
                  style={{ 
                    backgroundColor: `${badge.color}20`,
                    borderColor: badge.color,
                    boxShadow: `0 0 10px ${badge.color}40`,
                  }}
                  title={badge.name}
                >
                  {badge.icon}
                </div>
              );
            })}
          </div>
        )}
        
        <div className="flex items-center gap-3 sm:gap-4 mb-4">
          {/* Avatar - Use selected Star Skrumpey as profile picture */}
          <div className="relative group">
            {displayAvatarTokenId ? (
              <SkrumpeyImage variant="avatar" tokenId={displayAvatarTokenId} />
            ) : (
              <div className="w-20 h-20 bg-gradient-to-br from-[#9966ff] to-[#ffd700] rounded-lg flex items-center justify-center text-3xl">
                🐸
              </div>
            )}
            {/* Edit Avatar Button - Only show if user has Star Skrumpeys */}
            {starSkrumpeys.length > 0 && !isDemoMode && (
              <button
                onClick={() => setShowAvatarPicker(true)}
                className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#1a1a2e] border-2 border-[#ffd700] rounded-full flex items-center justify-center text-sm hover:bg-[#2a2a4e] transition-all shadow-lg opacity-0 group-hover:opacity-100 focus:opacity-100"
                title="Change avatar"
              >
                ✏️
              </button>
            )}
          </div>
          
          {/* Player Info */}
          <div className="flex-1 min-w-0">
            <p className="text-[#ffd700] text-base sm:text-lg tracking-wide mb-1 truncate">
              {displayName || 'Star Bearer'}
            </p>
            <p className="text-gray-400 text-[10px] sm:text-xs font-mono truncate">
              {address?.slice(0, 10)}...{address?.slice(-8)}
            </p>
            {starSkrumpeys.length > 0 && (
              <p className="text-[#9966ff] text-[10px] sm:text-xs mt-1 truncate">
                {starSkrumpeys.length} Star Skrumpey{starSkrumpeys.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
        
        {/* Stats Grid */}
        <div className="border-t-2 border-[#2a2a4e] pt-3 sm:pt-4 text-center smooth-transition animate-slide-in-up animate-delay-1">
          <p className="text-[#ffd700] text-xl sm:text-2xl">{starSkrumpeys.length}</p>
          <p className="text-gray-500 text-[9px] sm:text-xs tracking-wide">STAR SKRUMPEYS</p>
        </div>
      </div>

      {/* Section Tab Navigation */}
      {/* Section Tab Navigation - Mobile optimized */}
      <div className="flex gap-1 sm:gap-2 justify-center flex-wrap animate-slide-in-up px-2 sm:px-0 mt-2 sm:mt-0">
        {(['settings', 'friends', 'messages', 'collection', 'achievements', 'raffles'] as const).map((section) => {
          const isActive = activeSection === section;
          const icons: Record<string, string> = { 
            settings: '⚙️', 
            friends: '👥', 
            messages: '💬',
            collection: '🎨', 
            achievements: '🏆', 
            raffles: '🎰'
          };
          const labels: Record<string, string> = { 
            settings: 'Settings', 
            friends: 'Friends',
            messages: 'Messages',
            collection: 'Collection', 
            achievements: 'Achievements', 
            raffles: 'Raffles'
          };
          // Short labels for small screens
          const shortLabels: Record<string, string> = { 
            settings: 'Set', 
            friends: 'Frds',
            messages: 'Msgs',
            collection: 'NFTs', 
            achievements: 'Achv', 
            raffles: 'Raff'
          };
          
          // Show badge for pending friend requests or unviewed won raffles
          const badge = section === 'friends' && pendingRequests.length > 0 
            ? pendingRequests.length 
            : section === 'raffles' && unviewedWonCount > 0 
            ? unviewedWonCount 
            : null;
          
          return (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[9px] sm:text-xs font-bold border-2 smooth-transition relative whitespace-nowrap ${
                isActive
                  ? 'bg-[#ffd700]/20 border-[#ffd700] text-[#ffd700]'
                  : 'bg-[#1a1a2e] border-[#2a2a4e] text-gray-400 hover:border-[#ffd700]/50 hover:text-[#ffd700]/70'
              }`}
            >
              <span className="sm:hidden">{icons[section]} {shortLabels[section]}</span>
              <span className="hidden sm:inline">{icons[section]} {labels[section]}</span>
              {badge && (
                <span className="absolute -top-1 -right-1 min-w-[14px] sm:min-w-[16px] h-[14px] sm:h-[16px] flex items-center justify-center text-[8px] sm:text-[9px] font-bold text-white bg-[#ff4466] rounded-full px-0.5 sm:px-1">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Settings Section */}
      {activeSection === 'settings' && (
        <SettingsTab
          address={address}
          isDemoMode={isDemoMode}
          displayName={displayName}
          setDisplayName={setDisplayName}
          bio={bio}
          setBio={setBio}
          isEditingProfile={isEditingProfile}
          setIsEditingProfile={setIsEditingProfile}
          isSavingProfile={isSavingProfile}
          profileError={profileError}
          setProfileError={setProfileError}
          profileSuccess={profileSuccess}
          handleSaveProfile={handleSaveProfile}
          notificationSettings={
            <NotificationSettingsCard walletAddress={address || ''} isDemoMode={isDemoMode} />
          }
        />
      )}

      {/* Friends Section */}
      {activeSection === 'friends' && (
        <FriendsTab
          address={address}
          friends={friends}
          pendingRequests={pendingRequests}
          isLoadingFriends={isLoadingFriends}
          handleFriendAction={handleFriendAction}
          setSelectedChat={setSelectedChat}
          setActiveSection={setActiveSection}
        />
      )}

      {/* Messages Section */}
      {activeSection === 'messages' && (
        <MessagesTab
          address={address}
          conversations={conversations}
          selectedChat={selectedChat}
          setSelectedChat={setSelectedChat}
          chatMessages={chatMessages}
          isLoadingMessages={isLoadingMessages}
          newMessage={newMessage}
          setNewMessage={setNewMessage}
          isSendingMessage={isSendingMessage}
          handleSendMessage={handleSendMessage}
          allNotifications={allNotifications}
          isLoadingNotifications={isLoadingNotifications}
        />
      )}

      {/* My Collection Section */}
      {activeSection === 'collection' && (
        <CollectionTab
          starSkrumpeys={starSkrumpeys}
          displaySkrumpeys={displaySkrumpeys}
          finalDisplaySkrumpeys={finalDisplaySkrumpeys}
          showDemoData={showDemoData}
          setSelectedSkrumpey={setSelectedSkrumpey}
        />
      )}

      {/* Achievements Section */}
      {activeSection === 'achievements' && (
        <AchievementsTab
          unlockedAchievements={unlockedAchievements}
          uniqueConstellations={uniqueConstellations}
          starSkrumpeys={starSkrumpeys}
          selectedBadges={selectedBadges}
          isEditingBadges={isEditingBadges}
          setIsEditingBadges={setIsEditingBadges}
          handleSaveBadges={handleSaveBadges}
          getBadgeButtonText={getBadgeButtonText}
          toggleBadge={toggleBadge}
          isDemoMode={isDemoMode}
          selectedAchievement={selectedAchievement}
          setSelectedAchievement={setSelectedAchievement}
        />
      )}

      {/* Raffle History Section */}
      {activeSection === 'raffles' && (
        <RafflesTab
          raffleHistory={raffleHistory}
          isLoadingRaffles={isLoadingRaffles}
        />
      )}

      {/* Avatar Picker Modal */}
      {showAvatarPicker && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in overflow-hidden"
          onClick={() => setShowAvatarPicker(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          
          {/* Modal Content - with overscroll containment to prevent background scroll on mobile */}
          <div 
            className="relative z-10 w-full max-w-md pixel-card p-6 animate-slide-in-up max-h-[80vh] flex flex-col overscroll-contain touch-pan-y"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowAvatarPicker(false)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white rounded-lg hover:bg-[#2a2a4e] smooth-transition"
            >
              ✕
            </button>

            <h3 className="text-[#ffd700] text-sm tracking-wider mb-4 text-center animate-glow-pulse">
              ✦ SELECT PROFILE PICTURE ✦
            </h3>
            
            <p className="text-gray-400 text-[10px] text-center mb-4">
              Choose a Star Skrumpey to display as your avatar
            </p>

            {/* Star Skrumpeys Grid */}
            <div className="flex-1 overflow-y-auto scrollbar-pixel">
              <div className="grid grid-cols-3 gap-3">
                {starSkrumpeys.map((star) => {
                  const isSelected = displayAvatarTokenId === star.tokenId;
                  const constellation = tokenMetadata[star.tokenId]?.constellation || star.starVariant;
                  
                  return (
                    <button
                      key={star.tokenId}
                      onClick={() => handleSaveAvatar(star.tokenId)}
                      disabled={isSavingAvatar}
                      className={`relative p-2 rounded-lg border-2 transition-all disabled:opacity-50 ${
                        isSelected
                          ? 'border-[#ffd700] bg-[#ffd700]/20 shadow-[0_0_15px_rgba(255,215,0,0.4)]'
                          : 'border-[#2a2a4e] bg-[#1a1a2e] hover:border-[#9966ff] hover:bg-[#2a2a4e]'
                      }`}
                    >
                      {/* Selected Indicator */}
                      {isSelected && (
                        <div className="absolute -top-2 -right-2 w-5 h-5 bg-[#ffd700] rounded-full flex items-center justify-center text-[10px] text-black font-bold">
                          ✓
                        </div>
                      )}
                      
                      {/* NFT Image */}
                      <div className="w-full aspect-square rounded overflow-hidden mb-2">
                        <SkrumpeyImage variant="picker" tokenId={star.tokenId} />
                      </div>
                      
                      {/* Token Info */}
                      <p className="text-[9px] text-center text-gray-300 truncate">
                        #{star.tokenId}
                      </p>
                      {constellation && (
                        <p className="text-[8px] text-center text-[#9966ff] uppercase truncate">
                          {constellation}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {starSkrumpeys.length === 0 && (
              <div className="text-center py-8">
                <span className="text-4xl mb-2 block">🐸</span>
                <p className="text-gray-500 text-xs">No Star Skrumpeys found</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Skrumpey Inspect Modal */}
      {selectedSkrumpey && (
        <SkrumpeyInspectModal
          skrumpey={selectedSkrumpey}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

/**
 * Notification Settings Card Component
 * Allows users to configure their notification preferences
 */
function NotificationSettingsCard({ 
  walletAddress, 
  isDemoMode 
}: { 
  walletAddress: string;
  isDemoMode: boolean;
}) {
  const [settings, setSettings] = useState({
    quest_notifications: true,
    achievement_notifications: true,
    system_notifications: true,
    social_notifications: true,
    governance_notifications: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Fetch settings on mount
  useEffect(() => {
    if (!walletAddress) return;
    
    const fetchSettings = async () => {
      try {
        const response = await fetch(`/api/notifications?address=${walletAddress}&settings=true`);
        const data = await response.json();
        
        if (data.success && data.settings) {
          setSettings({
            quest_notifications: data.settings.quest_notifications === 1,
            achievement_notifications: data.settings.achievement_notifications === 1,
            system_notifications: data.settings.system_notifications === 1,
            social_notifications: data.settings.social_notifications === 1,
            governance_notifications: data.settings.governance_notifications === 1,
          });
        }
      } catch (error) {
        console.error('Failed to fetch notification settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSettings();
  }, [walletAddress]);
  
  // Save settings
  const handleToggle = async (key: keyof typeof settings) => {
    if (isDemoMode || !walletAddress) return;
    
    const newValue = !settings[key];
    setSettings(prev => ({ ...prev, [key]: newValue }));
    setIsSaving(true);
    setSaveSuccess(false);
    
    try {
      // Map settings key to API format
      // e.g., 'quest_notifications' -> 'questNotifications'
      const keyMap: Record<string, string> = {
        quest_notifications: 'questNotifications',
        achievement_notifications: 'achievementNotifications',
        system_notifications: 'systemNotifications',
        social_notifications: 'socialNotifications',
        governance_notifications: 'governanceNotifications',
      };
      const apiKey = keyMap[key] || key;
      const walletAuthHeader = await getWalletAuthHeader(walletAddress);
      if (!walletAuthHeader) {
        throw new Error('Wallet signature required');
      }
      
      await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-auth': walletAuthHeader,
        },
        body: JSON.stringify({
          walletAddress,
          action: 'updateSettings',
          settings: {
            [apiKey]: newValue,
          },
        }),
      });
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to save notification settings:', error);
      // Revert on error
      setSettings(prev => ({ ...prev, [key]: !newValue }));
    } finally {
      setIsSaving(false);
    }
  };
  
  const settingsConfig = [
    { key: 'quest_notifications' as const, label: 'Quest Updates', icon: '📜', description: 'New quests and rewards' },
    { key: 'achievement_notifications' as const, label: 'Achievements', icon: '🏆', description: 'Unlocked badges' },
    { key: 'system_notifications' as const, label: 'System', icon: '⚙️', description: 'Important announcements' },
    { key: 'social_notifications' as const, label: 'Social', icon: '💬', description: 'Community activity' },
    { key: 'governance_notifications' as const, label: 'Governance', icon: '🗳️', description: 'DAO proposals and votes' },
  ];
  
  return (
    <div className="pixel-card p-6 animate-slide-in-up mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[#9966ff] text-sm tracking-wider">
          🔔 NOTIFICATION SETTINGS
        </h3>
        {saveSuccess && (
          <span className="text-[#44ff88] text-[10px]">✓ Saved</span>
        )}
      </div>
      
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <span className="text-xl animate-spin">⭐</span>
        </div>
      ) : (
        <div className="space-y-3">
          {settingsConfig.map(({ key, label, icon, description }) => (
            <div 
              key={key}
              className="flex items-center justify-between py-2 border-b border-[#2a2a4e] last:border-0"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{icon}</span>
                <div>
                  <p className="text-white text-xs">{label}</p>
                  <p className="text-gray-500 text-[9px]">{description}</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle(key)}
                disabled={isDemoMode || isSaving}
                className={`w-12 h-6 rounded-full transition-all relative ${
                  settings[key] 
                    ? 'bg-[#44ff88]' 
                    : 'bg-[#2a2a4e]'
                } ${isDemoMode ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                style={{ 
                  boxShadow: settings[key] ? '0 0 10px #44ff8840' : 'none',
                }}
              >
                <span 
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                    settings[key] ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      )}
      
      {isDemoMode && (
        <p className="text-gray-500 text-[9px] text-center mt-4">
          🔒 Settings locked in Demo Mode
        </p>
      )}
    </div>
  );
}
