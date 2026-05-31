'use client';

import type { MemberData } from '../shared';
import { truncateAddress } from '../shared';

/**
 * Top Holders Mini Leaderboard
 * Shows top 5 holders with their NFT counts
 * Clicking on a holder opens their wallet on Monadvision
 */
export default function TopHoldersMini({
  members,
  isLoading
}: {
  members: MemberData[];
  isLoading: boolean;
}) {
  const topHolders = members.slice(0, 5);

  // Generate Monadvision URL for a wallet address
  const getMonadvisionUrl = (address: string) => {
    return `https://monadvision.com/address/${address}`;
  };

  return (
    <div className="pixel-card p-4 animate-slide-in-up">
      <h3 className="text-[#ffd700] text-xs sm:text-sm tracking-wider mb-2">
        👑 TOP HOLDERS
      </h3>
      <p className="text-gray-500 text-[9px] mb-4">
        Click to view on Monadvision
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-2xl animate-spin">👑</div>
        </div>
      ) : (
        <div className="space-y-2">
          {topHolders.map((member, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
            return (
              <a
                key={member.address}
                href={getMonadvisionUrl(member.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 py-2 px-3 rounded bg-[#0a0a15]/50 hover:bg-[#1a1a2e] hover:border-[#ffd700]/30 border border-transparent transition-all cursor-pointer group"
              >
                <span className="text-sm">{medal}</span>
                <span className="text-gray-300 text-[10px] truncate flex-1 group-hover:text-[#ffd700] transition-colors">
                  {member.displayName || truncateAddress(member.address)}
                </span>
                <span className="text-[#ffd700] text-xs font-bold">
                  {member.count}⭐
                </span>
                <span className="text-gray-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                  ↗
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
