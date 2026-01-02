'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { truncateAddress } from '@/lib/governance';

/**
 * User profile data interface
 */
interface UserProfileData {
  address: string;
  displayName?: string | null;
  bio?: string | null;
  avatarTokenId?: number;
  level?: number;
  xp?: number;
  discordUsername?: string | null;
  xUsername?: string | null;
  starCount?: number;
  displayedBadges?: string[];
}

/**
 * Achievement definitions for badge display
 */
const ACHIEVEMENTS = [
  { id: 'star_forged', name: 'Star Forged', description: 'Hold at least 1 Star Skrumpey', icon: '⭐', color: '#9966ff' },
  { id: 'cosmic_warden', name: 'Cosmic Warden', description: 'Hold 2 or more Star Skrumpeys', icon: '🌟', color: '#00ffff' },
  { id: 'star_lord', name: 'Star Lord', description: 'Hold 5 or more Star Skrumpeys', icon: '👑', color: '#ff00ff' },
  { id: 'cosmic_emperor', name: 'Cosmic Emperor', description: 'Hold 10 or more Star Skrumpeys', icon: '🏆', color: '#ffd700' },
  { id: 'gotta_catch_em_all', name: 'Gotta Catch Em All!', description: 'Collect all 9 constellation types', icon: '🔮', color: '#ff6ec7' },
  { id: 'prime_holder', name: 'The Prime', description: 'Hold the legendary Prime Star Skrumpey', icon: '💎', color: '#ffd700' },
];

/**
 * Friend status type
 */
type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'blocked' | 'loading';

/**
 * Get level title based on Star count
 */
function getLevelTitle(count: number): string {
  if (count >= 10) return 'COSMIC EMPEROR';
  if (count >= 5) return 'STAR LORD';
  if (count >= 2) return 'COSMIC WARDEN';
  return 'STAR FORGED';
}

/**
 * Get level color based on Star count
 */
function getLevelColor(count: number): string {
  if (count >= 10) return '#ffd700';
  if (count >= 5) return '#ff00ff';
  if (count >= 2) return '#00ffff';
  return '#9966ff';
}

interface UserProfileModalProps {
  isOpen: boolean;
  userAddress: string;
  onClose: () => void;
}

/**
 * User Profile Modal Component
 * 
 * Displays another user's profile with:
 * - Display name and avatar
 * - Social connections (X, Discord)
 * - Level and badges
 * - Add Friend and Message buttons
 */
