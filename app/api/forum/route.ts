/**
 * Forum API Route
 * 
 * Star Council Forum system with database-backed threads and replies.
 * Provides endpoints for:
 * - Creating threads and replies
 * - Editing posts (with edit history)
 * - Liking/disliking posts
 * - Getting forum data
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createForumThread,
  getForumThreads,
  getForumThreadById,
  getForumReplies,
  addForumReply,
  editForumThread,
  editForumReply,
  toggleForumLike,
  getUserLikeStatus,
  getUserLikeStatuses,
  ForumCategory,
} from '@/lib/db';
import { logger } from '@/lib/logger';
import { verifyWalletAccess } from '@/lib/walletAuth';

/**
 * GET /api/forum
 * 
 * Get forum threads and replies
 * Query params:
 * - action: 'threads' | 'thread' | 'replies' | 'likeStatus' | 'likeStatuses'
 * - id: thread ID (for thread, replies)
 * - category: filter by category
 * - address: user address (for likeStatus, likeStatuses)
 * - targetIds: comma-separated target IDs (for likeStatuses)
 * - targetType: 'thread' | 'reply' (for likeStatus, likeStatuses)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'threads';
    const threadId = searchParams.get('id');
    const category = searchParams.get('category') as ForumCategory | null;
    const address = searchParams.get('address');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Get all threads
    if (action === 'threads') {
      const threads = getForumThreads({
        category: category || undefined,
        limit,
        offset,
      });
      
      return NextResponse.json({
        success: true,
        threads,
      });
    }

    // Get single thread with replies
    if (action === 'thread') {
      if (!threadId) {
        return NextResponse.json(
          { success: false, error: 'Thread ID required' },
          { status: 400 }
        );
      }

      const thread = getForumThreadById(threadId);
      if (!thread) {
        return NextResponse.json(
          { success: false, error: 'Thread not found' },
          { status: 404 }
        );
      }

      const replies = getForumReplies(threadId);

      return NextResponse.json({
        success: true,
        thread,
        replies,
      });
    }

    // Get replies for a thread
    if (action === 'replies') {
      if (!threadId) {
        return NextResponse.json(
          { success: false, error: 'Thread ID required' },
          { status: 400 }
        );
      }

      const replies = getForumReplies(threadId);
      return NextResponse.json({
        success: true,
        replies,
      });
    }

    // Get user's like status on a single target
    if (action === 'likeStatus') {
      const targetId = searchParams.get('targetId');
      const targetType = searchParams.get('targetType') as 'thread' | 'reply';

      if (!address || !targetId || !targetType) {
        return NextResponse.json(
          { success: false, error: 'Address, targetId, and targetType required' },
          { status: 400 }
        );
      }

      const likeStatus = getUserLikeStatus(address, targetId, targetType);
      return NextResponse.json({
        success: true,
        likeStatus,
      });
    }

    // Get user's like statuses for multiple targets
    if (action === 'likeStatuses') {
      const targetIds = searchParams.get('targetIds')?.split(',') || [];
      const targetType = searchParams.get('targetType') as 'thread' | 'reply';

      if (!address || targetIds.length === 0 || !targetType) {
        return NextResponse.json(
          { success: false, error: 'Address, targetIds, and targetType required' },
          { status: 400 }
        );
      }

      const likeStatuses = getUserLikeStatuses(address, targetIds, targetType);
      // Convert Map to object for JSON serialization
      const statusesObj: Record<string, { like_type: string }> = {};
      likeStatuses.forEach((like, id) => {
        statusesObj[id] = { like_type: like.like_type };
      });

      return NextResponse.json({
        success: true,
        likeStatuses: statusesObj,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('Forum API GET error:', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/forum
 * 
 * Create threads, replies, edit posts, and toggle likes
 * Body:
 * - action: 'createThread' | 'reply' | 'editThread' | 'editReply' | 'toggleLike'
 * - For createThread: title, content, authorAddress, category, proposalId (optional)
 * - For reply: threadId, content, authorAddress
 * - For editThread: threadId, newContent, authorAddress
 * - For editReply: replyId, newContent, authorAddress
 * - For toggleLike: userAddress, targetId, targetType, likeType ('like' | 'dislike')
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    const actionToAddressKey: Record<string, string> = {
      createThread: 'authorAddress',
      reply: 'authorAddress',
      editThread: 'authorAddress',
      editReply: 'authorAddress',
      toggleLike: 'userAddress',
    };
    const addressKey = actionToAddressKey[action];
    if (addressKey) {
      const actionAddress = body[addressKey];
      const auth = await verifyWalletAccess(request, actionAddress);
      if (!auth.valid) {
        return NextResponse.json(
          { success: false, error: auth.error },
          { status: 401 }
        );
      }
    }

    // Create a new thread
    if (action === 'createThread') {
      const { title, content, authorAddress, category, proposalId } = body;

      if (!title || !content || !authorAddress) {
        return NextResponse.json(
          { success: false, error: 'Title, content, and authorAddress are required' },
          { status: 400 }
        );
      }

      const validCategories: ForumCategory[] = ['general', 'governance', 'proposals', 'ideas', 'support', 'announcements'];
      const threadCategory = validCategories.includes(category) ? category : 'general';

      const thread = createForumThread({
        title,
        content,
        authorAddress,
        category: threadCategory,
        proposalId,
      });

      logger.info('Forum: Thread created', { threadId: thread.id, title });
      return NextResponse.json({
        success: true,
        thread,
      });
    }

    // Add a reply to a thread
    if (action === 'reply') {
      const { threadId, content, authorAddress } = body;

      if (!threadId || !content || !authorAddress) {
        return NextResponse.json(
          { success: false, error: 'ThreadId, content, and authorAddress are required' },
          { status: 400 }
        );
      }

      const result = addForumReply({
        threadId,
        content,
        authorAddress,
      });

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }

      logger.info('Forum: Reply added', { threadId, replyId: result.reply?.id });
      return NextResponse.json({
        success: true,
        reply: result.reply,
      });
    }

    // Edit a thread
    if (action === 'editThread') {
      const { threadId, newContent, authorAddress } = body;

      if (!threadId || !newContent || !authorAddress) {
        return NextResponse.json(
          { success: false, error: 'ThreadId, newContent, and authorAddress are required' },
          { status: 400 }
        );
      }

      const result = editForumThread({
        threadId,
        newContent,
        authorAddress,
      });

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }

      logger.info('Forum: Thread edited', { threadId });
      return NextResponse.json({
        success: true,
        thread: result.thread,
      });
    }

    // Edit a reply
    if (action === 'editReply') {
      const { replyId, newContent, authorAddress } = body;

      if (!replyId || !newContent || !authorAddress) {
        return NextResponse.json(
          { success: false, error: 'ReplyId, newContent, and authorAddress are required' },
          { status: 400 }
        );
      }

      const result = editForumReply({
        replyId,
        newContent,
        authorAddress,
      });

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }

      logger.info('Forum: Reply edited', { replyId });
      return NextResponse.json({
        success: true,
        reply: result.reply,
      });
    }

    // Toggle like/dislike
    if (action === 'toggleLike') {
      const { userAddress, targetId, targetType, likeType } = body;

      if (!userAddress || !targetId || !targetType || !likeType) {
        return NextResponse.json(
          { success: false, error: 'UserAddress, targetId, targetType, and likeType are required' },
          { status: 400 }
        );
      }

      if (!['thread', 'reply'].includes(targetType)) {
        return NextResponse.json(
          { success: false, error: 'Invalid targetType' },
          { status: 400 }
        );
      }

      if (!['like', 'dislike'].includes(likeType)) {
        return NextResponse.json(
          { success: false, error: 'Invalid likeType' },
          { status: 400 }
        );
      }

      const result = toggleForumLike({
        userAddress,
        targetId,
        targetType,
        likeType,
      });

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        action: result.action,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('Forum API POST error:', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
