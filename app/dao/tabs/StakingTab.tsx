'use client';

import { useState } from 'react';
import { formatRelativeTime } from '@/lib/hooks/useGovernance';
import { useStarPoints, formatStarAmount, STAR_PER_NFT_PER_DAY } from '@/lib/hooks/useStarPoints';

/**
 * Staking Tab Component - Updated with STAR points system
 * 
 * New mechanics:
 * - 1 Star Skrumpey = 1 STAR per 24 hours
 * - Multiple NFTs can be staked
 * - No unstaking period (immediate unstake)
 * - STAR tokens usable in governance with sqrt weighting
 */
export default function StakingTab({
  isLoading,
}: {
  isLoading: boolean;
}) {
  const {
    starBalance,
    pendingStars,
    totalStars,
    stakedNFTs,
    availableToStake,
    votingPower,
    stakeNFT,
    stakeAll,
    unstakeNFT,
    claimStars,
    timeUntilNextStar,
    history,
  } = useStarPoints();
  
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleStake = (tokenId: number, starVariant?: string) => {
    setError(null);
    setSuccessMessage(null);
    setIsPending(true);
    
    const result = stakeNFT(tokenId, starVariant);
    setIsPending(false);
    
    if (!result.success) {
      setError(result.error || 'Failed to stake');
    } else {
      setSuccessMessage(`Staked NFT #${tokenId}! You'll earn ${STAR_PER_NFT_PER_DAY} STAR per day.`);
    }
  };

  const handleStakeAll = () => {
    setError(null);
    setSuccessMessage(null);
    setIsPending(true);
    
    const result = stakeAll();
    setIsPending(false);
    
    if (result.stakedCount > 0) {
      setSuccessMessage(`Staked ${result.stakedCount} NFTs! You'll earn ${result.stakedCount * STAR_PER_NFT_PER_DAY} STAR per day.`);
    }
  };

  const handleUnstake = (tokenId: number) => {
    setError(null);
    setSuccessMessage(null);
    setIsPending(true);
    
    const result = unstakeNFT(tokenId);
    setIsPending(false);
    
    if (!result.success) {
      setError(result.error || 'Failed to unstake');
    } else {
      setSuccessMessage(`Unstaked NFT #${tokenId}! Claimed ${result.claimedStars} STAR.`);
    }
  };

  const handleClaimAll = () => {
    setError(null);
    setSuccessMessage(null);
    
    const result = claimStars();
    
    if (result.claimed > 0) {
      setSuccessMessage(`Claimed ${result.claimed} STAR!`);
    } else {
      setError('No STAR to claim yet. Keep staking!');
    }
  };

  if (isLoading) {
    return (
      <div className="pixel-card p-8 text-center animate-slide-in-up">
        <div className="text-4xl mb-4 animate-spin">⭐</div>
        <p className="text-[#ffd700] text-xs animate-pixel-pulse">LOADING STAKING...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* STAR Balance Overview */}
      <div className="pixel-card p-6 text-center animate-slide-in-up">
        <h3 className="text-[#ffd700] text-sm tracking-wider mb-4 animate-glow-pulse">STAR STAKING</h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-[#0a0a15] p-4 rounded-lg border-2 border-[#ffd700]/30">
            <p className="text-gray-500 text-xs mb-1">STAR BALANCE</p>
            <p className="text-[#ffd700] text-xl font-bold">
              {formatStarAmount(starBalance)} ⭐
            </p>
          </div>
          <div className="bg-[#0a0a15] p-4 rounded-lg border-2 border-[#44ff88]/30">
            <p className="text-gray-500 text-xs mb-1">PENDING STAR</p>
            <p className="text-[#44ff88] text-xl font-bold">
              {formatStarAmount(pendingStars)} ⭐
            </p>
          </div>
          <div className="bg-[#0a0a15] p-4 rounded-lg border-2 border-[#9966ff]/30">
            <p className="text-gray-500 text-xs mb-1">STAKED NFTs</p>
            <p className="text-[#9966ff] text-xl font-bold">
              {stakedNFTs.length} 🐸
            </p>
          </div>
          <div className="bg-[#0a0a15] p-4 rounded-lg border-2 border-[#00ffff]/30">
            <p className="text-gray-500 text-xs mb-1">VOTING POWER</p>
            <p className="text-[#00ffff] text-xl font-bold">
              {votingPower?.weightedVotingPower.toFixed(2) || '0'}
            </p>
          </div>
        </div>
        
        {/* Time Until Next STAR */}
        {timeUntilNextStar && stakedNFTs.length > 0 && (
          <div className="bg-[#1a1a2e] rounded-lg p-4 mb-4">
            <p className="text-gray-500 text-xs mb-2">NEXT STAR IN</p>
            <p className="text-[#ffd700] text-lg font-bold animate-pixel-pulse">
              {String(timeUntilNextStar.hours).padStart(2, '0')}:
              {String(timeUntilNextStar.minutes).padStart(2, '0')}:
              {String(timeUntilNextStar.seconds).padStart(2, '0')}
            </p>
            <p className="text-gray-600 text-[10px] mt-1">
              +{stakedNFTs.length * STAR_PER_NFT_PER_DAY} STAR ({stakedNFTs.length} staked NFTs)
            </p>
          </div>
        )}
        
        {/* Claim Button */}
        {pendingStars > 0 && (
          <button
            onClick={handleClaimAll}
            className="pixel-btn pixel-btn-gold text-xs !px-6 !py-2 smooth-transition hover-lift animate-pixel-pulse"
          >
            ✨ CLAIM {pendingStars} STAR ✨
          </button>
        )}
        
        {/* Staking Benefits */}
        <div className="bg-[#1a1a2e] rounded-lg p-4 mt-4 text-left">
          <p className="text-[#ffd700] text-sm mb-2">STAR STAKING BENEFITS</p>
          <ul className="text-gray-400 text-sm space-y-1">
            <li>• Earn <span className="text-[#ffd700]">{STAR_PER_NFT_PER_DAY} STAR</span> per NFT every 24 hours</li>
            <li>• Stake multiple NFTs to multiply earnings</li>
            <li>• <span className="text-[#44ff88]">NO unstaking period</span> - unstake anytime!</li>
            <li>• <span className="text-[#9966ff]">Governance:</span> 1 Star Skrumpey = 1 Vote</li>
          </ul>
        </div>
      </div>

      {/* Voting Power Breakdown */}
      {votingPower && (
        <div className="pixel-card p-4 animate-slide-in-up animate-delay-1">
          <h4 className="text-[#9966ff] text-xs mb-3">VOTING POWER</h4>
          <div className="bg-[#0a0a15] rounded-lg p-4">
            <div className="space-y-2 text-[10px]">
              <div className="flex justify-between">
                <span className="text-gray-500">Star Skrumpeys Held:</span>
                <span className="text-[#9966ff]">{votingPower.nftVotingPower.toFixed(0)}</span>
              </div>
              <div className="border-t border-[#2a2a4e] pt-2 flex justify-between">
                <span className="text-gray-300">Total Voting Power:</span>
                <span className="text-[#00ffff] font-bold">{votingPower.nftVotingPower.toFixed(0)}</span>
              </div>
            </div>
            <p className="text-gray-600 text-[10px] mt-3">
              ℹ️ 1 Star Skrumpey = 1 Vote. Simple and fair!
            </p>
          </div>
        </div>
      )}

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="text-[#44ff88] text-xs bg-[#44ff88]/10 px-3 py-2 rounded animate-slide-in-up">
          ✓ {successMessage}
        </div>
      )}
      {error && (
        <div className="text-[#ff4466] text-xs bg-[#ff4466]/10 px-3 py-2 rounded animate-slide-in-up">
          ⚠️ {error}
        </div>
      )}

      {/* Available to Stake */}
      {availableToStake.length > 0 && (
        <div className="pixel-card p-4 animate-slide-in-up animate-delay-2">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-[#9966ff] text-xs">AVAILABLE TO STAKE ({availableToStake.length})</h4>
            {availableToStake.length > 1 && (
              <button
                onClick={handleStakeAll}
                disabled={isPending}
                className="pixel-btn text-[10px] !py-1 !px-2 !bg-[#9966ff] !border-[#bb99ff_#5533aa_#5533aa_#bb99ff] smooth-transition hover-lift disabled:opacity-50"
              >
                STAKE ALL
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {availableToStake.map((token) => (
              <div key={token.tokenId} className="bg-[#1a1a2e] rounded-lg p-3 text-center">
                <div className="text-2xl mb-2 animate-pixel-float">🐸⭐</div>
                <p className="text-gray-200 text-xs font-bold">#{token.tokenId}</p>
                {token.starVariant && (
                  <p className="text-[#9966ff] text-[10px] uppercase">{token.starVariant}</p>
                )}
                <p className="text-[#44ff88] text-[5px] mt-1">+{STAR_PER_NFT_PER_DAY} STAR/day</p>
                <button
                  onClick={() => handleStake(token.tokenId, token.starVariant)}
                  disabled={isPending}
                  className="mt-2 w-full pixel-btn text-[10px] !py-1 !bg-[#44ff88] !border-[#66ffaa_#22aa44_#22aa44_#66ffaa] smooth-transition hover-lift disabled:opacity-50"
                >
                  {isPending ? '...' : 'STAKE'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Currently Staked */}
      {stakedNFTs.length > 0 && (
        <div className="pixel-card p-4 animate-slide-in-up animate-delay-3">
          <h4 className="text-[#ffd700] text-xs mb-3">CURRENTLY STAKED ({stakedNFTs.length})</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {stakedNFTs.map((nft) => (
              <div key={nft.tokenId} className="bg-[#1a1a2e] rounded-lg p-3 text-center border-2 border-[#ffd700]/30">
                <div className="text-2xl mb-2 animate-pixel-float">🐸⭐</div>
                <p className="text-[#ffd700] text-xs font-bold">#{nft.tokenId}</p>
                {nft.starVariant && (
                  <p className="text-[#9966ff] text-[10px] uppercase">{nft.starVariant}</p>
                )}
                <p className="text-[#44ff88] text-[5px]">EARNING ⭐</p>
                <button
                  onClick={() => handleUnstake(nft.tokenId)}
                  disabled={isPending}
                  className="mt-2 w-full pixel-btn text-[10px] !py-1 !bg-[#ff4466] !border-[#ff6688_#aa2244_#aa2244_#ff6688] smooth-transition hover-lift disabled:opacity-50"
                >
                  {isPending ? '...' : 'UNSTAKE'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent History */}
      {history.length > 0 && (
        <div className="pixel-card p-4 animate-slide-in-up animate-delay-4">
          <h4 className="text-[#9966ff] text-xs mb-3">RECENT ACTIVITY</h4>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {history.slice(0, 10).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b border-[#2a2a4e] last:border-0 text-[10px]">
                <div className="flex items-center gap-2">
                  <span className={
                    tx.type === 'claim' ? 'text-[#44ff88]' :
                    tx.type === 'stake' ? 'text-[#9966ff]' :
                    tx.type === 'unstake' ? 'text-[#ff4466]' :
                    'text-[#ffd700]'
                  }>
                    {tx.type === 'claim' ? '✨' : tx.type === 'stake' ? '📥' : tx.type === 'unstake' ? '📤' : '🗳️'}
                  </span>
                  <span className="text-gray-400">{tx.description}</span>
                </div>
                <span className="text-gray-600">{formatRelativeTime(tx.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="pixel-card p-4 bg-[#0a0a15] animate-slide-in-up animate-delay-5">
        <p className="text-[#9966ff] text-sm tracking-wide mb-2">STAR SYSTEM INFO</p>
        <ul className="text-gray-400 text-sm space-y-1">
          <li>• Stake your Star Skrumpeys to earn STAR tokens</li>
          <li>• <span className="text-[#44ff88]">Instant unstaking</span> - no cooldown period!</li>
          <li>• STAR earned = Days staked × NFTs staked × {STAR_PER_NFT_PER_DAY}</li>
          <li>• <span className="text-[#ffd700]">Governance:</span> 1 Star Skrumpey = 1 Vote</li>
        </ul>
      </div>
    </div>
  );
}
