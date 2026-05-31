'use client';

import React from 'react';
import type { Raffle, RaffleStats, ActionResult } from './types';

interface RafflesTabProps {
  fetchRaffles: () => void;
  isLoadingRaffles: boolean;
  raffleName: string;
  setRaffleName: (value: string) => void;
  raffleEndTime: string;
  setRaffleEndTime: (value: string) => void;
  rafflePrize: string;
  setRafflePrize: (value: string) => void;
  raffleDescription: string;
  setRaffleDescription: (value: string) => void;
  rafflePrizeImage: string;
  setRafflePrizeImage: (value: string) => void;
  raffleIsPublic: boolean;
  setRaffleIsPublic: (value: boolean) => void;
  raffleRequireX: boolean;
  setRaffleRequireX: (value: boolean) => void;
  raffleRequireDiscord: boolean;
  setRaffleRequireDiscord: (value: boolean) => void;
  raffleDiscordBonus: boolean;
  setRaffleDiscordBonus: (value: boolean) => void;
  raffleTweetUrl: string;
  setRaffleTweetUrl: (value: string) => void;
  createRaffle: () => void;
  drawnRaffles: Raffle[];
  fetchWinnerDetails: (raffle: Raffle) => void;
  setActionResult: (result: ActionResult | null) => void;
  raffles: Raffle[];
  selectedRaffleStats: { [key: string]: RaffleStats };
  drawRaffleWinner: (raffleId: string) => void;
  cancelRaffleAction: (raffleId: string) => void;
  exportRaffleCSV: (raffleId: string, raffleName: string) => void;
}

