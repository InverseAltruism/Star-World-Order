'use client';

import React from 'react';
import type { MemberData } from '../shared';

// Holder tier configuration using rank names
const HOLDER_TIERS = [
  { rank: 'COSMIC EMPEROR', icon: '🏆', min: 10, max: Infinity, color: '#ffd700', description: '10+ Star Skrumpeys' },
  { rank: 'STAR LORD', icon: '👑', min: 5, max: 9, color: '#ff00ff', description: '5-9 Star Skrumpeys' },
  { rank: 'COSMIC WARDEN', icon: '🌟', min: 2, max: 4, color: '#00ffff', description: '2-4 Star Skrumpeys' },
  { rank: 'STAR FORGED', icon: '⭐', min: 1, max: 1, color: '#9966ff', description: '1 Star Skrumpey' },
] as const;

/**
 * Holder Tier Breakdown
 * Shows how many members are in each rank tier (Cosmic Emperor, Star Lord, etc.)
 */
export default function HolderTierBreakdown({
  members,
  isLoading
}: {
  members: MemberData[];
  isLoading: boolean;
}) {
  // Calculate tier counts
  const tierCounts = React.useMemo(() => {
    return HOLDER_TIERS.map(tier => {
      const count = members.filter(m => m.count >= tier.min && m.count <= tier.max).length;
      return { ...tier, count };
    });
  }, [members]);

  const maxCount = Math.max(...tierCounts.map(t => t.count), 1);
  const totalHolders = members.length;

  return (
    <div className="pixel-card p-5 animate-slide-in-up">
      <h3 className="text-[#44ff88] text-sm sm:text-base tracking-wider mb-5">
        👑 HOLDER TIER BREAKDOWN
      </h3>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-3xl animate-spin">👑</div>
        </div>
      ) : (
        <div className="space-y-4">
          {tierCounts.map((tier) => {
            const percentage = totalHolders > 0 ? ((tier.count / totalHolders) * 100).toFixed(1) : '0';
            return (
              <div key={tier.rank} className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{tier.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="text-sm font-bold truncate"
                        style={{ color: tier.color }}
                      >
                        {tier.rank}
                      </span>
                      <span className="text-white text-sm font-bold flex-shrink-0">
                        {tier.count} <span className="text-gray-500 text-xs">({percentage}%)</span>
                      </span>
                    </div>
                    <p className="text-gray-500 text-xs">{tier.description}</p>
                  </div>
                </div>
                <div className="h-3 bg-[#1a1a2e] rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-500"
                    style={{
                      width: `${(tier.count / maxCount) * 100}%`,
                      backgroundColor: tier.color,
                      boxShadow: `0 0 10px ${tier.color}50`,
                      minWidth: tier.count > 0 ? '8px' : '0',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tier Info */}
      {!isLoading && (
        <div className="mt-5 pt-4 border-t border-[#2a2a4e] text-xs text-gray-500">
          <p className="text-center">
            Total: {totalHolders} holders across all tiers
          </p>
        </div>
      )}
    </div>
  );
}
