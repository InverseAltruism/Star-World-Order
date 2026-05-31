'use client';

import React from 'react';
import SocialConnect from '../../SocialConnect';

/**
 * SettingsTab — presentational extraction of the `settings` section of
 * ProfileCard. Renders the profile-edit card (display name / bio / social
 * connections). All state lives in the parent (via useProfileEdit) and is
 * passed in as props. The notification-settings card is supplied as a node so
 * the parent keeps ownership of that component.
 */
interface SettingsTabProps {
  address: string | undefined;
  isDemoMode: boolean;
  // useProfileEdit
  displayName: string;
  setDisplayName: (name: string) => void;
  bio: string;
  setBio: (bio: string) => void;
  isEditingProfile: boolean;
  setIsEditingProfile: (editing: boolean) => void;
  isSavingProfile: boolean;
  profileError: string | null;
  setProfileError: (error: string | null) => void;
  profileSuccess: boolean;
  handleSaveProfile: () => void;
  // notification settings card (kept in parent)
  notificationSettings: React.ReactNode;
}

export default function SettingsTab({
  isDemoMode,
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
  handleSaveProfile,
  notificationSettings,
}: SettingsTabProps) {
  return (
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
      {notificationSettings}
        </>
  );
}
