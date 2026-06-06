'use client';

import React, { useState } from 'react';
import { getSkrumpeyImageUrl } from '@/lib/starSkrumpey';

/**
 * Shared GIF-fallback loader for Skrumpey NFT images.
 *
 * Skrumpey art is a `.png` for most tokens but a `.gif` for the galaxy-background
 * ones; we don't know which up front, so we try the png, fall back to the gif on
 * the first error, and only then show the 🐸 placeholder. This loader was
 * duplicated verbatim across four image renderers (avatar / card / picker /
 * inspect modal) — it now lives here once.
 */
export function useSkrumpeyImage(tokenId: number) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [useGif, setUseGif] = useState(false);
  const imageUrl = getSkrumpeyImageUrl(tokenId, useGif);

  const handleImageError = () => {
    if (!useGif) {
      // Reset load state and try the GIF (galaxy-background NFTs)
      setImageLoaded(false);
      setUseGif(true);
    } else {
      // Show placeholder after trying both extensions
      setImageError(true);
    }
  };

  return { imageUrl, imageLoaded, imageError, setImageLoaded, handleImageError };
}

type SkrumpeyImageProps =
  | { variant: 'avatar'; tokenId: number }
  | { variant: 'picker'; tokenId: number }
  | { variant: 'card'; tokenId: number; hasStar: boolean; name: string };

/**
 * Unified Skrumpey NFT image. Collapses the former ProfileAvatar / NFTImage /
 * AvatarPickerImage components — same loader, three markup shapes:
 *  - `avatar`: 80×80 bordered thumbnail (profile header).
 *  - `card`:   responsive aspect-square tile with fade-in + lazy load (grid).
 *  - `picker`: bare object-cover image for the avatar-selection modal.
 */
export default function SkrumpeyImage(props: SkrumpeyImageProps) {
  const { tokenId } = props;
  const { imageUrl, imageLoaded, imageError, setImageLoaded, handleImageError } =
    useSkrumpeyImage(tokenId);

  if (props.variant === 'avatar') {
    if (imageError) {
      return (
        <div className="w-20 h-20 bg-gradient-to-br from-[#9966ff] to-[#ffd700] rounded-lg flex items-center justify-center text-3xl">
          🐸
        </div>
      );
    }
    return (
      <div className="w-20 h-20 rounded-lg overflow-hidden border-2 border-[#ffd700]">
        <img
          src={imageUrl}
          alt={`Skrumpey #${tokenId}`}
          className="w-full h-full object-cover"
          onError={handleImageError}
        />
      </div>
    );
  }

  if (props.variant === 'picker') {
    if (imageError) {
      return (
        <div className="w-full h-full bg-gradient-to-br from-[#9966ff] to-[#ffd700] flex items-center justify-center text-2xl">
          🐸
        </div>
      );
    }
    return (
      <img
        src={imageUrl}
        alt={`Skrumpey #${tokenId}`}
        className="w-full h-full object-cover"
        onError={handleImageError}
      />
    );
  }

  // variant === 'card'
  const { hasStar, name } = props;
  return (
    <div className={`w-full aspect-square rounded-lg mb-3 overflow-hidden relative smooth-transition hover-lift ${
      hasStar
        ? 'bg-gradient-to-br from-[#9966ff]/30 to-[#ffd700]/30'
        : 'bg-[#0a0a15]'
    }`}>
      {/* Show placeholder while loading or on error */}
      {(!imageLoaded || imageError) && (
        <div className="absolute inset-0 flex items-center justify-center text-4xl">
          <span className="animate-pixel-float" style={{ animationDelay: `${tokenId % 3 * 0.3}s` }}>
            🐸
          </span>
        </div>
      )}

      {/* Actual NFT image */}
      {!imageError && (
        <img
          src={imageUrl}
          alt={name}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setImageLoaded(true)}
          onError={handleImageError}
          loading="lazy"
        />
      )}
    </div>
  );
}