export default function UserProfileModal({
  isOpen,
  userAddress,
  onClose,
}: UserProfileModalProps) {
  const { address: currentUserAddress, isConnected } = useAccount();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('loading');
  const [isSendingRequest, setIsSendingRequest] = useState(false);

  const isCurrentUser = currentUserAddress?.toLowerCase() === userAddress?.toLowerCase();

  // Fetch user profile
  const fetchProfile = useCallback(async () => {
    if (!userAddress) return;
    
    setIsLoading(true);
    try {
      // Fetch all data in parallel
      const [profileRes, socialRes, xpRes] = await Promise.all([
        fetch(`/api/profile?address=${userAddress}`),
        fetch(`/api/social-connections?address=${userAddress}`),
        fetch(`/api/user-xp?address=${userAddress}`),
      ]);
      
      const [profileData, socialData, xpData] = await Promise.all([
        profileRes.json(),
        socialRes.json(),
        xpRes.json(),
      ]);
      
      setProfile({
        address: userAddress,
        displayName: profileData.profile?.display_name,
        bio: profileData.profile?.bio,
        avatarTokenId: profileData.profile?.avatar_token_id,
        displayedBadges: profileData.profile?.displayed_badges ? JSON.parse(profileData.profile.displayed_badges) : [],
        discordUsername: socialData.connections?.find((c: { platform: string; platform_username?: string }) => c.platform === 'discord')?.platform_username,
        xUsername: socialData.connections?.find((c: { platform: string; platform_username?: string }) => c.platform === 'x')?.platform_username,
        level: xpData.xp?.level || 1,
        xp: xpData.xp?.total_xp || 0,
        starCount: profileData.starCount || 0,
      });
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress]);

  // Fetch friend status
  const fetchFriendStatus = useCallback(async () => {
    if (!currentUserAddress || !userAddress || isCurrentUser) {
      setFriendStatus('none');
      return;
    }
    
    try {
      const res = await fetch(`/api/friends?address=${currentUserAddress}&type=status&otherAddress=${userAddress}`);
      const data = await res.json();
      
      if (data.success) {
        setFriendStatus(data.status || 'none');
      } else {
        setFriendStatus('none');
      }
    } catch (error) {
      console.error('Failed to fetch friend status:', error);
      setFriendStatus('none');
    }
  }, [currentUserAddress, userAddress, isCurrentUser]);

  // Handle send friend request
  const handleSendFriendRequest = async () => {
    if (!currentUserAddress || isSendingRequest) return;
    
    setIsSendingRequest(true);
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: currentUserAddress,
          targetAddress: userAddress,
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

  // Handle accept friend request
  const handleAcceptRequest = async () => {
    if (!currentUserAddress || isSendingRequest) return;
    
    setIsSendingRequest(true);
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: currentUserAddress,
          targetAddress: userAddress,
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

  // Load data when modal opens
  useEffect(() => {
    if (isOpen && userAddress) {
      fetchProfile();
      fetchFriendStatus();
    }
  }, [isOpen, userAddress, fetchProfile, fetchFriendStatus]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const displayName = profile?.displayName || truncateAddress(userAddress);
  const starCount = profile?.starCount || 0;
  const levelTitle = getLevelTitle(starCount);
  const levelColor = getLevelColor(starCount);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      
      {/* Modal */}
      <div 
        className="relative z-10 w-full max-w-md pixel-card p-6 animate-slide-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white rounded-lg hover:bg-[#2a2a4e] smooth-transition"
        >
          ✕
        </button>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="text-4xl animate-spin mb-4">⭐</div>
            <p className="text-[#ffd700] text-xs">Loading profile...</p>
          </div>
        ) : (
          <>
            {/* Avatar Section */}
            <div className="text-center mb-6">
              <div className="w-20 h-20 mx-auto mb-4 rounded-lg overflow-hidden border-2 border-[#ffd700] bg-gradient-to-br from-[#9966ff]/30 to-[#ffd700]/30 flex items-center justify-center text-4xl"
                style={{ boxShadow: '0 0 20px rgba(255, 215, 0, 0.3)' }}
              >
                🐸
              </div>
              
              <h2 className="text-[#ffd700] text-lg font-bold mb-1 animate-glow-pulse">
                {displayName}
              </h2>
              
              <p className="text-gray-500 text-xs font-mono mb-2">
                {userAddress}
              </p>
              
              {/* Level Badge */}
              <div className="flex items-center justify-center gap-2">
                <span 
                  className="text-xs font-bold px-3 py-1 rounded-lg"
                  style={{ 
                    backgroundColor: `${levelColor}20`,
                    color: levelColor,
                    border: `1px solid ${levelColor}50`,
                  }}
                >
                  Lv.{profile?.level || 1}
                </span>
                <span 
                  className="text-xs uppercase tracking-wider"
                  style={{ color: levelColor }}
                >
                  {levelTitle}
                </span>
              </div>
            </div>

            {/* Bio */}
            {profile?.bio && (
              <div className="mb-4 p-3 bg-[#0a0a15] rounded-lg">
                <p className="text-gray-300 text-xs leading-relaxed">{profile.bio}</p>
              </div>
            )}

            {/* Social Connections */}
            {(profile?.discordUsername || profile?.xUsername) && (
              <div className="mb-4 flex justify-center gap-4">
                {profile.discordUsername && (
                  <div className="flex items-center gap-2 text-xs bg-[#5865F2]/20 px-3 py-2 rounded-lg border border-[#5865F2]/30">
                    <span className="text-[#5865F2]">Discord:</span>
                    <span className="text-white">{profile.discordUsername}</span>
                  </div>
                )}
                {profile.xUsername && (
                  <div className="flex items-center gap-2 text-xs bg-white/10 px-3 py-2 rounded-lg border border-white/20">
                    <span className="text-gray-400">𝕏:</span>
                    <span className="text-white">@{profile.xUsername}</span>
                  </div>
                )}
              </div>
            )}

            {/* Badges */}
            {profile?.displayedBadges && profile.displayedBadges.length > 0 && (
              <div className="flex justify-center gap-2 mb-4">
                {profile.displayedBadges.map(badgeId => {
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
                    </div>
                  );
                })}
              </div>
            )}

            {/* Action Buttons */}
            {isConnected && !isCurrentUser && (
              <div className="flex justify-center gap-3 mt-4">
                {friendStatus === 'loading' ? (
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
                
                {friendStatus !== 'blocked' && (
                  <a
                    href={`/profile?tab=messages&chat=${userAddress}`}
                    className="pixel-btn text-[10px] !px-4 !py-2"
                  >
                    💬 Message
                  </a>
                )}
              </div>
            )}

            {isCurrentUser && (
              <div className="text-center mt-4">
                <span className="text-gray-500 text-xs">This is your profile</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
