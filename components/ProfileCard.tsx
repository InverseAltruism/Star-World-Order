'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDAOAccess } from '@/lib/hooks/useDAOAccess';
import { useDemoMode } from '@/lib/contexts/DemoModeContext';
import { STAR_TRAIT_VARIANTS, StarTraitVariant, getSkrumpeyImageUrl } from '@/lib/starSkrumpey';
import { STAR_CONSTELLATION_MAP } from '@/data/starConstellationData';
import SocialConnect from './SocialConnect';

/**
 * Get level title based on Star Skrumpey holdings count
 */
function getLevelTitle(holdingsCount: number): string {
  if (holdingsCount >= 10) return 'COSMIC EMPEROR';
  if (holdingsCount >= 5) return 'STAR LORD';
  if (holdingsCount >= 2) return 'COSMIC WARDEN';
  return 'STAR FORGED';
}

/**
 * Get level color based on holdings count
 */
function getLevelColor(holdingsCount: number): string {
  if (holdingsCount >= 10) return '#ffd700'; // Gold - Cosmic Emperor
  if (holdingsCount >= 5) return '#ff00ff'; // Magenta - Star Lord
  if (holdingsCount >= 2) return '#00ffff'; // Cyan - Cosmic Warden
  return '#9966ff'; // Purple - Star Forged
}

/**
 * Calculate level number based on holdings and STAR points
 */
function calculateLevel(starCount: number, starPoints: number = 0): number {
  const nftContribution = starCount * 10;
  const pointsContribution = Math.sqrt(starPoints);
  return 1 + Math.floor(Math.sqrt(nftContribution + pointsContribution));
}

/**
 * Interface defining the structure for Skrumpey NFT display data
 * Used in collection grid components and the inspect modal
 */
interface SkrumpeyDisplayData {
  id: number;
  name: string;
  hasStar: boolean;
  rarity: string;
  starVariant?: StarTraitVariant;
}

/**
 * Quest and XP types for profile display
 */
interface UserQuestProgress {
  id: number;
  wallet_address: string;
  quest_id: string;
  status: 'available' | 'in_progress' | 'completed' | 'claimed';
  progress: number;
  started_at: string | null;
  completed_at: string | null;
  claimed_at: string | null;
  created_at: string;
}

interface QuestWithProgress {
  id: string;
  name: string;
  description: string;
  xp_reward: number;
  quest_type: 'daily' | 'weekly' | 'one_time' | 'urgent';
  category: 'social' | 'trading' | 'governance' | 'community' | 'general';
  requirements_json: string | null;
  is_active: number;
  priority: number;
  icon: string;
  created_at: string;
  expires_at: string | null;
  userProgress: UserQuestProgress | null;
  canClaim: boolean;
}

interface UserXPData {
  id: number;
  wallet_address: string;
  total_xp: number;
  level: number;
  currentLevelXP: number;
  requiredForNextLevel: number;
  percentage: number;
  created_at: string;
  updated_at: string;
}

/**
 * Friend data interface
 */
interface FriendWithProfileData {
  id: number;
  user_address: string;
  friend_address: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  updated_at: string;
  display_name?: string;
  bio?: string;
}

/**
 * Conversation data interface
 */
interface ConversationData {
  other_address: string;
  other_display_name?: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  is_sender: boolean;
}

/**
 * Direct message data interface
 */
interface DirectMessageData {
  id: number;
  sender_address: string;
  recipient_address: string;
  message: string;
  is_read: number;
  created_at: string;
  sender_display_name?: string;
  recipient_display_name?: string;
}

/**
 * Notification data interface
 */
interface NotificationData {
  id: number;
  wallet_address: string;
  type: 'quest' | 'achievement' | 'system' | 'social' | 'governance';
  title: string;
  message: string;
  link: string | null;
  icon: string;
  is_read: number;
  created_at: string;
}

/**
 * Raffle history data interface
 */
interface RaffleHistoryEntry {
  id: number;
  raffle_id: string;
  wallet_address: string;
  tier: string;
  entries_count: number;
  discord_bonus: number;
  engagement_bonus: number;
  star_count: number;
  entered_at: string;
  won: boolean;
  hasViewed?: boolean; // Whether user has viewed this raffle result
  raffle: {
    id: string;
    name: string;
    description: string;
    status: 'active' | 'ended' | 'drawn' | 'cancelled';
    prize_description: string;
    prize_image_url: string | null;
    start_time: string;
    end_time: string;
    winner_address: string | null;
    winner_drawn_at: string | null;
    winner_draw_seed: string | null;
  };
}

/**
 * Achievement/Badge definitions
 * All constellations for "Gotta Catch 'Em All" badge (excluding Prime which is 1 of 1)
 */
const COLLECTIBLE_CONSTELLATIONS = [
  'aether', 'spectra', 'solveil', 'nebulu', 'chroma', 
  'rose', 'monflare', 'auracore', 'parallel'
] as const;

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  check: (data: AchievementCheckData) => boolean;
}

interface AchievementCheckData {
  starCount: number;
  uniqueConstellations: string[];
  constellationCounts: Record<string, number>;
  hasPrime: boolean;
  level: number;
}

/**
 * Available achievements
 */
const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'star_forged',
    name: 'Star Forged',
    description: 'Hold at least 1 Star Skrumpey',
    icon: '⭐',
    color: '#9966ff',
    check: (data) => data.starCount >= 1,
  },
  {
    id: 'cosmic_warden',
    name: 'Cosmic Warden',
    description: 'Hold 2 or more Star Skrumpeys',
    icon: '🌟',
    color: '#00ffff',
    check: (data) => data.starCount >= 2,
  },
  {
    id: 'star_lord',
    name: 'Star Lord',
    description: 'Hold 5 or more Star Skrumpeys',
    icon: '👑',
    color: '#ff00ff',
    check: (data) => data.starCount >= 5,
  },
  {
    id: 'cosmic_emperor',
    name: 'Cosmic Emperor',
    description: 'Hold 10 or more Star Skrumpeys',
    icon: '🏆',
    color: '#ffd700',
    check: (data) => data.starCount >= 10,
  },
  {
    id: 'gotta_catch_em_all',
    name: 'Gotta Catch Em All!',
    description: 'Collect all 9 constellation types (excluding Prime)',
    icon: '🔮',
    color: '#ff6ec7',
    check: (data) => {
      const collected = COLLECTIBLE_CONSTELLATIONS.filter(c => 
        data.uniqueConstellations.includes(c)
      );
      return collected.length >= COLLECTIBLE_CONSTELLATIONS.length;
    },
  },
  {
    id: 'prime_holder',
    name: 'The Prime',
    description: 'Hold the legendary 1/1 Prime Star Skrumpey',
    icon: '💎',
    color: '#ffd700',
    check: (data) => data.hasPrime,
  },
  {
    id: 'constellation_explorer',
    name: 'Constellation Explorer',
    description: 'Collect at least 3 different constellation types',
    icon: '🔭',
    color: '#9966ff',
    check: (data) => data.uniqueConstellations.length >= 3,
  },
  {
    id: 'cosmic_collector',
    name: 'Cosmic Collector',
    description: 'Collect at least 5 different constellation types',
    icon: '🌌',
    color: '#44ff88',
    check: (data) => data.uniqueConstellations.length >= 5,
  },
  {
    id: 'constellation_master',
    name: 'Constellation Master',
    description: 'Hold 3 or more Star Skrumpeys of the same constellation',
    icon: '✨',
    color: '#ff6ec7',
    check: (data) => Object.values(data.constellationCounts).some(count => count >= 3),
  },
];

/**
 * Skrumpey Inspect Modal - Shows detailed view of an NFT
 */
