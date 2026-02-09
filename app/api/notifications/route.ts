import { NextRequest, NextResponse } from 'next/server';
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  createNotification,
  getNotificationSettings,
  updateNotificationSettings,
  NotificationType,
} from '@/lib/db';
import { verifyWalletAccess } from '@/lib/walletAuth';
import { verifyAdminAccess } from '@/lib/adminAuth';

/**
 * GET /api/notifications
 * 
 * Get notifications for a user or their settings
 * 
 * Query params:
 * - address: wallet address (required)
 * - unreadOnly: only return unread notifications (optional)
 * - limit: number of notifications to return (optional, default 50)
 * - settings: if 'true', returns notification settings instead of notifications
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const getSettings = searchParams.get('settings') === 'true';
    
    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Wallet address required' },
        { status: 400 }
      );
    }
    
    // Return notification settings if requested
    if (getSettings) {
      const settings = getNotificationSettings(address);
      return NextResponse.json({
        success: true,
        settings: settings || {
          quest_notifications: 1,
          achievement_notifications: 1,
          system_notifications: 1,
          social_notifications: 1,
          governance_notifications: 1,
        },
      });
    }
    
    // Get notifications
    const notifications = getNotifications(address, { unreadOnly, limit });
    const unreadCount = getUnreadNotificationCount(address);
    
    return NextResponse.json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notifications
 * 
 * Create a notification or update notification settings
 * 
 * Body for creating notification:
 * {
 *   walletAddress: string,
 *   type: 'quest' | 'achievement' | 'system' | 'social' | 'governance',
 *   title: string,
 *   message: string,
 *   link?: string,
 *   icon?: string
 * }
 * 
 * Body for updating settings:
 * {
 *   walletAddress: string,
 *   action: 'updateSettings',
 *   settings: {
 *     questNotifications?: boolean,
 *     achievementNotifications?: boolean,
 *     systemNotifications?: boolean,
 *     socialNotifications?: boolean,
 *     governanceNotifications?: boolean
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, action } = body;
    
    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address required' },
        { status: 400 }
      );
    }

    // Create notification is admin-only
    if (action !== 'updateSettings') {
      const adminAuth = await verifyAdminAccess(request);
      if (!adminAuth.valid) {
        return NextResponse.json(
          { success: false, error: adminAuth.error },
          { status: 401 }
        );
      }
    } else {
      const walletAuth = await verifyWalletAccess(request, walletAddress);
      if (!walletAuth.valid) {
        return NextResponse.json(
          { success: false, error: walletAuth.error },
          { status: 401 }
        );
      }
    }
    
    // Update notification settings
    if (action === 'updateSettings') {
      const { settings } = body;
      const updatedSettings = updateNotificationSettings(walletAddress, settings || {});
      return NextResponse.json({
        success: true,
        settings: updatedSettings,
      });
    }
    
    // Create notification
    const { type, title, message, link, icon } = body;
    
    if (!type || !title || !message) {
      return NextResponse.json(
        { success: false, error: 'Type, title, and message required' },
        { status: 400 }
      );
    }
    
    const validTypes: NotificationType[] = ['quest', 'achievement', 'system', 'social', 'governance'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid notification type' },
        { status: 400 }
      );
    }
    
    const notification = createNotification(walletAddress, {
      type,
      title,
      message,
      link,
      icon,
    });
    
    return NextResponse.json({
      success: true,
      notification,
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create notification' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/notifications
 * 
 * Mark notification(s) as read
 * 
 * Body:
 * {
 *   walletAddress: string,
 *   action: 'markRead' | 'markAllRead',
 *   notificationId?: number (required for markRead)
 * }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, action, notificationId } = body;
    
    if (!walletAddress || !action) {
      return NextResponse.json(
        { success: false, error: 'Wallet address and action required' },
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
    
    if (action === 'markRead') {
      if (!notificationId) {
        return NextResponse.json(
          { success: false, error: 'Notification ID required' },
          { status: 400 }
        );
      }
      const ownedNotifications = getNotifications(walletAddress, { limit: 500 });
      const isOwned = ownedNotifications.some((n) => n.id === Number(notificationId));
      if (!isOwned) {
        return NextResponse.json(
          { success: false, error: 'Notification not found' },
          { status: 404 }
        );
      }
      markNotificationRead(notificationId);
    } else if (action === 'markAllRead') {
      markAllNotificationsRead(walletAddress);
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      );
    }
    
    const unreadCount = getUnreadNotificationCount(walletAddress);
    
    return NextResponse.json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error('Error updating notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update notification' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notifications
 * 
 * Delete a notification
 * 
 * Query params:
 * - id: notification ID to delete
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const walletAddress = searchParams.get('walletAddress');
    
    if (!id || !walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Notification ID and walletAddress required' },
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

    const ownedNotifications = getNotifications(walletAddress, { limit: 500 });
    const isOwned = ownedNotifications.some((n) => n.id === Number(id));
    if (!isOwned) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      );
    }
    
    deleteNotification(parseInt(id, 10));
    
    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete notification' },
      { status: 500 }
    );
  }
}
