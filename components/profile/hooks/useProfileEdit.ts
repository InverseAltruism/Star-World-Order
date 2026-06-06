import { useState, useEffect, useCallback } from 'react';
import type { AuthenticatedJsonHeaders } from './useAuthHeaders';

/**
 * Owns the profile-edit data cluster: display-name / bio editing, the badge
 * selection + display, and the avatar selection. Includes the mount effect that
 * loads the stored profile (name, bio, avatar token, displayed badges) and the
 * three save handlers, all of which POST to `/api/profile` and gate on demo mode.
 *
 * Pure extraction from ProfileCard — no behavior change.
 */
export function useProfileEdit(
  address: string | undefined,
  isDemoMode: boolean,
  getAuthenticatedJsonHeaders: () => Promise<AuthenticatedJsonHeaders>,
) {
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [selectedBadges, setSelectedBadges] = useState<string[]>([]);
  const [isEditingBadges, setIsEditingBadges] = useState(false);

  // Avatar selection state
  const [avatarTokenId, setAvatarTokenId] = useState<number | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  // Load profile on mount
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    fetch(`/api/profile?address=${address}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data.success && data.profile) {
          setDisplayName(data.profile.display_name || '');
          setBio(data.profile.bio || '');
          // Load avatar token ID from avatar_url field (stored as string number)
          if (data.profile.avatar_url) {
            const tokenId = parseInt(data.profile.avatar_url, 10);
            if (!isNaN(tokenId)) {
              setAvatarTokenId(tokenId);
            }
          }
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
    return () => {
      cancelled = true;
    };
  }, [address]);

  const handleSaveProfile = useCallback(async () => {
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
      const headers = await getAuthenticatedJsonHeaders();
      if (!headers) {
        setProfileError('Wallet signature required to save profile');
        return;
      }

      const response = await fetch('/api/profile', {
        method: 'POST',
        headers,
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
  }, [address, isDemoMode, getAuthenticatedJsonHeaders, displayName, bio]);

  // Save avatar selection
  const handleSaveAvatar = useCallback(async (tokenId: number) => {
    if (!address || isDemoMode) return;

    setIsSavingAvatar(true);
    try {
      const headers = await getAuthenticatedJsonHeaders();
      if (!headers) {
        return;
      }

      const response = await fetch('/api/profile', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          walletAddress: address,
          avatarTokenId: tokenId,
          isDemoMode: false,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAvatarTokenId(tokenId);
        setShowAvatarPicker(false);
      }
    } catch (error) {
      console.error('Failed to save avatar:', error);
    } finally {
      setIsSavingAvatar(false);
    }
  }, [address, isDemoMode, getAuthenticatedJsonHeaders]);

  // Save displayed badges to profile
  const handleSaveBadges = useCallback(async () => {
    if (!address) return;

    // Prevent badge updates in demo mode
    if (isDemoMode) {
      // Silently revert to editing mode - user shouldn't be able to save in demo
      return;
    }

    try {
      const headers = await getAuthenticatedJsonHeaders();
      if (!headers) {
        return;
      }

      const response = await fetch('/api/profile', {
        method: 'POST',
        headers,
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
  }, [address, isDemoMode, getAuthenticatedJsonHeaders, selectedBadges]);

  return {
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
  };
}