function SkrumpeyInspectModal({
  skrumpey,
  onClose,
  getVariantColor,
  getVariantTextStyle,
}: {
  skrumpey: SkrumpeyDisplayData;
  onClose: () => void;
  getVariantColor: (variant?: string) => string;
  getVariantTextStyle: (variant?: string) => React.CSSProperties;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [useGif, setUseGif] = useState(false);
  const imageUrl = getSkrumpeyImageUrl(skrumpey.id, useGif);

  const handleImageError = () => {
    if (!useGif) {
      // Reset load state and try GIF (for galaxy background NFTs)
      setImageLoaded(false);
      setUseGif(true);
    } else {
      // Show placeholder after trying both extensions
      setImageError(true);
    }
  };

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-slide-in-up"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      
      {/* Modal Content */}
      <div 
        className="relative z-10 w-full max-w-md pixel-card p-6 animate-slide-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white rounded-lg hover:bg-[#2a2a4e] smooth-transition"
          title="Close (ESC)"
        >
          ✕
        </button>

        {/* Star Badge */}
        {skrumpey.hasStar && (
          <div className="absolute -top-3 -right-3 text-3xl animate-pixel-pulse animate-star-rotate z-20">
            ⭐
          </div>
        )}

        {/* Large NFT Image */}
        <div className={`w-full aspect-square rounded-lg mb-4 overflow-hidden relative ${
          skrumpey.hasStar 
            ? 'bg-gradient-to-br from-[#9966ff]/30 to-[#ffd700]/30 border-2 border-[#ffd700] shadow-[0_0_30px_rgba(255,215,0,0.4)]' 
            : 'bg-[#0a0a15] border-2 border-[#2a2a4e]'
        }`}>
          {/* Placeholder */}
          {(!imageLoaded || imageError) && (
            <div className="absolute inset-0 flex items-center justify-center text-8xl">
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
        <div className="space-y-3">
          {/* Name and ID */}
          <div className="text-center">
            <h3 className={`text-xl font-bold tracking-wide mb-1 ${
              skrumpey.hasStar ? 'text-[#ffd700] animate-glow-pulse' : 'text-white'
            }`}>
              {skrumpey.name}
            </h3>
            <p className="text-gray-500 text-xs">Token ID: #{skrumpey.id}</p>
          </div>

          {/* Rarity / Star Variant */}
          <div className="flex justify-center">
            <div 
              className={`px-4 py-2 rounded-lg text-sm font-bold border-2 ${
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
            <div className="bg-[#0a0a15] rounded-lg p-3 border border-[#2a2a4e]">
              <p className="text-[#ffd700] text-xs text-center mb-2">✦ STAR SKRUMPEY ✦</p>
              <p className="text-gray-400 text-[10px] text-center leading-relaxed">
                This Skrumpey holds the power of the {skrumpey.starVariant?.toUpperCase() || 'UNKNOWN'} constellation, 
                granting exclusive access to the Star World Order DAO.
              </p>
            </div>
          )}

          {/* Stats Placeholder */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#2a2a4e]">
            <div className="text-center">
              <p className="text-[#9966ff] text-sm">LVL</p>
              <p className="text-white text-xs">1</p>
            </div>
            <div className="text-center border-x border-[#2a2a4e]">
              <p className="text-[#44ff88] text-sm">XP</p>
              <p className="text-white text-xs">0</p>
            </div>
            <div className="text-center">
              <p className="text-[#ff6ec7] text-sm">RANK</p>
              <p className="text-white text-xs">—</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Profile Avatar Component with fallback
 */
function ProfileAvatar({ tokenId }: { tokenId: number }) {
  const [imageError, setImageError] = useState(false);
  const [useGif, setUseGif] = useState(false);
  const imageUrl = getSkrumpeyImageUrl(tokenId, useGif);

  const handleImageError = () => {
    if (!useGif) {
      // Try GIF on first error (for galaxy background NFTs)
      setUseGif(true);
    } else {
      // Show placeholder after trying both extensions
      setImageError(true);
    }
  };

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
        onError={handleImageError}
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
  const [useGif, setUseGif] = useState(false);
  const imageUrl = getSkrumpeyImageUrl(tokenId, useGif);

  const handleImageError = () => {
    if (!useGif) {
      // Reset load state and try GIF (for galaxy background NFTs)
      setImageLoaded(false);
      setUseGif(true);
    } else {
      // Show placeholder after trying both extensions
      setImageError(true);
    }
  };

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
          onError={handleImageError}
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
  const { isDemoMode } = useDemoMode();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [selectedSkrumpey, setSelectedSkrumpey] = useState<SkrumpeyDisplayData | null>(null);
  const [tokenMetadata, setTokenMetadata] = useState<Record<number, { constellation?: StarTraitVariant }>>({});
  const [selectedBadges, setSelectedBadges] = useState<string[]>([]);
  const [isEditingBadges, setIsEditingBadges] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  
  // Tab navigation state - includes all sections
  const [activeSection, setActiveSection] = useState<'settings' | 'friends' | 'messages' | 'collection' | 'achievements' | 'quests' | 'raffles'>('settings');
  
  // Friends system state
  const [friends, setFriends] = useState<FriendWithProfileData[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendWithProfileData[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  
  // Messaging system state
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<DirectMessageData[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  
  // All notifications state
  const [allNotifications, setAllNotifications] = useState<NotificationData[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  
  // Quest system state
  const [quests, setQuests] = useState<QuestWithProgress[]>([]);
  const [userXP, setUserXP] = useState<UserXPData | null>(null);
  const [isLoadingQuests, setIsLoadingQuests] = useState(false);
  const [questClaimingId, setQuestClaimingId] = useState<string | null>(null);
  
  // Raffle history state
  const [raffleHistory, setRaffleHistory] = useState<RaffleHistoryEntry[]>([]);
  const [isLoadingRaffles, setIsLoadingRaffles] = useState(false);
  const [unviewedWonCount, setUnviewedWonCount] = useState(0); // Count of unviewed won raffles from API
  
  // Close modal handler
  const closeModal = useCallback(() => {
    setSelectedSkrumpey(null);
  }, []);
  
  // Fetch friends data
  const fetchFriends = useCallback(async () => {
    if (!address) return;
    
    setIsLoadingFriends(true);
    try {
      const [friendsRes, pendingRes] = await Promise.all([
        fetch(`/api/friends?address=${address}&type=all`),
        fetch(`/api/friends?address=${address}&type=pending`),
      ]);
      
      const friendsData = await friendsRes.json();
      const pendingData = await pendingRes.json();
      
      if (friendsData.success) {
        setFriends(friendsData.friends || []);
      }
      if (pendingData.success) {
        setPendingRequests(pendingData.pending || []);
      }
    } catch (error) {
      console.error('Failed to fetch friends:', error);
    } finally {
      setIsLoadingFriends(false);
    }
  }, [address]);
  
  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!address) return;
    
    setIsLoadingMessages(true);
    try {
      const response = await fetch(`/api/messages?address=${address}&type=conversations`);
      const data = await response.json();
      
      if (data.success) {
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [address]);
  
  // Fetch chat messages for selected conversation
  const fetchChatMessages = useCallback(async (otherAddress: string) => {
    if (!address) return;
    
    setIsLoadingMessages(true);
    try {
      const response = await fetch(`/api/messages?address=${address}&type=conversation&otherAddress=${otherAddress}`);
      const data = await response.json();
      
      if (data.success) {
        setChatMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Failed to fetch chat messages:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [address]);
  
  // Fetch all notifications
  const fetchAllNotifications = useCallback(async () => {
    if (!address) return;
    
    setIsLoadingNotifications(true);
    try {
      const response = await fetch(`/api/notifications?address=${address}&limit=50`);
      const data = await response.json();
      
      if (data.success) {
        setAllNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [address]);
  
  // Fetch quests and user XP
  const fetchQuestsAndXP = useCallback(async () => {
    if (!address) return;
    
    setIsLoadingQuests(true);
    try {
      const response = await fetch(`/api/quests?address=${address}`);
      const data = await response.json();
      
      if (data.success) {
        setQuests(data.quests || []);
        setUserXP(data.userXP || null);
      }
    } catch (error) {
      console.error('Failed to fetch quests:', error);
    } finally {
      setIsLoadingQuests(false);
    }
  }, [address]);
  
  // Fetch raffle history
  const fetchRaffleHistory = useCallback(async () => {
    if (!address) return;
    
    setIsLoadingRaffles(true);
    try {
      const response = await fetch(`/api/raffle?type=history&address=${address}`);
      const data = await response.json();
      
      if (data.success) {
        setRaffleHistory(data.entries || []);
        setUnviewedWonCount(data.unviewedWonCount || 0);
      }
    } catch (error) {
      console.error('Failed to fetch raffle history:', error);
    } finally {
      setIsLoadingRaffles(false);
    }
  }, [address]);

  // Mark all won raffles as viewed
  const markRafflesAsViewed = useCallback(async () => {
    if (!address) return;
    
    // Mark each unviewed won raffle as viewed
    const unviewedWonRaffles = raffleHistory.filter(r => r.won && !r.hasViewed);
    
    if (unviewedWonRaffles.length === 0) return;
    
    // Use Promise.allSettled to make concurrent requests
    await Promise.allSettled(
      unviewedWonRaffles.map(entry =>
        fetch('/api/raffle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'markViewed',
            walletAddress: address,
            raffleId: entry.raffle_id,
          }),
        })
      )
    );
    
    // Reset the count locally after marking
    setUnviewedWonCount(0);
  }, [address, raffleHistory]);
  
  // Fetch raffle history on mount to show badge in tab navigation
  useEffect(() => {
    if (address) {
      fetchRaffleHistory();
    }
  }, [address, fetchRaffleHistory]);
  
  // Load data when section changes
  useEffect(() => {
    if (!address) return;
    
    switch (activeSection) {
      case 'quests':
        fetchQuestsAndXP();
        break;
      case 'friends':
        fetchFriends();
        break;
      case 'messages':
        fetchConversations();
        fetchAllNotifications();
        break;
      case 'raffles':
        fetchRaffleHistory();
        // Mark won raffles as viewed when user clicks on raffles tab
        markRafflesAsViewed();
        break;
    }
  }, [activeSection, address, fetchQuestsAndXP, fetchFriends, fetchConversations, fetchAllNotifications, fetchRaffleHistory, markRafflesAsViewed]);
  
  // Load chat when selected
  useEffect(() => {
    if (selectedChat && address) {
      fetchChatMessages(selectedChat);
    }
  }, [selectedChat, address, fetchChatMessages]);
  
  // Check URL params for tab and chat selection
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      const chat = params.get('chat');
      
      if (tab === 'settings' || tab === 'friends' || tab === 'messages' || tab === 'collection' || tab === 'achievements' || tab === 'quests' || tab === 'raffles') {
        setActiveSection(tab);
      }
      if (chat) {
        setSelectedChat(chat);
        setActiveSection('messages');
      }
    }
  }, []);
  
  // Handle sending a message
  const handleSendMessage = async () => {
    if (!address || !selectedChat || !newMessage.trim() || isSendingMessage) return;
    
    setIsSendingMessage(true);
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderAddress: address,
          recipientAddress: selectedChat,
          message: newMessage.trim(),
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        setNewMessage('');
        // Refresh messages
        await fetchChatMessages(selectedChat);
        await fetchConversations();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSendingMessage(false);
    }
  };
  
  // Handle friend request action
  const handleFriendAction = async (targetAddress: string, action: string) => {
    if (!address) return;
    
    try {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          targetAddress,
          action,
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        // Refresh friends list
        await fetchFriends();
      }
    } catch (error) {
      console.error('Failed to process friend action:', error);
    }
  };
  
  // Claim quest reward handler
  const handleClaimQuest = async (questId: string) => {
    if (!address || questClaimingId) return;
    
    setQuestClaimingId(questId);
    try {
      const response = await fetch('/api/quests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          questId,
          action: 'claim',
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        // Update user XP
        setUserXP(data.userXP);
        // Refresh quests to update status
        await fetchQuestsAndXP();
      }
    } catch (error) {
      console.error('Failed to claim quest:', error);
    } finally {
      setQuestClaimingId(null);
    }
  };
  
  // Complete quest handler (for quests that can be auto-completed)
  const handleCompleteQuest = async (questId: string) => {
    if (!address) return;
    
    try {
      const response = await fetch('/api/quests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          questId,
          action: 'complete',
        }),
      });
      
      const data = await response.json();
      if (data.success) {
        await fetchQuestsAndXP();
      }
    } catch (error) {
      console.error('Failed to complete quest:', error);
    }
  };

  // Fetch metadata for owned tokens to get real constellation data
  useEffect(() => {
    if (starSkrumpeys.length > 0) {
      const tokenIds = starSkrumpeys.map(t => t.tokenId).join(',');
      fetch(`/api/metadata?tokenIds=${tokenIds}`)
        .then(res => {
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }
          return res.json();
        })
        .then(data => {
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
    }
  }, [starSkrumpeys]);

  // Load profile on mount
  useEffect(() => {
    if (address) {
      fetch(`/api/profile?address=${address}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.profile) {
            setDisplayName(data.profile.display_name || '');
            setBio(data.profile.bio || '');
            // Load displayed badges from database
            if (data.profile.displayed_badges) {
              try {
                const badges = JSON.parse(data.profile.displayed_badges);
                if (Array.isArray(badges)) {
                  setSelectedBadges(badges);
                }
              } catch (e) {
                console.error('Failed to parse displayed badges:', e);
              }
            }
          }
        })
        .catch(console.error);
    }
  }, [address]);

  const handleSaveProfile = async () => {
    if (!address) return;
    
    // Prevent profile updates in demo mode
    if (isDemoMode) {
      setProfileError('Profile updates are disabled in Demo Mode. Connect your wallet to save changes.');
      return;
    }
    
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
          isDemoMode: false, // Explicitly indicate this is not a demo mode request
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

  // Save displayed badges to profile
  const handleSaveBadges = async () => {
    if (!address) return;
    
    // Prevent badge updates in demo mode
    if (isDemoMode) {
      // Silently revert to editing mode - user shouldn't be able to save in demo
      return;
    }
    
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          displayedBadges: selectedBadges,
          isDemoMode: false, // Explicitly indicate this is not a demo mode request
        }),
      });
      
      if (response.ok) {
        setIsEditingBadges(false);
      }
    } catch (error) {
      console.error('Failed to save badges:', error);
    }
  };

  if (!isConnected) {
    return null;
  }

  // Get color for star variant (solid color for CSS color property)
  // Rare traits (monflare, auracore, parallel, prime) have special distinct colors
  const getVariantColor = (variant?: string): string => {
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
  };

  // Get variant gradient for background
  // Rare traits have special gradients to make them stand out
  const getVariantGradient = (variant?: string): string => {
    const gradients: Record<string, string> = {
      spectra: 'linear-gradient(90deg, #40E0D0, #87CEEB, #9966ff, #ffd700)',
      chroma: 'linear-gradient(180deg, #DDA0DD, #9966ff)',
      // Rare trait gradients
      monflare: 'linear-gradient(135deg, #9933FF, #BF5FFF, #E066FF)', // Purple glow gradient
      auracore: 'linear-gradient(135deg, #FF8C00, #FFB347, #FFD700)', // Golden glow gradient
      parallel: 'linear-gradient(90deg, #20B2AA, #00CED1, #4169E1)', // Blue-green to blue gradient
      prime: 'linear-gradient(135deg, #FFD700, #FFF8DC, #FFD700, #DAA520)', // Legendary gold shimmer
    };
    return gradients[variant || ''] || getVariantColor(variant);
  };

  // Check if variant has a gradient (including rare traits)
  const isGradientVariant = (variant?: string): boolean => {
    return variant === 'spectra' || variant === 'chroma' || 
           variant === 'parallel' || variant === 'monflare' || 
           variant === 'auracore' || variant === 'prime';
  };

  // Check if variant is a rare trait (for special styling)
  const isRareVariant = (variant?: string): boolean => {
    return variant === 'monflare' || variant === 'auracore' || 
           variant === 'parallel' || variant === 'prime';
  };

  // Get text style for variant - handles both solid colors and gradients
  // Rare variants get gradient text with glow effects
  const getVariantTextStyle = (variant?: string): React.CSSProperties => {
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
  };

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
        <div className="grid grid-cols-3 gap-2 border-t-2 border-[#2a2a4e] pt-3 sm:pt-4">
          <div className="text-center smooth-transition hover-lift animate-slide-in-up animate-delay-1">
            <p className="text-[#ffd700] text-base sm:text-lg">{starSkrumpeys.length}</p>
            <p className="text-gray-500 text-[9px] sm:text-xs tracking-wide leading-tight">STAR SKRUMPEYS</p>
          </div>
          <div className="text-center border-x-2 border-[#2a2a4e] smooth-transition hover-lift animate-slide-in-up animate-delay-2">
            <p style={{ color: getLevelColor(starSkrumpeys.length) }} className="text-base sm:text-lg">
              LVL {userXP?.level ?? calculateLevel(starSkrumpeys.length)}
            </p>
            <p className="text-gray-500 text-[9px] sm:text-xs tracking-wide leading-tight">LEVEL</p>
          </div>
          <div className="text-center flex flex-col justify-center smooth-transition hover-lift animate-slide-in-up animate-delay-3">
            <p className="text-[#44ff88] text-[10px] sm:text-xs font-bold leading-tight">
              {userXP?.total_xp ?? 0} XP
            </p>
            <p className="text-gray-500 text-[9px] sm:text-xs tracking-wide">EXPERIENCE</p>
          </div>
        </div>
        
        {/* XP Progress Bar */}
        {userXP && (
          <div className="mt-3 pt-3 border-t-2 border-[#2a2a4e]">
            <div className="flex justify-between items-center mb-1">
              <span className="text-gray-400 text-[9px]">XP PROGRESS</span>
              <span className="text-[#44ff88] text-[9px]">
                {userXP.currentLevelXP} / {userXP.requiredForNextLevel} XP
              </span>
            </div>
            <div className="h-2 bg-[#1a1a2e] rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#44ff88] to-[#00ffff] rounded-full transition-all duration-500"
                style={{ 
                  width: `${userXP.percentage}%`,
                  boxShadow: '0 0 10px #44ff8880',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Section Tab Navigation */}
      <div className="flex gap-2 justify-center flex-wrap animate-slide-in-up">
        {(['settings', 'friends', 'messages', 'collection', 'achievements', 'quests', 'raffles'] as const).map((section) => {
          const isActive = activeSection === section;
          const icons: Record<string, string> = { 
            settings: '⚙️', 
            friends: '👥', 
            messages: '💬',
            collection: '🎨', 
            achievements: '🏆', 
            quests: '📜',
            raffles: '🎰'
          };
          const labels: Record<string, string> = { 
            settings: 'Settings', 
            friends: 'Friends',
            messages: 'Messages',
            collection: 'Collection', 
            achievements: 'Achievements', 
            quests: 'Quests',
            raffles: 'Raffles'
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
              className={`px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold border-2 smooth-transition relative ${
                isActive
                  ? 'bg-[#ffd700]/20 border-[#ffd700] text-[#ffd700]'
                  : 'bg-[#1a1a2e] border-[#2a2a4e] text-gray-400 hover:border-[#ffd700]/50 hover:text-[#ffd700]/70'
              }`}
            >
              {icons[section]} {labels[section]}
              {badge && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold text-white bg-[#ff4466] rounded-full px-1">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Settings Section */}
      {activeSection === 'settings' && (
        <>
          {/* Profile Edit Box */}
          <div className="pixel-card p-6 animate-slide-in-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#9966ff] text-sm tracking-wider">
                PROFILE SETTINGS
              </h3>
              {!isEditingProfile && (
                <button
                  onClick={() => setIsEditingProfile(true)}
                  disabled={isDemoMode}
                  className="pixel-btn text-[10px] !px-3 !py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={isDemoMode ? 'Editing disabled in Demo Mode' : 'Edit profile'}
                >
                  {isDemoMode ? '🔒 EDIT' : 'EDIT'}
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
            
            {/* Social Connections - Inside Profile Settings */}
            <div className="pt-4 mt-4 border-t border-[#2a2a4e]">
              <p className="text-gray-500 text-[9px] mb-3">Social Connections</p>
              <SocialConnect />
            </div>
          </div>
        )}
      </div>
      
      {/* Notification Settings */}
      <NotificationSettingsCard walletAddress={address || ''} isDemoMode={isDemoMode} />
        </>
      )}

      {/* Friends Section */}
      {activeSection === 'friends' && (
        <>
          {/* Pending Friend Requests */}
          {pendingRequests.length > 0 && (
            <div className="pixel-card p-4 animate-slide-in-up border-2 border-[#ff6ec7]">
              <h3 className="text-[#ff6ec7] text-sm tracking-wider mb-3 flex items-center gap-2">
                👋 PENDING REQUESTS ({pendingRequests.length})
              </h3>
              <div className="space-y-2">
                {pendingRequests.map((request) => (
                  <div 
                    key={request.id}
                    className="flex items-center justify-between p-3 bg-[#0a0a15] rounded-lg border border-[#2a2a4e]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#2a2a4e] flex items-center justify-center text-lg">
                        🐸
                      </div>
                      <div>
                        <p className="text-white text-xs font-bold">
                          {request.display_name || `${request.user_address.slice(0, 6)}...${request.user_address.slice(-4)}`}
                        </p>
                        <p className="text-gray-500 text-[9px]">Wants to be your friend</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleFriendAction(request.user_address, 'accept')}
                        className="pixel-btn pixel-btn-gold text-[9px] !px-3 !py-1"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => handleFriendAction(request.user_address, 'decline')}
                        className="pixel-btn text-[9px] !px-3 !py-1"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Friends List */}
          <div className="pixel-card p-4 animate-slide-in-up">
            <h3 className="text-[#00ffff] text-sm tracking-wider mb-4 flex items-center gap-2">
              👥 SWO FRIENDS ({friends.length})
            </h3>
            
            {isLoadingFriends ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-2xl animate-spin">⭐</span>
              </div>
            ) : friends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4">
                <span className="text-4xl mb-2 opacity-50">👥</span>
                <p className="text-gray-500 text-xs text-center">No friends yet</p>
                <p className="text-gray-600 text-[10px] text-center mt-1">
                  Visit the Members page to send friend requests
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {friends.map((friend) => {
                  const friendAddress = friend.user_address === address?.toLowerCase() 
                    ? friend.friend_address 
                    : friend.user_address;
                  const friendName = friend.display_name || `${friendAddress.slice(0, 6)}...${friendAddress.slice(-4)}`;
                  
                  return (
                    <div 
                      key={friend.id}
                      className="flex items-center justify-between p-3 bg-[#0a0a15] rounded-lg border border-[#2a2a4e] hover:border-[#00ffff]/50 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#2a2a4e] flex items-center justify-center text-lg">
                          🐸
                        </div>
                        <div>
                          <p className="text-white text-xs font-bold">{friendName}</p>
                          <p className="text-gray-500 text-[9px] font-mono">{friendAddress.slice(0, 10)}...</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedChat(friendAddress);
                            setActiveSection('messages');
                          }}
                          className="pixel-btn text-[9px] !px-3 !py-1"
                          title="Send Message"
                        >
                          💬
                        </button>
                        <button
                          onClick={() => handleFriendAction(friendAddress, 'remove')}
                          className="pixel-btn text-[9px] !px-3 !py-1 opacity-50 hover:opacity-100"
                          title="Remove Friend"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Messages Section */}
      {activeSection === 'messages' && (
        <>
          {/* Messages Container */}
          <div className="pixel-card p-4 animate-slide-in-up">
            <h3 className="text-[#00ffff] text-sm tracking-wider mb-4 flex items-center gap-2">
              💬 MESSAGES
            </h3>
            
            <div className="flex flex-col sm:flex-row gap-4 min-h-[400px]">
              {/* Conversations List */}
              <div className="w-full sm:w-1/3 border-b sm:border-b-0 sm:border-r border-[#2a2a4e] pb-4 sm:pb-0 sm:pr-4">
                <p className="text-gray-500 text-[9px] mb-2">CONVERSATIONS</p>
                {isLoadingMessages ? (
                  <div className="flex items-center justify-center py-8">
                    <span className="text-xl animate-spin">⭐</span>
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="text-center py-8">
                    <span className="text-2xl opacity-50">💬</span>
                    <p className="text-gray-500 text-[10px] mt-2">No conversations</p>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {conversations.map((convo) => {
                      const isSelected = selectedChat === convo.other_address;
                      const displayName = convo.other_display_name || `${convo.other_address.slice(0, 6)}...`;
                      
                      return (
                        <button
                          key={convo.other_address}
                          onClick={() => setSelectedChat(convo.other_address)}
                          className={`w-full text-left p-2 rounded transition-all ${
                            isSelected 
                              ? 'bg-[#00ffff]/20 border border-[#00ffff]' 
                              : 'hover:bg-[#1a1a2e]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[#2a2a4e] flex items-center justify-center text-sm">
                              🐸
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className={`text-[10px] font-bold truncate ${isSelected ? 'text-[#00ffff]' : 'text-white'}`}>
                                  {displayName}
                                </p>
                                {convo.unread_count > 0 && (
                                  <span className="min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold text-white bg-[#00ffff] rounded-full px-1">
                                    {convo.unread_count}
                                  </span>
                                )}
                              </div>
                              <p className="text-gray-500 text-[9px] truncate">
                                {convo.is_sender && 'You: '}{convo.last_message}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Chat Area */}
              <div className="flex-1 flex flex-col">
                {selectedChat ? (
                  <>
                    {/* Chat Header */}
                    <div className="pb-3 mb-3 border-b border-[#2a2a4e]">
                      <p className="text-white text-xs font-bold">
                        {conversations.find(c => c.other_address === selectedChat)?.other_display_name || 
                         `${selectedChat.slice(0, 6)}...${selectedChat.slice(-4)}`}
                      </p>
                      <p className="text-gray-500 text-[9px] font-mono">{selectedChat}</p>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto space-y-2 max-h-[300px] mb-3">
                      {chatMessages.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-gray-500 text-[10px]">Start the conversation!</p>
                        </div>
                      ) : (
                        chatMessages.map((msg) => {
                          const isSent = msg.sender_address === address?.toLowerCase();
                          return (
                            <div 
                              key={msg.id}
                              className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}
                            >
                              <div 
                                className={`max-w-[80%] p-2 rounded-lg ${
                                  isSent 
                                    ? 'bg-[#00ffff]/20 border border-[#00ffff]/50' 
                                    : 'bg-[#2a2a4e]'
                                }`}
                              >
                                <p className="text-white text-[10px] break-words">{msg.message}</p>
                                <p className="text-gray-500 text-[8px] mt-1">
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Message Input */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                        placeholder="Type a message..."
                        maxLength={2000}
                        className="flex-1 bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-3 py-2 text-white text-[10px] focus:border-[#00ffff] focus:outline-none"
                        disabled={isSendingMessage}
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim() || isSendingMessage}
                        className="pixel-btn text-[10px] !px-4 disabled:opacity-50"
                      >
                        {isSendingMessage ? '...' : '→'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <span className="text-4xl opacity-50">💬</span>
                    <p className="text-gray-500 text-xs mt-2">Select a conversation</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* All Notifications */}
          <div className="pixel-card p-4 animate-slide-in-up">
            <h3 className="text-[#ffd700] text-sm tracking-wider mb-4 flex items-center gap-2">
              🔔 ALL NOTIFICATIONS
            </h3>
            
            {isLoadingNotifications ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-2xl animate-spin">⭐</span>
              </div>
            ) : allNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4">
                <span className="text-4xl mb-2 opacity-50">🔔</span>
                <p className="text-gray-500 text-xs text-center">No notifications yet</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {allNotifications.map((notification) => {
                  const isUnread = notification.is_read === 0;
                  const typeColors: Record<string, string> = {
                    quest: '#ffd700',
                    achievement: '#ff6ec7',
                    system: '#00ffff',
                    social: '#9966ff',
                    governance: '#44ff88',
                  };
                  const color = typeColors[notification.type] || '#ffd700';
                  
                  return (
                    <div
                      key={notification.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                        isUnread 
                          ? 'bg-[#1a1a2e]/50 border-[#2a2a4e]' 
                          : 'bg-[#0a0a15] border-[#1a1a2e] opacity-60'
                      }`}
                    >
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                        style={{ 
                          backgroundColor: `${color}20`,
                          border: `1px solid ${color}40`,
                        }}
                      >
                        {notification.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className={`text-xs font-bold truncate ${isUnread ? 'text-white' : 'text-gray-400'}`}>
                            {notification.title}
                          </h4>
                          {isUnread && (
                            <span 
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: color }}
                            />
                          )}
                        </div>
                        <p className="text-gray-400 text-[10px] line-clamp-2 mt-0.5">
                          {notification.message}
                        </p>
                        <p className="text-gray-600 text-[9px] mt-1">
                          {new Date(notification.created_at).toLocaleDateString()} at{' '}
                          {new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* My Collection Section */}
      {activeSection === 'collection' && (
        <>
          {/* Star Trait Legend - Collection Section */}
          {starSkrumpeys.length > 0 && (
            <div className="pixel-card p-4 animate-slide-in-up">
              <h3 className="text-[#ffd700] text-sm tracking-wider mb-3 text-center animate-glow-pulse">
                STAR CONSTELLATIONS
              </h3>
              <div className="flex flex-wrap justify-center gap-2">
                {STAR_TRAIT_VARIANTS.map((variant, index) => {
                  // Use displaySkrumpeys which has the correct fetched IPFS metadata
                  const hasVariant = displaySkrumpeys.some(s => s.hasStar && s.starVariant === variant);
                  return (
                    <div 
                      key={variant}
                      className={`px-2 py-1 rounded text-xs border smooth-transition hover-lift ${
                        hasVariant 
                          ? 'border-[#ffd700] bg-[#ffd700]/20' 
                          : 'border-[#2a2a4e] bg-[#1a1a2e] opacity-40'
                      }`}
                      style={{ 
                        ...(hasVariant ? getVariantTextStyle(variant) : { color: '#666' }),
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

          {/* Demo Data Notice - Collection Section */}
          {showDemoData && (
            <div className="text-center">
              <p className="text-gray-500 text-xs bg-[#1a1a2e] inline-block px-3 py-1 rounded border border-[#2a2a4e]">
                📋 Showing demo data - Connect wallet with Skrumpeys to see your collection
              </p>
            </div>
          )}

          {/* NFT Collection Grid */}
          <div className="pixel-card p-4 sm:p-6 animate-slide-in-up">
            <h3 className="text-[#ffd700] text-xs sm:text-sm tracking-wider mb-3 sm:mb-4 text-center animate-glow-pulse">
              YOUR COLLECTION
            </h3>
            <p className="text-gray-500 text-[8px] text-center mb-3 sm:mb-4">
              Click on a Skrumpey to inspect
            </p>
            
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4">
              {finalDisplaySkrumpeys.map((nft, index) => (
                <div 
                  key={nft.id}
                  onClick={() => setSelectedSkrumpey(nft)}
                  className={`relative p-3 sm:p-4 rounded-lg border-2 smooth-transition hover:scale-105 cursor-pointer animate-slide-in-up animate-delay-${(index % 6) + 1} min-h-[44px] ${
                    nft.hasStar 
                      ? 'border-[#ffd700] bg-gradient-to-br from-[#1a1a2e] to-[#2a1a4a] shadow-[0_0_20px_rgba(255,215,0,0.3)] hover:shadow-[0_0_30px_rgba(255,215,0,0.5)]' 
                      : 'border-[#2a2a4e] bg-[#1a1a2e] hover:border-[#3a3a5e]'
                  }`}
                >
                  {/* Star badge */}
                  {nft.hasStar && (
                    <div className="absolute -top-2 -right-2 text-lg sm:text-xl animate-pixel-pulse animate-star-rotate z-10">
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
                  <p className={`text-[9px] sm:text-[10px] font-bold tracking-wide truncate ${
                    nft.hasStar ? 'text-[#ffd700]' : 'text-gray-300'
                  }`}>
                    {nft.name}
                  </p>
                  <p className="text-[10px] sm:text-xs truncate">
                    <span style={getVariantTextStyle(nft.starVariant)}>
                      {nft.rarity}
                    </span>
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
        </>
      )}

      {/* Achievements Section */}
      {activeSection === 'achievements' && (
        <>
          {/* Achievement Badges */}
          <div className="pixel-card p-6 animate-slide-in-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[#9966ff] text-sm tracking-wider">
            ACHIEVEMENTS ({unlockedAchievements.length}/{ACHIEVEMENTS.length})
          </h3>
          {unlockedAchievements.length > 0 && (
            <button
              onClick={() => {
                if (isEditingBadges) {
                  handleSaveBadges();
                } else {
                  setIsEditingBadges(true);
                }
              }}
              disabled={isDemoMode}
              className="pixel-btn text-[10px] !px-3 !py-1 disabled:opacity-50 disabled:cursor-not-allowed"
              title={isDemoMode ? 'Badge editing disabled in Demo Mode' : undefined}
            >
              {getBadgeButtonText()}
            </button>
          )}
        </div>
        
        {/* Selected Badges Display */}
        {selectedBadges.length > 0 && !isEditingBadges && (
          <div className="mb-4 p-3 bg-[#0a0a15] rounded-lg border border-[#ffd700]/30">
            <p className="text-[#ffd700] text-[9px] mb-2 text-center">DISPLAYED BADGES</p>
            <div className="flex justify-center gap-3">
              {selectedBadges.map(badgeId => {
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
                      {badge.name.split(' ')[0]}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* All Achievements Grid */}
        <div className="grid grid-cols-4 gap-3">
          {ACHIEVEMENTS.map((achievement) => {
            const isUnlocked = unlockedAchievements.some(a => a.id === achievement.id);
            const isSelected = selectedBadges.includes(achievement.id);
            
            const handleClick = () => {
              if (isEditingBadges && isUnlocked) {
                toggleBadge(achievement.id);
              } else {
                setSelectedAchievement(achievement);
              }
            };
            
            return (
              <div 
                key={achievement.id}
                onClick={handleClick}
                className={`flex flex-col items-center p-2 rounded-lg cursor-pointer group ${
                  isSelected && isEditingBadges ? 'bg-[#2a2a4e] ring-2 ring-[#ffd700]' : ''
                }`}
                style={{
                  transition: 'all 0.3s ease',
                }}
              >
                <div 
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-xl border-2 ${
                    isUnlocked 
                      ? 'group-hover:scale-110 group-hover:border-[3px]' 
                      : 'opacity-30 grayscale'
                  }`}
                  style={{ 
                    backgroundColor: isUnlocked ? `${achievement.color}20` : '#333',
                    borderColor: isUnlocked ? achievement.color : '#444',
                    boxShadow: isUnlocked ? `0 0 10px ${achievement.color}40` : 'none',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {isUnlocked ? achievement.icon : '🔒'}
                </div>
                <p 
                  className={`text-[8px] mt-1 text-center leading-tight ${isUnlocked ? 'group-hover:font-bold' : ''}`}
                  style={{ 
                    color: isUnlocked ? achievement.color : '#666',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {achievement.name}
                </p>
              </div>
            );
          })}
        </div>
        
        {/* Helper text */}
        {isEditingBadges ? (
          <p className="text-gray-500 text-[9px] text-center mt-3">
            Click on unlocked badges to select up to 3 for display
          </p>
        ) : (
          <p className="text-gray-500 text-[9px] text-center mt-3">
            Click on any badge to view details
          </p>
        )}
        
        {/* Gotta Catch Em All Progress - Show when user has at least one Star Skrumpey */}
        {starSkrumpeys.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#2a2a4e]">
            <p className="text-[#ff6ec7] text-[9px] mb-2 text-center">
              CONSTELLATION PROGRESS ({uniqueConstellations.filter(c => c !== 'prime').length}/{COLLECTIBLE_CONSTELLATIONS.length})
            </p>
            <div className="flex flex-wrap justify-center gap-1">
              {COLLECTIBLE_CONSTELLATIONS.map(constellation => {
                const hasIt = uniqueConstellations.includes(constellation);
                return (
                  <span 
                    key={constellation}
                    className={`text-[8px] px-2 py-1 rounded border ${
                      hasIt 
                        ? 'border-[#44ff88] bg-[#44ff88]/20 text-[#44ff88]' 
                        : 'border-[#333] bg-[#1a1a2e] text-[#666]'
                    }`}
                  >
                    {constellation.toUpperCase()}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Achievement Detail Modal */}
      {selectedAchievement && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setSelectedAchievement(null)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          
          {/* Modal Content */}
          <div 
            className="relative z-10 w-full max-w-xs pixel-card p-6 animate-slide-in-up text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setSelectedAchievement(null)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white rounded-lg hover:bg-[#2a2a4e] smooth-transition"
            >
              ✕
            </button>
            
            {(() => {
              const isUnlocked = unlockedAchievements.some(a => a.id === selectedAchievement.id);
              return (
                <>
                  {/* Achievement Icon */}
                  <div 
                    className="w-20 h-20 mx-auto rounded-full flex items-center justify-center text-4xl border-3 mb-4 animate-pixel-pulse"
                    style={{ 
                      backgroundColor: `${selectedAchievement.color}20`,
                      borderColor: selectedAchievement.color,
                      boxShadow: `0 0 30px ${selectedAchievement.color}60`,
                    }}
                  >
                    {isUnlocked ? selectedAchievement.icon : '🔒'}
                  </div>
                  
                  {/* Achievement Name */}
                  <h3 
                    className="text-lg font-bold mb-2"
                    style={{ color: selectedAchievement.color }}
                  >
                    {selectedAchievement.name}
                  </h3>
                  
                  {/* Achievement Description */}
                  <p className="text-gray-300 text-sm mb-4 leading-relaxed">
                    {selectedAchievement.description}
                  </p>
                  
                  {/* Status */}
                  <div 
                    className={`inline-block px-4 py-2 rounded-lg text-xs font-bold border-2 ${
                      isUnlocked ? '' : 'opacity-60'
                    }`}
                    style={{
                      backgroundColor: isUnlocked ? `${selectedAchievement.color}20` : '#1a1a2e',
                      borderColor: isUnlocked ? selectedAchievement.color : '#444',
                      color: isUnlocked ? selectedAchievement.color : '#666',
                    }}
                  >
                    {isUnlocked ? '✓ UNLOCKED' : '🔒 LOCKED'}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
        </>
      )}

      {/* Quests Section */}
      {activeSection === 'quests' && (
        <>
          {/* XP Overview Card */}
          <div className="pixel-card p-4 animate-slide-in-up">
            <h3 className="text-[#44ff88] text-sm tracking-wider mb-4 text-center">
              ⚡ EXPERIENCE POINTS
            </h3>
            
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center p-3 bg-[#0a0a15] rounded-lg border border-[#44ff88]/30">
                <p className="text-[#44ff88] text-xl font-bold">{userXP?.total_xp || 0}</p>
                <p className="text-gray-500 text-[10px]">TOTAL XP</p>
              </div>
              <div className="text-center p-3 bg-[#0a0a15] rounded-lg border border-[#ffd700]/30">
                <p className="text-[#ffd700] text-xl font-bold">{userXP?.level || 1}</p>
                <p className="text-gray-500 text-[10px]">LEVEL</p>
              </div>
              <div className="text-center p-3 bg-[#0a0a15] rounded-lg border border-[#9966ff]/30">
                <p className="text-[#9966ff] text-xl font-bold">
                  {quests.filter(q => q.userProgress?.status === 'claimed').length}
                </p>
                <p className="text-gray-500 text-[10px]">COMPLETED</p>
              </div>
            </div>
            
            {/* Level Progress */}
            {userXP && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-gray-400 text-[9px]">Level {userXP.level} → {userXP.level + 1}</span>
                  <span className="text-[#44ff88] text-[9px]">
                    {userXP.currentLevelXP} / {userXP.requiredForNextLevel} XP
                  </span>
                </div>
                <div className="h-3 bg-[#1a1a2e] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#44ff88] to-[#00ffff] rounded-full transition-all duration-500"
                    style={{ 
                      width: `${userXP.percentage}%`,
                      boxShadow: '0 0 10px #44ff8880',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Quest Lists by Type */}
          {isLoadingQuests ? (
            <div className="pixel-card p-8 text-center animate-slide-in-up">
              <div className="text-4xl mb-4 animate-spin">⭐</div>
              <p className="text-[#ffd700] text-xs">Loading quests...</p>
            </div>
          ) : (
            <>
              {/* Urgent Quests */}
              {quests.filter(q => q.quest_type === 'urgent').length > 0 && (
                <div className="pixel-card p-4 animate-slide-in-up border-2 border-[#ff6ec7]">
                  <h3 className="text-[#ff6ec7] text-sm tracking-wider mb-3 flex items-center gap-2">
                    🚨 URGENT QUESTS
                  </h3>
                  <div className="space-y-2">
                    {quests.filter(q => q.quest_type === 'urgent').map(quest => (
                      <QuestItem 
                        key={quest.id} 
                        quest={quest} 
                        onClaim={handleClaimQuest}
                        onComplete={handleCompleteQuest}
                        isClaiming={questClaimingId === quest.id}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* One-Time Quests */}
              {quests.filter(q => q.quest_type === 'one_time').length > 0 && (
                <div className="pixel-card p-4 animate-slide-in-up">
                  <h3 className="text-[#ffd700] text-sm tracking-wider mb-3 flex items-center gap-2">
                    ⭐ ONE-TIME QUESTS
                  </h3>
                  <div className="space-y-2">
                    {quests.filter(q => q.quest_type === 'one_time').map(quest => (
                      <QuestItem 
                        key={quest.id} 
                        quest={quest} 
                        onClaim={handleClaimQuest}
                        onComplete={handleCompleteQuest}
                        isClaiming={questClaimingId === quest.id}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Daily Quests */}
              {quests.filter(q => q.quest_type === 'daily').length > 0 && (
                <div className="pixel-card p-4 animate-slide-in-up">
                  <h3 className="text-[#00ffff] text-sm tracking-wider mb-3 flex items-center gap-2">
                    📅 DAILY QUESTS
                  </h3>
                  <div className="space-y-2">
                    {quests.filter(q => q.quest_type === 'daily').map(quest => (
                      <QuestItem 
                        key={quest.id} 
                        quest={quest} 
                        onClaim={handleClaimQuest}
                        onComplete={handleCompleteQuest}
                        isClaiming={questClaimingId === quest.id}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Weekly Quests */}
              {quests.filter(q => q.quest_type === 'weekly').length > 0 && (
                <div className="pixel-card p-4 animate-slide-in-up">
                  <h3 className="text-[#9966ff] text-sm tracking-wider mb-3 flex items-center gap-2">
                    📆 WEEKLY QUESTS
                  </h3>
                  <div className="space-y-2">
                    {quests.filter(q => q.quest_type === 'weekly').map(quest => (
                      <QuestItem 
                        key={quest.id} 
                        quest={quest} 
                        onClaim={handleClaimQuest}
                        onComplete={handleCompleteQuest}
                        isClaiming={questClaimingId === quest.id}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* No Quests State */}
              {quests.length === 0 && (
                <div className="pixel-card p-8 text-center animate-slide-in-up">
                  <div className="text-4xl mb-4">📜</div>
                  <p className="text-gray-400 text-sm">No quests available</p>
                  <p className="text-gray-500 text-xs mt-2">Check back later for new quests!</p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Raffle History Section */}
      {activeSection === 'raffles' && (
        <>
          {/* Raffle History Stats */}
          <div className="pixel-card p-4 animate-slide-in-up">
            <h3 className="text-[#ff6ec7] text-sm tracking-wider mb-4 text-center">
              🎰 RAFFLE HISTORY
            </h3>
            
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center p-3 bg-[#0a0a15] rounded-lg border border-[#9966ff]/30">
                <p className="text-[#9966ff] text-xl font-bold">{raffleHistory.length}</p>
                <p className="text-gray-500 text-[10px]">ENTERED</p>
              </div>
              <div className="text-center p-3 bg-[#0a0a15] rounded-lg border border-[#ffd700]/30">
                <p className="text-[#ffd700] text-xl font-bold">{raffleHistory.filter(r => r.won).length}</p>
                <p className="text-gray-500 text-[10px]">WON</p>
              </div>
              <div className="text-center p-3 bg-[#0a0a15] rounded-lg border border-[#44ff88]/30">
                <p className="text-[#44ff88] text-xl font-bold">
                  {raffleHistory.reduce((acc, r) => acc + r.entries_count, 0)}
                </p>
                <p className="text-gray-500 text-[10px]">TOTAL TICKETS</p>
              </div>
            </div>
          </div>

          {/* Raffle List */}
          {isLoadingRaffles ? (
            <div className="pixel-card p-8 text-center animate-slide-in-up">
              <div className="text-4xl mb-4 animate-spin">⭐</div>
              <p className="text-[#ffd700] text-xs">Loading raffle history...</p>
            </div>
          ) : raffleHistory.length === 0 ? (
            <div className="pixel-card p-8 text-center animate-slide-in-up">
              <div className="text-4xl mb-4">🎰</div>
              <p className="text-gray-400 text-sm">No raffle entries yet</p>
              <p className="text-gray-500 text-xs mt-2">Enter a raffle to see your history here!</p>
              <a href="/raffle" className="pixel-btn pixel-btn-gold text-xs mt-4 inline-block">
                VIEW RAFFLES
              </a>
            </div>
          ) : (
            <div className="space-y-3 animate-slide-in-up">
              {raffleHistory.map((entry) => {
                const isWinner = entry.won;
                const isActive = entry.raffle.status === 'active';
                const isDrawn = entry.raffle.status === 'drawn';
                const isEnded = new Date(entry.raffle.end_time) <= new Date();
                
                let statusColor = '#2a2a4e';
                let statusText = 'ENTERED';
                let statusBg = 'bg-[#2a2a4e]';
                
                if (isWinner) {
                  statusColor = '#ffd700';
                  statusText = '🏆 WON';
                  statusBg = 'bg-[#ffd700]/20';
                } else if (isDrawn) {
                  statusColor = '#ff4466';
                  statusText = 'NOT WON';
                  statusBg = 'bg-[#ff4466]/10';
                } else if (isActive && !isEnded) {
                  statusColor = '#44ff88';
                  statusText = 'ACTIVE';
                  statusBg = 'bg-[#44ff88]/20';
                } else if (isEnded && !isDrawn) {
                  statusColor = '#9966ff';
                  statusText = 'PENDING DRAW';
                  statusBg = 'bg-[#9966ff]/20';
                }
                
                return (
                  <div 
                    key={entry.id}
                    className={`pixel-card p-4 ${
                      isWinner 
                        ? 'border-2 border-[#ffd700] shadow-[0_0_20px_rgba(255,215,0,0.3)]' 
                        : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h4 className={`text-sm font-bold ${isWinner ? 'text-[#ffd700]' : 'text-white'}`}>
                          {entry.raffle.name}
                        </h4>
                        <p className="text-gray-400 text-[10px]">{entry.raffle.prize_description}</p>
                      </div>
                      <span 
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusBg}`}
                        style={{ color: statusColor }}
                      >
                        {statusText}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2 mb-3 text-center">
                      <div className="bg-[#0a0a15] rounded p-2">
                        <p className="text-[#00ffff] text-sm font-bold">{entry.entries_count}</p>
                        <p className="text-gray-600 text-[8px]">Tickets</p>
                      </div>
                      <div className="bg-[#0a0a15] rounded p-2">
                        <p className="text-[#9966ff] text-[10px] font-bold uppercase">{entry.tier.replace('_', ' ')}</p>
                        <p className="text-gray-600 text-[8px]">Tier</p>
                      </div>
                      <div className="bg-[#0a0a15] rounded p-2">
                        <p className="text-[#44ff88] text-sm font-bold">{entry.star_count}</p>
                        <p className="text-gray-600 text-[8px]">Stars</p>
                      </div>
                      <div className="bg-[#0a0a15] rounded p-2">
                        <p className="text-gray-300 text-[9px]">
                          {new Date(entry.entered_at).toLocaleDateString()}
                        </p>
                        <p className="text-gray-600 text-[8px]">Entered</p>
                      </div>
                    </div>
                    
                    {/* Bonuses */}
                    {/* Bonuses - only show Like & RT now */}
                    {entry.engagement_bonus > 0 && (
                      <div className="flex gap-2 mb-2">
                        <span className="text-[8px] px-1.5 py-0.5 bg-[#44ff88]/20 text-[#44ff88] rounded">
                          +{entry.engagement_bonus} Like & RT
                        </span>
                      </div>
                    )}
                    
                    {/* Winner Info for Won Raffles */}
                    {isWinner && entry.raffle.winner_drawn_at && (
                      <div className="bg-[#ffd700]/10 rounded p-2 mt-2 border border-[#ffd700]/30">
                        <p className="text-[#ffd700] text-[10px] text-center">
                          🎉 Congratulations! You won this raffle!
                        </p>
                        <p className="text-gray-500 text-[8px] text-center mt-1">
                          Drawn on {new Date(entry.raffle.winner_drawn_at).toLocaleString()}
                        </p>
                        <p className="text-gray-400 text-[8px] text-center mt-2 italic">
                          Prizes will be sent manually. If we need any info from you, we will reach out.
                        </p>
                      </div>
                    )}
                    
                    {/* Raffle End Info */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#2a2a4e]">
                      <p className="text-gray-500 text-[9px]">
                        {isEnded 
                          ? `Ended: ${new Date(entry.raffle.end_time).toLocaleDateString()}`
                          : `Ends: ${new Date(entry.raffle.end_time).toLocaleDateString()}`
                        }
                      </p>
                      {isActive && !isEnded && (
                        <a 
                          href="/raffle" 
                          className="text-[#00ffff] text-[9px] hover:underline"
                        >
                          View Raffle →
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Skrumpey Inspect Modal */}
      {selectedSkrumpey && (
        <SkrumpeyInspectModal
          skrumpey={selectedSkrumpey}
          onClose={closeModal}
          getVariantColor={getVariantColor}
          getVariantTextStyle={getVariantTextStyle}
        />
      )}
    </div>
  );
}

/**
 * Quest Item Component
 * Displays a single quest with progress and claim button
 */
function QuestItem({ 
  quest, 
  onClaim, 
  onComplete,
  isClaiming 
}: { 
  quest: QuestWithProgress; 
  onClaim: (questId: string) => void;
  onComplete: (questId: string) => void;
  isClaiming: boolean;
}) {
  const status = quest.userProgress?.status || 'available';
  const isClaimed = status === 'claimed';
  const canClaim = quest.canClaim;
  
  // Get status color and text
  const getStatusDisplay = () => {
    switch (status) {
      case 'claimed':
        return { text: 'CLAIMED', color: '#44ff88', icon: '✓' };
      case 'completed':
        return { text: 'READY TO CLAIM', color: '#ffd700', icon: '🎁' };
      case 'in_progress':
        return { text: 'IN PROGRESS', color: '#00ffff', icon: '⏳' };
      default:
        return { text: 'AVAILABLE', color: '#9966ff', icon: '○' };
    }
  };
  
  const statusDisplay = getStatusDisplay();
  
  return (
    <div 
      className={`p-3 rounded-lg border-2 transition-all ${
        isClaimed 
          ? 'bg-[#44ff88]/10 border-[#44ff88]/30 opacity-60' 
          : canClaim
          ? 'bg-[#ffd700]/10 border-[#ffd700] animate-glow-pulse'
          : 'bg-[#0a0a15] border-[#2a2a4e] hover:border-[#3a3a5e]'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Quest Icon */}
        <div 
          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
          style={{ 
            backgroundColor: `${statusDisplay.color}20`,
            border: `2px solid ${statusDisplay.color}50`,
          }}
        >
          {quest.icon}
        </div>
        
        {/* Quest Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h4 className={`text-xs font-bold truncate ${isClaimed ? 'text-gray-400' : 'text-white'}`}>
              {quest.name}
            </h4>
            <span 
              className="text-[9px] px-2 py-0.5 rounded border flex-shrink-0"
              style={{ 
                color: statusDisplay.color,
                borderColor: statusDisplay.color,
                backgroundColor: `${statusDisplay.color}10`,
              }}
            >
              {statusDisplay.icon} {statusDisplay.text}
            </span>
          </div>
          
          <p className="text-gray-400 text-[10px] mb-2 leading-relaxed">
            {quest.description}
          </p>
          
          <div className="flex items-center justify-between">
            {/* XP Reward */}
            <span className="text-[#44ff88] text-[10px] font-bold">
              +{quest.xp_reward} XP
            </span>
            
            {/* Action Button */}
            {canClaim && !isClaimed && (
              <button
                onClick={() => onClaim(quest.id)}
                disabled={isClaiming}
                className="pixel-btn pixel-btn-gold text-[9px] !px-3 !py-1 disabled:opacity-50"
              >
                {isClaiming ? '...' : 'CLAIM'}
              </button>
            )}
            
            {/* Mark Complete Button (for manual completion) */}
            {status === 'available' && !canClaim && (
              <button
                onClick={() => onComplete(quest.id)}
                className="pixel-btn text-[9px] !px-3 !py-1"
              >
                MARK DONE
              </button>
            )}
          </div>
        </div>
      </div>
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
      
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
