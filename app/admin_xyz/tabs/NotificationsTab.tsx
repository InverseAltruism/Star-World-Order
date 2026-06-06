'use client';

import React from 'react';
import type { Notification } from './types';

interface NotificationsTabProps {
  isGlobalNotification: boolean;
  setIsGlobalNotification: (value: boolean) => void;
  targetWallet: string;
  setTargetWallet: (value: string) => void;
  fetchUserNotifications: () => void;
  isLoadingNotifications: boolean;
  notificationType: string;
  setNotificationType: (value: string) => void;
  notificationIcon: string;
  setNotificationIcon: (value: string) => void;
  notificationTitle: string;
  setNotificationTitle: (value: string) => void;
  notificationMessage: string;
  setNotificationMessage: (value: string) => void;
  notificationLink: string;
  setNotificationLink: (value: string) => void;
  createNotification: () => void;
  userNotifications: Notification[];
  deleteNotification: (notificationId: number) => void;
  cleanupNotifications: () => void;
}

export default function NotificationsTab({
  isGlobalNotification,
  setIsGlobalNotification,
  targetWallet,
  setTargetWallet,
  fetchUserNotifications,
  isLoadingNotifications,
  notificationType,
  setNotificationType,
  notificationIcon,
  setNotificationIcon,
  notificationTitle,
  setNotificationTitle,
  notificationMessage,
  setNotificationMessage,
  notificationLink,
  setNotificationLink,
  createNotification,
  userNotifications,
  deleteNotification,
  cleanupNotifications,
}: NotificationsTabProps) {
  return (
    <div className="pixel-card p-6 mb-6">
      <h2 className="text-[#9966ff] text-sm tracking-wider mb-4">🔔 NOTIFICATION MANAGEMENT</h2>

      {/* Global Notification Toggle */}
      <div className="mb-4 bg-[#0a0a15] p-3 rounded-lg border-2 border-[#9966ff]">
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isGlobalNotification}
            onChange={(e) => {
              setIsGlobalNotification(e.target.checked);
              if (e.target.checked) {
                // Clear target wallet when enabling global mode
                setTargetWallet('');
              }
            }}
            className="w-4 h-4 mr-3"
          />
          <div>
            <span className="text-[#ffd700] text-xs font-bold">🌐 Send to All Users</span>
            <p className="text-gray-500 text-[10px] mt-1">
              Enable this to create a global notification visible to everyone
            </p>
          </div>
        </label>
      </div>

      {/* Target Wallet (disabled when global is enabled) */}
      {!isGlobalNotification && (
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
      )}

      {isGlobalNotification && (
        <div className="mb-4 bg-[#ffd700]/10 border border-[#ffd700] rounded-lg p-3">
          <p className="text-[#ffd700] text-xs">
            ⚠️ <strong>Global Mode Active</strong> - This notification will be visible to all users
          </p>
        </div>
      )}

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
          disabled={(!isGlobalNotification && !targetWallet) || !notificationTitle || !notificationMessage}
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
  );
}
