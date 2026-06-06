/**
 * FRIENDS SYSTEM — db helpers. Extracted from the lib/db.ts god-file.
 * Handle via ./connection.
 */
import { getDatabase } from './connection';


export type FriendStatus = 'pending' | 'accepted' | 'blocked';

export interface Friend {
  id: number;
  user_address: string;
  friend_address: string;
  status: FriendStatus;
  created_at: string;
  updated_at: string;
}

export interface FriendWithProfile extends Friend {
  display_name?: string;
  bio?: string;
}

/**
 * Send a friend request
 */
export function sendFriendRequest(userAddress: string, friendAddress: string): Friend | null {
  const db = getDatabase();
  const normalizedUser = userAddress.toLowerCase();
  const normalizedFriend = friendAddress.toLowerCase();
  
  // Can't friend yourself
  if (normalizedUser === normalizedFriend) {
    return null;
  }
  
  // Check if relationship already exists
  const existing = db.prepare(`
    SELECT * FROM friends 
    WHERE (user_address = ? AND friend_address = ?)
    OR (user_address = ? AND friend_address = ?)
  `).get(normalizedUser, normalizedFriend, normalizedFriend, normalizedUser) as Friend | undefined;
  
  if (existing) {
    return existing;
  }
  
  // Create new friend request
  const stmt = db.prepare(`
    INSERT INTO friends (user_address, friend_address, status)
    VALUES (?, ?, 'pending')
  `);
  
  const result = stmt.run(normalizedUser, normalizedFriend);
  
  const getStmt = db.prepare('SELECT * FROM friends WHERE id = ?');
  return getStmt.get(result.lastInsertRowid) as Friend;
}

/**
 * Accept a friend request
 */
