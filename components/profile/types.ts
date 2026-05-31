/**
 * Shared data types for ProfileCard and its extracted data hooks.
 * Lives in a standalone module to avoid a circular import between the
 * parent component (which imports the hooks) and the hooks (which need
 * these interfaces).
 */

/**
 * Friend data interface
 */
export interface FriendWithProfileData {
  id: number;
  user_address: string;
  friend_address: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  updated_at: string;
  display_name?: string;
  bio?: string;
}

/**
 * Conversation data interface
 */
export interface ConversationData {
  other_address: string;
  other_display_name?: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  is_sender: boolean;
}

/**
 * Direct message data interface
 */
export interface DirectMessageData {
  id: number;
  sender_address: string;
  recipient_address: string;
  message: string;
  is_read: number;
  created_at: string;
  sender_display_name?: string;
  recipient_display_name?: string;
}

/**
 * Notification data interface
 */
export interface NotificationData {
  id: number;
  wallet_address: string;
  type: 'quest' | 'achievement' | 'system' | 'social' | 'governance';
  title: string;
  message: string;
  link: string | null;
  icon: string;
  is_read: number;
  created_at: string;
}

/**
 * Raffle history data interface
 */
export interface RaffleHistoryEntry {
  id: number;
  raffle_id: string;
  wallet_address: string;
  tier: string;
  entries_count: number;
  discord_bonus: number;
  engagement_bonus: number;
  star_count: number;
  entered_at: string;
  won: boolean;
  hasViewed?: boolean; // Whether user has viewed this raffle result
  raffle: {
    id: string;
    name: string;
    description: string;
    status: 'active' | 'ended' | 'drawn' | 'cancelled';
    prize_description: string;
    prize_image_url: string | null;
    start_time: string;
    end_time: string;
    winner_address: string | null;
    winner_drawn_at: string | null;
    winner_draw_seed: string | null;
  };
}
