// Shared types for the raffle cluster.
// Extracted from RaffleContent.tsx so both the component and the useRaffles
// hook can type against them without a circular import.

export interface HolderTierInfo {
  minStars: number;
  entries: number;
  name: string;
}

export interface HolderTiers {
  cosmic_emperor: HolderTierInfo;
  star_lord: HolderTierInfo;
  cosmic_warden: HolderTierInfo;
  star_forged: HolderTierInfo;
}

export interface Raffle {
  id: string;
  name: string;
  description: string;
  prize_description: string;
  prize_image_url: string | null;
  status: 'active' | 'ended' | 'drawn' | 'cancelled';
  created_by: string;
  start_time: string;
  end_time: string;
  winner_address: string | null;
  winner_drawn_at: string | null;
  winner_draw_seed: string | null;
  discord_bonus_enabled: number;
  require_x: number;
  require_discord: number;
  tweet_url: string | null;
  is_public: number;
  userEntry?: RaffleEntry | null;
}

export interface RaffleEntry {
  id: number;
  raffle_id: string;
  wallet_address: string;
  tier: string;
  entries_count: number;
  discord_bonus: number;
  engagement_bonus: number;
  star_count: number;
  entered_at: string;
  display_name?: string;
}

export interface SocialConnections {
  hasDiscord: boolean;
  hasX: boolean;
  discord?: { username: string; platform_user_id: string };
  x?: { username: string; platform_user_id: string };
}

export interface RaffleStats {
  participants: number;
  totalTickets: number;
}

export interface UserTier {
  tier: string;
  entries: number;
  name: string;
  minStars?: number;
  breakdown?: string;
  regularSkrumpeys?: number;
  starBonus?: number;
  totalSkrumpeys?: number;
}

// Extended per-raffle data assembled by the detail fetch.
export interface ActiveRaffleData {
  raffle: Raffle;
  entries: RaffleEntry[];
  stats: RaffleStats;
  userEntry: RaffleEntry | null;
  socialConnections: SocialConnections | null;
  userTier: UserTier | null;
}
