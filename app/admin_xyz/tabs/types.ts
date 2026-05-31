// Shared types for the admin dashboard tabs.
// Extracted from AdminContent.tsx as part of the per-tab split.

export interface CacheStats {
  nftCache: { entries: number; oldestEntry: number | null };
  activityCache: { entries: number; oldestEntry: number | null };
  transactionCache: { entries: number; oldestEntry: number | null };
  floorPriceCache: { entries: number; oldestEntry: number | null };
  totalEntries: number;
}

export interface HealthData {
  status: string;
  timestamp: string;
  environment: string;
  cacheStats: CacheStats;
  blockvisionApiConfigured: boolean;
}

export interface Notification {
  id: number;
  wallet_address: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  icon: string;
  is_read: number;
  created_at: string;
}

export interface Raffle {
  id: string;
  name: string;
  description: string;
  prize_description: string;
  prize_image_url: string | null;
  status: 'active' | 'ended' | 'drawn' | 'cancelled';
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
  created_at: string;
}

export interface RaffleStats {
  participants: number;
  totalTickets: number;
}

export interface UserData {
  wallet_address: string;
  display_name: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
  discord_username: string | null;
  discord_user_id: string | null;
  x_username: string | null;
  x_user_id: string | null;
  total_xp: number;
  level: number;
}

export interface WinnerDetails {
  wallet_address: string;
  display_name: string | null;
  bio: string | null;
  discord_username: string | null;
  discord_user_id: string | null;
  x_username: string | null;
  x_user_id: string | null;
  total_xp: number;
  level: number;
  created_at: string;
  // Raffle context
  raffle_name?: string;
  raffle_prize?: string;
  raffle_date?: string | null;
}

export interface DatabaseStats {
  users: number;
  notifications: number;
  chatMessages: number;
  raffles: number;
  raffleEntries: number;
  friends: number;
  directMessages: number;
  voiceSessions: number;
  socialConnections: number;
}

export interface ActionResult {
  success: boolean;
  message: string;
}