export default function RafflesTab({
  fetchRaffles,
  isLoadingRaffles,
  raffleName,
  setRaffleName,
  raffleEndTime,
  setRaffleEndTime,
  rafflePrize,
  setRafflePrize,
  raffleDescription,
  setRaffleDescription,
  rafflePrizeImage,
  setRafflePrizeImage,
  raffleIsPublic,
  setRaffleIsPublic,
  raffleRequireX,
  setRaffleRequireX,
  raffleRequireDiscord,
  setRaffleRequireDiscord,
  raffleDiscordBonus,
  setRaffleDiscordBonus,
  raffleTweetUrl,
  setRaffleTweetUrl,
  createRaffle,
  drawnRaffles,
  fetchWinnerDetails,
  setActionResult,
  raffles,
  selectedRaffleStats,
  drawRaffleWinner,
  cancelRaffleAction,
  exportRaffleCSV,
}: RafflesTabProps) {
  return (
    <div className="pixel-card p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[#ff6ec7] text-sm tracking-wider">🎰 RAFFLE MANAGEMENT</h2>
        <button
          onClick={fetchRaffles}
          disabled={isLoadingRaffles}
          className="pixel-btn text-[10px] !px-3 !py-1"
        >
          {isLoadingRaffles ? '...' : 'REFRESH'}
        </button>
      </div>

      {/* Create New Raffle Form */}
      <div className="bg-[#0a0a15] p-4 rounded-lg mb-4">
        <h3 className="text-[#ffd700] text-xs mb-3">Create New Raffle</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-gray-500 text-[10px] block mb-1">Name *</label>
            <input
              type="text"
              value={raffleName}
              onChange={(e) => setRaffleName(e.target.value)}
              placeholder="Cosmic Giveaway #1"
              className="w-full bg-[#1a1a2e] border border-[#2a2a4e] rounded px-2 py-1.5 text-xs text-white"
            />
          </div>
          <div>
            <label className="text-gray-500 text-[10px] block mb-1">End Time *</label>
            <input
              type="datetime-local"
              value={raffleEndTime}
              onChange={(e) => setRaffleEndTime(e.target.value)}
              className="w-full bg-[#1a1a2e] border border-[#2a2a4e] rounded px-2 py-1.5 text-xs text-white"
            />
          </div>
        </div>

        <div className="mb-3">
          <label className="text-gray-500 text-[10px] block mb-1">Prize Description *</label>
          <input
            type="text"
            value={rafflePrize}
            onChange={(e) => setRafflePrize(e.target.value)}
            placeholder="1 Star Skrumpey NFT"
            className="w-full bg-[#1a1a2e] border border-[#2a2a4e] rounded px-2 py-1.5 text-xs text-white"
          />
        </div>

        <div className="mb-3">
          <label className="text-gray-500 text-[10px] block mb-1">Description (optional)</label>
          <textarea
            value={raffleDescription}
            onChange={(e) => setRaffleDescription(e.target.value)}
            placeholder="Enter for a chance to win..."
            rows={2}
            className="w-full bg-[#1a1a2e] border border-[#2a2a4e] rounded px-2 py-1.5 text-xs text-white resize-none"
          />
        </div>

        <div className="mb-3">
          <label className="text-gray-500 text-[10px] block mb-1">Prize Image URL (optional)</label>
          <input
            type="text"
            value={rafflePrizeImage}
            onChange={(e) => setRafflePrizeImage(e.target.value)}
            placeholder="https://..."
            className="w-full bg-[#1a1a2e] border border-[#2a2a4e] rounded px-2 py-1.5 text-xs text-white"
          />
        </div>

        {/* Public Raffle Toggle */}
        <div className="mb-3 p-3 bg-[#ffd700]/10 rounded border-2 border-[#ffd700]/50">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={raffleIsPublic}
              onChange={(e) => setRaffleIsPublic(e.target.checked)}
              className="w-4 h-4 mr-3"
            />
            <div>
              <span className="text-[#ffd700] text-xs font-bold">🌐 PUBLIC SKRUMPEY RAFFLE</span>
              <p className="text-gray-400 text-[9px] mt-1">
                Allow ALL Skrumpey holders to participate (not just Star holders)
              </p>
            </div>
          </label>
          {raffleIsPublic && (
            <div className="mt-3 p-2 bg-black/30 rounded text-[9px]">
              <p className="text-[#44ff88] font-bold mb-1">⚖️ ENTRY CALCULATION:</p>
              <p className="text-gray-300">• 🐸 Each regular Skrumpey: <span className="text-gray-400">1 entry</span></p>
              <p className="text-gray-300 mt-1">• ⭐ Star holders get: <span className="text-[#ffd700] font-bold">5 base + tier bonus</span></p>
              <p className="text-gray-400 text-[8px] ml-2">(Star Forged: +6, Warden: +7, Lord: +8, Emperor: +9)</p>
              <p className="text-gray-500 text-[8px] mt-1 italic">Example: 4 regular + 1 Star = 4 + 6 = 10 entries</p>
            </div>
          )}
        </div>

        {/* Social Requirements Section */}
        <div className="mb-3 p-3 bg-[#1a1a2e] rounded border border-[#2a2a4e]">
          <h4 className="text-[#9966ff] text-[10px] mb-2">📱 SOCIAL REQUIREMENTS (Mandatory to Enter)</h4>

          <div className="space-y-2">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={raffleRequireX}
                onChange={(e) => setRaffleRequireX(e.target.checked)}
                className="w-4 h-4 mr-2"
              />
              <span className="text-gray-400 text-xs">Require X (Twitter) connection</span>
            </label>

            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={raffleRequireDiscord}
                onChange={(e) => setRaffleRequireDiscord(e.target.checked)}
                className="w-4 h-4 mr-2"
              />
              <span className="text-gray-400 text-xs">Require Discord connection</span>
            </label>
          </div>
        </div>

        {/* Engagement Bonus Section */}
        <div className="mb-3 p-3 bg-[#1a1a2e] rounded border border-[#2a2a4e]">
          <h4 className="text-[#44ff88] text-[10px] mb-2">🎁 BONUS ENTRY OPTIONS</h4>

          <div className="space-y-2">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={raffleDiscordBonus}
                onChange={(e) => setRaffleDiscordBonus(e.target.checked)}
                className="w-4 h-4 mr-2"
              />
              <span className="text-gray-400 text-xs">Discord Bonus (+1 entry for Discord members)</span>
            </label>

            <div>
              <label className="text-gray-500 text-[10px] block mb-1">
                Tweet URL for Like & RT Bonus (+1 entry)
              </label>
              <input
                type="text"
                value={raffleTweetUrl}
                onChange={(e) => setRaffleTweetUrl(e.target.value)}
                placeholder="https://x.com/StrWorldOrder/status/..."
                className="w-full bg-[#0a0a15] border border-[#2a2a4e] rounded px-2 py-1.5 text-xs text-white"
              />
              <p className="text-gray-600 text-[9px] mt-1">
                Users who like & retweet this tweet get +1 bonus entry
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={createRaffle}
          disabled={!raffleName || !rafflePrize || !raffleEndTime}
          className="pixel-btn pixel-btn-gold text-xs w-full"
        >
          🎰 CREATE RAFFLE
        </button>
      </div>

      {/* Drawn Raffles Quick View */}
      {drawnRaffles.length > 0 && (
        <div className="mb-6 p-4 bg-[#ffd700]/10 rounded-lg border-2 border-[#ffd700]/30">
          <h3 className="text-[#ffd700] text-xs mb-3">🏆 RAFFLE WINNERS ({drawnRaffles.length})</h3>
          <p className="text-gray-500 text-[9px] mb-2">Click on a winner to see full details</p>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {drawnRaffles.map((raffle) => (
              <div
                key={raffle.id}
                className="flex items-center justify-between p-2 bg-black/30 rounded hover:bg-black/50 cursor-pointer transition-colors"
                onClick={() => fetchWinnerDetails(raffle)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[10px] font-bold truncate">{raffle.name}</p>
                  <p className="text-gray-400 text-[9px] truncate">{raffle.prize_description}</p>
                </div>
                <div className="text-right ml-2">
                  <p className="text-[#ffd700] text-[10px] font-mono hover:text-[#ffea80] transition-colors">
                    {raffle.winner_address?.slice(0, 6)}...{raffle.winner_address?.slice(-4)} →
                  </p>
                  <p className="text-gray-500 text-[8px]">
                    {raffle.winner_drawn_at ? new Date(raffle.winner_drawn_at).toLocaleDateString() : ''}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent opening modal when copying
                    if (raffle.winner_address) {
                      navigator.clipboard.writeText(raffle.winner_address);
                      setActionResult({ success: true, message: 'Winner address copied!' });
                    }
                  }}
                  className="ml-2 text-[#00ffff] text-xs hover:text-[#44ffff]"
                  title="Copy winner address"
                >
                  📋
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing Raffles */}
      <div className="space-y-3">
        <h3 className="text-[#ffd700] text-xs">Active & Recent Raffles ({raffles.length})</h3>

        {raffles.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-4">No raffles yet</p>
        ) : (
          raffles.map((raffle) => {
            const stats = selectedRaffleStats[raffle.id];
            const isEnded = new Date(raffle.end_time) <= new Date();
            const canDraw = raffle.status === 'active' && isEnded && !raffle.winner_address;

            return (
              <div
                key={raffle.id}
                className={`p-4 rounded-lg border ${
                  raffle.status === 'active' && !isEnded
                    ? 'bg-[#44ff88]/10 border-[#44ff88]'
                    : raffle.status === 'drawn'
                    ? 'bg-[#ffd700]/10 border-[#ffd700]'
                    : 'bg-[#0a0a15] border-[#2a2a4e]'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="text-white text-sm font-bold">{raffle.name}</h4>
                    <p className="text-gray-400 text-[10px]">{raffle.prize_description}</p>
                    {/* Show additional info (description) below prize */}
                    {raffle.description && (
                      <p className="text-gray-500 text-[9px] mt-1 italic">{raffle.description}</p>
                    )}
                    {/* Show requirements */}
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {raffle.is_public === 1 && (
                        <span className="text-[8px] px-1.5 py-0.5 bg-[#ffd700]/20 text-[#ffd700] rounded border border-[#ffd700]">
                          🌐 PUBLIC (⭐5+tier, 🐸x1)
                        </span>
                      )}
                      {raffle.require_x === 1 && (
                        <span className="text-[8px] px-1.5 py-0.5 bg-black/50 text-gray-300 rounded border border-gray-600">
                          𝕏 Required
                        </span>
                      )}
                      {raffle.require_discord === 1 && (
                        <span className="text-[8px] px-1.5 py-0.5 bg-[#5865F2]/30 text-[#7289DA] rounded border border-[#5865F2]">
                          Discord Required
                        </span>
                      )}
                      {raffle.tweet_url && (
                        <span className="text-[8px] px-1.5 py-0.5 bg-[#44ff88]/20 text-[#44ff88] rounded border border-[#44ff88]">
                          RT Bonus
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    raffle.status === 'active' && !isEnded
                      ? 'bg-[#44ff88]/20 text-[#44ff88]'
                      : raffle.status === 'drawn'
                      ? 'bg-[#ffd700]/20 text-[#ffd700]'
                      : raffle.status === 'cancelled'
                      ? 'bg-[#ff4466]/20 text-[#ff4466]'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {raffle.status === 'active' && isEnded ? 'ENDED' : raffle.status.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                  <div className="bg-[#0a0a15] rounded p-2">
                    <p className="text-[#9966ff] text-sm font-bold">{stats?.participants || 0}</p>
                    <p className="text-gray-600 text-[9px]">Participants</p>
                  </div>
                  <div className="bg-[#0a0a15] rounded p-2">
                    <p className="text-[#00ffff] text-sm font-bold">{stats?.totalTickets || 0}</p>
                    <p className="text-gray-600 text-[9px]">Tickets</p>
                  </div>
                  <div className="bg-[#0a0a15] rounded p-2">
                    <p className="text-white text-[9px]">
                      {new Date(raffle.end_time).toLocaleDateString()}
                    </p>
                    <p className="text-gray-600 text-[9px]">End Date</p>
                  </div>
                </div>

                {raffle.winner_address && (
                  <div className="bg-[#ffd700]/10 rounded p-2 mb-3">
                    <p className="text-[#ffd700] text-[10px]">
                      🏆 Winner: {raffle.winner_address.slice(0, 6)}...{raffle.winner_address.slice(-4)}
                    </p>
                    {raffle.winner_draw_seed && (
                      <p className="text-gray-500 text-[8px] mt-1 font-mono break-all">
                        Seed: {raffle.winner_draw_seed}
                      </p>
                    )}
                    {raffle.winner_drawn_at && (
                      <p className="text-gray-600 text-[8px]">
                        Drawn: {new Date(raffle.winner_drawn_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {canDraw && (
                    <button
                      onClick={() => drawRaffleWinner(raffle.id)}
                      className="pixel-btn pixel-btn-gold text-[10px] flex-1"
                    >
                      🎲 DRAW WINNER
                    </button>
                  )}
                  {raffle.status === 'active' && !raffle.winner_address && (
                    <button
                      onClick={() => cancelRaffleAction(raffle.id)}
                      className="pixel-btn text-[10px] bg-[#ff4466]"
                    >
                      ✗ CANCEL
                    </button>
                  )}
                  <button
                    onClick={() => exportRaffleCSV(raffle.id, raffle.name)}
                    className="pixel-btn text-[10px]"
                    title="Download participant list as CSV"
                  >
                    📥 CSV
                  </button>
                  <a
                    href="/raffle"
                    target="_blank"
                    className="pixel-btn text-[10px]"
                  >
                    👁️ VIEW
                  </a>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Tier Reference */}
      <div className="mt-4 pt-4 border-t border-[#2a2a4e]">
        <h4 className="text-gray-400 text-xs mb-2">Entry Tiers Reference:</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[9px]">
          <div className="bg-[#ffd700]/10 rounded p-2 text-center">
            <p className="text-[#ffd700] font-bold">COSMIC EMPEROR</p>
            <p className="text-gray-400">10+ Stars = 4 entries</p>
          </div>
          <div className="bg-[#ff00ff]/10 rounded p-2 text-center">
            <p className="text-[#ff00ff] font-bold">STAR LORD</p>
            <p className="text-gray-400">5+ Stars = 3 entries</p>
          </div>
          <div className="bg-[#00ffff]/10 rounded p-2 text-center">
            <p className="text-[#00ffff] font-bold">COSMIC WARDEN</p>
            <p className="text-gray-400">2+ Stars = 2 entries</p>
          </div>
          <div className="bg-[#9966ff]/10 rounded p-2 text-center">
            <p className="text-[#9966ff] font-bold">STAR FORGED</p>
            <p className="text-gray-400">1 Star = 1 entry</p>
          </div>
        </div>
      </div>
    </div>
  );
}
