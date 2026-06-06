/**
 * Forum System Database Functions (with likes and edits) — db helpers. Extracted from the lib/db.ts god-file.
 * Handle via ./connection.
 */
import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { getDatabase } from './connection';


export type ForumCategory = 'general' | 'governance' | 'proposals' | 'ideas' | 'support' | 'announcements';

export interface ForumThreadDB {
  id: string;
  title: string;
  content: string;
  original_content: string | null;
  author_address: string;
  author_display_name?: string | null;
  category: ForumCategory;
  proposal_id: string | null;
  pinned: number;
  locked: number;
  likes_count: number;
  dislikes_count: number;
  is_edited: number;
  reply_count?: number;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
}

export interface ForumReplyDB {
  id: string;
  thread_id: string;
  content: string;
  original_content: string | null;
  author_address: string;
  author_display_name?: string | null;
  likes_count: number;
  dislikes_count: number;
  is_edited: number;
  created_at: string;
  edited_at: string | null;
}

export interface ForumLike {
  id: number;
  user_address: string;
  target_id: string;
  target_type: 'thread' | 'reply';
  like_type: 'like' | 'dislike';
  created_at: string;
}

/**
 * Create a new forum thread
 */
export function createForumThread(data: {
  title: string;
  content: string;
  authorAddress: string;
  category: ForumCategory;
  proposalId?: string;
}): ForumThreadDB {
  const db = getDatabase();
  
  const id = `thread-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  
  const stmt = db.prepare(`
    INSERT INTO forum_threads (id, title, content, author_address, category, proposal_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id,
    data.title,
    data.content,
    data.authorAddress.toLowerCase(),
    data.category,
    data.proposalId || null
  );
  
  const getStmt = db.prepare('SELECT * FROM forum_threads WHERE id = ?');
  return getStmt.get(id) as ForumThreadDB;
}

/**
 * Get all forum threads
 */
export function getForumThreads(options?: {
  category?: ForumCategory;
  limit?: number;
  offset?: number;
}): ForumThreadDB[] {
  const db = getDatabase();
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  
  try {
    let query = `
      SELECT 
        t.*,
        p.display_name as author_display_name,
        (SELECT COUNT(*) FROM forum_replies WHERE thread_id = t.id) as reply_count
      FROM forum_threads t
      LEFT JOIN user_profiles p ON LOWER(t.author_address) = LOWER(p.wallet_address)
    `;
    const params: (string | number)[] = [];
    
    if (options?.category) {
      query += ' WHERE t.category = ?';
      params.push(options.category);
    }
    
    query += ' ORDER BY t.pinned DESC, t.updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const stmt = db.prepare(query);
    return stmt.all(...params) as ForumThreadDB[];
  } catch (error) {
    logger.error('Error getting forum threads', { error: String(error) });
    return [];
  }
}

/**
 * Get a forum thread by ID with replies
 */
