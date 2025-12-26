import { NextRequest, NextResponse } from 'next/server';
import { createNotification, NotificationType } from '@/lib/db';

/**
 * POST /api/notifications/test
 * 
 * Test endpoint for creating sample notifications.
 * Useful for testing notification UI and functionality.
 * 
 * Body:
 * {
 *   walletAddress: string,
 *   testType?: 'all' | 'quest' | 'achievement' | 'system' | 'social' | 'governance'
 * }
 * 
 * If testType is 'all', creates one notification of each type.
 * Otherwise creates a single notification of the specified type.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, testType = 'all' } = body;
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address required' },
        { status: 400 }
      );
    }

    const notifications: Array<{
      type: NotificationType;
      title: string;
      message: string;
      icon: string;
      link?: string;
    }> = [];

    // Define sample notifications for each type
    const sampleNotifications = {
      quest: {
        type: 'quest' as NotificationType,
        title: '🎯 New Quest Available!',
        message: 'Complete the "Welcome to SWO" quest to earn 100 XP!',
        icon: '🎯',
        link: '/profile',
      },
      achievement: {
        type: 'achievement' as NotificationType,
        title: '🏆 Achievement Unlocked!',
        message: 'You\'ve earned the "Star Forged" badge for holding a Star Skrumpey!',
        icon: '🏆',
        link: '/profile',
      },
      system: {
        type: 'system' as NotificationType,
        title: '📢 System Update',
        message: 'New features have been added to the Treasury page. Check it out!',
        icon: '📢',
        link: '/treasury',
      },
      social: {
        type: 'social' as NotificationType,
        title: '👋 New Member Joined',
        message: 'A new Star holder has joined the community. Welcome them in the Hangout!',
        icon: '👋',
        link: '/hangout',
      },
      governance: {
        type: 'governance' as NotificationType,
        title: '🗳️ New Proposal',
        message: 'Proposal #42 "Treasury Diversification" is now open for voting.',
        icon: '🗳️',
        link: '/dao',
      },
    };

    if (testType === 'all') {
      // Create one of each type
      Object.values(sampleNotifications).forEach(notification => {
        notifications.push(notification);
      });
    } else if (sampleNotifications[testType as keyof typeof sampleNotifications]) {
      notifications.push(sampleNotifications[testType as keyof typeof sampleNotifications]);
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid test type. Use: all, quest, achievement, system, social, or governance' },
        { status: 400 }
      );
    }

    // Create the notifications
    const createdNotifications = notifications.map(notification => {
      return createNotification(walletAddress, {
        type: notification.type,
        title: notification.title,
        message: notification.message,
        icon: notification.icon,
        link: notification.link,
      });
    });

    return NextResponse.json({
      success: true,
      message: `Created ${createdNotifications.length} test notification(s)`,
      notifications: createdNotifications,
    });
  } catch (error) {
    console.error('Error creating test notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create test notifications' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/notifications/test
 * 
 * Returns information about how to use the test endpoint.
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/notifications/test',
    method: 'POST',
    description: 'Create test notifications for development and testing',
    body: {
      walletAddress: 'string (required) - The wallet address to send notifications to',
      testType: 'string (optional) - Type of notification to create: all, quest, achievement, system, social, governance. Default: all',
    },
    example: {
      walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      testType: 'all',
    },
    note: 'This endpoint creates notifications with is_read = 0 (unread). Click on notifications to mark them as read.',
  });
}
