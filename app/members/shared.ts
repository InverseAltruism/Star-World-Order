// Shared types and pure variant helpers for the members page.
// Extracted from MembersContent.tsx so both the parent component and the
// analytics cluster (app/members/analytics/*) can import them without a
// circular dependency.

import type React from 'react';

/**
 * Member data interface from API
 */
export interface MemberData {
  address: string;
  tokenIds: number[];
  starVariants: string[];
  count: number;
  displayName?: string;
  bio?: string;
  level: number;
  lastSeen?: string;
  displayedBadges?: string[];
  avatarTokenId?: number; // User's selected avatar token ID from profile
}

/**
 * Get variant color - returns solid color for CSS color property
 * Each constellation type has a distinct color; rare traits have additional glow effects
 */
export function getVariantColor(variant?: string): string {
  const colors: Record<string, string> = {
    // Common traits
    aether: '#87CEEB',      // Light blue
    spectra: '#40E0D0',     // Turquoise (primary from gradient)
    solveil: '#FFD93D',     // Bright warm yellow (solar/sun-like)
    nebulu: '#9966ff',      // Purple
    chroma: '#DDA0DD',      // Light purple (primary from gradient)
    rose: '#FFB6C1',        // Pink
    // Rare traits - more distinctive colors
    monflare: '#BF5FFF',    // Bright purple/magenta glow
    auracore: '#FFB347',    // Warm golden-orange (distinct from solveil)
    parallel: '#00CED1',    // Dark cyan (blue-green primary)
    prime: '#FFD700',       // Pure gold for legendary
  };
  return colors[variant || ''] || '#ffd700';
}

/**
 * Get variant gradient - returns gradient or solid color for background
 * Rare traits have special gradients to make them stand out
 */
export function getVariantGradient(variant?: string): string {
  const gradients: Record<string, string> = {
    spectra: 'linear-gradient(90deg, #40E0D0, #87CEEB, #9966ff, #ffd700)', // Gradient: Turquoise -> light blue -> purple -> yellow
    chroma: 'linear-gradient(180deg, #DDA0DD, #9966ff)', // Light purple to darker purple gradient
    // Rare trait gradients
    monflare: 'linear-gradient(135deg, #9933FF, #BF5FFF, #E066FF)', // Purple glow gradient
    auracore: 'linear-gradient(135deg, #FF8C00, #FFB347, #FFD700)', // Golden glow gradient
    parallel: 'linear-gradient(90deg, #20B2AA, #00CED1, #4169E1)', // Blue-green to blue gradient
    prime: 'linear-gradient(135deg, #FFD700, #FFF8DC, #FFD700, #DAA520)', // Legendary gold shimmer
  };
  return gradients[variant || ''] || getVariantColor(variant);
}

/**
 * Check if variant has a gradient (including rare traits)
 */
export function isGradientVariant(variant?: string): boolean {
  return variant === 'spectra' || variant === 'chroma' ||
         variant === 'parallel' || variant === 'monflare' ||
         variant === 'auracore' || variant === 'prime';
}

/**
 * Check if variant is a rare trait (for special styling)
 */
export function isRareVariant(variant?: string): boolean {
  return variant === 'monflare' || variant === 'auracore' ||
         variant === 'parallel' || variant === 'prime';
}

/**
 * Get text style for variant - handles both solid colors and gradients
 * Rare variants get gradient text with glow effects
 */
export function getVariantTextStyle(variant?: string): React.CSSProperties {
  if (isGradientVariant(variant)) {
    const baseStyle: React.CSSProperties = {
      display: 'inline-block', // Required for gradient text to render properly
      background: getVariantGradient(variant),
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      color: 'transparent', // Fallback for non-webkit browsers
    };
    // Add text shadow glow for rare variants
    if (isRareVariant(variant)) {
      const glowColor = getVariantColor(variant);
      return {
        ...baseStyle,
        textShadow: `0 0 10px ${glowColor}80, 0 0 20px ${glowColor}40`,
        filter: 'brightness(1.1)',
      };
    }
    return baseStyle;
  }
  return { color: getVariantColor(variant) };
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