export function getForumThreadById(threadId: string): ForumThreadDB | null {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT 
        t.*,
        p.display_name as author_display_name
      FROM forum_threads t
      LEFT JOIN user_profiles p ON LOWER(t.author_address) = LOWER(p.wallet_address)
      WHERE t.id = ?
    `);
    return stmt.get(threadId) as ForumThreadDB | null;
  } catch {
    return null;
  }
}

/**
 * Get replies for a thread
 */
export function getForumReplies(threadId: string): ForumReplyDB[] {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare(`
      SELECT 
        r.*,
        p.display_name as author_display_name
      FROM forum_replies r
      LEFT JOIN user_profiles p ON LOWER(r.author_address) = LOWER(p.wallet_address)
      WHERE r.thread_id = ? 
      ORDER BY r.created_at ASC
    `);
    return stmt.all(threadId) as ForumReplyDB[];
  } catch {
    return [];
  }
}

/**
 * Add a reply to a thread
 */
export function addForumReply(data: {
  threadId: string;
  content: string;
  authorAddress: string;
}): { success: boolean; error?: string; reply?: ForumReplyDB } {
  const db = getDatabase();
  
  try {
    // Check if thread exists and is not locked
    const thread = getForumThreadById(data.threadId);
    if (!thread) {
      return { success: false, error: 'Thread not found' };
    }
    if (thread.locked) {
      return { success: false, error: 'Thread is locked' };
    }
    
    const id = `reply-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    
    const insertStmt = db.prepare(`
      INSERT INTO forum_replies (id, thread_id, content, author_address)
      VALUES (?, ?, ?, ?)
    `);
    insertStmt.run(id, data.threadId, data.content, data.authorAddress.toLowerCase());
    
    // Update thread updated_at
    const updateStmt = db.prepare('UPDATE forum_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    updateStmt.run(data.threadId);
    
    const getStmt = db.prepare('SELECT * FROM forum_replies WHERE id = ?');
    const reply = getStmt.get(id) as ForumReplyDB;
    
    return { success: true, reply };
  } catch (error) {
    logger.error('Error adding forum reply', { error: String(error) });
    return { success: false, error: 'Failed to add reply' };
  }
}

/**
 * Edit a forum thread (only by author)
 */
