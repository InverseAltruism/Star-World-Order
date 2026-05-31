/**
 * Admin Database Functions — db helpers. Extracted from the lib/db.ts god-file.
 * Handle via ./connection.
 */
import { getDatabase } from './connection';
import type { NotificationType } from './notifications';
import type { Raffle } from './raffle';


/**
 * Get all user profiles with social connections (admin function)
 */
export function getAllUsersWithSocialConnections(options?: {
  limit?: number;
  offset?: number;
  search?: string;
}): Array<{
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
}> {
  const db = getDatabase();
  const limit = options?.limit || 100;
  const offset = options?.offset || 0;
  
  try {
    let query = `
      SELECT 
        p.wallet_address,
        p.display_name,
        p.bio,
        p.created_at,
        p.updated_at,
        sd.username as discord_username,
        sd.platform_user_id as discord_user_id,
        sx.username as x_username,
        sx.platform_user_id as x_user_id,
        COALESCE(x.total_xp, 0) as total_xp,
        COALESCE(x.level, 1) as level
      FROM user_profiles p
      LEFT JOIN social_connections sd ON p.wallet_address = sd.wallet_address AND sd.platform = 'discord'
      LEFT JOIN social_connections sx ON p.wallet_address = sx.wallet_address AND sx.platform = 'x'
      LEFT JOIN user_xp x ON p.wallet_address = x.wallet_address
    `;
    
    const params: (string | number)[] = [];
    
    if (options?.search) {
      query += ` WHERE p.wallet_address LIKE ? OR p.display_name LIKE ? OR sd.username LIKE ? OR sx.username LIKE ?`;
      const searchPattern = `%${options.search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    query += ` ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const stmt = db.prepare(query);
    return stmt.all(...params) as Array<{
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
    }>;
  } catch (error) {
    console.error('Error getting all users:', error);
    return [];
  }
}

/**
 * Get total count of users
 */
export function getUserCount(): number {
  const db = getDatabase();
  try {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM user_profiles');
    const result = stmt.get() as { count: number };
    return result.count;
  } catch {
    return 0;
  }
}

/**
 * Get all notifications (admin function for viewing notification history)
 */
export function getAllNotifications(options?: {
  limit?: number;
  offset?: number;
  type?: NotificationType;
}): Notification[] {
  const db = getDatabase();
  const limit = options?.limit || 100;
  const offset = options?.offset || 0;
  
  try {
    let query = 'SELECT * FROM notifications';
    const params: (string | number)[] = [];
    
    if (options?.type) {
      query += ' WHERE type = ?';
      params.push(options.type);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const stmt = db.prepare(query);
    return stmt.all(...params) as Notification[];
  } catch {
    return [];
  }
}

/**
 * Get total count of notifications
 */
export function getNotificationCount(): number {
  const db = getDatabase();
  try {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM notifications');
    const result = stmt.get() as { count: number };
    return result.count;
  } catch {
    return 0;
  }
}

/**
 * Update an existing notification (admin function)
 */
export function updateNotification(
  notificationId: number,
  data: {
    title?: string;
    message?: string;
    type?: NotificationType;
    icon?: string;
    link?: string | null;
  }
): Notification | null {
  const db = getDatabase();
  
  try {
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    
    if (data.title !== undefined) {
      updates.push('title = ?');
      params.push(data.title);
    }
    if (data.message !== undefined) {
      updates.push('message = ?');
      params.push(data.message);
    }
    if (data.type !== undefined) {
      updates.push('type = ?');
      params.push(data.type);
    }
    if (data.icon !== undefined) {
      updates.push('icon = ?');
      params.push(data.icon);
    }
    if (data.link !== undefined) {
      updates.push('link = ?');
      params.push(data.link);
    }
    
    if (updates.length === 0) {
      return null;
    }
    
    params.push(notificationId);
    
    const stmt = db.prepare(`
      UPDATE notifications 
      SET ${updates.join(', ')}
      WHERE id = ?
    `);
    
    stmt.run(...params);
    
    const getStmt = db.prepare('SELECT * FROM notifications WHERE id = ?');
    return getStmt.get(notificationId) as Notification | null;
  } catch (error) {
    console.error('Error updating notification:', error);
    return null;
  }
}

/**
 * Get database statistics (admin function)
 */
export function getDatabaseStats(): {
  users: number;
  notifications: number;
  chatMessages: number;
  raffles: number;
  raffleEntries: number;
  friends: number;
  directMessages: number;
  voiceSessions: number;
  socialConnections: number;
} {
  const db = getDatabase();
  
  try {
    const counts = {
      users: (db.prepare('SELECT COUNT(*) as count FROM user_profiles').get() as { count: number }).count,
      notifications: (db.prepare('SELECT COUNT(*) as count FROM notifications').get() as { count: number }).count,
      chatMessages: (db.prepare('SELECT COUNT(*) as count FROM chat_messages').get() as { count: number }).count,
      raffles: 0,
      raffleEntries: 0,
      friends: (db.prepare('SELECT COUNT(*) as count FROM friends').get() as { count: number }).count,
      directMessages: (db.prepare('SELECT COUNT(*) as count FROM direct_messages').get() as { count: number }).count,
      voiceSessions: (db.prepare('SELECT COUNT(*) as count FROM voice_sessions').get() as { count: number }).count,
      socialConnections: (db.prepare('SELECT COUNT(*) as count FROM social_connections').get() as { count: number }).count,
    };
    
    // These tables might not exist
    try {
      counts.raffles = (db.prepare('SELECT COUNT(*) as count FROM raffles').get() as { count: number }).count;
    } catch { /* table might not exist */ }
    try {
      counts.raffleEntries = (db.prepare('SELECT COUNT(*) as count FROM raffle_entries').get() as { count: number }).count;
    } catch { /* table might not exist */ }
    
    return counts;
  } catch (error) {
    console.error('Error getting database stats:', error);
    return {
      users: 0,
      notifications: 0,
      chatMessages: 0,
      raffles: 0,
      raffleEntries: 0,
      friends: 0,
      directMessages: 0,
      voiceSessions: 0,
      socialConnections: 0,
    };
  }
}

/**
 * Clean up old chat messages (admin function)
 */
export function cleanupChatMessages(olderThanHours: number = 24): number {
  const db = getDatabase();
  try {
    const stmt = db.prepare(`
      DELETE FROM chat_messages 
      WHERE datetime(created_at) < datetime('now', '-' || ? || ' hours')
    `);
    const result = stmt.run(olderThanHours);
    return result.changes;
  } catch {
    return 0;
  }
}

/**
 * Clean up stale online presence (admin function)
 */
export function cleanupOnlinePresence(olderThanMinutes: number = 10): number {
  const db = getDatabase();
  try {
    const stmt = db.prepare(`
      DELETE FROM online_presence 
      WHERE datetime(last_seen) < datetime('now', '-' || ? || ' minutes')
    `);
    const result = stmt.run(olderThanMinutes);
    return result.changes;
  } catch {
    return 0;
  }
}

/**
 * Clean up old direct messages (admin function)
 */
export function cleanupDirectMessages(olderThanDays: number = 90): number {
  const db = getDatabase();
  try {
    const stmt = db.prepare(`
      DELETE FROM direct_messages 
      WHERE datetime(created_at) < datetime('now', '-' || ? || ' days')
    `);
    const result = stmt.run(olderThanDays);
    return result.changes;
  } catch {
    return 0;
  }
}

/**
 * Clean up old raffle result views (admin function)
 */
export function cleanupRaffleResultViews(olderThanDays: number = 30): number {
  const db = getDatabase();
  try {
    const stmt = db.prepare(`
      DELETE FROM raffle_result_views 
      WHERE datetime(viewed_at) < datetime('now', '-' || ? || ' days')
    `);
    const result = stmt.run(olderThanDays);
    return result.changes;
  } catch {
    return 0;
  }
}

/**
 * Get drawn raffles with winners (admin function)
 */
export function getDrawnRaffles(limit: number = 20): Raffle[] {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT * FROM raffles 
      WHERE status = 'drawn' AND winner_address IS NOT NULL
      ORDER BY winner_drawn_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as Raffle[];
  } catch {
    return [];
  }
}

/**
 * Get raffle winner with full user details (admin function)
 */
export function getRaffleWinnerDetails(walletAddress: string): {
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
} | null {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT 
        COALESCE(p.wallet_address, ?) as wallet_address,
        p.display_name,
        p.bio,
        sd.username as discord_username,
        sd.platform_user_id as discord_user_id,
        sx.username as x_username,
        sx.platform_user_id as x_user_id,
        COALESCE(x.total_xp, 0) as total_xp,
        COALESCE(x.level, 1) as level,
        COALESCE(p.created_at, datetime('now')) as created_at
      FROM (SELECT ? as addr) t
      LEFT JOIN user_profiles p ON p.wallet_address = t.addr
      LEFT JOIN social_connections sd ON t.addr = sd.wallet_address AND sd.platform = 'discord'
      LEFT JOIN social_connections sx ON t.addr = sx.wallet_address AND sx.platform = 'x'
      LEFT JOIN user_xp x ON t.addr = x.wallet_address
    `);
    
    const result = stmt.get(walletAddress.toLowerCase(), walletAddress.toLowerCase());
    return result as {
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
    } | null;
  } catch (error) {
    console.error('Error getting raffle winner details:', error);
    return null;
  }
}
