/**
 * Admin API Route
 * 
 * Provides administrative functions for site management.
 * Access restricted to admin wallet address with signature verification.
 * 
 * Admin wallet: 0x1ceC3a47c47314DE00b5Ff059dB5f3035e566582
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyMessage } from 'viem';
import { clearAllBlockVisionCaches, getAllCacheStats } from '@/lib/blockvision';
import { clearTreasuryCache } from '@/app/api/treasury/route';
import { 
  getNotifications, 
  createNotification, 
  deleteNotification, 
  markAllNotificationsRead,
  NotificationType,
  cleanupOldNotifications,
} from '@/lib/db';
import { logger } from '@/lib/logger';

// Admin wallet address (case-insensitive comparison)
const ADMIN_WALLET = '0x1ceC3a47c47314DE00b5Ff059dB5f3035e566582'.toLowerCase();

// Nonce storage for replay attack prevention (in production, use Redis or DB)
const usedNonces = new Set<string>();
const NONCE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Verify that the request is from the admin wallet
 * Requires a signed message with timestamp to prevent replay attacks
 */
async function verifyAdminAccess(request: NextRequest): Promise<{ valid: boolean; error?: string }> {
  try {
    const authHeader = request.headers.get('x-admin-auth');
    if (!authHeader) {
      return { valid: false, error: 'Missing authentication header' };
    }

    // Parse auth header: "address:timestamp:signature"
    const [address, timestamp, signature] = authHeader.split(':');
    
    if (!address || !timestamp || !signature) {
      return { valid: false, error: 'Invalid authentication format' };
    }

    // Check if address matches admin wallet
    if (address.toLowerCase() !== ADMIN_WALLET) {
      logger.warn('Admin API: Unauthorized access attempt', { address });
      return { valid: false, error: 'Unauthorized wallet address' };
    }

    // Check timestamp freshness (within 5 minutes)
    const timestampNum = parseInt(timestamp, 10);
    const now = Date.now();
    if (isNaN(timestampNum) || Math.abs(now - timestampNum) > NONCE_EXPIRY_MS) {
      return { valid: false, error: 'Authentication expired' };
    }

    // Check for replay attack
    const nonce = `${address}:${timestamp}`;
    if (usedNonces.has(nonce)) {
      return { valid: false, error: 'Authentication already used' };
    }

    // Verify signature
    const message = `SWO Admin Access\nTimestamp: ${timestamp}`;
    const isValid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Mark nonce as used
    usedNonces.add(nonce);
    
    // Clean up old nonces periodically
    setTimeout(() => usedNonces.delete(nonce), NONCE_EXPIRY_MS);

    return { valid: true };
  } catch (error) {
    logger.error('Admin API: Authentication error', { error: String(error) });
    return { valid: false, error: 'Authentication failed' };
  }
}

/**
 * GET /api/admin
 * 
 * Get admin dashboard data (health status, cache stats, etc.)
 * Requires admin authentication
 */
export async function GET(request: NextRequest) {
  const auth = await verifyAdminAccess(request);
  if (!auth.valid) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Get overall health status
    if (!action || action === 'health') {
      const cacheStats = getAllCacheStats();
      
      return NextResponse.json({
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          environment: process.env.NEXT_PUBLIC_ENV_MODE || 'unknown',
          cacheStats,
          blockvisionApiConfigured: !!process.env.BLOCKVISION_API,
        },
      });
    }

    // Get notifications for a specific wallet
    if (action === 'notifications') {
      const walletAddress = searchParams.get('wallet');
      if (!walletAddress) {
        return NextResponse.json(
          { success: false, error: 'Wallet address required' },
          { status: 400 }
        );
      }

      const notifications = getNotifications(walletAddress, { limit: 100 });
      return NextResponse.json({
        success: true,
        notifications,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('Admin API GET error:', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin
 * 
 * Perform admin actions (clear cache, create notifications, etc.)
 * Requires admin authentication
 */
export async function POST(request: NextRequest) {
  const auth = await verifyAdminAccess(request);
  if (!auth.valid) {
    return NextResponse.json(
      { success: false, error: auth.error },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { action } = body;

    // Clear all BlockVision caches and Treasury cache
    if (action === 'clearCache') {
      const result = clearAllBlockVisionCaches();
      clearTreasuryCache(); // Also clear the Treasury API cache
      logger.info('Admin: Cleared all caches', result);
      return NextResponse.json({
        success: true,
        message: 'All caches cleared',
        data: result,
      });
    }

    // Create a notification for a user
    if (action === 'createNotification') {
      const { walletAddress, type, title, message, link, icon } = body;
      
      if (!walletAddress || !type || !title || !message) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields: walletAddress, type, title, message' },
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

      logger.info('Admin: Created notification', { walletAddress, type, title });
      return NextResponse.json({
        success: true,
        notification,
      });
    }

    // Delete a notification
    if (action === 'deleteNotification') {
      const { notificationId } = body;
      if (!notificationId) {
        return NextResponse.json(
          { success: false, error: 'Notification ID required' },
          { status: 400 }
        );
      }

      deleteNotification(notificationId);
      logger.info('Admin: Deleted notification', { notificationId });
      return NextResponse.json({
        success: true,
        message: 'Notification deleted',
      });
    }

    // Mark all notifications as read for a user
    if (action === 'markAllRead') {
      const { walletAddress } = body;
      if (!walletAddress) {
        return NextResponse.json(
          { success: false, error: 'Wallet address required' },
          { status: 400 }
        );
      }

      markAllNotificationsRead(walletAddress);
      logger.info('Admin: Marked all notifications read', { walletAddress });
      return NextResponse.json({
        success: true,
        message: 'All notifications marked as read',
      });
    }

    // Cleanup old notifications
    if (action === 'cleanupNotifications') {
      cleanupOldNotifications();
      logger.info('Admin: Cleaned up old notifications');
      return NextResponse.json({
        success: true,
        message: 'Old notifications cleaned up',
      });
    }

    // Broadcast notification to all Star holders (or specific wallets)
    if (action === 'broadcastNotification') {
      const { walletAddresses, type, title, message, link, icon } = body;
      
      if (!walletAddresses || !Array.isArray(walletAddresses) || walletAddresses.length === 0) {
        return NextResponse.json(
          { success: false, error: 'walletAddresses array required' },
          { status: 400 }
        );
      }

      if (!type || !title || !message) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields: type, title, message' },
          { status: 400 }
        );
      }

      const notifications = walletAddresses.map((wallet: string) => {
        return createNotification(wallet, {
          type,
          title,
          message,
          link,
          icon,
        });
      });

      logger.info('Admin: Broadcast notification', { 
        recipientCount: walletAddresses.length,
        type,
        title,
      });

      return NextResponse.json({
        success: true,
        message: `Notification sent to ${walletAddresses.length} wallets`,
        notifications,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('Admin API POST error:', { error: String(error) });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