export function editForumThread(data: {
  threadId: string;
  newContent: string;
  authorAddress: string;
}): { success: boolean; error?: string; thread?: ForumThreadDB } {
  const db = getDatabase();
  
  try {
    const thread = getForumThreadById(data.threadId);
    if (!thread) {
      return { success: false, error: 'Thread not found' };
    }
    if (thread.author_address.toLowerCase() !== data.authorAddress.toLowerCase()) {
      return { success: false, error: 'Only the author can edit this thread' };
    }
    
    // Store original content if first edit
    const originalContent = thread.is_edited === 0 ? thread.content : thread.original_content;
    
    const stmt = db.prepare(`
      UPDATE forum_threads 
      SET content = ?, original_content = ?, is_edited = 1, edited_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(data.newContent, originalContent, data.threadId);
    
    const updatedThread = getForumThreadById(data.threadId);
    return { success: true, thread: updatedThread || undefined };
  } catch (error) {
    logger.error('Error editing forum thread', { error: String(error) });
    return { success: false, error: 'Failed to edit thread' };
  }
}

/**
 * Edit a forum reply (only by author)
 */
export function editForumReply(data: {
  replyId: string;
  newContent: string;
  authorAddress: string;
}): { success: boolean; error?: string; reply?: ForumReplyDB } {
  const db = getDatabase();
  
  try {
    const getStmt = db.prepare('SELECT * FROM forum_replies WHERE id = ?');
    const reply = getStmt.get(data.replyId) as ForumReplyDB | undefined;
    
    if (!reply) {
      return { success: false, error: 'Reply not found' };
    }
    if (reply.author_address.toLowerCase() !== data.authorAddress.toLowerCase()) {
      return { success: false, error: 'Only the author can edit this reply' };
    }
    
    // Store original content if first edit
    const originalContent = reply.is_edited === 0 ? reply.content : reply.original_content;
    
    const updateStmt = db.prepare(`
      UPDATE forum_replies 
      SET content = ?, original_content = ?, is_edited = 1, edited_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    updateStmt.run(data.newContent, originalContent, data.replyId);
    
    const updatedReply = db.prepare('SELECT * FROM forum_replies WHERE id = ?').get(data.replyId) as ForumReplyDB;
    return { success: true, reply: updatedReply };
  } catch (error) {
    logger.error('Error editing forum reply', { error: String(error) });
    return { success: false, error: 'Failed to edit reply' };
  }
}

/**
 * Like or dislike a thread/reply
 */
export function toggleForumLike(data: {
  userAddress: string;
  targetId: string;
  targetType: 'thread' | 'reply';
  likeType: 'like' | 'dislike';
}): { success: boolean; action: 'added' | 'removed' | 'changed'; error?: string } {
  const db = getDatabase();
  
  try {
    // Check if user already has a like/dislike on this target
    const checkStmt = db.prepare('SELECT * FROM forum_likes WHERE user_address = ? AND target_id = ? AND target_type = ?');
    const existingLike = checkStmt.get(data.userAddress.toLowerCase(), data.targetId, data.targetType) as ForumLike | undefined;
    
    const tableName = data.targetType === 'thread' ? 'forum_threads' : 'forum_replies';
    
    if (existingLike) {
      if (existingLike.like_type === data.likeType) {
        // Remove existing like/dislike
        const deleteStmt = db.prepare('DELETE FROM forum_likes WHERE id = ?');
        deleteStmt.run(existingLike.id);
        
        // Decrement count
        const column = data.likeType === 'like' ? 'likes_count' : 'dislikes_count';
        const updateStmt = db.prepare(`UPDATE ${tableName} SET ${column} = ${column} - 1 WHERE id = ?`);
        updateStmt.run(data.targetId);
        
        return { success: true, action: 'removed' };
      } else {
        // Change from like to dislike or vice versa
        const updateLikeStmt = db.prepare('UPDATE forum_likes SET like_type = ? WHERE id = ?');
        updateLikeStmt.run(data.likeType, existingLike.id);
        
        // Update counts (decrement old, increment new)
        const oldColumn = existingLike.like_type === 'like' ? 'likes_count' : 'dislikes_count';
        const newColumn = data.likeType === 'like' ? 'likes_count' : 'dislikes_count';
        const updateStmt = db.prepare(`UPDATE ${tableName} SET ${oldColumn} = ${oldColumn} - 1, ${newColumn} = ${newColumn} + 1 WHERE id = ?`);
        updateStmt.run(data.targetId);
        
        return { success: true, action: 'changed' };
      }
    } else {
      // Add new like/dislike
      const insertStmt = db.prepare(`
        INSERT INTO forum_likes (user_address, target_id, target_type, like_type)
        VALUES (?, ?, ?, ?)
      `);
      insertStmt.run(data.userAddress.toLowerCase(), data.targetId, data.targetType, data.likeType);
      
      // Increment count
      const column = data.likeType === 'like' ? 'likes_count' : 'dislikes_count';
      const updateStmt = db.prepare(`UPDATE ${tableName} SET ${column} = ${column} + 1 WHERE id = ?`);
      updateStmt.run(data.targetId);
      
      return { success: true, action: 'added' };
    }
  } catch (error) {
    logger.error('Error toggling forum like', { error: String(error) });
    return { success: false, action: 'added', error: 'Failed to toggle like' };
  }
}

/**
 * Get user's like status on a target
 */
export function getUserLikeStatus(userAddress: string, targetId: string, targetType: 'thread' | 'reply'): ForumLike | null {
  const db = getDatabase();
  
  try {
    const stmt = db.prepare('SELECT * FROM forum_likes WHERE user_address = ? AND target_id = ? AND target_type = ?');
    return stmt.get(userAddress.toLowerCase(), targetId, targetType) as ForumLike | null;
  } catch {
    return null;
  }
}

/**
 * Get multiple like statuses for a user (for threads list)
 */
export function getUserLikeStatuses(userAddress: string, targetIds: string[], targetType: 'thread' | 'reply'): Map<string, ForumLike> {
  const db = getDatabase();
  const result = new Map<string, ForumLike>();

  if (targetIds.length === 0) return result;

  try {
    const placeholders = targetIds.map(() => '?').join(',');
    const stmt = db.prepare(`
      SELECT * FROM forum_likes
      WHERE user_address = ? AND target_type = ? AND target_id IN (${placeholders})
    `);
    const likes = stmt.all(userAddress.toLowerCase(), targetType, ...targetIds) as ForumLike[];

    for (const like of likes) {
      result.set(like.target_id, like);
    }

    return result;
  } catch {
    return result;
  }
}