export function acceptFriendRequest(userAddress: string, friendAddress: string): Friend | null {
  const db = getDatabase();
  const normalizedUser = userAddress.toLowerCase();
  const normalizedFriend = friendAddress.toLowerCase();
  
  // Find the pending request (where friend_address is the current user)
  const request = db.prepare(`
    SELECT * FROM friends 
    WHERE user_address = ? AND friend_address = ? AND status = 'pending'
  `).get(normalizedFriend, normalizedUser) as Friend | undefined;
  
  if (!request) {
    return null;
  }
  
  // Update to accepted
  db.prepare(`
    UPDATE friends 
    SET status = 'accepted', updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(request.id);
  
  return db.prepare('SELECT * FROM friends WHERE id = ?').get(request.id) as Friend;
}

/**
 * Decline/reject a friend request
 */
export function declineFriendRequest(userAddress: string, friendAddress: string): boolean {
  const db = getDatabase();
  const normalizedUser = userAddress.toLowerCase();
  const normalizedFriend = friendAddress.toLowerCase();
  
  const result = db.prepare(`
    DELETE FROM friends 
    WHERE user_address = ? AND friend_address = ? AND status = 'pending'
  `).run(normalizedFriend, normalizedUser);
  
  return result.changes > 0;
}

/**
 * Remove a friend (unfriend)
 */
export function removeFriend(userAddress: string, friendAddress: string): boolean {
  const db = getDatabase();
  const normalizedUser = userAddress.toLowerCase();
  const normalizedFriend = friendAddress.toLowerCase();
  
  const result = db.prepare(`
    DELETE FROM friends 
    WHERE ((user_address = ? AND friend_address = ?) OR (user_address = ? AND friend_address = ?))
    AND status = 'accepted'
  `).run(normalizedUser, normalizedFriend, normalizedFriend, normalizedUser);
  
  return result.changes > 0;
}

/**
 * Block a user
 */
export function blockUser(userAddress: string, blockAddress: string): Friend | null {
  const db = getDatabase();
  const normalizedUser = userAddress.toLowerCase();
  const normalizedBlock = blockAddress.toLowerCase();
  
  // Delete any existing relationship
  db.prepare(`
    DELETE FROM friends 
    WHERE (user_address = ? AND friend_address = ?) OR (user_address = ? AND friend_address = ?)
  `).run(normalizedUser, normalizedBlock, normalizedBlock, normalizedUser);
  
  // Create block entry
  const stmt = db.prepare(`
    INSERT INTO friends (user_address, friend_address, status)
    VALUES (?, ?, 'blocked')
  `);
  
  const result = stmt.run(normalizedUser, normalizedBlock);
  
  return db.prepare('SELECT * FROM friends WHERE id = ?').get(result.lastInsertRowid) as Friend;
}

/**
 * Get all friends (accepted) for a user
 */
export function getFriends(userAddress: string): FriendWithProfile[] {
  const db = getDatabase();
  const normalizedAddress = userAddress.toLowerCase();
  
  // Get friends where user is either the requester or the accepter
  const friends = db.prepare(`
    SELECT f.*, 
           CASE 
             WHEN f.user_address = ? THEN p2.display_name
             ELSE p1.display_name
           END as display_name,
           CASE 
             WHEN f.user_address = ? THEN p2.bio
             ELSE p1.bio
           END as bio
    FROM friends f
    LEFT JOIN user_profiles p1 ON f.user_address = p1.wallet_address
    LEFT JOIN user_profiles p2 ON f.friend_address = p2.wallet_address
    WHERE (f.user_address = ? OR f.friend_address = ?) AND f.status = 'accepted'
    ORDER BY f.updated_at DESC
  `).all(normalizedAddress, normalizedAddress, normalizedAddress, normalizedAddress) as FriendWithProfile[];
  
  return friends;
}

/**
 * Get pending friend requests (incoming)
 */
export function getPendingFriendRequests(userAddress: string): FriendWithProfile[] {
  const db = getDatabase();
  const normalizedAddress = userAddress.toLowerCase();
  
  const requests = db.prepare(`
    SELECT f.*, p.display_name, p.bio
    FROM friends f
    LEFT JOIN user_profiles p ON f.user_address = p.wallet_address
    WHERE f.friend_address = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(normalizedAddress) as FriendWithProfile[];
  
  return requests;
}

/**
 * Get outgoing friend requests (sent but not accepted)
 */
export function getOutgoingFriendRequests(userAddress: string): FriendWithProfile[] {
  const db = getDatabase();
  const normalizedAddress = userAddress.toLowerCase();
  
  const requests = db.prepare(`
    SELECT f.*, p.display_name, p.bio
    FROM friends f
    LEFT JOIN user_profiles p ON f.friend_address = p.wallet_address
    WHERE f.user_address = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(normalizedAddress) as FriendWithProfile[];
  
  return requests;
}

/**
 * Check if two users are friends
 */
export function areFriends(userAddress: string, otherAddress: string): boolean {
  const db = getDatabase();
  const normalizedUser = userAddress.toLowerCase();
  const normalizedOther = otherAddress.toLowerCase();
  
  const friend = db.prepare(`
    SELECT 1 FROM friends 
    WHERE ((user_address = ? AND friend_address = ?) OR (user_address = ? AND friend_address = ?))
    AND status = 'accepted'
    LIMIT 1
  `).get(normalizedUser, normalizedOther, normalizedOther, normalizedUser);
  
  return !!friend;
}

/**
 * Get friendship status between two users
 */
export function getFriendshipStatus(userAddress: string, otherAddress: string): {
  status: 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'blocked';
  friend?: Friend;
} {
  const db = getDatabase();
  const normalizedUser = userAddress.toLowerCase();
  const normalizedOther = otherAddress.toLowerCase();
  
  const friend = db.prepare(`
    SELECT * FROM friends 
    WHERE (user_address = ? AND friend_address = ?) OR (user_address = ? AND friend_address = ?)
    LIMIT 1
  `).get(normalizedUser, normalizedOther, normalizedOther, normalizedUser) as Friend | undefined;
  
  if (!friend) {
    return { status: 'none' };
  }
  
  if (friend.status === 'blocked') {
    return { status: 'blocked', friend };
  }
  
  if (friend.status === 'accepted') {
    return { status: 'accepted', friend };
  }
  
  // Pending - determine direction
  if (friend.user_address === normalizedUser) {
    return { status: 'pending_sent', friend };
  } else {
    return { status: 'pending_received', friend };
  }
}

/**
 * Get count of pending friend requests
 */
export function getPendingFriendRequestCount(userAddress: string): number {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM friends 
    WHERE friend_address = ? AND status = 'pending'
  `).get(userAddress.toLowerCase()) as { count: number };
  return result.count;
}
