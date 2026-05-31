'use client';

import React from 'react';
import type { RaffleHistoryEntry } from '../types';

/**
 * RafflesTab — presentational extraction of the `raffles` section of
 * ProfileCard. Renders the raffle-history stats and the per-entry list. All
 * state lives in the parent (via useRaffleHistory) and is passed in as props.
 */
interface RafflesTabProps {
  raffleHistory: RaffleHistoryEntry[];
  isLoadingRaffles: boolean;
}

export default function RafflesTab({
  raffleHistory,
  isLoadingRaffles,
}: RafflesTabProps) {
  return (
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
  );
}
