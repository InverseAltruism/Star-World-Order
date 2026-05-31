'use client';

import React from 'react';
import type { OwnedToken } from '@/lib/starSkrumpey';
import {
  ACHIEVEMENTS,
  COLLECTIBLE_CONSTELLATIONS,
  type Achievement,
} from '../achievements';

/**
 * AchievementsTab — presentational extraction of the `achievements` section of
 * ProfileCard. Renders the achievements grid card (with badge editing) plus the
 * achievement detail modal. All state lives in the parent and is passed in as
 * props; the large achievement constants are imported, not passed.
 */
interface AchievementsTabProps {
  unlockedAchievements: Achievement[];
  uniqueConstellations: string[];
  starSkrumpeys: OwnedToken[];
  // useProfileEdit (badge state)
  selectedBadges: string[];
  isEditingBadges: boolean;
  setIsEditingBadges: (editing: boolean) => void;
  handleSaveBadges: () => void;
  // parent helpers
  getBadgeButtonText: () => string;
  toggleBadge: (badgeId: string) => void;
  isDemoMode: boolean;
  // achievement-modal state
  selectedAchievement: Achievement | null;
  setSelectedAchievement: (achievement: Achievement | null) => void;
}

export default function AchievementsTab({
  unlockedAchievements,
  uniqueConstellations,
  starSkrumpeys,
  selectedBadges,
  isEditingBadges,
  setIsEditingBadges,
  handleSaveBadges,
  getBadgeButtonText,
  toggleBadge,
  isDemoMode,
  selectedAchievement,
  setSelectedAchievement,
}: AchievementsTabProps) {
  return (
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in overflow-hidden"
          onClick={() => setSelectedAchievement(null)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

          {/* Modal Content - with overscroll containment */}
          <div
            className="relative z-10 w-full max-w-xs pixel-card p-6 animate-slide-in-up text-center overscroll-contain"
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
  );
}
