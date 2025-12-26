'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import WalletConnect from '@/components/WalletConnect';
import { ADMIN_WALLET_ADDRESS } from '@/lib/config';

// Admin wallet address from config
const ADMIN_WALLET = ADMIN_WALLET_ADDRESS;

interface CacheStats {
  nftCache: { entries: number; oldestEntry: number | null };
  activityCache: { entries: number; oldestEntry: number | null };
  transactionCache: { entries: number; oldestEntry: number | null };
  floorPriceCache: { entries: number; oldestEntry: number | null };
  totalEntries: number;
}

interface HealthData {
  status: string;
  timestamp: string;
  environment: string;
  cacheStats: CacheStats;
  blockvisionApiConfigured: boolean;
}

interface Notification {
  id: number;
  wallet_address: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  icon: string;
  is_read: number;
  created_at: string;
}

/**
 * Admin Content Component
 * 
 * Provides admin dashboard with:
 * - Site health monitoring
 * - Cache management
 * - Notification management
 */
export default function AdminContent() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  
  // State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);
  const [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // Notification management state
  const [targetWallet, setTargetWallet] = useState('');
  const [notificationType, setNotificationType] = useState<string>('system');
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationLink, setNotificationLink] = useState('');
  const [notificationIcon, setNotificationIcon] = useState('📢');
  const [userNotifications, setUserNotifications] = useState<Notification[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  
  // Check if connected wallet is admin
  const isAdminWallet = address?.toLowerCase() === ADMIN_WALLET;

  /**
   * Generate authentication header with signature
   */
  const getAuthHeader = useCallback(async (): Promise<string | null> => {
    if (!address || !signMessageAsync) return null;
    
    try {
      const timestamp = Date.now().toString();
      const message = `SWO Admin Access\nTimestamp: ${timestamp}`;
      const signature = await signMessageAsync({ message });
      return `${address}:${timestamp}:${signature}`;
    } catch (error) {
      console.error('Failed to sign message:', error);
      return null;
    }
  }, [address, signMessageAsync]);

  /**
   * Authenticate admin access
   */
  const authenticate = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) {
        setAuthError('Failed to sign authentication message');
        return;
      }

      // Test authentication with health check
      const response = await fetch('/api/admin?action=health', {
        headers: {
          'x-admin-auth': authHeader,
        },
      });

      const data = await response.json();
      
      if (data.success) {
        setIsAuthenticated(true);
        setHealthData(data.data);
      } else {
        setAuthError(data.error || 'Authentication failed');
      }
    } catch (error) {
      setAuthError('Failed to authenticate');
      console.error('Auth error:', error);
    } finally {
      setIsAuthenticating(false);
    }
  };

  /**
   * Fetch health data
   */
  const fetchHealthData = useCallback(async () => {
    if (!isAuthenticated) return;
    
    setIsLoadingHealth(true);
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;

      const response = await fetch('/api/admin?action=health', {
        headers: { 'x-admin-auth': authHeader },
      });
      const data = await response.json();
      
      if (data.success) {
        setHealthData(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch health data:', error);
    } finally {
      setIsLoadingHealth(false);
    }
  }, [isAuthenticated, getAuthHeader]);

  /**
   * Clear all caches
   */
  const clearCaches = async () => {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;

      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-auth': authHeader,
        },
        body: JSON.stringify({ action: 'clearCache' }),
      });

      const data = await response.json();
      setActionResult({
        success: data.success,
        message: data.success 
          ? `Caches cleared! NFT: ${data.data?.nftCacheCleared}, Activity: ${data.data?.activityCacheCleared}, Transaction: ${data.data?.transactionCacheCleared}, Floor: ${data.data?.floorPriceCacheCleared}`
          : data.error,
      });
      
      // Refresh health data
      if (data.success) {
        await fetchHealthData();
      }
    } catch (error) {
      setActionResult({ success: false, message: 'Failed to clear caches' });
    }
  };

  /**
   * Fetch notifications for a user
   */
  const fetchUserNotifications = async () => {
    if (!targetWallet) return;
    
    setIsLoadingNotifications(true);
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;

      const response = await fetch(`/api/admin?action=notifications&wallet=${targetWallet}`, {
        headers: { 'x-admin-auth': authHeader },
      });
      const data = await response.json();
      
      if (data.success) {
        setUserNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setIsLoadingNotifications(false);
    }
  };

  /**
   * Create a notification
   */
  const createNotification = async () => {
    if (!targetWallet || !notificationTitle || !notificationMessage) {
      setActionResult({ success: false, message: 'Fill in all required fields' });
      return;
    }

    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;

      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-auth': authHeader,
        },
        body: JSON.stringify({
          action: 'createNotification',
          walletAddress: targetWallet,
          type: notificationType,
          title: notificationTitle,
          message: notificationMessage,
          link: notificationLink || undefined,
          icon: notificationIcon,
        }),
      });

      const data = await response.json();
      setActionResult({
        success: data.success,
        message: data.success ? 'Notification created!' : data.error,
      });

      if (data.success) {
        // Clear form
        setNotificationTitle('');
        setNotificationMessage('');
        setNotificationLink('');
        // Refresh notifications list
        await fetchUserNotifications();
      }
    } catch (error) {
      setActionResult({ success: false, message: 'Failed to create notification' });
    }
  };

  /**
   * Delete a notification
   */
  const deleteNotification = async (notificationId: number) => {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;

      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-auth': authHeader,
        },
        body: JSON.stringify({
          action: 'deleteNotification',
          notificationId,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setUserNotifications(prev => prev.filter(n => n.id !== notificationId));
        setActionResult({ success: true, message: 'Notification deleted' });
      }
    } catch (error) {
      setActionResult({ success: false, message: 'Failed to delete notification' });
    }
  };

  /**
   * Cleanup old notifications
   */
  const cleanupNotifications = async () => {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;

      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-auth': authHeader,
        },
        body: JSON.stringify({ action: 'cleanupNotifications' }),
      });

      const data = await response.json();
      setActionResult({
        success: data.success,
        message: data.success ? 'Old notifications cleaned up!' : data.error,
      });
    } catch (error) {
      setActionResult({ success: false, message: 'Failed to cleanup notifications' });
    }
  };

  // Clear action result after 5 seconds
  useEffect(() => {
    if (actionResult) {
      const timer = setTimeout(() => setActionResult(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionResult]);

  // Format timestamp
  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ${diffMins % 60}m ago`;
  };

  // Not connected
  if (!isConnected) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <div className="pixel-card p-8 text-center max-w-md">
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-[#ff4466] text-lg tracking-wider mb-4">ADMIN ACCESS</h1>
          <p className="text-gray-400 text-xs mb-6">
            Connect admin wallet to access dashboard
          </p>
          <WalletConnect />
        </div>
      </div>
    );
  }

  // Not admin wallet
  if (!isAdminWallet) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <div className="pixel-card p-8 text-center max-w-md">
          <div className="text-4xl mb-4">⛔</div>
          <h1 className="text-[#ff4466] text-lg tracking-wider mb-4">ACCESS DENIED</h1>
          <p className="text-gray-400 text-xs mb-2">
            This wallet is not authorized for admin access.
          </p>
          <p className="text-gray-600 text-[10px] font-mono">
            Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
        </div>
      </div>
    );
  }

  // Not authenticated yet
  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <div className="pixel-card p-8 text-center max-w-md">
          <div className="text-4xl mb-4">🔑</div>
          <h1 className="text-[#ffd700] text-lg tracking-wider mb-4">ADMIN AUTHENTICATION</h1>
          <p className="text-gray-400 text-xs mb-6">
            Sign a message to verify your identity
          </p>
          
          {authError && (
            <div className="bg-[#ff4466]/20 border border-[#ff4466] rounded p-3 mb-4">
              <p className="text-[#ff4466] text-xs">{authError}</p>
            </div>
          )}
          
          <button
            onClick={authenticate}
            disabled={isAuthenticating}
            className="pixel-btn pixel-btn-gold text-xs w-full"
          >
            {isAuthenticating ? 'SIGNING...' : 'AUTHENTICATE'}
          </button>
          
          <p className="text-gray-600 text-[10px] mt-4 font-mono">
            Wallet: {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
        </div>
      </div>
    );
  }

  // Authenticated admin dashboard
  return (
    <>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="text-4xl mb-4">⚙️</div>
        <h1 className="text-[#ffd700] text-xl tracking-wider mb-2">ADMIN DASHBOARD</h1>
        <p className="text-gray-500 text-xs">
          Star World Order Control Center
        </p>
      </div>

      {/* Action Result Toast */}
      {actionResult && (
        <div 
          className={`fixed top-4 right-4 z-50 p-4 rounded-lg border-2 ${
            actionResult.success 
              ? 'bg-[#44ff88]/20 border-[#44ff88] text-[#44ff88]' 
              : 'bg-[#ff4466]/20 border-[#ff4466] text-[#ff4466]'
          }`}
        >
          <p className="text-xs">{actionResult.success ? '✓' : '✗'} {actionResult.message}</p>
        </div>
      )}

      {/* Health Status */}
      <div className="pixel-card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[#44ff88] text-sm tracking-wider">🏥 SYSTEM HEALTH</h2>
          <button
            onClick={fetchHealthData}
            disabled={isLoadingHealth}
            className="pixel-btn text-[10px] !px-3 !py-1"
          >
            {isLoadingHealth ? '...' : 'REFRESH'}
          </button>
        </div>
        
        {healthData && (
          <div className="space-y-4">
            {/* Status */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e]">
                <p className="text-[#44ff88] text-sm font-bold">✓ {healthData.status.toUpperCase()}</p>
                <p className="text-gray-500 text-[10px]">Status</p>
              </div>
              <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e]">
                <p className="text-[#9966ff] text-sm font-bold">{healthData.environment.toUpperCase()}</p>
                <p className="text-gray-500 text-[10px]">Environment</p>
              </div>
              <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e]">
                <p className={`text-sm font-bold ${healthData.blockvisionApiConfigured ? 'text-[#44ff88]' : 'text-[#ff4466]'}`}>
                  {healthData.blockvisionApiConfigured ? '✓ YES' : '✗ NO'}
                </p>
                <p className="text-gray-500 text-[10px]">BlockVision API</p>
              </div>
              <div className="bg-[#0a0a15] p-3 rounded-lg border border-[#2a2a4e]">
                <p className="text-[#ffd700] text-sm font-bold">{healthData.cacheStats.totalEntries}</p>
                <p className="text-gray-500 text-[10px]">Cache Entries</p>
              </div>
            </div>

            {/* Cache Details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#0a0a15] p-3 rounded-lg">
                <p className="text-white text-xs font-bold">{healthData.cacheStats.nftCache.entries}</p>
                <p className="text-gray-500 text-[10px]">NFT Cache</p>
                <p className="text-gray-600 text-[9px]">{formatTime(healthData.cacheStats.nftCache.oldestEntry)}</p>
              </div>
              <div className="bg-[#0a0a15] p-3 rounded-lg">
                <p className="text-white text-xs font-bold">{healthData.cacheStats.activityCache.entries}</p>
                <p className="text-gray-500 text-[10px]">Activity Cache</p>
                <p className="text-gray-600 text-[9px]">{formatTime(healthData.cacheStats.activityCache.oldestEntry)}</p>
              </div>
              <div className="bg-[#0a0a15] p-3 rounded-lg">
                <p className="text-white text-xs font-bold">{healthData.cacheStats.transactionCache.entries}</p>
                <p className="text-gray-500 text-[10px]">Transaction Cache</p>
                <p className="text-gray-600 text-[9px]">{formatTime(healthData.cacheStats.transactionCache.oldestEntry)}</p>
              </div>
              <div className="bg-[#0a0a15] p-3 rounded-lg">
                <p className="text-white text-xs font-bold">{healthData.cacheStats.floorPriceCache.entries}</p>
                <p className="text-gray-500 text-[10px]">Floor Price Cache</p>
                <p className="text-gray-600 text-[9px]">{formatTime(healthData.cacheStats.floorPriceCache.oldestEntry)}</p>
              </div>
            </div>

            {/* Cache Actions */}
            <div className="flex gap-3">
              <button
                onClick={clearCaches}
                className="pixel-btn text-xs bg-[#ff4466] border-[#ff6688_#aa2244_#aa2244_#ff6688]"
              >
                🗑️ CLEAR ALL CACHES
              </button>
            </div>
            
            <p className="text-gray-500 text-[10px]">
              ⚠️ Clearing caches will force fresh API calls. Use if Treasury shows stale/no data.
            </p>
          </div>
        )}
      </div>

      {/* Notification Management */}
      <div className="pixel-card p-6 mb-6">
        <h2 className="text-[#9966ff] text-sm tracking-wider mb-4">🔔 NOTIFICATION MANAGEMENT</h2>
        
        {/* Target Wallet */}
        <div className="mb-4">
          <label className="text-gray-400 text-xs block mb-2">Target Wallet Address</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={targetWallet}
              onChange={(e) => setTargetWallet(e.target.value)}
              placeholder="0x..."
              className="flex-1 bg-[#0a0a15] border-2 border-[#2a2a4e] rounded px-3 py-2 text-xs text-white focus:border-[#9966ff] outline-none"
            />
            <button
              onClick={fetchUserNotifications}
              disabled={!targetWallet || isLoadingNotifications}
              className="pixel-btn text-[10px] !px-3"
            >
              {isLoadingNotifications ? '...' : 'FETCH'}
            </button>
          </div>
        </div>

        {/* Create Notification Form */}
        <div className="bg-[#0a0a15] p-4 rounded-lg mb-4">
          <h3 className="text-[#ffd700] text-xs mb-3">Create Notification</h3>
          
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-gray-500 text-[10px] block mb-1">Type</label>
              <select
                value={notificationType}
                onChange={(e) => setNotificationType(e.target.value)}
                className="w-full bg-[#1a1a2e] border border-[#2a2a4e] rounded px-2 py-1.5 text-xs text-white"
              >
                <option value="system">System</option>
                <option value="quest">Quest</option>
                <option value="achievement">Achievement</option>
                <option value="social">Social</option>
                <option value="governance">Governance</option>
              </select>
            </div>
            <div>
              <label className="text-gray-500 text-[10px] block mb-1">Icon</label>
              <input
                type="text"
                value={notificationIcon}
                onChange={(e) => setNotificationIcon(e.target.value)}
                className="w-full bg-[#1a1a2e] border border-[#2a2a4e] rounded px-2 py-1.5 text-xs text-white"
              />
            </div>
          </div>
          
          <div className="mb-3">
            <label className="text-gray-500 text-[10px] block mb-1">Title</label>
            <input
              type="text"
              value={notificationTitle}
              onChange={(e) => setNotificationTitle(e.target.value)}
              placeholder="Notification title"
              className="w-full bg-[#1a1a2e] border border-[#2a2a4e] rounded px-2 py-1.5 text-xs text-white"
            />
          </div>
          
          <div className="mb-3">
            <label className="text-gray-500 text-[10px] block mb-1">Message</label>
            <textarea
              value={notificationMessage}
              onChange={(e) => setNotificationMessage(e.target.value)}
              placeholder="Notification message"
              rows={2}
              className="w-full bg-[#1a1a2e] border border-[#2a2a4e] rounded px-2 py-1.5 text-xs text-white resize-none"
            />
          </div>
          
          <div className="mb-3">
            <label className="text-gray-500 text-[10px] block mb-1">Link (optional)</label>
            <input
              type="text"
              value={notificationLink}
              onChange={(e) => setNotificationLink(e.target.value)}
              placeholder="/profile or https://..."
              className="w-full bg-[#1a1a2e] border border-[#2a2a4e] rounded px-2 py-1.5 text-xs text-white"
            />
          </div>
          
          <button
            onClick={createNotification}
            disabled={!targetWallet || !notificationTitle || !notificationMessage}
            className="pixel-btn pixel-btn-gold text-xs w-full"
          >
            📨 SEND NOTIFICATION
          </button>
        </div>

        {/* User's Notifications List */}
        {userNotifications.length > 0 && (
          <div className="bg-[#0a0a15] p-4 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[#ffd700] text-xs">User Notifications ({userNotifications.length})</h3>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {userNotifications.map((notification) => (
                <div 
                  key={notification.id}
                  className={`flex items-start gap-2 p-2 rounded border ${
                    notification.is_read ? 'border-[#2a2a4e] opacity-60' : 'border-[#ffd700]/30 bg-[#ffd700]/5'
                  }`}
                >
                  <span className="text-sm">{notification.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-[10px] font-bold truncate">{notification.title}</p>
                    <p className="text-gray-400 text-[9px] truncate">{notification.message}</p>
                    <p className="text-gray-600 text-[8px]">
                      {new Date(notification.created_at).toLocaleString()} • {notification.type}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteNotification(notification.id)}
                    className="text-[#ff4466] text-xs hover:text-[#ff6688]"
                  >
                    ✗
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cleanup Button */}
        <div className="mt-4 pt-4 border-t border-[#2a2a4e]">
          <button
            onClick={cleanupNotifications}
            className="pixel-btn text-[10px]"
          >
            🧹 CLEANUP OLD NOTIFICATIONS (30+ days)
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="pixel-card p-6">
        <h2 className="text-[#ffd700] text-sm tracking-wider mb-4">⚡ QUICK ACTIONS</h2>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <a
            href="/treasury"
            className="bg-[#0a0a15] p-4 rounded-lg border border-[#2a2a4e] hover:border-[#ffd700] transition-colors text-center"
          >
            <div className="text-2xl mb-2">💰</div>
            <p className="text-gray-400 text-xs">Treasury</p>
          </a>
          <a
            href="/members"
            className="bg-[#0a0a15] p-4 rounded-lg border border-[#2a2a4e] hover:border-[#ffd700] transition-colors text-center"
          >
            <div className="text-2xl mb-2">👥</div>
            <p className="text-gray-400 text-xs">Members</p>
          </a>
          <a
            href="/api/notifications/test"
            target="_blank"
            className="bg-[#0a0a15] p-4 rounded-lg border border-[#2a2a4e] hover:border-[#ffd700] transition-colors text-center"
          >
            <div className="text-2xl mb-2">🔔</div>
            <p className="text-gray-400 text-xs">Test Notifications</p>
          </a>
          <a
            href="https://monadscan.com/address/0xa209cfb0c8abdf5e3e3e7f4628214bdb597d55af"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#0a0a15] p-4 rounded-lg border border-[#2a2a4e] hover:border-[#ffd700] transition-colors text-center"
          >
            <div className="text-2xl mb-2">🔍</div>
            <p className="text-gray-400 text-xs">Explorer</p>
          </a>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center mt-8">
        <p className="text-gray-600 text-[10px]">
          Admin: {address?.slice(0, 6)}...{address?.slice(-4)} • 
          Last refresh: {healthData?.timestamp ? new Date(healthData.timestamp).toLocaleTimeString() : 'N/A'}
        </p>
      </div>
    </>
  );
}
