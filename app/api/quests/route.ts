/**
 * Quest System API
 *
 * GET /api/quests - Get all quests with user progress
 * POST /api/quests - Start, complete, or claim a quest
 */

import { NextResponse } from 'next/server';
import {
  getActiveQuests,
  getQuestsWithProgress,
  getUrgentQuests,
  getQuestById,
  startQuest,
  completeQuest,
  claimQuestReward,
  getUserXP,
  getXPProgress,
} from '@/lib/db';
import { logger } from '@/lib/logger';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { route } from '@/lib/api/route';

/**
 * GET /api/quests
 * Query params:
 * - address: wallet address (required for user progress)
 * - type: filter by quest type (urgent, daily, weekly, one_time)
 * - urgentOnly: if true, only return urgent quests
 */
export const GET = route({ error: 'Failed to fetch quests' }, async (request) => {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  const questType = searchParams.get('type');
  const urgentOnly = searchParams.get('urgentOnly') === 'true';

  // If requesting urgent quests only
  if (urgentOnly) {
    const urgentQuests = getUrgentQuests();

    // If address provided, include user progress
    if (address) {
      const questsWithProgress = getQuestsWithProgress(address)
        .filter(q => q.quest_type === 'urgent');

      return NextResponse.json({
        success: true,
        quests: questsWithProgress,
        userXP: getUserXP(address),
      });
    }

    return NextResponse.json({
      success: true,
      quests: urgentQuests,
    });
  }

  // Get all quests
  if (address) {
    const questsWithProgress = getQuestsWithProgress(address);
    const userXP = getUserXP(address);
    const xpProgress = getXPProgress(userXP.total_xp);

    // Optionally filter by type
    const filteredQuests = questType
      ? questsWithProgress.filter(q => q.quest_type === questType)
      : questsWithProgress;

    return NextResponse.json({
      success: true,
      quests: filteredQuests,
      userXP: {
        ...userXP,
        ...xpProgress,
      },
    });
  }

  // No address - return just quest definitions
  const quests = getActiveQuests();
  const filteredQuests = questType
    ? quests.filter(q => q.quest_type === questType)
    : quests;

  return NextResponse.json({
    success: true,
    quests: filteredQuests,
  });
});

/**
 * POST /api/quests
 * Body:
 * - walletAddress: user's wallet address (required)
 * - questId: quest to interact with (required)
 * - action: 'start' | 'complete' | 'claim' (required)
 *
 */
export const POST = route({ error: 'Failed to process quest action' }, async (request) => {
  const body = await request.json();
  const { walletAddress, questId, action } = body;

  if (!walletAddress || !questId || !action) {
    return NextResponse.json(
      { success: false, error: 'Missing required fields: walletAddress, questId, action' },
      { status: 400 }
    );
  }

  // Validate wallet address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return NextResponse.json(
      { success: false, error: 'Invalid wallet address format' },
      { status: 400 }
    );
  }

  const walletAuth = await verifyWalletAccess(request, walletAddress);
  if (!walletAuth.valid) {
    return NextResponse.json(
      { success: false, error: walletAuth.error },
      { status: 401 }
    );
  }

  // Validate action
  if (!['start', 'complete', 'claim'].includes(action)) {
    return NextResponse.json(
      { success: false, error: 'Invalid action. Must be: start, complete, or claim' },
      { status: 400 }
    );
  }

  // Validate quest exists
  const quest = getQuestById(questId);
  if (!quest) {
    return NextResponse.json(
      { success: false, error: 'Quest not found' },
      { status: 404 }
    );
  }

  let result;
  switch (action) {
    case 'start':
      result = startQuest(walletAddress, questId);
      logger.info('Quest started', { walletAddress, questId });
      return NextResponse.json({
        success: true,
        message: 'Quest started',
        questProgress: result,
      });

    case 'complete':
      result = completeQuest(walletAddress, questId);
      logger.info('Quest completed', { walletAddress, questId });
      return NextResponse.json({
        success: true,
        message: 'Quest completed',
        questProgress: result,
      });

    case 'claim':
      const claimResult = claimQuestReward(walletAddress, questId);
      if (!claimResult.success) {
        return NextResponse.json(
          { success: false, error: claimResult.error },
          { status: 400 }
        );
      }

      const userXP = getUserXP(walletAddress);
      const xpProgress = getXPProgress(userXP.total_xp);

      logger.info('Quest reward claimed', {
        walletAddress,
        questId,
        xpClaimed: claimResult.xpClaimed
      });

      return NextResponse.json({
        success: true,
        message: `Claimed ${claimResult.xpClaimed} XP!`,
        xpClaimed: claimResult.xpClaimed,
        userXP: {
          ...userXP,
          ...xpProgress,
        },
      });

    default:
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      );
  }
});
