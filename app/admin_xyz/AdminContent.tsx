'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import WalletConnect from '@/components/WalletConnect';
import { ADMIN_WALLET_ADDRESS } from '@/lib/config';
import type {
  HealthData,
  Notification,
  Raffle,
  RaffleStats,
  UserData,
  WinnerDetails,
  DatabaseStats,
} from './tabs/types';
import HealthTab from './tabs/HealthTab';
import NotificationsTab from './tabs/NotificationsTab';
import RafflesTab from './tabs/RafflesTab';
import UsersTab from './tabs/UsersTab';
import DatabaseTab from './tabs/DatabaseTab';

// Admin wallet address from config
const ADMIN_WALLET = ADMIN_WALLET_ADDRESS;

// Admin tab type
type AdminTab = 'health' | 'notifications' | 'users' | 'raffles' | 'database';

/**
 * Admin Content Component
 * 
 * Provides admin dashboard with:
 * - Site health monitoring
 * - Cache management
 * - Notification management & history
 * - User database viewer
 * - Raffle management
 * - Database cleanup tools
 */
export default function AdminContent() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  
  // Active tab state
  const [activeTab, setActiveTab] = useState<AdminTab>('health');
  
  // State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);
  const [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // Notification management state
  const [targetWallet, setTargetWallet] = useState('');
  const [isGlobalNotification, setIsGlobalNotification] = useState(false);
  const [notificationType, setNotificationType] = useState<string>('system');
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationLink, setNotificationLink] = useState('');
  const [notificationIcon, setNotificationIcon] = useState('📢');
  const [userNotifications, setUserNotifications] = useState<Notification[]>([]);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  
  // Notification history state
  const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
  const [notificationHistoryTotal, setNotificationHistoryTotal] = useState(0);
  const [isLoadingNotificationHistory, setIsLoadingNotificationHistory] = useState(false);
  const [editingNotification, setEditingNotification] = useState<Notification | null>(null);
  
  // User database state
  const [users, setUsers] = useState<UserData[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  
  // Database stats state
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [isLoadingDbStats, setIsLoadingDbStats] = useState(false);
  
  // Raffle management state
  const [raffles, setRaffles] = useState<Raffle[]>([]);
  const [drawnRaffles, setDrawnRaffles] = useState<Raffle[]>([]);
  const [isLoadingRaffles, setIsLoadingRaffles] = useState(false);
  const [raffleName, setRaffleName] = useState('');
  const [raffleDescription, setRaffleDescription] = useState('');
  const [rafflePrize, setRafflePrize] = useState('');
  const [rafflePrizeImage, setRafflePrizeImage] = useState('');
  const [raffleEndTime, setRaffleEndTime] = useState('');
  const [raffleDiscordBonus, setRaffleDiscordBonus] = useState(false);
  const [raffleRequireX, setRaffleRequireX] = useState(false);
  const [raffleRequireDiscord, setRaffleRequireDiscord] = useState(false);
  const [raffleTweetUrl, setRaffleTweetUrl] = useState('');
  const [raffleIsPublic, setRaffleIsPublic] = useState(false);
  const [selectedRaffleStats, setSelectedRaffleStats] = useState<{ [key: string]: RaffleStats }>({});
  const [showDrawnRaffles, setShowDrawnRaffles] = useState(false);
  
  // Winner details modal state
  const [selectedWinner, setSelectedWinner] = useState<WinnerDetails | null>(null);
  const [isLoadingWinnerDetails, setIsLoadingWinnerDetails] = useState(false);
  
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
      const signature = await signMessageAsync({
        account: address as `0x${string}`,
        message,
      });
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
    // For global notifications, we don't need a target wallet
    if (!isGlobalNotification && !targetWallet) {
      setActionResult({ success: false, message: 'Target wallet required (or enable "Send to All Users")' });
      return;
    }
    
    if (!notificationTitle || !notificationMessage) {
      setActionResult({ success: false, message: 'Title and message are required' });
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
          walletAddress: isGlobalNotification ? 'GLOBAL' : targetWallet,
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
        message: data.success 
          ? `Notification created ${isGlobalNotification ? 'for all users' : 'successfully'}!` 
          : data.error,
      });

      if (data.success) {
        // Clear form
        setNotificationTitle('');
        setNotificationMessage('');
        setNotificationLink('');
        // Refresh notifications list if viewing a specific user
        if (targetWallet && !isGlobalNotification) {
          await fetchUserNotifications();
        }
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
      // Refresh notification history after cleanup
      if (data.success) {
        await fetchNotificationHistory();
      }
    } catch (error) {
      setActionResult({ success: false, message: 'Failed to cleanup notifications' });
    }
  };

  /**
   * Fetch notification history (all notifications)
   */
  const fetchNotificationHistory = useCallback(async () => {
    if (!isAuthenticated) return;
    
    setIsLoadingNotificationHistory(true);
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;

      const response = await fetch('/api/admin?action=allNotifications&limit=100', {
        headers: { 'x-admin-auth': authHeader },
      });
      const data = await response.json();
      
      if (data.success) {
        setAllNotifications(data.notifications || []);
        setNotificationHistoryTotal(data.totalCount || 0);
      }
    } catch (error) {
      console.error('Failed to fetch notification history:', error);
    } finally {
      setIsLoadingNotificationHistory(false);
    }
  }, [isAuthenticated, getAuthHeader]);

  /**
   * Update an existing notification
   */
  const updateNotificationAction = async () => {
    if (!editingNotification) return;
    
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
          action: 'updateNotification',
          notificationId: editingNotification.id,
          title: editingNotification.title,
          message: editingNotification.message,
          type: editingNotification.type,
          icon: editingNotification.icon,
          link: editingNotification.link,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setActionResult({ success: true, message: 'Notification updated!' });
        setEditingNotification(null);
        await fetchNotificationHistory();
      } else {
        setActionResult({ success: false, message: data.error || 'Failed to update notification' });
      }
    } catch (error) {
      setActionResult({ success: false, message: 'Failed to update notification' });
    }
  };

  /**
   * Fetch all users with social connections
   */
  const fetchUsers = useCallback(async (search?: string) => {
    if (!isAuthenticated) return;
    
    setIsLoadingUsers(true);
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;

      const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
      const response = await fetch(`/api/admin?action=users&limit=100${searchParam}`, {
        headers: { 'x-admin-auth': authHeader },
      });
      const data = await response.json();
      
      if (data.success) {
        setUsers(data.users || []);
        setUserCount(data.totalCount || 0);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [isAuthenticated, getAuthHeader]);

  /**
   * Fetch database statistics
   */
  const fetchDbStats = useCallback(async () => {
    if (!isAuthenticated) return;
    
    setIsLoadingDbStats(true);
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;

      const response = await fetch('/api/admin?action=dbStats', {
        headers: { 'x-admin-auth': authHeader },
      });
      const data = await response.json();
      
      if (data.success) {
        setDbStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch database stats:', error);
    } finally {
      setIsLoadingDbStats(false);
    }
  }, [isAuthenticated, getAuthHeader]);

  /**
   * Fetch drawn raffles with winners
   */
  const fetchDrawnRaffles = useCallback(async () => {
    if (!isAuthenticated) return;
    
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;

      const response = await fetch('/api/admin?action=drawnRaffles&limit=20', {
        headers: { 'x-admin-auth': authHeader },
      });
      const data = await response.json();
      
      if (data.success) {
        setDrawnRaffles(data.raffles || []);
      }
    } catch (error) {
      console.error('Failed to fetch drawn raffles:', error);
    }
  }, [isAuthenticated, getAuthHeader]);

  /**
   * Fetch winner details for a raffle
   */
  const fetchWinnerDetails = async (raffle: Raffle) => {
    if (!raffle.winner_address) return;
    
    setIsLoadingWinnerDetails(true);
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;

      const response = await fetch(`/api/admin?action=winnerDetails&wallet=${raffle.winner_address}`, {
        headers: { 'x-admin-auth': authHeader },
      });
      const data = await response.json();
      
      if (data.success && data.winner) {
        setSelectedWinner({
          ...data.winner,
          raffle_name: raffle.name,
          raffle_prize: raffle.prize_description,
          raffle_date: raffle.winner_drawn_at,
        });
      } else {
        // Even if no profile exists, still show the wallet address
        setSelectedWinner({
          wallet_address: raffle.winner_address,
          display_name: null,
          bio: null,
          discord_username: null,
          discord_user_id: null,
          x_username: null,
          x_user_id: null,
          total_xp: 0,
          level: 1,
          created_at: '',
          raffle_name: raffle.name,
          raffle_prize: raffle.prize_description,
          raffle_date: raffle.winner_drawn_at,
        });
      }
    } catch (error) {
      console.error('Failed to fetch winner details:', error);
      setActionResult({ success: false, message: 'Failed to load winner details' });
    } finally {
      setIsLoadingWinnerDetails(false);
    }
  };

  /**
   * Cleanup database action
   */
  const runCleanupAction = async (action: string, params: Record<string, number> = {}) => {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) return;

      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-auth': authHeader,
        },
        body: JSON.stringify({ action, ...params }),
      });

      const data = await response.json();
      setActionResult({
        success: data.success,
        message: data.success ? data.message : data.error,
      });
      
      // Refresh stats after cleanup
      if (data.success) {
        await fetchDbStats();
      }
    } catch (error) {
      setActionResult({ success: false, message: 'Cleanup action failed' });
    }
  };

  /**
   * Fetch all raffles
   */
  const fetchRaffles = useCallback(async () => {
    setIsLoadingRaffles(true);
    try {
      const response = await fetch('/api/raffle?type=all');
      const data = await response.json();
      
      if (data.success) {
        setRaffles(data.raffles || []);
        
        // Fetch stats for each active raffle
        const statsPromises = (data.raffles || []).map(async (raffle: Raffle) => {
          const statsRes = await fetch(`/api/raffle?id=${raffle.id}`);
          const statsData = await statsRes.json();
          return { id: raffle.id, stats: statsData.stats };
        });
        
        const allStats = await Promise.all(statsPromises);
        const statsMap: { [key: string]: RaffleStats } = {};
        allStats.forEach(({ id, stats }) => {
          if (stats) statsMap[id] = stats;
        });
        setSelectedRaffleStats(statsMap);
      }
    } catch (error) {
      console.error('Failed to fetch raffles:', error);
    } finally {
      setIsLoadingRaffles(false);
    }
  }, []);

  /**
   * Create a new raffle
   */
  const createRaffle = async () => {
    if (!raffleName || !rafflePrize || !raffleEndTime) {
      setActionResult({ success: false, message: 'Name, prize, and end time are required' });
      return;
    }

    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) {
        setActionResult({ success: false, message: 'Admin authentication required' });
        return;
      }

      const response = await fetch('/api/raffle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-auth': authHeader,
        },
        body: JSON.stringify({
          action: 'create',
          walletAddress: address,
          name: raffleName,
          description: raffleDescription,
          prizeDescription: rafflePrize,
          prizeImageUrl: rafflePrizeImage || undefined,
          endTime: raffleEndTime,
          discordBonusEnabled: raffleDiscordBonus,
          requireX: raffleRequireX,
          requireDiscord: raffleRequireDiscord,
          tweetUrl: raffleTweetUrl || undefined,
          isPublic: raffleIsPublic,
        }),
      });

      const data = await response.json();
      setActionResult({
        success: data.success,
        message: data.success ? `Raffle "${raffleName}" created!` : data.error,
      });

      if (data.success) {
        // Clear form
        setRaffleName('');
        setRaffleDescription('');
        setRafflePrize('');
        setRafflePrizeImage('');
        setRaffleEndTime('');
        setRaffleDiscordBonus(false);
        setRaffleRequireX(false);
        setRaffleRequireDiscord(false);
        setRaffleTweetUrl('');
        setRaffleIsPublic(false);
        // Refresh raffles
        await fetchRaffles();
      }
    } catch (error) {
      setActionResult({ success: false, message: 'Failed to create raffle' });
    }
  };

  /**
   * Draw winner for a raffle
   */
  const drawRaffleWinner = async (raffleId: string) => {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) {
        setActionResult({ success: false, message: 'Admin authentication required' });
        return;
      }

      const response = await fetch('/api/raffle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-auth': authHeader,
        },
        body: JSON.stringify({
          action: 'draw',
          walletAddress: address,
          raffleId,
        }),
      });

      const data = await response.json();
      setActionResult({
        success: data.success,
        message: data.success 
          ? `Winner drawn: ${data.winner?.wallet_address?.slice(0, 6)}...${data.winner?.wallet_address?.slice(-4)}`
          : data.error,
      });

      if (data.success) {
        await fetchRaffles();
      }
    } catch (error) {
      setActionResult({ success: false, message: 'Failed to draw winner' });
    }
  };

  /**
   * Cancel a raffle
   */
  const cancelRaffleAction = async (raffleId: string) => {
    if (!confirm('Are you sure you want to cancel this raffle?')) return;

    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) {
        setActionResult({ success: false, message: 'Admin authentication required' });
        return;
      }

      const response = await fetch('/api/raffle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-auth': authHeader,
        },
        body: JSON.stringify({
          action: 'cancel',
          walletAddress: address,
          raffleId,
        }),
      });

      const data = await response.json();
      setActionResult({
        success: data.success,
        message: data.success ? 'Raffle cancelled' : data.error,
      });

      if (data.success) {
        await fetchRaffles();
      }
    } catch (error) {
      setActionResult({ success: false, message: 'Failed to cancel raffle' });
    }
  };

  /**
   * Export raffle entries as CSV (authenticated admin-only route)
   */
  const exportRaffleCSV = async (raffleId: string, raffleName: string) => {
    try {
      const authHeader = await getAuthHeader();
      if (!authHeader) {
        setActionResult({ success: false, message: 'Admin authentication required' });
        return;
      }

      const response = await fetch(`/api/raffle?id=${encodeURIComponent(raffleId)}&export=csv`, {
        headers: {
          'x-admin-auth': authHeader,
        },
      });

      if (!response.ok) {
        let error = 'Failed to export CSV';
        try {
          const errData = await response.json();
          error = errData.error || error;
        } catch {
          // Ignore JSON parsing failures and keep default message.
        }
        setActionResult({ success: false, message: error });
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeName = raffleName.replace(/[^a-z0-9]/gi, '_');
      link.href = url;
      link.download = `${safeName}_participants.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setActionResult({ success: true, message: 'CSV exported successfully' });
    } catch (error) {
      console.error('Failed to export raffle CSV:', error);
      setActionResult({ success: false, message: 'Failed to export CSV' });
    }
  };

  // Fetch raffles when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchRaffles();
      fetchDrawnRaffles();
    }
  }, [isAuthenticated, fetchRaffles, fetchDrawnRaffles]);

  // Fetch data based on active tab
  useEffect(() => {
    if (isAuthenticated) {
      if (activeTab === 'notifications') {
        fetchNotificationHistory();
      } else if (activeTab === 'users') {
        fetchUsers();
      } else if (activeTab === 'database') {
        fetchDbStats();
      }
    }
  }, [isAuthenticated, activeTab, fetchNotificationHistory, fetchUsers, fetchDbStats]);

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
          className={`fixed top-4 right-4 z-50 p-4 rounded-lg border-2 max-w-sm ${
            actionResult.success 
              ? 'bg-[#44ff88]/20 border-[#44ff88] text-[#44ff88]' 
              : 'bg-[#ff4466]/20 border-[#ff4466] text-[#ff4466]'
          }`}
        >
          <p className="text-xs">{actionResult.success ? '✓' : '✗'} {actionResult.message}</p>
        </div>
      )}

      {/* Winner Details Modal */}
      {selectedWinner && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="pixel-card p-6 max-w-lg w-full animate-slide-in-up">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-[#ffd700] text-sm tracking-wider">🏆 WINNER DETAILS</h3>
              <button
                onClick={() => setSelectedWinner(null)}
                className="text-gray-500 hover:text-white text-xl"
              >
                ×
              </button>
            </div>
            
            {isLoadingWinnerDetails ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4 animate-spin">⭐</div>
                <p className="text-gray-500 text-xs">Loading winner details...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Raffle Context */}
                {selectedWinner.raffle_name && (
                  <div className="bg-[#ffd700]/10 rounded-lg p-3 border border-[#ffd700]/30">
                    <p className="text-[#ffd700] text-xs font-bold">{selectedWinner.raffle_name}</p>
                    <p className="text-gray-400 text-[10px]">Prize: {selectedWinner.raffle_prize}</p>
                    {selectedWinner.raffle_date && (
                      <p className="text-gray-500 text-[10px]">
                        Won: {new Date(selectedWinner.raffle_date).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}

                {/* Full Wallet Address */}
                <div className="bg-[#1a1a2e] rounded-lg p-3">
                  <p className="text-gray-500 text-[10px] mb-1">WALLET ADDRESS</p>
                  <div className="flex items-center gap-2">
                    <p className="text-[#00ffff] text-xs font-mono break-all flex-1">
                      {selectedWinner.wallet_address}
                    </p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedWinner.wallet_address);
                        setActionResult({ success: true, message: 'Address copied!' });
                      }}
                      className="text-[#00ffff] hover:text-[#44ffff] text-xs"
                      title="Copy address"
                    >
                      📋
                    </button>
                  </div>
                </div>

                {/* Display Name & Profile */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#1a1a2e] rounded-lg p-3">
                    <p className="text-gray-500 text-[10px] mb-1">DISPLAY NAME</p>
                    <p className="text-white text-xs">
                      {selectedWinner.display_name || <span className="text-gray-600">Not set</span>}
                    </p>
                  </div>
                  <div className="bg-[#1a1a2e] rounded-lg p-3">
                    <p className="text-gray-500 text-[10px] mb-1">LEVEL</p>
                    <p className="text-[#ffd700] text-xs">
                      Level {selectedWinner.level} ({selectedWinner.total_xp} XP)
                    </p>
                  </div>
                </div>

                {/* Social Connections */}
                <div className="bg-[#1a1a2e] rounded-lg p-3">
                  <p className="text-gray-500 text-[10px] mb-2">SOCIAL CONNECTIONS</p>
                  <div className="space-y-2">
                    {/* X (Twitter) */}
                    <div className="flex items-center justify-between">
                      <span className="text-white text-xs">𝕏 X (Twitter)</span>
                      {selectedWinner.x_username ? (
                        <a
                          href={`https://x.com/${selectedWinner.x_username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#00ffff] text-xs hover:underline"
                        >
                          @{selectedWinner.x_username} ↗
                        </a>
                      ) : (
                        <span className="text-gray-600 text-xs">Not linked</span>
                      )}
                    </div>
                    {/* Discord */}
                    <div className="flex items-center justify-between">
                      <span className="text-white text-xs">💬 Discord</span>
                      {selectedWinner.discord_username ? (
                        <span className="text-[#7289da] text-xs">
                          {selectedWinner.discord_username}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs">Not linked</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bio */}
                {selectedWinner.bio && (
                  <div className="bg-[#1a1a2e] rounded-lg p-3">
                    <p className="text-gray-500 text-[10px] mb-1">BIO</p>
                    <p className="text-gray-300 text-xs">{selectedWinner.bio}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <a
                    href={`https://monadscan.com/address/${selectedWinner.wallet_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 pixel-btn text-xs text-center !py-2 !bg-[#9966ff] !border-[#bb99ff_#5533aa_#5533aa_#bb99ff]"
                  >
                    View on Explorer ↗
                  </a>
                  <button
                    onClick={() => setSelectedWinner(null)}
                    className="flex-1 pixel-btn text-xs !py-2 !bg-[#1a1a2e] !border-[#3a3a5e_#1a1a2e_#1a1a2e_#3a3a5e]"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 mb-6 justify-center">
        {[
          { id: 'health' as AdminTab, label: '🏥 Health', color: '#44ff88' },
          { id: 'notifications' as AdminTab, label: '🔔 Notifications', color: '#9966ff' },
          { id: 'users' as AdminTab, label: '👥 Users', color: '#00ffff' },
          { id: 'raffles' as AdminTab, label: '🎰 Raffles', color: '#ff6ec7' },
          { id: 'database' as AdminTab, label: '🗄️ Database', color: '#ffd700' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
              activeTab === tab.id
                ? ''
                : 'bg-[#1a1a2e] border-[#2a2a4e] text-gray-400 hover:border-gray-500'
            }`}
            style={activeTab === tab.id ? { 
              borderColor: tab.color, 
              color: tab.color, 
              backgroundColor: `${tab.color}20` 
            } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Health Status - only show when activeTab is 'health' */}
      {activeTab === 'health' && (
        <HealthTab
          healthData={healthData}
          isLoadingHealth={isLoadingHealth}
          fetchHealthData={fetchHealthData}
          clearCaches={clearCaches}
          formatTime={formatTime}
        />
      )}

      {/* Notification Management - only show when activeTab is 'notifications' */}
      {activeTab === 'notifications' && (
        <NotificationsTab
          isGlobalNotification={isGlobalNotification}
          setIsGlobalNotification={setIsGlobalNotification}
          targetWallet={targetWallet}
          setTargetWallet={setTargetWallet}
          fetchUserNotifications={fetchUserNotifications}
          isLoadingNotifications={isLoadingNotifications}
          notificationType={notificationType}
          setNotificationType={setNotificationType}
          notificationIcon={notificationIcon}
          setNotificationIcon={setNotificationIcon}
          notificationTitle={notificationTitle}
          setNotificationTitle={setNotificationTitle}
          notificationMessage={notificationMessage}
          setNotificationMessage={setNotificationMessage}
          notificationLink={notificationLink}
          setNotificationLink={setNotificationLink}
          createNotification={createNotification}
          userNotifications={userNotifications}
          deleteNotification={deleteNotification}
          cleanupNotifications={cleanupNotifications}
        />
      )}

      {/* Raffle Management - only show when activeTab is 'raffles' */}
      {activeTab === 'raffles' && (
        <RafflesTab
          fetchRaffles={fetchRaffles}
          isLoadingRaffles={isLoadingRaffles}
          raffleName={raffleName}
          setRaffleName={setRaffleName}
          raffleEndTime={raffleEndTime}
          setRaffleEndTime={setRaffleEndTime}
          rafflePrize={rafflePrize}
          setRafflePrize={setRafflePrize}
          raffleDescription={raffleDescription}
          setRaffleDescription={setRaffleDescription}
          rafflePrizeImage={rafflePrizeImage}
          setRafflePrizeImage={setRafflePrizeImage}
          raffleIsPublic={raffleIsPublic}
          setRaffleIsPublic={setRaffleIsPublic}
          raffleRequireX={raffleRequireX}
          setRaffleRequireX={setRaffleRequireX}
          raffleRequireDiscord={raffleRequireDiscord}
          setRaffleRequireDiscord={setRaffleRequireDiscord}
          raffleDiscordBonus={raffleDiscordBonus}
          setRaffleDiscordBonus={setRaffleDiscordBonus}
          raffleTweetUrl={raffleTweetUrl}
          setRaffleTweetUrl={setRaffleTweetUrl}
          createRaffle={createRaffle}
          drawnRaffles={drawnRaffles}
          fetchWinnerDetails={fetchWinnerDetails}
          setActionResult={setActionResult}
          raffles={raffles}
          selectedRaffleStats={selectedRaffleStats}
          drawRaffleWinner={drawRaffleWinner}
          cancelRaffleAction={cancelRaffleAction}
          exportRaffleCSV={exportRaffleCSV}
        />
      )}

      {/* Users Tab - only show when activeTab is 'users' */}
      {activeTab === 'users' && (
        <UsersTab
          fetchUsers={fetchUsers}
          isLoadingUsers={isLoadingUsers}
          userSearchQuery={userSearchQuery}
          setUserSearchQuery={setUserSearchQuery}
          userCount={userCount}
          users={users}
        />
      )}

      {/* Database Tab - only show when activeTab is 'database' */}
      {activeTab === 'database' && (
        <DatabaseTab
          fetchDbStats={fetchDbStats}
          isLoadingDbStats={isLoadingDbStats}
          dbStats={dbStats}
          runCleanupAction={runCleanupAction}
        />
      )}

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
            href="/raffle"
            className="bg-[#0a0a15] p-4 rounded-lg border border-[#2a2a4e] hover:border-[#ff6ec7] transition-colors text-center"
          >
            <div className="text-2xl mb-2">🎰</div>
            <p className="text-gray-400 text-xs">Raffle</p>
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
