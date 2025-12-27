'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';

interface Notification {
  id: number;
  wallet_address: string;
  type: 'quest' | 'achievement' | 'system' | 'social' | 'governance';
  title: string;
  message: string;
  link: string | null;
  icon: string;
  is_read: number;
  created_at: string;
}

/**
 * Get type-specific styling
 */
function getTypeColor(type: Notification['type']): string {
  const colors = {
    quest: '#ffd700',
    achievement: '#ff6ec7',
    system: '#00ffff',
    social: '#9966ff',
    governance: '#44ff88',
  };
  return colors[type] || '#ffd700';
}

/**
 * Format relative time
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

/**
 * NotificationBell Component
 * 
 * Displays a bell icon with unread notification count.
 * Clicking opens a dropdown with recent notifications.
 */
export default function NotificationBell() {
  const { address, isConnected } = useAccount();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!address) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/notifications?address=${address}&limit=10`);
      const data = await response.json();
      
      if (data.success) {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [address]);
  
  // Initial fetch and polling
  useEffect(() => {
    if (isConnected && address) {
      fetchNotifications();
      
      // Poll every 30 seconds for new notifications
      const interval = setInterval(fetchNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [isConnected, address, fetchNotifications]);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Mark notification as read
  const markAsRead = async (notificationId: number) => {
    if (!address) return;
    
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          action: 'markRead',
          notificationId,
        }),
      });
      
      // Update local state
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: 1 } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };
  
  // Mark all as read
  const markAllAsRead = async () => {
    if (!address) return;
    
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          action: 'markAllRead',
        }),
      });
      
      // Update local state
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };
  
  // Handle notification click
  const handleNotificationClick = (notification: Notification) => {
    if (notification.is_read === 0) {
      markAsRead(notification.id);
    }
    if (notification.link) {
      setIsOpen(false);
    }
  };
  
  // Don't render if not connected
  if (!isConnected) {
    return null;
  }
  
  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-300 hover:text-[#ffd700] transition-colors"
        aria-label="Notifications"
      >
        <span className="text-xl">🔔</span>
        
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span 
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold text-white bg-[#ff4466] rounded-full px-1 animate-pulse"
            style={{ boxShadow: '0 0 8px #ff4466' }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      
      {/* Dropdown */}
      {isOpen && (
        <div 
          className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[70vh] overflow-hidden rounded-lg border-2 border-[#2a2a4e] bg-[#0d0d1a] shadow-xl z-50"
          style={{ boxShadow: '0 0 20px rgba(153, 102, 255, 0.3)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a4e] bg-[#1a1a2e]">
            <h3 className="text-[#ffd700] text-xs font-bold tracking-wider">
              🔔 NOTIFICATIONS
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[10px] text-[#9966ff] hover:text-[#ffd700] transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>
          
          {/* Notifications List */}
          <div className="max-h-[calc(70vh-100px)] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-2xl animate-spin">⭐</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4">
                <span className="text-3xl mb-2 opacity-50">🔔</span>
                <p className="text-gray-500 text-xs text-center">No notifications yet</p>
                <p className="text-gray-600 text-[10px] text-center mt-1">
                  You&apos;ll see updates here when something happens
                </p>
              </div>
            ) : (
              <div>
                {notifications.map((notification) => {
                  const color = getTypeColor(notification.type);
                  const isUnread = notification.is_read === 0;
                  
                  const content = (
                    <div
                      className={`flex items-start gap-3 px-4 py-3 border-b border-[#2a2a4e]/50 cursor-pointer transition-all hover:bg-[#1a1a2e] ${
                        isUnread ? 'bg-[#1a1a2e]/50' : ''
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      {/* Icon */}
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                        style={{ 
                          backgroundColor: `${color}20`,
                          border: `1px solid ${color}40`,
                        }}
                      >
                        {notification.icon}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className={`text-xs font-bold truncate ${isUnread ? 'text-white' : 'text-gray-300'}`}>
                            {notification.title}
                          </h4>
                          {isUnread && (
                            <span 
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: color }}
                            />
                          )}
                        </div>
                        <p className="text-gray-400 text-[10px] line-clamp-2 mt-0.5">
                          {notification.message}
                        </p>
                        <p className="text-gray-600 text-[9px] mt-1">
                          {formatRelativeTime(notification.created_at)}
                        </p>
                      </div>
                      
                      {/* Link indicator */}
                      {notification.link && (
                        <span className="text-gray-500 text-xs">→</span>
                      )}
                    </div>
                  );
                  
                  // Wrap in Link if there's a link
                  if (notification.link) {
                    return (
                      <Link 
                        key={notification.id} 
                        href={notification.link}
                        onClick={() => setIsOpen(false)}
                      >
                        {content}
                      </Link>
                    );
                  }
                  
                  return <div key={notification.id}>{content}</div>;
                })}
              </div>
            )}
          </div>
          
          {/* Footer - Link to Profile Messages/Notifications */}
          <div className="px-4 py-3 border-t border-[#2a2a4e] bg-[#1a1a2e]">
            <Link 
              href="/profile?tab=messages"
              onClick={() => setIsOpen(false)}
              className="block w-full text-center text-[10px] text-[#9966ff] hover:text-[#ffd700] transition-colors"
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
