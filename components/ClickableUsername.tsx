'use client';

import React, { useState } from 'react';
import UserProfileModal from './UserProfileModal';
import { truncateAddress } from '@/lib/governance';

interface ClickableUsernameProps {
  address: string;
  displayName?: string | null;
  className?: string;
  showAddress?: boolean; // If true, shows truncated address instead of display name
}

/**
 * Clickable Username Component
 * 
 * Displays a username/address that can be clicked to view the user's profile.
 * Falls back to truncated address if no display name is provided.
 * 
 * Usage:
 * <ClickableUsername address="0x123..." displayName="CoolUser" />
 * <ClickableUsername address="0x123..." /> // Shows truncated address
 */
export default function ClickableUsername({
  address,
  displayName,
  className = '',
  showAddress = false,
}: ClickableUsernameProps) {
  const [showProfile, setShowProfile] = useState(false);

  const displayText = showAddress 
    ? truncateAddress(address) 
    : (displayName || truncateAddress(address));

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowProfile(true);
        }}
        className={`text-[#9966ff] hover:text-[#ffd700] hover:underline cursor-pointer smooth-transition ${className}`}
        title={`View profile: ${displayText}`}
      >
        {displayText}
      </button>

      <UserProfileModal
        isOpen={showProfile}
        userAddress={address}
        onClose={() => setShowProfile(false)}
      />
    </>
  );
}
