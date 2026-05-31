'use client';

import React from 'react';
import { STAR_TRAIT_VARIANTS } from '@/lib/starSkrumpey';
import type { OwnedToken } from '@/lib/starSkrumpey';
import SkrumpeyImage from '../../SkrumpeyImage';
import { getVariantTextStyle } from '../variantStyles';
import type { SkrumpeyDisplayData } from '../types';

/**
 * CollectionTab — presentational extraction of the `collection` section of
 * ProfileCard. Renders the star-constellation legend, demo-data notice, and the
 * NFT collection grid. All derived data (display lists, demo flag) lives in the
 * parent and is passed in as props; variant styling is imported directly.
 */
interface CollectionTabProps {
  starSkrumpeys: OwnedToken[];
  // derived display lists from the parent
  displaySkrumpeys: SkrumpeyDisplayData[];
  finalDisplaySkrumpeys: SkrumpeyDisplayData[];
  showDemoData: boolean;
  setSelectedSkrumpey: (skrumpey: SkrumpeyDisplayData | null) => void;
}

export default function CollectionTab({
  starSkrumpeys,
  displaySkrumpeys,
  finalDisplaySkrumpeys,
  showDemoData,
  setSelectedSkrumpey,
}: CollectionTabProps) {
  return (
        <>
          {/* Star Trait Legend - Collection Section */}
          {starSkrumpeys.length > 0 && (
            <div className="pixel-card p-4 animate-slide-in-up">
              <h3 className="text-[#ffd700] text-sm tracking-wider mb-3 text-center animate-glow-pulse">
                STAR CONSTELLATIONS
              </h3>
              <div className="flex flex-wrap justify-center gap-2">
                {STAR_TRAIT_VARIANTS.map((variant, index) => {
                  // Use displaySkrumpeys which has the correct fetched IPFS metadata
                  const hasVariant = displaySkrumpeys.some(s => s.hasStar && s.starVariant === variant);
                  return (
                    <div
                      key={variant}
                      className={`px-2 py-1 rounded text-xs border smooth-transition hover-lift ${
                        hasVariant
                          ? 'border-[#ffd700] bg-[#ffd700]/20'
                          : 'border-[#2a2a4e] bg-[#1a1a2e] opacity-40'
                      }`}
                      style={{
                        ...(hasVariant ? getVariantTextStyle(variant) : { color: '#666' }),
                        animationDelay: `${index * 0.05}s`
                      }}
                    >
                      {variant.toUpperCase()}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Demo Data Notice - Collection Section */}
          {showDemoData && (
            <div className="text-center">
              <p className="text-gray-500 text-xs bg-[#1a1a2e] inline-block px-3 py-1 rounded border border-[#2a2a4e]">
                📋 Showing demo data - Connect wallet with Skrumpeys to see your collection
              </p>
            </div>
          )}

          {/* NFT Collection Grid */}
          <div className="pixel-card p-4 sm:p-6 animate-slide-in-up">
            <h3 className="text-[#ffd700] text-xs sm:text-sm tracking-wider mb-3 sm:mb-4 text-center animate-glow-pulse">
              YOUR COLLECTION
            </h3>
            <p className="text-gray-500 text-[8px] text-center mb-3 sm:mb-4">
              Click on a Skrumpey to inspect
            </p>

            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4">
              {finalDisplaySkrumpeys.map((nft, index) => (
                <div
                  key={nft.id}
                  onClick={() => setSelectedSkrumpey(nft)}
                  className={`relative p-3 sm:p-4 rounded-lg border-2 smooth-transition hover:scale-105 cursor-pointer animate-slide-in-up animate-delay-${(index % 6) + 1} min-h-[44px] ${
                    nft.hasStar
                      ? 'border-[#ffd700] bg-gradient-to-br from-[#1a1a2e] to-[#2a1a4a] shadow-[0_0_20px_rgba(255,215,0,0.3)] hover:shadow-[0_0_30px_rgba(255,215,0,0.5)]'
                      : 'border-[#2a2a4e] bg-[#1a1a2e] hover:border-[#3a3a5e]'
                  }`}
                >
                  {/* Star badge */}
                  {nft.hasStar && (
                    <div className="absolute -top-2 -right-2 text-lg sm:text-xl animate-pixel-pulse animate-star-rotate z-10">
                      ⭐
                    </div>
                  )}

                  {/* NFT Image */}
                  <SkrumpeyImage
                    variant="card"
                    tokenId={nft.id}
                    hasStar={nft.hasStar}
                    name={nft.name}
                  />

                  {/* NFT Info */}
                  <p className={`text-[9px] sm:text-[10px] font-bold tracking-wide truncate ${
                    nft.hasStar ? 'text-[#ffd700]' : 'text-gray-300'
                  }`}>
                    {nft.name}
                  </p>
                  <p className="text-[10px] sm:text-xs truncate">
                    <span style={getVariantTextStyle(nft.starVariant)}>
                      {nft.rarity}
                    </span>
                  </p>
                </div>
              ))}
            </div>

            {/* Empty state */}
            {finalDisplaySkrumpeys.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500 text-[10px]">No Skrumpeys found in this wallet</p>
              </div>
            )}
          </div>
        </>
  );
}
