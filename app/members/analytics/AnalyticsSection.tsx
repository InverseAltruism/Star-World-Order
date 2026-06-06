'use client';

import { useState } from 'react';
import type { MemberData } from '../shared';
import HolderChart from './HolderChart';
import ConstellationDistribution from './ConstellationDistribution';
import HolderTierBreakdown from './HolderTierBreakdown';
import TopHoldersMini from './TopHoldersMini';

/**
 * Analytics Section - Collapsible section containing detailed analytics
 * Hidden by default, users can click to expand and view charts/distributions
 */
export default function AnalyticsSection({
  members,
  isLoading
}: {
  members: MemberData[];
  isLoading: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-6">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full pixel-card p-4 flex items-center justify-between cursor-pointer hover:bg-[#1a1a2e]/50 smooth-transition group"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">📊</span>
          <h2 className="text-[#ffd700] text-sm sm:text-base tracking-wider">
            ANALYTICS
          </h2>
          <span className="text-gray-500 text-xs">
            ({isExpanded ? 'click to hide' : 'click to view'})
          </span>
        </div>
        <span
          className={`text-xl text-gray-400 smooth-transition transform ${isExpanded ? 'rotate-180' : ''}`}
        >
          ▼
        </span>
      </button>

      {/* Collapsible Content */}
      <div
        className={`overflow-hidden smooth-transition ${
          isExpanded ? 'max-h-[3000px] opacity-100 mt-4' : 'max-h-0 opacity-0'
        }`}
      >
        {/* Holder Chart - Full Width */}
        <div className="mb-4">
          <HolderChart />
        </div>

        {/* Constellation Distribution - Full Width */}
        <div className="mb-4">
          <ConstellationDistribution isLoading={isLoading} />
        </div>

        {/* Holder Tier Breakdown - Full Width */}
        <div className="mb-4">
          <HolderTierBreakdown members={members} isLoading={isLoading} />
        </div>

        {/* Top Holders in full width below */}
        <div className="mt-4">
          <TopHoldersMini members={members} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
