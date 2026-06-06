// Shared types and helpers for the members page.
// Extracted from MembersContent.tsx so both the parent component and the
// analytics cluster (app/members/analytics/*) can import them without a
// circular dependency. The pure variant-style helpers are re-exported from the
// canonical lib module so they are not duplicated per-surface.

export {
  getVariantColor,
  getVariantGradient,
  isGradientVariant,
  isRareVariant,
  getVariantTextStyle,
} from '@/lib/skrumpeyVariantStyles';
export { truncateAddress } from '@/lib/format';

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