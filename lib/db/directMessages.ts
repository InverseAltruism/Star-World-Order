/**
 * DIRECT MESSAGES — db helpers. Extracted from the lib/db.ts god-file.
 * Handle via ./connection.
 */
import { getDatabase } from './connection';


export interface DirectMessage {
  id: number;
  sender_address: string;
  recipient_address: string;
  message: string;
  is_read: number;
  created_at: string;
}

export interface DirectMessageWithProfile extends DirectMessage {
  sender_display_name?: string;
  recipient_display_name?: string;
}

export interface Conversation {
  other_address: string;
  other_display_name?: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
  is_sender: boolean;
}

/**
 * Send a direct message
 */
export function sendDirectMessage(senderAddress: string, recipientAddress: string, message: string): DirectMessage | null {
  const db = getDatabase();
  const normalizedSender = senderAddress.toLowerCase();
  const normalizedRecipient = recipientAddress.toLowerCase();
  
  // Can't message yourself
  if (normalizedSender === normalizedRecipient) {
    return null;
  }
  
  // Check if user is blocked
  const isBlocked = db.prepare(`
    SELECT 1 FROM friends 
    WHERE user_address = ? AND friend_address = ? AND status = 'blocked'
    LIMIT 1
  `).get(normalizedRecipient, normalizedSender);
  
  if (isBlocked) {
    return null;
  }
  
  const stmt = db.prepare(`
    INSERT INTO direct_messages (sender_address, recipient_address, message)
    VALUES (?, ?, ?)
  `);
  
  const result = stmt.run(normalizedSender, normalizedRecipient, message);
  
  return db.prepare('SELECT * FROM direct_messages WHERE id = ?').get(result.lastInsertRowid) as DirectMessage;
}

/**
 * Get conversation between two users
 */
export function getConversation(
  userAddress: string, 
  otherAddress: string, 
  limit: number = 50,
  offset: number = 0
): DirectMessageWithProfile[] {
  const db = getDatabase();
  const normalizedUser = userAddress.toLowerCase();
  const normalizedOther = otherAddress.toLowerCase();
  
  const messages = db.prepare(`
    SELECT dm.*, 
           sp.display_name as sender_display_name,
           rp.display_name as recipient_display_name
    FROM direct_messages dm
    LEFT JOIN user_profiles sp ON dm.sender_address = sp.wallet_address
    LEFT JOIN user_profiles rp ON dm.recipient_address = rp.wallet_address
    WHERE (dm.sender_address = ? AND dm.recipient_address = ?)
    OR (dm.sender_address = ? AND dm.recipient_address = ?)
    ORDER BY dm.created_at DESC
    LIMIT ? OFFSET ?
  `).all(normalizedUser, normalizedOther, normalizedOther, normalizedUser, limit, offset) as DirectMessageWithProfile[];
  
  return messages.reverse(); // Return in chronological order
}

/**
 * Get all conversations for a user (grouped by other party)
 */
export function getConversations(userAddress: string): Conversation[] {
  const db = getDatabase();
  const normalizedAddress = userAddress.toLowerCase();
  
  // Complex query to get the latest message from each conversation
  const conversations = db.prepare(`
    WITH latest_messages AS (
      SELECT 
        CASE 
          WHEN sender_address = ? THEN recipient_address
          ELSE sender_address
        END as other_address,
        message as last_message,
        created_at as last_message_at,
        sender_address = ? as is_sender,
        ROW_NUMBER() OVER (
          PARTITION BY 
            CASE WHEN sender_address = ? THEN recipient_address ELSE sender_address END
          ORDER BY created_at DESC
        ) as rn
      FROM direct_messages
      WHERE sender_address = ? OR recipient_address = ?
    ),
    unread_counts AS (
      SELECT 
        sender_address as other_address,
        COUNT(*) as unread_count
      FROM direct_messages
      WHERE recipient_address = ? AND is_read = 0
      GROUP BY sender_address
    )
    SELECT 
      lm.other_address,
      p.display_name as other_display_name,
      lm.last_message,
      lm.last_message_at,
      COALESCE(uc.unread_count, 0) as unread_count,
      lm.is_sender
    FROM latest_messages lm
    LEFT JOIN user_profiles p ON lm.other_address = p.wallet_address
    LEFT JOIN unread_counts uc ON lm.other_address = uc.other_address
    WHERE lm.rn = 1
    ORDER BY lm.last_message_at DESC
  `).all(
    normalizedAddress, normalizedAddress, normalizedAddress, 
    normalizedAddress, normalizedAddress, normalizedAddress
  ) as Conversation[];
  
  return conversations;
}

/**
 * Mark messages as read
 */
export function markMessagesAsRead(recipientAddress: string, senderAddress: string): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE direct_messages 
    SET is_read = 1 
    WHERE recipient_address = ? AND sender_address = ? AND is_read = 0
  `).run(recipientAddress.toLowerCase(), senderAddress.toLowerCase());
}

/**
 * Mark a single message as read
 */
export function markMessageAsRead(messageId: number): void {
  const db = getDatabase();
  db.prepare('UPDATE direct_messages SET is_read = 1 WHERE id = ?').run(messageId);
}

/**
 * Get unread message count for a user
 */
export function getUnreadMessageCount(userAddress: string): number {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM direct_messages 
    WHERE recipient_address = ? AND is_read = 0
  `).get(userAddress.toLowerCase()) as { count: number };
  return result.count;
}

/**
 * Delete a message (only sender can delete)
 */
export function deleteMessage(messageId: number, senderAddress: string): boolean {
  const db = getDatabase();
  const result = db.prepare(`
    DELETE FROM direct_messages 
    WHERE id = ? AND sender_address = ?
  `).run(messageId, senderAddress.toLowerCase());
  return result.changes > 0;
}
